# Arena premium experience roadmap

Date: October 17, 2026  
Scope: Arena only  
Status: Proposed product and design direction; not an implementation specification

## Ambition

Make Arena a competitive world middle-school and high-school students want to belong to: a school to represent, rivals to beat, and status worth earning.

Visual polish should make those motivations tangible. Within five seconds, a student should understand:

1. Who do I represent?
2. Who can I compete against?
3. What does winning earn me?

No design can guarantee universal adoption. The aim is to build a compelling experience and validate it with students.

## Current foundation

The code already includes a night city, school buildings, story progression, friend challenges, private tournaments, school standings, and a national championship. The main Arena route is `src/pages/arena/ArenaArcade.tsx`; the championship route uses `src/pages/Arena.tsx`, and web championship play uses `src/pages/ArenaPlay.tsx`.

The assessment behind this roadmap was based on the implementation, not a live visual inspection. The items below include upgrades to existing capabilities as well as new capabilities; they are not a claim that all twenty are entirely absent.

The central gap is cohesion: competition spans multiple destinations, while the city provides more atmosphere than personal competitive direction. Arena should connect identity, the next contest, and the result into one recognizable experience.

## The 20 upgrades

### 1. A personal Arena lobby

Show the student's player identity, school crest, competitive rank, nearest relevant rival, and one dominant **Play a match** action above the fold. The city becomes the setting around the student's competitive life.

The primary action should reflect a real available activity. When an official event is open, make joining it easy to find without obscuring everyday play.

### 2. Three unmistakable competition lanes

Organize the core experience around:

- **Challenge a friend**
- **Compete in my school**
- **Represent my school**

Explain each lane's format, time commitment, and reward before entry. Keep story and practice available as supporting modes.

### 3. A complete school identity system

Give schools consistent crests, colors, banners, and a recognizable home venue. Carry that identity through matchmaking, scoreboards, results, and shared victories.

Provide a polished default identity for schools without custom assets. Define who may edit official school branding.

### 4. Player cards students want to own

Create one reusable player card with an avatar, nickname, school, rank emblem, specialty, and earned title. Use it throughout Arena so recognition and reputation accumulate.

Keep public identity separate from private account details.

### 5. A premium visual language

Recommended direction: a Haitian night stadium with crisp sports graphics and a recognizable local setting.

Coordinate illustration, typography, lighting, icons, and surfaces. Restrict coral to primary actions and gold to achievement. Establish consistent spacing, corner shapes, contrast, and depth rather than adding independent effects to every component.

### 6. A tighter, playable first screen

Bring the primary contest and school stakes into the first viewport. The current hero can occupy almost a full viewport; its space should also serve the student's next action.

On mobile, keep Play reachable with the thumb. On laptops, show the next matchup alongside relevant school progress. Keep reading order and keyboard navigation clear.

### 7. Distinctive rank emblems and trophies

Create a coherent family of badges with strong silhouettes that remain recognizable at avatar size. Reserve richer materials and restrained animation for higher achievements.

Make every emblem's meaning understandable through text as well as appearance.

### 8. A first match before a long setup

Let newcomers experience a short practice contest before completing their identity and school selection. Explain verification when they enter official school competition.

Bring the first successful answer forward. Preserve any required consent and eligibility checks before the activities that require them.

### 9. Fast, fair opponent matching

Match students by skill and appropriate grade band, with separate middle-school and high-school divisions. Show expected wait time when reliable estimates exist.

When nobody is available, offer a clearly labeled asynchronous challenge or practice option. Never present a simulated opponent as a live student.

### 10. A rivalry loop inside each school

Show a relevant nearby student on the school ladder as the next rival, with head-to-head history and an easy challenge action.

Give students recurring contests against people they recognize. Respect visibility preferences and challenge controls.

### 11. Class and house competitions

Add class-versus-class competitions and optional school houses, with simple join codes and weekly rounds.

Give students a smaller community where their contribution is visible before they reach national competition. Define who creates groups and manages membership.

### 12. Seasonal competitive ratings

Separate earned XP from competitive skill. Add placements, divisions, promotion progress, and seasonal finishes.

Keep all-time achievements as history while giving newcomers a fresh competitive race. Publish understandable rating and tie-breaking rules before launch.

### 13. A role for more than the best five

Keep the Cinq Majeur as a prestigious championship roster, while adding separate participation goals, development squads, and individual ladders.

A student outside the top five should still have a meaningful way to represent the school. Clearly distinguish participation achievements from championship scoring.

### 14. A real school rivalry calendar

Give schools named fixtures, accepted challenges, readiness checks, reminders, and recorded results.

