# Remediation Plan — EdLight Academy

**Audit date:** 2026-06-26  
**Auditor:** Platform audit (automated + manual code review)

---

## Severity Classification

| Code | Meaning |
|---|---|
| **P0** | Critical — security breach, data loss, authentication failure, or platform unusable |
| **P1** | High — major user flow broken or significant security risk |
| **P2** | Medium — meaningful usability, reliability, or consistency problem |
| **P3** | Low — polish, cleanup, or minor improvement |

---

## P0 — Critical Issues (Fix Immediately)

### REM-P0-01: Revoke and Remove Hardcoded Gemini API Key

| Field | Value |
|---|---|
| Issue | Gemini API key `AIzaSyArY6rWXr3IoaZjSgreonwhvgKg1gQ4yZ4` is hardcoded in source |
| File | `api/grade-scaffold.ts:3` |
| Affected routes | `POST /api/grade-scaffold` |
| Affected roles | All — public endpoint |
| Reproduction | Open `api/grade-scaffold.ts` in any editor or GitHub web view |
| Expected | Key stored only in `GEMINI_API_KEY` environment variable |
| Actual | Key is a fallback literal in source code |
| Probable cause | Developer added fallback for local testing, never removed it |
| Recommended fix | 1. Revoke key at Google Cloud Console. 2. Remove fallback literal. 3. Return 503 if env var missing. 4. Rewrite/squash git history if repo is public. |
| Complexity | Low (30 min) |
| Regression risk | Low |
| Testing required | Verify endpoint returns 503 when `GEMINI_API_KEY` env var is unset; verify grading works when env var is set |

---

### REM-P0-02: Add Authentication to `GET /api/users/export`

| Field | Value |
|---|---|
| Issue | Endpoint returns full user PII (names, emails, IDs) to any anonymous request |
| File | `api/users/export.ts` |
| Affected routes | `GET /api/users/export` |
| Affected roles | Admin only (intended), but currently public |
| Reproduction | `curl https://edlightacademy.com/api/users/export` |
| Expected | 401 for unauthenticated requests |
| Actual | Returns full user CSV |
| Probable cause | Auth check was never implemented — endpoint was added as a quick admin utility |
| Recommended fix | Add Firebase Admin `verifyIdToken()` check. Optionally also verify `admin` custom claim or Firestore role. |
| Complexity | Low (1 hour) |
| Regression risk | Low — Admin page will need to send `Authorization: Bearer <idToken>` header when fetching |
| Testing required | Unit test: 401 without token, 403 with non-admin token, 200 with admin token |

---

### REM-P0-03: Add Authentication to `POST /api/users/upsert`

| Field | Value |
|---|---|
| Issue | Endpoint allows any anonymous request to write user records |
| File | `api/users/upsert.ts` |
| Affected routes | `POST /api/users/upsert` |
| Affected roles | System (called after auth), but currently public |
| Reproduction | `curl -X POST https://edlightacademy.com/api/users/upsert -d '{"email":"hack@test.com","name":"injected"}'` |
| Expected | 401 for unauthenticated requests |
| Actual | Creates/updates user record and commits to GitHub |
| Probable cause | Auth check was never added |
| Recommended fix | Add Firebase Admin `verifyIdToken()` check. Verify that `decoded.uid` matches the `sub` or email in the body. Consider whether this endpoint is needed at all — Firestore already has a users collection. |
| Complexity | Low (1 hour) |
| Regression risk | Low — the auth flow that calls this will need to pass the Firebase ID token |
| Testing required | Unit test: 401 without token, 400 with bad body, 200 with valid token + matching identity |

---

## P1 — High Issues (Fix This Sprint)

### REM-P1-01: Add Authentication to AI API Endpoints

| Field | Value |
|---|---|
| Issue | `/api/grade-essay`, `/api/generate-quiz`, `/api/generate-plan` have no auth — LLM API costs can be run up by anyone |
| Files | `api/grade-essay.ts`, `api/generate-quiz.ts`, `api/generate-plan.ts` |
| Recommended fix | Add Firebase ID token verification. Optionally add a per-user rate limit (e.g., 50 requests/hour) using a Firestore counter or Upstash Redis. |
| Complexity | Medium (2-4 hours) |
| Regression risk | Medium — all callers in `ExamTake.tsx` and `StudyPlan.tsx` must add `Authorization` header |
| Testing required | Verify 401 without token; verify AI features work for authenticated users |

