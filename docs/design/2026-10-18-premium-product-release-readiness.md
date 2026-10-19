# Premium product release readiness contract

Date: October 18, 2026

Status: Implementation and acceptance requirements; readiness has not been established

Applies to: EdLight Academy responsive website, installed iOS app and installed Android app

## 1. What ready means

A student can identify a useful next action, complete it, recover from expected interruptions, understand the outcome and return later without losing their place. A team, organizer or spectator receives the same continuity appropriate to their role. The website and native apps deliver the essential journeys with a coherent, distinctive and accessible presentation.

This contract makes readiness a decision supported by recorded evidence. Implementing a checklist or passing unit tests alone does not establish readiness. “Nothing missing” means no missing mandatory capability, unresolved blocking defect or unverified release gate within the frozen release scope. It does not promise that no future feature or undiscovered defect will ever exist.

The five acceptance pillars are **purpose, continuity, parity, trust and presentation**. Every pillar must pass; an excellent visual score cannot compensate for lost work or broken invitations.

### Related specifications and precedence

- [Premium product implementation roadmap](2026-10-18-premium-product-implementation-roadmap.md): whole-product direction and priorities.
- [Arène product specification](arena-competition-platform/PRODUCT-SPEC.md): competition policies and supported modes.
- [Arène user journeys](arena-competition-platform/USER-JOURNEYS.md): J01–J14, including exceptions.
- [Premium Arène experience](arena-competition-platform/EXPERIENCE-SPEC.md): screen composition and interaction language.
- [Arène architecture and delivery](arena-competition-platform/IMPLEMENTATION-PLAN.md): source inventory, compatibility and implementation slices.
- [Diagnostics implementation record](2026-10-18-production-diagnostics-implementation.md): delivered diagnostics and its operational limits.

This document governs the evidence required to call a release ready. It does not silently change the scoring, eligibility or access rules in the product specification. Resolve contradictions before implementation, record the decision and update affected documents together.

## 2. Freeze the release scope before implementation

The full planned release in this contract includes the existing core learning product plus Arène delivery slices A–D. Slice E remains a separately named expansion. A milestone can be tested and released as a limited pilot, but must not be presented as completion of the full planned product.

| Release target | Mandatory capability | Permitted claim after its gates pass |
| --- | --- | --- |
| Core product | Accounts/onboarding, Home, courses/lessons, practice/review, exams, Sandra, progress, notifications, existing games/challenges and official Arena | Existing core product ready on the declared platforms |
| Competition foundation, Slice A | Unified discovery/personal activity, native individual user-tournament entry/play/results, accurate school/regional/national context and existing spectator access | Individual competition release ready |
| School team pilot, Slice B | Persistent teams, invitations, eligibility, confirmations, locked three-starter rosters and independent-answer scoring | Named-team school pilot ready |
| Organizer and physical events, Slice C | Draft/publish/manage/close, approved school roles, check-in/projector, external listings/results, disputes and optional external rewards | Supported organizer/physical-event release ready |
| League pilot, Slice D | Seasons/divisions, fixtures, roster policy, postponements, disputes and versioned standings | Declared league pilot ready |
| Full planned release | Core product and A–D, with all mandatory gates below passing for the supported combinations | Full planned product ready within its published limits |
| Later expansion, Slice E | Shared answers, relays and team elimination after their authority/pairing policies are implemented | Ready only after separate mode-specific acceptance; not implied by A–D |

Entry fees, automated payouts, betting, unrestricted chat, live skill matchmaking and downloadable video are not included. Remove unavailable actions and claims from discovery, creation, onboarding and marketing. A hidden or broken action is not a completed feature.

Before work starts, record named release/engineering/design/QA/operations owners; exact supported devices/OS/browser ranges; subjects/grade bands; event formats and combinations; maximum participants/concurrent events; supported languages; and the allowed external handoffs. Blank scope, authority or capacity decisions block readiness. Any later scope change requires an explicit recorded decision rather than an unchecked item disappearing.

### Supported launch combinations

