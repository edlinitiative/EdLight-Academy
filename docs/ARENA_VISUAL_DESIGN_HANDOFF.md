# EdLight Academy — Arena visual design handoff

Date: September 19, 2026  
Audience: Claude Code and the EdLight Academy product owner  
Companion: [Tournament audit and implementation handoff](ARENA_TOURNAMENT_AUDIT_AND_IMPLEMENTATION_HANDOFF.md)

## Purpose and status

This document defines a proposed visual direction for the monthly national trivia tournament. It expands the visual recommendations in sections K and L of the companion audit into screen-level guidance and review criteria.

**Verdict: the brand direction is promising; the experience is not yet visually polished or launch-ready.** Retain the useful identity and components, but redesign information hierarchy and competitive feedback.

This is a design handoff, not an approved pixel-perfect mockup or completed implementation. Creating this document does not authorize code changes, deployment, or changes to live tournament data. Implementation scope should be confirmed with the owner.

Security and result correctness in the companion audit remain prerequisites. A beautifully animated incorrect score is worse than a plain correct one.

## 1. Evidence and limits of the visual audit

### Actually inspected in the running web app

- Public homepage and games hub.
- Public spectator screen at desktop and 390-pixel phone width.
- Tournament invitation destination, which displayed a not-found page.

The broadcast had a coherent identity: dark navy, EdLight rays, restrained orange, a large countdown, and a Haiti map. However, it selected “Arène de test,” repeated the title, displayed “EN DIRECT,” and showed `00:00`, zero players/schools, and an empty map. The visual promise was stronger than the visible activity.

At phone width, the layout fit, but much of the screen was decorative space. Small, widely spaced labels and dark map details would be difficult to read through a compressed livestream.

The games hub used clean, conventional learning-app cards, but their repetition created a long scroll and did not establish the monthly event as a distinctive destination.

### Native component review only

The installed simulator build displayed “No script URL provided.” Native Arena screens were reviewed in source, not visually verified in a functioning app.

Source findings include a small tier timer, school-first result framing, unconfirmed “answer sent” messaging, missing recovery states, and a close action using a share icon. Actual native typography, spacing, scrolling, touch behavior, and animation still require device inspection.

**Do not tell the owner that native visual quality has been verified until the screens have actually been run.**

## 2. Product identity

The tournament should feel like **a monthly national individual championship with strong school identity**.

A student should understand:

- I am competing nationally.
- My school is visible and my performance contributes to its story.
- Everyone is participating in the same event.
- My answer was received and my result is trustworthy.
- I can see my progress even if I am not near the podium.

The owner has not finalized public naming. Existing terms include Arena/L’Arène, championnat, tournoi, and the weekly school competition. Propose one consistent public naming system rather than alternating terms without explanation.

Distinguish the monthly cash-prize event from ordinary practice games and weekly XP rankings. They may share brand elements, but should never look like interchangeable competitions.

### Visual assets to preserve

- Existing EdLight logo artwork; do not redraw it approximately.
- Navy, blue, and restrained orange as a recognizable palette.
- Rays as a supporting brand motif.
- School abbreviations as prominent textual identity.
- Large, readable competitive numbers.
- Existing theme, haptic, reduced-motion, and common component foundations.
- Darker broadcast presentation where appropriate.

### Avoid

- Adding more effects to compensate for missing information.
- An empty map as the dominant feature.
- Repeating the event title at multiple hierarchy levels.
- Generic cards around every piece of text.
- Constant shimmering, pulsing, or celebratory animation.
- Required player photos, avatar placeholders, or invented school crests.
- “Live” badges used for scheduled, stale, or disconnected content.
- Fake attendance, fabricated rank changes, or mock activity presented as real.
- Copy that makes students outside their school’s top five feel irrelevant.

## 3. Three visual modes

Keep shared typography, school labels, color meanings, and iconography, but let each mode serve a different purpose.

| Mode | Goal | Treatment |
|---|---|---|
| Before the event | Understand the event and become ready | Welcoming, informative, clear date/prizes/status, focused registration actions |
| During gameplay | Read, decide, submit, recover | Quiet, high contrast, large targets, minimal decoration, explicit receipt state |
| Spectator broadcast | Understand the race and its major moments | Expressive standings, large competitive numbers, purposeful scene changes, persistent event context |

Do not automatically put the whole mobile app into the broadcast’s dark palette. Preserve user theme support and evaluate any event-specific treatment on actual devices.

## 4. Visual system

