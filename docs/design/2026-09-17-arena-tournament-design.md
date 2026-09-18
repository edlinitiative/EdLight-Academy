# The Arena — live inter-school trivia championship

**Status:** proposal, nothing implemented. Written 2026-09-17 after auditing the repository.

A recurring monthly championship played inside the EdLight Academy mobile app, with
a public broadcast on the web. Two simultaneous competitions: schools ranked on
their best five players, and individuals ranked outright for cash.

---

## A. Existing system audit

### What exists and is directly reusable

| Area | What is there | Verdict |
|---|---|---|
| **Auth** | Firebase Auth; `requireAuthDecoded(req,res)` verifies a Bearer ID token in every API route and returns `{uid, name}` | **Reuse as-is.** Tournament APIs authenticate identically. |
| **Server-authoritative writes** | `api/leaderboard/award.ts`, `api/challenges/*` — client posts, Admin SDK writes, rules deny client writes | **Reuse the pattern.** It is exactly what a tournament needs. |
| **Rate limiting** | `api/_lib/rateLimit.ts`, Firestore-backed, per-uid per-bucket. Unknown buckets fail open | **Reuse**, but see Risks — fail-open is wrong for a tournament. |
| **School registry** | `shared/schools.ts` (matching/dedupe), `shared/data/schools-seed.json` (94 schools), `schools` Firestore collection with rules live | **Reuse and extend.** Needs short names, logos, verification state. |
| **Team scoring** | `rankTeams()` in `shared/leaderboardAgg.ts` — best-five, qualification floor of 5, `needed` count | **Reuse.** Formula changes from sum to mean (see E). |
| **Leaderboards** | `leaderboards/{weekId}/entries/{uid}` + `all-time`; `api/leaderboard/collectives` exhaustive group ranking; 15-min snapshot cron | **Reuse for the weekly game. Do NOT reuse for the tournament** — see F. |
| **Trivia engine** | `TriviaScreen`, 15 categories, ~917 questions, `seededDraw` reproducing an exact draw from bank indexes, timer ring, answer states, XP | **Reuse the UI and the interaction. Do NOT reuse the question source** — see Risks R1. |
| **Duels** | `challenges/{code}`, create/accept APIs, XP payout, push on result | Reuse as a **pre-tournament warm-up** mechanic, not in the tournament itself. |
| **Push** | `sendExpoPushToUser()`, tokens in `users/{uid}.expoPushTokens`, tap routing in `App.tsx` | **Reuse.** T-24h / T-1h / T-10m / doors-open. |
| **Cron** | Vercel crons in `vercel.json`, several already running on `*/15` | **Reuse** for pre/post-tournament jobs. Not for in-round work (see F). |
| **Mobile delivery** | Expo + EAS Update, `runtimeVersion` pinned `1.2.0`; JS ships OTA, native modules need a build | Critical constraint on phasing. |
| **Design system** | Limyè tokens; `motion.ts` (springs, easings, stagger); `RayBurst`, `StreakFlame`, `ChampionMedallion`; the `/direct` stage (rays, hairline board, Geist Mono figures) | **Reuse the stage's visual language.** It is already broadcast-shaped. |

### What does NOT exist

1. **Any realtime infrastructure.** Grep for `onSnapshot` across the whole product returns exactly one feature: the comments feed. Every other surface — including the live stage at `/direct` — is react-query polling. There is no socket layer, no presence, no pub/sub, nothing to extend.
2. **No server-held question bank.** All ~917 questions ship inside the app bundle with their answers (`mobile/src/data/triviaData.ts`).
3. **No screen-capture protection.** `expo-screen-capture` is not installed. `AppState` is available and already used for exam autosave.
4. **No tournament concepts at all** — no event, no registration, no round, no submission, no integrity record.
5. **No school short names, logos, or verification state.** The seed is name + applicant count only.
6. **No admin tooling for schools.** The admin console has content/users/data sections; nothing for approving or merging schools.

### Two findings that change the design

**The question bank is public.** It is in the JS bundle, which is downloadable. That is harmless today and unacceptable the moment $175 is on the line. Tournament questions must be server-held and delivered just-in-time, without answers. This is not optional.

**Rate limiting fails open on unknown buckets** (`if (!limit) return {allowed:true}`). Fine for a feature that ships before its config; wrong for an endpoint that decides prize money.

---

## B. Product architecture

The Arena is a **mode inside Academy**, not a section of the Jeux tab and not a
separate app. It gets its own root route in the mobile navigator and takes over
the screen on tournament night — the tab bar hides, exactly as the exam runner
already does via focus mode.

```
Academy (mobile)
├─ Accueil · Cours · Examens · Jeux · Profil        ← unchanged
└─ ARENA  (root stack route, tab bar hidden)
   ├─ Lobby      before the event: countdown, registration, school, invite
   ├─ Warm-up    practice rounds off the bundled bank, no stakes
   ├─ Doors      T-10m: the room fills, presence counts climb
   ├─ Live       the tournament itself
   └─ Result     provisional standing, share card, next event teaser

academy.edlight.org (web)
├─ /arena        public: schedule, registration, qualification, history
├─ /direct       the broadcast (audience-facing, exists in embryo today)
├─ /direct/regie commentator view — more data, less cinema
└─ /champions    Hall of Champions
```

**Why a root route and not a Jeux sub-tab.** On tournament night this is the
product. Anything that lets a student wander into Cours mid-round and lose their
place is a defect. The exam runner already establishes the pattern for a
takeover screen in this codebase.

**Separation of concerns that matters most:** gameplay and broadcast share a data
source but never a dependency. The spectator system reads; it never sits in the
path of a student's answer. If `/direct` falls over at 18:40, nobody playing can
tell.