- Preserve existing individual live/window/round/bracket journeys and official championships with their existing policies.
- New named-team events initially support independent answers in live/window formats with exactly three accepted, eligible and confirmed starters. Keep school/grade best-N score groups distinct.
- Class eligibility requires an actual cohort identity; a grade label alone is not proof of classroom membership.
- The first league uses a published fixed division/fixture/scoring policy. Do not assume every existing tournament format can be inserted into that league.
- An app-supported physical event declares whether play is online in the app or results are reported externally. No offline scoring capability is implied.
- Optional rewards default to none. A release without material prizes can pass; a release advertising prizes must pass the reward requirements.

## 3. Requirement status and evidence

Every requirement below is mandatory for the target that contains its capability. The default surfaces are website, iOS and Android. Platform-specific composition may differ; the result, permissions and ability to complete the task must agree.

Track each requirement as **Not implemented**, **Implemented/unverified**, **Failed**, **Verified**, or **Outside frozen scope**. The last status needs a recorded scope decision and proof that the feature is neither exposed nor promised. It cannot excuse a capability required for the chosen release target.

For every Verified entry, record requirement ID, responsible owner, exact commit/build/OTA identifiers, backend/rules/index versions, device/browser/network, scenario, expected/observed result, evidence link and date. Evidence must identify the tested artifact; screenshots from an unspecified build do not pass.

### Coverage inventory

Before implementation and again at candidate freeze, enumerate the actual web routes, native screens/tabs, settings, notification/link entry points, role-specific actions and advertised capabilities. For each, record its owner, intended person, input/mutation, loading/failure/recovery states, return/history destination and governing acceptance scenario. Compare this inventory with the source and rendered navigation; do not rely only on a manually remembered feature list.

| ID | Requirement | Passing evidence |
| --- | --- | --- |
| MAP-01 | Every exposed or promised capability belongs to the frozen scope or an explicit removed/deferred claim | Source/navigation/help/marketing inventory has no unmapped route, action or feature promise |
| MAP-02 | Every in-scope capability maps to purpose, recovery, platform coverage, authority and rendered-state evidence | No essential mutation, service, role or return path has a blank acceptance mapping |
| MAP-03 | Supported learning/exam content and assets match their advertised subjects, levels and interaction types | Catalog/asset/link validation plus subject review finds no known blocking content gaps, wrong answer keys, unsupported question interactions or false offline/coverage claims |

Include course search/filter/enrollment, first-time lesson entry, all supported exam answer types and hints, review scheduling, Sandra service/limit/error states, profile/grade/school preferences, supported sign-in/recovery methods, account deletion and notification permissions. Keep saved metadata/exercises/drafts distinct from internet-required video or services. Existing less prominent features still need a mapping; they do not disappear because the release focuses on Arène.

## 4. Purpose requirements

Students should understand what to do and why without studying the application's structure.

| ID | Implementation requirement | Passing evidence |
| --- | --- | --- |
| PUR-01 | Home prioritizes a real next lesson, interrupted exam, due review or other supported next task, with a concise reason and meaningful fallback | Fresh/returning accounts, no activity, finished content and unavailable course cases show truthful next actions |
| PUR-02 | Arène prioritizes active participation and confirmations before recommendations, with practice available between events | Active match, invitation deadline, entered fixture, no event and conflicting obligations each resolve to an appropriate action |
| PUR-03 | Students can discover school, departmental and national opportunities, change browsing scope and inspect other public school/league activity | An eligible and an ineligible account can browse the same public event and receive different accurate entry guidance |
| PUR-04 | Event previews explain organizer, entry/game mode, eligibility, schedule/duration, connection needs, scoring, audience and any reward provider before commitment | New participants correctly explain the event and their next action without coaching |
| PUR-05 | Labels match the action: following, team membership, registration, approval, check-in, playing and external registration have different confirmations | No share-sheet opening, link visit, spectator session or pending roster is presented as confirmed event entry |
| PUR-06 | Results explain actual achievement and one useful next action: corrections/practice, next lesson, next round/fixture or relevant event | Individual, team, school, exam and learning result cases show evidence-based follow-up without invented mastery/rank |
| PUR-07 | Organizers see the next operational obligation and spectators see current phase, competing entities and relevant stakes | A host can locate incomplete entries; a viewer can explain what is happening and what comes next |
| PUR-08 | Empty, full, closed, canceled, delayed and service-failure states explain the actual condition and an available action | No fabricated competitors, rank, live signal, prize, qualification or countdown is used to fill a gap |

