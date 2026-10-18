# Arena audit: web and native mobile

Date: October 17, 2026  
Target: Current local website and current mobile source  
Scope: Arena entry, identity, play, watching, motion, sound, and results  
Deliverable: Audit only; no application changes

## Verdict

Web Arena now has a recognizable identity and a useful immediate-play action. The guest quick round is readable, focused, and starts without account setup. The broadcast demo has real scene direction, school crests, player faces, play-along, and a complete final podium. These are substantial foundations.

Native mobile has a permanent Arena hub, shared night tokens, school identity, dedicated play and watch routes, recovery states, answer receipts, and contribution-aware results. It is no longer accurate to describe it as having no Arena destination or no watch experience.

The premium ambition is only partly delivered. Some of the most ambitious motion assets remain in Studio rather than normal play, the web surfaces use several different visual compositions, and native watching is organized as a scrolling scoreboard rather than a directed show. More original assets alone will not close those gaps; the next work is to connect them to actual user journeys and match events.

## Evidence and boundaries

### Web inspected in a browser

- `/arena` at 1440×900 and 390×844, signed out.
- Its primary Play action into a real ten-question guest round.
- `/arena/championnat` in the no-scheduled-event state on phone.
- `/arena/demo`: introduction, arrivals, active questions, score stories, and final podium on desktop and phone.
- Demo controls were used to accelerate and advance the simulation. The demo identifies its schools and activity as fictional; it is not evidence of an actual live tournament or production attendance.
- Current art, sound, motion, lobby, and broadcast source was inspected.

### Native mobile inspected in source and tests

- Hub, lobby, doors, live, watching, results, theme, shared art, navigation, and relevant hooks.
- No native screen was rendered for this audit. `xcrun simctl list devices booted` failed because `simctl` is unavailable. Native visual, gesture, frame pacing, battery, safe-area, and screen-reader conclusions therefore require device validation.
- Mobile files contain ongoing working changes. Findings refer to inspected source, not necessarily a shipped build.

No account was used to enter a real tournament. Actual school registration, official live answer submission, production reconnection, prize claims, and simultaneous web/mobile behavior were not verified.

## Web findings

### W1. P1 — The phone lobby still gives too much of the first screen to scenery

**Observed:** The main Play action is visible and strong. The school-leader panel, background stadium, foreground pixel buildings, street, and ticker occupy the remainder of the first phone viewport. The three competition lanes begin below it.

**Impact:** Students can start a generic round quickly, but friend challenges and school competition—the product's main social promise—remain less discoverable.

**Improve:** Preserve the world while bringing the friend/school choices closer to the main action on phone. Use a smaller environmental window or more compact leader treatment. Avoid filling the entire entry with explanation or decoration.

Evidence: [phone lobby](arena-web-phone.png), [desktop lobby](arena-web-desktop.png).

### W2. P1 — The visual system changes noticeably between lobby, championship, and broadcast

**Observed:** The lobby combines a detailed illustrated stadium with foreground pixel buildings. The championship uses a separate spotlight-and-trophy panel. The demo broadcast uses sparse editorial typography, lanes, crests, and a floating play-along panel.

**Impact:** These are usable individual screens, but they do not yet feel like one continuous animated world.

**Improve:** Define a common stage composition, art scale, school-identity placement, panel language, and transition vocabulary. Different tasks need different density; they should still look like the same competition.

Evidence: [lobby](arena-web-desktop.png), [championship](arena-champ-phone.png), [broadcast](arena-demo-desktop.png), [final](arena-demo-final-desktop.png).

### W3. P1 — Demo playback controls overlap the answer area on phone

**Observed:** In the captured 390×844 active-question state, the fixed bottom dock overlaps the lower part of the answer sheet, including the fourth option's region. The phone dock remains visible rather than disappearing as on desktop.

**Impact:** A control intended to help preview the show competes with play-along and reduces the usable answer target.

**Improve:** Reserve the measured dock height in the question layout or use a collapsible phone control treatment. Test long prompts, four long options, reveal feedback, text scaling, and safe-area insets. Do not rely on a single fixed bottom offset.

Evidence: [phone active demo](arena-demo-live-phone.png), [demo styles](../../../../src/pages/arena/ArenaDemo.css).

### W4. P1 — The school podium can include schools that are not qualified

**Source confirmed; supporting lobby text observed:** `ArenaArcade` uses qualified schools only when at least three exist; otherwise it falls back to all standings, then renders podium places and numbered rows. In the inspected data, the leading schools had incomplete rosters such as 3/5 and 1/5.

**Impact:** Roster counts are stated, but numbered podium treatment still implies a competitive placement that incomplete schools have not earned. The mobile spectator helper is stricter: ranked rows require qualification.

**Improve:** Separate recruitment/formation standings from qualified competition. With fewer than three qualified schools, show the actual qualified positions and an explicitly labeled formation list rather than filling a ceremonial podium with unqualified teams.