---

## C. Data model

All under Firestore. Client writes are denied on everything below; every write
goes through an API route with the Admin SDK.

### `tournaments/{tournamentId}`
```
slug            "2026-09-championnat"
title           "Championnat EdLight — Septembre 2026"
state           draft|registration|doors|live|grading|provisional|final|void
startsAt        Timestamp
doorsAt         Timestamp        // startsAt − 10 min
rounds          [{index, questionCount, category, label}]
questionCount   25
teamSize        5                // frozen per tournament, never global
minPlayers      5                // qualification floor
prizes          {individual:[10000,5000,2500]}   // cents USD
currentRound    number|null
currentQuestion {index, opensAt, closesAt, seq}|null
countsPublic    {schools, players, qualifiedSchools}
createdAt, finalisedAt
```

### `tournaments/{tid}/questions/{index}`  — **admin read only**
```
index, prompt, promptHt, options[], optionsHt[], answerIndex,
explanation, category, difficulty, points
```
Never served to clients with `answerIndex`. Rules: `allow read: if false`.

### `tournaments/{tid}/live/{index}`  — the delivery document
```
index, seq, prompt, promptHt, options[], optionsHt[],
opensAt, closesAt, state: pending|open|closed
```
**This is the fan-out primitive.** Every playing client subscribes to one
document. No answer key. Written once when the round opens, once when it closes.

### `tournaments/{tid}/players/{uid}`
```
uid, displayName, schoolKey, schoolLabel, grade,
score, correct, answered, totalMs, streak, bestStreak,
rank, schoolRank, eligible: boolean, flags: string[],
registeredAt, lastAnswerAt
```
One doc per player, ~25 writes over 30 minutes. No hot document.

### `tournaments/{tid}/answers/{uid}_{index}`  — **idempotency by construction**
```
uid, index, choice, clientShownAt, serverReceivedAt,
elapsedMs, tier: full|half|none, correct, points,
focusLosses, appVersion, deviceHash
```
The composite ID makes a double submission a no-op, not a race.

### `tournaments/{tid}/standings/current`  — single doc, spectator fan-out
```
seq, computedAt,
schools: [{key, short, label, teamAvg, teamTotalMs, counted, members, qualified, rank, previousRank}],
individuals: [{uid, displayName, schoolShort, score, correct, avgMs, rank, previousRank}],
```
One document. Ten thousand spectators subscribe to it. This is the whole
spectator read cost.

### `tournaments/{tid}/events/{seq}` — the broadcast feed
See section G.

### `schools/{id}` — extended
```
name, key, shortName, aliases[], city, commune,
logoUrl|null, colors|null, verified: boolean,
status: pending|approved|merged, mergedInto|null,
submittedBy, createdAt
```

### `tournamentRegistrations/{tid}_{uid}`
```
uid, tid, schoolKey, grade, attestedAt, eligible, deviceHash
```
Separate from `players` so registration is auditable independently of play.

---

## D. Tournament state machine

States live on the tournament document and advance **only** by an admin action or
a scheduled job. Nothing about the clock is trusted to a client.

```
draft ──▶ registration ──▶ doors ──▶ live ──▶ grading ──▶ provisional ──▶ final
                                       │                        │
                                       └──────── void ◀─────────┘
```

| State | Enter when | What is true | Client behaviour |
|---|---|---|---|
| `draft` | created | questions authored, not visible | invisible |
| `registration` | admin publishes | students register, pick school, invite | Lobby |
| `doors` | `doorsAt` (cron) | room open, presence counting, no questions | Doors |
| `live` | admin presses start | rounds advance | Live |
| `grading` | last question closes | submissions closed, aggregates settling | "Calcul des scores…" |
| `provisional` | aggregates final | standings public, **prizes not paid** | Result + podium |
| `final` | integrity review passes | prizes released, history written | Champions |
| `void` | admin, any time | the event did not count | explained, XP kept |

**Round advance is server-driven.** A scheduled worker (or an admin "next"
control, for the first few events) writes `live/{index}` with `opensAt` and
`closesAt`, then flips `state:'closed'` when the window passes. Clients react;
they never decide.

**Why an admin can drive it manually at first.** The first event will have a host
on Instagram Live. A human pressing "next question" when the commentary lands is
better television than a cron, and it removes an entire class of
"the round advanced while the host was still talking" failure. Automate it in
phase 3 once the rhythm is known.

---

## E. Scoring

### Individual

```
points(question) = correct ? tierPoints(elapsedMs) : 0

tierPoints(ms) = 1000   if ms <= 12_000       // full
                  500   if ms <= 20_000       // half
                    0   otherwise
```

**Correctness first, speed as a tier — not a continuous curve.** A continuous
speed decay ranks connections as much as knowledge, and in Haiti that is a real
and unfair difference. Two tiers are insensitive to a few hundred milliseconds of
jitter. The tier boundary is also where cheating gets *priced*: a
screenshot → AI → read → answer round trip realistically lands at 15–25s, so a
cheat scores half at best and loses to anyone who simply knew it.

**The clock starts when the question renders on the student's device**, not when
the server opened it — otherwise a slow connection is taxed for the network.
The client reports `clientShownAt`; the server clamps it:

```
shownAt = clamp(clientShownAt, opensAt, opensAt + GRACE_MS)   // GRACE_MS = 3000
elapsedMs = serverReceivedAt − shownAt
```
A client claiming it rendered late simply gets the lower tier. The exploit is
bounded at three seconds and it can never *gain* time.

### School

```
teamAvg = mean(score of the top `teamSize` eligible players)
qualified = eligiblePlayers >= minPlayers        // 5
```

