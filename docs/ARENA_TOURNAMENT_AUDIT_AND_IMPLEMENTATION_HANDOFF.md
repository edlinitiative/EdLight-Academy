# EdLight Academy — Arena tournament audit and implementation handoff

Audit date: September 19, 2026  
Audited repository HEAD: `8af550b12f80407f4468df7a879b08bfe56fe823`  
Audience: Claude Code and the EdLight Academy product owner

## Read this first

**Verdict: preserve the foundation, but do not launch this implementation for cash prizes yet.**

The existing work is substantially more than a quiz: a separate tournament backend, four mobile screens, school scoring, an admin console, prize claims, and an event-driven broadcast system. Several individual pieces are thoughtful. The main failure is integration: important guarantees described in comments and design documents are not enforced across the complete system.

The audit confirmed exploitable scoring behavior, incomplete individual rankings, broken discovery links, and missing event automation.

This document preserves the audit and adds implementation acceptance criteria for handoff. It is not a claim that any fixes have been implemented. The audit changed no repository files. The subsequent request authorized saving this document; it did not itself authorize implementation, deployment, production data changes, or prize distribution. Claude should obtain the owner's implementation instruction and scope before starting changes.

### Instructions for the implementing agent

- Re-read the current code and git diff first. This audit describes the commit above; later changes may already address findings.
- Treat code behavior and reproduced evidence as authoritative. Several existing comments describe guarantees the code does not enforce.
- Preserve working architecture unless there is a concrete reason to replace it.
- Address Phase 1 before investing further in broadcast animation.
- Keep ordinary practice XP separate from cash-prize results.
- Use isolated test/staging data for adversarial tests and rehearsals. Do not test scoring exploits against a real competition.
- Report changes, tests, remaining limitations, and deployment/migration dependencies explicitly.
- Do not describe a hook, endpoint, or pure-function test as proof that the complete feature works.

## Product vision and constraints

The intended product is a **monthly national individual trivia championship with strong school identity**:

1. Students across Haiti join a synchronized live competition, likely the last Sunday of the month around 6 PM. Exact schedule remains a product decision.
2. Advance registration is supported. Actual competition is played through the EdLight Academy mobile app.
3. Everyone receives questions at approximately the same time.
4. Rankings update throughout the event and create the feeling of a live national competition.
5. Individual standings show player name, school abbreviation, score/rank, and useful competitive information. Profile photos are not required.
6. School identity matters. Students select a school during registration/profile setup and may submit a missing school's full name and commonly used abbreviation.
7. Examples supplied by the owner: Collège Dominique Savio → CODOSA; Saint-Louis de Gonzague → SLDG; Collège Marie Dominique Mazzarello → CMDM.
8. Monthly prizes: first $100, second $50, third $25.
9. Anti-cheating and fairness matter because money is involved: supported screenshot prevention, copy restrictions, backgrounding signals, server-side scoring, and server-controlled timing.
10. Nonplayers should eventually follow Top 10, rank changes, schools, progress, score gaps, major movements, and the final podium. The ambition is a sports/esports-style watch-party or Instagram Live broadcast.
11. School-level competition should be supported, but individual participation must not depend on a school qualifying.

The existing implementation frames the product primarily as an inter-school championship. Do not assume that emphasis, the default five-player qualification rule, or existing eligibility restrictions are approved final product decisions.

## Audit scope and verification

Inspected: web/mobile architecture, Firebase authentication and rules, tournament APIs, scoring, school models, admin controls, broadcast code, relevant tests, and recent git history.

Verification performed:

- Ran current web source locally; webpack compiled successfully.
- Inspected public homepage, trivia hub, spectator page at desktop and phone widths, and the tournament invitation destination.
- Launched the existing iOS simulator build. It displayed **“No script URL provided”**, preventing native gameplay inspection without further setup.
- Ran **523 targeted web/API tests and 54 targeted mobile tests**, all passing.
- Completed web, API, and mobile TypeScript checks using the appropriate configurations/toolchains. Invoking the mobile check with the root TypeScript 6 binary initially hit a `baseUrl` deprecation configuration error; the mobile-local compiler passed.
- Reproduced the late-answer scoring defect using the existing scoring function in memory.
- Confirmed git status remained clean after the audit.

Commands used for targeted tests:

```sh
# Repository root
npm test -- --runInBand --no-cache --watchman=false --testPathPattern='arena|schools|tournament|liveStandings|leaderboardAgg'

# mobile/
npm test -- --runInBand --no-cache --watchman=false --testPathPattern='arena|tournament|triviaXp|leaderboardWeek'

# Repository root
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --noEmit -p api/tsconfig.json

# mobile/
./node_modules/.bin/tsc --noEmit
```

Limits of verification:

- The local webpack server does not run the Vercel API backend.
- No accounts were created, players registered, tournaments advanced, or live data deliberately altered.
- Native tournament layouts and authenticated admin screens were reviewed in source, not visually verified in a working authenticated session.
- Repository rules/configuration were inspected; their deployment state was not independently verified.
- An external scheduler could exist outside this repository. None was found in the audited code/configuration.
- Passing tests do not establish end-to-end correctness, production security, or national-event capacity.

## A. What exists today

There are two separate competition systems:

| System | Actual behavior |
|---|---|
| Existing trivia and games | Ordinary quizzes, daily challenges, arcade games, XP, weekly/all-time individual and collective leaderboards. |
| New Arena | Scheduled synchronized tournament with separate registrations, questions, answers, scores, standings, events, and prize claims. |

The separation is appropriate. Ordinary games calculate results on the client and are unsuitable as the authority for cash prizes. The ordinary award API accepts client-supplied XP/score values, and transitional Firestore rules still allow bounded client leaderboard writes. Do not use those totals for prize eligibility.

The Arena includes a mobile announcement card, school selection, registration lobby, pre-game doors screen, synchronized question screen, results screen, server scoring, default best-five school scoring, admin console/question editor, public `/direct` broadcast, provisional results, claims, guardian consent, and prize roll-down logic.

Default prizes are correctly represented as $100, $50, and $25.

Recent history:

| Commit | Addition |
|---|---|
| `2757cc8` — #105 | Arena foundations, scoring, events, director |
| `e1f455b` — #106 | Mobile registration and gameplay |
| `697477f` — #107 | Broadcast scenes and Haiti map |
| `8af550b` — #108 | Home/dashboard discovery links |

The latest commit explicitly acknowledges that registration previously existed without a usable entrance.

References: `mobile/src/screens/arena/`, `api/arena/`, `docs/design/2026-09-17-arena-tournament-design.md`, `api/leaderboard/award.ts`, `firestore.rules`.

## B. Current user flow

| Stage | Student experience | Problem |
|---|---|---|
| Discovery | Home shows an Arena card during `registration` or `doors`; web Dashboard links to app download. | Card disappears at `live`, removing normal re-entry when it may be needed most. |
| Registration | Select school, confirm attestation, submit using the app's stored grade. | School is not unified profile identity. Missing grade/sign-in produces instructions rather than a direct completion flow. |
| Confirmation | Registration and school qualification progress. | Name/progress depend partly on standings not produced during registration. Reopening can show missing/misleading information. |
| Countdown | Counts down to doors, then scheduled start. | Uses phone clock. Zero does not advance the server state. |
| Joining | Press “Entrer dans l’Arène,” enter doors screen. | Presence can already be recorded from lobby; no reliable enforced roster cutoff tied to this experience. |
| Waiting room | Countdown, counts, qualification, arriving schools. | Inputs are missing/inconsistently named; arrival data depends on standings unavailable in this phase. |
| Questions | Question, four choices, tier timer, one-tap answer, shared reveal. | UI locks and says sent before confirming acceptance; no visible recovery for failed submission. |
| Scoring | Correct answers earn 1,000 or 500 depending on elapsed time. | Time is partly client-influenced; late answers can earn points after reveal. |
| Leaderboard | School position between questions; personal score if included in public standings. | Students outside sampled school top five may never appear; no complete national tournament leaderboard flow. |
| Results | School contribution, score/rank if available, provisional notice, winner claim action. | Many get “score will appear here” although aggregation prevents it from appearing. |
| Next event | “Prépare le prochain avec ton école.” | Navigates to the same completed event ID. |

Confirmed route failures:

- Invitation shares `https://academy.edlight.org/arena`; that route rendered **“Page introuvable.”**
- Mobile deep-link configuration maps `defi/:code`, not Arena tournament routes.

References: `mobile/src/components/ArenaAnnounceCard.tsx`, `mobile/src/hooks/useArena.ts`, `mobile/src/services/arenaService.ts`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/screens/arena/ArenaResultScreen.tsx`, `src/App.tsx`.

## C. Architecture

| Layer | Implementation |
|---|---|
| Web | React 18, TypeScript, webpack, React Router |
| Mobile | Expo SDK 54, React Native, React Navigation |
| Client state | Zustand for app/session preferences, React Query for request-based data, Firestore listeners for Arena realtime reads |
| Authentication | Firebase email/password and Google; mobile also supports Apple |
| Backend | TypeScript Vercel serverless handlers using Firebase Admin |
| Database | Firestore |
| Consent files | Cloud Storage with restricted access |
| Realtime | Firestore `onSnapshot`, no dedicated tournament socket server |
| Scheduling | Vercel crons plus manually invoked admin endpoints |

Generated Data Connect code also exists, but Arena persistence is Firestore.

| Path | Purpose |
|---|---|
| `tournaments/{tid}` | Schedule, state, question pointer, configuration |
| `tournaments/{tid}/questions/{index}` | Private questions and answer keys |
| `tournaments/{tid}/live/{index}` | Delivered question, timing window, eventual reveal |
| `tournaments/{tid}/players/{uid}` | Private running totals and integrity flags |
| `tournaments/{tid}/answers/{uid}_{index}` | Recorded submissions |
| `tournaments/{tid}/standings/current` | Public aggregate rankings |
| `tournaments/{tid}/events/{seq}` | Broadcast event feed |
| `tournaments/{tid}/roster/{schoolKey}` | Frozen school qualification |
| `tournaments/{tid}/claims/{uid}` | Claim and review |
| `tournamentRegistrations/{tid}_{uid}` | Registration |
| `schools/{id}` | Submitted/stored schools |

State machine:

```text
draft → registration → doors → live → grading → provisional → final
                               (void is possible before final)
