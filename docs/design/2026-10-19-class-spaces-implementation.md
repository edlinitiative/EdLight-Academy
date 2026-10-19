# Class spaces MVP implementation

Date: October 19, 2026

Status: implemented locally; not deployed or accepted as a real school pilot.

This implements item 3's MVP from [Larger product additions](2026-10-19-larger-product-additions.md). Teacher creation/approval/publishing is web-first; students have web and native screens. Fixtures, verified-class tournament grouping, teacher mastery analytics, houses and mobile teacher authoring remain later work. No existing `grade` tournament is relabeled as a verified classroom.

## Entry and authority

- Web: `/classes`, linked from Profile → Compte → Mes classes. Native: Profile → Mes classes, root `Classes` screen.
- Admin → Candidatures enseignants: approve the application using the existing workflow, then **Activer le pilote classes**. The API resolves the application's email to an existing **email-verified** Firebase Auth account. A public instructor profile, matching school name or self-declared profile role is not a teacher grant.
- **Révoquer l’accès classes** disables creation and management; read access to owned classes remains. Existing students retain their class and can leave. Close a pilot class by archiving it before revoking the teacher if its assignments should close.
- Teachers create a titled school/level class with a random six-character code. Students explicitly accept the bilingual sharing disclosure before requesting membership. Code possession grants no roster, assignment or board access. Teacher approval makes membership active.
- Limits: five classes per teacher, five joined/pending classes per student, sixty approved students and sixty pending requests per class, thirty assignments. These are pilot bounds, not capacity evidence for a large deployment.

## Assignments and boards

Teachers choose an existing published exam from the slim catalog and a deadline. The API validates the per-exam asset before publication. The due-date form uses the teacher device's local timezone; rendered deadlines explicitly use Haiti time.

Saved exam submission requests class reconciliation after the Firestore batch acknowledges. If that request is interrupted, opening the class reconciles outstanding assignments against the student's saved submitted attempts. A manual confirmation/retry remains available. An earlier attempt or in-progress retake is not counted. Completion uses the server timestamp, is idempotent per student/assignment and records late submissions without silently refusing them.

Assignment scores are recomputed server-side from the saved answers with the existing objective-question grader; client-supplied summary scores and AI judgements are not trusted. The teacher sees objective percentages and completion/late status, never answers or Sandra transcripts. Written items are excluded; an all-written paper has no objective score. These remain practice records, not official grades or competition results. The first accepted completion is retained; retakes do not replace it.

Class XP is written in the existing leaderboard award transaction. A retried `opId` cannot double-award either board. Legacy awards without operation ids retain their existing retry semantics. XP inherits the existing practice-award limits/trust model and is explicitly excluded from competition ranking. It is not proof of mastery.

Each class has one aggregate document per UTC Monday week (`weeks/YYYY-MM-DD`) and one bounded completion aggregate (`state/completions`). Board reads do not fan out over students or their private answer histories. Reconciliation reads only this student's still-uncompleted assigned attempts.

## Privacy and recovery

All four new top-level collections (`classes`, `classAccounts`, `classTeachers`, `classCodes`) deny direct client reads and writes. `/api/classes` verifies identity, authorizes each action, rate-limits reads/writes and sends `private, no-store` responses. All query fields use existing automatic single-field indexes.

Only approved members see classmates' names, weekly practice XP and weekly completion counts. Pending names, join code and assignment score details go only to the owning teacher. Student names come from the authenticated name or an explicitly supplied alias. No new phone number or guardian contact is collected.

Leaving, rejection and removal clear membership and stored assignment details; the person disappears from the rendered board immediately on refresh. Historical numeric weekly entries are hidden once membership ends. Account deletion also removes those entries, class membership, pending requests and the teacher grant. Deleting a teacher's account removes their bounded class trees/codes and other students' class references. The existing account-deletion endpoint's best-effort warning behavior still applies.

The shared UI controller uses each platform's own React hooks, prevents duplicate mutations, discards stale account responses and keeps failed selections retryable. Requests have a fifteen-second deadline including token acquisition. Native focus/foreground and explicit refresh re-read current state. No new native dependency or associated-link claim was added; students enter the code from Mes classes.

`class_joined` is emitted on successful teacher approval with technical metadata only. It is an approval count, not a student-session attribution event. Pilot retention and sign-up attribution still require production measurement; no outcomes have been inferred from tests.

## Baseline and acceptance

Source baseline before this change: no class-space collection/API/screen or verified-class membership flow. Items 1 and 2 already had implementation and regression tests; see the status note in the evaluation document. Production usage, retention and grading-agreement baselines were not available in this local session and have not been invented.

Before starting the four-week school pilot:

1. Select one or two partner schools and named operators; record active-days, enrollment and assignment-completion baselines using authorized production data.
2. Deploy the API/rules/web candidate and a compatible app update together; no deployment was performed here.
3. Verify on browser and installed iOS/Android: approved teacher → create → student request → approve → exam → acknowledged submission → class return → one completion; repeat with disconnect, app kill and account switch.
4. Test an outsider, pending student, removed student and revoked teacher. Verify they cannot read/manage protected data through either the API or Firestore.
5. Test teacher/student account deletion and verify the removed identity is absent from class data and responses.
6. Record exact build evidence, French/Kreyòl usability and low-end-device performance. Teacher essay calibration still needs 20–30 real marked copies; no calibration-quality claim is made by the rubric code.

Automated coverage lives in `classSpaces.test.ts`, `classesRoute.test.ts`, `leaderboardAwardIdempotency.test.ts`, `useClasses.test.tsx` and `classClient.test.ts`. In-memory serialized transactions test the domain logic, not real Firestore contention; emulator/device evidence is separate.

## Local verification results

- The classroom-focused web/API run passed six suites / 27 tests, including the rendered web flow, account-switch clearing, consent, authorization, first completion, retry, deletion and XP idempotency. Native classroom rendering/navigation and leave confirmation passed two tests.
- Existing explanation and essay grading regressions passed on both platforms, including written-answer failure/pending behavior and the dissertation rubric.
- Web, API and native TypeScript passed. Focused lint passed with no errors. Web production build/prerender and both iOS/Android Metro exports passed. Existing web bundle-size and browser-data warnings remain.
- `npm run test:competition:emulator` passed the rules checks, including attempted classroom reads/writes by unauthenticated, member, host and entrant clients. All three real transaction tests passed; the new test proves four retried creates produce one class/code, and two approvals racing for one seat admit exactly one student.
- The initial sandboxed emulator setup could not resolve the tooling registry; the authorized retry installed isolated test tooling and completed against `demo-edlight-competition` only.
- Release inventory now contains 126 web route/native screen declarations; structural validation passes. The release decision remains **BLOCKED**. None of these checks establish installed-device, production or four-week school-pilot acceptance.
