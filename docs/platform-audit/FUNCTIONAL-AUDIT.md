# Functional Audit — EdLight Academy

**Audit date:** 2026-06-26

---

## Authentication

| Flow | Status | Notes |
|---|---|---|
| Email/password sign-up | ✅ | Firebase Auth, creates Firestore user doc |
| Email/password sign-in | ✅ | Correct error mapping to localized messages |
| Google sign-in | ✅ | Popup-based; cancelled-popup silently ignored (correct) |
| Password reset | ✅ | Sends Firebase reset email |
| Sign-out | ✅ | Clears Zustand store |
| Session persistence | ⚠️ | `isAuthenticated` persists to localStorage; stale after token expiry (see SEC-P1-3) |
| Email verification | ❌ | `user.emailVerified` never checked; unverified users have full access |
| Protected route redirect | ⚠️ | `AdminRoute` redirects to `/` (not `/login`); other protected pages show empty/guest state rather than redirecting |
| Registration duplicate | ✅ | Firebase returns `auth/email-already-in-use`; shown as user-friendly message |

---

## Student Experience

### Course Discovery & Enrollment

| Flow | Status | Notes |
|---|---|---|
| Browse course catalog | ✅ | Fetches from Firestore `courses` collection |
| Free video preview (3 videos) | ✅ | Tracked via `freeVideoIds` in localStorage |
| Enrollment (click to enroll) | ✅ | Adds course to `enrolledCourses` in Zustand |
| Resume learning | ✅ | `ResumeBanner` + `lastActivity` in store |
| Progress tracking per lesson | ✅ | Firestore `users/{uid}/progress/{courseId}` |

### Quiz Experience

| Flow | Status | Notes |
|---|---|---|
| Browse quizzes by subject | ✅ | — |
| Multiple-choice questions | ✅ | — |
| Math question rendering | ✅ | KaTeX via `dangerouslySetInnerHTML` (unavoidable for KaTeX) |
| Submit answers | ✅ | — |
| View results + explanations | ✅ | — |
| Retry quiz | ✅ | — |
| Quiz attempts persist | ✅ | Firestore + localStorage fallback |

### Exam Experience

| Flow | Status | Notes |
|---|---|---|
| Browse exams by level | ✅ | `terminale`, `9e`, `university` |
| Exam preview (read-only) | ✅ | — |
| Start exam with timer | ✅ | Countdown timer, auto-submits at 0 |
| Multiple choice | ✅ | — |
| Fill-in-blank | ✅ | Inline blank inputs within question text |
| Essay (free text) | ✅ | AI graded via `/api/grade-essay` |
| Scaffold (step-by-step math) | ✅ | AI graded via `/api/grade-scaffold` |
| Matching questions | ✅ | — |
| Save draft (resume later) | ✅ | Firestore `users/{uid}/examAttempts/{examId}` |
| Resume exam prompt | ✅ | Shown on page load if draft exists |
| Submit exam | ✅ | Grades, persists to Firestore, navigates to results |
| Exam results page | ✅ | Per-question breakdown, mastery bars, review session |
| Exam results persist (cross-device) | ✅ | Firestore `users/{uid}/examResults/{examId}` |
| Immediate feedback mode | ✅ | Grade each question inline |
| End-of-exam feedback mode | ✅ | Default; shows all results after submit |
| Keyboard navigation (←/→) | ✅ | Arrow keys move between question groups |
| Track-specific directives | ✅ | Shown when user has selected a Bac track |

**Known gaps:**
- Essay results stored in `sessionStorage` — lost if tab is closed before exam is saved (only logged-in users get Firestore persistence)
- Exam timer resets on hard refresh even with a saved draft (timer state not persisted to Firestore)

### Dashboard

| Widget | Status | Notes |
|---|---|---|
| Course progress cards | ✅ | Shows % complete, lessons remaining |
| Quiz recent activity | ✅ | Firestore + localStorage fallback |
| Exam recent activity | ✅ | Shows submitted/in-progress |
| KPI strip (courses, quizzes, avg score, streak) | ✅ | — |
| Readiness card | ✅ | `ReadinessCard` component |
| Leaderboard (compact) | ✅ | Weekly XP board |
| Study plan CTA | ✅ | — |
| Skeleton loading state | ✅ | — |
| Error state with retry | ✅ | — |
| Empty state (no courses) | ✅ | Shows CTA to browse catalog |