Evidence: [selection logic](../../../../src/pages/arena/ArenaArcade.tsx#L142), [native ranked-row rules](../../../../mobile/src/utils/arenaWatch.ts).

### W5. P2 — The no-event championship entry leads with a large trophy illustration

**Observed:** On phone, the title/actions and trophy stage occupy much of the first screen before the message that the next final is not scheduled. Demo and everyday play are lower in the card.

**Improve:** Make the no-event state actionable first: everyday play, a friend challenge, or a clearly labeled demo. Reserve the strongest trophy presentation for a scheduled event or confirmed achievement. Keep the honest absence of a date.

Evidence: [championship phone](arena-champ-phone.png).

## Motion, sound, and broadcast integration

### X1. P1 — Signature motion exists, but is not fully integrated into normal Arena journeys

**Source confirmed:** The custom `OpponentReveal`, `ReadyCountdown`, and `TrophyCeremony` are consumed by the motion showcase. The normal broadcast uses its own event-driven scene registry and final podium. This is partial delivery, not an absence of animation.

**Impact:** A polished Studio demo does not establish that students experience those transitions during a real contest.

**Improve:** Map each approved sequence to actual match phases, with interruption, reconnect, repeated-play, and reduced-motion behavior. Choose whether a signature sequence replaces or complements an existing broadcast scene; avoid two independent directors.

Evidence: [MotionShowcase](../../../../src/arena-art/motion/MotionShowcase.tsx), [Stage](../../../../src/broadcast/Stage.tsx), [final podium](../../../../src/broadcast/segments/FinalPodium.tsx).

### X2. P2 — The sound engine has limited student-facing activation

**Source confirmed:** Ordinary trivia calls sound cues through `useMatchSound`, but the inspected explicit sound activation and preference controls are in the Studio sound showcase. The championship/demo routes do not consume the shared sound hook.

**Impact:** A first-time student can have cue calls in code without a discoverable way to enable the sound experience. The promised broadcast sonic identity is not yet connected end to end.

**Improve:** Provide an explicit user-initiated sound control in the appropriate real experience, retain mute/volume preferences, and connect phase-aware cues where useful. Preserve complete silent operation. Native haptics exist; they are not equivalent to an adaptive music and sound system.

Evidence: [match sound](../../../../src/pages/trivia/useMatchSound.ts), [sound showcase](../../../../src/arena-art/sound/SoundShowcase.tsx), [demo](../../../../src/pages/arena/ArenaDemo.tsx).

### X3. P1 — Web broadcast and native watching have different experience models

**Observed on web; source confirmed on native:** The web demo shows director-selected moments and a final podium. Native watching renders event context, followed school, ranked rows, the question, and roster in a ScrollView. It does not consume the web director's scene sequence or provide an equivalent native ceremony.

**Improve:** Define one broadcast phase/story contract with platform-specific layouts. Keep the question/phase/followed-school context stable while score stories appear in designated regions. A phone should not simply shrink the projector view, but it should tell the same match story.

Evidence: [web broadcast](arena-demo-desktop.png), [native watch screen](../../../../mobile/src/screens/arena/ArenaWatchScreen.tsx), [director](../../../../shared/arena/director.ts).

### What already works in the broadcast

- Demo content is clearly identified as simulated.
- Typed events and the director provide a real foundation for prioritizing score stories.
- School crests and original generated avatars make participants recognizable.
- Local play-along is separate from official scoring.
- The final shows a champion school and a readable 2–1–3 individual podium.
- The phone final is more cohesive than the phone active-question/control composition.

Evidence: [phone final](arena-demo-final-phone.png), [desktop final](arena-demo-final-desktop.png).

## Native mobile findings

All findings below are source-derived unless explicitly marked as a product recommendation. They are not claims of observed device rendering.

### M1. P1 — Friend challenge intent is lost in the hub handoff

`ArenaHubScreen` passes the same `toJeux` callback for practice and friend challenge. The Jeux-tab host passes the same `onStartTrivia` callback for both, which sets the screen to categories. No distinct friend-challenge intent is carried through these actions.

**Impact:** A specific “Défier un ami” action behaves like a generic practice entry. In the root hub it navigates to the Trivia tab rather than directly starting the intended challenge path. Challenge creation is available later in the result, but that does not make the initial handoff clear.

**Improve:** Carry an explicit practice/challenge intent through both hub hosts, explain the asynchronous format, and retain it through category selection and the invitation result.

Evidence: [root callbacks](../../../../mobile/src/screens/arena/ArenaHubScreen.tsx#L24), [Jeux callbacks](../../../../mobile/src/components/games/JeuxHub.tsx#L408), [category entry](../../../../mobile/src/screens/TriviaScreen.tsx#L1089).

### M2. P1 — The spectator's question comes after a potentially long scoreboard

The watch screen puts event header, followed school, and up to eight ranked rows before the question/play-along region. The event header is also inside the ScrollView, without a sticky header definition.

**Impact:** The active question and timer can require scrolling past a large board; the event phase and exit can scroll away. This is a layout risk derived from order and row dimensions, not a measured device clipping result.

**Improve:** Pin compact phase/context, prioritize the current question, and collapse the larger board behind an explicit action or alternate view. Preserve the followed school's position in the compact presentation.

Evidence: [watch layout](../../../../mobile/src/screens/arena/ArenaWatchScreen.tsx#L154).

### M3. P1 — Between events, mobile Arena has no strong everyday-play emphasis

The no-event card correctly avoids inventing a date, but its practice and challenge buttons are secondary and appear after school identity and a substantial championship-empty-state region. Web instead leads with an always-available primary Play action.

**Improve:** Establish the same everyday competition promise on both platforms: a prominent real playable action, then school/rival context and scheduled-event context. An unscheduled national final should not dominate the main mobile Arena job.

Evidence: [hub no-event state](../../../../mobile/src/components/arena/ArenaHubPanel.tsx#L218).

### M4. P2 — Following the default school cannot be cleared reliably

`followKey = follow ?? ownSchoolKey`. Tapping the currently followed school sets `follow` to null and removes storage, which immediately falls back to `ownSchoolKey`. An explicit “follow nobody” choice is indistinguishable from “use the default.”

**Improve:** Represent uninitialized/default preference separately from explicitly unfollowed. Test choosing, switching, clearing, and relaunching.

Evidence: [follow state](../../../../mobile/src/screens/arena/ArenaWatchScreen.tsx#L59).

### M5. P2 — Spectator status mapping has no explicit pre-start badge

The screen derives a live pill as reconnecting, final, provisional, or otherwise live. A supplied tournament in doors/registration can therefore show live while its phase sentence says it is waiting to start. Typical hub watch links currently select live events, so this is a state-coverage risk rather than a demonstrated common entry failure.

**Improve:** Map every supported tournament state explicitly and verify the mapping against real entry paths.

Evidence: [status mapping](../../../../mobile/src/screens/arena/ArenaWatchScreen.tsx#L140).

### M6. P2 — The native world is intentionally static

The React Native `ArenaWorld` explicitly implements a still composition. `ArenaScreen` places it behind content at reduced opacity and adds a scrim. There are haptics and component entrances, but the animated environment and signature ceremonies are not equivalent to the web Studio assets.

**Improve:** Decide which small set of event-driven motion is worth implementing natively after measuring actual devices. A static background is a valid performance choice; it should not be represented as the full animated-world ambition having shipped.

Evidence: [native world](../../../../mobile/src/components/arena/art/environment/ArenaWorld.tsx), [screen shell](../../../../mobile/src/components/arena/ArenaKit.tsx#L45), [results](../../../../mobile/src/screens/arena/ArenaResultScreen.tsx).

### M7. P2 — The same demo URL has different behavior across platforms

Web `/arena/demo` is an offline simulation with fictional schools. Native URL resolution maps it to `ArenaWatch`, which resolves a real active event and otherwise shows no championship. No native simulation is provided by that route.

**Improve:** Define whether the mobile destination should offer a labeled demo, open the web demo, or clearly explain the different destination. Preserve safe link fallback rather than treating reserved words as tournament IDs.

Evidence: [native URL contract](../../../../mobile/src/navigation/arenaLinks.ts#L126), [watch resolution](../../../../mobile/src/hooks/useArena.ts#L866).

## Shared product priorities

The original ambition includes everyday school rivalry, competitive seasons, class competitions, meaningful rewards, and broad participation beyond the best five. The current implementation is strongest at quizzes, asynchronous challenges, XP boards, and scheduled championships. Do not assume those foundations already constitute live skill-based matchmaking, a seasonal school league, or class fixtures.

The next product prototype should prove:

1. I can start an appropriate contest immediately.
2. I understand whether it is practice, asynchronous challenge, or official live competition.
3. I recognize my school and a relevant opponent or target.
4. I understand my contribution and the next reason to return.
5. Watching makes the current round and its consequences easy to follow.

Choose one understandable time scope per board and label weekly, all-time, and official tournament results consistently. Do not change ranking or qualification rules as part of visual cleanup.

## Verification

- **Web:** 7 targeted suites passed; **164 tests**. Covered lobby/rival logic, Arena play, broadcast director/finale, motion state machine, and sound policy.
- **Mobile:** 7 targeted suites passed; **102 tests**. Covered links, watching helpers, answer receipts, view states, theme, result tiers, and lobby logic.
- Automated web final-podium accessibility spot check: **0 violations**; one contrast node remained incomplete and needs manual review. This does not certify other states or native accessibility.
- Native simulator check failed because `simctl` is unavailable. No dependencies or native tooling were installed.
- No real-event end-to-end or cross-device synchronization claim is made by these tests.

## Recommended next pass

1. Fix native practice/challenge intent and the spectator follow preference.
2. Protect the phone demo answer area from playback controls.
3. Keep unqualified schools out of ceremonial ranked podiums.
4. Make mobile everyday play and current-question watching the primary actions.
5. Integrate the approved motion and sound into real phases rather than expanding Studio further.
6. Unify the stage identity across lobby, event, broadcast, and result while retaining platform-specific composition.
7. Run a real school event with at least two physical phones and one browser, including reconnect and provisional-to-final transitions.

Audit artifacts only were added. No application code, configuration, production data, or deployment was changed.
