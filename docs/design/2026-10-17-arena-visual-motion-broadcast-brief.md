# Arena: visual, motion, and live broadcast brief

Date: October 17, 2026  
Status: Planning only; no implementation authorized by this document  
Scope: Arena lobby, match presentation, spectator experience, results, and championship ceremony

Companion: [Arena premium roadmap](./2026-10-17-arena-premium-roadmap.md)

## Vision

Make Arena feel like an animated school sports festival: a distinctive world students enter, a precise competition they can trust, and a championship worth watching together.

Aim for the craft associated with outstanding animated games and broadcasts: original art, expressive characters, spatial continuity, deliberate pacing, and coordinated sound. This is an aspirational quality bar, not a claim that any reference is objectively the best platform.

The lobby establishes belonging. Gameplay creates focus. The broadcast makes the competition understandable and exciting. Results turn achievement into a lasting identity.

## What premium means

- Every scene has one unmistakable focal point.
- Environments, player identities, school branding, typography, and trophies belong to the same visual world.
- Motion explains an action or builds anticipation around a meaningful event.
- Routine interactions feel immediate; important achievements receive deliberate ceremony.
- Live information stays readable and truthful throughout transitions.
- The experience remains polished on student phones, school laptops, slower networks, and reduced-motion settings.

## Creative direction

### An original Haitian night stadium

Develop an illustrated city and stadium with recognizable local architecture, atmospheric depth, school banners, and intentional lighting. Use Haitian creative input to establish the world's identity rather than relying on generic neon esports imagery.

Prepare separate desktop and mobile compositions. The mobile experience should be designed around its focal point rather than produced by cropping a wide illustration.

Use a small material palette: matte interface surfaces, illuminated signage, enamel crests, and metallic trophies. Keep light direction and depth consistent. Coral identifies primary actions; gold identifies earned achievement. School colors personalize controlled areas without compromising contrast.

### Three levels of atmosphere

| Occasion | Environment | Emotional purpose |
| --- | --- | --- |
| Everyday play | Calm city, subtle venue lighting, personal player card | Familiarity and easy entry |
| School match night | School banners, opposing identities, brighter stage | Rivalry and belonging |
| National championship | Authored opening, coordinated lighting, trophy stage, ceremony | Anticipation and prestige |

The championship treatment should remain special. Reserve its strongest effects for consequential moments.

## Twenty visual and animation requirements

| # | Requirement | Intended experience |
| --- | --- | --- |
| 1 | Authored environment art | A recognizable Arena world with composition, architecture, depth, and designed mobile layouts. |
| 2 | Occasion-specific venue states | The city changes meaningfully for practice, school fixtures, and finals. |
| 3 | Personalized lobby composition | The student's identity, school, next available contest, and primary action lead the screen. |
| 4 | School identity throughout the venue | Crests, banners, entrance panels, and stage colors reinforce who students represent. |
| 5 | Expressive original avatars | Idle, ready, focused, celebrating, and recovering states build personality without mocking losing students. |
| 6 | Distinctive badges and trophies | Strong silhouettes, coherent materials, and visible achievement requirements make status recognizable. |
| 7 | Shared motion grammar | Consistent timings, easing, entrances, exits, and interruption behavior make the product feel authored. |
| 8 | Spatial screen transitions | Player cards and school identities provide continuity between lobby, matchup, play, and results. |
| 9 | Animated opponent reveal | Opposing identities arrive on a shared stage with truthful queue, cancel, success, and failure states. |
| 10 | Coordinated ready sequence | A concise countdown aligns lighting, graphics, and optional audio with the actual start. |
| 11 | Precise answer feedback | Focus, press, pending submission, accepted answer, and timeout are immediately distinguishable. |
| 12 | Sequential score presentation | Answer reveal, point changes, and standings movement happen in an understandable order. |
| 13 | Dedicated spectator composition | A stable score header, current phase, central stage, and compact context serve viewers. |
| 14 | Directed broadcast scenes | Arrival, introductions, countdown, rounds, results, intervals, and final ceremony form one show. |
| 15 | Factual story graphics | Supported lead changes, close gaps, and qualification stakes explain why moments matter. |
| 16 | Spectator allegiance | Viewers can follow a school and find its position without losing the overall competition. |
| 17 | Controlled audience reactions | Aggregated, moderated cheers give the crowd a presence without overwhelming the broadcast. |
| 18 | Labeled replays and highlights | Recorded events reconstruct decisive moments with clear replay identification. |
| 19 | Signature sound and ceremony | Original cues and a coordinated trophy reveal distinguish important achievements. |
| 20 | Quality tiers and recovery | Lightweight visuals, reduced motion, and graceful reconnection preserve the experience. |

