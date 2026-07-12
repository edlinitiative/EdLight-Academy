# Sandra v2 Tool-Calling Implementation Plan (email deferred)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sandra can call server-side tools mid-conversation — read the student's progress, recommend specific mock exams, generate & save their real study plan — plus an ICS calendar download on /study-plan. Email delivery is DEFERRED (no Resend account).

**Architecture:** `chatWithTools()` tool loop in `api/_lib/llm.ts` (Gemini function-calling + openai-compatible `tools`). Tool schemas/executors in `api/_lib/sandraTools.ts`, all scoped to the authenticated uid via admin SDK. Plan generation core extracted from `api/generate-plan.ts` into `api/_lib/planGeneration.ts` and ported to `chatJSON` (fixes the silent-fallback bug: generate-plan still calls OpenAI directly with the dead keys). ICS built by a pure `src/utils/planIcs.ts`.

**Tech Stack:** Existing: Vercel functions, firebase-admin, Gemini (`LLM_PROVIDER=gemini`), react, jest. Nothing new.

**Spec:** `docs/superpowers/specs/2026-07-12-sandra-tools-design.md` — read first. Email tool is OUT.

## Global Constraints

- All tool executors receive `uid` from the endpoint — never from the model.
- Tool loop: max 3 rounds; at most 1 `save_study_plan` execution per request; tool errors return `{ error: string }` to the model (never throw through to the student).
- Study plans: docs under `users/{uid}/studyPlans/{planId}`; must be shape-compatible with `src/services/studyPlanService.ts` (`createStudyPlan` planData, `buildTasksFromExams` task shape, `active` plan semantics — read that file before writing any plan doc).
- Exam catalog: `public/exam_catalog_index.json` (494 entries: `exam_id`, `exam_title`, `level` ('9e'|'terminale'|'universite'), `subject`, `difficulty`, `topics`, `year`). Serverless functions must fetch it over HTTP from the deployment's own origin (`https://${req.headers.host}/exam_catalog_index.json`) — `public/` is not in the function bundle.
- Exam URLs for students: `/exams/{level}/{exam_id}` (level as in the catalog, 'universite' maps to route 'university' — check `ExamBrowser`/`StudyPlan.tsx:578` mapping and reuse it).
- Overwrite guard: if an active plan exists, `save_study_plan` without `confirmReplace: true` returns `{ existingPlan: { title, createdAt } }` and saves nothing.
- Conversation docs gain optional `toolCalls: [{ name, ok }]` on assistant messages (admin transcript shows what Sandra did). Keep rules unchanged (server-only writes).
- French user-facing strings; conventional commits.

## Parallel execution map

- **Wave 1 (parallel):** T1 chatWithTools, T2 planGeneration extract, T3 sandraTools, T4 ICS download, T5 prompt update.
- **Wave 2 (after T1, T3, T5):** T6 wire chat.ts, T7 integration verify + deploy.
- T3 unit-tests with `planGeneration` MOCKED (interface pinned below), so T2/T3 can run in parallel.

---

### Task 1: `chatWithTools()` in `api/_lib/llm.ts`

**Files:** Modify `api/_lib/llm.ts`; Test `src/utils/__tests__/llmTools.test.ts`.

**Produces (pinned):**
```ts
export interface ToolDef { name: string; description: string; parameters: object } // JSON Schema params
export interface ToolCallRecord { name: string; ok: boolean }
export interface ChatWithToolsParams {
  system: string;
  messages: Array<{ role: 'user'|'assistant'; content: string }>;
  tools: ToolDef[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>; // returns JSON-serializable result
  maxRounds?: number;      // default 3
  temperature?: number; maxTokens?: number; timeoutMs?: number; config?: LLMConfig | null;
}
export async function chatWithTools(params: ChatWithToolsParams): Promise<{ reply: string; toolCalls: ToolCallRecord[] }>
```

- [ ] Failing tests (mock fetch): gemini transport — round 1 returns `functionCall` parts → executeTool called with parsed args → round 2 request contains `functionResponse` parts → final text returned with toolCalls recorded; openai-compatible — same via `tool_calls` / role:'tool' messages; loop stops at maxRounds with whatever text exists (or a safe French fallback string); executor throwing → tool result `{ error }` passed to model, `ok: false` recorded, loop continues.
- [ ] Implement both transports mirroring `chatText`'s style (gemini: `tools: [{ functionDeclarations }]`; openai: `tools: [{ type: 'function', function }]`).
- [ ] `npx jest llmTools` and existing `llmChat`/`llm.test` PASS. Commit `feat(api): chatWithTools function-calling loop`.

