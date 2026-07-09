# Performance Audit — EdLight Academy

**Audit date:** 2026-06-26

---

## Build Results

```
Build: PASS (2 warnings, 0 errors)
Tool:  webpack 5.102.1
Time:  36.5 seconds
```

### Bundle Size Analysis

| Asset | Size | Status |
|---|---|---|
| Main entrypoint (all chunks) | **1.11 MiB** | ⚠️ Exceeds 244 KiB recommended |
| `js/firebase.*.js` | 453 KiB | ⚠️ Large |
| `js/959.*.js` (exam utils) | 410 KiB | ⚠️ Large |
| `js/611.*.js` (likely math/katex) | 271 KiB | ⚠️ |
| `css/main.*.css` | **312 KiB** | ⚠️ Large |
| `exam_catalog_index.json` | 277 KiB | Acceptable (cached 24h) |
| Largest single exam JSON | 653 KiB (`ex_516a2bdd`) | ⚠️ Very large for a single exam |

---

## Code Splitting

**Good:** All page components are lazy-loaded via `lazyWithRetry()`. This creates separate JS chunks per route.

**Good:** Firebase SDK is dynamically imported in `authService.ts` and `AdminRoute.tsx` — not bundled into the initial chunk.

**Good:** XLSX library is lazy-imported only when Admin uploads a file.

**Issue:** The `exam_catalog_index.json` (277 KiB) is loaded at browse time by `ExamBrowser`. It contains metadata for all 494 exams. This is already much better than the original 27.9 MB full catalog (the `split_exam_catalog.mjs` script correctly splits it). However, 277 KiB of JSON is still large for initial browse.

**Issue:** CSS is in a single 312 KiB bundle. Webpack's `MiniCssExtractPlugin` emits one CSS file for all lazy chunks, so even route-level lazy loading doesn't reduce CSS cost.

---

## Specific Performance Findings

### PERF-P1: Main CSS Bundle 312 KiB

The single CSS file is loaded on every page visit regardless of which page is viewed. Given the multiple per-page CSS files (`Dashboard.css`, `Home.css`, `Profile.css`, `TriviaGames.css`, etc.), these all compile into one bundle.

**Fix:** Use webpack's `optimization.splitChunks` for CSS (experimental with MiniCssExtractPlugin), or migrate to CSS Modules to enable per-component splitting.

---

### PERF-P1: Firebase SDK in Entrypoint

Despite dynamic imports in `authService.ts`, the `firebase.*.js` chunk (453 KiB) is listed in the main entrypoint. This suggests the Firebase SDK is being eagerly required somewhere else. Investigate with `webpack-bundle-analyzer`.

**Impact:** Adds ~450 KiB to first load, blocking initial render on slow connections.

**Fix:** Audit imports of `src/services/firebase.ts` — any eager import will pull in the whole SDK. The `src/index.tsx` or `src/App.tsx` should not import Firebase directly.

---

### PERF-P2: Largest Exam (653 KiB) — No Compression Check

One exam JSON file is 653 KiB. With gzip (typical Vercel behavior), this compresses to ~80-100 KiB. Verify that Vercel's CDN is serving these files with `Content-Encoding: gzip` or `br`.

---

### PERF-P2: N+1 Firestore Reads in Admin

`Section.handleLoadCurrent` fetches entire Firestore collections (`videos`, `quizzes`, `users`) client-side. For large collections this is a full table scan:

```ts
const snapshot = await getDocs(collection(db, 'videos'));
snapshot.forEach((doc) => { ... });
```

**Impact:** Slow admin load times; potential Firestore read billing spikes.

**Fix:** Add server-side pagination or limit to the first 500 documents.

---

### PERF-P2: Non-Atomic Counter Updates (Race Condition)

In `progressTracking.ts`, counters like `totalPoints` and `watchedVideos` use read-modify-write patterns:

```ts
const current = await getDoc(ref);
const existing = current.data() || {};
await setDoc(ref, { totalPoints: (existing.totalPoints || 0) + points }, { merge: true });
```

Under concurrent requests (same user, two devices), both reads see the old value and both writes set `totalPoints + N` — effectively losing one increment.

**Fix:** Use Firestore `increment()`:
```ts
import { increment, updateDoc } from 'firebase/firestore';
await updateDoc(ref, { totalPoints: increment(points) });
```

---

### PERF-P3: `staleTime: Infinity` on Exam Query

```ts
useQuery({
  queryKey: ['exam', examIdParam],
  queryFn: () => fetchSingleExam(examIdParam),
  staleTime: Infinity,
});
```

This means the exam data is never re-fetched during the session. For exam content that may be updated (bug fixes, corrections), users on long sessions would see stale data.

**Fix:** Use a shorter staleTime (e.g., 1 hour) unless exam content is truly immutable.

---

### PERF-P3: Exam Timer in `setInterval` Without Cleanup Guard

The timer `useEffect` returns a cleanup function that calls `clearInterval`. This is correct. However, `handleSubmit` is called from a `useEffect` that only depends on `[secondsLeft]`:

```ts
useEffect(() => {
  if (durationMin && secondsLeft === 0 && !submitted) {
    handleSubmit();
  }
}, [secondsLeft]);
```

The missing `handleSubmit` in the dependency array is suppressed with an eslint-disable comment. This is a stale closure risk — `handleSubmit` may capture stale state.

---

### PERF-P3: Large Image Files in Repository Root

Three large image files are committed to the repository root:
- `DSC01469.jpg` — 20.5 MB
- `DSC08030-Enhanced-NR.jpg` — 20.5 MB
- `1.jpg` — 100 KB

These should be moved to a CDN (Firebase Storage) and removed from the git repository. At 41 MB, they significantly inflate clone times.

---

## Core Web Vitals Risk Assessment

| Metric | Risk | Reason |
|---|---|---|
| LCP | Medium | Main JS entrypoint is 1.11 MiB — delays first contentful render on slow connections |
| FID / INP | Low | Exam grading is async; no blocking main-thread operations |
| CLS | Low | Skeleton states prevent layout shifts |
| TTFB | Low | Vercel CDN should serve static assets quickly |

---

## Lighthouse Recommendations

Without running Lighthouse directly, estimated issues based on bundle analysis:

1. Reduce initial JS bundle (Firebase eager load)
2. Serve images with explicit `width` and `height` attributes
3. Add `<link rel="preconnect">` for Firebase/Google domains
4. Consider a service worker cache for exam JSON files (PWA already exists)

---

## Summary

| Severity | Count | Key Findings |
|---|---|---|
| P1 | 2 | Main CSS 312 KiB single bundle; Firebase SDK in entrypoint |
| P2 | 2 | N+1 admin reads; non-atomic counter updates |
| P3 | 3 | staleTime: Infinity on exams; timer stale closure; 41 MB images in git |