**Usability gate:** test at least five previously unfamiliar learners across the supported grade bands and both languages, plus two representative organizers and two spectators. Record whether they identify the next action, understand its consequence and finish assigned in-scope tasks without moderator navigation coaching. An observed misunderstanding of entry, timing, scoring, privacy or result finality requires correction and retest before sign-off; a pleasing screen does not override it.

## 5. Continuity requirements

The unit of delivery is a complete journey, including its return visit and failure paths.

| ID | Implementation requirement | Passing evidence |
| --- | --- | --- |
| CON-01 | Authentication and required onboarding preserve the validated original task, event, invitation or lesson; acceptance remains explicit | Signed-out cold/warm links return to the intended confirmation after login, interrupted onboarding and an expired invitation |
| CON-02 | Lesson position, course/lesson context, relevant selection and supported playback position survive departure and return | Resume from Home, course, history and a shared lesson URL reaches the intended lesson without searching |
| CON-03 | Lesson/progress writes distinguish saving, queued, slow, failed and confirmed; retries preserve useful work | Offline completion, reconnect, rejected write and duplicate tap do not lose progress or celebrate before confirmation |
| CON-04 | Sandra receives the intended permitted lesson/exam context and offers a reliable return to it | Open from a lesson/task, ask, navigate back and recover the original location/draft; unavailable service retains the prompt where appropriate |
| CON-05 | Exam drafts and attempt identity survive supported navigation, process restart and account-scoped recovery; timer rules remain authoritative | Background/lock/restart, deadline expiry, failed submit/retry and history return produce one accurate result |
| CON-06 | Practice and corrections retain their source and lead to relevant explanations/practice when available | Incorrect answer → explanation → applicable practice → result → return to originating lesson/task without unsupported “lesson-specific” claims |
| CON-07 | A friend challenge completes across two accounts, including a signed-out recipient and later result retrieval by both | Create/play/share/open/accept/finish/revisit/rematch runs across native and browser without losing the challenge |
| CON-08 | Persistent teams, invitations, event confirmation and locked rosters remain distinct and recoverable | Captain plus two initially signed-out teammates form, enter, play and all find the same event outcome after a restart |
| CON-09 | Every live/window/round mode resumes its existing authoritative attempt or phase; retries cannot restart time or generate extra answers | Network loss, response loss, duplicate taps, background expiry and device return yield the same server-owned attempt/receipt |
| CON-10 | Return navigation retains discovery filters/scroll, originating school/league and current fixture; history remains findable | Browser Back/Forward/refresh and native back gestures return to expected permitted context without a route loop |
| CON-11 | Notifications resolve current phase/role only after startup/auth readiness and deduplicate delivery | Tap while closed/open, signed out, after cancellation, after deadline and after account switch; no silent Home fallback for a valid target |
| CON-12 | Organizers can recover drafts and complete publish/run/review/close; material schedule changes have explicit reconfirmation/update paths | Failed publication, absent host, postponed fixture, no-contest and result correction retain drafts/audit and notify affected participants |
| CON-13 | Physical and external event journeys preserve entry, authorized instructions, check-in/report status and post-event outcome | External-link opening is not false registration; connectivity loss does not pretend an online quiz became offline |
| CON-14 | Final results, team/event lineups, league fixtures and reward status survive later membership/profile changes | Leaving a team, switching schools, merging a school and correcting a fixture do not rewrite who competed or duplicate league points |
| CON-15 | Notification permission/preferences and scheduled/push reminders follow the current account and user's choice | Grant, deny, enable later, disable, sign-out and account switch do not create unwanted or previous-account reminders; the in-app task remains accessible without permission |

Use the detailed [J01–J14 journeys](arena-competition-platform/USER-JOURNEYS.md) for the relevant competition scenarios. J12/J13 enter this gate only when Slice E is explicitly included. Existing official claims/guardian consent remain complete and recoverable even when their approved browser handoff is retained.

## 6. Parity requirements

