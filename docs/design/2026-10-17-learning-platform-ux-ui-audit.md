# Core learning platform: UX and UI audit

Date: October 17, 2026  
Scope: Responsive web platform, excluding Arena and competitive experiences  
Status: Findings and proposed design direction; documentation only

## Main assessment

The core platform should feel like a personal learning studio: clear, composed, helpful, and easy to return to. A student should understand what to do next, find suitable material quickly, work without distraction, and leave knowing what improved.

The strongest opportunity is to connect the existing capabilities into one recognizable journey:

**Continue a lesson → practice its skill → understand mistakes → revisit weak areas → see evidence of progress.**

Courses, practice, exams, review, study plans, and Sandra already provide much of the underlying capability. The proposed work improves how students discover, understand, and move between them. It is not a proposal to replace every screen or add features merely to make the platform look larger.

## Relationship to existing specifications

The existing [website design specification](./website-premium/DESIGN-SPEC.md) and [product requirements](./website-premium/PRD.md) remain the proposed detailed baseline. This audit adds a focused learning-platform assessment and priorities; it does not silently supersede those documents, scoring rules, or data contracts.

The website specification records an earlier inspection of a local desktop build. That evidence belongs to that earlier review. This audit inspected current source and existing documentation; it did not perform a fresh browser, production, phone, tablet, accessibility, or usability test. Visual observations below are design recommendations or source-backed risks requiring rendered validation.

## Preserve these strengths

- Separate public and signed-in home experiences.
- A real sample question on the public landing page.
- Actual lesson and exam resume context.
- Course overviews before entering lessons.
- Subject and class filtering, with explicit unavailable content.
- Distinct completion and mastery concepts.
- Review queues and exam correction states.
- Lesson-aware Sandra entry points with an explanation of shared context.
- Local search with a keyboard shortcut and an explicit AI handoff.
- Focused learning and exam shells that remove unnecessary navigation.
- Existing bilingual content, design tokens, and reduced-motion treatments.

## Twenty UX/UI improvements

### 1. Make the destination model understandable

**Priority: P1 · Source-backed design opportunity**

Signed-in `/` renders the home dashboard, while `/dashboard` is a separate workspace rendered through Courses. Courses, Practice, Revision, Study Plan, Profile, and exam history each offer related planning or progress functions. Multiple destinations can be useful, but their roles need clear boundaries.

**Direction:** Home answers “What should I do now?” Courses answers “What can I learn?” Practice answers “What should I work on?” Exams answers “How do I prepare and assess?” Profile holds identity and settings. Give the workspace a distinct purpose and clear entry, or propose consolidation for review. Do not merge routes solely because their names overlap.

Evidence: [App routes](../../src/App.tsx), [workspace](../../src/pages/courses/LearnWorkspace.tsx), [Dashboard](../../src/pages/Dashboard.tsx).

### 2. Give signed-in Home one dominant next action

**Priority: P1 · Recommendation building on existing resume logic**

Lead with a real lesson, unfinished exam, or due review session and one clear action. Show subject, topic, and relevant status before secondary metrics. Place alternatives in a quieter supporting area.

Differentiate new, returning, interrupted-task, and caught-up states. A student without activity should receive a useful starting point, not an empty dashboard or invented weak area.

### 3. Lead discovery with the student's actual class and available coverage

**Priority: P1 · Source-backed opportunity**

The course catalog supports NS I–IV and explicitly maps student grade codes to available levels. Students outside that coverage need an honest, useful destination.

**Direction:** Keep current class visible and editable; distinguish “no matching results” from “this class is not covered yet.” Offer actual neighboring resources without silently changing class. Show why a recommendation is suitable.

Evidence: [Course level mapping and catalog](../../src/pages/Courses.tsx).

### 4. Turn subject identity into a coherent artwork system

**Priority: P2 · Visual recommendation**

Create coordinated course covers for mathematics, physics, chemistry, and economics using original diagrams, subject motifs, and consistent composition. Maintain a readable title zone and a consistent class treatment.

Use actual lesson stills when they help students judge instruction. Avoid incidental software interfaces and inconsistent frames where a better authentic image exists. Cover quality should not conceal content-production problems.

### 5. Reduce visual competition between surfaces

**Priority: P1 · Visual recommendation**