These are proposed working constraints, to be reconciled with existing theme tokens during design. They are not a request to introduce a second unrelated design system.

### Typography

- Reuse the app’s installed fonts where they work. Audit existing `typeScale` and display tokens before adding new ones.
- Prioritize a highly readable sans-serif for timed questions, answer options, ranks, school abbreviations, and operational messages.
- Reserve expressive display typography for untimed event titles or celebration, where it does not compromise recognition of numbers.
- Use tabular numerals for clocks, scores, gaps, and ranks so changing values do not move the layout.
- Avoid tiny uppercase text for important rules, deadlines, or submission state.
- Suggested mobile starting ranges: body/answers 16–18 points, question 20–24 where content permits, supporting labels 13–14, prominent score/rank 32–48. Verify wrapping and accessibility scaling; do not force these sizes when they obscure content.
- Do not truncate the actual question or answer options. Shorten secondary presentation or allow deliberate scrolling instead.

### Spacing and surfaces

- Use a consistent spacing rhythm based on existing tokens; 4/8/12/16/24/32 is a reasonable working scale.
- Start with approximately 16–20 points of mobile side padding and generous separation between answer controls.
- Use surfaces to define interactive or meaningfully grouped content. Use typography and whitespace for the rest.
- Avoid stacking many cards with equal weight. Every screen needs one dominant task or piece of information.
- Respect safe areas, larger text, keyboard appearance, and bottom navigation/gesture areas.

### Color semantics

| Meaning | Treatment |
|---|---|
| Primary action / selected answer | Brand blue |
| Event emphasis / selected broadcast accent | Restrained orange |
| Confirmed correct answer | Success treatment plus text/icon |
| Confirmed incorrect answer | Error treatment plus text/icon |
| Sending / waiting | Neutral pending treatment |
| Connectivity issue | Explicit warning with readable action |
| Provisional result | Clearly labeled neutral/review treatment |

Selection is not correctness. Do not turn an answer green before the shared reveal. Color alone must not communicate correctness, connectivity, selection, or rank movement.

### School identity

- Show `Player name · SCHOOL` consistently, for example `Marie J. · CMDM`.
- Use canonical abbreviations supplied or approved by the school-data workflow.
- Provide full school names where students need to distinguish schools during selection or review their entry.
- When no abbreviation is verified, use a readable full-name fallback; do not invent one.
- Do not assume a school has an official color, logo, or crest. Optional decorative colors must not be presented as school branding.
- No required student profile pictures. Text identity is sufficient.

### Touch and accessibility

- Aim for at least 48-point answer/action targets, with sufficient separation.
- Support screen-reader labels and meaningful selected/disabled states.
- Accommodate large text and long French/Kreyòl strings.
- Respect reduced motion.
- Do not announce a rapidly ticking timer every fraction of a second to a screen reader.
- Verify contrast and focus states rather than relying on visual intuition.

## 5. Screen specifications

### 5.1 Event discovery and permanent event destination

**Primary question: What is happening, when, and how do I participate?**

Suggested order:

1. Event identity and month/edition.
2. Exact date and start time, explicitly interpreted in Haiti time.
3. Prize summary: first $100, second $50, third $25.
4. Brief format: synchronized questions, play in the mobile app.
5. Student’s current entry state.
6. One primary action based on the phase.
7. Secondary rules or watch action.

Suggested mobile structure:

```text
EdLight championship · [edition]
[Date] · [Start time in Haiti]

Play nationally. Represent your school.
1st $100     2nd $50     3rd $25

[ Register / View my entry / Join / Resume ]
Rules                               Watch live
```

Copy is illustrative and requires French/Kreyòl review. Do not treat English wireframe labels as final product copy.

The Home announcement can be compact, but should link to a durable event destination. Do not hide the only entrance when the competition becomes live.

| Event phase | Primary action |
|---|---|
| Registration open | Register |
| Registered, before check-in | View entry / reminder |
| Check-in open | Join waiting room |
| Live, registered | Resume competition |
| Live, not participating | Watch live |
| Reviewing | View provisional results |
| Final | View results / next event |

On web, explain the mobile requirement and preserve tournament identity through the app-opening/download path. A generic download page alone loses context.

References: `mobile/src/components/ArenaAnnounceCard.tsx`, `mobile/src/screens/DashboardScreen.tsx`, `src/components/ArenaBanner.tsx`, `src/App.tsx`, `mobile/src/navigation/AppNavigator.tsx`.