## Motion direction

### Choreograph attention

During a question, the stage settles and the question becomes dominant. After answers lock, anticipation rises briefly. Reveal the outcome, then the points, then movement in the standings. Let the audience read the result before introducing the next story.

Do not animate every element continuously. Ambient motion should remain sparse and subordinate to the current task. Avoid decorative shake, repeated zooms, and particles over question text.

### Initial timing targets

These values are prototype starting points, subject to student and device testing:

| Interaction | Starting target | Constraint |
| --- | --- | --- |
| Focus or press feedback | 80–160 ms | Independent of network confirmation |
| Component transition | 180–300 ms | Preserve readable labels and control positions |
| Navigation composition | 300–500 ms | Avoid unnecessary input blocking |
| Routine match introduction | 1–2 seconds | Shorten for repeat play |
| Score reveal | Separate readable beats | Explain answer, points, then movement |
| Major victory ceremony | 4–7 seconds | Provide dismissal where appropriate and retain the final result |

Transitions must tolerate interruption. A new authoritative match phase takes precedence over an unfinished cosmetic sequence.

### Accessible equivalents

Reduced-motion presentation replaces travel, camera movement, shake, and bursts with immediate changes or gentle fades. It retains the same scores, context, and results. Sound and color must never be the only way to understand correctness, urgency, or achievement.

## Live watching: a dedicated show

Spectating needs its own composition and pacing. A viewer should always understand:

1. Who is competing?
2. What phase is the match in?
3. What changed?
4. Why does the next round matter?

### Broadcast sequence

| Phase | Presentation | Direction |
| --- | --- | --- |
| Arrival | Venue, event title, participating schools, real scheduled start | Calm atmosphere and useful context |
| Introductions | School crests and permitted player identities | Short coordinated entrances |
| Ready | Format, eligibility context, starting lineup | Settle graphics before the countdown |
| Active question | Readable question where publication rules allow, round, time, fixed score header | Minimal motion and clear hierarchy |
| Answers locked | Explicit phase and pending reveal | Brief anticipation without leaking answers |
| Reveal | Correct answer and permitted results | Explain the outcome before showing score changes |
| Standings | Updated positions and supported story graphics | Preserve identity while rows move |
| Interval | Summary, next round context, actual timing | Breathing room rather than a blank stage |
| Review | Explicitly provisional results | Avoid prematurely declaring a champion |
| Final | Confirmed winner, trophy, eligible roster | Strongest ceremony of the event |
| Closing | Final table, shareable result, next real event | Quiet, persistent record and useful next actions |

### Spectator controls

- Follow a school and keep its position visible.
- Enable sound through an explicit user action; provide persistent mute and volume controls.
- Offer reduced-motion and lightweight presentation.
- Provide fullscreen where supported, with an accessible exit.
- Show loading, live, delayed, reconnecting, replay, provisional, and final states accurately.

Audience counts and reactions require real data, defined semantics, and moderation. Do not show invented attendance or simulated activity as real participation.

### Competition integrity

Define publication timing before building public question or answer graphics. Spectators could relay information to competitors. Do not expose correctness or live answer distributions before competitors' answers are locked; use delayed or post-lock presentation where required.

An optional spectator play-along mode must remain separate from official scoring. A data-driven animated broadcast does not imply live video, human commentary, or automated narration; those are separate production decisions.

### Replays

Reconstruct moments from recorded match events and identify them clearly as replays. Show the outcome and its competitive consequence without inventing footage or unsupported commentary. Return to the current live phase after a replay; never leave viewers accidentally watching old state.

## Sound direction

Commission a concise original sonic identity for ready, answer receipt, round reveal, promotion, and victory. Keep confirmation sounds short and distinguish submission from correctness.

Optional music can rise during introductions and ceremonies, then quiet during questions. Coordinate overlapping sounds through explicit priorities. No autoplay dependency: the complete experience must work silently.

## Championship ceremony

Build anticipation around a confirmed result, reveal the winning school, present its roster and trophy, then settle into a composition suitable for sharing. Include the event identity and final status in the frame.

Treat tied, disputed, and provisional results explicitly. Do not run a winner ceremony until authoritative state supports it. Keep ordinary match celebrations shorter so the championship retains its significance.