---

### REM-P1-02: Restrict or Remove Open Proxy Endpoint

| Field | Value |
|---|---|
| Issue | `GET /api/proxy?url=...` proxies any URL — SSRF risk |
| File | `api/proxy.ts` |
| Recommended fix | Whitelist allowed upstream domains. Reject requests to private IP ranges (10.x, 172.16.x, 192.168.x, 169.254.x). |
| Complexity | Low (1 hour) |
| Regression risk | Low — only affects callers of the proxy; whitelist should cover all legitimate uses |

---

### REM-P1-03: Fix Client-Reported XP / Leaderboard Scores

| Field | Value |
|---|---|
| Issue | Any authenticated user can write arbitrary XP to the leaderboard |
| File | `firestore.rules:95-100` |
| Recommended fix | Move XP increments to a Cloud Function triggered by quiz/exam completions. Add a Firestore rule cap: `request.resource.data.xp is number && request.resource.data.xp >= resource.data.xp` (XP can only increase by server-triggered amounts). |
| Complexity | High (full day — requires Cloud Function) |
| Regression risk | Medium |

---

### REM-P1-04: Replace `isAdmin()` with Custom Claims in Firestore Rules

| Field | Value |
|---|---|
| Issue | `isAdmin()` rule fires a Firestore read on every admin operation — billing and latency risk |
| File | `firestore.rules:7-9` |
| Recommended fix | Use `request.auth.token.admin == true` (custom claim). Set claim via Firebase Admin SDK when promoting admins. |
| Complexity | Medium (half day) |
| Regression risk | Low if done correctly — existing admin operations continue to work |

---

### REM-P1-05: Add Firestore Atomic Counters

| Field | Value |
|---|---|
| Issue | `progressTracking.ts` uses read-modify-write for `totalPoints` and `watchedVideos` — concurrent writes lose increments |
| File | `src/services/progressTracking.ts` |
| Recommended fix | Replace manual increments with `increment()` from `firebase/firestore` |
| Complexity | Low (2 hours) |
| Regression risk | Low |

---

### REM-P1-06: Add `getAdditionalUserInfo` for New User Detection

| Field | Value |
|---|---|
| Issue | `result._tokenResponse?.isNewUser` is an undocumented internal Firebase field |
| File | `src/services/authService.ts:93` |
| Recommended fix | Use `getAdditionalUserInfo(result)?.isNewUser` (public API) |
| Complexity | Trivial (15 min) |
| Regression risk | None |

---

## P2 — Medium Issues (Next Sprint)

| ID | Issue | File(s) | Fix Summary | Complexity |
|---|---|---|---|---|
| REM-P2-01 | Dashboard accessible to unauthenticated users with no prompt | `src/pages/Dashboard.tsx` | Show guest-state like Profile page does | Low |
| REM-P2-02 | ExamResults relies on sessionStorage — data lost on URL share or tab reopen | `src/pages/ExamResults.tsx` | Always fall back to Firestore `examResults` doc if sessionStorage is empty | Medium |
| REM-P2-03 | Dead `viewState === 'cover'` branch in ExamTake (1163 lines of dead JSX) | `src/pages/ExamTake.tsx` | Remove the entire cover branch; entry point is preview | Low |
| REM-P2-04 | `button--danger` CSS class undefined — no visual warning on destructive actions | `src/index.css` | Add `.button--danger` with red background/border | Trivial |
| REM-P2-05 | `window.confirm()` for delete confirmation — not accessible | `src/pages/Admin.tsx` | Replace with custom modal dialog | Medium |
| REM-P2-06 | `<a href="/admin/...">` hard reloads — should be `<Link>` | `src/pages/Admin.tsx` | Replace with React Router `<Link>` | Trivial |
| REM-P2-07 | Email verification not enforced | `src/services/authService.ts` | Check `user.emailVerified`; show banner prompting verification | Medium |
| REM-P2-08 | DataTable `<th>` missing `scope="col"` — screen readers can't associate headers | `src/pages/Admin.tsx` | Add `scope="col"` | Trivial |
| REM-P2-09 | Auth modal initial focus not set | `src/components/Auth.tsx` | Auto-focus first form input on modal open | Low |
| REM-P2-10 | TypeScript deprecation warning (`baseUrl` in tsconfig) | `tsconfig.json` | Add `"ignoreDeprecations": "6.0"` or remove `baseUrl` | Trivial |
| REM-P2-11 | Dependency vulnerability: `xlsx` (Prototype Pollution + ReDoS) | `package.json` | Evaluate replacing `xlsx` with `papaparse` (CSV) + a safer XLSX library | High |
| REM-P2-12 | Admin `console.log` statements in production | `src/pages/Admin.tsx` | Remove debug logs | Low |
| REM-P2-13 | `redirect_uri` not validated in OAuth token exchange | `api/oauth/google/token.ts` | Whitelist allowed redirect URIs | Low |
| REM-P2-14 | Admin N+1 Firestore reads (full collection scans) | `src/pages/Admin.tsx` | Add `limit(500)` to collection queries | Low |

