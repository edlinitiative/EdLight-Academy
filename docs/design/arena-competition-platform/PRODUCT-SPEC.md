# Arène competition product specification

Date: October 18, 2026

Status: Proposed

Companions: [Journeys](USER-JOURNEYS.md), [Experience](EXPERIENCE-SPEC.md), [Implementation](IMPLEMENTATION-PLAN.md)

## 1. Product promise

“Find a competition that fits you, compete with people you know, and see where you can go next.”

Students should understand what is happening at their school and across Haiti, who they will represent, what participation requires and what happens after a result. Schools should be able to organize dependable events without building an independent competition system.

Success means students complete competitions, return with teammates and understand their contribution. Registrations, decorative league tables and unfulfilled prize promises alone do not demonstrate success.

## 2. The competition model

Treat the following as separate choices. A regional event can be individual or team-based, public or private, online or in person. “National” describes geographic scope; “Official EdLight” describes who operates and governs an event.

| Dimension | Choices and meaning |
| --- | --- |
| Organizer | Student/community host, verified school host, verified partner or EdLight |
| Geographic scope | School, commune, department, national or explicitly defined participating schools |
| Entry mode | Individual, named team, school score group, grade score group; verified classroom groups added separately |
| Game mode | Independent answers; later shared team answer or relay; external events can use a declared non-app activity |
| Schedule | Live, play within a window, multiple rounds or elimination; a league schedules a collection of fixtures |
| Delivery | Online, in person with app support, external listing |
| Discoverability | Listed or unlisted |
| Entry policy | Open to eligible participants, organizer approval or invitation only |
| Viewing policy | Public summary/broadcast, school community, participants/invited spectators or organizers only |
| Eligibility | School membership, grade band, geography, roster size and any qualification requirement |
| Reward | None, recognition, organizer-provided physical/external reward or a separately governed EdLight reward |
| Result authority | App computed, organizer reported or reviewed by an authorized governing body |

Publish understandable presets rather than exposing this entire matrix in the creation form. A private class challenge, public school cup and regional interschool fixture should start with suitable defaults.

Illustrative configurations, not live event listings:

| Event | Participation | Audience and operation |
| --- | --- | --- |
| School individual cup | Eligible students play for themselves | School-visible; teacher or clearly labeled student host |
| School team cup | Student-created teams of three from that school | School-only entry; school or public viewing chosen separately |
| Department individual challenge | Eligible students from participating schools in that department | Public discovery; online window; explicit grade band |
| Interschool team fixture | Approved named school squads | Public summary; invitation/qualification-based entry |
| National open event | Individual or team division as declared | National scope; host badge states whether EdLight operates it |
| Private class revision challenge | Verified cohort members, individually or in teams | Unlisted/private viewing; recognition without a material prize |
| School academic festival | App-supported quizzes or separately labeled external activities | Physical venue; approved host; activity-specific registration and results |

Do not promise every combination at launch. The first named-team release supports live/window independent-answer events; the existing individual formats remain available. Team brackets, relay and shared answers require their own later engine capabilities.

“Class” must mean a particular cohort when used for classroom eligibility. The current `grade` grouping means a level such as NS I; students from unrelated classrooms or schools can share that level. Do not present the current grouping as verified class membership.

## 3. People, affiliation and authority

A person can have several roles in different contexts. A captain is not automatically a school organizer. Choosing a school in a profile does not prove enrollment or grant authority to publish under that school's name.

| Role | Powers and boundaries |
| --- | --- |
| Student | Discover permitted events, enter eligible divisions, create informal teams/events, accept or decline invitations, follow public activity |
| Captain | Manage persistent team invitations and submit an event roster; cannot accept membership or competition consent on another person's behalf |
| Team member | Accept membership, confirm participation, play assigned slots, leave when rules permit |
| School organizer | Manage approved school events and relevant eligibility; authority belongs to an approved school role, not a leaderboard rank |
| Event co-host | Receive scoped permissions such as check-in or result entry; no automatic access to school administration |
| Spectator | View allowed summaries and broadcasts, follow permitted entities; watching does not register a player or count as attendance |
| League operator | Publish season rules and fixtures, handle authorized disputes and finalize league standings |
| Guardian | Complete required consent or reward processes; no need for a new competition account in the first release |
| Platform moderator | Review hosts, unsafe/inappropriate content and abuse; sensitive access is audited |