A scheduled matchup with a neighboring school creates something students can anticipate and discuss. Define scheduling authority and cancellation behavior.

### 15. A dramatic match introduction

Introduce opposing player cards, school colors, the match format, and a short countdown before play.

Keep the sequence brief and skippable where appropriate. Support reduced motion, and avoid delaying students unnecessarily between repeat matches.

### 16. A beautifully readable match interface

Give the question, answer choices, timer, and score a disciplined visual hierarchy. Provide unmistakable answer confirmation, keyboard support, and accessible contrast.

Keep decorative effects away from reading and answering. Make submitted, pending, accepted, and timed-out answer states distinct.

### 17. Results that explain the achievement

Show the result, decisive moment when supported by match data, rating change, school contribution, and next action. Make **Rematch** prominent when available.

Offer missed-question review after the celebration. Explain provisional results and tie-breaks clearly.

### 18. Earned cosmetics and a trophy room

Unlock banners, avatar frames, titles, and school decorations through specific accomplishments. Display where and when each was earned.

Rewards should express achievement without changing competitive power. Make unlock requirements visible in advance.

### 19. Social energy around actual matches

Connect friend challenges, team invitations, controlled reactions, appropriate spectator views, and shareable result cards to real competitive moments.

Use student-controlled visibility and avoid exposing unnecessary personal information. Prioritize structured interactions before considering open chat.

### 20. A polished trust and connection layer

Make reconnecting, answer receipt, timeouts, scoring rules, and disputed results understandable. Include reporting and moderation paths.

Students should understand what happened when a connection drops or a result is close. Verify recovery behavior on the devices and networks students actually use.

## Proposed opening screen

The first screen should communicate **Your school. Your rival. Your next win.**

Suggested hierarchy:

1. Player card, school crest, and current division.
2. A dominant **Play a match** action.
3. **Challenge a friend** and **Compete in my school** entry points.
4. The next relevant rival and the school's next scheduled fixture.
5. The night city surrounding and supporting the action.

Show ranks, opponents, fixtures, counts, and live indicators only when backed by real data. Empty states should help students start a challenge, select their school, or recruit classmates. Clearly label demos.

## Suggested rollout

### Release 1: Cohesive identity and a convincing match loop

Prioritize **1–7, 10, 16, and 17**: the personal lobby, clear competition lanes, school and player identities, visual system, first-screen layout, rank artwork, school rivals, readable gameplay, and meaningful results.

Deliver the loop: enter, recognize your school, find a rival, compete, understand the result, and play again. Launch only the lanes supported by working flows; do not make unavailable functionality look playable.

### Release 2: Accessible entry and sustained competition

Add **8, 9, 12, 13, and 18**: faster onboarding, fair matching, seasonal ratings, broader school contribution, and earned cosmetics.

Rating rules, eligibility, and sufficient player availability are prerequisites for a credible ranked queue. Reward assets can be designed in Release 1 without announcing unimplemented competitive ranks.

### Release 3: Organized school competition and audience

Expand **11, 14, 15, and 19**: class and house competitions, school fixtures, match presentation, and social or spectator features.

Build on observed participation and school coordination capacity. Validate fixtures with a small number of schools before expanding.

### Throughout every release

Treat **20**, accessibility, truthful interface states, and student privacy as part of each shipped flow. These are not deferred until the final release.

## Validation

Test prototypes with both middle-school and high-school students. Include newcomers, occasional players, and competitive players.

Measure:

- Whether students can explain their school, next opponent, and reward after five seconds.
- Time from Arena entry to the first answered question.
- Challenge acceptance and completed-match rates.
- Rematch rate and repeat participation across days and weeks.
- Participation beyond each school's top five.
- Queue abandonment, failed submissions, and successful reconnections.
- Whether students recognize school identities and earned rank artwork at small sizes.

Set numerical targets after establishing a baseline. Review outcomes by division and device so aggregate engagement does not hide a weak experience for younger students or mobile users.

## Visual, animation, and live broadcast direction

### Creative ambition

Arena should feel like entering an animated school sports festival, playing a precision competitive game, and watching a professionally directed final. These experiences share the same world, school identities, lighting, and graphic language, while each has its own pace.

The quality bar is authored art, expressive motion, clear information, and carefully timed emotion. More particles, gradients, or constant movement will not establish that standard. This direction is aspirational and requires original assets, motion design, sound design, and testing on student devices.

### Twenty visual and motion upgrades