## Technical presentation principles

This section describes constraints for a future implementation, not permission to change code.

- Official scoring and match phase remain authoritative on the server.
- Presentation consumes stable event identifiers and timestamps.
- Reconnecting recovers to the current phase without replaying old celebrations or duplicating rewards.
- Existing match events and broadcast direction should be reused where suitable rather than replaced with an independent competing timeline.
- Hidden scenes pause unnecessary work; active input and readable scores take priority over effects.
- Measure performance on agreed baseline phones, laptops, and networks before approving visual complexity.
- CSS and SVG can handle interface motion. Evaluate authored interactive animation tools such as Rive for expressive assets; choose richer rendering only after the prototype proves its value.

## Production deliverables

| Deliverable | Contents | Review criterion |
| --- | --- | --- |
| Art direction board | Environment, typography, materials, lighting, school identities | One recognizable visual world |
| Key screen designs | Lobby, matchup, gameplay, spectator view, results, ceremony | Clear focal points on desktop and mobile |
| Motion storyboard | Transitions, round rhythm, score movement, victory beats | Understandable sequence and intentional pacing |
| Animatic | One complete short match and championship finish | Emotional impact without sacrificing readability |
| Asset inventory | Layered environments, avatars, crests, emblems, trophies | Reusable assets with ownership and export requirements |
| Broadcast package | Headers, introductions, phase labels, story graphics, replay labels | A consistent show with truthful states |
| Sound palette | Cues, optional music, priorities, mute behavior | Recognizable and reading-friendly |
| Validation report | Student feedback, accessibility, device performance | Evidence that the proposed experience works |

## What happens next

### Step 1: Inspect and capture the current experience

Document current lobby, gameplay, demo, spectator, and final-result states on desktop and mobile. Distinguish implemented capabilities from proposed work and preserve existing user changes.

The earlier roadmap was based on code inspection, not a complete live visual audit. Capture the experience before deciding what should be retained or replaced.

### Step 2: Establish the visual direction

Prepare a focused art direction board and polished lobby, spectator, and ceremony concepts. Review the world, identity, and typography together before producing a large asset library.

### Step 3: Storyboard one complete experience

Design this sequence:

1. Enter the personalized night-stadium lobby.
2. Reveal a school rival and both player identities.
3. Play a short match with clear answer feedback.
4. Watch the same event through a dedicated spectator composition.
5. Reveal results, update standings, and offer a rematch.
6. Preview a separate championship ceremony with explicitly labeled demo data.

### Step 4: Produce an animated prototype

Create a reviewable animatic or interactive prototype with representative data. Include the quiet reading phase, the dramatic reveal, and reduced-motion equivalents. Evaluate the complete rhythm rather than isolated effects.

### Step 5: Validate and scope implementation

Test with middle-school and high-school students. Verify comprehension, emotional response, readability, and baseline-device performance. Convert the approved direction into implementation tasks with dependencies, asset owners, and acceptance criteria.

### Step 6: Implement after a separate instruction

This document ends at planning. Implementation, deployment, original asset production, and new service provisioning remain separate actions. The user's instruction for this deliverable is to create the Markdown brief only.

## Acceptance criteria for the future prototype

- Students can identify their school, next contest, and available action within five seconds.
- Viewers understand the current phase and the cause of a score change.
- Questions remain readable throughout their active window.
- The lobby, match, broadcast, and ceremony feel like the same world.
- Major events feel more significant than routine interactions.
- Missing data, empty states, ties, delays, and reconnection have designed presentations.
- Reduced-motion and silent use preserve all essential meaning.
- Target devices maintain responsive controls and acceptable measured performance.
- Demo content is unmistakably labeled; no fictional state is presented as live competition.

## Reference approaches

- [Nintendo's Splatoon 3 Grand Festival](https://www.nintendo.com/us/whatsnew/party-it-up-in-the-splatoon-3-grand-festival-event-this-weekend/): coordinated competition, music, and community atmosphere.
- [Rocket League Hype Chamber](https://www.unrealengine.com/spotlights/enter-the-rocket-league-hype-chamber-a-new-sample-for-broadcast-and-live-events?lang=en): a unified broadcast graphics package with adaptable team identities.
- [Rive state machines](https://github.com/rive-app/help-center/blob/master/editor/state-machine.md?plain=1): authored interactive animation connected to application state.

Use these as references for production methods and experience design, not artwork to reproduce.
