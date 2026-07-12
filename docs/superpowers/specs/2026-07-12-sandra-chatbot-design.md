# Sandra — Student AI Assistant: Design

**Date:** 2026-07-12
**Status:** Approved (brainstorming session with Ted)

## Goal

A student-facing AI assistant named **Sandra**, available on every page of the web app, that (1) tutors students on course concepts at NS level, (2) answers "how do I use EdLight" questions, and (3) persists every conversation so admins can read transcripts in the admin console.

## Decisions made

| Question | Decision |
|---|---|
| Scope | Study tutor + platform guide in one assistant |
| Placement | Floating chat bubble on every page (mounted in `Layout`) |
| Access | Signed-in students only; signed-out users see a sign-in prompt |
| Pedagogy | Guide, don't hand out answers to graded quiz/exam content |
| Grounding | RAG over course structure, quiz bank, and exam bank (Approach B) |
| Admin v1 | Browse conversations + read transcripts, read-only |
| Languages | French default; mirror Creole when the student writes Creole |
| Streaming | No — single response per turn, like existing AI endpoints |

**Known limitation (accepted):** there are no lesson transcripts (videos live on YouTube). The KB indexes lesson titles + learning objectives, unit structure, quiz questions/explanations, and exam questions/démarches/solutions. Sandra teaches from model knowledge guided by the curriculum, not by quoting videos.

## Architecture

Reuses the existing Vercel `/api` + `_lib` stack end to end: `requireAuth` (Firebase ID token), `rateLimit` (Firestore sliding window), `llm.ts` (provider-agnostic). New pieces: one endpoint, two `_lib` helpers, one KB build script, one widget, one admin page.

### Knowledge base (`sandraKb` collection)

- Built by `scripts/build_sandra_kb.mjs` (firebase-admin, `FIREBASE_SERVICE_ACCOUNT_JSON`, same pattern as existing scripts). Re-run manually after content changes.
- Sources → chunks:
  - **Courses:** one chunk per lesson (title, objectives, unit context, level) and one per unit summary.
  - **Quizzes:** one chunk per question (question, options, correct answer, explanation) — marked `type: quiz` so the prompt can treat it as guide-only material.
  - **Exams:** one chunk per question (statement, démarche, solution) — `type: exam`, same guide-only handling.
- Doc shape: `{ text, embedding (Firestore vector), courseId, level, subject, type: 'lesson'|'quiz'|'exam', sourceId, updatedAt }`.
- Retrieval: Firestore native vector search (`findNearest`, cosine) via the admin SDK. Vector index added to `firestore.indexes.json`.
- Embeddings: new `embed()` in `api/_lib/llm.ts` — Gemini `text-embedding-004` by default, provider-switchable via env like the chat client. The KB build script and the chat endpoint MUST use the same model.

### Chat endpoint (`api/chat.ts`, POST)

Request: `{ conversationId?, message, lang: 'fr'|'ht', page?: { path, courseId?, lessonId? } }`
Flow:
1. `requireAuth` → uid.
2. `rateLimit('chat')` — 30 messages/hour/user (add to `LIMITS`).
3. Validate: message non-empty, ≤ 2000 chars.
4. Load conversation (verify it belongs to uid) or create one.
5. `embed(message)` → `findNearest` top 6 chunks; when `page.courseId` is present, prefer same-course chunks (query filtered by courseId, fall back to global if < 3 hits).
6. Build system prompt: Sandra persona (warm, encouraging, French/Creole-mirroring, NS-level explanations), pedagogy rule (never state final answers for `quiz`/`exam` chunks — explain method instead), platform FAQ (static, maintained in `api/_lib/sandraPrompt.ts`), retrieved chunks, current-page context.
7. New `chatText()` in `llm.ts` (plain-text sibling of `chatJSON`) with system prompt + last 12 turns + new message.
8. Persist user + assistant messages in one doc update; bump `lastMessageAt`, `messageCount`.
9. Respond `{ reply, conversationId, remaining }`.

Errors: LLM failure → 502 with friendly message key (widget shows retry); rate-limited → 429 with reset time (widget shows "revenez dans X minutes").

### Conversation storage (`chatConversations` collection)

`{ uid, studentName, studentEmail, startedAt, lastMessageAt, messageCount, lang, firstPage, messages: [{ role: 'user'|'assistant', text, ts }] }`

- Messages as an in-doc array: one atomic update per turn, one read per transcript.
- Cap: 100 messages/conversation; at cap the endpoint returns `conversationFull: true` and the widget starts a fresh conversation (no carryover — v1 keeps it simple).
- Written only server-side (admin SDK). Client writes denied by rules.

### Security rules (`firestore.rules`)

- `chatConversations/{id}`: `allow read: if isAdmin() || resource.data.uid == request.auth.uid; allow write: if false;`
- `sandraKb/{id}`: `allow read, write: if false;` (admin SDK only).

## Student widget (`src/components/SandraWidget/`)

- Mounted once in `Layout`; floating pill button bottom-right (Limyè: coral accent, pill press-button, Plus Jakarta Sans), positioned above any mobile tab bar.
- Panel: header ("Sandra · Assistante EdLight" + new-conversation button), scrollable message list (chat bubbles, Sandra's with a small avatar glyph), input + send, "Sandra écrit…" indicator, error state with retry.
- Signed-out: panel shows sign-in prompt instead of input.
- Sends `{ path, courseId, lessonId }` from the current route with every message via `authedFetch('/api/chat', …)`.
- `conversationId` kept in `sessionStorage` (new browser session → fresh conversation).
- Language: sends the app's current i18n language; Sandra mirrors Creole input regardless.
- Footer notice (i18n): "Les conversations peuvent être relues par l'équipe EdLight pour améliorer Sandra."
- Panel code lazy-loaded on first open (dynamic import) so the launcher adds ~nothing to page weight.
- All strings via react-i18next.

## Admin page (`/admin/users/sandra`)

- New route in the Users group of the admin console; `AdminSandra.tsx` follows `AdminUsers` patterns (AdminLayout primitives, adminService-style Firestore reads with client SDK under the `isAdmin()` rule).
- List: student (name/email), started, last activity, message count, language; sorted by `lastMessageAt` desc; paginated (cursor, 25/page).
- Row click → transcript view rendered as chat bubbles (read-only). Back preserves list position.
- Requires a composite/simple index on `lastMessageAt` if Firestore asks for one.

## Testing

- Jest units (same style as `essayGrading.test.ts`): prompt builder (persona + chunks + page context assembly), KB chunking functions, conversation-cap logic, rate-limit config presence.
- `api/chat.ts` handler test with mocked `llm` + `firebaseAdmin` modules: auth-missing → 401, rate-limited → 429, happy path persists two messages and returns reply.
- Manual e2e via `vercel dev` (widget → endpoint → Firestore) before deploy; verify admin page renders transcripts.

## Out of scope (v1)

- Streaming responses; usage stats/topic analytics in admin; flagging/quality review; lesson-transcript ingestion; mobile (Expo) app widget; unauthenticated access.

## Rollout

1. `llm.ts` additions (`chatText`, `embed`) + KB script + vector index → build KB.
2. `api/chat.ts` + rules deploy.
3. Widget behind the existing deploy flow (no flag — signed-in only limits blast radius); admin page last.
4. Env needed in Vercel: existing LLM key(s); `GEMINI_API_KEY` if not already set (embeddings).