**Mean of the top five, not sum.** With a fixed team of five the two rank
identically — but the mean is the number to *display*, because it is comparable
across schools mid-tournament and it is the number a commentator can say out
loud ("CODOSA are averaging 840"). `rankTeams()` currently returns the sum; this
is a one-line change plus a display decision.

The Top 5 is **recomputed on every aggregation tick**, so a player entering or
leaving the five is a live event — which is exactly the broadcast moment the
product concept asks for.

### Tiebreakers, in order

1. Higher `teamAvg`
2. **Lower total response time across the Top 5** — rewards the school that was faster to the same score
3. More correct answers across the Top 5
4. Earlier school qualification timestamp

All four are deterministic, server-computable, and stable across recomputation.
Ties beyond (4) are impossible in practice; if they occur the standings hold both
at the same rank and the next rank is skipped.

Individual ties: higher score → lower total response time → more full-tier
answers → earlier registration.

---

## F. Real-time architecture

### The recommendation: Firestore listeners, not WebSockets

The product runs on Vercel serverless functions and Firebase. A WebSocket layer
would mean a new always-on service, a new deployment target, new auth plumbing,
and a new outage surface — to solve a problem Firestore already solves, in an SDK
that is already in both apps, already integrated with the auth this product uses,
and already configured with offline persistence.

**Question delivery is one document.** Every playing client subscribes to
`tournaments/{tid}/live/{index}`. Firestore's fan-out for a single document to N
listeners is exactly the primitive needed: one write, N pushes, no per-client
work on our side. 10,000 listeners on one document is well inside what Firestore
does routinely.

**Answers never touch Firestore from a client.** They go to
`POST /api/arena/answer` with the ID token. The server stamps receipt time,
scores, and writes. Firestore rules deny all client writes to every tournament
collection. This is the same shape as `challenges/accept`, which already works.

**Spectator fan-out is also one document** — `standings/current`, rewritten by
the aggregator every few seconds. Ten thousand spectators cost ten thousand
listeners on one doc, not ten thousand queries.

### Why not a WebSocket server anyway

Vercel Functions *can* hold WebSockets on Fluid Compute now, so it is possible.
It is still wrong here: it buys sub-100ms delivery that this format does not
need (a 15-second question does not care about 300ms), and it costs a stateful
component in a product that currently has none. Revisit only if a future format
needs true sub-second interaction — a buzzer round, for instance.

### The write path, and why it does not melt

Peak load: 10,000 players × 25 questions = 250,000 answer submissions over ~30
minutes, bursting into the first ~5 seconds after each question opens.

- **~2,000 writes/sec at the burst.** Firestore sustains this given the keys are
  well distributed, and they are: `answers/{uid}_{index}` and `players/{uid}` are
  both uid-keyed, so there is no hot document and no sequential-key hotspot.
- **No counter is incremented globally.** The naive design — a running school
  total — is exactly the 500-writes/sec-per-document limit, hit instantly. It is
  avoided entirely by not keeping one.
- **Standings are recomputed, not accumulated.** The aggregator runs ONCE PER
  QUESTION CLOSE, inside the pause, not on a timer — see the correction below:
  for each school, query the top 5 players by score (composite index on
  `schoolKey asc, score desc, totalMs asc`), compute the mean, diff against the
  previous standings, emit events, write one `standings/current` document.
  With ~150 schools that is ~150 small indexed queries per tick — bounded by
  school count, not player count, which is the property that makes it scale.

### Reconnect, latency, degradation

- A client that reconnects re-reads `live/{index}` and resumes at the current
  question. Missed questions are scored zero; there is no catch-up, because
  catch-up is indistinguishable from cheating.
- Answer submission is idempotent by document ID, so a retry after a timeout is
  free and safe.
- If the aggregator dies, gameplay is unaffected — answers are still recorded.
  Standings freeze, the broadcast freezes, and the tournament is still valid
  because the authoritative record is `answers/*`, which can be re-aggregated
  after the fact.
- If Firestore listeners drop on mobile, the client falls back to polling
  `live/{index}` every 2s. Worse, but playable.

**The invariant:** the broadcast is derived, never authoritative. Everything on
screen can be recomputed from `answers/*` at any time.

---

## G. Event engine

The frontend must not infer drama from score diffs. The aggregator emits typed
events into `tournaments/{tid}/events/{seq}`, monotonically sequenced, each
carrying **everything needed to render it** — the broadcast never queries back.

### Envelope
```
seq            monotonic integer
type           EventType
priority       1..10   (10 preempts)
createdAt      server timestamp
round, questionIndex
ttlMs          how long it stays worth showing
payload        type-specific, fully denormalised
```

### The catalogue

