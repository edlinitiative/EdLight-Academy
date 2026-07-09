# Security Audit — EdLight Academy

**Audit date:** 2026-06-26  
**Standard:** OWASP Top 10, WCAG-adjacent auth, general API security

---

## P0 — Critical (fix immediately)

### SEC-P0-1: Hardcoded API Key in Source Code

| Field | Value |
|---|---|
| Severity | P0 — Critical |
| File | `api/grade-scaffold.ts:3` |
| Affected role | All users (public API) |
| Route | `POST /api/grade-scaffold` |

**Description:**  
A live Gemini API key (`AIzaSyArY6rWXr3IoaZjSgreonwhvgKg1gQ4yZ4`) is hardcoded as a fallback literal in the source:

```ts
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyArY6rWXr3IoaZjSgreonwhvgKg1gQ4yZ4';
```

This key is committed to git and visible to anyone with repository access. If the repository is public or semi-public, the key is fully exposed.

**Impact:** An attacker can call Google Generative Language APIs (text generation, embeddings, etc.) at EdLight's expense, potentially running up unbounded charges. Google may also terminate the key if it detects abuse.

**Fix:**
1. Immediately revoke the key at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2. Generate a new key and store it only in Vercel environment variables as `GEMINI_API_KEY`.
3. Remove the fallback literal — the line should be:
   ```ts
   const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
   if (!GEMINI_API_KEY) { res.status(503).json({ error: 'AI grading not configured' }); return; }
   ```
4. Run `git log --all -S 'AIzaSyArY6rW'` to confirm no other commits contain the key, then force-push or rewrite history.

---

### SEC-P0-2: Unauthenticated User Export Endpoint

| Field | Value |
|---|---|
| Severity | P0 — Critical |
| File | `api/users/export.ts` |
| Route | `GET /api/users/export` |
| Affected role | All internet users |

**Description:**  
The handler has zero authentication. Any HTTP `GET` to `https://edlightacademy.com/api/users/export` returns the full user CSV from GitHub (`public/data/edlight_users.csv`) including names, emails, and user IDs of all students.

**Impact:** Complete PII exfiltration. Violates GDPR, CCPA, and any applicable Haitian data-protection law. Also exposes the PII to search engine crawlers that enumerate Vercel deployments.

**Fix:**  
Add a Firebase Admin token verification or at minimum a `CRON_SECRET` check before returning data:

```ts
import { verifyIdToken } from '../_lib/firebaseAdmin';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  try {
    const decoded = await verifyIdToken(token);
    // Optionally: check decoded.role === 'admin' via Firestore
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  // ... rest of handler
}
```

---

### SEC-P0-3: Unauthenticated User Upsert Endpoint

| Field | Value |
|---|---|
| Severity | P0 — Critical |
| File | `api/users/upsert.ts` |
| Route | `POST /api/users/upsert` |
| Affected role | All internet users |

**Description:**  
The handler has no authentication. Any anonymous HTTP `POST` with a JSON body can insert or overwrite user records in the shared GitHub CSV. The endpoint accepts arbitrary `name`, `email`, and `sub` fields.

**Impact:**  
- Data injection — a malicious actor can add arbitrary users to the user list.
- Data corruption — an attacker can overwrite existing user records (matched by email).
- The endpoint commits directly to the `main` branch of the GitHub repository, creating a permanent audit trail of abuse.

**Secondary finding:** Storing PII (names, emails) in a file committed to a git repository (`public/data/edlight_users.csv`) is architecturally unsafe. This data belongs in Firestore (where it already mirrors), not in a version-controlled public file.

**Fix:**  
1. Require a Firebase ID token (same as SEC-P0-2 fix).
2. Long-term: deprecate the GitHub CSV entirely. Firestore already has a `users` collection that is the authoritative store. Remove `public/data/edlight_users.csv` from git and decommission both `users/export` and `users/upsert` endpoints.

---

