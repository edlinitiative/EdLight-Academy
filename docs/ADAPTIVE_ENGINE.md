# Adaptive Behavioral Engine — Design Spec

**Status:** Proposed · **Author:** Engineering · **Depends on:** `docs/ADAPTIVE_CONTENT.md` (grade-adaptive UI, shipped)

The grade-adaptive layer already shipped adapts to *who a student is* (grade, track,
level). This engine is the next layer: it adapts to *what a student does* — their
answers, timing, and momentum over time.

> **Framing that matters:** this is **not greenfield.** Two of the three pillars
> already have working foundations in the codebase. The engine's real job is to
> (a) generalize those foundations beyond the study-plan silo, (b) add the one
> genuinely missing pillar (stall detection), and (c) route the resulting signals
> into the adaptive surfaces we just shipped. Scoping it as "evolve three known
> modules" is both cheaper and lower-risk than a rewrite.

---

## 1. Goals & non-goals

**Goals**
- Serve each learner questions near their personal challenge band (~75–80% success)
  instead of a fixed difficulty for everyone.
- Bring lapsing knowledge back at the right moment (spaced repetition) across the
  *whole* app — quizzes, trivia, and exams — not only exam study-plan tasks.
- Notice when a learner is stalling (declining scores, rising time, repeat fails,
  inactivity) and intervene gently before they churn.
- Feed all of the above into the surfaces already built: `SmartSuggestion`,
  `ReadinessCard` focus, `SeasonCountdown`, and Sandra's `studentContext`.

**Non-goals (v1)**
- No ML model / server training loop. Everything is deterministic, inspectable
  arithmetic over event history — same philosophy as `readinessService` (pure,
  unit-testable).
- No new per-question authoring burden on content. Difficulty is *inferred*, not
  hand-tagged (see §4).
- No dark patterns. Interventions encourage; they never shame or punish.

---

## 2. Current-state inventory (what we build on)

| Capability | Exists today | Where | Gap the engine fills |
|---|---|---|---|
| Immutable attempt log | ✅ | `progressTracking.ts` → `users/{uid}/quizAttempts` (`quizId`, `courseId`, `percentage`, `timeSpent`, `attemptedAtMs`) | Nothing consumes it analytically yet — it's write-only. |
| SM-2 spaced repetition | ✅ | `studyPlanService.ts` → `computeSRS`, `scoreToQuality`, `DEFAULT_EASE=2.5`, `interval/ease/repetitions/nextReviewMs` | Keyed on **exam tasks only**; quizzes/trivia don't schedule reviews. |
| Difficulty signal | ⚠️ partial | `studyPlanService.ts` → `exam.difficulty` (1–5) in the priority formula `(coeff/5)*0.4 + (difficulty/5)*0.3 + …` | Only at **exam granularity**. Individual questions (`quizBank.ts`) carry no difficulty. |
| "What to work on next" | ✅ | `readinessService.ts` → `focus` = `argmax(coeff × (100−pct))` | Uses only subject aggregates; ignores recency, velocity, forgetting. |
| Subject mastery | ✅ | `studyPlanService.computeSubjectMastery`, `readinessService.masteryToSubjectStats` | Best-of-recent-3; no trend/velocity. |
| Streaks | ✅ | `streakService.ts`, `progressTracking.updateStreak` | Records streaks; doesn't act on *risk* of breaking one. |
| Stall / disengagement detection | ❌ | — | Entire pillar missing. |

**Takeaway:** SRS and a difficulty scalar already exist; they're just siloed inside
the exam study plan. The log that would let them span the whole app already gets
written on every quiz attempt — it's simply never read back.

---

## 3. Architecture — one derived signal store

Introduce a single pure module, `adaptiveEngine.ts` (mobile + web, mirrored like
`readinessService`), that reads the attempt log and derives a `LearnerSignals`
object. Everything else consumes that object; nothing else re-reads raw history.

```
        writes (already happen)                 reads (new)
attempts ─────────────────────▶  users/{uid}/quizAttempts  ──┐
trivia   ─────────────────────▶  users/{uid}/triviaAttempts ─┤
exams    ─────────────────────▶  examResults / examAttempts ─┤
                                                              ▼
                                    adaptiveEngine.deriveSignals()   ← PURE
                                                              │
             ┌────────────────────────┬───────────────────────┼───────────────┐
             ▼                        ▼                        ▼               ▼
     difficulty band          review queue (SRS)        stall status      Sandra ctx
     (next question)          ("à réviser")             + intervention    (studentContext++)
```

```ts
export interface LearnerSignals {
  ability: Record<string, number>;      // subject → latent skill 0–100 (EWMA of item-adjusted scores)
  velocity: Record<string, number>;     // subject → slope of recent scores (per week); <0 = declining
  reviewQueue: ReviewItem[];            // items whose nextReviewMs <= now, priority-sorted
  stall: StallStatus | null;            // null = healthy
  challengeBand: { min: number; max: number }; // target success window, default 0.75–0.82
  updatedAtMs: number;
}
```