| Type | Priority | Trigger | Payload |
|---|---|---|---|
| `TOURNAMENT_OPEN` | 10 | state→doors | counts |
| `ROUND_START` | 9 | question opens | index, category, total |
| `QUESTION_CLOSED` | 7 | window passes | index, correctPct, fastestMs |
| `LEAD_CHANGE` | 10 | rank-1 school changes | newLeader, displaced, margin, causedBy[] |
| `SCHOOL_OVERTAKE` | 8 | any school gains ≥1 rank | school, from, to, passed[], causedBy[] |
| `PLAYER_ENTERS_TOP_5` | 8 | top-5 membership changes | player, school, displaced, newTeamAvg, delta |
| `PLAYER_LEAVES_TOP_5` | 6 | — | player, school, replacedBy |
| `PERFECT_ROUND` | 7 | player answers a full round correctly at full tier | player, school, roundIndex |
| `PLAYER_STREAK` | 6 | streak crosses 5, 10, 15… | player, school, streak, avgMs |
| `SCHOOL_STREAK` | 6 | school's top 5 all correct on a question | school, count |
| `BIGGEST_CLIMBER` | 5 | per round, max rank gain | school, gained, from, to |
| `COMEBACK` | 8 | school re-enters top 3 from outside top 8 | school, wasRank, nowRank |
| `TIE` | 7 | top-2 margin < 1% | schools[2], margin |
| `PLAYER_CARRY` | 6 | one player contributes >35% of a school's teamAvg | player, school, sharePct |
| `HALFTIME` | 10 | midpoint question closes | standings snapshot, superlatives |
| `FINAL_FIVE` | 9 | 5 questions remain | top schools, margins |
| `FINAL_QUESTION` | 10 | last question opens | what is at stake per school |
| `GRADING` | 10 | state→grading | — |
| `CHAMPION_SCHOOL` | 10 | state→provisional | school, teamAvg, top5 players |
| `CHAMPION_INDIVIDUAL` | 10 | state→provisional | podium[3] |

### Rules that keep it watchable

- **`causedBy` is mandatory** on every movement event: the player answers that
  produced the change. This is what lets the broadcast connect a player's
  correct answer to their school's overtake, instead of showing two unrelated
  animations.
- **One event per fact.** A school overtaking three schools at once is one
  `SCHOOL_OVERTAKE` with `passed[3]`, not three events.
- **Suppression.** Below priority 8, at most one event per school per round, and
  a global cap of ~4 emitted events per round. Drama that happens constantly is
  not drama. The aggregator drops the rest rather than letting the client filter,
  so the commentator view and audience view agree on what mattered.

---

## H. Player mobile UX, screen by screen

### 1 · Lobby (from announcement to doors)
Countdown as the hero, in the tabular mono the stage uses. Below it, in order of
what the student can act on:

- **Your school** — chip if chosen, search if not. The picker already exists.
- **Qualification** — `CODOSA · 3/5` with a five-segment bar. When it completes,
  the card changes state once and permanently: **CODOSA EST QUALIFIÉ**.
- **Invite** — one button, WhatsApp-shaped message, carrying the referral code
  the growth rails already mint. Copy is school-framed, never personal:
  *"Il manque 2 joueurs à CODOSA pour se qualifier."*
- Registered schools / players counters, rules, prizes, past champions.
- **Warm-up** — practice rounds off the bundled bank. No stakes, no XP effect.

### 2 · Registration (one sheet, three fields)
Name (prefilled), school (picker), grade (prefilled if known). Then a single
attestation checkbox — *"Mwen konfime enfòmasyon sa yo kòrèk. Si m genyen, m ap
bezwen prouve idantite m."* — which is the deterrent that matters, and it costs
nothing at signup because the verification only ever touches winners.

### 3 · Doors (T−10m)
The room filling is the content. Presence count climbing, schools arriving
(*"SLDG vient d'entrer"*), your school's five confirmed. A "ready" state so the
student commits before the first question.

### 4 · Live
The existing trivia frame, stripped and tightened:

- Question index, category, and **the tier clock** — a ring that visibly crosses
  the full/half boundary, because the tier must be legible *while answering*, not
  explained afterwards.
- Question, four options, one tap, immediate lock. No change-your-mind: the
  submission is the commitment.
- **Between questions**, the only thing on screen is your school's position and
  whether you are in its five. That is the tension that makes a student care
  about the next question.
- Correct/incorrect reveal reuses the existing answer states and `CorrectFlash`.

### 5 · Result
Provisional individual rank, school rank, your contribution (in the five or not),
accuracy, average time. A share card. Next tournament teaser. Explicitly labelled
**provisional** until integrity review completes.

**What is deliberately absent during play:** a live global leaderboard. Watching
yourself drop mid-round is demoralising and it invites tab-switching. Your school
and your five — that is it.

---

## I & J. Spectator and broadcast UX

Three surfaces, one engine.

| Surface | Audience | Density |
|---|---|---|
| `/direct` | anyone, on a phone or a laptop | cinematic, low density |
| `/direct/scene` | the big screen at a watch party | cinematic, larger type, no chrome |
| `/direct/regie` | the commentator, on their own device | high density, deliberately unglamorous |

### The director — the architectural decision that decides whether this is cinema or a table

The spectator page is **not** a leaderboard that animates. It is a **director**
consuming the event queue and deciding what is on screen:

```
Director
  queue        events by seq, priority-ordered within a window
  current      the scene being shown
  minDwellMs   a scene is never cut before it can be read  (2400ms)
  maxDwellMs   nothing holds the screen forever            (7000ms)
  fallback     BOARD — the standings, which is where it always returns
```

Rules:
- The board is the **resting state**, not the only state. Between moments it is
  what you see; a moment takes the screen and gives it back.
- A priority-10 event preempts; anything lower queues.
- If two events describe the same fact (`PLAYER_ENTERS_TOP_5` that caused a
  `SCHOOL_OVERTAKE`), they are **composed into one scene**, not played in
  sequence. This is the difference between storytelling and a notification feed.
- If the queue is empty for >20s the board gets ambient interest — a closest-race
  callout, a streak stat — rather than sitting still.

Without a director you inevitably build an animated table, because every event
becomes a row moving. With it, the *camera* moves.

### The commentator view

Not cinematic. A dense single screen that answers what a host needs mid-sentence:
current top 5 with margins, the closest race, biggest mover this round, players
on streaks, schools about to drop out of the top 5, milestones approaching
(*"SLDG needs 40 to take the lead"*), and a rolling **suggested talking points**
list generated from the same events the audience view is animating. It updates
without animation, because a commentator reading a screen does not want motion.