Parity means equal essential capabilities and outcomes with appropriate native/web interaction conventions. A desktop feature linked from a phone is not automatically a complete native journey.

| ID | Implementation requirement | Passing evidence |
| --- | --- | --- |
| PAR-01 | Essential account, course, lesson, practice, review, exam, Sandra and progress tasks work on all three surfaces | Matched test accounts complete the same core tasks and see consistent saved outcomes |
| PAR-02 | User-created individual competitions have native discovery, entry, readiness, play, corrections and history | A mobile participant completes each supported format without being sent to an unrelated web tournament or official championship |
| PAR-03 | Teams can be created, invited, confirmed, entered and revisited from mobile or web | Native captain/browser invitee and browser captain/native invitee combinations produce the same roster and result |
| PAR-04 | Native school organizers can perform the declared event creation and operational tasks; desktop adds useful space rather than exclusive basic access | The pilot event can be organized from a phone; projector and bulk content authoring have explicitly appropriate web roles |
| PAR-05 | Public/private competition discovery, league tables and spectator access use the same policies across clients | The same person cannot bypass a restriction by changing client or manually opening a URL/document |
| PAR-06 | All published link types have correct native/web fallback and backward compatibility | Existing duel/tournament/official/demo/claim/consent URLs and new event/team/league links pass cold/warm/refresh cases |
| PAR-07 | Cross-device state refresh is deliberate; online data supersedes stale caches without losing local drafts | Start on one device, continue on another, switch accounts and reconnect; status is accurate without manual relaunch |
| PAR-08 | Any retained browser handoff identifies destination, reason, auth/consent requirements and a return path | Demo, authorized claims/consent and external organizer registration complete on iOS/Android and return to the relevant task |
| PAR-09 | Supported combinations and genuine limitations are explicit; unsupported modes do not appear selectable | Creation validation, visible cards, links, onboarding, help and marketing agree on available functionality |

### Required capability ledger

Complete this ledger for each release candidate. For every cell, link the implemented route/screen, acceptance evidence or permitted scope exclusion. Empty cells block the applicable target.

| Capability | Responsive website | Native iOS | Native Android | Governing requirements |
| --- | --- | --- | --- | --- |
| Startup/accounts/onboarding | Not verified | Not verified | Not verified | CON-01, PAR-01, TRU-01 |
| Home/learning/resume/progress | Not verified | Not verified | Not verified | PUR-01, CON-02–04, CON-06 |
| Exams/drafts/results/history | Not verified | Not verified | Not verified | CON-05, PAR-01, TRU-03 |
| Practice/review/friend challenges | Not verified | Not verified | Not verified | CON-06–07, PAR-01, TRU-03 |
| Official Arena/play/watch/results | Not verified | Not verified | Not verified | CON-09, PAR-05–06, TRU-06 |
| Unified discovery/individual tournaments | Not verified | Not verified | Not verified | PUR-02–04, PAR-02 |
| Teams/invitations/event rosters | Not verified | Not verified | Not verified | CON-08, PAR-03, TRU-04 |
| School roles/eligibility/organizer operations | Not verified | Not verified | Not verified | CON-12, PAR-04, TRU-02 |
| League enrollment/fixtures/standings | Not verified | Not verified | Not verified | CON-14, PAR-05, TRU-06 |
| Physical/external events/rewards | Not verified | Not verified | Not verified | CON-13, PAR-08, TRU-08 |
| Notifications/accessibility/recovery | Not verified | Not verified | Not verified | CON-11, PRE-06–07 |

“Not verified” describes this contract's evidence status, not a claim that all existing functionality is absent.

## 7. Trust requirements

The interface must reflect what the system can establish, and server permissions must enforce what it promises.