`deriveSignals(history, { coefficients, now })` is deterministic and unit-testable
with fixture logs — no Firebase, no React (identical constraint to `readinessService`).

---

## 4. Pillar A — Adaptive difficulty

**Problem:** questions have no difficulty tag (`quizBank.ts` parses CSV rows: prompt,
choices, correct index — nothing else). Hand-tagging thousands of items is a
non-starter.

**Solution: infer item difficulty from the crowd, target the individual's band.**

1. **Item p-value (crowd difficulty).** For each `questionId`, maintain a rolling
   `{seen, correct}` aggregate in `questionStats/{questionId}` (incremented on
   answer — one cheap `increment()` write, same pattern as `awardPoints`).
   `difficulty = 1 − correct/seen` (classic item-facility). Until an item has
   ≥ N=20 exposures, fall back to its exam's `difficulty` (1–5, normalized) so new
   items aren't mis-served.

2. **Learner ability per subject.** EWMA over item-difficulty-adjusted outcomes:
   a correct answer on a hard item raises ability more than on an easy one.
   Seed from existing `computeSubjectMastery` / readiness so day-one isn't cold.

3. **Serve the band.** When assembling a quiz/trivia round, prefer items whose
   crowd difficulty puts this learner's predicted success in `challengeBand`
   (0.75–0.82). Too-easy → boredom; too-hard → despair. Mix in ~15% review items
   (Pillar B) and ~10% stretch items so the band stays honest.

**Hook points:** `quizBank.ts` gains `selectAdaptiveQuestions(pool, signals, n)`;
trivia round assembly (`triviaService.ts`) calls the same selector. Purely additive
— non-adaptive callers keep working.