---

## P3 — Low / Polish Issues

| ID | Issue | File(s) | Fix Summary |
|---|---|---|---|
| REM-P3-01 | "Sign Out" text in English on French/Creole Profile page | `src/pages/Profile.tsx` | Localize to "Déconnexion" / "Dekonekte" |
| REM-P3-02 | `AuthCallback.tsx` page is registered but not routed | `src/pages/AuthCallback.tsx` | Either register route `/auth/callback` or delete the file |
| REM-P3-03 | Homepage testimonials may be placeholder data | `src/pages/home/TestimonialsSection.tsx` | Replace with verified real testimonials or clearly label as examples |
| REM-P3-04 | 41 MB images committed to repository root (DSC*.jpg) | Root | Move to Firebase Storage or CDN; remove from git |
| REM-P3-05 | KaTeX renders without MathML — screen readers cannot read math | `src/utils/shared.ts` | Enable `output: 'htmlAndMathml'` in KaTeX config |
| REM-P3-06 | `staleTime: Infinity` on exam query — stale content in long sessions | `src/pages/ExamTake.tsx` | Set `staleTime: 60 * 60 * 1000` (1 hour) |
| REM-P3-07 | Admin modal edit title hardcoded "Edit Course Details" even for quiz/user rows | `src/pages/Admin.tsx` | Derive title from `title` prop of the `Section` component |
| REM-P3-08 | CSP allows `unpkg.com` and `jsdelivr.net` in `script-src` — unused in production | `vercel.json` | Remove unused CDN sources from script-src |
| REM-P3-09 | `require()` in `UserDropdown` useMemo — CommonJS in ESM context | `src/components/Auth.tsx:352` | Replace with ES import at module top |
| REM-P3-10 | Timer state not persisted to Firestore — resets on hard refresh | `src/pages/ExamTake.tsx` | Include `secondsLeft` in the draft save (already done) — verify it loads correctly |

---

## Execution Order

```
Week 1 (Critical):
  REM-P0-01  Rotate hardcoded Gemini API key
  REM-P0-02  Auth check on /api/users/export
  REM-P0-03  Auth check on /api/users/upsert
  REM-P1-01  Auth checks on AI endpoints

Week 2 (High):
  REM-P1-02  Restrict proxy endpoint
  REM-P1-05  Atomic Firestore counters
  REM-P1-06  getAdditionalUserInfo fix

Week 3 (Medium — UX):
  REM-P2-01  Dashboard guest state
  REM-P2-02  ExamResults Firestore fallback
  REM-P2-03  Remove dead cover branch in ExamTake
  REM-P2-04  Add button--danger CSS
  REM-P2-05  Replace window.confirm with modal
  REM-P2-06  Fix <a> → <Link> in Admin

Week 4 (Medium — Security + A11y):
  REM-P1-03  Cloud Function for XP
  REM-P1-04  Custom claims for isAdmin()
  REM-P2-07  Email verification enforcement
  REM-P2-08  DataTable scope attributes
  REM-P2-09  Auth modal focus
  REM-P2-10  TypeScript deprecation

Backlog (P3 — ongoing):
  All REM-P3-* items
```

---

## Summary Counts

| Severity | Count |
|---|---|
| P0 — Critical | 3 |
| P1 — High | 6 |
| P2 — Medium | 14 |
| P3 — Low | 10 |
| **Total** | **33** |
