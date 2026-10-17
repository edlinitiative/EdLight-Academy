# Learning journey: rendered audit

Date: October 17, 2026  
Code baseline at inspection: `15f474b`  
Target: Existing local development server at `http://localhost:3000`  
Reference: [Connected learning journey PRD](../../2026-10-17-learning-journey-prd.md)  
Scope: Learning journey only; Arena excluded

## Verdict

The new journey is a substantial improvement. It has a coherent hierarchy, a clear resume action, a readable mobile lesson, a useful contextual practice entry, explicit correction, and progress labels that distinguish completion from mastery.

It is a credible learning product. It does not yet meet the intended premium standard consistently: instructional previews are visually rough, the phone handoff asks students to read too much before starting, and an observed lesson-link failure undermines the central continuity promise. Fix continuity and accessibility before adding further motion.

The strongest current screen is the practice question with correction. The most important visual production task is the course cover and preview system.

## What was actually checked

- Desktop workspace preview at 1440×900.
- Phone workspace preview at 390×844.
- Course overview and active lesson in the guest flow at 390×844.
- A real chapter practice handoff at 390×844 and 1280×633.
- Starting a finite quiz, submitting a correct answer, viewing feedback, and ending early through the provided exit panel.
- The resulting session summary, including unanswered questions.
- Current source for Home, completion handling, practice scope, review confirmation, search, and progress presentation.
- Seven targeted journey test suites.
- One automated accessibility spot check of the quiz feedback/exit state.

The workspace used the existing development-only `?preview=returning` fixture. Its student progress and resume position are invented preview records; the course and lesson identifiers come from the catalog. This is evidence about presentation, not live student records or authenticated persistence.

No real account was signed in. Confirmed completion writes, server review synchronization, cross-device persistence, production behavior, full bilingual coverage, video playback, full accessibility, and field performance remain unverified. Static screenshots do not establish animation frame pacing or complete temporal behavior.

## Findings, in priority order

### 1. P1 — The tested lesson deep link did not reach the requested lesson

**Observed:** The workspace preview's “Reprendre la leçon” pointed to `/courses/chem-ns1?lesson=CHEM-NSI-U1-L7`. Following it opened the course overview with “Commencer Masse et Poids,” not the requested “Exercices Significatifs.” Opening the same URL directly reproduced the overview result in this guest browser session. The practice handoff separately recognized the requested lesson title, so the identifier was not merely an invented missing lesson.

**Impact:** The central “resume where I left off” promise can break. This observation establishes a failure for the tested guest/local path, not every account or provider.

**Next action:** Investigate restoration against actual catalog/enriched data arrival and URL synchronization. Add a browser regression scenario using real asynchronous data; the current component test mocks already-loaded course data and passes.

