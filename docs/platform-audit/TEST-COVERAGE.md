# Test Coverage Report — EdLight Academy

**Audit date:** 2026-06-26

---

## Test Run Results

```
Test Suites: 11 passed, 11 total
Tests:       138 passed, 138 total
Snapshots:   0 total
Time:        7.782 s
```

All 138 tests pass. No failing tests.

---

## Existing Test Files

| File | Tests | What is covered |
|---|---|---|
| `src/components/__tests__/HomeRoute.test.tsx` | Component render | HomeRoute renders without crashing; checks logged-in vs. guest states |
| `src/hooks/__tests__/useBodyScrollLock.test.ts` | Hook behavior | Body scroll lock/unlock |
| `src/hooks/__tests__/useFocusTrap.test.tsx` | Hook behavior | Focus trap logic |
| `src/hooks/__tests__/useSwipeToDismiss.test.ts` | Hook behavior | Touch swipe dismiss |
| `src/services/__tests__/readinessService.test.ts` | Service logic | Readiness score calculation |
| `src/services/__tests__/reminderRules.test.ts` | Service logic | Reminder scheduling rules |
| `src/utils/__tests__/essayGrading.test.ts` | Utility | Essay grading logic |
| `src/utils/__tests__/examTitle.test.ts` | Utility | Exam title normalization |
| `src/utils/__tests__/examUtils.matching.test.ts` | Utility | Matching question grading |
| `src/utils/__tests__/examUtils.scaffold.test.ts` | Utility | Scaffold blank grading |
| `src/utils/__tests__/llm.test.ts` | Utility | LLM JSON extraction / config resolution |

---

## Coverage Gaps

### Not Tested

| Area | Risk | Priority |
|---|---|---|
| Authentication flows (login, register, logout, password reset) | High — auth is core | P1 |
| Admin role check (AdminRoute) | High — security gate | P1 |
| API endpoints (`grade-essay`, `grade-scaffold`, `users/export`, `users/upsert`) | Critical — P0 security issues exist | P0 |
| Exam attempt save/load/resume (Firestore round-trip) | High — core student flow | P1 |
| Quiz attempt persistence | Medium | P2 |
| Progress tracking (completion percentage, counters) | Medium | P2 |
| Dashboard rendering with various data states | Medium | P2 |
| ExamTake component (timer, submit, AI grading fallback) | High | P1 |
| ExamResults rendering (sessionStorage vs Firestore fallback) | Medium | P2 |
| Streak calculation | Medium | P2 |
| Leaderboard XP write | Low (until XP validation is added) | P3 |
| Notification scheduling | Low | P3 |
| CSV parsing (Admin upload) | Medium | P2 |
| `lazyWithRetry` retry behavior | Medium | P2 |

---

## Recommended Tests to Add

### P0 Priority — Security Tests

```ts
// api/users/export.test.ts
test('GET /api/users/export returns 401 without auth header')
test('GET /api/users/export returns 200 with valid admin token')
test('GET /api/users/export returns 403 with non-admin token')

// api/users/upsert.test.ts  
test('POST /api/users/upsert returns 401 without auth header')
test('POST /api/users/upsert returns 400 with missing email/sub')
test('POST /api/users/upsert returns 200 with valid token + valid body')

// api/grade-scaffold.test.ts
test('POST /api/grade-scaffold returns 401 without auth header')
```

### P1 Priority — Auth & Core Flows

```ts
// Auth
test('loginWithEmailPassword succeeds with valid credentials')
test('loginWithEmailPassword throws on wrong password')
test('registerWithEmailPassword creates Firestore user document')
test('logoutUser clears Zustand store isAuthenticated')

// AdminRoute
test('AdminRoute redirects to / when not authenticated')
test('AdminRoute shows access denied for non-admin role')
test('AdminRoute renders children for admin role')

// ExamAttempts
test('saveExamAttemptDraft persists answers to Firestore')
test('loadExamAttemptDraft returns null when no draft exists')
test('markExamAttemptSubmitted sets status to submitted')

// ExamTake
test('auto-submits when timer reaches 0')
test('gradeExam correctly grades multiple choice answers')
test('gradeExam falls back gracefully when AI grading fails')
```

### P2 Priority — UI Components

```ts
// Dashboard
test('Dashboard shows guest CTA when not authenticated')
test('Dashboard shows skeleton loading state while fetching courses')
test('Dashboard shows error state when course fetch fails')

// ExamResults  
test('ExamResults loads from sessionStorage when available')
test('ExamResults loads from Firestore when sessionStorage is empty')
test('ExamResults shows 404 when neither source has data')

// Progress
test('calculateCompletionPercentage returns 0 for null progress')
test('calculateCompletionPercentage returns 100 when all lessons complete')
```

---

## Recommended End-to-End Smoke Test

A Playwright smoke test visiting all accessible routes:

```ts
// tests/e2e/smoke.spec.ts
const PUBLIC_ROUTES = ['/', '/courses', '/exams', '/exams/terminale', '/about', '/contact', '/faq', '/help', '/privacy', '/terms'];

test.describe('Public route smoke test', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', err => errors.push(err.message));
      
      const resp = await page.goto(`https://edlightacademy.com${route}`);
      expect(resp?.status()).toBeLessThan(400);
      expect(errors).toHaveLength(0);
      await expect(page).not.toHaveTitle('Error');
    });
  }
});

test('404 page renders for unknown route', async ({ page }) => {
  const resp = await page.goto('/does-not-exist-xyz');
  await expect(page.locator('h1, h2')).toContainText('404');
});

test('API /users/export returns 401 without auth', async ({ request }) => {
  const resp = await request.get('/api/users/export');
  expect(resp.status()).toBe(401);
});
```

---

## Test Infrastructure Notes

- **Framework:** Jest 29 + `@testing-library/react` 14
- **Environment:** `jest-environment-jsdom`
- **TypeScript:** Babel-transpiled (via `@babel/preset-typescript`) — no type-check in test run
- **Warning:** The test run shows React Router v6 future-flag deprecation warnings — these are warnings only, not failures
- **No snapshot tests** — this is appropriate for a dynamic UI (snapshots become maintenance burden)
- **No e2e tests exist** — Playwright is not installed

---

## Summary

| Metric | Value |
|---|---|
| Total tests | 138 |
| Passing | 138 (100%) |
| Failing | 0 |
| Critical paths with no coverage | Auth, Admin security, API endpoints, ExamTake |
| Recommended new tests | ~30 unit + ~15 e2e |
