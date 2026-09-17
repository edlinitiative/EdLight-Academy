# The exam question screen — designed from the corpus

**Date:** 2026-09-17
**Method:** every question in `public/exam_catalog.json` measured — 9,426 questions across 530 exams — rather than designing for an imagined one.

---

## What the corpus actually is

| Type | Count | Share |
|---|---:|---:|
| short_answer | 3,561 | 37.8% |
| fill_blank | 2,291 | 24.3% |
| calculation | 1,429 | 15.2% |
| multiple_choice | 1,163 | 12.3% |
| essay | 814 | 8.6% |
| matching | 93 | 1.0% |
| true_false | 64 | 0.7% |
| multiple_select | 11 | 0.1% |

**77.2% of questions are typed answers. Multiple choice is 12.3%.**

That single fact indicts the current screen. It is laid out like a quiz app — a big question card, then content, with the input last — when for three questions in four the *input is the main event*.

And the typed answers are **short**: median expected answer 20 characters, and **61% are 24 characters or less**. These want a field, not a textarea. Today they get a multi-line box sized for an essay.

## What every question carries

| Payload | Count | Share |
|---|---:|---:|
| hints | 9,426 | **100%** |
| model answer | 7,883 | 83.6% |
| answer_parts | 7,799 | 82.7% |
| scaffold_text | 7,760 | 82.3% |
| math notation | 2,002 | 21.2% |
| options | 1,253 | 13.3% |
| 2+ blanks | 903 | 9.6% |
| lettered sub-parts | 797 | 8.5% |
| figure | 643 | 6.8% |

**Every single question has hints** — 93% have exactly three, each about 66 characters. A complete progressive-help ladder exists for the entire corpus, and it is hidden behind one small "Besoin d'un indice ?" link.

**Five questions in six have a model answer.** The pedagogy that was asked for — "how can we make it more pedagogical, the student does not understand but wants to learn" — is already in the data. It is simply never shown.

## Why the screen reads badly

`scaffold_text` averages 255 characters but **43% of scaffolded questions exceed 320, and the top 10% exceed 1,352** (max 5,122). One in five reads as a *completed* derivation — it argues to a conclusion. So on a meaningful minority of questions the student meets a screen and a half of dense LaTeX before reaching anything they can do.

The current order is: question → full derivation → inputs → hint link. The derivation is the largest element and the least actionable.

## The design

**Principle: the answer field is the subject of the screen. Everything else earns its place relative to it.**

Order, top to bottom:

1. **Question** — plain, generous, no card chrome. It is the only thing that must be read in full.
2. **Figure**, when present (6.8%) — directly under the question, since it is part of reading it.
3. **The answer** — immediately visible without scrolling on the dominant case.
   - ≤24-char expectation (61% of typed): a single-line field, sized to the answer, with the math keypad only when the question carries math (21%).
   - Sub-parts (8.5%): one labelled field each.
   - Blanks (9.6%): numbered inline, one field each.
   - Options (13.3%): 4 short rows — these are already fine.
   - Essay (8.6%): the textarea, with word count and the method notes.
4. **Help, as a ladder** — not a link. Three hints exist for almost every question; they reveal one at a time, each ~66 characters. This is the single largest unused asset in the corpus.
5. **Derivation** — collapsed by default whenever it exceeds a screenful, because it is reference material, not the task.

**After submitting**, the model answer becomes the centre of the review screen for the 83.6% that have one. A score with no worked answer teaches nothing, and we are sitting on 7,883 of them.

## What this changes in code

- `ExamAnswerInput` needs a single-line mode chosen by expected-answer length, not by question type.
- `ExamHint` becomes a progressive ladder rather than a disclosure link.
- `ScaffoldAnswer` demotes `scaffold_text` beneath the inputs (collapse already shipped).
- `ExamResults` surfaces `model_answer`.

## What this deliberately does not do

No new visual language. The last two design attempts were rejected for aesthetics; this one is about *order and emphasis*, which the measurements can actually settle. Styling stays as-is so the two conversations do not get tangled.

---

# Part II — answer formats: gradable *and* worth learning from

Second pass, measuring the thing that actually decides the design: where the
grading key lives, and what input format each question can support.

## Almost everything is gradable — but not where you'd expect

| Where the key lives | Count | Share |
|---|---:|---:|
| `answer_parts` **only** | 4,058 | 43.1% |
| both `correct` and `answer_parts` | 3,741 | 39.7% |
| `correct` only | 1,564 | 16.6% |
| **nothing** | **63** | **0.7%** |

**99.3% of questions have a grading key, and for 82.8% that key is the step
ladder, not the final answer.** Only 16.6% can be graded from `correct` alone.

That inverts the screen. The steps are not scaffolding *around* the answer —
for four questions in five they *are* the answer, and the only thing we can
reliably mark. There are **19,041 authored step answers**, 55.5% of them 24
characters or less: field-sized, one line each.

## Why the final free-text box is the weakest thing on the screen

Only **15.4%** of questions carry any alternative accepted answers (2,788 in
total across 9,426 questions). So marking a typed final answer leans on fuzzy
matching with almost no authored safety net — which is exactly where false
negatives come from, and a student marked wrong for a synonym stops trusting
the app. Grading *steps* avoids most of that: each step is short, specific, and
55% of them fit in a field.

## The format ladder

Ordered by how much recall they demand — which is the same order as how much
the student learns, and the reverse of how easy they are to mark:

| Format | Demand | Gradability | Corpus support |
|---|---|---|---|
| Recognition — pick one of 4 | lowest | exact | 1,253 questions ship options; **3,081 more could seed 3+ distractors from their own step answers** |
| **Cued recall — inline blank in the sentence** | medium | exact-ish | 1,796 questions carry blanks; **619 sit mid-sentence and need a true inline field**, 1,177 trail the sentence |
| **Procedural — fill the steps** | high | **exact, per step, with partial credit** | **7,799 questions (82.7%)**, 19,041 steps |
| Free recall — type the final answer | highest | weakest (15.4% have alternatives) | the current default |

The corpus is overwhelmingly built for the middle two, and the app leads with
the one at the bottom.

## The mechanic: let the question get easier, never let it fail silently

One question, one escalation — challenging first, with a floor:

1. **Type it.** Free recall, full credit.
2. **Stuck → a hint.** Three exist for *every* question, ~66 characters each.
3. **Still stuck → the step becomes a choice**, built from that question's own
   sibling step answers (3,081 questions can seed this without new content).
   Recognition instead of recall, reduced credit.

Every rung is auto-gradable, the student always reaches an answer they can act
on, and they only drop to recognition after genuinely trying recall — which is
the point where a multiple-choice prompt teaches rather than shortcuts.

## Inline fields, specifically

A blank belongs **in the sentence**, not below it: "les atomes sont unis par une
[____] liaison" reads as one thought, while a detached box makes the student
rebuild the sentence from memory. 619 questions require this; the other 1,177
have the blank at the end, where a field below reads the same. Both should use
the same component — position decides the layout, not the question type.

## What we are missing (the content gap)

1. **Alternatives.** 15.4% coverage is the single biggest source of unfair
   marking. Generating accepted variants for the 18.6% single-word and 12.6%
   short-phrase answers would do more for perceived fairness than any UI change.
2. **Units and tolerance** on the 366 numeric answers — "3,14 m" and "3.14m"
   must both pass.
3. **Distractors** for the 3,081 questions that could support a fallback choice
   but have no authored options.

None of these need new questions written — only enrichment of what exists.
