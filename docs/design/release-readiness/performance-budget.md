# Performance budget and P1 continuity/offline record

Status: P1 of the [premium product roadmap](../2026-10-18-premium-product-implementation-roadmap.md)
(§2 continuity, §4 dependable interactions, §5 navigation/continuity and offline, §6 responsive composition and performance).
It covers release requirements CON-02, CON-04, CON-05 and CON-10, PRE-04, PRE-11, and the §8 performance acceptance profile.

**These are lab measurements, not device evidence.** Bundle sizes are gzip -9 of the files in `dist/`, measured on the build machine.
No timing in this file was taken on a representative device or under the §8 network profile (1.5/0.5 Mb/s, 300 ms RTT).

## 1. Web bundle budget

- Script: `npm run build && npm run perf:budget`. Logic lives in `scripts/bundle_budget_core.mjs`, the CLI in `scripts/bundle_budget.mjs`.
- Baseline: `perf/bundle-budget.json`.
- Rule: the check fails (exit 1) when any metric grows more than `tolerancePct` (10%) over the baseline. Shrinking never fails.
- After an intended change, refresh the baseline with `npm run perf:budget -- --update`, so a gain is locked in.
- Tests: `src/__tests__/bundleBudget.test.ts`.

### Metrics

| Metric | What it counts |
| --- | --- |
| `initialJsGz` | Every script the landing HTML loads or preloads: runtime, react, i18n, the shared vendor chunk, main |
| `initialCssGz` | Stylesheets linked by the landing HTML |
| `totalJsGz` / `totalCssGz` | Every emitted file |
| `largestAsyncJsGz` | The largest lazy chunk |
| `named:*` | Each named chunk (firebase, markdown, home, duel-bank …) |

### Before and after (2026-10-19, same machine, `npm run build`)

| Metric | Before | After |
| --- | --- | --- |
| Initial JS (gzip) | 271.3 KB | **261.5 KB** (−3.6%) |
| `main.js` (gzip) | 69.6 KB | **59.8 KB** (−14.2%) |
| Initial CSS (gzip) | 71.8 KB | 71.9 KB |
| Total JS (gzip) | 1836.0 KB | 1829.1 KB |
| Largest async chunk (gzip) | 180.2 KB (`src/data/triviaData`, games only) | 180.2 KB |

**The change:** the always-mounted search overlay imported `examUtils` statically.
That module is about 96 KB minified, including the question compiler and the CAS, and it rode in the initial bundle of every page. It now loads when search builds its exam index.
A `dns-prefetch` for `i.ytimg.com` was also added; course covers are YouTube frames. No preconnect is held open on pages that show none.

### Already in place (verified, not redone)

- **Routes:** every route is lazy (`lazyWithRetry`), including all admin pages.
- **Heavy libraries are in their own async chunks:**
  - KaTeX: 596 KB raw
  - react-markdown: 46 KB gzip
  - xlsx: admin only, 875 KB raw
  - Firebase: 140 KB gzip, loaded after first paint
  - the trivia banks
- **Fonts:** self-hosted woff2 with a preload. There is no Google Fonts request any more, which closes the open item in the PWA-perf memo.
- **Course catalogue:** served static-first from `/catalog.json`.

### Largest remaining opportunity (not done)

- **Phosphor icons.** About 478 KB raw (roughly 60 KB gzip) of the initial vendor chunk is `@phosphor-icons/react`: 138 icons × 6 weights each, while the app uses one or two weights per icon.
  A generated single-weight icon module would cut most of it. It is a codegen task with visual-regression risk, so it is left for a dedicated pass.
- **Main CSS.** `main.css` is 62.6 KB gzip, render-blocking.
  Splitting route CSS out of `index.css` needs a visual review of every page.
- **Write volume (fixed here, a data cost more than a speed cost).** The lesson page wrote the Firestore progress doc (a read plus a write) every second of video playback.
  It now writes at most every 30 s of playback, plus once when the 90% mark is crossed.

## 2. No unbounded waits (§4, PRE-04)

| Where | Was | Now |
| --- | --- | --- |
| Web "/" for a signed-in learner | Spinner forever if the Firebase chunk failed or hung (offline PWA, stale chunk) | `setAuthConfirmed` on import failure, plus an 8 s ceiling (`src/index.tsx`) |
| Web React Query | `networkMode: 'online'` paused offline queries in `isPending`, so the exam hub, history, study plan and streak skeletons spun with no message | `offlineFirst`, and no retries while offline: the query runs once, then hits the screen's error or offline state with Réessayer. `refetchOnReconnect` refreshes visible data (`src/utils/queryDefaults.ts`) |
| Web progress and mastery hooks | `loading: true` forever on a rejected import or read | End in `failed` (Réessayer) |
| Web comments | Spinner forever if subscribing threw | Empty list |
| Phone exam catalogue and exam files | RN `fetch` has no read timeout ("lie-fi" hang) | 15 s ceiling (`shared/fetchWithTimeout.ts`), which leads to the existing error state |
| Phone launch | Silent Firebase Auth meant the loading screen stayed until auth answered | 8 s ceiling, then the app renders from the persisted store |
| Phone first frame | Waited for the whole persisted query cache | Waits at most 2.5 s. A late hydration never overwrites fresher data |

## 3. Offline and reconnection (§5)

There is one wording for both apps: `shared/syncStatus.ts`, used by `src/components/NetworkStatus.tsx` and `mobile/src/components/NetworkStatus.tsx`.