## P1 — High

### SEC-P1-1: All AI Endpoints Lack Authentication and Rate Limiting

| Field | Value |
|---|---|
| Severity | P1 |
| Files | `api/grade-essay.ts`, `api/grade-scaffold.ts`, `api/generate-quiz.ts`, `api/generate-plan.ts` |
| Routes | `POST /api/grade-essay`, `POST /api/grade-scaffold`, `POST /api/generate-quiz`, `POST /api/generate-plan` |

Any anonymous HTTP request triggers an LLM API call. An attacker can make thousands of requests, exhausting the LLM API budget. No per-IP or per-user rate limiting exists.

**Fix:** Add Firebase ID token verification (or at minimum a CRON_SECRET check). Consider adding a per-IP rate limiter using Vercel Edge Middleware or an upstash/redis rate limiter.

---

### SEC-P1-2: Open Proxy Endpoint

| Field | Value |
|---|---|
| Severity | P1 |
| File | `api/proxy.ts` |
| Route | `GET /api/proxy?url=...` |

The proxy accepts any URL from any caller. This is a Server-Side Request Forgery (SSRF) vector — an attacker can use it to probe internal AWS/GCP metadata endpoints (`169.254.169.254`), internal services, or enumerate cloud resources.

**Fix:** Whitelist the allowed upstream domains (e.g., only YouTube, Firestore). Reject all other targets.

---

### SEC-P1-3: Stale `isAuthenticated` in localStorage

| Field | Value |
|---|---|
| Severity | P1 |
| File | `src/contexts/store.ts` |

The Zustand store persists `isAuthenticated: true` to localStorage via `zustand/middleware/persist`. After a Firebase token expires (default: 1 hour), `isAuthenticated` remains `true` in localStorage until the next Firebase SDK auth-state callback fires.

During this window, protected UI state (Admin check, Dashboard, etc.) may render with stale auth. The `AdminRoute` guard correctly re-reads Firestore, but other consumer components trust `isAuthenticated` directly.

**Fix:** On app boot, re-hydrate the Zustand store but immediately trigger a Firebase `onAuthStateChanged` listener. If Firebase returns `null`, call `store.logout()` to clear the stale flag. This already happens in `src/index.tsx` (needs verification); confirm the pattern covers page-reload scenarios.

---

### SEC-P1-4: Client-Reported XP / Leaderboard Scores

| Field | Value |
|---|---|
| Severity | P1 |
| File | `firestore.rules:95-100` |

The weekly leaderboard allows any authenticated user to write their own XP entry. The only validation is that `request.auth.uid == entryId` and `request.resource.data.uid == entryId`. A user can set their XP to any arbitrary number (e.g., `999999999`).

**Fix:** Move XP increments to a Firestore Cloud Function triggered by quiz/exam submissions. The client should never write XP directly. Until then, add a Firestore rule that caps `xp` to a reasonable max (e.g., `<= 10000` per week) and validates it is a number.

---

### SEC-P1-5: `isAdmin()` Firestore Rule Performs a Firestore Read

| Field | Value |
|---|---|
| Severity | P1 |
| File | `firestore.rules:7-9` |