```

Default timing/scoring:

- 20 seconds per question, approximately 10 seconds between questions.
- 1,000 points for a correct answer within 12 scoring seconds.
- 500 points through 20 scoring seconds.
- Client-reported render time can shift scoring start by up to three seconds.
- Answer creation and player updates occur in a single Firestore transaction.

Missing orchestration:

- No configured cron invokes `/api/arena/advance`.
- Admin interval updates display time, not question progression.
- `advance.ts` does not invoke aggregation on close, despite the design document saying it does.
- Aggregation cron runs once per minute independently of question boundaries.
- No complete automated registration-to-doors lifecycle was found.

References: `shared/arena/state.ts`, `shared/arena/scoring.ts`, `api/arena/advance.ts`, `api/arena/answer.ts`, `api/arena/aggregate.ts`, `vercel.json`.

## D. What is good and should be preserved

1. Arena scoring is separated from practice XP.
2. Private answer keys and explicit field-by-field delivery payloads.
3. Transactional answer recording with one answer document per player/question.
4. Shared pure scoring/state functions.
5. Answer endpoint returns a receipt instead of immediate correctness. The intent is right, although another publication path defeats it.
6. Backend role checks and rules preventing self-assignment of admin roles.
7. Localized school matching: accents, abbreviations, aliases, known distinct schools, duplicate suggestions.
8. Provisional/final result distinction.
9. Typed broadcast events separated from presentation.
10. Reusable mobile theme tokens, haptics, reduced-motion support, and common components.

References: `shared/arena/scoring.ts`, `shared/arena/state.ts`, `firestore.rules`, `shared/schools.ts`, `shared/arena/director.ts`, mobile theme/components.

## E. Weaknesses and launch risks

### E1 — Critical: answers can earn points after reveal

Reproduced with the existing scoring function:

| Input | Value |
|---|---:|
| Opens | 0 ms |
| Closes | 20,000 ms |
| Reported render time | 3,000 ms |
| Answer received | 21,000 ms |
| Calculated elapsed | 18,000 ms |
| Awarded points | **500** |

The answer endpoint accepts submissions during a late grace period. It excludes late answers from some counters but still adds `scored.points`. If the question has closed/revealed, a modified client can submit the known answer during the remaining scoring grace.

Force-close creates another exposure: it reveals the key without changing the original `closesAt`; answer acceptance does not require the live document to remain open.

Fix the combined acceptance/scoring/reveal protocol, not only one conditional. A recorded late answer must never improve points, tie-breaks, school totals, streaks, or broadcast accolades.

References: `shared/arena/scoring.ts` (`scoreAnswer`, `clampShownAt`), `api/arena/_shared.ts` (`decideSubmission`), `api/arena/answer.ts` (late handling and score update around audited line 285), `api/arena/advance.ts` (close/reveal).

### E2 — Critical: public standings can disclose correctness mid-question

Player documents are hidden, but aggregation reads current player totals and publishes them while the tournament is `live`, without requiring the current question to close. Colluding accounts can submit different options and inspect a public update that lands inside the window.

Protection must cover every public score-derived channel: standings, events, school averages, fastest answers, and private result views exposed before close.

Reference: `api/arena/aggregate.ts` (`aggregateOne`).

### E3 — High: automatic event progression is not complete

The interface promises automation but no working runner is present in repository configuration. Manual controls exist; they are not equivalent to a dependable automatic clock. An external runner remains unverified.

References: `src/pages/admin/AdminArena.tsx`, `api/arena/advance.ts`, `vercel.json`.

### E4 — High: roster can freeze near doors opening

The every-minute doors-close cron selects events in `doors`. `planDoorsClose()` permits freezing from that state alone without checking the scheduled cutoff. A ten-minute waiting room can freeze qualification during its first minute.

Additional issues:

- Registration/presence continue after freeze.
- Starting does not require completed freeze.
- Aggregation uses frozen counts for qualification but does not restrict scoring contributors to the frozen present roster.
- Registration/presence read tournament state outside their write transactions.

References: `api/arena/doors-close.ts`, `register.ts`, `presence.ts`, `state.ts`, `aggregate.ts`.

### E5 — High: individual rankings are incomplete by design

The aggregator fetches only a small player pool per school—five under defaults—and builds individuals from those pools. If the six best national players attend one school, the sixth is absent and a weaker player elsewhere appears ahead.

Consequences: wrong national Top 10, missing personal results, incomplete prize roll-down pool, and conflation of “not in the school five” with “not ranked individually.” The query's tie ordering also omits the complete individual tie-break chain.

Reference: `api/arena/aggregate.ts` (`loadPool`, `buildSnapshot`, `INDIVIDUAL_POOL`).

### E6 — High: failed answers appear successful

`ArenaLiveScreen` locks immediately and says “Réponse envoyée.” It does not use the mutation result to distinguish sending, accepted, offline, or expired. The service often returns `{ok:false}` rather than throwing, so mutation completion is not acceptance. Receipt state is not persisted for re-entry.

References: `mobile/src/screens/arena/ArenaLiveScreen.tsx`, `mobile/src/services/arenaService.ts`, `mobile/src/hooks/useArena.ts`.

### E7 — High: mobile-only participation is unenforced

A Firebase token authenticates an account, not the official app. APIs accept scripted requests. No Arena App Check verification, attested participation session, or enforced single active tournament session was found. Screenshot-blocking hooks are defined but not used by Arena gameplay.

References: `api/_lib/requireAuth.ts`, Arena endpoints, `mobile/src/utils/integrity.ts`.

### E8 — High: review cannot reliably produce corrected official results

- Aggregation does not exclude `eligible:false` players.
- Claim rejection is not a complete disqualification/re-ranking workflow.
- No usable integrity investigation workflow exposes the private answer evidence to authorized reviewers.
- Finalization is not gated on required verification completion.
- Shared ranks are supported in scoring, but prize handling is inconsistent: placeholder creation skips later players at the same rank, while claim fallback can still recognize a tied player as a winner.

References: `api/arena/claim.ts`, `api/arena/state.ts` (`podiumClaims`), `aggregate.ts`, admin console/service.

### E9 — High: school identity is inconsistent

The system mixes bundled seed schools, arbitrary Firestore document IDs, normalized name keys, and weekly leaderboard name strings. Registration validates key syntax rather than canonical existence, permitting fabricated school identities. Server label lookup ignores the bundled seed and does not enforce approved status.

References: `api/arena/_shared.ts` (`schoolLabel`, `isValidSchoolKey`), `register.ts`, `mobile/src/services/schoolService.ts`, `shared/schools.ts`.

### E10 — High: scale and concurrency can corrupt the public picture

- School aggregation silently slices to 250 schools.
- Concurrent aggregates can compute snapshots and commit an older snapshot after a newer one.
- Sequence allocation is protected, but board contents are computed outside the commit transaction.
- Public results live in one growing document.
- Rate-limit check and increment are separate, permitting concurrent excess requests.
- Answer receipt timestamp is taken after auth and Firestore-backed rate limiting, charging some backend latency to the student.

Firestore's maximum document size is 1 MiB. A compact public board is appropriate; making it the complete result store is not. See [Firestore limits](https://firebase.google.com/docs/firestore/quotas).

References: `api/arena/aggregate.ts` (`SCHOOL_CAP`, `commitBoard`), `api/_lib/rateLimit.ts`, `api/arena/answer.ts`.

## F. Product gap analysis

| Requirement | Classification | Assessment |
|---|---|---|
| Monthly tournament | Partially implemented | Manually scheduled events; no complete monthly lifecycle/reminders. |
| Last Sunday around 6 PM | Missing | No recurrence or explicit Haiti-time scheduling workflow. |
| Advance registration | Implemented but needs improvement | Mobile form exists; identity continuity/confirmation weak. |
| Mobile-only competition | Partially implemented | Official UI mobile; backend restriction absent. |
| Approximately synchronized questions | Partially implemented | Timestamps/listeners exist; orchestration/recovery incomplete. |
| Live rankings | Implemented but needs improvement | Disclosure, completeness, and cadence defects. |
| Name, abbreviation, score/rank | Partially implemented | Supported shapes; unreliable labels/individual coverage. |
| No required player photos | Already implemented well | Arena does not require them. |
| School during profile setup | Partially implemented | Tournament/leaderboard pickers, not unified profile identity. |
| Submit full school name/abbreviation | Implemented but needs improvement | Form/pending status exist; moderation/canonicalization incomplete. |
| School competition | Implemented but needs improvement | Best-five scoring; roster/eligibility need repair. |
| $100/$50/$25 | Implemented but needs improvement | Correct defaults/claims; integrity/fulfillment incomplete. |
| Screenshot prevention | Partially implemented | Dependency/hooks unused by gameplay. |
| Copy restrictions | Partially implemented | Native text generally nonselectable; math WebView lacks explicit restriction. |
| Background detection | Partially implemented | Falsifiable client counter; no complete review process. |
| Server scoring | Implemented but needs improvement | Server calculation with timing exploits. |
| Server timing | Partially implemented | Windows exist; complete execution/cutoff enforcement do not. |
| Spectators | Implemented but needs improvement | Substantial presentation with data/operational gaps. |
| National individual Top 10 | Partially implemented | Incomplete standings; main broadcast emphasizes schools. |
| Movements, gaps, progress, podium | Implemented but needs improvement | Scene support depends on flawed aggregates/cadence. |
| Instagram/watch party | Partially implemented | Responsive stage, no finished production workflow. |

## G. Live event experience

The system has the visual ingredients of a national event, but not a dependable event experience.

Positive ingredients: shared start time, schools, simultaneous reveal, question progress, takeovers, podium scenes.

What breaks the experience: disappearing entry, broken invitations, unreliable counts/arrivals, unexplained zero countdown, unreliable submission acknowledgment, missing personal ranking, and incomplete delayed/interrupted/reconnecting/cancelled states.

The student must always know: **I am in the right event; my answer counted; this ranking is current; I know what happens next.**

## H. Spectator and broadcast experience

Real broadcast work exists: school overtakes, lead changes, player contribution, final-question stakes, grading, champions, event priorities/expiry, and scene dwell control.

| Problem | Impact |
|---|---|
| Main board shows eight schools | National individual Top 10 is not primary. |
| Incomplete/incorrect standings | Animation amplifies inaccurate results. |
| School reads require auth | Anonymous spectators cannot reliably populate map under current rules. |
| Map joins by document ID | Stored random or `k-…` IDs differ from normalized keys used by lookup. |
| Pre-show depends on live standings | No proper pre-game arrival/map data source. |
| `counts` versus `countsPublic` | Creation/broadcast and mobile use different fields; player totals lack complete writer. |
| Old final outranks new registration | Automatic selection can keep old event on screen. |
| Director persists across event changes | Sequence/state can carry into next event. |
| Missing inputs for some scenes | School streak not produced; answer writer does not maintain perfect-round state. |
| No producer controls | No dependable hold/replay/manual scene/recovery/delay workflow. |

Recommended changes:

- First-class individual Top 10 with school abbreviation.
- Persistent progress/event phase and visible data freshness.
- Rank movement and gap to next prize position.
- Settled results only after scoring cutoff.
- Producer overrides for automated scene selection.
- Scheduled, delayed, reconnecting, and under-review presentations.
- Purpose-built landscape/portrait layouts.
- Explicit separation of test events from publicly selected events.

References: `src/pages/Direct.tsx`, `src/broadcast/scenes/Board.tsx`, `useOnAir.ts`, `useStage.ts`, `useMapPlaces.ts`, `shared/arena/events.ts`, `director.ts`.

## I. School competition

Keep school search; redesign identity storage and resolution.

The seed has 94 schools. CODOSA is present. The seed entries for Saint-Louis de Gonzague and Collège Marie Dominique Mazzarello lack the owner's requested SLDG and CMDM abbreviations.

| Concern | Recommended model |
|---|---|
| Identity | Stable `schoolId` independent of spelling/name changes |
| Name | Reviewed canonical full name |
| Abbreviation | Verified public short name reflecting local usage |
| Aliases | Alternative names/spellings/abbreviations for search |
| Location | Verified school/campus location, separate from student residence |
| Duplicates | Suggestions and human review, no silent fuzzy merge |
| Student submissions | Pending request with approve/merge/reject workflow |
| Merge | Explicit redirect to canonical school and controlled reference migration |
| History | Preserve event identity/rules snapshot |
| Profile | One school identity reused by registration and leaderboards |

Do not merge distinct campuses solely because names resemble one another. Do not create a new team when correcting a spelling.

Best-five scoring is understandable, but larger schools have more chances to field exceptional players. Decide and publish that tradeoff. School qualification must never prevent individual participation.

References: `shared/schools.ts`, `shared/data/schools-seed.json`, `mobile/src/components/SchoolPicker.tsx`, `mobile/src/services/schoolService.ts`, `api/arena/school-location.ts`, `mobile/src/components/LeaderboardJoinModal.tsx`.

## J. Anti-cheating and fairness

**Current implementation is not secure enough for prizes.**

| Threat | Exposure | Response |
|---|---|---|
| Read reveal then answer | Confirmed late-score path | Hard scoring cutoff before reveal; late evidence has zero competitive value |
| Colluding accounts probe choices | Mid-question aggregate disclosure | Closed-question publication across every channel |
| Scripted play | Firebase token sufficient | Attested mobile session with backend verification |
| Fake render timestamp | Up to three seconds advantage | Remove unilateral client timing control |
| Multiple accounts | No effective device/session policy | Session binding, abuse signals, winner verification |
| Fake school/team | Arbitrary valid-looking keys | Canonical resolution and immutable event roster |
| Suppressed app switching | Client can report zero | Telemetry is evidence, not proof/control |
| Screenshot/copy extraction | Hooks inactive; WebView restriction absent | Activate supported controls and test native behavior |
| Second phone/helper/AI | Not prevented by app controls | Question design, timing, anomaly review, dispute policy |
| Insider question changes | Undelivered questions editable during event; nontransactional check/write | Freeze reviewed question version before competition |
| Selective skipped answers | Missing answers add no response time | Tie-breaks that do not reward omission |
| Ineligible player remains ranked | Aggregate ignores eligibility | Recompute and publish auditable official revision |

Evidence-quality defects:

- `deviceHash()` returns an OS identifier rather than a hash.
- Registration stores that identifier on registration, but answer recording reads it from the player row, where registration does not write it.
- Server reads `x-app-version`; mobile Arena service does not send it.
- Local away duration is not submitted.
- Missed questions do not explicitly break answer-based streaks.

Firebase App Check is useful but does not eliminate all abuse: [official overview](https://firebase.google.com/docs/app-check?authuser=1). Capture prevention requires platform/device verification and cannot prevent photographing another device: [Expo documentation](https://docs.expo.dev/versions/v55.0.0/sdk/screen-capture/). Consult the documentation matching the project's actual Expo version during implementation.

Preserve the principle of flagging suspicious background behavior for review rather than automatically disqualifying. Calls, OS prompts, and connectivity problems are not proof of cheating.

## K. UI/UX critique

### Actually observed

The broadcast has a coherent identity: dark navy, EdLight rays, restrained orange, large countdown, Haiti map. It is distinctive compared with a generic dashboard.

The observed event was “Arène de test,” repeated twice, prominently marked “EN DIRECT,” at `00:00`, with zero schools/players and “Les écoles arrivent…” beside an empty map. The presentation promises activity that the visible data does not deliver.

At phone width it fits, but decorative space dominates. Small widely spaced labels and subdued map details will be difficult to read in compressed video. There is no useful spectator action or explanation for the stale countdown.

The games hub is a conventional learning screen with large repeated cards and a long vertical list. It does not position the monthly event as a centerpiece. Floating chat and navigation compete for phone space.

The shared invitation route visibly fails with a not-found page.

### Native component review — not visually verified

- Recruitment/qualification has greater prominence than personal competition/prizes.
- Qualification can sound like a requirement to play.
- No direct sign-in/profile-completion action beside blocking messages.
- Tier ring is 46 points wide with a nine-point label.
- Tier countdown is not the same as the actual server deadline.
- Selected answer looks submitted regardless of network outcome.
- Screen expects category but server live payload omits it.
- “In the five” result framing undervalues others.
- Close button uses a share icon.
- Next-event action returns to completed event.
- Void/cancelled/missed-event handling is incomplete.

References: `src/broadcast/segments/PreShow.tsx`, `src/pages/Live.css`, `src/pages/TriviaGames.tsx`, all four mobile Arena screens.

## L. Recommended redesign

Make the core product a monthly national individual championship with strong school identity. School competition should use the same trustworthy results.

One permanent event destination should expose state-dependent actions:

| Phase | Primary action |
|---|---|
| Upcoming | Register |
| Registered | View entry / set reminder |
| Check-in | Join waiting room |
| Live and registered | Resume competition |
| Live and not playing | Watch live |
| Reviewing | View provisional results |
| Final | Results and next event |

Participant priorities:

1. Identity: “Marie J. · CMDM.”
2. Readiness: registration, connection, check-in, start time.
3. Clear question and four large choices.
4. Honest sending/accepted/failed receipt.
5. Shared reveal and awarded points.
6. Personal national rank, movement, prize gap, school contribution.
7. Safe recovery after interruption.

Everyone receives their result, regardless of school position.

Retain React Native, Firebase Auth, Firestore, Vercel APIs, shared scoring, and event-driven broadcast. Add dependable orchestration, coherent cutoff/publication, complete result storage, canonical school identity, and integrity review. A custom socket infrastructure rewrite is not justified by this audit.

## M. Prioritized implementation plan

### Phase 1 — must fix before launch

| Priority | Work | Existing locations |
|---|---|---|
| 1 | Close late/revealed answer exploits including force-close | `answer.ts`, `advance.ts`, `_shared.ts`, `scoring.ts` |
| 2 | Settled-only publication; prevent stale aggregate overwrite | `aggregate.ts`, `_events.ts`, rules |
| 3 | Reliable progression, cutoffs, watchdog/recovery | `advance.ts`, `state.ts`, `doors-close.ts`, `vercel.json`, admin |
| 4 | Complete individuals independent of school top five | Aggregation, scoring, result hooks, indexes |
| 5 | Receipts, retries/status, reconnect/cancel handling | Arena service/hooks/screens |
| 6 | Canonical school identity and roster enforcement | School service, registration/presence/roster/profile |
| 7 | Mobile sessions, capture controls, useful evidence | Auth/API boundary, integrity hooks, Arena service |
| 8 | Review, disqualification/re-ranking, ties, finalization gates | Claim/state APIs, admin |
| 9 | Fix routes, re-entry, counters, labels, next-event navigation | App/navigation/cards/hooks |
| 10 | Staging rehearsal and concurrency/network tests | Existing suites plus integration/rules/device coverage |

### Phase 2 — important improvements

- Permanent event hub, explicit Haiti-local time, tournament reminders.
- Reusable school profile, moderation queue, aliases, merges, verified abbreviations.
- Better confirmation and network/device readiness checks.
- Individual leaderboard with nearby ranks, Top 10, school filters.
- Clear bilingual copy, accessibility, small-device testing.
- Question review/versioning, translation equivalence, preview.
- Claim notifications, actual claim status/deadline in app, payment reconciliation.
- Monitoring stalled questions, rejects, stale standings, missing events.

Primary areas: navigation, notifications, school/profile components, Arena screens/hooks, admin questions, claim services.

### Phase 3 — advanced/broadcast features

- Producer console: scene choice, hold, replay, safe delay.
- Dedicated portrait/landscape layouts.
- Individual, school, and podium modes.
- Movement stories from settled snapshots.
- Verified school map and privacy-preserving regional counts.
- Event archive, season history, rivalries, shareable results.

Primary areas: `src/broadcast/`, `Direct.tsx`, shared events/director, public snapshot APIs.

## Implementation acceptance criteria

These are handoff requirements derived from the findings, not tests claimed to have been run during the audit.

### Scoring and disclosure

- Reproduce E1 in a local/integration fixture before fixing it; afterward, every post-cutoff/revealed submission contributes zero competitive value or is rejected according to published policy.
- Cover exact cutoff boundaries, the three-second render claim, missing/falsified timestamps, forced close, last question, duplicate retry, and simultaneous submissions.
- Before reveal, no readable document/response/event reveals current-question correctness through a score, average, counter, streak, or ranking change.
- Duplicate accepted submission returns the original receipt without awarding again. Define behavior for receipt recovery after a question closes.
- Score replay uses immutable answer/question/rules versions and reproduces official results.

### Orchestration and concurrency

- Run a complete event automatically from the approved start action without an admin browser staying open.
- Test runner retry/restart, duplicate ticks, delayed work, missed work, and safe operator intervention.
- Roster cannot freeze before the approved cutoff; start is gated on required preparations.
- Registration/presence cannot race across cutoff to produce contradictory eligibility.
- Older aggregations cannot overwrite newer settled results; publication is tied to a settled question/version.
- Finalization cannot race with in-flight scoring or publish stale provisional standings.

### Rankings, schools, and prizes

- Fixture with at least six nationally leading students at one school: all six retain correct individual positions.
- Every participant can retrieve their result independently of public Top N.
- No silent omission at 251 schools or other configured capacity boundaries.
- School contributor eligibility matches published roster rules; ineligible students are excluded when officially disqualified.
- Resolve CODOSA/SLDG/CMDM consistently from profile to registration to player row to board to broadcast.
- Approve/merge a duplicate without splitting a team or unexpectedly rewriting historical results.
- Test tied prize positions, rejected winners, expired claims, concurrent review/sweep, roll-down notification, and finalization requirements.

### Mobile and spectator experience

- Test on working iOS and Android builds, including smaller screens and slower devices.
- Network loss never displays an unconfirmed answer as accepted.
- Retry/relaunch/reconnect preserve question identity and accepted answer state without double scoring.
- Registered students can resume during `live`; nonplayers can find the broadcast.
- Invitation works with app installed and absent, preserving tournament identity through the supported path.
- Verify screenshot/capture and math selection behavior on supported OS versions; document limitations honestly.
- Anonymous spectator sees correct school abbreviations/map data without access to sensitive player evidence.
- Clearly distinguish live, scheduled, delayed, disconnected, cancelled, provisional, and final states.
- Rehearse participant, operator, and spectator sessions together on isolated staging data.

### Product decisions to confirm before locking rules

- Exact date/time and time zone, registration cutoff, check-in window, late joining policy.
- Eligible grades/ages. Current code allows `7e`, `8e`, `9e`, `NS1`–`NS4`; do not infer this covers all students in the vision.
- Question count, language policy, scoring tiers, tie-breaks, skipped-answer treatment.
- School qualification minimum, top-five policy, and treatment of late attendees.
- Prize tie handling, identity review, claim deadlines, appeals, and payout procedure.
- Public display-name policy, student privacy, and broadcast delay.

## Final handoff summary

### Ten biggest problems

1. Revealed answers can still earn points.
2. Open-question score changes leak through public standings.
3. Automatic progression is not implemented end to end.
4. School rosters can freeze too early and are inconsistently enforced.
5. Individual standings omit students outside sampled school pools.
6. Failed submissions appear successfully sent.
7. Mobile-only participation/capture controls are unenforced.
8. Integrity review and official re-ranking are incomplete.
9. School identity/map joins are inconsistent.
10. Discovery, invitations, counts, and live re-entry are unreliable.

### Ten highest-priority changes

1. Unambiguous scoring cutoff before reveal.
2. Immutable settled-question publication only.
3. Reliable runner and operational recovery.
4. Correct enforced registration/check-in/roster deadlines.
5. Complete individual results separate from school scoring.
6. Confirmed receipts, retries, resume.
7. Attested mobile sessions and connected integrity controls.
8. Review/disqualification/tie resolution/finalization gates.
9. Canonical school identity across profiles and competition.
10. Repair and rehearse complete discovery-to-results flow under poor connectivity.

### Keep

- React Native/Expo, Firebase Auth, Firestore, API architecture.
- Practice/prize separation.
- Private questions and explicit delivery payloads.
- Atomic answers and shared pure functions.
- School search/duplicate suggestions.
- Provisional results.
- Broadcast event architecture and EdLight visual identity.

### Redesign

- Timing, reveal, standings as one coherent protocol.
- Complete individual rankings/results.
- School identity/roster enforcement.
- Discovery, check-in, recovery, results.
- Operator controls and integrity review.
- Broadcast hierarchy that includes individual competition prominently.

### Remove

- Unilateral client render-time scoring advantage.
- Mid-question public score-derived information.
- Silent participant/school truncation.
- Unconditional “answer sent.”
- Broken invitations and same-event next-event navigation.
- Claims of automation/security unsupported by integrated behavior.
- Any use of ordinary XP to determine cash-prize eligibility.

Do not delete ordinary trivia or discard the broadcast system.

### Ideal tournament flow

Discover → permanent event page → sign in → confirm name/grade/school → register → confirmation/reminder → check in → connection readiness/waiting room → synchronized question → submit → confirmed receipt → shared reveal → personal rank/movement and school contribution → repeat → complete provisional result → claim if eligible → review resolves → official podium and next event.

## Expected implementation file map

All paths are repository-relative.

| Area | Existing files |
|---|---|
| Timing/scoring | `api/arena/answer.ts`, `advance.ts`, `_shared.ts`; `shared/arena/scoring.ts` |
| Lifecycle/roster | `api/arena/state.ts`, `register.ts`, `presence.ts`, `doors-close.ts`; `shared/arena/state.ts`; `vercel.json` |
| Results/events | `api/arena/aggregate.ts`, `_events.ts`; `shared/arena/events.ts`; `firestore.indexes.json` |
| Security | `firestore.rules`; `api/_lib/requireAuth.ts`, `rateLimit.ts`; `mobile/src/utils/integrity.ts` |
| Mobile gameplay | `mobile/src/services/arenaService.ts`; `mobile/src/hooks/useArena.ts`; `mobile/src/screens/arena/ArenaLobbyScreen.tsx`, `ArenaDoorsScreen.tsx`, `ArenaLiveScreen.tsx`, `ArenaResultScreen.tsx`; `mobile/src/components/MathText.tsx` where tournament-specific restrictions are needed |
| Discovery/navigation | `mobile/src/navigation/AppNavigator.tsx`; `mobile/src/components/ArenaAnnounceCard.tsx`; `mobile/src/screens/DashboardScreen.tsx`; `src/components/ArenaBanner.tsx`; `src/hooks/useOpenArena.ts`; `src/App.tsx`; `mobile/src/services/notificationService.ts`; notification routing in `mobile/App.tsx` |
| Schools/profile | `shared/schools.ts`; `shared/data/schools-seed.json`; `mobile/src/services/schoolService.ts`; `mobile/src/components/SchoolPicker.tsx`, `LeaderboardJoinModal.tsx`; `mobile/src/screens/ProfileScreen.tsx`; `api/arena/school-location.ts`; related web profile/leaderboard integration |
| Admin/prizes | `src/pages/admin/AdminArena.tsx`, `AdminArenaQuestions.tsx`; `src/services/arenaAdminService.ts`, `arenaClaimService.ts`; `api/arena/questions.ts`, `claim.ts`, `consent.ts`; `src/pages/ArenaClaim.tsx`; consent/storage rules as needed |
| Broadcast | `src/pages/Direct.tsx`; `src/broadcast/useOnAir.ts`, `useStage.ts`, `useMapPlaces.ts`; scenes/segments/styles; `shared/arena/director.ts`, `events.ts` |
| Verification | Existing `api/__tests__/arena*.test.ts`, `src/utils/__tests__/arena*.test.ts`, school tests, hook tests, mobile Arena/navigation tests; new integration/rules/device coverage |

New modules will likely be needed for the event runner, participation sessions, private per-player result retrieval, school moderation, and integrity review. Their boundaries should follow the approved design, not be assumed from this audit.

**Status: audit and handoff only. No implementation, production migration, or deployment has been performed.**
