# Advertised competition capabilities

Date: October 19, 2026 · Source state: `9280926` (after PR #115) · Release decision: **BLOCKED**

This is the readable summary of `advertisedCapabilities` in [`candidate.json`](candidate.json). It covers what the website and the iOS/Android apps **promise** about Arène and competitions: navigation, buttons, empty states, permission prompts, push copy, marketing/meta text and the in-repo store listing. Each row maps to contract requirements ([release contract](../2026-10-18-premium-product-release-readiness.md)) and journeys J01–J14 ([user journeys](../arena-competition-platform/USER-JOURNEYS.md)).

This is a source audit. Nobody exercised the rendered website or installed builds for it, and no row is `Verified`. Learning, exam and Sandra claims are outside this pass, so MAP-01/MAP-02 still need their own rows.

## How to read and maintain it

- **Status** uses the contract vocabulary. `Implemented/unverified` means code and automated tests exist. `Failed` means the advertised claim is contradicted by the current code or flags. `Not implemented` means the work is pending.
- **Where advertised:** each `advertisedAt` entry quotes the copy verbatim (`match`). `npm run release:inventory` refreshes its line number. If the copy changes, `release:check` prints a re-map warning and `release:gate` fails with `Unmapped advertised copy`.
- `release:gate` fails for every advertised row without `Verified` status, an owner, scenario IDs and complete evidence, and for every mismatch whose `status` is not `Resolved`.
- Automated tests are regression evidence only. Every row still needs the installed-build, browser and rendered-state runs listed in its `pendingEvidence`. Most rows also need the real school pilot.
- **Platforms:** W = web, I = iOS, A = Android.

## Inventory

| ID | Advertised capability | Where advertised (file:line) | W/I/A | Requirements · journeys | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ADV-01 | Arène entry points | `Navbar.tsx:45`, `BottomNav.tsx:24`, `ShowcaseSection.tsx:118`, `TodayPair.tsx:127` | W I A | PUR-02, PUR-08, CON-10 · J01 | lobby, homeLayout, useOpenArena | Impl/unverified |
| ADV-02 | Every answer counts for your school; weekly/all-time boards | `ShowcaseSection.tsx:117`, `LobbyLanes.tsx:67`, `ArenaHubPanel.tsx:107`, `app-store-metadata.md:73` | W I A | PUR-03, TRU-06, CON-14 · J06 | rival, podium, lobby | Impl/unverified |
| ADV-03 | Register your school for the championship | `ArenaBanner.tsx:59`, `Dashboard.tsx:731`, `LobbyLanes.tsx:121`, `arenaHubCopy.ts:80` | W I A | CON-01, PAR-05/06, TRU-02, E2E-07 · J06 | arenaSchoolIdentity, arenaSchoolLocation, arenaState (api+web), arenaLobby | Impl/unverified |
| ADV-04 | Championship room, live play, watch, results | `Arena.tsx:139`, `ArenaPlay.tsx:201`, `arenaHubCopy.ts:64` | W I A | CON-09, CON-11, PAR-05, TRU-03/06/07, PRE-09, E2E-07 · J06 J08 | arenaPlay (page+util), arenaAnswer, arenaDoorsClose, arenaAggregate, arenaRateLimitRace, arenaAnswerReceipt, arenaWatch, arenaViewState, arenaStatus | Impl/unverified |
| ADV-05 | “The championship is played in the app” | `Download.tsx:44`, `RouteMeta.tsx:33` | W | PAR-09, PUR-05 · J06 | none | **Failed** |
| ADV-06 | Prize claim (72 h) and guardian consent | `ArenaResultScreen.tsx:232,337` | W I A | TRU-08, TRU-10, PAR-08, CON-14, E2E-07 · J14 J06 | arenaConsent, arenaFinalGate, arenaReview (api+web) | Impl/unverified |
| ADV-07 | Championship demo | `ArenaHubScreen.tsx:65` | W I A | PAR-08, PAR-09 · J01 | arenaDemo | Impl/unverified |
| ADV-08 | Challenge a friend | `LobbyLanes.tsx:50`, `ArenaHubPanel.tsx:121`, `JeuxHub.tsx:335`, `Download.tsx:59` | W I A | CON-07, PAR-06, TRU-03, E2E-04 · J01 | Defi, Defi.submission, duels (web+native), Duels, challengeWebService, DuelsTrust | Impl/unverified, minor mismatch |
| ADV-09 | Mode Histoire (Le tour d’Ayiti) | `ArenaArcade.tsx:333` | W | PUR-02, PAR-09 | arenaArcade | Impl/unverified (web-only) |
| ADV-10 | Create a tournament for your class (private, PIN, multi-day) | `ArenaArcade.tsx:356`, `TournoisCreate.tsx:110`, `TournoisScreen.tsx:374` | W I A | PAR-02, PAR-04, PAR-09, CON-12, TRU-03 · J07 J02 J03 | tournoisEngine, tournoisLogic, tournoisCreate + tournoisCreateForm (native) | Impl/unverified (mismatch resolved) |
| ADV-11 | Join with PIN, public tournaments, play, history | `ArenaArcade.tsx:359`, `TriviaGames.tsx:932`, `TournoisScreen.tsx:400,415`, `CompetitionWorkspaceScreen.tsx:457` | W I A | PAR-02, CON-09/10, TRU-03/05, E2E-05 · J01 J02 J03 | tournoisAttempt, tournoisEngine, tournoisLogic, tournoisDiagnostics (web+native), tournament, arenaOpenTournament, arenaLinks | Impl/unverified |
| ADV-12 | Mon activité / competition discovery hub | `ArenaArcade.tsx:201`, `ArenaHubPanel.tsx:133`, `workspace.ts:406,438` | W I A | PUR-02/03/08, PAR-05, CON-10, TRU-05 · J01 J08 | competitionWorkspace, competitionPolicy, competitionEmulator, test_competition_rules, competitionContinuity, TaskForm | Impl/unverified |
| ADV-13 | Personal invite code | `workspace.ts:199` | W I A | CON-08, PAR-03, TRU-04 · J05 | competitionWorkspace, competitionEngine | Impl/unverified, minor mismatch |
| ADV-14 | Create a team (flag-gated) | `workspace.ts:249` | W I A | CON-08, PAR-03, TRU-04, E2E-06 · J04 | competitionEngine, competitionEmulator, competitionPolicy | Impl/unverified |
| ADV-15 | Team invitations, recruitment, captain transfer, leave | `workspace.ts:567`, `notifications.ts:72` | W I A | CON-01, CON-08, PAR-03, TRU-01/04 · J05 | competitionEmulator, competitionEngine, arenaLinks, competitionContinuity | Impl/unverified |
| ADV-16 | School membership, host verification | `workspace.ts:319,383`, `notifications.ts:104` | W I A | TRU-02, TRU-10, PAR-04, CON-12 · J06 J07 | competitionEngine, competitionPolicy, competitionEmulator | Impl/unverified |
| ADV-17 | “Organiser” panel / prepare an event | `workspace.ts:302,310` | W I A | CON-12, PAR-04, PAR-09, PUR-07 · J07 | competitionEngine, competitionWorkspace, TaskForm | **Failed** |
| ADV-18 | Event entry, follow, starters, approval, withdrawal | `workspace.ts:1071`, `TournoisScreen.tsx:471`, `notifications.ts:127` | W I A | PUR-04/05, CON-08, PAR-03, TRU-04, E2E-05/06 · J01 J04 J08 | competitionEngine, competitionEmulator, competitionWorkspace | Impl/unverified |
| ADV-19 | Organizer operations and disputes | `workspace.ts:1510,1248` | W I A | CON-12, PUR-07, PAR-04, TRU-06/10, E2E-08 · J07 | competitionEngine, competitionWorkspace, competitionEmulator | Impl/unverified |
| ADV-20 | Physical check-in and public projector | `workspace.ts:1269,1520` | W I A | CON-13, PRE-10, PAR-04, TRU-05, E2E-10 · J10 | competitionEngine, competitionWorkspace (no projector render test) | Impl/unverified |
| ADV-21 | External activities and external rewards | `workspace.ts:881,911` | W I A | CON-13, PAR-08, TRU-08/10, E2E-10 · J11 J14 | competitionWorkspace, competitionEngine | Impl/unverified |
| ADV-22 | League pilot | `workspace.ts:339,1636` | W I A | CON-14, PAR-05, TRU-06, E2E-11 · J09 | competitionEngine, competitionPolicy | Impl/unverified |
| ADV-23 | Report a problem (moderation) | `workspace.ts:925` | W I A | TRU-10 · J07 J08 | competitionAccountDeletion only | Impl/unverified, **major mismatch** |
| ADV-24 | Competition push notifications (#115) | `notifications.ts:64`, `NotificationCenter.tsx:491` | W I A | CON-11, CON-15, TRU-01/07, PAR-06 · J05 J07 J08 J09 | competitionEngine (mocked push), competitionNotificationTarget, competitionContinuity | Impl/unverified |
| ADV-25 | Competition notification opt-out switch (#115) | `NotificationCenter.tsx:491`, `ProfileScreen.tsx:768` | W I A | CON-15, TRU-01 | NotificationCenter, notificationPrefs, competitionEngine | Impl/unverified |
| ADV-26 | Mon activité inbox, mark all read (#115) | `workspace.ts:227` | W I A | CON-11, PUR-02 · J05 J07 | competitionEngine, competitionWorkspace | Impl/unverified |
| ADV-27 | Shared competition links open the app | `app.json:124`, `apple-app-site-association:13` | W I A | PAR-06, CON-01, CON-11, TRU-11, E2E-12 · J01 J05 | arenaLinks | **Failed** |
| ADV-28 | Account deletion removes your data (#115) | `ProfileScreen.tsx:265`, `DeleteAccount.tsx:52` | W I A | TRU-01, CON-14, E2E-01 | competitionAccountDeletion, accountDelete | **Failed** |
| ADV-29 | Ownerless-event sweep (#115, supporting) | `notifications.ts:155` | W I A | CON-12, TRU-10/11 · J07 | competitionAccountDeletion | Impl/unverified |
| ADV-30 | FR/HT labels and error copy (#115, supporting) | `errors.ts:12` | W I A | PUR-08, PRE-04/05 | competitionWorkspace (missing-message check) | Impl/unverified |
| ADV-31 | Tournament diagnostics (#115, supporting) | — | W I A | TRU-09 · J02 J03 | tournoisDiagnostics (web+native), diagnosticTransport | Impl/unverified |
| ADV-32 | Scheduled competition reminders (1 h / 10 min before start, registration closing) | `shared/competition/notifications.ts` push copy | W I A | CON-15, CON-11, E2E-05 · J02 J03 J04 | `api/__tests__/competitionReminders.test.ts` | Implemented/unverified |
| ADV-33 | Alerts when a championship is announced | `ArenaHubPanel.tsx:266`, `notificationPermission.ts:78` | I A | CON-15, PUR-08 · J06 | notificationPermission | **Failed** |

Full file paths, implementation files, flag behavior and the pending evidence for each row are in `candidate.json`.

## Mismatches: advertised but not delivered as stated

| ID | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| ADV-05 | Major | `ARENA_WEB_PLAY=true` and `/arena/jouer` works, but `/download?from=arena` (linked as “Jouer dans l’application”) and the `/arena` meta description say the championship is played in the app. | **Fix the copy:** make both conditional on `ARENA_WEB_PLAY`, or turn web play off if it is outside the frozen scope. |
| ADV-17 | Major | With `COMPETITION_CREATION_ENABLED=false` (the default), the event-save task is removed, but the “Organiser” panel and its new-events paragraph still render for every signed-in user. | **Hide the copy:** drop the paragraph and the empty panel while creation is disabled, or say “not open yet”. |
| ADV-27 | Major | Android intent filters and the in-app parser handle `/tournois` and `/arena/{competitions,evenements,equipes,invitations,ligues,ecoles}`. The iOS AASA (`public_original/.well-known`) lists only `/defi/*`, `/arena`, `/arena/championnat*`, `/arena/demo*` and `/arena/jouer*`. No `assetlinks.json` is in the repo. | **Implement:** add the paths to the AASA, confirm `assetlinks.json` hosting, and verify with the exact binaries. |
| ADV-28 | Major | Deletion copy (app dialog and `/supprimer-compte`) promises that all data, including results, is deleted. Competition results, rosters, audit, disputes and rewards are kept under a pseudonym (`Compte supprimé`), which CON-14 requires. | **Fix the copy, keep the code:** disclose pseudonymized retention in the dialog, the deletion page and the privacy policy, with a privacy/legal sign-off. (`ACCOUNT_DELETION_SALT` was set in Vercel production on October 19, 2026.) |
| ADV-33 | Major | “On te prévient dès qu’un championnat est annoncé” has no automatic announcement or doors-open push behind it; only the manual admin `send-broadcast` exists. The `arena-event` permission reason has no caller. | **Implement** through the reminder work (ADV-32), or **hide the copy** and make the manual broadcast a named runbook step. |
| ADV-10 | Major (parity), **resolved** | Native creation was a fixed preset: public, solo, starts in 10 minutes, 30 places. Private PIN rooms, team rules, categories and scheduling are web-only, while the arcade advertises private class rooms. | **Implement** private/PIN and start time natively (PAR-04), or declare the limitation under PAR-09 and link to the web form. |
| ADV-23 | Major (operations) | “Signaler un problème” is offered everywhere, but reports reach an admin-only panel with no named owner or triage path. | **Implement the operational side:** assign an owner and runbook before enabling the pilot (TRU-10). |
| ADV-08 | Minor | The unused `/download?from=defi` variant says duels launch only from the app, but the web launches them. | **Hide the copy:** delete or reword the variant. |
| ADV-13 | Minor | The invite code is advertised while no new team can be created (flag off). | **Hide the copy** when creation is off and the user has no team or invitation. |

**Resolved on October 19, 2026:** ADV-05 (arena copy follows `ARENA_WEB_PLAY`), ADV-08 (duels copy), ADV-10 (native creation has every web option incl. private PIN rooms, via shared `creationPayload`), ADV-13 (invite code shown only when usable), ADV-17 (Organiser hidden while creation is closed), ADV-23 (admins alerted on every report with per-reporter and platform limits; runbook `report-triage-runbook.md`), ADV-28 (deletion copy discloses kept, pseudonymized results) and ADV-33 (automatic championship announcement and doors-open pushes). ADV-27 is partly addressed: the AASA lists the competition and `/tournois` paths and is served as JSON; hosting `assetlinks.json` and installed-binary verification remain. Open: ADV-27.

### Flag-gated capabilities checked and consistent

- **Team creation (ADV-14):** while creation is off, the task is hidden and the server refuses it with `pilot_not_enabled`.
- **League creation (ADV-22):** same as team creation.
- **Physical, external and reward fields (ADV-20/21):** while creation is off, they are hidden inside event creation.
- **Discovery:** `COMPETITION_DISCOVERY_ENABLED=false` empties managed event and league listings, and the discovery panel then shows its truthful empty state (ADV-12).
- **Unsupported modes:** shared-answer and relay modes appear nowhere as selectable options. Event entry offers only individual entry and three-player teams.

## Recent additions (PR #115) and pending work

The following are recorded as rows with automated evidence only:

- **Push notifications (ADV-24):** typed competition push notifications with the in-app Mon activité inbox and mark-read (ADV-26).
- **Opt-out switch (ADV-25), web and app:** this supersedes the implementation record’s “still open: a settings control”.
- **Account deletion (ADV-28):** competition records are deleted or pseudonymized on account deletion. The copy mismatch above is still open.
- **Ownerless-event sweep (ADV-29).**
- **Invite codes (ADV-13).**
- **FR/HT error and label copy (ADV-30).**
- **Tournament diagnostics (ADV-31).**

Scheduled competition reminders (ADV-32) are implemented (`api/_lib/competitionReminders.ts`) with automated evidence only; E2E-05 (“register → reminder”) on installed builds is still required.

## Gate counts

`npm run release:gate` (expected to fail):

| | Before this audit | After |
| --- | --- | --- |
| Unverified mandatory requirements | 69 | 69 |
| Unassigned owners / unidentified artifacts | 5 / 7 | 5 / 7 |
| Unverified route/screen declarations | 117 | 117 |
| Unverified advertised capabilities | — | 33 |
| Open advertised mismatches | — | 9 |
| **Total blocking lines** | **198** | **240** |

MAP-01 is now `Failed` (9 open mismatches). MAP-02 stays `Not implemented` until owners, scenarios and rendered-state evidence exist.