```
function isAdmin() {
  return request.auth != null && 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

Every rule evaluation that calls `isAdmin()` issues a Firestore document read. This: (a) counts toward billing, (b) can add latency to every write operation, and (c) can fail silently if the user document doesn't exist.

**Fix:** Use Firebase Auth custom claims to store the admin role:
```js
// In a Cloud Function after admin promotion:
admin.auth().setCustomUserClaims(uid, { admin: true });
```
Then in rules:
```
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}
```

---

## P2 — Medium

### SEC-P2-1: Undocumented Firebase Internal Field

| Field | Value |
|---|---|
| Severity | P2 |
| File | `src/services/authService.ts:93` |

```ts
const isNewUser = result._tokenResponse?.isNewUser || false;
```

`_tokenResponse` is an undocumented internal Firebase SDK field. It can disappear in any SDK update. If it disappears, `isNewUser` will always be `false`, causing new users to not get a welcome email / correct onboarding state.

**Fix:** Use `getAdditionalUserInfo(result).isNewUser` which is the public documented API.

---

### SEC-P2-2: CSP `unsafe-eval` and `unsafe-inline`

| Field | Value |
|---|---|
| Severity | P2 |
| File | `vercel.json:24` |

The Content-Security-Policy header includes `'unsafe-eval'` and `'unsafe-inline'` in `script-src`. This effectively negates XSS protection — any injected script will execute.

`unsafe-eval` is required by KaTeX for math rendering. The long-term fix is to move to a CSP-compatible KaTeX build (KaTeX v0.16+ supports a no-eval mode). `unsafe-inline` can be replaced with a nonce-based approach or hash-based CSP once the webpack pipeline is updated.

**Short-term fix:** Remove `https://unpkg.com` and `https://cdn.jsdelivr.net` from `script-src` (they are not used in production, only legacy references). This reduces the attack surface even with `unsafe-inline` still present.

---

### SEC-P2-3: PII Stored in Git-Tracked Public CSV

| Field | Value |
|---|---|
| Severity | P2 |
| File | `public/data/edlight_users.csv` (implied by `api/users/upsert.ts` and `api/users/export.ts`) |

Student names and email addresses are being committed to the git repository. Even in a private repository, this creates risk of accidental exposure and makes GDPR right-to-erasure requests difficult to fulfill.

**Fix:** Stop writing to this CSV. Firestore is the authoritative user store. Decommission the two endpoints.

---

### SEC-P2-4: No Email Verification

| Field | Value |
|---|---|
| Severity | P2 |
| File | `src/services/authService.ts` |

After email/password registration, Firebase sends a verification email but the app does not check `user.emailVerified`. An attacker could register with someone else's email address and immediately access the platform.

**Fix:** Check `user.emailVerified` after login and prompt users to verify their email before accessing progress features.

---

### SEC-P2-5: `redirect_uri` Not Validated Server-Side in OAuth Token Exchange

| Field | Value |
|---|---|
| Severity | P2 |
| File | `api/oauth/google/token.ts:41` |

The `redirect_uri` provided by the client is passed through directly to Google's token endpoint without validation. A malicious redirect_uri could be used in a confused-deputy attack if the endpoint is used incorrectly.

**Fix:** Validate that `redirect_uri` is one of a whitelist of known application redirect URIs before forwarding to Google.

---

## P3 — Low

| ID | Issue | File |
|---|---|---|
| SEC-P3-1 | `console.log` statements in Admin.tsx production code leak internal debug info | `src/pages/Admin.tsx` (many instances) |
| SEC-P3-2 | `window.confirm()` used for delete confirmation — bypasses CSP and is not accessible | `src/pages/Admin.tsx:557` |
| SEC-P3-3 | Dependency vulnerabilities: `xlsx` has Prototype Pollution (critical) and ReDoS (high); `ws` has memory disclosure | `package.json` |
| SEC-P3-4 | No CSRF token on API endpoints — relies on same-origin fetch but token-authenticated APIs should be more explicit | All API handlers |
| SEC-P3-5 | The `api/proxy.ts` response does not strip `Set-Cookie` headers from upstream responses | `api/proxy.ts` |

---

## Summary

| Severity | Count |
|---|---|
| P0 — Critical | 3 |
| P1 — High | 5 |
| P2 — Medium | 5 |
| P3 — Low | 5 |
| **Total** | **18** |

**Immediate actions required:**
1. Revoke and rotate `AIzaSyArY6rWXr3IoaZjSgreonwhvgKg1gQ4yZ4` (the hardcoded Gemini key).
2. Add auth check to `GET /api/users/export`.
3. Add auth check to `POST /api/users/upsert`.
