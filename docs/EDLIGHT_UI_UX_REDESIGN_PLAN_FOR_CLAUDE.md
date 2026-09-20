# EdLight Academy — application-wide UI/UX redesign plan

Date: September 19, 2026  
Audience: Claude Code and the EdLight Academy product owner

## 1. Brief and authorization

The owner is dissatisfied with EdLight Academy's overall UI/UX, not only the tournament. The requested outcome is a coherent, polished mobile education product with clearer navigation, useful progress, and less friction.

**Redesign around the student's next action, not the application's inventory of features.** This requires changes to information architecture, screen composition, interactions, and visual hierarchy—not merely new colors and rounded corners.

This document is a proposed change plan. The current request authorizes creating the plan; it does not authorize implementing it or deploying changes. When the owner instructs Claude to implement, use this as the brief and confirm any unresolved high-impact product decisions within that scope.

Companion documents:

- [Arena technical audit and implementation handoff](ARENA_TOURNAMENT_AUDIT_AND_IMPLEMENTATION_HANDOFF.md)
- [Arena visual design handoff](ARENA_VISUAL_DESIGN_HANDOFF.md)

The app-wide plan governs shared navigation, learning journeys, and visual consistency. The Arena documents govern tournament specifics, security, and broadcast design. Do not duplicate or contradict their rules.

## 2. Evidence and limitations

Direct visual inspection covered the public web homepage, games hub, and spectator broadcast, including phone-width layouts. Relevant native components and navigation were inspected in source. The installed native build failed to load its JavaScript during the earlier audit, so a complete native visual review remains necessary.

The main design diagnosis is a fragmented presentation: courses, exams, games, rankings, and Arena compete for attention without a strong student-centered hierarchy. Repeated large cards make secondary content disproportionately prominent. Important progression and recovery states need clearer communication.

Treat this as a supported redesign direction, not a claim that every screen has been visually audited. Before implementation, run the current mobile application and inspect complete journeys. Record observed failures separately from proposed improvements.

Recent code may have changed since the Arena audit. Inspect current git status, history, and existing work before editing. Do not overwrite another agent's changes or assume the audit's commit remains current.

## 3. Outcomes and non-goals

### Desired outcomes

- A student immediately understands what to do next.
- Learning, practice, and competition have distinct purposes and predictable destinations.
- Continuing a lesson or reviewing a weakness is easier than browsing the entire catalog.
- Progress explains learning, not merely accumulated XP.
- Timed tasks are focused and dependable.
- Identity, school, language, grade, and settings are easy to find and reuse.
- Web and mobile share recognizable product logic and branding without mechanically copying layouts.
- French and Haitian Creole, poor connectivity, smaller devices, and accessibility are first-class concerns.

### Non-goals

- Rewriting Firebase, authentication, the learning engine, or the app framework for appearance alone.
- Replacing useful educational content as part of a visual refresh.
- Adding decorative animations, a new font family, or a UI library without a demonstrated benefit.
- Turning all learning screens into a dark esports interface.
- Treating practice XP as evidence of exam readiness or tournament prize eligibility.
- Deleting existing capabilities because they no longer fit the first screen.
- Inventing mastery, attendance, streaks, recommendations, or student activity to make screens look populated.

## 4. Product principles

1. **One primary task per screen.** Secondary functions remain available without equal visual weight.
2. **Action before summary.** Home should offer a useful next step before statistics.
3. **Progress must be actionable.** Explain what improved, what needs review, and what to do next.
4. **States must be truthful.** Loading, cached, offline, accepted, failed, and complete are different states.
5. **Learning is calm; competition is focused.** Share a brand while adapting composition to purpose.
6. **Continuity matters.** Returning students should recover their position and unfinished work.
7. **Identity is reusable.** Avoid repeatedly asking for school, grade, or language when already known.
8. **Polish is consistency.** Typography, spacing, interaction, errors, and navigation must agree across the product.

## 5. Proposed information architecture