**Fallback:** no history / anonymous → serve by exam `difficulty` ascending
(today's behavior). The engine only *improves* selection when data exists.

---

## 5. Pillar B — Spaced repetition, generalized

**Reuse `computeSRS` verbatim** (it's textbook SM-2 and already tested in the study
plan). The only change is *what* it schedules and *where* the queue surfaces.

1. **Unit of review = (subject, topic) or quizId**, not just examId. On every
   attempt, map `percentage → quality` via the existing `scoreToQuality`, run
   `computeSRS`, and persist `{interval, ease, repetitions, nextReviewMs}` to
   `users/{uid}/reviewState/{key}`.
2. **Review queue** = all keys with `nextReviewMs <= now`, sorted by overdueness ×
   coefficient. This is `signals.reviewQueue`.
3. **Surface it** where students already look:
   - `SmartSuggestion` gains a `review-due` kind ("3 sujets à revoir aujourd'hui").
   - `SeasonCountdown` / Records show a small "À réviser" count.
   - A daily push (`notificationService`) when the queue crosses a threshold —
     reusing the streak-notification plumbing, capped at one/day.

**Why this is low-risk:** the scheduler math is unchanged and already in
production for exams; we're widening its inputs and adding a read path.

---

## 6. Pillar C — Stall detection (the genuinely new pillar)

A pure classifier over the last ~14 days of the attempt log. Any trigger fires the
mildest matching intervention; interventions are rate-limited (≤ 1 visible nudge/day)
and always dismissible.

| Signal | Trigger (tunable) | Intervention |
|---|---|---|
| Score decline | `velocity[subject] < −8/wk` over ≥ 4 attempts | Insert an easier warm-up set; Sandra: "On reprend les bases de X ?" |
| Time inflation | `timeSpent` rising ≥ 40% vs. that quiz's baseline, score flat/down | Suggest the lesson video before re-quizzing |
| Repeat fail | same `quizId` < 50% on 3 consecutive attempts | Switch topic + offer targeted mini-lesson (breaks the wall) |
| Streak-at-risk | active streak ≥ 3 and no activity today, local evening | Gentle push: "Ta série de 6 jours 🔥 t'attend" |
| Cliff-edge inactivity | 0 activity 4–7 days, was previously regular | Re-engagement push with a 1-question "reprends en 30s" hook |

Interventions are **suggestions routed through existing surfaces** (SmartSuggestion,
Sandra `studentContext`, notifications) — no new blocking UI. Sandra's system prompt
(`api/_lib/sandraPrompt.ts`) gains an optional `signals` summary so she can reference
"I noticed trigonometry has been tricky lately" when relevant.

---

## 7. Data model additions

All under `users/{uid}` (owner read/write, matching current rules):

```
questionStats/{questionId}   { seen, correct }              // crowd difficulty (global — see §10)
reviewState/{key}            { interval, ease, repetitions, nextReviewMs, lastPct }
signalsCache/current         { ...LearnerSignals, updatedAtMs }   // derived, rebuildable
```

`signalsCache` is a **cache, never a source of truth** — deletable and fully
recomputable from the immutable `quizAttempts` log. Recompute on app foreground if
`updatedAtMs` is stale (> 6h) or after any attempt.

---

## 8. Offline & performance

- Mobile is offline-tolerant: `deriveSignals` runs on the **locally cached** attempt
  history (already persisted via `queryPersistence.ts`), so recommendations work on
  a tap-tap Port-au-Prince connection. Stats writes are fire-and-forget with retry,
  exactly like `recordStreakActivity(...).catch(() => {})`.
- Derivation is O(attempts) arithmetic over a bounded window (last ~90 days /
  capped N) — runs in a few ms, off the render path, memoized like `useReadiness`.

---

## 9. Rollout — 4 shippable slices

1. **Instrument + derive (invisible).** Add `questionStats` writes and
   `adaptiveEngine.deriveSignals`. Ship dark; log nothing user-facing. Validate the
   math against real logs. *(OTA-able, zero UI risk.)*
2. **Spaced repetition surface.** `reviewState` + `review-due` SmartSuggestion +
   Records "À réviser" count. Highest value-to-effort (reuses `computeSRS`).
3. **Adaptive difficulty.** `selectAdaptiveQuestions` in quiz/trivia assembly behind
   a flag; A/B against fixed ordering on completion rate + return rate.
4. **Stall detection + interventions.** Ship one trigger at a time (start with
   streak-at-risk — cheapest, most positive), measure, expand.

Each slice is independently valuable and OTA-deliverable on the existing channel.

### Shipped status (as of 2026-07-27)

- ✅ **Slice 1** — pure engine (`deriveSignals`), mirrored web + mobile.
- ✅ **Slice 2** — spaced-repetition surface (`reviewService`, "À réviser" card),
  OTA-live both runtimes.
- ✅ **Slice 3a** — difficulty ordering from authored `difficulty` (1–5), wired
  into the exam browser (mobile + web), OTA-live.
- ✅ **Slice 3b** — crowd-difficulty pipeline hosted on **Vercel** (not Firebase
  Functions — project is on Spark, not Blaze): `answerEvents` logging on all four
  graded surfaces, `/api/aggregate-question-stats` cron → `questionStats`, and the
  auto-launching consumer (`useCrowdOrderedQuestions`) wired into mobile + web quiz.
- ⏳ **Slice 4** — stall detection interventions: engine `detectStall` is built +
  tested, but not yet wired to any surface. **Not started.**

> ### 🔔 LAUNCH-VERIFICATION CHECKLIST — do this around **2026-10-27**
> The crowd-difficulty consumer auto-activates on that date (`CROWD_DIFFICULTY_LAUNCH_MS`
> in `adaptiveEngine.ts`), gated per-question by `MIN_QUESTION_EXPOSURES` (20). Near
> that date, verify the pipeline actually accrued usable data before trusting it:
> 1. In Firestore, confirm `questionStats/*` docs exist with `seen` climbing, and
>    check how many questions have cleared `seen ≥ 20`. If very few, the reorder is
>    still mostly authored-difficulty — consider lowering the floor or pushing the
>    date out (edit `CROWD_DIFFICULTY_LAUNCH_MS`).
> 2. Confirm the Vercel cron `/api/aggregate-question-stats` is running clean
>    (Vercel → cron logs; the cursor doc `aggregatorState/questionStats` should
>    advance each run).
> 3. Spot-check a subject where `seen` is high: do the crowd difficulties look sane
>    (hard questions → high, easy → low)?
> 4. Once satisfied, consider the challenge-band upgrade (per-learner ability) over
>    the current easiest-first scaffolding — see §4.

---

## 10. Decisions

- **`questionStats` scope — DECIDED (2026-07-26), REVISED (2026-07-27):** global
  crowd difficulty via an aggregator reading an append-only log. Originally speced
  as a Firebase Cloud Function; **revised to a Vercel cron** (`/api/aggregate-
  question-stats`) because the Firebase project is on the **Spark plan** (Cloud
  Functions API disabled — needs Blaze), while the Vercel API already runs
  `firebase-admin` + crons. Admin-SDK writes bypass rules, so client rules stay
  tight (`answerEvents` create-only, `questionStats` public-read/server-write).
  Below `MIN_QUESTION_EXPOSURES` a question falls back to authored `difficulty`.
- **Intervention tone/frequency — DECIDED (2026-07-26):** ≤ 1 visible nudge/day,
  all dismissible, none before a student has ≥ ~10 attempts (avoid cold-start
  nagging). Encouraging register only — never shame.
- **Challenge band target.** 0.75–0.82 is a research-backed default; worth an A/B in
  Slice 3.
- **Privacy.** Signals are derived learning data, not new PII, and stay under the
  user's own doc. No signal summary sent to Sandra includes anything beyond
  subject-level performance.

---

## 11. Success metrics

- **Difficulty:** quiz completion rate ↑, rage-quit (abandon mid-quiz) ↓.
- **Spaced repetition:** 7-day return rate ↑; re-test scores on reviewed topics ↑.
- **Stall:** 7/30-day retention of at-risk cohort ↑; streak-break rate ↓.
- **Guardrail:** no drop in average session enjoyment (opt-in thumbs signal) — the
  engine must not make the app feel like surveillance.
