# Sandra Student AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Student-facing AI chat assistant ("Sandra") on every page, RAG-grounded in EdLight course/quiz/exam content, with conversations persisted to Firestore and a read-only admin transcript browser.

**Architecture:** New `api/chat.ts` Vercel function reusing `requireAuth` + `rateLimit` + `llm.ts` (extended with `chatText` and `embed`). Knowledge base = `sandraKb` Firestore collection with vector embeddings, built by a script, queried with Firestore `findNearest`. Conversations written server-side only to `chatConversations`. Frontend: lazy `SandraWidget` in `Layout`; admin: `AdminSandra` page in the Users group.

**Tech Stack:** Vercel functions (TS), firebase-admin (Firestore vector search), Gemini `text-embedding-004` embeddings, React + react-i18next, Limyè design system, jest.

**Spec:** `docs/superpowers/specs/2026-07-12-sandra-chatbot-design.md` — read it before starting any task.

## Global Constraints

- French UI copy by default; every student-visible string in `SandraWidget` goes through react-i18next (`src/utils/i18n.ts`). Admin pages are French-hardcoded like existing admin pages.
- Embedding model everywhere: `text-embedding-004`, dimension 768, overridable via env `LLM_EMBED_MODEL` — the KB script and `embed()` MUST read the same env/default.
- Rate limit for chat: 30 messages / 3600 s per user, endpoint key `'chat'`.
- Conversation doc cap: 100 messages.
- Retrieval: top 6 chunks, cosine distance; prefer same-course when `page.courseId` present (fallback to unfiltered when < 3 hits).
- Chat history sent to LLM: last 12 messages.
- Message length limit: 2000 chars.
- No client writes to `chatConversations` or `sandraKb` (Firestore rules deny; API uses admin SDK).
- Commit after each task with a conventional message (`feat(api): …`, `feat(web): …`).

## Parallel execution map

- **Wave 1 (independent, run in parallel):** Task 1 (llm additions), Task 2 (sandraPrompt), Task 3 (KB script + index), Task 4 (SandraWidget), Task 5 (AdminSandra).
- **Wave 2 (after 1+2):** Task 6 (api/chat.ts + rules + rateLimit entry), Task 7 (integration verify).
- File-ownership per task is disjoint; do not touch files owned by another task.

---

### Task 1: `chatText()` and `embed()` in `api/_lib/llm.ts`

**Files:**
- Modify: `api/_lib/llm.ts` (append after `chatJSON`)
- Test: `src/utils/__tests__/llmChat.test.ts` (new file; import style copied from `src/utils/__tests__/llm.test.ts`)

**Interfaces:**
- Consumes: existing `resolveLLMConfig`, `LLMConfig`, `LLMError`, `fetchWithTimeout` (module-private — reuse in-file).
- Produces:
  - `chatText(params: ChatTextParams): Promise<string>` where `ChatTextParams = { system: string; messages: Array<{ role: 'user'|'assistant'; content: string }>; temperature?: number; maxTokens?: number; timeoutMs?: number; config?: LLMConfig | null }`. Returns the assistant reply as plain text (trimmed, non-empty) or throws `LLMError`.
  - `embed(texts: string[], env?: Record<string, string|undefined>): Promise<number[][]>` — Gemini `text-embedding-004` (override with `LLM_EMBED_MODEL`), key from `GEMINI_API_KEY`/`LLM_API_KEY`; batches of ≤100 via `batchEmbedContents`; throws `LLMError` when no key. Exports `const EMBED_DIM = 768`.

- [ ] **Step 1: Write failing tests** — in `llmChat.test.ts`: (a) `chatText` builds an openai-compatible payload with system + interleaved messages and returns `choices[0].message.content` (mock `global.fetch`); (b) `chatText` gemini transport maps assistant→`model` role in `contents`; (c) `chatText` throws `LLMError` on empty reply; (d) `embed` throws `LLMError` when no Gemini key; (e) `embed` posts to `models/text-embedding-004:batchEmbedContents` and returns `embeddings[].values` (mock fetch).
- [ ] **Step 2: Run** `npx jest llmChat -t ''` — expect FAIL (exports missing).
- [ ] **Step 3: Implement.** `chatText`: mirror `chatJSON` transport code but messages array instead of single user turn, no `response_format`/`responseMimeType`, default `temperature 0.4`, `maxTokens 900`, `timeoutMs 30000`; gemini path: `contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))`, keep `thinkingConfig: { thinkingBudget: 0 }`. `embed`: `const model = firstNonEmpty(env.LLM_EMBED_MODEL, 'text-embedding-004')`; POST `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=…` with `{ requests: texts.map(t => ({ model: `models/${model}`, content: { parts: [{ text: t }] } })) }`.
- [ ] **Step 4: Run** `npx jest llmChat` — expect PASS; also `npx jest llm.test` still PASS.
- [ ] **Step 5: Commit** `feat(api): chatText + embed helpers in llm lib`