Explore four primary mobile destinations:

| Destination | Student goal | Included capabilities |
|---|---|---|
| Home | What should I do now? | Continue, daily priorities, relevant progress, important event announcements |
| Learn | Understand a subject | Subjects, courses, lessons, lesson-linked practice |
| Practice | Test and strengthen knowledge | Quizzes, exam preparation, full exams, mistakes, targeted review |
| Compete | Play and compare performance | Daily games, monthly championship, weekly rankings, school competition |

These are working English names, not approved localized labels. Develop concise French/Kreyòl labels with the owner and validate that students understand them.

Profile/settings should be reachable from a consistent account control in ordinary screens. Keep language/theme/grade/school settings easy to locate. A move out of the tab bar must not make account management obscure.

### Preserve existing behavior deliberately

Current navigation has five routes: `Dashboard`, `Courses`, `Exams`, `Trivia`, and `Profile`. The third destination adapts between quizzes and exams according to grade. Preserve that grade-appropriate emphasis within Practice.

Both native iOS and JS/Android tab implementations exist. Update their route behavior consistently. Audit notification destinations, deep links, back behavior, tab reselect, focus-mode hiding, and nested stacks before changing route names.

Existing navigation comments record prior owner preferences:

- Icon-only tab presentation.
- No collapsing/minimizing tab bar.
- Native iOS tab behavior where supported.

Do not silently reverse these preferences as part of a redesign. Present visible labels or a different bar treatment as an explicit design alternative if testing shows a benefit. The four-destination proposal is a candidate architecture, not permission to discard previous interaction choices.

### Navigation migration requirement

Create a route mapping from every existing destination to the new structure. Preserve legacy links and notification intents through adapters/redirects where needed. No route should become unreachable simply because its tab moved.

References: `mobile/src/navigation/TabNavigator.tsx`, `NativeTabNavigator.tsx`, `AppNavigator.tsx`, `CoursesNavigator.tsx`, `ExamsNavigator.tsx`, `QuizNavigator.tsx`, `navHelpers.ts`, notification routing in `mobile/App.tsx`, and web `src/App.tsx`/`src/components/Layout.tsx`.

## 6. Screen change plan

### 6.1 Home — a useful next step

Replace an equally weighted collection of widgets with a clear priority order:

1. Compact greeting and relevant grade/goal context.
2. One prominent Continue learning action when unfinished work exists.
3. A short daily plan with two or three achievable tasks, using existing real planning/recommendation data.
4. A compact explanation of progress or a weakness worth reviewing.
5. A timely tournament announcement when relevant.
6. Secondary subject discovery further down.

Illustrative layout:

```text
[Greeting]                         [Account]
[Grade / learning goal]

CONTINUE
[Current lesson or unfinished task]
[Resume]

TODAY
[Recommended task]
[Review task]

YOUR PROGRESS
[Specific learning progress + next action]

[Relevant championship announcement]
```

Do not show Continue if there is nothing to continue. New students should get a short grade/goal setup or a sensible subject starting point. Completed daily work should become a completion state, not leave an empty hole or repeat tasks.

Distinguish a user-created study plan from a recommendation. Do not generate a new AI plan merely to populate the redesign unless separately authorized.

References: `mobile/src/screens/DashboardScreen.tsx`, `mobile/src/components/HomeWidgets.tsx`, `ReviewCard.tsx`, `src/pages/Dashboard.tsx`, `Dashboard.css`.

### 6.2 Learn — subjects and courses that are easy to scan

- Lead with the student's grade and relevant subjects rather than the full catalog.
- Keep search and filters discoverable without occupying most of the viewport.
- Show an in-progress course first when appropriate.
- Use compact course rows with title, relevant progress, and one clear action.
- Reserve larger featured surfaces for genuinely featured content.
- Make course detail explain the learning outcome, chapter structure, and next lesson.
- Identify completed, current, and unavailable lessons clearly.
- Avoid repeated “start” actions that restart content when the student expects resume.

