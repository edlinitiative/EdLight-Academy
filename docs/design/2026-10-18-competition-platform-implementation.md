# Competition pilot implementation record

Date: October 18, 2026

Release decision: **BLOCKED**. This is an implementation record, not full-product acceptance or authorization to enable the pilot in production.

The requested scope is the core product and competition slices A–D in the [release contract](2026-10-18-premium-product-release-readiness.md). Existing core learning behavior is retained. The full contract is not satisfied: source coverage, installed builds, acceptance journeys, content/accessibility/performance review, production diagnostics, operational ownership and the real school pilot remain open. The candidate ledger deliberately does not infer passing evidence from code or unit tests.

## Delivered code

- `/arena/competitions` combines public official/user-event discovery, personal activity, team tasks and organizer entry points. Existing `/arena`, championship, tournament and challenge destinations remain available. Source adapters distinguish official finality from custom tournament results.
- Native `Tournois` supports public discovery, private PIN entry, authenticated registration, live questions, server-timed window/round/bracket attempts, corrections, standings and personal history through the existing tournament API. Registered attempts resume through the existing server identity rather than restarting a timer.
- Shared web/native task composition provides teams, recipient-bound invitations, explicit acceptance/decline/revocation, opt-in school recruitment, captain transfer, three-starter selection and confirmation, transactional registration/exclusivity, withdrawal before deadline and immutable event rosters.
- School catalog approval, student membership and host authorization remain separate records. Canonical school keys support spaces and resolve through the existing bundled catalog or approved school documents. Verified school roles are granted by a platform administrator; school hosts review membership requests.
- Organizers can save/edit drafts, publish, grant/revoke scoped co-host permissions, announce updates, postpone before start with explicit reconfirmation, check in registered attendees, cancel/no-contest, handle private disputes, confirm external reports and record separately attributed external reward fulfillment. Published practice trivia is not approved for material-prize quiz events; rewards are limited to separately reported external activities.
- `/arena/ecran/:id` is a separate audience composition. It contains no host console, attendee/check-in list or account navigation. Private broadcast access still requires the underlying viewer permission.
- The fixed league pilot uses up to twelve teams, explicit captain consent, round-robin fixtures, a per-fixture three-starter policy, 3/1/0 standings and published sporting tie criteria. A source event must be linked while it is a draft, before participation. Each source supports one league fixture in this pilot. Result changes/disputes invalidate dependent league points transactionally; reviewed corrections are accepted explicitly. Season closure and audited reopening are separate actions.
- API-only private collections, sanitized public listings, owner-only inbox/follow records, payload-preserving mutation receipts, duplicate-tap guards, bounded slow states, account-aware intent restoration and technical-only telemetry support recovery.
- Creation/discovery controls preserve existing entry, play and history when rolled back. Named-team bracket modes remain unavailable; shared-answer and relay are implemented separately (Slice E, below) behind their own switch.

## Limits and remaining implementation review

This is a bounded pilot, not demonstrated national-scale operation. New app events accept at most sixty players (the current form uses thirty); independent named teams have exactly three starters; persistent teams hold at most twelve members. Directory pages contain twenty managed listings, with separate bounded legacy/official feeds. Geographic context not established by canonical school data remains unknown or explicitly organizer-declared. Classroom/cohort verification, department-wide eligibility, cross-school league policy and shared-answer/relay modes are not implemented by these pilot contracts.

