#!/usr/bin/env python3
"""
Flag reading-comprehension sections whose source passage was never digitized.

Some exams (mostly Anglais / Français / Espagnol comprehension sections) ask
students to "read the text" but the original passage was never digitized — it
exists in NO file in this repo (verified). We cannot fabricate exam passages.

Instead of leaving a confusing buried bilingual "[Note: ...]" inside the
instructions, we:
  1. Set a structured  section['passage_missing'] = True  flag.
  2. Remove the bilingual "[Note: ...]" sentence from the instructions so the
     real consigne reads cleanly.
  3. Preserve any referenced text title (e.g. "The Importance of Sport...") in
     section['passage_reference'] when the instructions name one.

The UI then renders a single, honest "passage not available" notice and the
audit treats these as INFO (known/handled) rather than HIGH.

Idempotent.
"""

import json
import os
import re

CATALOG_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'exam_catalog.json')

NOTE_RE = re.compile(r'\s*\[Note:.*?\]\s*', re.S)
READ_KW = re.compile(
    r"(read the text|read the passage|lisez le texte|lire le texte|étude de texte"
    r"|lee el texto|lea el texto)",
    re.I,
)
TEXT_REF_RE = re.compile(
    r"(in the text|from the text|according to the (passage|text)|find in the text"
    r"|dans le texte|du texte|d'après le texte|selon le texte|the passage"
    r"|en el texto|según el texto|del texto)",
    re.I,
)
# Capture a quoted/titled text reference, e.g. Read the text 'The Importance ...'
TITLE_RE = re.compile(r"text[e]?\s*['\"“«]([^'\"”»]{4,80})['\"”»]", re.I)


def main():
    data = json.load(open(CATALOG_PATH, encoding='utf-8'))
    flagged = 0
    notes_stripped = 0
    passages_extracted = 0

    for exam in data:
        for sec in exam.get('sections', []) or []:
            instr = sec.get('instructions') or ''
            passage = sec.get('passage') or ''
            stitle = sec.get('section_title') or ''
            questions = sec.get('questions') or []

            has_note = bool(NOTE_RE.search(instr))
            refs = sum(1 for q in questions if TEXT_REF_RE.search(q.get('question', '') or ''))
            reads_text = bool(READ_KW.search(instr + ' ' + stitle))

            # A section needs the missing-passage treatment if it tells the
            # student to read a text, has questions citing it, but has no passage.
            needs_flag = has_note or (reads_text and refs > 0 and not passage and len(instr) < 400)
            if not needs_flag or passage:
                continue

            # Capture a referenced title if present (before stripping note).
            m = TITLE_RE.search(instr)
            if m and not sec.get('passage_reference'):
                sec['passage_reference'] = m.group(1).strip()

            # Strip the bilingual note from the instructions.
            if has_note:
                cleaned = NOTE_RE.sub(' ', instr).strip()
                cleaned = re.sub(r'\s{2,}', ' ', cleaned)
                sec['instructions'] = cleaned
                notes_stripped += 1

            sec['passage_missing'] = True
            flagged += 1

    # ── Extract embedded reading passages into the section passage field ─────
    # Some comprehension sections embed the whole reading text inside the FIRST
    # question ("Text provided: …", "Texto: …"), so it is repeated/buried. When
    # we can confidently split passage from the actual first question, we move
    # the passage to section['passage'] so it renders once in the reading panel.
    PASSAGE_START = re.compile(
        r'^\s*(text provided|texte?\s+fourni|texto|read the following (text|passage)'
        r'|read the text|lisez(?:\s+attentivement)?\s+(le|ce)\s+(texte|passage)'
        r'|voici le texte|étudiez le texte)\s*:?\s*',
        re.I,
    )
    QUESTION_BOUNDARY = re.compile(
        r'(\n\s*questions\s*\n|\n\s*[A-Z]\s*[-.)]\s*'
        r'(contestar|répond|answer|complete|complétez|conteste)|\n\s*1\s*[.)]\s)',
        re.I,
    )
    LEADING_CLEAN = re.compile(
        r'^\s*(questions\s*\n+)?(?:[A-Z]\s*[-.)]\s*[^\n]*\([0-9]+%?\)\s*\n+)?\s*\d+\s*[.)]\s*',
        re.I,
    )

    for exam in data:
        for sec in exam.get('sections', []) or []:
            if sec.get('passage'):
                continue
            questions = sec.get('questions') or []
            if not questions:
                continue
            q0 = questions[0]
            qt = q0.get('question', '') or ''
            if len(qt) <= 800 or q0.get('type') == 'essay' or not PASSAGE_START.search(qt):
                continue
            m = QUESTION_BOUNDARY.search(qt)
            if not m or m.start() < 300:
                continue
            passage = PASSAGE_START.sub('', qt[:m.start()]).strip()
            rest = qt[m.start():].strip()
            if len(passage) < 300 or not (3 < len(rest) < 800):
                continue
            cleaned_q = LEADING_CLEAN.sub('', rest).strip()
            if not (3 < len(cleaned_q) < 800):
                continue
            sec['passage'] = passage
            q0['question'] = cleaned_q
            passages_extracted += 1

    with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('Missing-passage flagging complete.')
    print(f'  Sections flagged passage_missing : {flagged}')
    print(f'  Bilingual [Note:] blocks stripped: {notes_stripped}')
    print(f'  Embedded passages extracted      : {passages_extracted}')


if __name__ == '__main__':
    main()