| # | Upgrade | Direction and purpose |
| --- | --- | --- |
| V1 | An authored Arena world | Develop a consistent illustrated Haitian city and stadium with intentional composition, atmospheric depth, recognizable architecture, and school identities. Prepare desktop and mobile compositions rather than cropping one wide scene everywhere. |
| V2 | A world that changes for an occasion | Use distinct everyday, match-night, and championship looks. Scheduled finals bring banners, stadium lighting, and an arrival sequence; ordinary practice retains a calmer atmosphere. |
| V3 | A focal point in every scene | Stage each view around one subject: the student's card in the lobby, opponents before a match, the question during play, and the champion at the finish. Decorative movement stays subordinate. |
| V4 | School identities integrated into the venue | Project school crests onto entrance panels, dress the stage in team colors, and use coordinated banners. School identity should shape the environment instead of appearing only as a small logo. |
| V5 | Expressive player and team portraits | Create an original avatar system with idle, ready, focused, celebrating, and recovering states. Keep reactions supportive and avoid humiliating losing players. |
| V6 | Material and lighting consistency | Define a small family of believable treatments: matte panels, illuminated signage, enamel badges, and metallic trophies. Keep highlights, shadows, and light direction consistent. |
| V7 | A motion grammar | Specify shared timings, easing, overshoot, entrances, exits, and interruption behavior. Button feedback feels immediate; navigation settles quickly; milestone celebrations receive more time. |
| V8 | Spatial continuity between screens | Carry the player card or school crest into the next scene, preserving orientation. Avoid unrelated full-screen animations at every route change. Input and loading feedback must remain immediate. |
| V9 | An animated matchmaking stage | Bring two school identities into opposing positions, reveal the opponent, then resolve into the match layout. Include truthful queue, cancel, opponent-found, and failure states. |
| V10 | A coordinated ready sequence | Synchronize ready indicators, a short countdown, lighting, and optional audio. Give spectators and players the appropriate version of the same event. |
| V11 | Responsive answer interactions | Answer choices acknowledge focus and press immediately, then show submission and confirmation distinctly. Correctness reveals only when permitted by the match rules. |
| V12 | Choreographed score reveals | Explain changes with a clear sequence: round closes, answer reveals, points settle, standings move. Preserve player identity as rows reorder and offer static equivalents. |
| V13 | An editorial spectator layout | Build a dedicated watch experience with a stable score header, current round, central stage, and compact context. Do not reuse the answer-entry screen as the spectator product. |
| V14 | A directed broadcast timeline | Provide scenes for arrival, roster introductions, rules, countdown, active question, locked answers, reveal, standings, interval, final result, and closing. Drive transitions from authoritative match events. |
| V15 | Meaningful broadcast story graphics | Show supported facts such as lead changes, qualification stakes, and a close gap. Give each graphic a defined location, readable hold time, and priority so multiple stories do not compete. |
| V16 | Personal spectator allegiance | Let viewers follow a school and keep its position visible without distorting the overall standings. Aggregate controlled cheers into restrained crowd responses; rate-limit and moderate participation. |
| V17 | A real replay and highlights system | Reconstruct decisive moments from recorded events and label them as replays. Show question, outcome, and resulting lead change without inventing camera footage or unsupported narrative. |
| V18 | A signature champion ceremony | Build anticipation, reveal the winning school, present its roster and trophy, and settle into a shareable final composition. Make full ceremonies appropriate to major events; keep routine wins brief. |
| V19 | Original adaptive sound | Create a small sonic identity for ready, confirmation, round reveal, promotion, and victory. Shape optional music around phases; reduce it during reading. Start sound only after user interaction and provide persistent controls. |
| V20 | Performance as part of the art direction | Establish baseline student phones, laptops, and networks. Offer full, lightweight, and reduced-motion presentation, pause hidden scenes, and prioritize input and score clarity over effects. |

### Live watching: a dedicated show

The watch experience needs its own composition and pacing. A viewer should always understand who is competing, what phase the match is in, what changed, and why the next round matters.

Suggested broadcast sequence; durations are initial creative targets, not approved competition rules:

| Phase | What viewers see | Motion and pacing |
| --- | --- | --- |
| Arrival | Venue, event title, participating schools, start time | Slow ambient movement; a countdown based on the real schedule. |
| Introductions | School crests and eligible player cards | Short coordinated entrances with school colors and an optional sonic signature. |
| Ready | Format and starting lineup | Settle graphics, then a concise countdown synchronized to match time. |
| Question | Readable question, round number, time remaining, fixed score header | A calm central stage. Never obscure text with effects. |
| Answers locked | Clear phase label and pending reveal | Brief anticipation; no premature correctness or answer-distribution leak. |
| Reveal | Correct answer and permitted result information | Reveal first, then show point changes so the audience understands the cause. |
| Standings | Updated positions and a supported story such as a lead change | Animate affected rows while keeping identity and final positions readable. |
| Interval | Summary and the next round's stakes | Give viewers breathing room. Show timing and connection status truthfully. |
| Final | Confirmed result or explicitly provisional standings | Reserve the strongest lighting, trophy motion, and audio for a confirmed winner. |
| Closing | Final table, shareable result, and next real event | Settle to a quiet composition with useful next actions. |