---

## K. Motion system — the twenty sequences

Built from the existing stage language: the mark's straight rays as architecture,
hairline rules, tabular mono figures, coral as the single flourish. **No
gradients, no glass, no particles, no neon.** Motion exists to say what changed.

Shared grammar:
- **Enter** 320ms, `cubic-bezier(0.16,1,0.3,1)`, 14px of travel. **Exit** 180ms.
- **Rank movement** always travels — a row never teleports, because the travel
  *is* the information.
- **A ray sweep** marks a gain. Nothing else uses it.
- Type hierarchy per scene: one number is the biggest thing on screen. Never two.

| # | Sequence | Trigger | On screen · motion · return | Dur | Sound cue |
|---|---|---|---|---|---|
| 1 | **Pre-show** | `doors` | Countdown in huge mono; schools arriving as a ticker; ray field slow. Numbers tick, nothing else moves. Holds until start. | — | bed, low |
| 2 | **School introductions** | doors, cycling | Short name huge (CODOSA), full name beneath, player count, qualification. One per 3s, hard cut, ray sweep between. | 3s ea | stab per card |
| 3 | **Start** | `ROUND_START` #1 | Rays accelerate once and settle; board wipes in from the left rule; "QUESTION 1 / 25". | 1.6s | downbeat |
| 4 | **Question transition** | each `ROUND_START` | Board dims to 40%; index counter rolls; category word crosses the screen and leaves. Board returns. | 900ms | tick |
| 5 | **Round results** | `QUESTION_CLOSED` | Board brightens; % correct fills as a hairline; fastest answer named bottom-left. | 2.2s | soft chime |
| 6 | **Lead change** | `LEAD_CHANGE` p10 | Board pushes down and out. New leader's short name fills the screen, school colour bar, `teamAvg` counting up; displaced school named small beneath ("dépasse SLDG"); the `causedBy` player named last. Board returns with the new order already settled. | 4.5s | sting |
| 7 | **Overtake** | `SCHOOL_OVERTAKE` p8 | No full takeover. The lane lifts out of the board, travels past the lanes it passed (which shift down in the same motion), ray sweep along it, `+2` chip. Board resettles. | 2.4s | whoosh |
| 8 | **Enters Top 5** | `PLAYER_ENTERS_TOP_5` p8 | The school's five shown as five slots; the incoming player's card slides into the vacated slot while the outgoing one fades and drops; `teamAvg` recounts. Framed as a substitution. | 3.4s | sub horn |
| 9 | **Streak** | `PLAYER_STREAK` p6 | Corner card: name, school short, streak count, avg time. `StreakFlame` already exists. Board stays. | 2s | rising tick |
| 10 | **Perfect round** | `PERFECT_ROUND` p7 | Full-bleed: player name, school, "SANS FAUTE", the round's questions as five filled marks. `RayBurst` at low intensity. | 3s | flourish |
| 11 | **Comeback** | `COMEBACK` p8 | The school's rank path drawn as a line from its worst position to now — the one place a chart earns its place, because the shape *is* the story. | 3.6s | build |
| 12 | **Tie** | `TIE` p7 | Two lanes isolated, everything else dims; the margin counts down between them in the centre; hairlines converge. | 3s | tension bed |
| 13 | **Halftime** | `HALFTIME` p10 | Own screen. Top 3 with margins ("30 POINTS SÉPARENT #1 ET #2"), then MVP, biggest climber, fastest accurate player, perfect performers, participation. Cards enter staggered 55ms. | ~2 min | halftime bed |
| 14 | **Final five** | `FINAL_FIVE` p9 | Board compresses to the top 5 only; "5 QUESTIONS" wipes across; margins become permanent. | 2s | tempo up |
| 15 | **Final question** | `FINAL_QUESTION` p10 | Board to the edge; centre states what is at stake per contender. Rays stop rotating — the only time they ever do. | 3s | held note |
| 16 | **Calculating** | `GRADING` p10 | "CALCUL DES SCORES…" with the ray field sweeping once per second. Deliberately withholds. 20–40s. | 20–40s | low pulse |
| 17 | **School champion** | `CHAMPION_SCHOOL` p10 | Reveal from 5th up, one per 2.5s, hard cuts. #1 lands with the short name at full screen, `teamAvg`, the five players named. `ChampionMedallion` exists. Designed to be clipped for social. | ~15s | anthem |
| 18 | **Individual podium** | `CHAMPION_INDIVIDUAL` p10 | #3, #2, #1 in sequence, each with score, accuracy, avg time, school. | ~10s | ascending |
| 19 | **Post-game stats** | `final` | Superlatives board: most improved school, fastest average, most perfect rounds, participation by commune. | 30s | bed |
| 20 | **Next teaser** | end | "CODOSA — CHAMPIONS DE SEPTEMBRE" holds, then: "QUI PEUT LES DÉTRÔNER ?" with the next date. | 8s | outro |

**Sound is specified but not implemented in phase 1.** Naming the cue now means
the timings are already right when audio lands, and a host can hit them manually
in the meantime.

---

## L. School identity

### Short names
2–8 characters, uppercase, letters and digits. Student-supplied at registration,
validated, never auto-generated from the full name — CODOSA is not derivable from
"Collège Dominique Savio" by any rule, and inventing one produces names no
student recognises.

Rules: unique among approved schools; reserved list blocked; a second school
claiming a taken short name is asked for another; admin can override.

### Fallback identity, without inventing anything
**We must not guess a school's colours or draw its crest.** Both misrepresent an
institution, and a school seeing its crest approximated on a public stream is a
real complaint.