The original pilot record listed presentation review, localized state copy, public identity/avatars, notification scheduling/delivery, support/moderation ownership, the account-deletion lifecycle and advertised-capability mapping as open. The follow-ups below cover the code side of identity, copy, delivery, scheduled reminders (1 h / 10 min before start and registration closing, run from the tick cron via the server-only `competitionReminders` queue in `api/_lib/competitionReminders.ts`), the deletion lifecycle and the capability mapping. Still open: device-level delivery verification, support/moderation ownership, the presentation review and resolution of the advertised-capability mismatches (see [Advertised-capability mapping](#advertised-capability-mapping)). Firestore rules and indexes were deployed on October 19, 2026. No physical iOS/Android installation, real multi-account school event, production receipt/alert drill or thirty-run performance profile has been performed. These remain blockers for the corresponding requirements.

## Follow-up delivered (branch `competition/finish-pilot`)

These close the code side of the review items above. They do not change the release decision.

- **Notifications.** Competition inbox records are typed (`action`, `targetKind`, `targetId`, `read`) from a closed union in `shared/competition/notifications.ts`. Mutations queue notices during the transaction; `api/_lib/competitionNotify.ts` sends best-effort Expo and web push after commit, only when the receipt was created in that request (replays never re-push), deduplicated, capped and opt-out aware (`settings/notifications.competitionUpdates === false`). Payloads carry `{type:'competition', action, targetKind, targetId, path}` with no scores, answers or announcement text; native taps rebuild the destination from the typed reference. Followers (server-only `competitionEvents/{id}/followers/{uid}`) receive announce/postpone/cancel after a per-follower access re-check; followers who lost access are pruned. Co-host grants apply the same recipient/block checks as team invites and notify only on a real role change. `inbox-read` marks the caller's own records.
- **Account deletion.** `api/_lib/competitionAccountDeletion.ts` runs before the user tree and Auth deletion. Pending personal records (invites, requests, claims, memberships, roles, receipts, blocks, follows, invite codes, owned drafts) are deleted. Kept records (locked rosters, results, standings, audit, disputes, rewards, reports) are pseudonymized to a salted `deleted_<hex>` tombstone and the bilingual `Compte supprimé / Kont efase` sentinel without changing a score; dispute text is cleared. Captaincy passes to the longest-standing member; owned published events pass to a managing co-host or are cancelled through the engine before start. Raw uids remain only as document ids that results address.
- **Public identity.** Read endpoints return a bounded `people` map (public alias + sanitized avatar, never email). Web, projector and native surfaces draw names and avatars; no screen prints a uid. People already on the page are chosen by name; others are invited with a shareable code (`competitionInviteCodes/{code}`, server-only).
- **Localized copy.** Status/state/format/audience/kind labels, Haiti-time dates and every API error code have French and Kreyòl text (`shared/competition/labels.ts`, `errors.ts`); a test fails when a new server code lacks a message.
- **Diagnostics.** Tournament join, attempt start/recovery, answer receipt (accepted/duplicate/late/rejected), failure, review and cancellation emit allowlisted events (`phase`, `round`, `errorCode`, `recovered` added deliberately); tournament requests run through `observedFetch` flow `tournois`. Competition actions keep the existing `competition_action` signal.

- **Notification switch.** Web Notification Center and the app's Profile expose a `Compétitions et équipes` switch that writes `competitionUpdates`.
- **Ownerless events.** A heir ladder and the quarter-hourly sweep finish events/leagues whose organizer deleted their account; administrators receive `owner_missing` only when needed.

Still open after this follow-up: deploying the Firestore rules and the new indexes (collection-group overrides on `entries.captainUid`, `entries.starters`, `entries.teamId`, `audit.actorUid`), `ACCOUNT_DELETION_SALT` in the deployment environment, an admin alert for started events or leagues left without an eligible owner, the visual presentation review, and every installed-build, pilot and operational item listed above.

## Advertised-capability mapping

The source-level mapping is recorded as `advertisedCapabilities` (ADV-01–ADV-33) in [`release-readiness/candidate.json`](release-readiness/candidate.json), summarized in [advertised-capabilities.md](release-readiness/advertised-capabilities.md). Every Arène/competition promise in web and native copy, navigation, permission prompts, push copy, meta text and the in-repo store listing maps to requirements, journeys, implementation and automated tests. No row is `Verified`.

It found nine open mismatches. Five are major copy/claim contradictions:

- web play is on while the app-only claim remains;
- the "Organiser" panel still renders while creation is disabled;
- iOS universal links lack the competition paths;
- deletion copy promises full deletion while competition results are pseudonymized;
- championship-announcement alerts are promised without an automatic push.

Two are major gaps:

- native tournament creation is public-only (parity);
- reported content has no named owner (operations).

Two are minor copy items. MAP-01 is `Failed` until they are resolved and a rendered audit confirms no unmapped promise. Scheduled competition reminders are tracked as `Not implemented` (ADV-32) until that work lands.

## Slice E — shared-answer and relay team modes (branch, October 19)

Implemented against [IMPLEMENTATION-PLAN §9 Slice E](arena-competition-platform/IMPLEMENTATION-PLAN.md) and journeys J12/J13. Release status is unchanged: the [release contract](2026-10-18-premium-product-release-readiness.md) keeps Slice E outside A–D, so creation of these modes sits behind a second switch, `COMPETITION_TEAM_MODES_ENABLED` (default false), in addition to `COMPETITION_CREATION_ENABLED`. Ledger rows ADV-34/35 are `Implemented/unverified`.

- **Scope.** Named-team (three locked starters) events in the `live` and `window` formats, online delivery. Rounds, brackets, external events and the league pilot keep independent answers; a league fixture refuses a team-mode source. Named-team elimination is not built.
- **Versioned policies.** `event.gameMode` (`independent` when absent) → engine doc `gameMode` + `teamPolicy` (`shared-authority-v1`, `relay-slots-v1`) and the entry's `policyVersion`. Legacy and independent events are written exactly as before. An unknown mode is refused, never coerced.
- **Old clients.** The individual `live-answer`/`start`/`answer` actions refuse team-mode tournaments (`team_client_required`); team play uses `team-*` actions in `api/tournois/_team.ts`. An old app can watch and read results.
- **Roles.** Before the start the captain sets the submitter/deputy (`team-roles`) or the relay order; each starter confirms (`team-roles-confirm`). The first play request after the start freezes them in server-only `userTournaments/{tid}/teamControl/{entryId}`; `team-roles` then fails with `roles_locked`.
- **Shared answer (J12).** One holder per team, versioned by `authorityVersion`. Transfer by the holder or captain; failover claim by the deputy after 15 s without a holder request, by any starter after 30 s (server presence from the 3 s `team-state` poll). Each live answer is created once at `teamAnswers/{index}_{entryId}`; the version check and the create run in one transaction, so an old/new holder race accepts at most one answer and nothing is overwritten. A retry of one's own accepted answer is idempotent even after authority moved. Window play uses one team attempt (`teamAttempts/0_{entryId}`) with the individual attempt clock; a transfer never changes the open question's deadline.
- **Relay (J13).** Live: question *i* belongs to slot *i* mod 3; others get `not_your_turn`; an unanswered turn is zero and the room keeps its schedule. Window (distributed): three consecutive legs; a leg opens when the previous one ends, its owner has a quarter of the window (10 min–4 h) to start, else it is forfeited and the next opens at that instant; a started leg lasts at most its questions' time. All times are derived from stored facts, so whoever looks next (a teammate's poll, a retry) records the same result. Only the leg owner receives the question text. No substitute: a teammate can never play another slot.
- **Scoring/standings.** Rebuilt from scratch from the team records: same points/tiers, ties by correct answers then time (unanswered = full question time). Rows keep the named-team shape plus `gameMode` and `missed`; relay rows carry per-slot contributions, shared rows none. Individual boards are empty for these events. Reveal counts and the `N/M` progress use team answers. Corrections open only after the close, as before.
- **Notifications.** `relay_turn` (next leg opened) and `authority_received` (transfer recipient) inbox records + push after commit; `team_roles_set` when roles change.
- **Clients.** Web `TeamPlay` in `/tournois/:id` and native `TeamModePanel` in `TournoisScreen`, both drawn from `shared/teams/client.ts` (status, notes, start/claim/transfer controls, countdowns). A one-question local practice round explains the mode; there is no pause control. Recovery: poll every 3 s, immediate re-read on tab visibility / app foreground, and re-read after `authority_stale`, `not_your_turn`, `team_answer_exists`.
- **Account deletion.** Entry `roles`/`relaySlots`/`dutiesConfirmed`, `teamControl` (captain, holder, deputy, starters, slots, presence keys, transfer log), `teamAnswers.uid` and `teamAttempts` (`answeredBy`, leg owners) are pseudonymized. They are found by key from the entry ids the entries pass recorded (before tombstoning or an heir handover), plus direct entry and control-field lookups. There is no bounded collection scan.
- **Rules/indexes.** The new records sit under `userTournaments/{tid}/{server=**}` (deny-all). No rule or index change is needed: queries are single-field equality/array-contains within one tournament. The emulator script asserts that a starter cannot read or write them. It was not run here because no Java runtime is available.
- **Fixed in passing.** A registered entrant of a managed `window` event can now play in `/tournois/:id` on the web. Previously the room sent them back to the event page, which links to the room.

Device validation still required (installed iOS/Android + web): the J12 old/new submitter race across two phones, a holder phone killed or backgrounded mid-question, deputy claim timing on real networks, the relay-turn push and window forfeit, wrong-player refusal, and FR/HT review of the practice, rules and recovery copy.

## Verification commands

- `npm test -- --runInBand`
- `npm run lint`
- `npx tsc --noEmit` and `npx tsc --noEmit -p api/tsconfig.json`
- `npm run build`
- In `mobile`: `npm test -- --runInBand`, `npm run lint`, `npx tsc --noEmit`
- In `mobile`: `npx expo export --platform ios --platform android --output-dir <temporary-directory>` verifies Metro bundles, not installed native binaries.
- `npm run test:competition:emulator` starts only the isolated `demo-edlight-competition` emulator. It tests client rule enforcement, revocation, private answers/attendance, concurrent idempotent retries and conflicting team registrations. Java 21+ and network access for pinned test tooling are required; the tooling does not change the shipped Firebase SDK.
- `npm run release:inventory` refreshes route/screen declarations while preserving ledger annotations. `npm run release:check` validates the ledger structure. `npm run release:gate` must fail while mandatory evidence or owners are missing.

The browser check in this session exercised the responsive signed-out discovery failure/retry state at 390 CSS pixels and verified independent play/auth navigation. It did not exercise a deployed competition API or constitute an end-to-end release acceptance run.

## Enablement and rollback

1. Assign release, engineering, design, QA and operations owners; record exact artifacts in `release-readiness/candidate.json`.
2. Deploy and verify Firestore rules/indexes and the API before enabling creation. Existing clients and URLs must be exercised against this candidate.
3. Publish compatible native binaries for the new associated-link paths; an OTA export alone does not change OS link claims. Verify the domain's Apple/Android association configuration against those exact binaries.
4. Keep `COMPETITION_CREATION_ENABLED=false` until the pilot is authorized and its mandatory checks pass. The default is disabled. `COMPETITION_DISCOVERY_ENABLED=false` removes managed listings without deleting records. Direct authorized destinations and registered gameplay remain available. These env values are now only the defaults: an administrator can override `creationEnabled`, `discoveryEnabled` and `teamModesEnabled` at runtime from **Admin → Données → Compétitions** (`/admin/data/competitions`), stored server-only in `platformConfig/competition` with an audit row per change in `platformConfigAudit` (api/_lib/platformConfig.ts; ~30 s propagation across instances). Team modes stay effective only while creation is effective.
5. Perform the declared school, organizer, spectator and league pilot; attach exact-build evidence and resolve failures before updating the gate decision.
6. On interruption, disable new creation/discovery, retain records, use postponement before start or cancellation/no-contest as supported, resolve disputed source results, and reaccept corrected fixture results deliberately. Do not edit raw scores or delete registrations to make a pilot pass.

Do not reactivate Arena device attestation through this rollout. The existing physical-device crash investigation requirements still apply.

## Local verification result

The completed local regression run passed 171 web/API suites (2,419 tests) and 68 mobile suites (691 tests). Focused follow-up regressions passed after the final authority/recovery changes. The isolated rules checks and both real concurrent-transaction scenarios passed. Web, API and native TypeScript checks passed; lint reported zero errors with existing warnings. Production web build/prerender and both native Metro exports passed during validation. The final candidate still requires the installed-build and operational evidence described above; no row was promoted to `Verified` solely from these checks.

An earlier combined test run hit an existing challenge UI timing timeout under concurrent build/test load. Its six-test suite passed on recheck, and the subsequent complete web/API run passed. An initial emulator setup hook hit its five-second default; the dedicated emulator configuration now uses a thirty-second integration-test timeout and the real contention cases passed.