### 5.2 Registration and entry confirmation

**Primary question: Is my entry correct and complete?**

- Present player display name, grade/eligibility information, and school together.
- Reuse existing school profile identity instead of asking unnecessarily on every visit.
- School search must show full name, abbreviation, and verified location where available.
- Explain a pending school submission without making the student think they lost their individual entry.
- Make missing sign-in or grade actionable from the screen.
- Give rules/attestation a readable place before the registration action.
- After acceptance, show a durable confirmation with event date/time and identity.
- Provide a clear reminder action and explain the next step.

Separate these statements visually:

```text
Your individual entry: confirmed
Marie J. · CMDM

School competition: [qualification progress]
You can still compete individually if your school does not qualify.
```

School recruitment is secondary to successful personal registration. Never imply that the student is registering the school as an authorized representative when they are only declaring their affiliation.

References: `mobile/src/screens/arena/ArenaLobbyScreen.tsx`, `mobile/src/components/SchoolPicker.tsx`, `mobile/src/components/arena/QualificationBar.tsx`, `mobile/src/hooks/useArena.ts`.

### 5.3 Waiting room

**Primary question: Am I checked in, and when do we start?**

Suggested hierarchy:

1. Explicit checked-in confirmation and player/school identity.
2. Countdown to the actual first-question start.
3. Connection/readiness status.
4. Genuine attendance and school qualification information.
5. Short explanation of answer timing/receipt/reveal.

The countdown must be tied to the same authoritative event timing as gameplay. If the scheduled time passes without a start, transition to a clear delay message; do not sit at zero with “starting soon” indefinitely.

Attendance should distinguish registered from checked-in participants. Show school arrivals only if actual arrival data exists. Do not fabricate motion to make the room feel busy.

Connection copy should be precise: “Reconnecting…” or “Connection restored.” Avoid declaring a connection “perfect” from an unmeasured assumption.

References: `mobile/src/screens/arena/ArenaDoorsScreen.tsx`, `mobile/src/hooks/useArena.ts`, `mobile/src/components/arena/QualificationBar.tsx`.

### 5.4 Live question

**Primary question: What is the answer, and can I still submit?**

Suggested structure:

```text
Question 12 / 25                     [deadline]

[Question text, fully readable]

[ A   First answer                   ]
[ B   Second answer                  ]
[ C   Third answer                   ]
[ D   Fourth answer                  ]

[Submission status, when applicable]
```

- The question and choices dominate the screen.
- Keep category secondary and display it only when supplied correctly.
- Use a legible countdown with explicit semantics. If points tiers remain, explain them without creating two contradictory clocks.
- Do not cover answers with banners, score animations, or celebrations.
- Keep the layout stable when an answer becomes selected or acknowledged.
- One-tap irreversible selection can be retained only with clear instructions and robust receipt behavior; do not add an extra confirmation step casually to a timed round.
- Long text must remain usable on small devices and with larger fonts. Validate maximum authored content, math rendering, and all answer lengths.
- Treat math WebView rendering readiness and selection restrictions as functional requirements, not styling details.

References: `mobile/src/screens/arena/ArenaLiveScreen.tsx`, `mobile/src/components/MathText.tsx`, `mobile/src/services/arenaService.ts`, `mobile/src/hooks/useArena.ts`.

### 5.5 Submission receipt

**Primary question: Did the server accept my answer?**

| State | Visual/message behavior |
|---|---|
| Selected, request in flight | Selected blue state and explicit “Sending…” |
| Accepted | Clear receipt: “Answer received,” with neutral confirmation icon |
| Temporary failure | Honest failure/reconnecting state and safe retry behavior |
| Receipt uncertain | Explain that confirmation is being checked; do not invite a different answer |
| Deadline passed, not accepted | Clear “No answer recorded” or policy-specific equivalent |
| Restored session | Reconstruct accepted choice and receipt from authoritative state |

Do not show correctness through receipt colors, score changes, text, or haptics before the shared reveal. Network failure must not be presented as successful submission.

References: `ArenaLiveScreen.tsx`, `arenaService.ts`, `useArena.ts`, `api/arena/answer.ts`.

### 5.6 Reveal and between-question interval

**Primary question: What happened, and what changed for me?**

Suggested order:

1. Correct option and whether the student’s accepted answer was correct.
2. Points actually awarded for that question.
3. Personal national rank and movement, once settled data is available.
4. Gap to a nearby position or prize place when meaningful.
5. School contribution as secondary information.
6. Next-question progress indicator or countdown if accurately available.

