# Premium Arène experience specification

Date: October 18, 2026

Status: Proposed design specification

Companions: [Product](PRODUCT-SPEC.md), [Journeys](USER-JOURNEYS.md), [Implementation](IMPLEMENTATION-PLAN.md)

## 1. Experience direction

Arène is a living academic competition world with the clarity of a well-run sporting event. Students recognize their school and teammates, understand the next obligation and can look beyond their own competition. Organizers receive calm, precise operational tools inside the same recognizable identity.

Premium means an intentional hierarchy, distinctive school/team identity, excellent reading comfort, immediate truthful feedback and continuity between visits. More cards, badges or ambient animation do not substitute for those qualities.

Preserve the current Haitian night-stadium direction. Reuse the web `arenaNight.css` and `src/arena-art` system, and mobile `arenaTheme`, `ArenaKit`, crest/avatar components and existing motion preferences. Keep learning screens in their established calmer visual language.

## 2. Navigation and platform fit

Keep the existing five main mobile tabs. Arène remains reachable through Jeux and relevant Home invitations/fixtures. The Jeux “Arène” entry opens the canonical root competition destination. Do not place a second four-way segmented navigation inside the existing four Jeux segments.

The root offers three sections: **Pour toi**, **Explorer**, **Mes compétitions**. A compact school identity link opens **Mon école** as a dedicated destination. These provide the four product destinations without four new bottom tabs. Teams are accessible from personal competitions, invitations, school context and event entry.

For the Jeux preview, show the next actual obligation or one real opportunity plus “Ouvrir l'Arène.” Root and preview consume the same view model. A deep link opens the root/detail directly with Jeux beneath it in the back stack; a participant does not need to search through Jeux to return to a live round.

On the website, `/arena` becomes the same discovery destination in a responsive layout. Preserve `/tournois` and existing event links as working entry points. Story, studio and demo remain secondary experiences. Demo data is visibly fictional and never enters public discovery or personal standings.

Within Arène, preserve chosen section, discovery filters and scroll. During active play, use a focused game surface with an explicit leave/rejoin path; do not let a navigation animation or unrelated notification replace a timed question.

## 3. Root composition

### Pour toi

Recommended small-phone reading order:

```text
Back to Jeux                  Arène
School crest · school name    Open school

Pour toi | Explorer | Mes compétitions

YOUR NEXT ACTION
Event / team identity
Actual obligation, deadline or current phase
[Rejoin / Confirm / Prepare / Enter]

AT YOUR SCHOOL
One or two relevant real events     See school

EXPLORE HAITI
Selected department · national opportunities
Compact real event rows             Explore

Practice · Challenge a friend
Create a competition
```

The next-action slot is selected by actionable urgency: active participation, time-sensitive confirmation, entered upcoming fixture, eligible recommended event, then genuine everyday play. Give overdue/missed obligations a truthful outcome rather than an endless “resume” prompt. Multiple concurrent fixtures produce a visible conflict, not an arbitrary hidden selection.

A student's school crest anchors identity without consuming the viewport. Weekly school XP belongs in the school hub or a secondary labeled summary; it must not occupy the main competition slot as though it were the score of an upcoming school cup.

If there are no events, practice remains immediately available. Offer exploration or creation appropriate to permissions. Do not render invented attendance, example competitions or animated “live” activity to fill space.

### Explorer

Default to upcoming/open events, with Live and Results as explicit views. Provide a search field and a filter sheet: school/department/national scope, subject, eligible level, individual/team, online/in-person and date. Show a small number of active filter chips plus “Clear”; avoid a wall of simultaneous controls.

The department preference is editable and does not require device location. “My school” is a filter, not a permanent restriction. Public school/league profiles can be explored without changing the student's affiliation.

List real availability and admission separately: “Registration open,” “Approval required,” “Invited entrants only,” “Full,” “Playing now,” “Results.” A live competition with closed entry offers Watch if permitted, not Join.

### Mes compétitions

Lead with active/upcoming obligations. Provide Invitations, Teams, Organizing and History as sections or a compact local menu rather than another full tab bar. The same event can show participant and organizer roles without duplicate cards pretending to be different events.

Preserve pending team entry drafts with “Team not registered” visible. A personal list failure does not erase cached permitted entries; show age/retry. Sign-out/account switch clears private content.

## 4. Event discovery cards

Use one family of event rows/cards across root, search, school, league fixtures and history. A compact card contains:

1. Event title and restrained school/team/organizer identity.
2. Organizer type or trust label and a real lifecycle status.
3. Start/deadline, individual/team mode and online/in-person label.
4. One relevant personal status: eligible, registered, awaiting approval, roster incomplete or next round.

Use at most a few essential labels on the card; full rules and secondary metadata belong in the event page. Explain verified badges on activation. “Official EdLight,” “Verified school host” and “Organized by students” have separate meanings.

The card navigates to details. Avoid nested conflicting tap targets or an entire list full of competing coral buttons. Distinct event sources share the presentation contract without hiding which authority operates them.

## 5. Event home and primary action

Use a compact event banner, title/host, schedule/status and one role-aware action. Follow with “What you need to know,” participant/team status, format/rules, permitted standings and updates. Physical/external instructions replace irrelevant quiz controls.

| Person/event state | Primary action | Supporting information |
| --- | --- | --- |
| Eligible, individual, entry open | Enter competition | Actual eligibility, format and deadline |
| Eligible, named-team event | Choose or create team | Required starter count and school policy |
| Invited, membership pending | Review invitation | Inviter, recipient scope and expiry |
| Team entry incomplete | Complete roster | Specific missing acceptance/confirmation |
| Approval pending | View entry status | Who reviews it and how to withdraw/contact |
| Registered before start | Prepare | Time, reminders, rules and independent practice |
| Active participant | Rejoin round | Real phase and receipt/recovery state |
| Entry closed, viewing allowed | Watch | Entry closure remains explained |
| Result pending | View submitted participation | Actual review state; no fictitious countdown |
| Final, another fixture entered | Prepare next fixture | Earned result and next obligation |
| Final, no next fixture | Review released corrections | Explore another event as a secondary action |
| External registration | Register with organizer | Browser destination and external responsibility |
| Canceled | View update | Reason, implications and available next actions |

Use a sticky action region on phones only if it respects safe area/keyboard, has matching content bottom padding and never covers options, rules or validation messages. When the user already owns the next action, avoid repeatedly asking them to join.

## 6. School hub, teams and league pages

### School hub

Compact crest/name and verification context; upcoming/active school events; entered teams; public recent results; followed leagues; clearly labeled weekly XP as a separate section. Verified organizers see scoped management links. Student hosts see an informal creation option without implying administrative authority.

For another school's public page, show approved public events, team records and league results. Do not expose its private competitions, membership lists or attendance. A merged/pending school has a clear catalog state and canonical destination.

### Team room

Use a strong generated crest, readable team name, school association, captain and membership state. Separate **Team members** from **Event lineup**. An event lineup shows three starter slots, accepted/eligible/confirmed state and deadline. Display a persistent incomplete-entry explanation until registration is confirmed.

Invitations use a focused sheet: who/what/expiry, share or copy link, pending status and revoke. State changes are accessible announcements, not disappearing toasts alone. Do not require a public teammate search or contact import.

History retains the actual event lineup and issuer of achievements. A current team member who did not play is not inserted into an old winning roster.

### League page

Header: league, season, division and organizer. Then the person's next fixture, table, schedule/results and rules. Use a compact readable table on phones with a selected entrant detail sheet; retain labels for played, league points and tie-breaks. On desktop, table and fixture detail can coexist.

Do not manufacture rank movement, winning streaks or qualification probabilities. Show only stories supported by recorded confirmed fixtures. Public “Explore other leagues” preserves current league context on return.

## 7. Playing and watching

### Independent individual and team answers

During a question, show event/round identity, readable prompt/options, authoritative remaining time and submission state. In named-team mode, add a compact team identifier and neutral readiness/completion context. A running private score must not leak correctness before reveal.

Maintain each existing mode's intentional input contract. If a new mode introduces select-then-submit, explain it before the first timed question and use it consistently. Pending selection, accepted answer, timed-out answer and correctness after reveal need distinct text/icon states. Do not unexpectedly change existing one-tap behavior during a running event.

After reveal: answer and explanation first, points second, permitted standings movement third. Give students time to read. A newer authoritative phase interrupts a cosmetic transition and produces the correct current screen.

After a windowed attempt: a submission receipt and release time, with no early answer leakage. After final results: achievement, contribution, released review and one useful next action. Shared-answer and relay controls ship only with their corresponding server authority and onboarding.

### Spectator and projector