Use whitespace and typography to group ordinary content. Reserve bounded surfaces for actionable course items, questions, summaries, and important feedback. Reduce nested cards, repeated badges, and competing accent colors where they obscure hierarchy.

Keep one dominant element per task viewport. Do not judge “premium” by the number of panels, gradients, shadows, or decorative statistics.

### 6. Establish a reading-first type hierarchy

**Priority: P1 · Source-backed review target**

Existing exam and quiz styles contain metadata around 0.68–0.75rem with uppercase treatment. These values do not automatically establish a usability failure, but critical context must not inherit decorative label styling.

**Direction:** Use comfortable text sizes for question wording, answer options, instructions, errors, and grading caveats. Limit all-caps to short optional labels. Adopt the existing design specification's body and question scales as candidates, then verify at actual sizes and zoom levels.

Evidence: [Quiz styles](../../src/pages/Quizzes.css), [exam hub styles](../../src/pages/examHub.css), [type specification](./website-premium/DESIGN-SPEC.md).

### 7. Make course overviews useful decision screens

**Priority: P2 · Upgrade to existing capability**

Course overviews already include outcomes, curriculum, estimated duration, progress, and start/resume. Refine their hierarchy: what students will learn, whether it fits their level, the next lesson, and one primary action.

Use progressively disclosed descriptions and explicit lesson types. Show verified teachers and real duration only when available. Keep completion separate from mastery.

Evidence: [CourseOverview](../../src/components/CourseOverview.tsx).

### 8. Make the lesson workspace the platform's flagship screen

**Priority: P1 · Visual and interaction recommendation**

Design the lesson around a clear title, responsive player, current position in the course, and an obvious continuation action. Keep the outline accessible without forcing the player, lesson text, and actions below the fold on short laptops.

The current lesson markup places media before the title/header; evaluate a title-before-player composition in the rendered layout. Use a collapsible outline on constrained screens. Do not add empty transcript, notes, or downloads tabs; each requires actual supported content and persistence.

Evidence: [Lesson composition](../../src/pages/CourseDetail.tsx), [lesson specification](./website-premium/DESIGN-SPEC.md).

### 9. Make the transition from lesson to practice effortless

**Priority: P1 · Upgrade to existing deep links**

Preserve subject, class, unit, and lesson context when moving into practice. Present a relevant short exercise immediately when the context and question bank support it. Keep manual configuration as an alternative.

Show a concrete, factual promise such as a practice topic and actual question count. Avoid forcing students to select the same subject and class again after every lesson.

Evidence: [Course practice links](../../src/components/CourseOverview.tsx), [quiz deep-link defaults](../../src/pages/Quizzes.tsx).

### 10. Clarify practice and quiz modes before entry

**Priority: P1 · Upgrade to existing distinctions**

The quiz page already distinguishes open-ended practice from a fixed deck. Explain each in student language: feedback timing, question count where fixed, and what will be saved. Do not imply a grade or time limit when the mode has neither.

Offer a sensible default based on real context, then let students customize. Progressive disclosure should reduce setup effort without hiding important rules.

Evidence: [Quizzes](../../src/pages/Quizzes.tsx).

### 11. Make answer feedback teach

**Priority: P1 · Learning experience recommendation**

Use a consistent answer anatomy: the student's response, its result, the supported explanation, and a next step. Distinguish incorrect, partial, unanswered, and ungraded answers through text and symbols as well as color.

Expand worked steps when authored or reliably supported. Do not fabricate explanations or label an unsupported diagnosis as a proven misconception. Support mathematical notation, long passages, and large text.

### 12. Give exam preparation a clear, trustworthy sequence

**Priority: P1 · Refinement of existing exam flow**

Organize the journey as choose paper → understand format and conditions → start or resume → review submission → understand correction → practice relevant skills.

Make duration, subject, year/session, response format, saved-draft status, and grading limitations easy to scan. Keep overview and taking screens distinct. Preserve existing draft and integrity behavior rather than simplifying it away for presentation.

Evidence: [ExamOverview](../../src/pages/ExamOverview.tsx), [ExamResults](../../src/pages/ExamResults.tsx).

### 13. Turn results into a useful learning plan

**Priority: P1 · Upgrade to existing correction and review**