| State | French copy |
| --- | --- |
| Offline | "Hors ligne — le contenu enregistré reste disponible" |
| Offline with queued writes | Adds "· N actions en attente d'envoi". The count is the signed-in account's outbox only (`shared/outbox` `pendingCount` / `subscribe`) |
| Back online | "Connexion rétablie · envoi de N actions…" while the queue drains |
| Queue drained | "Tout est synchronisé ✓", **only** once the outbox is empty. The outbox removes an operation only on a server ack |
| Nothing was queued | "Connexion rétablie · mise à jour" |

- The web used to say "Synchronisé ✓" on the browser's `online` event, before anything had been sent.
- The banner is bounded: it hides 3 s after the queue empties, and after 12 s at most if a write keeps being refused. That write stays queued.
- A queue left by an earlier session is now also replayed on the web `online` event, not only at sign-in.
- The banner's outbox instance (`src/services/outboxStore.ts`) has no Firebase import, so the banner adds nothing to the initial bundle.
- Tests: `src/components/__tests__/NetworkStatus.test.tsx`, which also covers the query defaults, `fetchWithTimeout` and outbox notifications.

## 4. Continuity

| Journey | Change | Tests |
| --- | --- | --- |
| Phone: reopen after an app kill (CON-02/10) | `mobile/src/navigation/learningContinuity.ts` saves the focused learning tab and its stack: allowlisted screens, params rebuilt field by field, one-shot params dropped. Records are per account and expire after 7 days. **ExamTake and ExamResults are never restored**: the overview offers "Reprendre l'examen" from the draft. A course known to be gone from the catalogue stops the stack. The place is restored only into an untouched launch, so links, notifications, the competition restore and the student's own taps win. The Exams tab root is chosen by grade at restore time | `mobile/src/navigation/__tests__/learningContinuity.test.ts` |
| Web: Back/Forward scroll (CON-10) | `ScrollToTop` saves scroll per history entry (sessionStorage) and restores it on POP. It retries while lazy data lands (≤2.5 s) and gives up when the student scrolls. New pages start at the top, reloads and shared links never restore, and filter changes do not jump | `src/components/__tests__/ScrollToTop.test.tsx` |
| Lesson video (CON-02) | **Web:** falls back to the progress doc's position from another device. **Phone:** positions saved through a YouTube widget-protocol bridge in the player shell, restored with `start=`, and the facade reads "Reprendre à m:ss". Same thresholds as the web (≥15 s, <95%) | `src/utils/__tests__/videoPositions.test.ts`, `mobile/src/utils/__tests__/videoPositions.test.ts` |
| Sandra on the web (CON-04) | The transcript and the half-typed question survive a reload. They are bound to the account and conversation id, main chat only (an Explique-moi thread is not restored half-grounded) | `src/components/SandraWidget/__tests__/sandraTranscript.test.ts` |
| Wording | "Reprendre" for resuming saved state on both platforms (exam landing and overview, next-step exam card, course overview). "Continuer" stays for moving on to the next lesson and for dismissing a leave dialog | existing component tests |
| Pending intent through sign-in (CON-01) | Verified, unchanged:<br>• **Web:** the auth sheet never navigates (the page and form stay mounted), and a signed-out `/dashboard` goes through `/?next=` with `safeInternalPath`.<br>• **Phone:** sign-in and onboarding are modals over the stack; cold links replay after auth readiness (`initialLink`), and invitations are held by the onboarding coordinator | existing `returnPath`, `HomeRoute`, `initialLink` tests |

Already server-side and cross-device before this pass: exam drafts (`users/{uid}/examAttempts`) and the Home "Reprendre" fallback to `progress/{courseId}.lastAccessedAt`.

## 5. Responsive audit (web, limited scope)

- **Setup:** production build served locally, signed out. Playwright at 390×844 and 1280×800.
- **Routes:**
  - `/`
  - `/courses`
  - `/courses/chem-ns1`
  - `/exams`
  - the exam overview, `/take` and `/results`
  - `/arena`
  - `/tournois`
  - `/profile`
- **Check:** document `scrollWidth` against the viewport, plus every element whose box crosses the viewport edge without a clipping ancestor.
- **Result:** no horizontal overflow on any route at either width. The only element outside the viewport is the intentional off-screen skip link. No fixes were needed.
- Screenshots are kept in the session scratchpad (`p1-responsive/`), not committed.

## 6. Still needs real devices and networks

- **The §8 profile itself:**
  - cold-visit time to usable content at 1.5/0.5 Mb/s and 300 ms
  - installed-app startup on a lower-end Android
  - input latency and layout shift
  - 30-run percentiles

  None of these were measured here.
- **The phone video bridge.** YouTube's widget `postMessage` protocol inside the WebView shell needs to be confirmed on iOS and Android builds: positions saved, then `start=` honoured. If YouTube stops answering, playback still works and simply starts at 0.
- **Nav-state restore after a real kill** on both tab implementations: the iOS native tabs and the JS tabs.
- **A real disconnect and reconnect** with queued writes, on both platforms: banner count, drain, and "Tout est synchronisé".
- **The remaining responsive widths** were out of scope this pass: 360, 768, 1024 and 1920, signed-in states, long French and Creole text, math, and 200% zoom.

## 7. Follow-ups (not done)

- Web chapter test draft: the phone has one (`mobile/src/utils/chapterTestDraft.ts`); the web `UnitQuiz` does not.
- Mid-session resume for practice quizzes. Both apps say honestly that the quiz will not resume.
- Phone: write the video position to the progress doc so the phone also feeds cross-device resume.
- Phosphor single-weight icons, and CSS splitting (§1).
- Remove the dead `src/pages/Dashboard.tsx` and the unreachable signed-out `ResumeBanner`.