Illustrative information pattern:

```text
Correct · +1,000 points
National rank 437     ↑ 28
School: CMDM · [settled school result]
Next question in [authoritative interval]
```

Do not render sample numbers as real data. If standings are still settling, say so and preserve the last confirmed position with an appropriate freshness label.

Do not assume a correct selected option earned points if its submission was not accepted. Correctness feedback and credited result are related but distinct facts.

This interval is where a student outside the top five should still feel progression. Avoid making “not in the five” the main judgment of their performance.

References: `ArenaLiveScreen.tsx`, `useArena.ts`, `ScoreCounter.tsx`, `CorrectFlash.tsx`, tournament result APIs/snapshots.

### 5.7 Results and prizes

**Primary question: How did I do, and what happens next?**

Hierarchy:

1. Provisional or official status, visible near the result.
2. Personal national rank and score.
3. Correct answers and clear supporting statistics.
4. School identity/result and contribution.
5. Winner claim action when the actual claim state requires it.
6. Share result and next event as separate actions.

- Every participant must have a complete result.
- Avoid an indefinite “your score will appear” state for omitted players.
- Do not announce an unverified prize as unconditionally won. Make review status understandable without making the experience cold or accusatory.
- Show actual claim deadline/status from the claim record, including a roll-down award when applicable.
- Use a share icon only for sharing; use an appropriate close/back control for dismissal.
- Next-event navigation must identify the next event, or explain that it has not been announced.
- Cancelled/void events need their own explanation, not a normal result layout with provisional wording.

References: `mobile/src/screens/arena/ArenaResultScreen.tsx`, `useArena.ts`, `src/pages/ArenaClaim.tsx`, claim service/API.

## 6. Spectator and broadcast specification

**Primary question: Who is winning, how close is the race, and what just changed?**

### Persistent context

Keep event identity, phase, question progress, and data freshness visible during ordinary board scenes. Use truthful labels: scheduled, checking in, live question, reveal, reviewing, official final, or disconnected.

Do not use a permanent “EN DIRECT” badge to conceal stale data or a delayed event.

### Main individual board

The individual Top 10 should be a first-class broadcast mode. Proposed row information:

| Rank | Player | School | Points | Movement |
|---|---|---|---:|---|
| [rank] | [public name] | [abbreviation] | [settled score] | [change] |

- Make the three prize positions visually identifiable without overwhelming the other seven.
- Use a clear gap callout where it explains the race; avoid adding every possible statistic to every row.
- Keep names and abbreviations readable at the intended output size and after livestream compression.
- Handle long names and missing abbreviations deliberately.
- Provide a full-list/nearby-rank experience separately from the broadcast Top 10 if needed.
- On portrait output, verify whether ten rows remain readable. If not, use a designed two-page sequence with persistent leaders and explicit page labels, rather than shrinking indefinitely.

### School board

Retain a dedicated school mode with abbreviation, rank, scoring metric, movement, and qualification context. Label the metric accurately: an average is not an individual score or school total.

School standings complement the individual race; they should not erase it.

### Event moments

Use scenes for meaningful changes:

- A new leader.
- Entry into or exit from a prize position.
- A major climb.
- A close score gap before the final questions.
- A school overtake.
- Final question stakes.
- Provisional podium and eventual official results.

Every scene should answer who changed, what changed, and why it matters. Do not interrupt the main board for trivial changes or repeated facts.

### Map

The Haiti map is a supporting scene, not mandatory background furniture.

- Use it when verified participation/location data tells a useful story.
- Clearly state unknown/unplaced school locations.
- Do not imply student residence is school location.
- Avoid displaying precise student locations.
- If data is absent, use a useful event-information layout instead of a large empty map.

### Producer controls

Plan for manual scene selection, hold, return to board, replay of a labeled past moment, and safe broadcast delay. Automatic scene selection should remain available but not be the producer’s only option.

Public output must not leak answer/correctness information during the playable window. All movement and score scenes depend on settled snapshots.

### Output formats

- Landscape: design and verify a 1920×1080 composition.
- Portrait: design and verify a 1080×1920 composition.
- Ordinary spectator phone view: readable, navigable, responsive layout distinct from a video capture canvas when necessary.
- Leave configurable safe margins for stream overlays; validate against the actual production setup rather than assuming permanent social-platform UI dimensions.