### Study Plan

| Flow | Status | Notes |
|---|---|---|
| Generate plan (AI) | ✅ | Calls `/api/generate-plan` |
| View plan tasks | ✅ | SRS-based schedule |
| Mark task complete via exam | ✅ | Updates on exam submit |
| Plan persists | ✅ | Firestore `users/{uid}/studyPlans/{planId}` |

---

## Admin Experience

| Feature | Status | Notes |
|---|---|---|
| Admin login (role check) | ✅ | `AdminRoute` reads Firestore role |
| Dashboard quick actions | ✅ | Links to Course Manager, Answer Verification |
| Load videos from Firestore | ✅ | — |
| Load quizzes from Firestore | ✅ | — |
| Load users (from GitHub CSV via API) | 🔴 | **API has no auth — anyone can load** |
| Upload CSV/XLSX file | ✅ | Client-side parse, then sync to Firestore |
| Edit record inline | ✅ | Modal form |
| Save to Firestore | ✅ | — |
| Clear quiz database with backup | ✅ | Exports CSV then deletes |
| Download CSV | ✅ | Client-side Blob download |
| Delete confirmation | ⚠️ | Uses `window.confirm()` — not accessible |
| Course Manager | ✅ | Full course structure editor |
| Answer Verification | ✅ | Exam answer review tool |

---

## Public Marketing Pages

| Page | Status | Notes |
|---|---|---|
| Homepage (/) | ✅ | Hero, pillars, courses, experience, testimonials, CTA |
| About | ✅ | — |
| Contact | ✅ | Form present; verify submission handling |
| FAQ | ✅ | — |
| Help | ✅ | — |
| Privacy | ✅ | — |
| Terms | ✅ | — |
| 404 Not Found | ✅ | — |

---

## Edge Cases

| Scenario | Status | Notes |
|---|---|---|
| Refreshing during exam | ✅ | Draft is auto-saved to Firestore; resume prompt shown |
| Browser back during exam | ⚠️ | No confirmation dialog before leaving |
| Session expiry during exam | ⚠️ | Draft may not save (requires login) |
| Exam with 0 questions | ⚠️ | `flattenQuestions` returns `[]`; no questions shown but no error shown |
| Exam with malformed JSON in answers | ✅ | `isAnswerFilled` safely catches JSON parse errors |
| AI grading fails (network error) | ✅ | Falls back to "manual review" message |
| Firestore offline | ✅ | Firebase SDK has built-in offline persistence |
| Empty course catalog | ✅ | Empty state handled in Dashboard and Courses |
| Very long question text | ⚠️ | No max-length truncation; may overflow mobile layout |
| Multiple tabs open | ⚠️ | Two exam sessions would write conflicting drafts to Firestore (last write wins) |

---

## Notifications

| Feature | Status | Notes |
|---|---|---|
| Push notification subscription | ✅ | VAPID-based |
| Study reminders | ✅ | Cron job at `/api/send-reminders` every 15 min |
| In-app notification center | ✅ | `NotificationCenter` component |
| Broadcast (admin) | ✅ | Requires `CRON_SECRET` |

---

## Gamification / Trivia

| Feature | Status | Notes |
|---|---|---|
| Daily trivia challenge | ✅ | `useDailyChallenge` |
| XP system | ⚠️ | Client-reported — see SEC-P1-4 |
| Streak system | ✅ | `streakService` + Firestore |
| Leaderboard | ⚠️ | Scores can be manipulated — see SEC-P1-4 |
| Level badges | ✅ | Computed from XP |
| Flashcard deck | ✅ | — |

---

## Identified Broken / Missing Features

| Feature | Severity | Notes |
|---|---|---|
| `AuthCallback.tsx` page is never routed | P3 | Dead code — remove or register |
| Email verification not enforced | P2 | Unverified users have full access |
| Browser back navigation during exam has no confirmation | P2 | Progress may be lost for guests |
| Timer state not persisted (resets on hard refresh) | P2 | Inconsistency with draft system |
| Contact form submission not verified working end-to-end | P2 | Needs manual test |
| Leaderboard XP manipulation | P1 | Client-reported scores |