Evidence: [requested-link outcome](learning-deeplink.png), [preview resume context](learning-home-desktop.png), [lesson restoration code](../../../../src/pages/CourseDetail.tsx#L446).

### 2. P1 — The success badge fails text contrast

**Observed:** The automated check found `.chip` / `.chip--success` text at **2.73:1**, with foreground `#17a75c`, background `#e3f4eb`, 14 px bold text. The expected threshold for this text is 4.5:1.

**Impact:** A key feedback label is harder to read than it should be. The newer detailed status treatment does not repair the separate legacy badge above it.

**Next action:** Adjust the semantic success text pairing and check both success treatments in light and dark appearance. Re-run the contrast check on the rendered result.

The same audit returned five incomplete contrast checks because it could not determine overlapping backgrounds. Those are manual-review items, not five additional proven failures.

Evidence: [feedback screenshot](learning-feedback-phone.png), [legacy chip markup](../../../../src/components/DirectBankQuiz.tsx#L149).

### 3. P1 — The compact handoff is still too tall on phones

**Observed:** At 390×844, the practice entry shows return navigation, originating lesson, chapter title, subject/class, the 35-question pool, a chapter-wide scope explanation, account/save copy, mode choices, and then rules. The primary “Commencer” action is below the initial viewport.

**Impact:** Students who just chose to practise must scroll through a second explanation-heavy setup before starting. The same composition works well at 1280×633, where the two columns keep Start visible.

**Next action:** Design a dedicated phone confirmation: topic, selected mode and actual session count, essential rules, and Start first. Keep coverage and save limitations readable, but consolidate repeated wording and disclose secondary details progressively. Consider a safe action region if it does not cover content.

Evidence: [phone practice entry](learning-practice-entry-phone.png), [short-laptop practice entry](learning-practice-entry-laptop.png).

### 4. P2 — Course imagery is the largest visual quality gap

**Observed:** The mathematics card prominently shows a drawing-tool color palette; other covers show raw handwritten instructional frames with inconsistent crops and composition. The resume image contains tiny text that is not useful at thumbnail size. These sit inside otherwise polished cards and typography.

**Impact:** The interface looks more carefully produced than the media it presents. That mismatch weakens perceived educational quality before a lesson starts.

**Next action:** Establish an original subject cover family and select genuine, cleaner lesson previews. Keep the actual teaching material honest; separately inventory source videos that need production improvements. Do not disguise weak source quality with misleading artwork.

Evidence: [desktop workspace](learning-home-desktop.png), [phone workspace](learning-home-phone.png).

### 5. P2 — Mobile Home prioritizes the catalog over progress and review

**Observed:** The resume region fits and reads clearly. It is followed by large, full-width subject cards; the first card alone occupies much of the remaining initial screen. Progress and review move below the subject list, although both are immediately visible in the desktop sidebar.

**Impact:** The phone composition becomes resume → course browsing, while the intended learning loop needs review and evidence of progress to stay discoverable.

**Next action:** After the resume region, show a compact due-review entry and progress summary before the full subject collection. Evaluate smaller continuation rows or a compact course treatment on phone rather than simply stacking desktop cards.

Evidence: [phone workspace](learning-home-phone.png), [desktop workspace](learning-home-desktop.png).

### 6. P2 — Correct feedback repeats itself and pushes continuation down

**Observed:** After the correct answer, the screen retains all four options, highlights the selected answer, shows the small “Correct” badge, repeats “Correct du premier coup,” repeats “Ta réponse,” then gives an explanation. The next-question action is below the initial phone viewport.

**Impact:** The feedback is understandable and supportive, but spends too much space confirming the same outcome. That slows repeat practice.

**Next action:** Keep one explicit verdict, retain enough question/answer context, and prioritize the explanation plus next action. Consider compacting resolved choices without causing unexpected focus movement or hiding essential feedback.

Evidence: [before submission](learning-question-phone.png), [after submission](learning-feedback-phone.png).

### 7. P2 — Early-exit summary uses a completion headline and full-deck fraction

**Observed:** Ending after one correct answer produces “Quiz terminé,” a large `1 / 10`, then a clear statement that the quiz stopped early with nine unanswered questions. The summary correctly distinguishes unanswered items and explains that they do not enter review.

**Impact:** The large first impression can suggest a poor completed attempt before the explanatory text clarifies that nine questions were never answered.

**Next action:** Use an interrupted-session heading and lead with completed participation, such as one answered out of ten and one correct on the first try. Preserve actual scoring semantics; this is a display-hierarchy recommendation, not permission to change the scoring formula.

Evidence: [early-exit result](learning-result-phone.png), [result component](../../../../src/components/QuizResult.tsx).

### 8. P2 — Question context disappears during the focused session

**Observed:** The visible phone question header contains exit and position (“Question 1 sur 10”), but not the chemistry chapter identity shown on entry. The accessibility heading is the generic “Quiz du programme.”

**Impact:** Focus is good, but the student loses a useful orientation cue when returning attention to the screen or moving between learning activities.

**Next action:** Include one quiet subject/chapter label within the focused header, with suitable wrapping and no competing decorative header.

Evidence: [question screen](learning-question-phone.png).

## What is working well

- The workspace's main action names the exact intended lesson and offers review without hiding the main action.
- Desktop hierarchy is easy to scan: continuation, subject cards, progress, review.
- The active phone lesson puts its title and unit context before the player and exposes outline access.
- The laptop practice entry presents topic and mode in a clear two-column layout with Start visible.
- Chapter-wide practice is labeled honestly rather than represented as exact-lesson practice.
- Answer options are readable and comfortable to select; feedback uses words and symbols in addition to color.
- The explanation in the tested question directly addresses the concept.
- Exiting a quiz offers a deliberate summary path instead of abruptly discarding the session.
- The result explicitly separates unanswered questions from incorrect answers.
- Current source distinguishes completion, practice, and mastery and includes substantial pending-save and scoped-response handling.
- Search source now contains focus containment, background inertness, focus restoration, and active-option semantics; the previous source-audit finding should not be repeated as if unchanged. Complete assistive-technology behavior was not tested here.

## Animation assessment

The implemented direction is appropriately restrained for learning. Source includes brief reveals, local completion acknowledgment, progress transitions, and reduced-motion treatments. There is no need to make question reading theatrical.

The next motion review should examine recorded transitions and input responsiveness, not add effects by default. Prioritize stable reflow after feedback, predictable focus, interruption-safe completion, and a clear transition to the next question. This audit did not measure frame pacing or validate all reduced-motion paths in a browser.

## Verification

The targeted test run passed **7 suites / 59 tests**:

- `CourseDetail.journey.test.tsx`
- `lessonJourney.test.tsx`
- `homeJourney.test.tsx`
- `quizzesEntry.test.tsx`
- `quizResult.test.tsx`
- `directBankUngraded.test.tsx`
- `learningJourney.test.ts`

Passing these tests does not negate the observed browser lesson-link failure. The lesson component tests mock data and services; they do not establish actual asynchronous loading behavior or authenticated persistence.

The browser error command returned no listed page errors in the inspected quiz state. That is a narrow observation, not a clean bill of health for the platform.

## Recommended next pass

1. Fix and reproduce the actual lesson restoration case; add browser coverage for delayed catalog/enriched data.
2. Repair the success-badge contrast and manually review the incomplete checks.
3. Recompose phone practice entry and feedback so the intended next action is easier to reach.
4. Curate course artwork and previews as one visual-production task.
5. Reorder phone Home around continuation, review, progress, then browsing.
6. Improve early-exit result hierarchy and preserve topic orientation during practice.
7. Validate authenticated completion → review → progress on real accounts and record motion on baseline devices.

No application code was modified for this audit. This report and its screenshots are the audit artifacts.