References: `src/pages/Direct.tsx`, `src/broadcast/Stage.tsx`, `SceneFrame.tsx`, `sceneContract.ts`, `scenes/Board.tsx`, other scenes/segments, `stage.css`, `src/pages/Live.css`, `shared/arena/director.ts`.

## 7. Motion and sound principles

Motion communicates change. It should not manufacture urgency or hide stale information.

| Interaction/event | Proposed behavior |
|---|---|
| New question | Brief transition that never delays readability or tapping |
| Selected answer | Immediate restrained selection feedback |
| Accepted receipt | Small neutral confirmation; no correctness cue |
| Reveal | Short correct/incorrect feedback, respectful rather than punitive |
| Score update | Brief count-up toward the actual settled value |
| Rank movement | Animate from old to new position, then settle |
| New leader/podium | Stronger, reserved treatment for a genuinely major event |
| Reduced motion | Static state change or restrained fade, preserving all information |

- Reuse existing motion tokens where possible. Proposed starting ranges are roughly 120–200 ms for selection feedback and 200–350 ms for short transitions; tune on actual devices.
- Do not delay question input until an entrance animation finishes.
- Avoid looping decoration behind the question.
- Avoid shaking or flashing that distracts or feels punitive.
- Use haptics sparingly and consistently; success haptics must wait for authoritative reveal/result.
- Sound is optional future work, not a prerequisite. If introduced, provide a clear mute setting and ensure the event remains fully understandable without it.
- Major broadcast moments need sufficient reading time, but stale scenes must not obscure current progress.

References: existing mobile motion/haptics utilities, `StageEnter.tsx`, `CorrectFlash.tsx`, `ScoreCounter.tsx`, `shared/arena/director.ts`.

## 8. Required exceptional-state designs

Design these before calling the experience complete:

| State | Required communication/action |
|---|---|
| No upcoming event | Explain when/where announcements appear; offer practice |
| Registration closed | Explain eligibility to resume or watch |
| Missing sign-in/grade/school | Direct completion action preserving event context |
| Pending school | Explain individual entry and school-review status separately |
| Checked in but school unqualified | Confirm individual participation remains valid |
| Start delayed | Explicit delay status, updated expectation if known |
| Offline before question | Connection warning and recovery, no fabricated readiness |
| Disconnect during submission | Uncertain receipt state and safe status recovery |
| Rejoining mid-event | Restore current question and accepted answer state |
| Missed question | Honest missed state; continue to current event position |
| Standings stale | Last confirmed information and freshness/reconnecting label |
| Cancelled/void | Clear explanation and next step |
| Scores under review | Provisional status, complete personal result when available |
| Claim required/expired/reviewed | Actual claim state and relevant action |
| School/name missing | Readable fallback, no invented identity |

Error states should not silently become “no tournament scheduled.” An unavailable service and an absent event mean different things.

## 9. Data contracts the visual design depends on

Do not build impressive presentation around unavailable or unsafe fields. Confirm the backend supplies:

- Stable event ID, edition/title, Haiti-local schedule interpretation, current phase, and delay/cancellation status.
- Registration/check-in state and canonical player/school display identity.
- Authoritative question timing and current question identity.
- Accepted answer receipt and recoverable submission status.
- Settled per-question result and personal cumulative result for every player.
- Versioned/fresh standings with correct previous-rank comparison.
- School qualification and contribution from approved roster rules.
- Actual claim state/deadline, not a rank-based guess.
- Public-safe event counts and verified school locations.

Use a known unknown state when data is unavailable. Never show zero as if it were a confirmed count merely because a field or request is missing.

References: companion audit sections C, E, H, and J; Arena API/service/hook contracts.

## 10. Design deliverables before implementation

Prepare reviewable annotated layouts for:

1. Home event announcement and permanent event page.
2. Registration and confirmed entry.
3. Waiting room with real data and delayed-start variation.
4. Live question with short, long, and mathematical content.
5. Sending, accepted, failed, and uncertain receipt states.
6. Reveal with personal rank movement and school contribution.
7. Ordinary participant result and provisional winner result.
8. Landscape individual Top 10 and school board.
9. Portrait broadcast composition.
10. Disconnected, cancelled, and under-review screens.

Include typography/spacing/color tokens, component states, motion annotations, and which values come from which data contracts. Use realistic French/Kreyòl content and clearly labeled fixtures.

Do not require Figma specifically; choose a review format the owner can inspect easily. High-fidelity mockups should be reviewed before broad screen implementation.

## 11. Visual implementation sequence