References: `mobile/src/screens/CoursesScreen.tsx`, `CourseDetailScreen.tsx`, `mobile/src/navigation/CoursesNavigator.tsx`, `src/pages/Courses.tsx`, `CourseDetail.tsx`, relevant styles.

### 6.3 Lesson experience — comprehension before interface

- Make lesson/video content the dominant region.
- Keep title, progress, and next action clear but visually restrained.
- Organize explanation, examples, practice, and discussion so they do not compete simultaneously.
- Place related practice at a sensible learning transition.
- Preserve video position and unfinished answers where supported; define honest recovery where not supported.
- Ask Sandra in lesson context, with a clear explanation of what context is shared.
- Keep comments/social elements secondary to learning.
- Use readable text widths, math rendering, and comfortable line spacing.

Inspect the actual lesson composition before creating a new screen: much of it may live in `CourseDetailScreen.tsx` and reusable components rather than a standalone lesson screen.

References: `mobile/src/screens/CourseDetailScreen.tsx`, `mobile/src/components/LessonPractice.tsx`, `LessonComments.tsx`, related course/video components, `src/pages/CourseDetail.tsx`.

### 6.4 Practice hub — choose by learning need

Offer clear entry points:

- Review my mistakes.
- Practice a subject or skill.
- Take a short quiz.
- Prepare for an exam or take a full mock exam where relevant to grade.

Do not present quizzes and exams as interchangeable. Communicate purpose, expected time when known, timed/untimed status, and whether results are saved.

Use existing mastery/review data to suggest practice. If insufficient evidence exists, say so or offer a subject choice; do not claim a diagnosed weakness.

References: `mobile/src/screens/QuizzesScreen.tsx`, `ExamLandingScreen.tsx`, `ExamBrowserScreen.tsx`, `StudyPlanScreen.tsx`, `mobile/src/components/ReviewSession.tsx`, `src/pages/Quizzes.tsx`, exam pages, `StudyPlan.tsx`.

### 6.5 Quiz/exam taking — focus and dependable state

- Keep question text, answers, progress, and the appropriate next/submit action dominant.
- Explain whether an answer can be changed and when it is saved.
- Provide a readable timer only when the activity is timed.
- Make question navigation and unanswered questions understandable for full exams.
- Avoid chat bubbles or global navigation covering response controls.
- Preserve unfinished work and show explicit save/recovery state where the activity supports it.
- Do not change grading or timing semantics merely to simplify the screen.
- Use question-type-specific layouts, including long text and math, rather than forcing all activities into one card.

References: `mobile/src/screens/ExamTakeScreen.tsx`, `QuizzesScreen.tsx`, `mobile/src/components/ExamAnswerInput.tsx`, `ExamSectionContext.tsx`, `src/pages/ExamTake.tsx`.

### 6.6 Results and review — explain what improved

Results should answer:

1. How did I do?
2. What did I understand or miss?
3. What is my best next action?

Use score and correctness clearly, followed by actionable review. Avoid a wall of equal-weight statistics. Show mastery/readiness only if the underlying service actually supports that conclusion.

Examples of useful, data-backed feedback:

- “You mastered 7 of 10 skills in this chapter.”
- “Review these three mistakes before your next practice.”
- “Continue with the next lesson.”

These are examples, not approved copy or permission to fabricate metrics. Define the source and meaning of each displayed number.

References: `mobile/src/screens/ExamResultsScreen.tsx`, `ExamHistoryScreen.tsx`, `mobile/src/components/quiz/QuizResultHero.tsx`, review components, `src/pages/ExamResults.tsx`, `ExamHistory.tsx`.

### 6.7 Compete — distinguish practice games from championship

Use a hierarchy rather than a tall wall of game cards:

1. Monthly championship event and phase-dependent action when relevant.
2. Daily challenge.
3. Compact game selection.
4. Clearly labeled weekly/all-time XP rankings and school race.

Monthly tournament scores must never be visually confused with practice XP. A permanent championship destination must remain accessible during live play and after results.

