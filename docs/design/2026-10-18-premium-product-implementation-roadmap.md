# Premium product implementation roadmap

Date: October 18, 2026

Scope: EdLight Academy website and mobile app

Purpose: Turn the existing feature set into a consistent, dependable, premium student experience.

## Assessment and evidence

Both products have substantial feature breadth. The next phase should prioritize complete journeys, consistent interaction quality, and production reliability before adding broad new features.

The current source includes courses, practice, exam preparation, saved attempts, study plans, mastery tracking, Sandra, daily quizzes, asynchronous friend challenges, rankings, avatars, and Arena event journeys. Mobile also includes recent work on startup, account isolation, onboarding coordination, connectivity recovery, and Arena discovery and links.

During the October 18 review, all **66 mobile test suites passed, covering 676 tests**. These results support the tested logic; they do not establish visual quality, installed-build reliability, production service behavior, or complete cross-device journeys. No installed iOS or Android build was exercised in that review, and the deployed versions were not compared with this checkout.

The website has a more expressive Arena presentation. Mobile has custom visual foundations, but its feel and finish require hands-on device review. Neither should be described as consistently premium solely from feature counts or passing unit tests.

Earlier audits are useful context, but several findings have since been addressed. Recheck current code and behavior before treating an older finding as an open defect:

- [Mobile audit](2026-10-17-mobile-app-audit.md)
- [Learning platform UX/UI audit](2026-10-17-learning-platform-ux-ui-audit.md)
- [Arena web/mobile audit](audits/2026-10-17-arena-web-mobile/REPORT.md)
- [Arena premium roadmap](2026-10-17-arena-premium-roadmap.md)

## Product standard

A premium experience should make the student feel that:

1. The next useful action is clear.
2. The product remembers their place and progress.
3. Every action leads where its label promises.
4. Feedback is immediate and accurately reflects what was saved or submitted.
5. Interruptions have understandable recovery paths.
6. Learning outcomes lead to useful next steps.
7. Screens share a coherent visual and interaction language.

Treat a complete student journey as the unit of delivery. A screen is only one part of that journey.

## Priority and delivery order

| Priority | Work | Completion evidence |
| --- | --- | --- |
| P0 | Production telemetry and representative device journey validation | Failures are observable and the main flows have recorded results on installed builds. |
| P0 | Resolve data loss, blocked access, incorrect submissions, and broken handoffs found during validation | Reproduced problems are fixed and their journeys pass again. |
| P1 | Consolidate UI foundations and shared interaction states | Representative learning and competition screens use consistent components and state behavior. |
| P1 | Finish learning and competition continuity | Students can complete each journey through login, interruptions, and return visits. |
| P1 | Responsive layouts, accessibility, and measured performance | Agreed device and browser coverage passes with documented exceptions. |
| P2 | Purposeful motion, optional sound, and richer competition presentation | Effects are integrated into real phases and remain usable with accessibility preferences. |
| P2 | Evaluate larger product additions | Each proposal has a clear student need, scope, and success measure. |

## 1. Consistent UI foundations

### Implementation

- Inventory existing shared components and tokens before introducing new abstractions.
- Consolidate buttons, inputs, cards, typography, spacing, status labels, and feedback patterns within each platform.
- Share semantic meanings across platforms while respecting native interaction conventions.
- Define loading, empty, error, disabled, submitting, success, and retry behavior for reusable controls and sections.
- Audit screens for local exceptions, inconsistent labels, weak contrast, and competing primary actions.
- Preserve a recognizable relationship between calm learning surfaces and expressive Arena surfaces.
- Use stable layouts during loading so content and controls do not jump unexpectedly.

### Acceptance criteria

- Comparable actions have comparable labels, hierarchy, and feedback.
- Each screen has a clear primary action appropriate to its current state.
- Essential content remains readable with long French and Haitian Creole text.
- Shared components cover the actual states needed by their consumers.
- Representative screens receive visual review on each supported layout class.

## 2. Complete learning journeys

### Implementation