School selection, school catalog approval, student membership approval and school-host verification are four different facts. Reuse canonical school keys; add explicit membership and organizer records where eligibility requires them. Student-run school-related events display “Organized by students,” not a verified school badge.

Geographic eligibility uses the declared policy and verified school/organization geography where required. Browsing location is a manually selectable preference. Do not infer a student's eligibility or publish their location from GPS, IP address or the location of classmates.

## 4. Named teams and event rosters

A persistent team has a stable identity, captain/co-captain permissions, accepted members, a school association where applicable, visibility and history. An event entry references that team but records its own immutable roster and rules version.

The first pilot uses three registered starters per team. A persistent team may contain additional members, but only the three accepted, eligible and confirmed starters enter the event. A later fixture can use another roster if that season's rules permit it.

### Membership and entry rules

- Invitations have pending, accepted, declined, expired and revoked states. Sending an invitation does not create a member or reserve an event place.
- A person may belong to multiple persistent teams, but may play for only one entrant in the same event/division. The server enforces exclusivity across competing invitations and registrations.
- A school-only team event checks each starter's membership. A team name or captain's claim cannot establish eligibility.
- A captain selects starters, teammates confirm, and the captain submits the complete entry. Capacity is reserved only on confirmed registration; an incomplete draft does not quietly occupy a place.
- Before the roster deadline, replacements require the new person's acceptance and revalidation. After lock, membership edits do not alter the event roster. No mid-question or mid-attempt substitutions.
- The team survives a member's departure; historical results retain the roster that actually competed. A captain transfers ownership before leaving or uses an organizer recovery path.
- Team discovery and recruitment are opt-in, school-scoped initially, with structured requests instead of open messaging or a public student directory.

### The first team scoring policy

All three starters answer independently. The team round score is the sum of their server-confirmed round points. Missing players contribute zero; the denominator remains three. A valid locked team can play short if someone is absent. The screen states whose slots are missing and the scoring consequence.

Rank by team points, then total correct answers, then the published combined elapsed-time criterion. Missing/unanswered questions receive the published timeout duration for that criterion; absence must not improve a tie-break. If still equal in a non-elimination event, teams share rank. Display sorting may be stable by ID/name, but does not break a sporting tie.

This is a new, versioned named-team policy. Existing school/grade best-N scoring and official championship scoring remain unchanged. Explain them separately; do not use “team score” to imply all modes count contributions the same way.

Any elimination mode must publish a decisive tie policy, no-show policy and seeding policy before entry. Current individual brackets use seed as a final tie-break and join order when seeding; do not advertise that as a measured skill ranking. Team elimination requires new entrant/pairing logic and is deferred beyond the initial team pilot.

Independent-answer mode prohibits sharing answers during an active round. Shared-answer mode explicitly allows discussion. Whether that distinction can be enforced sufficiently for a particular prize or qualification level is a release decision, not a promise made by interface copy.

## 5. Individual, school and class competition

Individual events give students a full competition without recruiting teammates. Registration, readiness, play, results and return visits should be as polished as team events.

School and grade score groups preserve the existing participation model: many individuals can contribute, and the published best-N rule determines the counting group. Show “contributed” separately from “counted in the school score.” Do not turn every student at a school into a named-team member.

A school may host an individual division and a team division under one event series later. Each has separate entries, rules, results and rewards. Their scores are not interchangeable. An individual result only contributes to a wider school or season board when that relationship is declared before play.

Competition performance, weekly XP, learning mastery and any future competitive rating remain distinct. A custom tournament victory does not automatically increase an official national rank or award ungoverned XP.

## 6. Leagues and seasons

A league groups comparable entrants into a season/division with published fixtures and standings. A tournament can exist without a league. A team profile can show its own event history without inventing a league.