### Task 2: Sandra prompt builder (`api/_lib/sandraPrompt.ts`)

**Files:**
- Create: `api/_lib/sandraPrompt.ts`
- Test: `src/utils/__tests__/sandraPrompt.test.ts`

**Interfaces:**
- Produces:
  - `type KbChunk = { text: string; courseId: string; level: string; subject: string; type: 'lesson'|'quiz'|'exam'; sourceId: string }`
  - `type PageContext = { path?: string; courseId?: string; lessonId?: string }`
  - `buildSandraSystemPrompt(args: { lang: 'fr'|'ht'; page?: PageContext; chunks: KbChunk[] }): string`
  - `const SANDRA_LIMITS = { maxMessageChars: 2000, historyTurns: 12, conversationCap: 100, topK: 6 }`

- [ ] **Step 1: Write failing tests:** prompt includes persona name "Sandra"; includes the guide-don't-answer rule text when any chunk has `type === 'quiz'|'exam'`; includes each chunk's text under a "Contenu du cours" section; includes page context line when `page.courseId` given; instructs Creole reply when `lang === 'ht'`; includes platform FAQ section always.
- [ ] **Step 2: Run** `npx jest sandraPrompt` — FAIL.
- [ ] **Step 3: Implement.** Sections, in order: (1) persona — warm/encouraging French-speaking tutor for Haitian NS students, short answers, LaTeX allowed as plain notation; (2) pedagogy — never state final answers for graded quiz/exam material, walk through the démarche instead; (3) language — reply in French, mirror Creole if student writes Creole (force Creole opener when `lang==='ht'`); (4) platform FAQ — static French bullet list (find courses via /courses, exams via /exams, quizzes via /quizzes, progress on /dashboard, account on /profile, contact via /contact); (5) "Contenu du cours (référence)" — numbered chunks with `[type]` tags; (6) "Contexte de la page" when present. Pure function, no I/O.
- [ ] **Step 4: Run** `npx jest sandraPrompt` — PASS.
- [ ] **Step 5: Commit** `feat(api): Sandra persona prompt builder`

### Task 3: KB chunkers + build script + vector index

**Files:**
- Create: `scripts/sandra_kb_chunks.mjs` (pure chunk builders), `scripts/build_sandra_kb.mjs` (I/O)
- Modify: `firestore.indexes.json` (vector index), `package.json` (script `"kb:sandra": "node scripts/build_sandra_kb.mjs"`), `jest.config.js` ONLY if `mjs` missing from `moduleFileExtensions`
- Test: `src/utils/__tests__/sandraKbChunks.test.ts`

**Interfaces:**
- Produces (from `sandra_kb_chunks.mjs`): `chunkCourse(courseDoc) -> Array<{ text, courseId, level, subject, type: 'lesson', sourceId }>` (one per lesson with title+objectives+unit title+level; skip lessons with no title), `chunkQuiz(quizDoc, courseIdGuess) -> [...type:'quiz']` (question+options+correct answer+explanation; **quiz `options` is a JSON string and `correct_answer` a letter** — parse defensively), `chunkExamQuestion(q, meta) -> [...type:'exam']` (statement+démarche+solution). Chunk text ≤ 1500 chars (truncate).
- Consumes (script only): `FIREBASE_SERVICE_ACCOUNT_JSON` env (same as `scripts/audit_quizzes.mjs`), `GEMINI_API_KEY`, exam JSONs under `public/exams/`.

- [ ] **Step 1: Failing tests** for the three chunkers incl. the JSON-string options quirk and truncation.
- [ ] **Step 2:** `npx jest sandraKbChunks` — FAIL.
- [ ] **Step 3: Implement chunkers** (pure, no imports).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Build script:** read courses (skip `hidden`), quizzes, exam files; chunk; embed in batches of 100 via inline `batchEmbedContents` call (same model/env constants as Task 1 — duplicate the ~15 lines, note in comment); write to `sandraKb` with `FieldValue.vector(embedding)`, doc id = `sourceId`; `--dry-run` flag prints counts without writing; delete stale docs not in current chunk set.
- [ ] **Step 6: Vector index** — add to `firestore.indexes.json`: `{ "collectionGroup": "sandraKb", "queryScope": "COLLECTION", "fields": [ { "fieldPath": "courseId", "order": "ASCENDING" }, { "fieldPath": "embedding", "vectorConfig": { "dimension": 768, "flat": {} } } ] }` plus a second entry without the courseId field. Do NOT deploy — Task 7 deploys.
- [ ] **Step 7: Verify** `node scripts/build_sandra_kb.mjs --dry-run` prints chunk counts (needs env; if `FIREBASE_SERVICE_ACCOUNT_JSON` unset, verify it fails with the clear message "FIREBASE_SERVICE_ACCOUNT_JSON not set").
- [ ] **Step 8: Commit** `feat(scripts): Sandra knowledge-base builder + vector index`