So the fallback is deliberately *not* a pretend logo. Each approved school gets:
- its **short name set in the stage's own type** as the primary identifier;
- a **hue derived deterministically from the school key** (hash → hue, fixed
  saturation/lightness from the Limyè ramp), presented as an edge bar and never
  as a fill — it reads as a lane colour, which is what a race needs, and claims
  nothing about the school;
- an optional **verified crest** once supplied by the school, which replaces
  nothing but sits beside the short name.

The distinction that keeps this honest: a hue assigned by us is *our* wayfinding;
a crest is *theirs*. The system never conflates the two.

---

## M. Integrity and anti-cheat

### Threat model, by what it costs to defeat

| Threat | Mitigation | Cost to defeat |
|---|---|---|
| Reading answers from the app bundle | **Questions are server-held and delivered without `answerIndex`.** The bundled bank is never used in a tournament. | impossible |
| Screenshot → AI | 12s full / 20s half tiers; a realistic round trip lands ≥15s, so a cheat scores half at best. `expo-screen-capture` blocks capture on iOS 13+ and Android — **needs a native build** | second device |
| Screen recording for later | same capture block | second device |
| Second device / a friend with a laptop | **Nothing technical stops this.** Tier scoring prices it; correlation analysis flags it; verification at claim removes the payoff | social |
| Multiple accounts | `deviceHash` per registration; >N accounts per device flagged, not blocked (shared phones are real in Haiti) | many devices |
| Answering before the question opens | server rejects `serverReceivedAt < opensAt` | — |
| Claiming a late render for more time | `clientShownAt` clamped to `opensAt + 3000ms` | bounded at 3s |
| Replay / double submit | `answers/{uid}_{index}` — idempotent by construction | — |
| Impossible speed | `elapsedMs < 800ms` on a 4-option question flagged; sustained sub-1.2s averages flagged | — |
| Coordinated answering | post-hoc: identical answer *sequences* including identical wrong answers, across accounts, above chance | — |
| Not actually a student | attested at registration; `grade !== 'POSTBAC'`; verified at claim | — |

### Principles

1. **Server-authoritative everything.** Timestamps, scoring, tier assignment,
   standings. The client renders and submits; it never decides.
2. **Flag, don't block, in real time.** A false positive that disqualifies a real
   student live, on a stream, is far worse than one caught in review. Everything
   suspicious writes to `flags[]` and the tournament continues.
3. **Provisional winners, announced live.** The moment is the product — announce
   it. One line up front makes it safe: *"Rezilta yo pwovizwa jiskaske nou
   verifye."* Then removing a cheat is the rule working as stated, not a reversal.
4. **72-hour claim window, published in advance**, with roll-down to the next
   eligible finisher. Without a published window, "it rolled down" is an argument
   you cannot win in public.
5. **Verification only touches winners** — a short video call plus a school ID.
   Zero friction for the other 9,997 players, and the deterrent comes from
   *announcing* it beforehand, not from performing it.
6. **A minor winning $100 needs a guardian path.** Most of the audience is under
   18, so this is the default case, not an edge case. Data top-ups sidestep it
   entirely for 2nd and 3rd.

### Audit trail
`answers/*` is immutable and complete: every submission, both timestamps, the
tier, the focus-loss count, the app version, the device hash. The entire
tournament can be re-scored from it, which is what makes a post-hoc
disqualification defensible rather than a judgement call.

---

## N. Admin tools

Extends the existing admin console (`src/pages/admin`, `adminService`,
`AdminLayout`), which already has content/users/data sections.

**Schools** — approve/reject pending submissions; merge duplicates *with points
following the merge*; edit short name, aliases, commune; upload a verified crest;
a duplicate queue fed by `likelyDuplicate()`, which already exists and already
flags the right pairs.

**Tournaments** — create, author questions, schedule, publish; a run console for
the night itself (open doors, next question, force-close, halftime, finalise,
void); live counts.

**Questions** — author with answer, explanation, category, difficulty; bulk
import; **never exposed to a client with its answer**.

**Players** — search, view submissions, see flags, mark eligible/ineligible.

**Winner review** — the provisional podium with every integrity signal beside
each winner, a claim/verify workflow, and a roll-down control that records *why*.

Priority: **schools first** — duplicate merging is needed the week the first
students register, long before a tournament runs.

---

## O. Analytics

The questions worth instrumenting, and why each one changes a decision:

**Acquisition** — installs attributed to a tournament invite; registrations per
school; the referral rails already exist and are already underused (1 referral
from 123 users), so the tournament is the test of whether school framing beats
personal framing.

**The viral coefficient that matters** — invites sent *per school that is short
of five*, and the conversion of those invites. This is the mechanic the whole
design rests on; if it does not move, the school framing is wrong and we should
know after one event.

**School penetration** — registered players ÷ estimated school size; how many
schools cross five; how many get there without any EdLight contact.

**Participation** — registered → showed up at doors → answered Q1 → finished. The
drop between registration and doors is the number that tells you whether the
reminder cadence works.

**Retention** — do tournament-acquired accounts return in the following week at
all, and do they touch Cours/Examens or only Jeux? A championship that acquires
users who never study is a marketing cost, not a growth engine, and this is the
metric that distinguishes them.

**Engagement** — spectator concurrents on `/direct`, watch duration, the moment
people leave (which tells you where the format sags).

**Cost per acquired active user** — prize money ÷ users still active at day 30.
The only number that decides whether to run the second event.

---

## P. Implementation plan

Ordered by dependency, and by the principle Ted set: **gameplay is
mission-critical, broadcast is secondary.** Every phase ships and is useful on
its own.

