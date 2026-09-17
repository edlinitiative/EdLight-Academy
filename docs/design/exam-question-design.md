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

---

# Part III — what else, before building

Measured rather than brainstormed. The short answer: **almost nothing needs to
be authored. Three things need to be shown, and one needs to be derived.**

## Authored, and never rendered

| Field | Coverage | Used in the app? |
|---|---:|---|
| `model_answer` | 7,883 (83.6%) | **no — zero references** |
| `approaches` (alternative solution methods) | 2,002 (21.2%) | **no — zero references** |
| `explanation` | 8,546 (90.7%) | only in the end-of-exam review, as a caption |

`approaches` is the standout. Two thousand questions carry *a second way to
solve the problem*, written and sitting unused. "Here is another route to the
same answer" is the most advanced thing in the corpus and nothing has ever
displayed it.

`explanation` has a timing problem rather than a display one: it exists for
nine questions in ten, averages 212 characters, and appears forty questions
later in a review list. It teaches at the moment of answering, not at the end.

## Partial credit is available and unused

Every question carries `points` (100%). **No `answer_parts` entry carries points
(0%)** — so per-step credit means dividing the question's points across its
steps. With 19,041 authored steps that turns an all-or-nothing mark into "two
of your three steps were right", which is both fairer and the difference
between a student feeling stuck and feeling close.

## The one real content gap: per-question topics

Exam-level topics exist (741 distinct across the catalog) but **not one question
carries its own topic (0%)**. So after an exam we can say "you scored 40% on
this paper" but never "you are losing marks on logarithms" — and targeted
practice is the whole point of sitting one. This is derivable from question text
rather than requiring new authoring, and it is what makes results actionable.

## Do not build adaptivity yet

`questionStats` holds 955 rows and `answerEvents` 2,547 — but the sample rows
read `seen: 1`. With 123 users, per-question difficulty is n≈1 and means
nothing. The crowd-ordering machinery already exists; it should stay dormant
rather than being extended on noise.

## Repeats are accidental, and could be deliberate

358 question texts appear more than once across the catalog (774 instances). A
student can meet the same question twice by chance. The same fact is an asset
if it is intentional: spaced repetition wants a deliberate second encounter,
and `review.ts` already exists to schedule one.

## Revised priority

1. Show `model_answer` and `approaches` after answering — the largest unused
   teaching assets in the product.
2. Move `explanation` to the moment of answering.
3. Partial credit per step.
4. Derive per-question topics, so results say what to practise.
5. Then the layout work in Parts I and II.

---

# Part IV — what to take from Khan's Perseus

[Khan/perseus](https://github.com/Khan/perseus) is Khan Academy's exercise
renderer and editor. **MIT licensed**, monorepo, published as `perseus`,
`perseus-editor`, `perseus-core`, `perseus-linter`, `perseus-score` and
`math-input`. Khan states it is not accepting external contributions.

## What we cannot do

**Adopt it wholesale.** Perseus is a React *web* renderer; there is no React
Native support. More decisively, its questions are authored as Perseus JSON
with widgets embedded in an extended Markdown — adopting it means re-authoring
**9,426 questions** into that format. That is not a migration, it is a rewrite
of the entire corpus.

(The web app is React, so Perseus *could* run there, and mobile already renders
figures through a WebView — so a WebView-hosted renderer is technically open.
It still does not solve the authoring problem.)

## What is worth taking

### 1. Inline widgets in the question text — the architecture, not the code

Perseus embeds interactive widgets *inside* the markdown of the question rather
than appending inputs below it. This is exactly the shape asked for: the field
belongs in the sentence. Our 619 mid-sentence blanks and 903 multi-blank
questions are the same problem Perseus solved, and its answer is the right one:
**the question body is a document with holes, and each hole is a graded widget.**

We do not need their renderer to adopt their model. `BLANK_RE` already splits our
text; making each split point a *typed widget* rather than a plain field is a
small step with a large payoff, because it generalises: a hole can be a text
field, a numeric field with tolerance, or a dropdown, and the grader treats them
uniformly.

### 2. The validation / scoring split

Perseus separates *validation* (is this input well-formed?) from *scoring* (is it
right?) — `perseus-score` is a distinct package. Our grading is one function in
`shared/examUtils` that does both at once, which is part of why unfair marking is
hard to reason about: "empty", "malformed" and "wrong" all come back as `false`.
Splitting them lets us tell a student "that is not a number" instead of marking
them incorrect, and it is a refactor of our own code, not an import.

### 3. `numeric-input` semantics

Perseus's numeric input carries tolerance, significant figures and units as
first-class answer properties. That is precisely the gap Part III identified for
our 366 numeric answers, where "3,14 m" and "3.14m" must both pass. Worth
reimplementing the semantics; no dependency required.

### 4. The widget catalogue as a menu of formats

Beyond radio and numeric input, Perseus ships **sorter, orderer, matcher,
categorizer, matrix and interactive-graph**. These are the answer to "easy to
grade but challenging enough to learn": ordering steps of a derivation, matching
terms to definitions and categorising examples all mark exactly while demanding
real recall. We have 93 matching questions and nothing else of this kind — and
our 19,041 authored steps would make an *ordering* exercise almost free to
generate from content that already exists.

### 5. `math-input`

Khan's MathQuill-based keypad is a mature mobile math input. Ours is a row of
character chips. This is the one place where taking the actual package is worth
evaluating — though it is React DOM, so on mobile it would have to live in the
same WebView pattern we already use for figures.

## Recommendation

Take the **model**, not the dependency: holes-in-a-document, typed widgets,
validation split from scoring, and numeric semantics with tolerance and units.
Then add **ordering** as a new format, because it is the cheapest new question
type we can build — the steps are already written.