Follow the Arena visual handoff for registration, waiting room, question, receipt, reveal, results, and spectator compositions. Follow the technical audit before enabling prize competition.

References: `mobile/src/components/games/JeuxHub.tsx`, `mobile/src/screens/TriviaScreen.tsx`, `mobile/src/components/TournamentCard.tsx`, `ArenaAnnounceCard.tsx`, `mobile/src/screens/arena/`, `src/pages/TriviaGames.tsx`, leaderboard components.

### 6.8 Profile and onboarding — reusable identity

- Keep onboarding short: collect information needed to provide a useful first session.
- Explain why grade, language, school, or goals are requested.
- Reuse profile information across lessons, practice, and competition.
- Make school selection/search understandable and allow the established missing-school submission flow.
- Separate student residence from school location.
- Group settings into readable sections: learning preferences, identity/school, notifications, appearance/language, account/privacy.
- Do not require a student photo.
- Preserve guest learning behavior where already supported; require authentication only where necessary and explain the benefit.

References: `mobile/src/screens/AuthScreen.tsx`, `ProfileScreen.tsx`, `mobile/src/components/AuthModal.tsx`, `SchoolPicker.tsx`, profile/auth services, `src/components/Auth.tsx`, `src/pages/Profile.tsx`.

### 6.9 Sandra — contextual assistance

Sandra should be easy to reach without competing with the student's primary task.

- Prefer contextual “Ask Sandra” actions from lessons, explanations, and review.
- Retain a clear general assistant destination where appropriate.
- Audit floating-button placement on small screens; it must not obscure content, navigation, or answer controls.
- Distinguish help with understanding from exam/tournament restrictions.
- Do not introduce assistant access into protected competition simply to maintain global UI consistency.

References: `mobile/src/components/SandraFab.tsx`, `mobile/src/screens/SandraScreen.tsx`, corresponding web chat component discovered during implementation.

### 6.10 Web experience

Public marketing and the signed-in learning dashboard serve different needs:

- Marketing should explain EdLight concretely, show the learning experience, and offer a clear entry point.
- Signed-in Home should prioritize the next learning action.
- Course/practice paths should match the conceptual mobile destinations, adapted to larger screens.
- Use wider layouts for useful context, not to spread small cards across a huge canvas.
- Preserve existing web routes and search/discovery behavior where possible.
- Spectator broadcast remains a distinct presentation surface.

References: `src/pages/Home.tsx`, `Home.css`, `Dashboard.tsx`, `Dashboard.css`, `src/components/Layout.tsx`, `src/App.tsx`.

## 7. Shared visual direction

### Personality

Approachable, focused, and ambitious. The product should feel like EdLight serving Haitian students, not a generic SaaS dashboard or a copy of an unrelated app.

Retain the logo and recognizable blue. Use local school identity and carefully edited French/Kreyòl content as meaningful brand expression. Avoid decorative cultural references that do not help the task.

### Typography

- Audit existing fonts and tokens before adding any.
- Establish a small, consistent hierarchy for page title, section title, body, supporting label, and competitive numbers.
- Use highly readable typography for questions, answers, and instructions.
- Reserve expressive display type for untimed titles or major event moments.
- Use tabular numerals for changing timers/scores.
- Verify actual long content and accessibility scaling; never rely on short placeholder text.

### Surfaces and spacing

- Replace repeated equal-weight cards with a mixture of compact rows, open sections, and selective featured surfaces.
- Use whitespace and typography before borders/shadows to establish hierarchy.
- Keep one primary action visually strongest.
- Use existing spacing/radius tokens or consolidate them into a coherent shared system.
- Reduce nested cards, duplicated headings, and decorative icon containers.

### Color

- Brand blue for principal actions and selection.
- Orange sparingly for meaningful emphasis.
- Quiet learning surfaces with readable text in both supported themes.
- Consistent semantic success/warning/error states, always reinforced with text or iconography.
- Dark broadcast treatment can remain distinct; do not force it onto learning.

