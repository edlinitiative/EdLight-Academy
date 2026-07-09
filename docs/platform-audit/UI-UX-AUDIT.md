# UI/UX Audit — EdLight Academy

**Audit date:** 2026-06-26

---

## Design System Overview

The app uses a custom CSS design system (no Tailwind, no component library) defined primarily in:
- `src/index.css` — design tokens (CSS custom properties), global resets, base components
- `src/mobile-first.css` — mobile layout utilities
- `src/mobile-fixes.css` — targeted mobile overrides
- `src/mobile-premium.css` — polished mobile enhancements
- Per-page `.css` files (Dashboard.css, Home.css, Profile.css, etc.)

The system defines CSS variables for colors, spacing, border-radius, shadows, and typography. Overall, the system is well-structured for a custom build.

---

## Page-by-Page UX Review

### Homepage (`/`)

**Status: ✅ Good**

- Hero section is clear and well-structured
- Section flow: Hero → ResumeBanner → Pillars → Courses → Experience → Testimonials → CTA
- `ResumeBanner` is well-placed — returns logged-in users to their last activity
- Language switching is globally available via the Navbar
- **Issue (P3):** Testimonials section uses static/hardcoded testimonial data. If this is real student feedback, it should clearly state that; if sample data, it should be replaced.
- **Issue (P3):** Hero CTA buttons should have consistent `aria-label` attributes

### Dashboard (`/dashboard`)

**Status: ✅ Good with minor issues**

- Skeleton loading states are present and polished
- Error state with retry button present
- Four KPI cards (active courses, quizzes done, avg score, streak) are clear
- Course progress cards show % complete and remaining lessons — excellent UX
- Quiz and Exam recent activity side by side — good information density
- Leaderboard (compact) in sidebar is engaging
- **Issue (P2):** Dashboard is accessible to unauthenticated users — they see the layout with empty/zero data rather than a sign-in prompt. The Profile page does this correctly (shows guest state). Dashboard should match that pattern.
- **Issue (P2):** `subjectCode()` function falls back to `'PHYS'` for any unrecognized subject — could cause wrong subject badge color on courses

### Exam Pages (`/exams/*`)

**Status: ✅ Strong — core product**

- ExamLanding: clear overview of exam levels
- ExamBrowser: filterable grid of exams per level — clean
- ExamTake:
  - Three view states: preview, cover (legacy), active
  - Progress ring in sidebar is a nice visual touch
  - Section navigation by question number
  - Timer with warning state at < 5 minutes
  - Math rendering with KaTeX works correctly
  - Scaffold (step-by-step) inputs are intuitive
  - **Issue (P2):** Feedback mode selector (`exam-cover__feedback-mode`) duplicates its entire JSX block between `viewState === 'cover'` and `viewState === 'preview'`. Should be extracted into a component.
  - **Issue (P2):** "Commencer l'examen" button in preview re-starts the timer even if a draft exists, because the resume flow only checks the initial `autostart` flag.
  - **Issue (P3):** The `viewState === 'cover'` branch (lines 999–1161) is dead — `viewState` is initialized to `'preview'` and the cover-to-preview transition button (`setViewState('preview')`) exists in the cover but the cover is never shown in the current flow. This dead code should be removed.
- ExamResults:
  - Per-question grading breakdown is clear
  - Mastery bars by section are informative
  - "Review Session" component for drill-down is excellent
  - **Issue (P2):** Results rely on `sessionStorage.getItem(`exam-result-${examKey}`)` — if the user refreshes the results page directly or shares the URL, the result is lost (shows loading). Should always fall back to Firestore.

### Admin (`/admin`)

**Status: ⚠️ Functional but rough**