### Task 4: SandraWidget (student UI)

**Files:**
- Create: `src/components/SandraWidget/index.tsx` (launcher, lazy panel import), `src/components/SandraWidget/SandraPanel.tsx`, `src/components/SandraWidget/SandraWidget.css`
- Modify: `src/components/Layout.tsx` (mount `<SandraWidget />` once, near `<NotificationCenter />`), `src/utils/i18n.ts` (add `sandra.*` keys, fr + ht)

**Interfaces:**
- Consumes: `authedFetch(url, body)` from `../../services/firebase`; `useStore()` for `user`; `useTranslation`; current route via `useLocation`; course/lesson ids parsed from `location.pathname` (`/courses/:courseId` pattern).
- API contract (server may not exist yet — build against it): POST `/api/chat` body `{ conversationId?: string, message: string, lang: 'fr'|'ht', page?: { path, courseId?, lessonId? } }` → 200 `{ reply: string, conversationId: string, remaining: number, conversationFull?: boolean }`; 401 → show sign-in prompt; 429 `{ message }` → show message; other → generic error + retry button.

- [ ] **Step 1: Launcher** — fixed bottom-right pill button (Limyè: coral accent `--flourish`/existing token, pill radius, Plus Jakarta Sans), `aria-label`, offset above `BottomNav` on mobile (CSS `bottom: calc(...)` with the same breakpoint BottomNav uses). Clicking toggles the lazy-loaded panel (`lazyWithRetry(() => import('./SandraPanel'))`).
- [ ] **Step 2: Panel** — header "Sandra · {t('sandra.subtitle')}" + new-conversation button; message list (user right, Sandra left with glyph); input (textarea, Enter sends, 2000-char max) + send; typing indicator `t('sandra.typing')`; error row with `t('sandra.retry')`; footer notice `t('sandra.reviewNotice')`. Signed-out: `t('sandra.signInPrompt')` + button opening the existing AuthModal flow (`useStore` auth action used by Navbar). State: messages in component state; `conversationId` in `sessionStorage('edlight:sandra:conv')`; on `conversationFull` clear it.
- [ ] **Step 3: i18n keys** (fr + ht): `sandra.subtitle` ("Assistante EdLight"), `sandra.placeholder`, `sandra.send`, `sandra.typing` ("Sandra écrit…"), `sandra.retry`, `sandra.newConversation`, `sandra.signInPrompt`, `sandra.reviewNotice` ("Les conversations peuvent être relues par l'équipe EdLight."), `sandra.error`, `sandra.open` (launcher aria). Creole translations included (use existing ht resource conventions in `src/utils/i18n.ts`).
- [ ] **Step 4: Mount in Layout** and verify `npm run build` compiles + `npx jest` still green.
- [ ] **Step 5: Commit** `feat(web): Sandra chat widget`

### Task 5: AdminSandra page

**Files:**
- Create: `src/pages/admin/AdminSandra.tsx`
- Modify: `src/App.tsx` (lazy import + route `users/sandra` inside the `/admin` block), `src/components/AdminLayout.tsx` (nav item `{ to: '/admin/users/sandra', Icon: MessageCircle, label: 'Sandra' }` in the Users group)

**Interfaces:**
- Consumes: Firestore client SDK (`collection(db,'chatConversations')`, `query`, `orderBy('lastMessageAt','desc')`, `limit(25)`, `startAfter`) — follow `AdminUsers.tsx` + `adminService.ts` conventions (incl. their getDocs fallback style). Doc shape per spec: `{ uid, studentName, studentEmail, startedAt, lastMessageAt, messageCount, lang, firstPage, messages: [{role, text, ts}] }`.

- [ ] **Step 1: List view** — table (Élève, Début, Dernière activité, Messages, Langue), recency sort, "Charger plus" cursor pagination, empty state "Aucune conversation pour l'instant.", French hardcoded like other admin pages, AdminLayout primitives for cards/tables.
- [ ] **Step 2: Transcript view** — selecting a row swaps to in-page transcript (component state, not a route): student header, chat bubbles (Sandra left / student right), timestamps, back button preserving loaded list.
- [ ] **Step 3: Wire route + nav item.** `npm run build` compiles; page renders (manual check happens in Task 7).
- [ ] **Step 4: Commit** `feat(admin): Sandra conversation browser`