| ID | Implementation requirement | Passing evidence |
| --- | --- | --- |
| TRU-01 | Accounts isolate private drafts, caches, subscriptions, invitations and history; revocation removes protected access | Sign-out/account switch/permission removal tests prove prior private content is unavailable on screen and via direct requests |
| TRU-02 | School catalog identity, student membership, team membership and organizer authority are separately validated | Self-declared school, forged role, wrong school/grade and unauthorized host mutations fail on the server |
| TRU-03 | Critical writes use stable attempt/entry identities, duplicate prevention and safe receipt recovery; server timing/scoring prevails | Concurrent requests, lost responses, replay and deadline-boundary cases yield at most the allowed accepted outcome |
| TRU-04 | Invitation acceptance, team capacity, entry exclusivity and roster lock are transactionally enforced | Two racing rival invitations cannot double-enter a person; expired/revoked/forwarded personal invites do not confer unauthorized membership |
| TRU-05 | Discoverability, entry and viewing are independently enforced; public projections contain no private credentials/evidence | Firestore emulator and API tests cover public/unlisted/school/private audiences, raw document access, roster/venue/check-in exposure and revoked access |
| TRU-06 | Results identify source, rules version, finality and contribution; league points derive deterministically from accepted result revisions | Provisional/disputed/corrected/tied/no-show/no-contest scenarios produce accurate placing, history and qualification without premature champions |
| TRU-07 | Hidden answers/correctness/scores remain hidden until the applicable release; the content bank supports the claimed assessment | Participant, teammate, spectator, host and notification views cannot leak active answers; subject/grade and difficulty claims receive content review |
| TRU-08 | Optional rewards identify issuer, conditions, eligibility and fulfillment responsibility; external reports are labeled | Final sporting result and pending delivery remain distinct; participation is not mastery; no prize promise is inferred from a generic trophy |
| TRU-09 | Errors can be investigated from production evidence with client/backend/build context and privacy filtering | Controlled error, failed critical action and recovery reach the real destination; native crash triage has a tested build-attributable route |
| TRU-10 | Moderation, host/membership disputes, result adjudication and fulfillment support have reachable named owners | A pilot report/dispute is received, triaged, resolved or escalated through the actual operational path with an audit trail |
| TRU-11 | Legacy events/links remain valid and rollback preserves registered participation, results and private access | Old supported clients and existing event records pass migration/rollback drills; a public backfill never publishes private events |

Diagnostics delivered to runtime logs are a starting implementation, not proof that every native crash is captured or that retention/alerts are configured. Keep Arena attestation disabled until its documented investigation conditions pass; do not use this contract to reactivate it or add native work to the answer path.

Published practice trivia does not become a confidential high-stakes question bank merely because a drawn question set is served privately. Any prize-bearing or official qualification mode needs an explicit approved content/integrity policy before release.

## 8. Presentation requirements

Presentation is evaluated in rendered real states, including failure and long content, across the complete journey.

| ID | Implementation requirement | Passing evidence |
| --- | --- | --- |
| PRE-01 | Learning and competition each have coherent typography, spacing, hierarchy, cards, controls and status language using existing foundations | Design review covers Home → lesson/exam/result and Arène → entry/team/play/watch/result, with no unexplained local control system |
| PRE-02 | A compact identity and one dominant current action lead each screen; scenery supports rather than hides the task | Small-phone first viewport reveals the next useful action and relevant state; full information remains reachable without decorative obstruction |
| PRE-03 | School/team/player identity stays recognizable through navigation, play, standings and history | Crests/avatars/names remain consistent; generated defaults are polished; no required custom art or broken identity fallback |
| PRE-04 | Loading, empty, disabled, submitting, slow, queued, error, retry and success states are designed and truthful | The representative screen set is reviewed in every applicable state; important feedback is durable and layout does not jump unexpectedly |
| PRE-05 | Long French/Creole text, math, school names and large text remain readable | Long prompts/four long options, formulas, translated controls and 200% text/zoom checks leave all essential content/actions usable |
| PRE-06 | Navigation, forms, timers, roster states and scoreboards support screen readers, web keyboard and visible focus | VoiceOver/TalkBack and keyboard task runs pass; meaningful changes are announced without reading every countdown tick |
| PRE-07 | Touch targets, contrast, safe areas, keyboard avoidance and fixed controls preserve comfortable input | Platform-sized controls, small phones/tablets and open keyboards show no covered answers, fields, submit controls or navigation traps |
| PRE-08 | Motion/sound explain real events, respect preferences and tolerate authoritative phase changes | Reduced motion and sound-off retain all information; animation interruption does not lose an answer/phase; no particles or movement obscure reading |
| PRE-09 | Arrival, active play, reveal, intervals, provisional results and final celebration have proportionate connected presentation | Real event review shows clear phase transitions; expressive assets are integrated into actual play where intended, not available only in Studio/demo |
| PRE-10 | Spectator/projector and organizer views fit their roles and retain current context | Expanded standings keep phase/followed entry accessible; public display contains no private host controls or attendee data |
| PRE-11 | Performance is measured against frozen budgets and product screens remain responsive during data/animation work | Recorded startup/route/input/layout/frame-pacing results pass the release profile below with no unbounded spinner or essential interaction stall |

