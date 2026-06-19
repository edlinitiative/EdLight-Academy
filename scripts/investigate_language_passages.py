#!/usr/bin/env python3
"""
Investigate language exams for missing reading-comprehension passages.

Scans every exam JSON in public/exams/ and reports, for each language exam
(Anglais / Espagnol / Français / Créole / Allemand / ... ), which reading
comprehension sections reference a source text but have no digitized passage.

It distinguishes:
  - HAS_PASSAGE      : section already carries the reading text (section.passage)
  - FLAGGED_MISSING  : section.passage_missing == True (known + handled in UI)
  - UNFLAGGED_MISSING: looks like it needs a passage but neither passage nor
                       passage_missing is set (these are the silent problems)
  - LONG_INSTR       : no passage field, but instructions are long (>200 chars)
                       so the UI shows the instructions as the reference text
                       (the passage may be embedded in instructions)

Read-only. Produces a JSON + human report on stdout.
"""

import json
import os
import re
import glob
from collections import defaultdict

EXAMS_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'exams')

# Subjects considered "language" exams.
LANGUAGE_SUBJECTS = re.compile(
    r"anglais|english|espagnol|spanish|fran[çc]ais|french|cr[ée]ole|kreyol"
    r"|allemand|german|italien|portugais|langue",
    re.I,
)

# Question text that clearly refers to an external reading text.
TEXT_REF_RE = re.compile(
    r"(in the text|from the text|according to the (passage|text)|find in the text"
    r"|the (author|passage|text|writer|article|story|poem|extract|paragraph)"
    r"|underlined word|line \d+|paragraph \d+"
    r"|dans le texte|du texte|d'apr[èe]s le texte|selon le texte|le passage"
    r"|l'auteur|ce texte|du passage|la lecture"
    r"|en el texto|seg[uú]n el texto|del texto|el autor|el p[aá]rrafo|la lectura)",
    re.I,
)

# Section title / instructions that announce a reading-comprehension exercise.
READING_SECTION_RE = re.compile(
    r"(reading|comprehension|compr[ée]hension|read the (text|passage|following)"
    r"|lisez|lire le texte|[ée]tude de texte|texte"
    r"|lectura|lee el texto|lea el texto|comprensi[oó]n)",
    re.I,
)


def looks_like_reading_section(section):
    """Heuristic: does this section depend on a source reading text?"""
    title = section.get('section_title') or ''
    instr = section.get('instructions') or ''
    questions = section.get('questions') or []

    title_instr = f"{title}\n{instr}"
    announces_reading = bool(READING_SECTION_RE.search(title_instr))

    ref_questions = [
        q for q in questions
        if TEXT_REF_RE.search((q.get('question') or ''))
    ]

    # Essay/translation-only sections frequently say "texte" but are NOT
    # comprehension of a missing passage; require either an explicit reading
    # announcement plus a referencing question, or 2+ referencing questions.
    needs_text = (announces_reading and len(ref_questions) >= 1) or len(ref_questions) >= 2
    return needs_text, ref_questions, announces_reading


def classify(section):
    passage = (section.get('passage') or '').strip()
    instr = (section.get('instructions') or '').strip()
    flagged = bool(section.get('passage_missing'))

    if passage:
        return 'HAS_PASSAGE'
    if flagged:
        return 'FLAGGED_MISSING'
    # No passage, not flagged. Is the passage maybe embedded in long instructions?
    if len(instr) > 200:
        return 'LONG_INSTR'
    return 'UNFLAGGED_MISSING'