- Preserve lesson position, relevant navigation context, and exam drafts across supported interruptions.
- Make saved, saving, queued, failed, and confirmed progress understandable.
- Connect incorrect answers to relevant explanations and focused practice.
- Give results one useful next learning action based on available evidence.
- Distinguish course completion, XP, practice performance, and mastery.
- Show meaningful improvement over time without implying knowledge the system has not measured.
- Simplify Home around the student's next useful action, with secondary discovery and competition opportunities.
- Let students return from Sandra to the lesson or task that prompted their question.

### Acceptance criteria

- A student can start a lesson, leave, return, and resume without searching for their place.
- A student can recover an interrupted exam attempt according to its rules.
- A wrong answer leads to an understandable explanation and relevant practice when available.
- Completion celebrations follow confirmed outcomes; pending saves are labeled accurately.
- A returning student can identify what to do next and why.

## 3. Complete competition journeys

### Implementation

- Preserve practice/challenge intent and invitation destinations through authentication and onboarding.
- Clearly distinguish practice, asynchronous friend challenges, and official live competition.
- Keep Arena accessible between scheduled events, with a prominent real playable action.
- Provide clear paths to registration, rejoin, watching, results, and the next available activity.
- Retain event and followed-school context while showing the current question and relevant match stories.
- Distinguish scheduled, waiting, live, reconnecting, delayed, provisional, and official states where applicable.
- Make each student's contribution understandable, including participation outside the school's counting players.
- Match celebrations to the achievement actually earned.
- Label weekly, all-time, and official tournament boards consistently.

### Acceptance criteria

- A student can start a friend challenge, play, share it, and have a signed-out friend open and complete it.
- Both participants can subsequently find the result.
- A registered student can rejoin an active event without navigating unrelated screens.
- A spectator can understand the current phase, question, and school context without excessive scrolling.
- Missing events, connection failures, and actual intervals have distinct explanations.
- No interface implies an official victory or rank before the underlying result supports it.

## 4. Responsive and dependable interactions

### Implementation

- Acknowledge taps immediately and prevent duplicate submissions.
- Use optimistic updates only where the outcome is safe to represent before confirmation.
- Preserve scroll position, draft input, and selection where the task calls for continuity.
- Define foreground/background behavior for timed activities; preserve authoritative server timing for competition.
- Keep independent sections usable when one feed or service fails.
- Provide retry paths that retain useful input and avoid restarting the entire journey.
- Make slow or failed network actions visible without leaving indefinite spinners.
- Handle keyboard appearance, safe areas, and interruptions deliberately.

### Acceptance criteria

- Repeated taps do not create duplicate answers, registrations, or attempts.
- Slow responses produce clear feedback and a safe recovery action.
- Returning from a phone call, lock screen, or background state produces the correct timer and submission behavior.
- A course-feed failure does not remove independent Arena or navigation actions.
- User-entered work survives recoverable failures where appropriate.

## 5. Mobile-specific finish

### Navigation and continuity

- Verify cold and warm invitation opening on installed iOS and Android builds.
- Preserve the original destination through sign-in and onboarding.
- Ensure back navigation returns to the expected task.
- Verify notification taps reach the intended screen and retain relevant context.

### Reading and touch comfort

- Review large text, screen-reader order, touch targets, long school names, and mathematical content.
- Verify keyboard avoidance on authentication, search, Sandra, registration, and written exam answers.
- Test smaller phones, supported tablets, and both platform tab implementations.

### Offline and reconnection

- Clearly distinguish cached metadata, available local exercises, saved drafts, queued progress, and network-required content.
- Keep useful saved content visible and refresh it appropriately after reconnection.
- Preserve the existing honest video offline state: video currently requires internet.
- Consider downloadable revision packs as a separate scoped feature; review content format, storage, and rights first.

### Arena presentation

- Integrate a small set of meaningful transitions for entry, answer confirmation, phase changes, and results.
- Respect reduced motion and keep sound optional and independent of essential information.
- Measure device performance before expanding native animation. The current native Arena environment is static.
- Keep browser handoffs understandable: the demo, prize claims, and parental consent currently use web experiences.

## 6. Website-specific finish