Retain the existing Haitian night-stadium identity and calmer learning surfaces. Reserve coral for primary actions, gold for earned achievements and school colors for controlled identity areas. Premium does not require adding ambient animation to every screen or a prize to every event.

### Performance acceptance profile

The following are proposed internal release targets, not current measurements or claims about typical Haitian connectivity. Freeze the exact test hardware, network shaping and approved targets before optimization; do not relax them after a failure merely to obtain a green release.

- Visible press/focus acknowledgment within 100 ms on representative supported devices, without waiting for a network response.
- Normal-network critical mutations target a visible acknowledged outcome within three seconds at the 95th percentile. After eight seconds without confirmation, show an honest slow/receipt-recovery state. A shorter game deadline takes precedence; a queued offline save has a visible queued state rather than a spinner.
- Website critical entry pages target usable primary content/action within five seconds on a cold visit under the selected constrained profile: 1.5 Mb/s downstream, 0.5 Mb/s upstream and 300 ms round-trip latency.
- Installed app startup targets a usable initial screen within five seconds on the selected lower-end supported device with a returning session on the normal test network. Offline/slow auth has an explicit bounded loading-to-recovery path rather than trapping the person behind a splash screen.
- Active questions retain readable stationary text, an accurate server-derived timer and immediate input feedback. No decoration may cover answers or block submission; normal/reduced-motion results must convey the same phase.
- Record transfer/bundle sizes, time to usable route, input latency, layout shifts and native frame/memory behavior. Test discovery, lesson/exam entry and active competition, not only the landing page. Use at least 30 runs per platform for the selected critical performance profile when reporting percentiles; report sample count and conditions.

If a target is unsuitable for a mode/device, settle and document its replacement before the release candidate is evaluated. An undefined budget is an unverified gate. Test the server separately at the published capacity, including concurrent joins/answers, repeated requests and projector/spectator subscriptions; a small pilot alone does not prove national-scale capacity.

## 9. Mandatory execution matrix

Freeze exact supported versions at release planning and record them in the candidate evidence. “Latest” without an OS/browser/build identifier is not reproducible evidence.

| Dimension | Minimum coverage |
| --- | --- |
| Website | Desktop Chrome and Firefox, desktop Safari, iOS Safari, Android Chrome within the declared supported range |
| Native | Installed release-equivalent iOS and Android builds; smallest supported phone class and representative larger phone; declared tablet layouts |
| Layout | Representative 360/390 CSS-pixel phone widths, 768-pixel tablet width, desktop and 1920×1080 projector; portrait/landscape where supported |
| Accounts | Fresh, returning, signed out, account switch, revoked membership/role, pending school and wrong invitation recipient |
| Content | French and Haitian Creole; empty/small/full feeds; long titles/prompts/options/math; no school/no team and completed history |
| Network | Normal, constrained profile, offline launch, disconnect while submitting, reconnect, lost response and slow profile/feed service |
| Interruptions | App/browser close, process restart, background/foreground, lock/phone-call equivalent, notification tap and deadline crossing |
| Access | Individual, captain/member, student host, verified school host/co-host, spectator, guardian handoff and moderator where applicable |
| Accessibility | Large text/zoom, reduced motion, sound off, reader order/announcements, web keyboard/focus, contrast and touch comfort |
| Compatibility | Existing URLs, old supported clients, source-engine distinctions, data/rules/index migration and rollback |

