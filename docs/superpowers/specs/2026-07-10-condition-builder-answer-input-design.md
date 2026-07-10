# Exam Answer Input — Guided Condition Builder

**Date:** 2026-07-10
**Status:** Design — pending approval
**Goal:** Replace fragile free-text answers for condition/domain/inequality questions
with a guided, structured "condition builder" that is more pedagogical and
deterministically auto-gradable.

## Problem

Questions like *"domaine de définition de f(x) = (3 − ln x)/(2 − eˣ)"* currently render
as a free-text `fill_blank`. The stored answer is an interval string
(`"]0, +∞[ \ {ln 2}"`). Free-text entry of interval/condition notation is:
- **hard to grade** (string/CAS comparison of interval notation is brittle), and
- **not pedagogical** (a stuck student gets no scaffold toward the method).

## Design

### Student-facing: the Condition Builder
For an applicable question, render one row per condition:

```
Pour que f(x) soit définie :
   x     [ > ▾ ]  [ 0   ]
   eˣ    [ ≠ ▾ ]  [ 2   ]
```
- **Left side** pre-filled from the question data, rendered with KaTeX (read-only).
- **Operator** dropdown: `>  ≥  <  ≤  =  ≠`.
- **Value** field, math-keyboard enabled (so `ln 2`, `√3`, etc. are enterable).
- Fixed number of rows, defined by the question (student does not add/remove rows).
- Answer persists as structured JSON: `[{ "operator": ">", "value": "0" }, …]`,
  aligned by row index to the question's declared conditions.

### Data model (additive, non-destructive)
Add an optional field to a question:
```jsonc
"conditions": [
  { "left": "x",   "operator": ">", "value": "0", "alternatives": [] },
  { "left": "e^x", "operator": "≠", "value": "2", "alternatives": ["e^{x} \\ne 2"] }
]
```
- Presence of `conditions` switches the input to the Condition Builder.
- The existing `correct` string is **kept** (used for results/review display and as a
  human-readable reference). We never delete existing answer data.

### Grading (`examUtils.ts`)
- New branch in `gradeSingleQuestion`: when `q.conditions` exists, parse the student's
  structured answer; for each row, it is correct iff **operator matches** AND **value
  matches** via the existing `answerMatches()` (which already handles normalization,
  tolerances, and CAS equivalence — so `ln 2` vs `\ln 2` etc. pass).
- **Order-independent** matching (each expected condition must be met by some row),
  to avoid penalizing row order.
- Score is proportional to correct rows (mirrors existing multi-blank grading), full
  points only if all conditions correct.
- Deterministic — no AI grading needed.

### Reused infrastructure
- `answerMatches()` + CAS normalization (value comparison).
- The multi-blank proportional scoring pattern already in `examUtils.ts`.
- The math keyboard already used by other ExamTake inputs.
- Results/review display components (extended to show conditions vs expected).

## Scope: whole exam bank (staged for safety)

Grading changes affect real scores, and auto-authored answer keys can be **wrong**,
which would mark students incorrectly. Therefore the bank-wide rollout is staged:

- **Phase A — Engine (safe, deterministic).** Build the Condition Builder input +
  grader + results display, behind the presence of `conditions`. Author conditions by
  hand for the applicable questions in THIS exam
  (`ex_3ee0c9ec…`, 2025 Bac Maths). TDD on the grader. Verify live in the browser.
- **Phase B — Bank sweep & authoring.** Programmatically identify genuine
  condition-type questions across all 494 exams (domain-of-definition, sign studies,
  existence/definition conditions expressible as `left op value`). For each, author a
  `conditions` array (AI-assisted from the existing `correct`/`explanation`), emit a
  **per-exam review artifact** (proposed conditions vs original answer), and apply in
  reviewable batches. Interval/solution-set answers that do NOT decompose into simple
  conditions are left as-is (out of scope for this input).
- **Fallback:** any question without `conditions` keeps its current input and grading
  unchanged. Nothing regresses.

## Guardrails / non-goals
- Never delete or overwrite existing `correct`/`explanation`/`scaffold` data.
- No interval/union builder in this iteration (conditions only, per request).
- No auto-deploy; changes land in the repo for review.
- Every authored answer key must be reviewable before it grades students; batches ship
  only after review.

## Success criteria
- Applicable questions render the Condition Builder; grading is correct and deterministic.
- The 2025 Bac Maths domain question (`x > 0`, `eˣ ≠ 2`) grades correctly end-to-end.
- Questions lacking `conditions` are unaffected.
- Bank authoring produces reviewable artifacts; no unreviewed key silently grades students.
```