### Pass 1 — information and truthfulness

- Fix entry points and state-dependent actions.
- Establish clear identity, schedule, and prize hierarchy.
- Design honest receipts/recovery.
- Give every student a personal result.
- Correct live/provisional/stale labels.

### Pass 2 — mobile composition

- Implement coherent type/spacing/surfaces using existing tokens.
- Validate questions/answers on small screens and large text.
- Improve school selection/confirmation and between-question feedback.
- Review in both supported languages and themes.

### Pass 3 — broadcast composition

- Design individual Top 10 and school modes.
- Reduce decorative rays where they compete with information.
- Use map only when informative.
- Create distinct portrait/landscape arrangements.
- Connect movement scenes to settled data and producer controls.

### Pass 4 — polish and rehearsal

- Tune motion/haptics and reduced-motion behavior.
- Check real-device responsiveness, loading, touch feedback, and font rendering.
- Rehearse the entire event with populated standings and actual state transitions.
- Capture and review broadcast output through the intended streaming setup.

## 12. Visual acceptance criteria

- A new visitor can identify what the event is, when it starts, the prizes, and how to join without searching through the games catalog.
- A registered student can find and resume the live event.
- Individual entry and school qualification are visibly distinct.
- The question and every option remain readable on a small supported phone with realistic maximum content.
- Submission state never claims acceptance before server confirmation.
- Selected, accepted, correct, incorrect, missed, and failed states are visually distinct without depending solely on color.
- Every student receives meaningful personal result information, including outside the school top five.
- Official versus provisional results are unmistakable.
- Broadcast viewers can identify the leader, close competitors, schools, and question progress at a glance.
- Portrait output is designed rather than merely shrunk from landscape.
- Empty/stale/disconnected states remain useful and truthful.
- School names/abbreviations are not invented, clipped beyond recognition, or confused with player identity.
- No required profile photos or placeholder avatars occupy competitive information space.
- Animations communicate actual changes and do not delay answering.
- Reduced motion and large text retain equivalent information.
- French/Kreyòl strings, long names, scores, and math render without clipping or collisions.
- Visual review uses working native builds; source inspection alone is not accepted as native verification.
- A full staged event is reviewed from participant, operator, and spectator perspectives before launch.

## 13. Files likely involved

| Area | Existing locations |
|---|---|
| Shared mobile visual system | `mobile/src/theme/theme.ts`, motion/theme utilities, reusable UI components |
| Discovery | `mobile/src/components/ArenaAnnounceCard.tsx`, `mobile/src/screens/DashboardScreen.tsx`, `src/components/ArenaBanner.tsx`, `src/pages/Dashboard.tsx` |
| Entry routes | `src/App.tsx`, `mobile/src/navigation/AppNavigator.tsx` |
| Registration/schools | `mobile/src/screens/arena/ArenaLobbyScreen.tsx`, `mobile/src/components/SchoolPicker.tsx`, `mobile/src/components/arena/QualificationBar.tsx` |
| Waiting room | `mobile/src/screens/arena/ArenaDoorsScreen.tsx` |
| Question/receipt/reveal | `mobile/src/screens/arena/ArenaLiveScreen.tsx`, `mobile/src/components/MathText.tsx`, `mobile/src/components/trivia/StageEnter.tsx`, `CorrectFlash.tsx`, `ScoreCounter.tsx` |
| Results | `mobile/src/screens/arena/ArenaResultScreen.tsx`, `src/pages/ArenaClaim.tsx` |
| State/data integration | `mobile/src/hooks/useArena.ts`, `mobile/src/services/arenaService.ts` and backend contracts listed in companion audit |
| Broadcast shell | `src/pages/Direct.tsx`, `src/pages/Live.css`, `src/broadcast/Stage.tsx`, `SceneFrame.tsx`, `stage.css` |
| Broadcast scenes/data | `src/broadcast/scenes/`, `segments/`, `useStage.ts`, `useOnAir.ts`, `useMapPlaces.ts`, `sceneContract.ts`, `shared/arena/director.ts` |

The file list is a starting map, not an instruction to rewrite every file.

## Final recommendation

**Retain the EdLight brand direction. Redesign screen hierarchy, participant feedback, and broadcast composition.**

The most important visual improvement is not another animation. It is making the event understandable and trustworthy: a clear entry, an unmistakable accepted answer, meaningful personal progress, and a spectator view that explains the race.

Status: visual-design handoff only. No application code or production data was changed to create this document.
