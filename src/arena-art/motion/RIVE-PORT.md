# Arène motion: Rive porting spec

These three sequences are built in code (SVG + CSS, no animation library), but they are structured the way a Rive file is. Each one is a single state machine. Each state is one timeline. The app talks to it only through inputs. An animator can rebuild each one as a Rive artboard plus state machine **without changing the app contract**: the props below become Rive inputs, and the `onStateChange` / `onBeat` callbacks become Rive events.

Source of truth for timings: `tokens.ts` (`DUR`, `EASE`) and `machines.ts` (the per-sequence timing objects). If a number here disagrees with those files, the code is right.

## Shared rules

| Rule | In code | In Rive |
| --- | --- | --- |
| Authoritative input always wins | `any` transitions (checked first) | Transitions from **Any State** |
| Cosmetic states are interruptible | `cosmetic: true`, and a pending `after` exit is cancelled on preempt | Every transition out of a cosmetic state: **exit time off** for interrupts, a duration of at most 240 ms (`component`) |
| Timed exits come from the clock | `advance()` replays missed exits with exact timestamps | Exit time = the state's duration. Resync on app resume (see "Throttling") |
| Reconnect never replays a celebration | `restore` / `match` from `idle` jump straight to the final state | A `restore` trigger: Any State → final state, **no blend** |
| Reduced motion | `data-reduced="true"`: no travel, sweeps, sheen or flashes; opacity fades of 200 ms | Second state machine layer, or a `reduced` boolean that selects "fade" timelines. Same states, same inputs |