For the first school league pilot, use a fixed division, an approved roster policy, scheduled fixtures, a published 3/1/0 win/draw/loss policy and explicit tie-breaks. Define postponement, withdrawal and walkover treatment before enrollment. Neither team appearing produces a recorded no-contest or organizer resolution under the published rules, not an invented sporting victory.

Standings show played, remaining, wins/draws/losses, league points and any published tie-break columns. Match points and league points have different labels. A provisional/disputed fixture cannot silently become a confirmed title or qualification. Later corrected results generate a versioned recalculation and notifications.

Public leagues offer standings, schedules, participating teams and authorized highlights. Private leagues expose only their selected public profile or nothing at all. Following another league never grants access to its private rosters or game content.

## 7. Organizing physical events and external competitions

An app-supported physical event uses app registration, team rosters, check-in and either app-based play or authorized result entry. A host can project a dedicated display without showing organizer controls or personal account details. A QR code opens a preview/check-in flow; scanning alone does not prove attendance or create a team member.

An external listing can describe a debate, science challenge or competition whose scoring happens elsewhere. Clearly label the activity, registration destination, organizer, venue access rules and result source. Do not show “Play” for a non-app activity or fabricate live app scores.

Provide connectivity requirements, scheduled local date/time, duration, accessibility/contact instructions and a cancellation/update channel. Exact restricted-school venue details are shown only to authorized attendees. A public school address in an approved listing is different from exposing private attendee location or check-in status.

Begin physical-event publishing with verified school/partner hosts, controlled attendee lists and scoped check-in roles. Individual attendance, contacts, guardian details and consent records are not public spectator data.

## 8. Privacy and trust

Use three easy-to-understand presets with explicit advanced settings:

| Preset | Discovery | Entry | Viewing |
| --- | --- | --- | --- |
| Public competition | Public event summary | Eligibility plus open/approval/invitation policy | Public approved content; no private attendee data |
| School community | School-scoped listing | Approved school members or invited eligible participants | Authorized school audience by default |
| Private invitation | No public listing or search counts | Revocable invitation plus eligibility | Participants and explicitly invited viewers |

Unlisted means reachable by link, not confidential. An entry invitation never automatically confers school-host powers. A public teaser for a restricted event must be deliberately authored and contain no protected roster, venue or invitation credentials.

First release has structured invitations, recruitment requests and organizer announcements. Open chat, unsolicited direct messages, payments, betting and public individual attendance tracking are outside scope. Provide report/block controls and moderation for names, team assets and event descriptions.

## 9. Rewards and lasting achievement

Default to no material prize. Meaningful outcomes include an event placement, a verified certificate, a school trophy, qualification to a later event and a lasting team record. Reward labels identify who provides and fulfills them.

For an external reward, show description, eligible recipients, provider, award conditions and fulfillment contact/process before entry. Keep reward state separate: announced, awaiting result confirmation, eligible, fulfillment pending, fulfilled or disputed. A result can be final while delivery remains pending.

Only an authorized organizer can record fulfillment; “organizer reports delivered” is not independent verification. Do not reuse EdLight's official prize/guardian flow for arbitrary hosts without a separate review of requirements. Prize-bearing expansion needs operational ownership before launch; entry fees and automated payouts are deferred.

Certificates identify event, issuer, result status and recipient's permitted public identity. A participation certificate is not a mastery credential. Gold and champion ceremonies follow the actual final achievement.

## 10. Release scope and success

Deliver in complete slices: unified discovery and individual continuity; named teams in school events; organizer/physical event workflows; a small league pilot; later shared-answer and relay modes. Each slice includes native/mobile web entry, recovery, results and return visits, not only creation screens.

Measure eligible event-view-to-entry completion, invitation acceptance, complete-roster-to-start conversion, started-to-finished participation, organizer repeat events, repeat team participation, submission failure/recovery and result disputes. Segment by platform, entry mode and verified technical event context. Never send invitation credentials, raw answers, private messages or attendee contact information to telemetry.

Establish baselines and pilot targets before broad rollout. A healthy launch has completed fixtures, accurate results and manageable organizer workload, even if it begins with few events.