### Motion

- Animate meaningful state changes, not every component mount.
- Avoid loading/entrance sequences that delay interaction.
- Reserve celebratory effects for real achievements.
- Preserve reduced-motion behavior and information equivalence.
- Use haptics consistently and sparingly.

References: `mobile/src/theme/theme.ts`, existing motion/haptics utilities, reusable UI components, current web style organization. Identify canonical web tokens before introducing new variables.

## 8. Interaction requirements across the app

| Situation | Required behavior |
|---|---|
| Loading | Preserve understandable context; avoid a blank page where possible |
| Empty | Explain why and offer a useful next action |
| Offline/cached | Identify available cached content and operations requiring a connection |
| Saving/submitting | Differentiate pending, confirmed, failed, and uncertain state |
| Return/relaunch | Restore sensible location and unfinished work where supported |
| Authentication required | Explain why; preserve intended destination after sign-in |
| Error | Plain-language message and safe recovery action |
| Completed task | Meaningful completion and next action, not an unexplained dead end |
| Large text/small screen | No clipped critical text or covered actions |
| Grade change | Appropriate content and practice without confusing navigation |

Do not promise offline video, background downloads, or durable drafts unless implemented and verified. Preserve existing offline features, and expose their actual limits honestly.

## 9. Implementation phases and review gates

### Phase 0 — verify the present experience

Deliverables:

- Working native app inspection on iOS and Android where available.
- Screen/route inventory and complete journey walkthroughs.
- Current-state screenshots with observed problems, not generic aesthetic criticism.
- Inventory of existing tokens/components and duplicated patterns.
- Route/deep-link/notification migration map.
- Data-source map for progress, recommendations, continue state, and school identity.

Required journeys:

1. New student → choose grade/language → useful first activity.
2. Returning student → resume lesson → practice → result/review.
3. Student with mistakes → targeted practice → updated result.
4. Exam candidate → find exam → take/save/submit → review.
5. Student → daily game or monthly championship → appropriate ranking/result.
6. Interrupted connection/session → safe return.

### Phase 1 — design the system using three representative screens

Create high-fidelity, annotated proposals for:

1. Home.
2. A lesson/practice experience.
3. Compete hub.

Include the proposed four-destination architecture, profile access, long-content examples, key empty/error states, and light/dark treatments. Show how the design preserves existing owner navigation preferences.

**Review gate:** obtain feedback on the concrete design direction before applying it across the app. If the owner has already approved a direction and authorized execution, use that approval rather than asking again.

Output may be mockups or an explicitly authorized isolated prototype; Figma is not mandatory. A text plan alone is not visual approval.

### Phase 2 — shared foundation and navigation

- Consolidate visual tokens and only the reusable components actually needed.
- Implement navigation migration with legacy route compatibility.
- Keep native iOS and JS/Android behavior aligned.
- Preserve grade-specific practice and focused-task navigation hiding.
- Establish common loading, empty, error, and action patterns.

Acceptance: existing core destinations remain reachable; links/notifications work; no user progress/auth data is lost; no unrelated backend rewrite.

### Phase 3 — complete learning and practice journeys

- Redesign Home, Learn, course/lesson, Practice, quiz/exam, results, and review as connected flows.
- Use real progress/recommendation data with clear semantics.
- Fix resume behavior and feedback where needed.
- Integrate contextual Sandra access without obscuring learning controls.

Acceptance: a student can complete the journeys without dead ends, ambiguous save states, or repeated setup.

### Phase 4 — competition and profile integration

- Redesign Compete hub and distinct daily/weekly/monthly presentations.
- Reuse canonical school identity and improve profile/settings.
- Apply Arena visual specification alongside its technical prerequisites.
- Ensure ordinary learning remains accessible and coherent outside event time.

Acceptance: championship can be discovered/resumed; practice XP and tournament scores are unmistakably different; personal results and receipt states are truthful.