### Phase 0 — School identity (no tournament yet)
Short names, aliases, verification state, pending queue, admin approve/merge.
Backfill short names for the 94 seeded schools by asking students, not by
generating them.
*Dependency for everything. Ships OTA. Useful immediately — it fixes the school
board that is already live.*

### Phase 1 — Registration and qualification
Tournament entity, registration API, Lobby screen, qualification progress,
school-framed invite, counters, push reminders.
*Ships OTA. This is the phase that tests the viral mechanic — and it can run
without any tournament ever taking place.*

### Phase 2 — The game
Server-held questions; `live/{index}` delivery; answer API with server timing and
tiering; per-player docs; the aggregator; the Live screen; reconnect; admin run
console.
*The riskiest phase. Needs a load test before it meets an audience.*

### Phase 3 — Integrity hardening
`expo-screen-capture` (**requires a native build** — bundle with the splash
sizing fix already waiting), focus-loss counting, flagging rules, the review
console, claim workflow.
*Must land before the first cash event. Everything else can ship OTA; this
cannot.*

### Phase 4 — Broadcast
Event engine, `standings/current`, the director, the board as resting state, and
sequences 3–9 and 17–18. The rest of the twenty follow.
*The `/direct` stage already exists and already has the right visual language —
this is the director and the events, not a new design.*

### Phase 5 — Studio
`/direct/scene` for the big screen, `/direct/regie` for the commentator, halftime,
the full sequence set, post-game stats.

### Phase 6 — History
Hall of Champions, school history, "can anyone dethrone CODOSA", per-school pages.

**Decided: cash at event one**, so phases 0–4 all ship before the first
tournament and phase 3 carries a native build. The sequence is unchanged — the
game is still built before the broadcast — but nothing can be deferred past the
first event.

---

## Q. Risks and open questions

### Risks in the codebase

**R1 · The question bank is public.** Non-negotiable for a cash event; drives the
whole server-delivery design in phase 2.

**R2 · Rate limiting fails open on unknown buckets.** `if (!limit) return {allowed:true}`.
Every tournament bucket must be added to `LIMITS` *before* the endpoint ships, or
the answer endpoint is unlimited. Consider failing closed for arena buckets.

**R3 · Screen capture needs a native build**, which breaks the OTA rhythm this
project has been enjoying. Plan the build; do not discover it in the last week.

**R4 · No load test has ever been run against this Firestore project.** The
architecture is sound on paper; 2,000 writes/sec has not been observed. A
synthetic 5,000-client rehearsal is a phase-2 exit criterion, not a nice-to-have.

**R5 · Nobody has seen `/direct` on a phone.** Flagged when it shipped; still
true.

**R6 · `rankTeams` returns a sum, the spec says average.** One line, but it
changes every number already on screen in the app. Change it with the display.

### Questions that need Ted

1. ~~**Who presses "next question" at the first event?**~~ **ANSWERED** —
   automated, with a deliberate pause between questions. See Decisions.
2. **How long is the event?** 25 questions × ~20s plus transitions plus a 2-minute
   halftime lands near 30 minutes end to end. Confirm, because it sizes the
   question authoring effort every month.
3. **One category or several?** Generalist first is simpler and is what the
   product concept says. Multiple simultaneous categories multiplies the
   authoring and the broadcast complexity.
4. ~~**Cash at event one, or status?**~~ **ANSWERED** — cash, and a native build
   is acceptable. Phase 3 is on the critical path. See Decisions.
5. **Who authors 25 fresh questions a month, and by when?** This is the recurring
   operational cost of the format and it has no owner in the plan.
6. **Guardian path for a minor's prize.** Needs deciding before it happens, not
   on the night.
7. ~~**Does a registered no-show count toward the five?**~~ **ANSWERED** — no.
   Qualification is measured at doors close, on players present. See Decisions.

### The one thing I would push back on

Nothing in the concept, but one in the sequencing: **the spectator experience is
specified in more detail than the game.** That is the right instinct for what
makes this special, and the wrong order to build it in. If the game is solid and
the broadcast is a plain board, you have a tournament. If the broadcast is
cinematic and the game drops answers, you have a very good-looking incident. The
plan above builds the game first on purpose.

---

## Decisions — 2026-09-18

Ted resolved the three questions that blocked phase 2. Recorded here with the
consequences each one carries, including the ones that were not obvious when the
question was asked.

### 1 · Cash prizes at event one; a native build is acceptable

**Phase 3 moves onto the critical path.** `expo-screen-capture` blocks screenshots
on iOS 13+ and Android and cannot ship over the air, so the first event needs a
real build and a TestFlight cycle. Bundle it with the splash-sizing fix that has
been waiting.

**And the question bank must be server-held from day one.** With money on the
line there is no version of this that reads the bundled bank — so phase 2 carries
the full server-delivery path, not a simplified one.

### 2 · Question advance is automated, with a deliberate pause between questions

The run console keeps a "next question" control, but as a **safety override**,
not the primary mechanism.

The cycle:

```
 open ──20s── close ──────── pause (≈10s) ──────── open next
        │                     │
        │                     ├─ answers still landing are accepted and shown
        │                     ├─ correct answer revealed
        │                     └─ standings settle, events emit
        └─ answers accepted
```

**The window always closes on the timer, never early.** Closing as soon as
"everyone" has answered is unworkable — with thousands of players someone is
always disconnected — and closing on a high-percentile threshold punishes exactly
the slow connections this scoring already tries to protect. The answer rate
flattening is a *broadcast* signal, not a control signal.

**The pause is where late submissions land.** This is the point Ted made and it
is the right one: a student on a bad connection whose answer arrives at 21s is
still submitting in good faith. The pause makes that visible rather than
invisible, and the answer is still recorded — scored at whatever tier its
timestamp earns, which is usually zero, but recorded, shown, and counted toward
their school's participation.