- The bulk data management UI is utilitarian but functional
- `DataTable` overflows horizontally — `overflowX: 'auto'` is applied but the wrapping container may not constrain width on mobile
- Modal form for editing uses an `<div className="modal modal--active">` pattern — accessibility needs review
- Many `console.log` / `console.error` statements throughout
- **Issue (P2):** The "🧹 Clear quiz database" button is styled with `button--danger` but there is no `button--danger` class in the design system — it falls back to default button styles, losing the visual warning
- **Issue (P2):** The sync status messages auto-dismiss via `setTimeout` — if the user walks away during a long sync they may miss the error
- **Issue (P3):** The "Quick Actions" section uses `<a href="/admin/courses">` instead of React Router `<Link to="/admin/courses">`, causing full page reloads

### Profile (`/profile`)

**Status: ✅ Good**

- Guest view correctly prompts sign-in
- Shows ReadinessCard, ProgressDashboard, Leaderboard, XP/level, streak
- Settings (theme, language, track) co-located — good for discoverability on mobile
- **Issue (P3):** "Sign Out" button text is in English while the rest of the page is in French/Creole

### Auth Modal

**Status: ✅ Good**

- Sign-in / sign-up tabs, Google button, email/password form, forgot password
- Focus trap via `useFocusTrap` hook — correct
- Swipe-to-dismiss on mobile — nice UX
- Body scroll lock while modal is open
- Error messages have `role="alert"` — accessible
- **Issue (P3):** The modal close button is just `×` with `aria-label={t('auth.close')}` — verify the i18n key exists

---

## Global UX Issues

| ID | Severity | Issue |
|---|---|---|
| UX-01 | P2 | Dashboard shown to unauthenticated users with empty data rather than a helpful prompt |
| UX-02 | P2 | Browser back navigation during an active exam has no "Leave exam?" confirmation dialog |
| UX-03 | P2 | ExamResults page loses data if user shares the URL or opens in a new tab (sessionStorage not shared) |
| UX-04 | P2 | `viewState === 'cover'` in ExamTake is dead code — confusing to maintain |
| UX-05 | P2 | `button--danger` CSS class is referenced in Admin but not defined in the design system |
| UX-06 | P3 | "Sign Out" text is in English in the Profile page (inconsistent language) |
| UX-07 | P3 | `<a href="/admin/...">` hard-reload links in Admin should be React Router `<Link>` |
| UX-08 | P3 | Admin sync status auto-dismiss may hide errors the user needs to see |
| UX-09 | P3 | Hardcoded testimonials on homepage may undermine credibility if not real |
| UX-10 | P3 | `AuthCallback.tsx` page is registered in src but not in the router |

---

## Loading & Empty States

| Page | Loading State | Error State | Empty State |
|---|---|---|---|
| Dashboard | ✅ Skeleton | ✅ With retry | ✅ "No courses" CTA |
| Courses | ✅ | ✅ | ✅ |
| CourseDetail | ✅ | ✅ | N/A |
| ExamLanding | ✅ | ✅ | N/A |
| ExamBrowser | ✅ | ✅ | ✅ |
| ExamTake | ✅ Spinner | ✅ "Not found" | N/A |
| ExamResults | ✅ Spinner | ⚠️ Falls back to "Not found" instead of loading from Firestore | N/A |
| Profile | ✅ | ✅ | ✅ Guest view |
| Admin | ⚠️ No loading indicator during Firestore load | ✅ Status message | ✅ "No data loaded" |

---

## Design Consistency Checklist

| Element | Status | Notes |
|---|---|---|
| Button styles | ✅ | `button--primary`, `button--ghost`, `button--secondary` used consistently |
| Card styles | ✅ | `.card`, `.card--compact` used consistently |
| Form styles | ✅ | `.form-field`, `.form-label`, `.form-input`, `.form-message` consistent |
| Typography scale | ✅ | CSS custom properties used throughout |
| Color tokens | ✅ | `--color-primary`, `--color-text`, `--color-bg-*` tokens consistent |
| Icon library | ✅ | Lucide React exclusively |
| Border-radius | ✅ | Tokenized |
| `button--danger` | ❌ | Referenced in Admin but not defined — falls back to default |
| Loading spinner | ✅ | `.loading-spinner` class used globally |
| Modal pattern | ✅ | `.modal`, `.modal--active`, `.modal__content` consistent |
