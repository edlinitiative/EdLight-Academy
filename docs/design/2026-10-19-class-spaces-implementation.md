# Class spaces MVP implementation

Date: October 19, 2026

Status: MVP and the documented later extensions implemented locally; not deployed or accepted as a real school pilot. Firestore rules changed (two new deny-all collections, fixture teachers may read a private fixture room) and must be deployed with the API.

This implements item 3 from [Larger product additions](2026-10-19-larger-product-additions.md): the MVP, then the later extensions (class-vs-class fixtures, verified-class tournament grouping, teacher mastery analytics, houses and full native teacher tools; see [Later extensions](#later-extensions)). No existing `grade` tournament is relabeled as a verified classroom: `grade` keeps its "Classe contre classe" wording and stays a self-declared level.

## Entry and authority

- Web: `/classes`, linked from Profile → Compte → Mes classes. Native: Profile → Mes classes, root `Classes` screen. Both now carry the full teacher tool set.
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

## Later extensions

Code: `api/_lib/classFixtures.ts`, `api/_lib/classAnalytics.ts`, `api/_lib/classCatalog.ts`, `api/_lib/classXp.ts` (the award hook, split out so `/api/leaderboard/award` does not load the fixture engine), `shared/classHouses.ts`, `shared/classViews.ts`, and engine changes in `shared/tournois/{config,scoring,models}.ts` and `api/tournois/{_shared,join,create,play}.ts`. Web panels: `src/pages/classes/ClassExtras.tsx`. Native panels: `mobile/src/components/classes/ClassTeacherTools.tsx`.

### Verified-class tournament grouping

`teamRule: 'class'` ("Classe vérifiée / Klas verifye") is a fourth team rule on the existing engine and on both creation forms. On join the server finds the student's approved membership in an active class (an optional `classId` picks one of several, else the earliest joined) and re-reads that class inside the join transaction. A self-declared grade or school is never used. No membership returns `class_required`.

- Roster and standings carry `classKey` (a hash of the class id, never the id) and `classLabel` (class title · school). The id stays on the server-only player doc. Squads reuse the existing team row display.
- Membership drift: every standings rebuild re-reads each distinct class (bounded at 60) and drops a player who left, was removed or whose class was archived from the class group. Their own points are never edited; they remain an individual row. `start`, `answer` and `live-answer` refuse with `class_required`. Leaving, removal and account deletion also detach the player (best-effort, never aborts the class erasure) and rebuild standings.
- Optional `teamAggregate: 'average'`: the mean of each team's best N who answered, qualifying with `max(2, ceil(N/2))` players. Absent means the Arène sum-of-best-N rule. The field is only stored when chosen, so earlier creations keep their idempotency hash.

### Class-vs-class fixtures

- An active approved teacher proposes from a class they own: themes, 5 to 20 questions, 15/20/30 s, a 1 h to 7 day window, 3 or 5 counted players, average (default) or sum. They get a six-character fixture code (`classFixtureCodes`, server-only) to send to the other teacher.
- The other teacher, also an active approved teacher, previews with the code (only the challenging class's title, school and rules) and accepts for a different class they own, or declines. Both grants and both classes are re-read in the acceptance transaction. The proposer can cancel while it waits; archiving a class withdraws its waiting challenges. Limits: three waiting challenges and eight listed fixtures per class.
- Acceptance creates the engine tournament in the same transaction: window format, `teamRule: 'class'`, private, no PIN, `classIds` = the two classes, `classTeacherUids` = both teachers (they may watch the room; neither plays). A start that passed while waiting opens two minutes after acceptance.
- Students enter only from Mes classes (`fixture-join`), under their first name, for their own class; the engine re-checks membership. A bare tournament id is refused (`pin_required`). The room, timing, question draw and scoring are the unchanged engine.
- Both class boards show the fixture, its phase and the two class scores from the server-rebuilt standings. Opening the board runs the same idempotent catch-up as the tick, so a closed window shows its final result. A class below its minimum cannot win.

### Teacher mastery analytics

Owner-only `analytics` action. The server reads the published `catalog.json` (30-minute cache) and, for approved members who accepted the current disclosure, the one shared mastery doc per student (`users/{uid}/mastery/lessons`). Only the lesson map is read. The response holds per-chapter and per-lesson level counts and percentages, the class average per chapter, the three weakest chapters, per-student chapter levels and assignment completion, on-time and late rates. It never holds `bestPct`, timestamps, exercise or exam answers, or Sandra transcripts. The course defaults to the class's level (NS1 to NS4) and is selectable.

The disclosure (`CLASS_PRIVACY`) now names mastery levels and fixtures and is consent version 2. Members who joined under v1 are excluded from analytics and counted as "not yet shared" until they tap the re-accept card. Classmates now see first names only on the class board; the teacher still sees the stored name.

### Houses

The teacher splits a class into 2 to 6 named houses with distinct colours from a fixed palette. The automatic split is a snake draft over this and last week's practice XP, so headcounts differ by at most one. "Keep" preserves assignments when renaming. A newly approved student joins the smallest house, and the teacher can move a student. The weekly board shows each house's XP total, members and completed assignments; students see their own house. Removal, leaving and account deletion clear the assignment.

### Native teacher management

`ClassesScreen` now has create class, the join code, approve and reject, assign an exam (searchable slim catalog, due-date presets at 22:00 device time), per-student assignment status, remove and archive (both confirmed), houses, fixtures (propose, cancel, accept by code, open the room) and analytics, plus the student fixture entry, house and re-accept card. No new native dependency.

### Account deletion

Student: membership, pending request, completion records, weekly entries and house assignment are removed, and they are detached from class tournaments (their tournament rows are then pseudonymized by the existing competition deletion through `myTournaments`). Teacher: waiting challenges and their codes are deleted; played fixtures keep their numbers with the deleted side renamed "Classe supprimée" and the teacher removed from `classTeacherUids`; owned class trees are deleted as before. A deleted teacher's class has no members, so a later standings rebuild of an unfinished fixture drops that side's group.

### Tests and local results (extensions)

`api/__tests__/classExtensions.test.ts` has 20 tests: fixture acceptance and authority, engine integration end to end with server scoring and first-name rosters, outcome rules, average and sum fairness, aggregate validation, verified-class grouping, membership drift on remove, leave and archive, analytics aggregation with no answer leakage and consent filtering, house validation, balancing and totals, and account deletion including a failing detach. The teacher web flow is in `src/pages/__tests__/classes.test.tsx`, two native flows in `mobile/src/screens/__tests__/classes.test.tsx`.

- Root jest: 228 suites / 2,984 tests passed. Mobile jest: 103 suites / 1,013 tests passed.
- Web, API and native TypeScript passed. Root and native lint: 0 errors (existing warnings only).
- `release:inventory` and `release:check`: ledger valid, 126 declarations, 0 open capability mismatches. The release decision remains **BLOCKED**.
- The emulator rules suite was not rerun in this pass. The two new collections are deny-all and the private-tournament read gains `classTeacherUids`.

### Pilot notes for the extensions

1. Deploy `firestore.rules` with the API. Without it the accepting teacher cannot open a private fixture room.
2. Run one fixture between two pilot classes, ideally one small and one large, with the default average of best five. Check both boards after the window closes, and that a removed student stops counting.
3. Ask pilot students to re-accept the updated disclosure; analytics shows how many have not.
4. Confirm the default course per class level, and that teachers can act on level counts without raw scores.
5. Houses: watch whether weekly totals stay close after an automatic split; rebalancing is one tap.