**The non-obvious consequence, and it is a gift.** A guaranteed ~10s gap between
questions is the broadcast's natural slot. Every scene in section K that needs
the screen — the overtake, the Top-5 substitution, the lead change — now has a
predictable window to play in, and the director never has to interrupt a live
question to show a moment. That removes the hardest scheduling problem in the
whole broadcast design.

**A new sequence for section K:**

| # | Sequence | Trigger | On screen · motion · return | Dur |
|---|---|---|---|---|
| 4b | **Submissions landing** | question opens | The answer count climbing in large mono, with a hairline that fills as the rate flattens. During the pause it keeps ticking as stragglers arrive, then hands over to the reveal. Communicates scale — *4,821 students answering right now* — which is the single most persuasive thing this tournament can show a viewer. | full window + pause |

### 3 · A registered no-show does not count toward a school's five

Qualification is evaluated **at doors close**, on players actually present, not on
registrations.

**This needs care in the product, because a school can lose qualification on the
night** — five registered in the lobby, three present at 18:00. Discovering that
at kick-off is a bad surprise and a bad story.

Mitigations, all in phase 1:

- The lobby shows both numbers once doors open: **`CODOSA · 5 inscrits · 3 présents`**,
  with the present count as the one that matters.
- Push to every registered player of a school that is short at doors open:
  *"Il manque 2 joueurs à CODOSA — la salle est ouverte."* This is the highest-
  intent notification in the whole product and it fires exactly once.
- The invite copy shifts at doors from "register" to "come now".
- A school that fails to qualify still plays. Its students compete individually,
  score normally, and the school is simply unranked. Nobody is turned away.

**Registration still matters** — it is what makes a school visible, drives the
invite loop, and seeds the push list. It just is not the qualification test.


---

## Correction to section F — the aggregator has no scheduler

Section F specified an aggregator "every ~5s". That cannot be a Vercel cron:
**cron granularity is one minute**, twelve times too slow, and adding an
external scheduler would mean a new always-on component in a product that has
none — the exact thing the WebSocket argument was made to avoid.

It also turns out to be unnecessary, and the reason is Decision 2.

**Standings only change when answers land, and answers only land during a
question window.** So there is nothing to recompute between questions except
the moment a question closes. The aggregator runs once per close, in the pause
— which is precisely where the design already wanted standings to settle and
events to emit.

So `advance` calls `aggregate` when it closes a question. No scheduler, no
cron, no tick, and the cadence is exactly right by construction rather than by
tuning. A Vercel cron remains as a slow safety net (one per minute during a
live tournament) purely so a dropped `advance` cannot leave the board frozen.

**One thing this does not cover, and should not.** The broadcast wants to show
answers arriving *during* the window (sequence 4b — the count climbing, which
is the most persuasive shot in the format). That is a counter, not a standing,
and it does not need the aggregator: the spectator page can read a cheap
per-question count that the answer endpoint increments on a sharded counter.
Keeping it off the aggregator is what stops "show the count moving" from
dragging a full recompute onto a five-second timer.

---

## Correction to section L — the run console needed a door, not just controls

Building the console surfaced the gap that made most of it decorative:
**six of the seven moves in the state machine had no server route at all.**
`firestore.rules` denies every client write under `tournaments/**` (correctly —
the document that decides prize money is not one a browser session may mint),
and `advance` performs exactly one transition, `live → grading`, as a side
effect of the clock. Nothing served `draft → registration`, `registration →
doors`, `doors → live`, `grading → provisional`, `provisional → final` or
`* → void`, and nothing created the tournament document in the first place.

`POST /api/arena/state` is that door. It never decides which transition is
legal — `canTransition` remains the only definition, checked inside the same
transaction that writes the new state, so two admins pressing "start" produce
one start and one 409.

### Two doors, one definition of who may drive the engine

`advance` and `aggregate` authenticated with `CRON_SECRET` only, so the run
console's "force close", "force next" and "recompute standings" would have
returned 401 forever. The shared secret cannot be shipped to a browser: a page
holding it hands the entire engine to whoever reads localStorage.

So `authorizeCronOrAdmin` in `api/arena/_shared.ts` is now the single door for
`advance`, `aggregate`, `state` and `doors-close` — cron secret, or a
server-verified admin (`users/{uid}.role`, never a custom claim, and a failed
lookup is never an admin). The cron path costs no Firestore read, because the
scheduler calls `advance` every few seconds during a live tournament.

### Two refusals the route adds on purpose

- **`doors → live` counts the authored questions first.** `advance` treats a
  missing `questions/{index}` as `missing_question` and stops — which on a
  stream is a dead screen at question 14 with 300 students watching. One small
  read before anything is live is the cheapest possible place to catch it.
- **`grading → provisional` requires standings to exist**, and stamps the
  placeholder claims (below). Publishing a podium of nobody would start three
  claim windows against it.

### The podium write section M assumed but nobody performed

`rollDown` reads a MISSING claim document as "no deadline has passed" and
leaves the prize where it is. Correct in isolation — and it meant an unclaimed
first place would never roll down to anybody. claim.ts says so explicitly:
*"the window still runs from the moment the podium was published, which the
caller stamps onto a placeholder claim."* There was no caller.

Entering `provisional` is that moment, so `state.ts` now writes an `open`
placeholder for each paying rank as the podium is published. Existing claims
are never overwritten — re-running must not hand a student a fresh 72 hours or
reset a verification — and a **tie at a paying rank opens no placeholder at
all**, because two placeholders at one rank is two students on one prize.
