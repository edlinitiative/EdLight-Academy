# Sandra v2 — Tool-Calling (Plans, Exams, Progress, Email/ICS): Design

**Date:** 2026-07-12
**Status:** Draft — pending Ted's review
**Builds on:** `2026-07-12-sandra-chatbot-design.md` (Sandra v1, live in production)

## Goal

Sandra stops being advice-only: mid-conversation she can (1) generate and SAVE the student's real study plan, (2) recommend specific mock exams from the live catalog, (3) read the student's own progress to personalize advice, and (4) on request, email the plan with a calendar (.ics) attachment.

## Decisions made

| Question | Decision |
|---|---|
| Plan output | Saved as THE student's plan (same one /study-plan shows); Sandra confirms before overwriting an existing plan |
| Tool set | Three tools: generate/save plan, recommend exams, look up progress |
| Delivery | Email with .ics attachment via Resend, sent only when the student asks; plus an ICS download button on /study-plan (works without email) |
| Google Calendar API | Rejected for v2 — OAuth scopes/consent too heavy; ICS covers the need |

## Architecture

### Tool loop in `api/chat.ts`

`chatText()` grows a tool-calling sibling: `chatWithTools({ system, messages, tools, onToolCall, maxRounds: 3 })` in `api/_lib/llm.ts`, using Gemini function-calling (the pinned production provider; openai-compatible transport implements the same loop with `tools`/`tool_calls`). Each round: model returns either text (done) or tool calls → execute server-side → append results → continue. Hard cap 3 rounds; on tool failure the tool returns an error string and Sandra explains gracefully.

### The tools (all server-side, all scoped to the authenticated uid)

1. **`get_student_progress()`** — reads the student's exam results/attempt aggregates (reuse `examResults`/`progressTracking` server equivalents via admin SDK) → `{ perSubject: { subject, attempts, avgScore }, recentExams: [...] }`. Read-only.
2. **`recommend_exams({ level, subject?, count? })`** — reads the exam catalog (the same `exam_catalog_index.json` the site serves) filtered by level/subject, cross-referenced with progress (skip recently-completed) → list of `{ examId, title, subject, level, url }`. Sandra presents them as markdown links. Read-only.
3. **`save_study_plan({ subjects, weeks, dailyMinutes })`** — calls the existing plan-generation logic (extract the LLM-prompt core of `api/generate-plan.ts` into `api/_lib/planGeneration.ts` so both endpoints share it), maps schedule entries to exam IDs like the /study-plan client does, and persists to the student's plan document (same storage `studyPlanService` reads). Returns a summary + `/study-plan` link. **Overwrite guard:** if a plan exists, the tool returns `{ existingPlan: {title, createdAt} }` WITHOUT saving; Sandra must ask the student to confirm, then call again with `confirmReplace: true`.
4. **`email_study_plan()`** — only valid after a plan exists. Renders a French/Creole plan email (plain HTML, EdLight branding) with a generated `.ics` attachment (one VEVENT per schedule entry, Port-au-Prince timezone) and sends to the account email via Resend. Never sends without the student asking in chat.

### Email infrastructure (new)

- Provider: Resend (`RESEND_API_KEY` env; from `sandra@edlight.org` or similar). **Requires Ted:** create the Resend account and verify edlight.org DNS before this ships; the tool returns "l'envoi d'email n'est pas encore configuré" until the key exists.
- `api/_lib/planEmail.ts`: pure builders `buildPlanEmailHtml(plan, lang)` and `buildPlanIcs(plan)` (unit-tested), plus a thin `sendPlanEmail()` wrapper.
- Rate limit: `'email-plan': { max: 3, windowSec: 86400 }` — at most 3 plan emails/day/student.

### ICS download on /study-plan

Independent of email: a "Télécharger le calendrier (.ics)" button on the /study-plan page generates the file client-side from the loaded plan (share `buildPlanIcs` logic — it's pure; put it in `src/utils/planIcs.ts` and have `api/_lib/planEmail.ts` mirror it, or a small shared module if the api/src import boundary allows).

### Prompt changes (`sandraPrompt.ts`)

New tools section: when to use each tool (progress before advice when the student asks "how am I doing" or wants a plan; recommend_exams when they want practice; save_study_plan only after gathering subjects/weeks/dailyMinutes conversationally — ask, don't assume; email only on explicit request). Keep the guide-don't-answer pedagogy untouched.

### Safety & limits

- All tools run under the caller's uid — no cross-student access by construction.
- Tool loop capped at 3 rounds, 1 plan save per request, existing `'chat'` rate limit still applies on top.
- `save_study_plan` and `email_study_plan` are the only writes; both idempotent-ish (plan overwrite guarded; email rate-limited).
- Conversation doc records tool calls as lightweight system entries (`{ role: 'assistant', text, toolCalls: [{name, ok}] }` metadata field) so the admin transcript shows what Sandra actually did.

## Testing

- Unit: tool-loop mechanics in `llm.ts` (mock fetch: tool-call round → text round; cap at 3), each tool's happy path + uid-scoping + overwrite guard, ICS builder (valid VCALENDAR, correct dates), email HTML builder.
- Handler: chat request that triggers a mocked tool → response includes tool result; email tool without RESEND_API_KEY → graceful message.
- Manual e2e: full "make me a plan" conversation in production-like env; confirm /study-plan shows the saved plan; ICS imports into Google Calendar.

## Out of scope

Google Calendar API insertion; email for anything other than the study plan; scheduled/recurring emails (reminders stay in the existing push system); admin visibility beyond the toolCalls metadata.

## Rollout order

1. Tool loop + `get_student_progress` + `recommend_exams` (read-only — safe to ship alone).
2. `save_study_plan` with overwrite guard (+ shared `planGeneration.ts` refactor).
3. ICS download button on /study-plan (no dependencies on 4).
4. Resend setup (Ted: account + DNS) → `email_study_plan`.