### Task 2: Extract `api/_lib/planGeneration.ts` (and fix generate-plan's dead-key bug)

**Files:** Create `api/_lib/planGeneration.ts`; Modify `api/generate-plan.ts` (thin wrapper); Test `src/utils/__tests__/planGeneration.test.ts`.

**Produces (pinned):**
```ts
export interface PlanRequest { track: string; subjects: string[]; performance: Record<string, {avgScore?: number; pct?: number; attempts?: number}>; examCount: number; dailyMinutes: number; weeks: number }
export interface GeneratedPlan { title: string; description: string; weeklyGoals: number; dailyTargetMinutes: number; tips: string[]; schedule: Array<Record<string, unknown>> }
export function buildFallbackPlan(reqData: PlanRequest): GeneratedPlan
export async function generatePlanCore(reqData: PlanRequest): Promise<{ plan: GeneratedPlan; source: 'ai'|'fallback' }>
```

- [ ] Move the prompt-building + fallback logic out of `generate-plan.ts` VERBATIM where possible, but replace the direct OpenAI fetch with `chatJSON()` from `./llm` (provider-agnostic — this makes /study-plan generation actually work again, it currently always falls back because it reads the dead OPENAI_API_KEY directly).
- [ ] `generate-plan.ts` keeps its HTTP contract exactly (auth, rate limit, request/response shapes, `source` field) but delegates to `generatePlanCore`.
- [ ] Tests: fallback when no provider configured; prompt includes weak/strong subject lines; response normalized to GeneratedPlan shape (mock chatJSON). `npx jest planGeneration` PASS. Commit `refactor(api): shared planGeneration core on llm client (fixes dead-key fallback)`.

### Task 3: `api/_lib/sandraTools.ts` — schemas + executors

**Files:** Create `api/_lib/sandraTools.ts`; Test `src/utils/__tests__/sandraTools.test.ts`.

**Consumes:** `ToolDef` (T1, pinned above), `generatePlanCore`/`GeneratedPlan` (T2, pinned above — MOCK in tests), `getDb` from `_lib/firebaseAdmin`, and `src/services/studyPlanService.ts` READ as reference for plan-doc shape (mirror `buildTasksFromExams`/`computeSRS` initial-task semantics in a server-side pure helper here; parity test against a small fixture).

**Produces (pinned):**
```ts
export const SANDRA_TOOL_DEFS: ToolDef[] // get_student_progress, recommend_exams, save_study_plan
export function createToolExecutor(ctx: { uid: string; origin: string }): (name: string, args: Record<string, unknown>) => Promise<unknown>
```

Executor behavior:
- `get_student_progress()` → reads `users/{uid}/examResults` (admin SDK), aggregates `{ perSubject: [{ subject, attempts, avgPct }], totalAttempts, recent: [{ examId, subject, pct, when }] }` (top 5 recent). Empty → `{ perSubject: [], note: 'aucun examen complété' }`.
- `recommend_exams({ level, subject?, count? })` → fetch `${origin}/exam_catalog_index.json`, filter by level (+subject fuzzy match), exclude exam_ids present in the student's examResults, sort by difficulty asc, take count (default 3, max 5) → `[{ examId, title, subject, level, year, url }]` with url `/exams/{routeLevel}/{examId}` ('universite'→'university').
- `save_study_plan({ subjects, weeks, dailyMinutes, confirmReplace? })` → if an `active` plan exists and !confirmReplace → `{ existingPlan: { title, createdAt } }` (no write). Else: progress → `performance`, `generatePlanCore(...)`, select exams from catalog per schedule subjects, build tasks (server mirror of buildTasksFromExams), write plan doc (admin SDK) marking it active and deactivating the previous one exactly as `createStudyPlan` does, → `{ saved: true, title, taskCount, url: '/study-plan' }`.