### Phase 5 — web alignment, accessibility, and release verification

- Adapt public/signed-in web surfaces to shared product logic.
- Verify both languages/themes, small devices, large text, keyboard/screen-reader behavior where applicable, reduced motion, and poor connectivity.
- Run appropriate regression tests, build/type checks, and complete real-browser/native walkthroughs.
- Review visual evidence before release. Deploy only within the owner's authorized release scope.

This sequence organizes the redesign; it is not permission to ship unsafe tournament functionality before its Phase 1 technical fixes.

## 10. Technical guardrails for Claude

- Keep React Native/Expo, React web, Firebase, and working domain services unless a concrete blocker requires a change.
- UI changes must not silently alter grading, mastery, streak, exam, or tournament rules.
- Reuse authoritative state rather than calculating a second contradictory progress model in components.
- Avoid creating a giant abstraction for every screen. Extract shared components only when the same behavior/design is genuinely reused.
- Do not replace platform-native behavior with custom animation solely to make screenshots look different.
- Preserve accessibility labels even where visible navigation labels are absent.
- Avoid large new assets or dependencies without considering startup and network cost.
- Do not rewrite all CSS or all screens in one unreviewable change.
- Scope changes into coherent reviewable batches, with migration/compatibility notes where needed.
- Preserve unrelated user/agent edits and re-check repository state before each batch.

## 11. Verification and acceptance criteria

### Product/usability

- Returning students can identify their next action without interpreting multiple equal-weight widgets.
- New students reach a useful activity without unnecessary account/profile steps.
- Learn, Practice, and Compete have understandable boundaries.
- Profile/settings remain easy to find after any navigation change.
- Resuming preserves the intended task and progress where supported.
- Results provide a meaningful review or next-learning action.
- No required feature becomes inaccessible after moving tabs/routes.

### Visual

- Consistent typography, spacing, color semantics, and control treatment across redesigned screens.
- One dominant action/information hierarchy per screen.
- Fewer repetitive cards without sacrificing clarity.
- Long titles, school names, question content, and translations do not break layouts.
- Important actions remain clear of tab bars, keyboards, safe areas, and floating help.
- Both themes, large text, and reduced motion remain usable.
- The product looks coherent using real populated data and honest empty/error states.

### Functional

- Auth, grade-specific navigation, deep links, notification taps, back navigation, tab reselect, and focus mode still work.
- Lesson progress, exam attempts, quiz results, mastery, and review history are preserved.
- Offline and uncertain-save states never claim success incorrectly.
- Core journeys work on actual native builds and the web; source review is insufficient.
- Appropriate tests/type checks/builds pass. Add targeted regression tests for changed behavior, not tests that merely mirror style declarations.
- Screenshots and interaction evidence distinguish native results from browser previews and fixture states from live data.

### Measuring whether the redesign helped

Establish a baseline before claiming improvement. Useful measures include time/steps to resume learning, task completion in observed usability sessions, abandonment at navigation boundaries, success recovering interrupted work, and ability to find review/competition/profile. Do not invent target conversion lifts or require new behavioral tracking without deciding its necessity and privacy implications.

## 12. File map

This is a starting map, not a requirement to edit every listed file. Verify actual ownership/composition first.