### Motion grammar (`tokens.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `press` | 120 ms | Button press scale (0.96) |
| `component` | 240 ms | Chip, label and opacity changes; interrupt blends |
| `navigation` | 400 ms | Card travel, washes, house lights |
| `intro` | 1500 ms | Whole routine opponent intro (found + introduce) |
| `ceremony` | 5500 ms | Whole trophy ceremony (dark → settled) |
| `fade` | 200 ms | The only motion under reduced motion |
| `enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Arrivals |
| `exit` | `cubic-bezier(0.7, 0, 0.84, 0)` | Departures, flashes decaying |
| `emphasis` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Stamps and beats (one small overshoot) |
| `settle` | `cubic-bezier(0.45, 0, 0.25, 1)` | Coming to rest, ambient |

Rive accepts these as custom cubic interpolation curves. Enter the four control points directly.

---

## 1. OpponentReveal (`opponentReveal`)

**Artboard:** stage 16:9 (desktop, side by side) and 4:5.2 (phone, stacked). Make these two artboards, not one cropped artboard.
**Layers, back to front:** night background → floor light ellipse → school wash A (left or top) → school wash B (right or bottom) → search rings → own card → opponent card → VS lockup → flash → status label → footer button.
**Bound data:** each card shows name, school, `colors.primary` (band 72%, wash) and `colors.secondary` (band 28%), plus an avatar (`src/arena-art/avatars`). In Rive, use text runs and colour properties bound to view-model data.

### Inputs

| App prop `phase` | Rive input (trigger) | Authority |
| --- | --- | --- |
| `idle` | `reset` | Any State |
| `searching` | `search` | from idle, cancelled or failed |
| `matched` | `match` | from searching (from idle it means reconnect, so go straight to settled) |
| `known` | `present` | from idle only: an opponent known from the start (async duel) — plays `found` → `introduce` → `settled` with no search |
| `cancelled` | `cancel` | from searching only |
| `failed` | `fail` | from searching only |
| `started` | `start` | Any State. The match began, so land in settled now |

Events out: `stateChanged(name)`. The in-stage **Annuler** and **Réessayer** buttons emit `cancelRequested` and `retryRequested`. The app decides what happens; the animation never cancels itself.

### States

| State | Kind | Duration / exit | Timeline |
| --- | --- | --- | --- |
| `idle` | rest | — | Own card centred. Label "Prêt à chercher un adversaire". No rings. |
| `searching` | rest (loops) | — | Three rings scale 0.55→1.25 and fade, 2.4 s loop, staggered 0.8 s (`settle`). Label "Recherche d'un adversaire…" plus a real elapsed clock (m:ss). Cancel button visible. |
| `found` | cosmetic | **550 ms** → `introduce` | t=0: flash (0→1 at 22%, then 0; 520 ms, `exit`). Own card travels centre → its side (desktop x −25% of stage width; phone y −18.5% of stage height), 520 ms `enter`. Opponent card enters from beyond the opposite edge (desktop +72% → +25% of width; phone x +100% → 0, landing y +18.5%), 520 ms `enter`, opacity 0→1 over 240 ms. Label "Adversaire trouvé" with a check. |
| `introduce` | cosmetic | **950 ms** → `settled` | Washes fade in and slide 6% inward (400 ms `settle`/`enter`), meeting on a slanted seam. Cards lift 1.5% of height. Card outlines take the school colour. VS diamond (rotated 45°) scales 0.2→1 with `emphasis`, 380 ms, delay 120 ms. |
| `settled` | rest | — | Static matchup. Label "Le match va commencer". |
| `cancelled` | rest | — | Own card back to centre, dimmed to 72%. Label "Recherche annulée" + "Aucun match n'a été créé." Coral button "Relancer la recherche". |
| `failed` | rest | — | Same as cancelled. Label "La recherche n'a pas abouti" + "Vérifie ta connexion, puis réessaie." Coral button "Réessayer". |

found + introduce = 1500 ms = `DUR.intro`.

**Reduced motion:** cards are placed at their final positions with no travel; the opponent fades in over 200 ms. No flash. One static ring instead of three pulsing. The VS lockup and washes fade only.

---

## 2. ReadyCountdown (`readyCountdown`)

**Artboard:** 16:9 (desktop) and 4:4.6 (phone). Layers: background → two stage beams (blurred cones from the top) → beat pulse (radial light) → header (eyebrow + "Départ à HH:MM:SS") → dial (track + three 110° arc segments, gaps centred at 12, 4 and 8 o'clock) → numeral.

### Inputs (this machine is driven by values, not triggers)

| Input | Type | Meaning |
| --- | --- | --- |
| `armed` | boolean | A real start time exists (`startsAt != null`) |
| `remaining` | number (ms) | `startsAt - now`, fed by the app from its clock (or a server-offset clock) |

The app wakes at each beat boundary and on tab resume, and writes `remaining`. The state is a pure function of `remaining`, so it never counts and never drifts:

| `remaining` (ms) | State |
| --- | --- |
| not armed, or > 3000 | `idle` (shows "N secondes" while armed) |
| (2000, 3000] | `three` |
| (1000, 2000] | `two` |
| (0, 1000] | `one` |
| (−800, 0] | `go` |
| ≤ −800 | `done` |

In Rive, every state has a condition transition to every other state on these `remaining` ranges. This is the "Any State + number condition" pattern, with exit time off. A late join or a tab that slept lands directly on the right beat, and the skipped beats are never entered.

### Events out

`beat(name, lateMs, stale)` on entering `three`, `two`, `one` and `go`. `stale = lateMs > 250`. Sound must **not** play stale beats; they are shown, not sounded.

### Timelines

| State | Timeline |
| --- | --- |
| `three` / `two` / `one` | Numeral enters scale 1.35→1, opacity 0→1 (520 ms, `emphasis`). The pulse flashes 0→1 at 14% then decays (900 ms, `exit`). Beams rise to 55% (400 ms `settle`). Segments 1, 2 and 3 light up in turn (azure #8FBFFF with a glow, 240 ms). |
| `go` | "Partez !" / "Ale !" scale 0.7→1 (520 ms). Brighter pulse (800 ms). Beams at 85%. All segments turn white. |
| `done` | Beams fall to 16%. The chip "En jeu" fades in over 240 ms. |

**Reduced motion:** no pulse, no scale. Numerals swap with a 200 ms fade. Segments still light up, so the count stays readable without motion.

---

## 3. TrophyCeremony (`trophyCeremony`)

**Artboard:** 16:10 (desktop) and a tall phone layout (min 560 px; rows: header / trophy / copy / skip). Layers: background → house-lights veil → two spotlights (blurred cones from the top corners, screen blend) → plinth glow → header (event title, subtitle, "Démo" chip, status chip) → trophy → copy (eyebrow, school name, colour band, roster chips) → **Passer** button.
**Trophy:** original artwork in `Trophy.tsx`. Bowl with a cut star, two handles, a knotted stem and an enamel plinth with a year plate. It is lit (gold gradient) only in `reveal`, `roster` and `settled`. Elsewhere it is an unlit silhouette at 55%. Gold (#FFB92E family) is reserved for this achievement.

### Inputs

| App prop | Rive input | Authority |
| --- | --- | --- |
| `status='confirmed'` | `confirm` (trigger) | from waiting, provisional or tie |
| `status='confirmed'` + `resume` on mount | `restore` (trigger) | straight to `settled`, no blend: reconnect never replays |
| `status='provisional'` | `provisional` | **Any State**, so it preempts a running ceremony |
| `status='tie'` | `tie` | **Any State** |
| `status='pending'` | `reset` | Any State |
| Passer button / `ref.skip()` | `skip` | only from the four cosmetic states |
| `ref.replay()` | `replay` | only from `settled` |

The winner reveal can be reached **only** through `confirm`. `skip` does not exist in `waiting`, `provisional` or `tie`, so nothing can skip into a result. Rebuild this exactly: no transition into `dark` other than from `confirm` or `replay`.

### States

| State | Kind | Duration → next | Timeline |
| --- | --- | --- | --- |
| `waiting` | rest | — | Unlit trophy, cool glow. Chip "Résultats à venir". Note that the champion is announced on confirmation. |
| `dark` | cosmetic | **500 ms** → anticipation | Veil to 82% (400 ms). Trophy and glow drop out (200 ms). Header stays readable. |
| `anticipation` | cosmetic | **1500 ms** → reveal | Spotlights sweep in from outside the frame: rotate ±52° → overshoot (±(a+12°), at 55–62%) → rest at ±a, where a = 42° desktop and 24° phone. Opacity 0→1 by 25%. Veil to 60% over 1.2 s. Glow at 50%. Text "Le champion national est…" fades in. |
| `reveal` | cosmetic | **1700 ms** → roster | Veil lifts. Trophy rises from +26% of its height to 0 (900 ms `enter`), with a gold drop shadow. **One** sheen pass: a 60-unit white band slides across the metal (950 ms `settle`, delay 520 ms). Eyebrow "Champion national" (delay 650 ms), school name (delay 800 ms) and colour band scaleX 0→1 (delay 1000 ms). |
| `roster` | cosmetic | **1800 ms** → settled | Roster chips rise in one by one (380 ms each, 190 ms stagger, first at 120 ms). Their slots are reserved, so nothing reflows. |
| `settled` | rest | — | Final, static, shareable frame: event, "Résultat final", trophy, school, band, roster. Spotlights at 70%. No loops. |
| `provisional` | rest | — | Unlit trophy. Chip "Provisoire". "Résultats provisoires" + "…aucun champion n'est déclaré avant leur confirmation." No gold, no spotlights. |
| `tie` | rest | — | Unlit trophy. Chip "Égalité — provisoire". The tied schools are shown as equal rows with colour swatch and points, plus "Un départage désignera le champion." |

dark + anticipation + reveal + roster = 5500 ms = `DUR.ceremony` (brief: 4–7 s).

**Reduced motion:** spotlights already converged and only fade in. The trophy appears in place with a 200 ms fade (no rise). No sheen. Text and roster fade without travel. All states and information stay the same.

---

## Throttling and resync (important for the Rive runtime)

A Rive state machine advances by `advance(dt)`. A throttled or backgrounded tab delivers one huge `dt` or none at all. To match the code's behaviour:

1. **Countdown:** never let Rive's clock own the beat. Keep writing `remaining` from the app clock, as the code does. On resume, write it once and the condition transitions land on the right beat.
2. **Reveal and ceremony:** on resume, if the elapsed time exceeds the remaining cosmetic duration, fire `start` (reveal) or `skip` (ceremony) so the stage lands in its final state instead of playing a backlog.
3. Hidden artboards should be paused (`isPlaying = false`). Readable scores and input take priority over effects.

## What an animator should refine when porting

- **Spotlights:** currently clipped CSS gradients with blur. In Rive, use a proper soft-edged cone mesh with feathered falloff, plus a subtle pool where both beams land on the plinth.
- **Trophy:** the sheen is one linear band. A Rive version can use a specular highlight that follows the cup's curvature, and could add one restrained glint on the star at the end of the pass. Keep it to one pass, never a loop.
- **Card travel** uses a single `enter` curve. Hand-authored secondary motion (a two-frame settle on the portrait, a band that lands a few frames after the card) would add weight without lengthening the 1.5 s intro.
- **VS lockup:** currently a rotated square with two colour rings. A bespoke lockup (split diagonal in both school colours, letterforms drawn rather than typeset) is a clear upgrade.
- **Avatars** currently get only the `idle` → `ready` mood swap. In Rive they could react: ready on `introduce`, celebrating for the winning roster in the ceremony (never a mocking reaction for the other side).
- **Sound sync:** `onBeat` and the ceremony state changes are the cue points. Bind them to Rive events so audio and picture share one source.
- Keep the **phone artboards separate**. The stacked reveal and tall ceremony are composed for the phone, not cropped.