- [ ] Failing tests for each behavior incl. uid scoping (executor only ever touches `users/{ctx.uid}/…`), overwrite guard, catalog filtering, and the task-shape parity fixture.
- [ ] Implement. `npx jest sandraTools` PASS. Commit `feat(api): Sandra tool schemas + executors`.

### Task 4: ICS download on /study-plan

**Files:** Create `src/utils/planIcs.ts`; Modify `src/pages/StudyPlan.tsx` (download button in the topbar next to Régénérer); Test `src/utils/__tests__/planIcs.test.ts`.

**Produces:** `buildPlanIcs(plan: { title: string; tasks: Array<{ examTitle?: string; subject?: string; scheduledFor?: string|number }> , dailyTargetMinutes?: number }): string` — valid VCALENDAR: one VEVENT per task that has a schedule date (DTSTART as VALUE=DATE for all-day, SUMMARY `EdLight · {subject}: {examTitle}`, DESCRIPTION with /study-plan URL, UID stable per task). Read `studyPlanService.ts`/`StudyPlan.tsx` first for the real task fields (SRS `nextReview`/`scheduledFor` naming — use what exists).

- [ ] Failing tests: header/footer lines, CRLF line endings, one VEVENT per dated task, dates formatted `YYYYMMDD`, stable UIDs, skips undated tasks.
- [ ] Implement + button (`Download` lucide icon, label 'Calendrier (.ics)' / Creole 'Kalandriye (.ics)' following the page's isCreole pattern): builds Blob, `URL.createObjectURL`, click-to-download `plan-etude-edlight.ics`. Hidden when the plan has no dated tasks.
- [ ] `npx jest planIcs` PASS; `npm run build` compiles. Commit `feat(web): ICS calendar download for study plans`.

### Task 5: Prompt teaches the tools

**Files:** Modify `api/_lib/sandraPrompt.ts`; Test: extend `src/utils/__tests__/sandraPrompt.test.ts`.

- [ ] Add a `TOOLS_GUIDE` section (always included): use `get_student_progress` before advising on revision priorities or building a plan; use `recommend_exams` when the student wants practice (present results as markdown links); use `save_study_plan` ONLY after conversationally gathering subjects, weeks, and daily minutes — ask first, never assume; if the tool reports an existing plan, ask the student before calling again with `confirmReplace`; after saving, give the [/study-plan](/study-plan) link. Never invent tool results.
- [ ] Tests: prompt mentions each tool name and the ask-before-replace rule. `npx jest sandraPrompt` PASS. Commit `feat(api): Sandra prompt tool guidance`.

### Task 6: Wire into `api/chat.ts` (after T1, T3, T5)

**Files:** Modify `api/chat.ts`; extend `src/utils/__tests__/chatApi.test.ts`.

- [ ] Replace the `chatText` call with `chatWithTools({ system, messages, tools: SANDRA_TOOL_DEFS, executeTool: createToolExecutor({ uid, origin: `https://${req.headers.host}` }), maxTokens: 1800, config: resolveLLMConfig() })`.
- [ ] Persist `toolCalls` on the assistant message when non-empty (extend the message object; rules unchanged).
- [ ] Tests: happy path with a mocked tool round persists toolCalls metadata; zero-tool conversations behave exactly as before (regression). `npx jest chatApi` PASS. Commit `feat(api): Sandra chat endpoint runs the tool loop`.

### Task 7: Integration verify + deploy

- [ ] `npx jest` all green; `npx tsc --noEmit` no new errors; `npm run build` compiles.
- [ ] Push (Vercel auto-deploys). Live e2e in Chrome: (a) "Recommande-moi des examens de chimie niveau terminale" → reply contains catalog exam links; (b) full plan conversation → Sandra asks for subjects/weeks/minutes → confirms → /study-plan shows the saved plan; (c) overwrite guard: ask for another plan → she asks before replacing; (d) ICS button downloads a file that starts `BEGIN:VCALENDAR`; (e) /admin/users/sandra transcript shows toolCalls.
- [ ] Report results. Do NOT touch email anything.

## Self-review notes

- Spec coverage minus deferred email: loop (T1), plan core + dead-key fix (T2), three tools + guards + uid scoping (T3), ICS download (T4), prompt (T5), wiring + toolCalls metadata (T6), e2e (T7). ✓
- Pinned interfaces consistent across T1/T2/T3/T6. ✓  No TBDs. ✓