For a scored quiz, spectators may participate in an optional prediction or play-along layer, but their answers must never affect official scores. Define delayed or post-lock reveals where viewers could relay information to competitors. Do not expose live answer distributions before competitors' answers are locked.

Start with a data-driven animated broadcast. Live video, human commentary, and automated narrative are separate capabilities with different production requirements; they should not be implied by a polished watch screen.

### Suggested motion timing vocabulary

These are prototype starting points to validate on actual devices:

- Immediate interaction feedback: approximately 80–160 ms, independent of network confirmation.
- Component transitions: approximately 180–300 ms.
- Navigation and scene composition: approximately 300–500 ms, without blocking input unnecessarily.
- Match introductions: approximately 1–2 seconds for routine play, with a shortened repeat version.
- Round results: allocate readable pauses between answer, points, and standings rather than overlapping everything.
- Major victory ceremony: approximately 4–7 seconds, with skip or dismissal where appropriate and a persistent final result.

Ambient effects should be sparse. Reduced-motion mode replaces travel, zoom, shake, and particle bursts with immediate changes or gentle fades while retaining all information. Do not communicate scores, urgency, or correctness through sound or color alone.

### Broadcast correctness and recovery

- Keep official scoring and match phase authoritative on the server; animation only presents the state.
- Use stable event identifiers and timestamps so reconnecting does not replay old celebrations or award points twice.
- When behind, recover to the current phase; do not force viewers through every missed transition.
- Distinguish loading, live, delayed, reconnecting, replay, provisional, and final states.
- Resolve ties and review states before announcing a champion.
- Treat audience counts, cheers, and lead-change graphics as real data with explicit definitions.

### Asset and production requirements

The premium result depends on a coordinated production package:

- A visual style guide with approved compositions for lobby, match, watch, and results.
- Layered environment art, school identity templates, avatar states, and trophy artwork.
- Motion storyboards and an animatic for one complete match and one final ceremony.
- A reusable broadcast package: score header, player introductions, round labels, result panels, replay labels, and ceremony.
- A sound palette with mute behavior, music priorities, and reading-friendly mixing.
- Device-tested quality tiers and a reduced-motion version of each essential scene.

CSS and SVG can handle much of the interface motion. Rive is a candidate for authored interactive avatars, crests, and trophies; its state machines can connect animation states to product inputs. Use richer real-time rendering only where device testing and the creative result justify it. Tool selection follows the approved visual prototype.

### First visual prototype to build

Create one complete vertical slice before redesigning every screen:

1. Enter the personalized night-stadium lobby.
2. Challenge a school rival and reveal both player cards.
3. Complete a short match with readable answer feedback.
4. Watch that same match in a dedicated spectator composition.
5. Reveal results, reorder standings, and offer a rematch.
6. Preview a separate championship ceremony using explicitly labeled demo data.

Review this slice for composition, motion rhythm, readability, emotional impact, and performance. Approve the art and motion language before expanding the asset library. This is the most useful next deliverable for assessing whether Arena meets the intended quality bar.

### Visual and motion references

- [Nintendo's Splatoon 3 Grand Festival](https://www.nintendo.com/us/whatsnew/party-it-up-in-the-splatoon-3-grand-festival-event-this-weekend/): reference for turning competition into a coordinated festival with music and community identity.
- [Rocket League Hype Chamber](https://www.unrealengine.com/spotlights/enter-the-rocket-league-hype-chamber-a-new-sample-for-broadcast-and-live-events?lang=en): reference for a unified real-time broadcast graphics package with adaptable team identities.
- [Rive state machine documentation](https://github.com/rive-app/help-center/blob/master/editor/state-machine.md?plain=1): reference for connecting authored interactive animation to application state.

These references demonstrate specific production approaches. They are not an objective ranking of the best animated platforms or a recommendation to reproduce their artwork.

## Reference patterns

These references inform individual mechanics, not Arena's visual identity or a promise of equivalent engagement:

- [Chess.com friend challenges](https://support.chess.com/article/1241-how-do-i-play-a-friend): direct challenges to familiar opponents.
- [Chess.com club challenges](https://support.chess.com/en/articles/8718895-how-do-i-challenge-another-club): organized competition between communities.
- [Rocket League seasonal rewards](https://www.rocketleague.com/news/season-9-rewards-reveal): competitive seasons linked to earned status and rewards.