### Responsive composition

- Review phone, tablet, desktop, and large projector/broadcast layouts intentionally.
- Test long prompts, long answer options, mathematical expressions, and long school names.
- Ensure fixed controls, navigation, and playback docks never cover answers or essential actions.
- Maintain a coherent visual identity from Arena entry through championship, play, watching, and results.

### Navigation and input

- Support keyboard navigation and visible focus throughout interactive journeys.
- Make browser Back and Forward behavior predictable.
- Preserve meaningful URL context so refreshes and shared links reach the expected destination.
- Retain drafts and useful task state through recoverable navigation and service failures.

### Performance

- Measure route loading, interaction responsiveness, and layout shifts on representative devices and connections.
- Address the slowest important student paths first.
- Review image, font, bundle, and route-loading behavior based on measurements.
- Set performance budgets after establishing baselines, and monitor meaningful regressions.

## 7. Production observability and quality

### Confirmed implementation gaps

- Mobile error handling and telemetry hooks exist, but no production telemetry sink is configured. Events currently use a temporary in-memory buffer and development logging.
- Arena device attestation is disabled following a suspected native crash. The source does not establish that attestation caused the crash.
- Installed-build behavior and the distribution status of the latest changes still need verification.

### Implementation

- Connect existing error and event hooks to a production reporting destination.
- Include build/update identifiers, platform, flow, and relevant technical context without collecting private answer text or unnecessary personal data.
- Measure important journey starts, completions, failed submissions, and recovery outcomes.
- Record validation against an exact commit, installed build, and backend environment.
- Investigate attestation on physical devices before considering reactivation. Follow the existing source requirements, including moving native work away from the answer/registration submission path.
- Define ownership for reviewing failures and resolving recurring issues.

### Acceptance criteria

- A controlled test error reaches the reporting destination with the correct build context.
- Failed critical actions can be located and diagnosed without relying on a student's screenshot.
- Validation records identify the tested build and environment.
- Attestation remains disabled until its documented investigation and validation conditions are met.

## 8. Verification matrix

| Journey | Required scenarios |
| --- | --- |
| Startup and accounts | Fresh install, returning session, offline launch, sign-out, account switch, slow profile sync. |
| Onboarding and invitations | Ordinary first launch, invitation before login, interrupted onboarding, cold/warm link opening. |
| Learning | Start, resume, ask Sandra, complete lesson, failed save, reconnect, targeted practice. |
| Exams | Start, draft recovery, background/resume, submit, retry, results, history. |
| Friend challenge | Create, share, open signed out, complete, return to results. |
| Arena participant | Register, wait, enter, answer, reconnect, background/resume, provisional results, official results. |
| Arena spectator | Follow school, clear preference, view current question, expand board, reconnect, final state. |
| Notifications | Grant, deny, enable later, tap while app is closed/open, sign out. |
| Accessibility | Large text, screen reader, reduced motion, keyboard on web, contrast and touch targets. |
| Responsive behavior | Small phone, larger phone, supported tablet, desktop, long localized content. |

Run a representative real event with at least two physical phones and one browser. Record cross-device synchronization, interruptions, and provisional-to-official transitions. Add focused regression tests for defects found; avoid tests that only repeat implementation details.

## 9. Larger feature opportunities

These are product expansions, not prerequisites for making the existing product feel premium:

- Live skill-based matchmaking.
- Seasonal school leagues and class fixtures.
- Downloadable revision packs or a managed offline library.
- A fully native demo and additional native replacements for browser handoffs.
- Richer native ceremonies and phase-aware sound.

Evaluate each against student needs after the main journeys are reliable. Existing quizzes, asynchronous challenges, XP boards, and scheduled championships should not be presented as already delivering matchmaking or a seasonal league.

## Definition of done

A journey is ready when it is understandable on first use, preserves appropriate context, saves and submits correctly, recovers from expected interruptions, works across the agreed device matrix, and produces actionable diagnostics when it fails.

Visual review, automated logic checks, accessibility checks, and hands-on journey validation provide different evidence. Use them together before calling either platform consistently premium.