| Area | Existing files/directories |
|---|---|
| Navigation | `mobile/src/navigation/TabNavigator.tsx`, `NativeTabNavigator.tsx`, `AppNavigator.tsx`, `CoursesNavigator.tsx`, `ExamsNavigator.tsx`, `QuizNavigator.tsx`, `navHelpers.ts`, `tabPressBehaviour.ts`; `mobile/App.tsx`; `src/App.tsx`; `src/components/Layout.tsx` |
| Home | `mobile/src/screens/DashboardScreen.tsx`, `mobile/src/components/HomeWidgets.tsx`, `ReviewCard.tsx`; `src/pages/Dashboard.tsx`, `Dashboard.css` |
| Learn | `mobile/src/screens/CoursesScreen.tsx`, `CourseDetailScreen.tsx`; lesson/video/practice components; `src/pages/Courses.tsx`, `CourseDetail.tsx` and relevant styles |
| Practice/exams | `mobile/src/screens/QuizzesScreen.tsx`, `ExamLandingScreen.tsx`, `ExamBrowserScreen.tsx`, `ExamOverviewScreen.tsx`, `ExamTakeScreen.tsx`, `StudyPlanScreen.tsx`; `mobile/src/components/ExamAnswerInput.tsx`, `ExamSectionContext.tsx`, `ReviewSession.tsx`; corresponding `src/pages/` quiz/exam/study-plan files |
| Results | `mobile/src/screens/ExamResultsScreen.tsx`, `ExamHistoryScreen.tsx`; `mobile/src/components/quiz/QuizResultHero.tsx`; web result/history pages |
| Competition | `mobile/src/components/games/JeuxHub.tsx`, `TournamentCard.tsx`, `ArenaAnnounceCard.tsx`; `mobile/src/screens/TriviaScreen.tsx`, `arena/`; `src/pages/TriviaGames.tsx`, `TriviaGames.css`; leaderboard components |
| Identity/settings | `mobile/src/screens/AuthScreen.tsx`, `ProfileScreen.tsx`; `mobile/src/components/AuthModal.tsx`, `SchoolPicker.tsx`, `LeaderboardJoinModal.tsx`; profile/auth/school services; `src/components/Auth.tsx`; `src/pages/Profile.tsx` |
| Assistance | `mobile/src/components/SandraFab.tsx`, `mobile/src/screens/SandraScreen.tsx`; corresponding web assistant UI |
| Visual foundation | `mobile/src/theme/`, `mobile/src/components/ui/`, existing motion/haptic utilities; canonical web styles/tokens identified during inventory |
| Marketing | `src/pages/Home.tsx`, `Home.css`, `src/pages/home/` |

Consult the companion Arena documents for tournament/broadcast/backend file maps. Do not fold security-critical changes into purely visual edits without clear tests and review.

## 13. Keep / redesign / remove

### Keep

- Educational content and working learning/practice services.
- Existing auth and database architecture.
- Grade-appropriate content/practice behavior.
- EdLight logo and recognizable blue.
- Useful theme, haptic, accessibility, and motion foundations.
- Supported offline/resume behavior.
- School identity and separation of ordinary games from prize competition.
- Existing owner preferences unless explicitly reconsidered.

### Redesign

- Home hierarchy and next-action logic.
- Navigation grouping and profile access, after reviewing the proposal.
- Course/practice discovery and continuity between tasks.
- Quiz/exam/result composition and feedback.
- Compete hub and distinction between monthly event and weekly XP.
- Repeated card patterns and inconsistent visual hierarchy.
- Contextual assistant placement.
- Error, empty, loading, recovery, and completion states.

### Remove or reduce

- Duplicate headings and equally prominent competing calls to action.
- Unnecessary nested cards, shadows, borders, and decorative icon boxes.
- Metrics without clear meaning or supporting evidence.
- Floating controls that cover task content.
- Repeated requests for already-known profile information.
- Animations that delay interaction or communicate no change.
- Generic success messages before confirmation.

Do not delete features or historical user data merely to simplify presentation.

## 14. Requested Claude handoff response

When implementation is authorized, first return a concise current-state reconciliation and concrete design proposal covering:

1. What changed since this plan and which findings still apply.
2. Proposed navigation and migration map.
3. Home, lesson/practice, and Compete visual proposals.
4. Existing components/tokens to keep and consolidate.
5. Data dependencies or blockers that prevent truthful UI.
6. Implementation batches and verification approach.

After each implemented batch, report what changed, what was tested on which platform, remaining limitations, and any required data/configuration migration. Do not call the redesign complete until the connected journeys have been visually and functionally verified.

**Status: planning document only. No application implementation or deployment was performed to create this plan.**