Lead with an accurate result and its status, then what needs review and one meaningful action. Keep ungraded questions visible and distinguish a single paper's score from broader mastery.

Existing exam results already handle status categories, grouped performance, and due review. Improve their hierarchy rather than inventing a competing progress system. Show score comparisons only when attempts are sufficiently comparable.

Evidence: [ExamResults](../../src/pages/ExamResults.tsx), [Review](../../src/pages/Revision.tsx).

### 14. Explain progress through evidence

**Priority: P1 · Upgrade to existing mastery model**

Students should understand the difference between “I opened it,” “I completed it,” “I practised it,” and “I demonstrated mastery.” Keep those labels consistent across course, Home, workspace, profile, and results.

Use plain-language summaries with denominators and meaningful time periods. Avoid a global percentage that mixes unrelated measures. Explain why something is due for review without portraying spaced review as failure.

Evidence: [CourseOverview mastery](../../src/components/CourseOverview.tsx), [LearnWorkspace](../../src/pages/courses/LearnWorkspace.tsx), [Profile](../../src/pages/Profile.tsx).

### 15. Improve search relevance and recovery

**Priority: P1 · Confirmed ordering behavior; recommendation to validate relevance**

Search ranks results, then groups them in a fixed order that places actions and pages before courses, lessons, and exams. A highly relevant lesson can therefore appear after generic destinations.

**Direction:** Evaluate a best-match region ahead of type groups, with clear subject and class context. Add distinct index-loading, failed-loading, no-result, and ready states. Offer recent or useful queries without implying recommendations are personalized when they are not.

Evidence: [SearchOverlay result ordering](../../src/components/SearchOverlay/index.tsx).

### 16. Complete search's modal and keyboard behavior

**Priority: P1 · Confirmed missing mechanisms in inspected component**

Search declares a modal dialog and focuses its input, but no focus trap, background inertness, focus restoration, or active-option announcement mechanism was found in the component. Arrow navigation updates a visual active index; it does not establish a complete accessible combobox contract by itself.

**Direction:** Choose a coherent dialog and result-navigation pattern, contain focus while open, restore it on close, and announce keyboard selection appropriately. Ensure the active result scrolls into view. Validate with keyboard and assistive technology rather than relying on ARIA attributes alone.