### Task 6: `api/chat.ts` endpoint + rules + rate limit (after Tasks 1–2)

**Files:**
- Create: `api/chat.ts`
- Modify: `api/_lib/rateLimit.ts` (add `'chat': { max: 30, windowSec: 3600 }` to `LIMITS`), `firestore.rules` (add `chatConversations` + `sandraKb` blocks)
- Test: `src/utils/__tests__/chatApi.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `checkRateLimit(uid,'chat')`, `chatText`, `embed`, `resolveLLMConfig`, `LLMError` (Task 1), `buildSandraSystemPrompt`, `SANDRA_LIMITS`, `KbChunk` (Task 2), `getDb` from `_lib/firebaseAdmin`.
- Produces: the HTTP contract Task 4 consumes (see Task 4).

- [ ] **Step 1: Failing handler tests** (mock `_lib/llm`, `_lib/sandraPrompt` passthrough, `_lib/firebaseAdmin`, `_lib/requireAuth`, `_lib/rateLimit` with jest.mock factories, res as a recording stub): 405 on GET; 401 path (requireAuth returns null → handler returns without writing); 429 sets Retry-After; 400 on empty/>2000-char message; happy path calls `embed` once, `chatText` once, persists a doc update containing BOTH new messages, responds `{ reply, conversationId, remaining }`; at `messageCount >= 100` responds `conversationFull: true` without calling the LLM.
- [ ] **Step 2:** `npx jest chatApi` — FAIL.
- [ ] **Step 3: Implement** following `grade-essay.ts` structure. Retrieval: `db.collection('sandraKb').where('courseId','==',page.courseId).findNearest({ vectorField: 'embedding', queryVector: FieldValue.vector(qVec), limit: 6, distanceMeasure: 'COSINE' })`; if no courseId or < 3 hits, re-run without the `where`. Wrap retrieval in try/catch — on failure proceed with `chunks: []` (Sandra still answers, just ungrounded; log the error). Conversation: create doc `{ uid, studentName: decodedName||'', …, messages: [] }` on first message (fetch `users/{uid}` for name/email, tolerate missing); verify `data.uid === uid` on reuse else 403. Persist with a single `update` using `FieldValue.arrayUnion(userMsg, assistantMsg)` + `messageCount: FieldValue.increment(2)` + `lastMessageAt`. LLM failure → 502 `{ error: 'llm_failed', message: 'Sandra est momentanément indisponible. Réessayez dans un instant.' }`.
- [ ] **Step 4:** `npx jest chatApi` — PASS.
- [ ] **Step 5: Rules** — inside the existing `match /databases/{database}/documents` block: `match /chatConversations/{convId} { allow read: if isAdmin() || (request.auth != null && resource.data.uid == request.auth.uid); allow write: if false; }` and `match /sandraKb/{chunkId} { allow read, write: if false; }`.
- [ ] **Step 6: Commit** `feat(api): Sandra chat endpoint, rate limit, Firestore rules`

### Task 7: Integration verification (after all)

- [ ] **Step 1:** `npx tsc --noEmit` — no NEW errors vs baseline (repo has pre-existing ones); `npx jest` — all green; `npm run build` — compiles.
- [ ] **Step 2:** Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes` (needs `firebase login --reauth` first — ask Ted if auth fails).
- [ ] **Step 3:** Build the KB: `FIREBASE_SERVICE_ACCOUNT_JSON=… GEMINI_API_KEY=… node scripts/build_sandra_kb.mjs` (ask Ted for creds/env if not available).
- [ ] **Step 4:** `vercel dev` smoke test: sign in, open widget, send "Explique-moi les fonctions dérivées" from a math course page → grounded reply; check Firestore doc created; open /admin/users/sandra as admin → conversation visible.
- [ ] **Step 5:** Commit any fixes; report results (do NOT deploy to production without Ted's go-ahead).

## Self-review notes

- Spec coverage: KB (T3), endpoint+rules+limits (T6), llm helpers (T1), prompt/persona/pedagogy/FAQ (T2), widget incl. notice/sign-in/lang (T4), admin browser (T5), testing (T1/2/3/6 + T7), rollout env (T7). Out-of-scope items untouched. ✓
- Types consistent: `KbChunk`, `PageContext`, `SANDRA_LIMITS`, `ChatTextParams`, HTTP contract identical in T4/T6. ✓
- No placeholders: each code step names exact behavior, files, commands. ✓
