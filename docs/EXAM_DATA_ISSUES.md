# Exam data issues — backlog

Tracking known **content/data** problems in the exam bank (not UI bugs). These
need data re-tagging or a migration pass, not a CSS/React fix. Surfaced during
the June 2026 mobile audit.

---

## 1. Reading passages mis-tagged as figures (`has_figure` / `figure_description`)

**What:** In several language exams (Espagnol, Anglais, Français), a question's
comprehension **reading passage** is stored as `figure_description` with
`has_figure: true`. Because it isn't a real figure, the renderer fell back to a
generic **"FIGURE"** card around plain prose.

**Example:** Espagnol — _"La alimentación saludable"_ (seen in the audit
screenshots): the whole passage rendered inside a "Figure" box.

**Status:** _Mitigated at render time_ (not fixed in data). `FigureRenderer`
now detects long prose via `looksLikeProse()` and renders it as a clean reading
passage (`ProsePassage` / `.figure-renderer--prose`) instead of the figure
card. The **underlying data is still mis-tagged**, so the figure flag/count is
wrong and the text isn't in the proper passage field.

**Proper fix (data):**
- For these questions set `has_figure: false` and move the text into the
  section's `passage` field (the dedicated passage UI: `section.passage` in
  [src/pages/ExamTake.tsx](../src/pages/ExamTake.tsx)).
- Then the prose heuristic becomes a safety net rather than the primary path.

**References:**
- [artifacts/language_passage_report.json](../artifacts/language_passage_report.json)
  — totals: `HAS_PASSAGE: 61`, `LONG_INSTR: 10`, `FLAGGED_MISSING: 2`
  (Anglais / Espagnol / Français).
- Existing tooling: [scripts/investigate_language_passages.py](../scripts/investigate_language_passages.py),
  [scripts/flag_missing_passages.py](../scripts/flag_missing_passages.py),
  [scripts/apply_reconstructed_passages.py](../scripts/apply_reconstructed_passages.py).

---

## 2. Reading text embedded in the question prompt (`q`), real questions missing

**What:** Some sections store the entire reading text inside the question text
with a note that the actual questions weren't digitized from the source image
(e.g. _"The questions for this reading comprehension section are not visible in
the provided image…"_).

**Effect:** The "question" is really the passage; there are no answerable
sub-questions, and the model answer says _"Reference answer unavailable."_

**Proper fix (data):** Extract the passage into `section.passage`, then either
add the real sub-questions or flag the section as `passage_missing` /
incomplete so the UI shows the existing "missing passage" notice instead of a
dead question.

**References:**
- [artifacts/missing_sections_qa.json](../artifacts/missing_sections_qa.json)
  (e.g. Anglais 2024 _"The Challenge of Garbage Management in Haiti"_).

---

## 3. Exam top bar density on phones (UI follow-up — low confidence)

**What:** In the active exam (audit screenshots IMG_1079 / IMG_1080) the
progress / timer / score chips in `.exam-take__topbar` looked tight on a narrow
phone.

**Status:** Observed via OCR only — may be OCR noise. Needs a real-device look
before changing anything. Listed here so it isn't lost; this one is UI, not
data.

---

_Suggested approach for 1 & 2:_ a single audit + migration script over the
per-exam JSON files (the `scripts/` folder already has the passage tooling
above) that (a) finds `has_figure` questions whose `figure_description` is long
prose, (b) moves them to `section.passage`, and (c) writes a before/after
report into `artifacts/`.