def main():
    files = sorted(glob.glob(os.path.join(EXAMS_DIR, '*.json')))
    report = []
    totals = defaultdict(int)
    subject_totals = defaultdict(lambda: defaultdict(int))

    for path in files:
        try:
            exam = json.load(open(path, encoding='utf-8'))
        except Exception as e:
            print(f"!! could not parse {os.path.basename(path)}: {e}")
            continue

        subject = exam.get('subject') or ''
        language = exam.get('language') or ''
        title = exam.get('exam_title') or ''

        is_language = bool(LANGUAGE_SUBJECTS.search(subject)) or bool(
            LANGUAGE_SUBJECTS.search(title)
        )
        if not is_language:
            continue

        exam_entry = {
            'file': os.path.basename(path),
            'exam_id': exam.get('exam_id'),
            'subject': subject,
            'language': language,
            'year': exam.get('year'),
            'level': exam.get('level'),
            'title': title[:80],
            'sections': [],
        }

        for si, section in enumerate(exam.get('sections', []) or []):
            needs_text, ref_qs, announces = looks_like_reading_section(section)
            if not needs_text:
                continue
            status = classify(section)
            totals[status] += 1
            subject_totals[subject][status] += 1
            exam_entry['sections'].append({
                'index': si,
                'section_title': section.get('section_title'),
                'status': status,
                'instr_len': len(section.get('instructions') or ''),
                'passage_len': len(section.get('passage') or ''),
                'ref_question_count': len(ref_qs),
                'passage_reference': section.get('passage_reference'),
                'num_questions': len(section.get('questions') or []),
            })

        if exam_entry['sections']:
            report.append(exam_entry)

    # ── Human-readable summary ─────────────────────────────────────────────
    problem_statuses = ('UNFLAGGED_MISSING', 'LONG_INSTR', 'FLAGGED_MISSING')

    print('=' * 78)
    print('LANGUAGE EXAM READING-PASSAGE INVESTIGATION')
    print('=' * 78)
    print(f"Language exam files with reading sections : {len(report)}")
    print()
    print('Reading-section status totals:')
    for k in ('HAS_PASSAGE', 'FLAGGED_MISSING', 'LONG_INSTR', 'UNFLAGGED_MISSING'):
        print(f"  {k:<18}: {totals.get(k, 0)}")
    print()
    print('By subject:')
    for subj in sorted(subject_totals):
        counts = subject_totals[subj]
        parts = ', '.join(f"{k}={counts[k]}" for k in sorted(counts))
        print(f"  {subj:<12}: {parts}")
    print()

    # List the actual problem sections (no usable text at all).
    print('-' * 78)
    print('SECTIONS WITH NO DIGITIZED TEXT (UNFLAGGED_MISSING) — silent gaps')
    print('-' * 78)
    n = 0
    for e in report:
        bad = [s for s in e['sections'] if s['status'] == 'UNFLAGGED_MISSING']
        if not bad:
            continue
        n += 1
        print(f"\n{e['subject']} {e['year']} [{e['level']}] — {e['file']}")
        print(f"   {e['title']}")
        for s in bad:
            print(f"   • §{s['index']} \"{s['section_title']}\" "
                  f"(instr={s['instr_len']}c, refQs={s['ref_question_count']}, "
                  f"Qs={s['num_questions']})")
    if not n:
        print('  (none)')

    print()
    print('-' * 78)
    print('SECTIONS RELYING ON INSTRUCTIONS AS TEXT (LONG_INSTR) — verify these')
    print('-' * 78)
    n = 0
    for e in report:
        li = [s for s in e['sections'] if s['status'] == 'LONG_INSTR']
        if not li:
            continue
        n += 1
        print(f"\n{e['subject']} {e['year']} [{e['level']}] — {e['file']}")
        for s in li:
            print(f"   • §{s['index']} \"{s['section_title']}\" "
                  f"(instr={s['instr_len']}c, refQs={s['ref_question_count']})")
    if not n:
        print('  (none)')

    # Dump full machine-readable report next to the script output.
    out_path = os.path.join(os.path.dirname(__file__), '..', 'artifacts',
                            'language_passage_report.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'totals': totals, 'subject_totals': subject_totals,
                   'exams': report}, f, indent=2, ensure_ascii=False, default=dict)
    print(f"\nFull report written to {os.path.relpath(out_path)}")


if __name__ == '__main__':
    main()
