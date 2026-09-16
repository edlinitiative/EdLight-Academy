# Rive animation brief — EdLight Academy

**For:** a motion designer working in the Rive editor (free tier is sufficient)
**Deliverable:** three `.riv` files, specified below
**Date:** 2026-09-16

---

## Why Rive and not Lottie

On a **Sony Xperia Z3 — a 2014 phone** — Rive renders at roughly 60 FPS where Lottie
manages about 17, and Rive files run 10–15× smaller (one like-for-like comparison: 2 KB
against 24 KB). Both numbers matter here: our students are on modest Android hardware
and metered data, so file size is user experience, not just a build statistic.

Deliver `.riv`, not `.json`. Do not deliver Lottie exports.

## House constraints

| Constraint | Value |
|---|---|
| Brand azure | `#1B6FE0` (light) / `#4C9AF5` (on dark) |
| Deep azure | `#0857A6` |
| Coral accent | `#E0532F` |
| Ink | `#14171F` · Muted `#5F6B7A` |
| Dark ground | `#0b1220` · Surface `#131c2e` |
| Gold (champion only) | `#E8C98A` → `#A87B36` |
| Display face | Instrument Serif (headline moments) |
| UI face | Source Sans 3 |

**Weight budget: 25 KB per file, hard cap.** Prefer vector shapes and bone rigs over
embedded images. No embedded fonts — text is drawn by the app, over the animation, not
baked into it.

**Both themes.** Each animation is used on light and dark grounds. Either author on a
transparent background with colors that work on both, or expose a `dark` boolean input
(see each spec).

**Accessibility.** The app honours the OS "reduce motion" setting: when it is on, we jump
to the animation's final frame instead of playing it. So **every animation must have a
readable resting end state** — never end on a blank or mid-transition frame.

**Logo motif.** The EdLight mark is a line-art bulb throwing straight rays. Rays are the
house visual language; reuse them rather than inventing unrelated decoration. Do not
redraw or distort the mark itself.

---

## 1. `quiz-celebration.riv`

**Where:** the quiz result screen, the instant a score of 60% or better appears.
**Artboard:** 320 × 320, transparent.
**Duration:** 1.2 s, plays once.

A burst that reads as *light being thrown*, not confetti. Rays extend from the centre,
overshoot, settle. A soft halo blooms and fades. Sparse particles — under twelve — drift
outward and dissolve. It sits behind the score ring, so the centre 150 × 150 must stay
visually clear: no marks that fight a number sitting on top.

**State machine: `celebrate`**

| Input | Type | Meaning |
|---|---|---|
| `tier` | number 0–2 | 0 = pass (60–79%), 1 = strong (80–99%), 2 = perfect (100%) |
| `dark` | boolean | true on a dark ground |

Tier raises the intensity: tier 0 is a restrained bloom, tier 2 is the full burst with gold
in the palette. Tier is the only thing that changes — do not author three separate
animations.

**End state:** a faint halo at ~20% opacity. Not empty.

---

## 2. `streak-flame.riv`

**Where:** the Home streak indicator and the quiz header. Small, and on screen constantly —
this is the one that must be cheap.
**Artboard:** 64 × 64, transparent.
**Duration:** seamless 2 s loop.

A flame in the brand's line-art vocabulary, not a realistic fire. It should read at 24 px.
Idle is a slow breathing loop — a flame that flickers aggressively next to text is noise.

**State machine: `streak`**

| Input | Type | Meaning |
|---|---|---|
| `alive` | boolean | false = streak broken: desaturated, barely moving |
| `celebrate` | trigger | fires when the streak increments — one leap, then back to idle |
| `dark` | boolean | true on a dark ground |

**Performance note:** this loops for as long as the screen is open, which is the one case
Expo's benchmarking flags as genuinely costly. Keep it to a handful of shapes, and keep
the loop free of per-frame path recalculation.

**End state (reduce motion):** a static flame, `alive` respected.

---

## 3. `champion-reveal.riv`

**Where:** behind the champion share card, when a student tops a leaderboard. The one
moment allowed to be lavish — it happens rarely and gets screenshotted to Instagram.
**Artboard:** 1080 × 1080, transparent (the card is 1080 × 1920; this occupies the upper
portion).
**Duration:** 2.0 s, plays once.

A medallion assembling: rays sweep in and lock, a ring draws itself, a gold sheen travels
across once. Gravity and weight — nothing bouncy or cartoonish. This should feel like an
award, not a party.

**State machine: `reveal`**

| Input | Type | Meaning |
|---|---|---|
| `scope` | number 0–3 | 0 = school, 1 = city, 2 = department, 3 = national |
| `play` | trigger | starts the reveal |

Scope raises the grandeur: school is a single ring, national is the full radiant treatment.
Palette is gold (`#E8C98A` → `#A87B36`) against the deep ground, with azure only as a
secondary glow.

**End state:** the fully assembled medallion, held. This frame is what appears in the
exported PNG, so it has to stand alone as a still image — that is the real deliverable.

---

## Handover

Deliver the three `.riv` files plus a short note listing each state machine's exact input
names and types. Input names are the contract — the app binds to them literally, and a
rename silently breaks the animation.

Wiring takes about a day once the files land: `rive-react-native` is a native dependency,
so it ships in a new build rather than over the air.

## Open question for the designer

Whether the flame and the celebration should share a visual system with the champion
reveal, or read as a lighter everyday register against the champion's formality. My
instinct is the latter — daily moments should feel light, and the rare one should feel
heavy — but that is a judgment worth a designer's opinion rather than mine.