Spectator layout keeps event phase, current authorized question and followed team/school visible. Expanding the board never loses the current phase. A viewer can explore another permitted team and return to their followed entry quickly.

Desktop/projector adds a central question stage, stable score rail and real fixture stories. Organizer controls, contact data and check-in records never appear on a projector. Private/signed-in question restrictions remain effective regardless of screen size.

Public windowed competitions show appropriate status until results release; they do not replay a participant's private current question as a live broadcast.

## 8. Organizer experience

Creation is a short progressive flow: template → people/eligibility → play/schedule → access/reward → preview/publish. Hide unsupported combinations immediately with an explanation. “No prize” is a deliberate default. Save a local/server draft with an accurate saving state and account isolation.

The organizer console has Overview, Entries, Run event and Results/updates, with only applicable tasks. Show actionable counts such as “2 teams need roster confirmation,” not vanity metrics. A separate scoped check-in interface works with a queue/search and clear confirmations.

Material rule/schedule changes require an affected-entry preview and an explicit apply action. This is an interaction requirement for the host, not a requirement to ask a developer's permission to implement the feature. Display who changed what and when. Destructive actions explain consequences and preserve audit/history.

## 9. Visual, motion and sound system

- Keep existing marine night surfaces, opaque tonal cards, readable ink/muted text and flat controls. Reuse coral for the primary action with existing dark text treatment; reserve gold for earned achievement.
- Apply school/team colors in crests, controlled banner areas and identities. Never let arbitrary uploaded colors reduce text contrast or replace status semantics.
- Use existing fonts and type ramps; prioritize question and event-title readability. Long school/team names wrap in details and use controlled truncation with an accessible full name in compact lists.
- Keep illustration around discovery/arrival, sparse during reading and still during answering. Do not rebuild mobile as a cropped desktop city.
- Use existing motion timing as the starting system: immediate press feedback, concise navigation, brief readiness and readable reveal beats. Animate roster acceptance or confirmed entry to explain the change, not to distract.
- Sound is optional, off unless the existing preference permits it, and independent of essential information. Respect reduced motion with static/fade equivalents and no lost phase information.
- Official finals receive the richest ceremony. A small school event receives a proportionate result treatment; a provisional result receives no champion trophy reveal.

Do not introduce a new asset generator or parallel crest/token system before inventorying current art components. Custom uploads and richer native environments are later work after moderation, performance and accessible fallbacks are ready.

## 10. Reusable states and accessibility

| State | Presentation and behavior |
| --- | --- |
| First loading | Stable card/row skeletons sized to likely content; no fake dates/counts |
| Refresh | Keep permitted content, subtle refresh indicator and last-update context |
| Empty | Explain the actual empty scope; offer broader exploration or authorized creation |
| Error | Section-specific explanation and retry; independent sections remain usable |
| Offline/cached | Label cached schedule/results; disable only network-required mutations with a reason |
| Submitting | Immediate pending feedback and duplicate prevention; retain useful input |
| Slow/unknown receipt | Explain uncertainty, check server receipt and offer an idempotent recovery |
| Confirmed | Durable status reflected in the underlying event/team list, not only a toast |
| Expired/denied/full | Specific reason, retained context and a permitted next action |
| Rights removed | Clear private data and show an authorized access state, not stale protected content |

Use accessible names and logical screen-reader order for roster slots, timers and tables. Announce meaningful phase/receipt changes; do not announce every countdown tick. Read status through text/icons, not color or sound alone. Minimum touch comfort follows the platform's established accessible control sizes; aim for at least 44 pt on iOS, 48 dp on Android and generous web controls.

Support keyboard/focus on web, font scaling, safe areas and keyboard avoidance for names, filters, PINs and organizer forms. At large text sizes, navigation can become a vertical list and tables can become labeled rows. Essential actions cannot depend on horizontal swiping or precision tapping.

## 11. Required design review set

Review actual populated, empty, denied, slow and long-text states for: root discovery; individual event entry; three-player incomplete/confirmed lineup; active play; provisional/final results; organizer readiness; public/restricted spectator; league table; physical check-in and external listing.

Use small and larger phones, supported tablets, desktop and a projector/broadcast composition. Include French and Haitian Creole, long mathematical prompts/options, reduced motion and large text. Evaluate native rendering on installed builds before calling a new animation or layout premium.

Design acceptance requires the person to identify their next action and its consequence, complete the underlying journey, recover from a realistic interruption and return to a durable result. Attractive static screens alone do not pass.