Not every decorative screen needs every possible combination. Every mandatory journey needs its primary supported-platform run and the relevant adversarial combinations. Record the selected mapping explicitly; representative coverage must not silently exclude Android, guest entry, low connectivity or private events.

## 10. End-to-end acceptance scenarios

Each scenario requires a complete outcome and a later return visit. Run with the actual API/rules/indexes and release-equivalent clients; mocks may support automated tests but cannot be the only evidence.

| Scenario | Start → required retained outcome |
| --- | --- |
| E2E-01 Account/startup | Fresh/returning/offline startup → deliberate onboarding/auth → correct task; sign-out/switch clears previous private state |
| E2E-02 Learning | Home continuation → correct lesson/position → Sandra → return → completion with failed/queued save → reconnect → confirmed progress → relevant practice |
| E2E-03 Exam | Find appropriate exam → draft answers → restart/background deadline → recover attempt → ambiguous submit/retry → one result → corrections/history |
| E2E-04 Friend challenge | Create/play/share → signed-out friend opens on another client → login/complete → both retrieve the same result later |
| E2E-05 Individual competition | Discover eligible event → register → reminder → live/window/round/bracket as supported → interruption → accurate final outcome and next action |
| E2E-06 Team competition | Captain plus two signed-out invitees → accept membership/confirm eligibility → register/freeze roster → independent play → missing/reconnecting member → truthful combined result/history |
| E2E-07 Official competition | Existing official registration/doors → rejoin/live answer → reconnect → provisional/final result → correct counted/non-counted contribution and authorized claims path |
| E2E-08 Organizer | Authorized draft → publish → approvals/readiness → schedule update/reconfirmation → run/monitor → dispute/no-contest/cancel as applicable → valid final record |
| E2E-09 Spectator/privacy | Public school/region discovery → permitted broadcast → follow another team → expanded board/reconnect → final state; private data remains inaccessible |
| E2E-10 Physical/external event | Approved host listing → accurate registration/venue instructions → private check-in or external handoff → correctly attributed result → optional fulfillment status |
| E2E-11 League | Enroll division → fixture/roster confirmation → play → postponement/dispute/correction → recomputed table → final season without duplicate points or early qualification |
| E2E-12 Migration/release | Existing links/records and old supported client → new backend/rules → rollback creation/discovery flag → registered users can still play, recover and access history |

The full planned release requires E2E-01–12. A limited milestone records its subset and cannot inherit a pass for untested later capabilities. If Slice E is included, add the J12/J13 shared-answer/relay races, device transfer and turn-expiry scenarios before sign-off.

Expand the core scenarios using MAP-01–03: E2E-01 includes each supported sign-in/recovery method, account preferences and the actual account-deletion outcome; E2E-02 includes first-time course search/enrollment as well as resume, review and Sandra failure/limit handling; E2E-03 includes every supported answer interaction, math/hints and grading-service failure while preserving entered work. Exercise CON-15 alongside notification entry runs. A broad scenario name is not evidence that each shipped interaction was tested.

### Real school pilot

Run at least one school-wide team event with six real participants in two three-person teams, an authorized organizer and a spectator. At least two participants use physical phones, covering iOS and Android, with another participant or spectator on a browser; include an audience display. Exercise initially signed-out invitations, incomplete/locked rosters, one absent or reconnecting member and later result retrieval.

Also run an individual event, an unauthorized account from another school, and a two-fixture league sequence with a postponement and corrected/disputed result. Reuse participants across separate events where the rules allow it; do not bypass same-event exclusivity to make the pilot easier. Physical check-in and external reporting require their own authorized role runs.

Record observed confusion, support interventions, failures and fixes. An event requiring ad hoc database edits or developer coaching has not passed the intended organizer journey.

## 11. Production and operational readiness

Code merged into `main`, a green preview and a published native update are different milestones. Verify the actual website release, API, Firestore rules/indexes, native binary/runtime and OTA distribution together. Record which users/channels receive each artifact and how incompatible older clients are handled.

Before enabling a release target:

- Confirm a controlled error and a critical-action failure/recovery reach the real reporting destination with correct client/backend identifiers and privacy filtering. Verify log retention, access and alert routing; assign an on-call/review owner.
- Verify native crash investigation is possible for the released binary and practice the support-to-engineering handoff. Do not claim a JavaScript event queue is a native crash reporter.
- Establish real support paths for account/invitation problems, school membership/host verification, disputes, inappropriate event/team content and any reward fulfillment. Test one case per applicable path.
- Provide an operator runbook for service interruption, an event that cannot start, no-contest/cancellation, result correction and moderation. Describe which engine can safely pause or only postpone/void.
- Validate rate limits, cost/fan-out behavior, storage/document sizes and load at the published event capacity. Publish limits appropriate to demonstrated operation; keep enforcement server-side.
- Rehearse feature-flag rollback and reconciliation without deleting entries, changing scores or exposing private records. Preserve completed results and historical roster evidence.
- Confirm approved content, translated copy, accessible fallbacks, ownership and external handoff instructions are actually available in the release—not only in design files.

An operator, support reviewer and host must know where to look and who acts next. Unassigned responsibilities are missing product work.

## 12. Release blockers and exceptions

**Critical blockers:** lost/private cross-account data, incorrect or duplicate accepted submissions, unauthorized entry/access, leaked active answers, wrong timer/scoring, false official winner/qualification, or a crash/blocked access preventing a mandatory journey.

**Major blockers:** broken invitation/auth/navigation handoff, missing essential native capability, inaccessible primary controls, unavailable result/history, misleading save/registration status, unreliable organizer closure, or unobservable recurring critical failures.

There must be zero unresolved critical or major blockers in the chosen target and zero failed/unverified mandatory requirements. Fix and rerun the affected journey plus relevant regressions. Do not average away a failed trust or accessibility requirement using an overall readiness percentage.

Minor cosmetic issues may have a recorded exception only when they do not impair reading, action, accessibility, truthful status or the agreed premium visual standard. Record impact, affected surface, owner, fix date and release-owner/design approval. An essential missing feature cannot be relabeled cosmetic or deferred without changing the declared release target.

## 13. Implementation completion and sign-off

Use this sequence for each deliverable:

1. Map the change to requirement IDs, journey IDs, affected platforms and source engine.
2. Implement the server authority, client states, recovery and return/history path together.
3. Run appropriate domain/API/component/rules tests and required CI checks.
4. Review populated, loading, slow, empty, denied and long-content states in the actual design system.
5. Execute relevant installed-device/browser journeys and collect reproducible evidence.
6. Verify the deployed artifact and operational support/rollback for the target.
7. Update the ledger; close only with evidence and required owner sign-off.

### Candidate record template

```text
Release target and frozen scope:
Release owner / engineering / design / QA / operations owners:
Commit and website deployment:
API environment / Firestore rules and index versions:
iOS binary / runtime / OTA update / channel:
Android binary / runtime / OTA update / channel:
Device, OS, browser, language and network matrix:
Capacity and performance targets / measured evidence:
Requirement ledger and capability ledger evidence:
Completed end-to-end runs / pilot event and participant roles:
Open defects / severity / approved minor exceptions:
Production diagnostics and support drill evidence:
Rollback/reconciliation evidence:
Decision: BLOCKED / PILOT READY / FULL PLANNED RELEASE READY
Signatures and date:
```

### Final gate board

| Gate | Required approvers | Current status |
| --- | --- | --- |
| Scope and purpose | Product/release owner | Not verified |
| Journey continuity and capability parity | Engineering and QA | Not verified |
| Permissions, scoring, privacy and result authority | Engineering and responsible operations owner | Not verified |
| Presentation, accessibility and measured performance | Design, engineering and QA | Not verified |
| Production distribution, diagnostics, support and rollback | Release and operations owners | Not verified |
| Real learner/organizer/spectator pilot | Product, QA and pilot host | Not verified |

At authoring, the diagnostics foundation and specifications are merged at `76fc8e7`; the full competition platform and this product-wide acceptance evidence are not complete. Earlier passing test/build results remain useful regression evidence, but they do not mark this gate board green.

The release owner may record **FULL PLANNED RELEASE READY** only when all applicable gates and mandatory requirements pass against the same declared release candidate. Any changed client/backend artifact that affects a gate requires targeted revalidation before that decision carries forward.