Evidence: [SearchOverlay](../../src/components/SearchOverlay/index.tsx). Reference: [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### 17. Keep Sandra contextual and predictable

**Priority: P2 · Upgrade to existing integration**

Preserve the lesson-aware entry and explicit explanation that Sandra receives topic context rather than student answers. Offer suitable requests such as explanation, another example, or a practice suggestion, only when the assistant supports them.

The panel should preserve the student's place, fit smaller screens, support readable math, and provide clear retry or unavailable states. Avoid making chat the only route to standard platform functions or overriding focused exam rules.

Evidence: [Lesson Sandra integration](../../src/pages/CourseDetail.tsx), [SandraWidget](../../src/components/SandraWidget.tsx).

### 18. Keep interruptions and navigation behavior predictable

**Priority: P1 · Confirmed interaction to reconsider**

The mobile browser bottom navigation reloads the whole page on a second tap within 350 ms. This is an unusual hidden gesture and may discard transient UI state or interrupt network work. Reload safety depends on the current flow and was not reproduced in this audit.

**Direction:** Prefer ordinary navigation and predictable scroll behavior. Use explicit refresh controls where needed. Coordinate authentication, grade selection, reminders, app-install banners, and assistant surfaces so they do not interrupt question answering or obscure the primary action.

Evidence: [BottomNav tap handler](../../src/components/BottomNav.tsx), [shared Layout](../../src/components/Layout.tsx).

### 19. Make saved state and failure recovery understandable

**Priority: P1 · Cross-screen consistency recommendation**

Lesson completion already distinguishes saving, slow, queued, confirmed, and failed states. Extend that clarity consistently to quiz progress, exam submission, profile changes, and plans.

Use specific consequences and recovery actions. Distinguish unavailable content from failed loading, empty account from unsynced data, and a saved draft from a submitted exam. Keep unrelated parts of a screen usable when one section fails.

Evidence: [Lesson save states](../../src/pages/CourseDetail.tsx), [exam result recovery](../../src/pages/ExamResults.tsx).

### 20. Establish one responsive and motion quality standard

**Priority: P1 for accessibility; P2 for visual refinement**

Review desktop, short laptop, tablet, and phone as distinct compositions. Test 320 CSS-pixel layouts and zoom, long bilingual strings, complex math, sticky controls, and keyboard navigation. Essential content should not require competing horizontal and vertical page scrolling; mathematical content may need a purpose-designed overflow treatment.

Learning motion should be quiet: immediate selection feedback, subtle state changes, retained scroll position, and clear transitions. Reserve celebration for meaningful milestones. Every essential interaction must work without motion or sound.

References: [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Target-size requirements have exceptions; use the existing design specification's larger primary-control targets as a comfort goal, not an inaccurate statement of the minimum standard.

## Screen composition direction

| Screen | Dominant content | Supporting content | Keep quieter |
| --- | --- | --- | --- |
| Public Home | Real sample and clear learning proposition | Supported subjects, class coverage, credible program facts | Repeated claims and counters |
| Signed-in Home | One real continuation or starting action | Due review and a compact progress explanation | Secondary discovery and settings |
| Course catalog | Subject/class fit and available courses | Useful filters and current coverage | Repeated metadata and unavailable material |
| Course overview | Outcomes and start/resume | Outline, actual duration, verified instructor | Long descriptions |
| Lesson | Topic, player, next action | Current lesson position, outline, available help | Global navigation and promotional surfaces |
| Practice setup | Relevant recommended start | Topic, mode, count, customization | Advanced configuration |
| Question | Prompt and response interaction | Progress, permitted help, feedback | Unrelated metrics |
| Exam overview | Paper identity, conditions, start/resume | Preview and grading explanation | Catalog navigation |
| Exam taking | Current question and response | Navigation, save state, time where applicable | Nonessential chrome |
| Results | Accurate result and next learning action | Correction and evidence of weak areas | Vanity statistics |
| Search | Best relevant destinations | Type groups and explicit Sandra handoff | Generic pages above exact content |
| Profile and progress | Understandable learning evidence | Goals, history, identity, settings | Unexplained percentages |

## Proposed visual system

- **Canvas:** quiet light or dark learning surfaces that honor the student's preference.
- **Typography:** consistent display headings with Source Sans 3 for sustained reading and questions, following the existing proposed specification.
- **Color:** one strong action color, stable subject identities, and semantic feedback. Do not make every section an unrelated theme.
- **Artwork:** original subject covers and useful educational diagrams, with authentic instructional previews.
- **Layout:** a readable content column, deliberate secondary areas, and minimal nested surfaces.
- **Controls:** consistent primary, secondary, destructive, loading, disabled, and focus treatments.
- **Motion:** restrained transitions that preserve attention and position; no animation over text students are reading.

## Recommended next design deliverable

Produce one coherent learning prototype, not disconnected mockups:

1. A returning student's Home with a real resume action.
2. A course overview and lesson workspace for the same subject.
3. A contextual practice question with feedback.
4. Results that lead to an appropriate review action.
5. A progress view explaining the evidence accumulated.

Include a new student, unavailable class, failed video, pending save, empty search, and keyboard-only search as alternative states. Design desktop and phone compositions together, and include the short-laptop viewport already specified in the website design package.

## Priorities

**First: clarity and core tasks.** Address destination roles, next-action hierarchy, class fit, lesson usability, practice handoff, feedback, and results: items **1–3, 8–14**. Fix search keyboard behavior and surprising reload behavior alongside these: **16 and 18**.

**Second: coherent visual craft.** Refine cover art, surface hierarchy, reading type, search relevance, and contextual help: **4–7, 15, and 17**.

**Throughout:** Treat saved-state clarity, responsive layouts, accessibility, and motion preferences as part of every screen: **19–20**. Do not defer them to a cosmetic cleanup.

## Validation

Ask students to find suitable material, resume a lesson, practice its topic, understand an error, and identify their next step. Observe where they hesitate rather than explaining the interface for them.

Measure task completion, time to first useful activity, unnecessary setup steps, successful resume, correction-to-practice follow-through, and voluntary return. Establish baselines before assigning numerical targets.

No application code, dependencies, production data, or deployments were changed for this audit.
