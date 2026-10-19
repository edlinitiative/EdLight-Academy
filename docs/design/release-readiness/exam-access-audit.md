# Exam access audit (TestFlight build 63, 2026-10-19)

Owner feedback (build 63, profile class NS I): "can you fix this page — also i
don't see the exam page. can you audit", and on the onboarding "Ta classe"
screen: "size formatting and all look weird".

## 1. Why an NS I student never saw the Exams page

The mobile bottom bar's 3rd tab was adaptive. `gradeProfile(grade).primaryTab`
(shared/trackConfig.ts) is `'Quiz'` for 7e, 8e, NS1, NS2 and NS3, and both tab
bars (`mobile/src/navigation/NativeTabNavigator.tsx` on iOS,
`TabNavigator.tsx`'s JS bar on Android / Expo Go) mounted **QuizNavigator**
behind the route named `Exams` for those grades. QuizNavigator had no
`ExamLanding` route at all, so the Exams landing (level switch, subjects,
recent papers, "Mes résultats", offline packs) could not be reached from the
tab, from Home or from Profile. Deep links still reached individual papers
because QuizNavigator also registered ExamOverview/Take/Results/History, but
there was no way to browse.

### Exam content per level (public/exam_catalog.json, 530 papers)

| Catalog level | Papers | Subjects (papers) | Years |
|---|---|---|---|
| `baccalaureat` (Bac, NS IV) | 470 | Maths 67, Physique 61, SVT 53, Philo 49, Chimie 48, Histoire-Géo 44, Espagnol 36, Économie 33, Kreyòl 31, Anglais 22, Art & Musique 20, Informatique 5, Français 1 | 2001 to modèles |
| `universite` (Après le Bac) | 38 | Maths 13, Philo 7, Santé 5, Culture générale 4, Anglais 2, Français 2, others 1 each | 1998 to modèles |
| `9eme_af` (9ᵉ AF) | 22 | Anglais 12, Espagnol 7, Maths 1, Art & Musique 1, Kreyòl 1 | 2010 to 2025 |
| NS I, NS II, NS III, 7ᵉ, 8ᵉ | **0** | no national paper exists for these classes | |

What the evidence shows: no paper belongs to 7ᵉ–8ᵉ or NS I–III, so hiding the
landing was an understandable call. It still left those students no way to see
the papers they are working toward (the Bac for NS I–III, the 9ᵉ AF for
7ᵉ–8ᵉ), their exam history, or offline packs. The web never hid it: `/exams`
is in the web nav for every grade, and off-level grades get a note
(`src/pages/ExamLanding.tsx`, `offLevel`).

### Decision

- The 3rd tab is **"Examens" → ExamsNavigator → ExamLanding for every grade**,
  on both bars. QuizNavigator is deleted.
- Quick practice stays one tap away. `Quizzes` (QuizzesScreen) is now a route
  inside ExamsNavigator, and ExamLanding has a "Quiz rapides" row card. For
  off-level grades the card comes first, under the title, and says why ("Pas
  encore d'examen national en NS I : entraîne-toi par chapitre."). For other
  grades it comes after "Sujets récents". It is a single content row, not a
  band (see the no-hero-bands rule). The mobile landing never had a "Ma
  préparation" hero, so there was nothing to demote. Quizzes are still
  reachable from Cours (CoursesScreen → `Quizzes`) and from lessons.
- **Opening level** comes from a new shared helper, `examLandingLevel(grade)`
  (shared/trackConfig.ts): the student's own paper if there is one, otherwise
  the next one they will sit. `gradeProfile().examLevel` is unchanged (still
  `null` below 9ᵉ), so Home, readiness and countdown still play exams down for
  those grades. The other levels stay one tap away on the level switch.
- Home/Profile "practice" entry points (SmartSuggestion review card,
  NextStepCard "S'entraîner", Profile XP card) go through a new
  `openPractice(navigation, grade)` helper (navHelpers.ts). For quiz-primary
  grades it opens the Exams tab as `[ExamLanding, Quizzes]`, so the student
  still lands on practice and Back goes to the exam landing. Everyone else
  gets `[ExamLanding]`.

### What each grade sees, before and after

| Grade | Before: 3rd tab | After: 3rd tab | Landing opens on | Practice |
|---|---|---|---|---|
| 7ᵉ, 8ᵉ | "Quiz" → QuizzesScreen; no exam landing | "Examens" → ExamLanding | 9ᵉ AF (22 papers) | "Quiz rapides" card first; Home/Profile practice cards open Quizzes over the landing |
| 9ᵉ | "Examens" → ExamLanding | unchanged | 9ᵉ AF | card after "Sujets récents" |
| NS I, NS II, NS III | "Quiz" → QuizzesScreen; no exam landing | "Examens" → ExamLanding | Bac (470 papers) | "Quiz rapides" card first; Home/Profile practice cards open Quizzes over the landing |
| NS IV | "Examens" → ExamLanding | unchanged | Bac + filière chips | card after "Sujets récents" |
| Après le Bac | "Examens" → ExamLanding | unchanged | Université | card after "Sujets récents" |
| No class chosen | "Examens" → ExamLanding | unchanged | Bac (the switch default) | card after "Sujets récents" |

The NavTour step for tab 3 is now always "Examens". Quiz-primary grades get
copy that mentions the quick quizzes.

### Deep links (all kept working)

| Entry point | Target | Status |
|---|---|---|
| planTaskNav (study-plan exam task) | `Exams › ExamOverview`, `initial:false` | lands on the paper with ExamLanding underneath (previously Quizzes underneath for 7e–NS3) |
| planTaskNav (practice task) | `Courses › Quizzes` | unchanged |
| Sandra `/exams/...` links (AppNavigator) | ExamHistory / ExamOverview / ExamBrowser, `initial:false` | unchanged; comment updated |
| Search exam result | `Exams › ExamOverview` | unchanged |
| `examStackRoot()` (ExamBrowser/Results/History resets) | always `ExamLanding` now | simplified; call sites unchanged |
| Learning-place restore (learningContinuity) | `examsRoot` is always `ExamLanding` | records saved by older builds with a Quizzes root restore onto ExamLanding (roots are not stored) |
| QuizzesScreen "Hors ligne" | `Exams › OfflinePacks` | unchanged |
| Tab press on Examens | pops to ExamLanding | same for every grade |

### Web

`/exams` is in BottomNav and Navbar for every grade, so no access gap exists on
the web. Two small parity changes: the landing now opens off-level grades on
`examLandingLevel()` (7ᵉ–8ᵉ → 9ᵉ AF instead of Bac), and the off-level note's
button is "Quiz rapides" (`/quizzes`) instead of "Mes cours", matching the app.

## 2. Onboarding "Ta classe"

The owner's screenshots show the **old** layout: 44pt numerals ("NS I") in
tall cards, uneven heights, "Fondamenta / l" broken mid-word under three narrow
tiles, and the wordmark under the status bar. The merged fix (safe-area insets
and one "Fondamental" label) was in the code, but first launch after an
install runs the build's embedded bundle (see section 3).

Even the merged layout was still unbalanced: titles at 26pt in 116pt cards,
84pt 3-up tiles, a different tile shape per row, and about 1.3 screens of
scrolling. The new layout (`mobile/src/components/WelcomeGradeModal.tsx`):

- One tile shape for every choice: `minHeight 60`, radius 16, centred label,
  title at 19pt (`numberOfLines=1`, `adjustsFontSizeToFit`, `minimumFontScale
  0.6`, `maxFontSizeMultiplier 1.3`). A word can no longer break across lines,
  and large text shrinks the label instead of overflowing.
- Selection is the filled `azureFill` ground with a white label, replacing the
  28pt check disc. This gives a 4-up row of tiles about 80pt wide its whole
  width for the label.
- Language: 2-up "Kreyòl" / "Français" with one short caption each.
- Classes: "Nouveau secondaire" label, then a 4-up row NS I–IV; "Fondamental"
  label, then a 3-up row 7e–9e; then "Après le Bac · Préfac et concours" at
  full width. Each group label appears once per row.
- Wordmark at 20pt, page title at 28pt, section spacing tightened (24/10).
- Estimated height on a 6.1" phone (393×852pt): about 550pt of content plus
  about 104pt for the pinned button, inside the 852pt minus about 93pt of
  insets. Every class fits without scrolling at default text size.
- All targets are at least 60pt tall (the 44pt minimum is exceeded).

The other first-run screens were checked. AuthScreen already uses the
safe-area insets and a 28pt title, with no oversized display text. The mission
sheet (step 2/2) is a centred card with no fixed heights. Neither needed
changes.

## 3. expo-updates on first launch

`mobile/app.json`: `runtimeVersion "1.2.0"`, `updates.url` set,
`fallbackToCacheTimeout: 0`. `checkAutomatically` is not set, so it defaults
to `ON_LOAD`. No JS code calls `Updates.checkForUpdateAsync`.

With timeout 0, a cold start never waits for the network. It launches the
newest bundle already on disk and downloads any new update in the background,
which applies on the *next* cold start. The very first launch after a store or
TestFlight install therefore always runs the embedded bundle. That is why the
owner saw the pre-fix onboarding on build 63.

**Recommendation: keep `fallbackToCacheTimeout: 0`.** A non-zero value (for
example 3000 ms) would make every cold start wait for the update server for up
to that long before the splash clears. On the slow and metered connections
most students use, that cost lands on every launch, not just the first. It
also does not reliably help a first launch: a full update download rarely
finishes in 3 s on those networks, and the app then falls back to the
embedded bundle anyway. What works instead:

1. **Embed a fresh bundle in every store build.** `eas build` bundles the JS
   at build time, so cutting the build after the fix merges makes the first
   launch correct. Build 63 predated the merge.
2. Optional, if first-launch freshness matters later: a JS-side check limited
   to the embedded first launch. When `Updates.isEmbeddedLaunch` is true and
   onboarding has not finished, call `checkForUpdateAsync()`, then
   `fetchUpdateAsync()` and `reloadAsync()` within a ~4 s budget, before the
   welcome page. This only affects that one launch.

Either way, `fallbackToCacheTimeout` and `checkAutomatically` are **native
config**. They are baked into the binary, so changing them only takes effect
in a new store build, never through an OTA. Option 2 is JS, but it also only
helps installs of a build whose embedded bundle already contains it. No config
change was made.

## Verification

- `mobile/src/navigation/__tests__/examTabRouting.test.tsx`: for every grade
  (7e…POSTBAC and no grade), both bars mount ExamsTab labelled Examens.
  ExamsNavigator's routes are checked, including `Quizzes`. Also covered:
  `examStackRoot`, study-plan exam deep link, `openPractice` per grade,
  `resetTabToStack` on a never-visited tab, and `examLandingLevel` per grade
  (with `examLevel` unchanged).
- `mobile/src/components/__tests__/welcomeGradeLayout.test.tsx` (FR and HT):
  2 language tiles and 8 classes; one tile shape (minHeight 60); one-line
  shrink-to-fit titles at 20pt or less, capped at 1.3× large text; no
  per-tile captions in the 3-up/4-up rows; group labels shown once;
  preselection and tap selection.
- Not device-verified: the sim/TestFlight check of the new onboarding and the
  Exams tab for an NS I profile is still to do on the next build.
