#!/usr/bin/env python3
"""
Move reading-comprehension passages that were mis-stored inside a question's
`figure_description` into the section-level `passage` field, format them nicely
(title / body / source), and clear sibling "figures" that merely point back at
the passage.

WHY: a few language exams had the comprehension reading text tagged as a
question figure. ExamTake then renders it as an unformatted run-on block *under
the first question* instead of the shared "Texte de référence" panel, and the
other questions show empty "Figure" cards referencing it.

SCOPE — deliberately narrow & safe, so genuine figures (sculptures, color
wheels, tables, probability trees, musical staves, …) are never touched:
  • language subjects only          (Espagnol / Anglais / Français / Kreyòl / …)
  • reading-comprehension sections   (title says lectura / comprehension / …)
  • only genuine prose figure text   (classifyFigure == text & not a visual fig)
  • only when section.passage is empty

Operates on public/exam_catalog.json (the source of truth). Idempotent.
After running, regenerate the per-exam files served to users:

    node scripts/split_exam_catalog.mjs
"""

import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_embedded_passages import is_prose_passage, is_passage_reference  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
CATALOG_PATH = os.path.join(ROOT, 'public', 'exam_catalog.json')

LANG_SUBJECT_RE = re.compile(
    r"anglais|english|espagnol|spanish|espanol|fran[çc]ais|french|cr[ée]ole"
    r"|krey[oò]l|allemand|german|italien|italiano|portugais|langue",
    re.I,
)
READING_SECTION_RE = re.compile(
    r"reading|compr[ée]hension|comprensi[oó]n|lectura|lectora|lisez\s+le\s+texte"
    r"|read\s+the\s+(?:text|passage)|[ée]tude\s+de\s+texte|\btexte\b|\blecture\b",
    re.I,
)

# ── Passage formatting helpers ───────────────────────────────────────────────

# Trailing attribution ("Fuente: …", "Source: …", "Adapté de …").
SOURCE_RE = re.compile(
    r"\b(fuente|source|sources|adapt[eé]\s+de|adapted\s+from|tir[ée]\s+de"
    r"|extrait\s+de|d['’]apr[èe]s)\b\s*:?\s*",
    re.I,
)
# Title announced inline: titulado 'X' / titled "X" / intitulé «X».
TITLE_QUOTED_RE = re.compile(
    r"\b(?:titulad[oa]|titled|intitul[ée]e?)\b\s*:?\s*['\"“«»]([^'\"”»«]{3,90})['\"”»«]",
    re.I,
)
# Title announced as a label: Título: X / Titre - X / Title: X.
TITLE_LABEL_RE = re.compile(
    r"\b(?:t[ií]tulo|titre|title|tit\.)\s*[:\-]\s*['\"“«»]?([^'\"”»«\n.]{3,90}?)['\"”»«]?\s*(?:[.\n]|$)",
    re.I,
)
# Generic "this is the reading text" lead-in label to strip from the body.
LEADIN_RE = re.compile(
    r"^\s*(?:texto\s+de\s+lectura|texte\s+de\s+lecture|reading\s+(?:text|passage)"
    r"|read\s+the\s+following\s+(?:text|passage)|lee\s+(?:el\s+)?(?:siguiente\s+)?texto"
    r"|lisez\s+(?:attentivement\s+)?le\s+texte|le\s+texte\s+suivant"
    r"|el\s+(?:siguiente\s+)?texto|texto|texte)\b[^:]{0,60}:\s*",
    re.I,
)


def split_source(text: str):
    """Peel a trailing attribution (Fuente:/Source:/…) off the passage body."""
    best = None
    for m in SOURCE_RE.finditer(text):
        # Only treat as a source line when it sits near the end of the passage.
        if m.start() >= len(text) * 0.4:
            best = m
            break
    if best:
        # Keep the body's sentence-ending period; only trim trailing spaces and
        # separator punctuation (dashes / semicolons) that precede the source.
        body = re.sub(r'[\s—–\-;,]+$', '', text[:best.start()])
        source = text[best.start():].strip()
        return body, source
    return text, ''


def extract_title(text: str) -> str:
    m = TITLE_QUOTED_RE.search(text)
    if m:
        return m.group(1).strip()
    m = TITLE_LABEL_RE.search(text)
    if m:
        return m.group(1).strip()
    return ''


def strip_leadin(text: str, title: str) -> str:
    """Remove a "Texto de lectura titulado 'TITLE':" style prefix."""
    if title:
        idx = text.find(title)
        if idx != -1:
            colon = text.find(':', idx + len(title))
            # Colon should immediately follow the (optionally quoted) title.
            if colon != -1 and colon <= idx + len(title) + 3:
                return text[colon + 1:].strip()
    m = LEADIN_RE.match(text)
    if m:
        return text[m.end():].strip()
    return text.strip()


def format_passage(desc: str) -> str:
    """Turn a run-on figure_description into a clean Markdown passage."""
    text = ' '.join((desc or '').split())  # collapse whitespace / stray newlines
    body, source = split_source(text)
    title = extract_title(body)
    body = strip_leadin(body, title)

    parts = []
    if title:
        parts.append(f"**{title}**")
    if body:
        parts.append(body.strip())
    if source:
        parts.append(f"_{source.strip()}_")
    return '\n\n'.join(parts)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    write = '--write' in sys.argv or '-w' in sys.argv
    data = json.load(open(CATALOG_PATH, encoding='utf-8'))

    changed_exams = 0
    moved_passages = 0
    cleared_refs = 0
    report = []

    for exam in data:
        subject = exam.get('subject') or ''
        if not LANG_SUBJECT_RE.search(subject):
            continue

        exam_touched = False
        for sec in exam.get('sections', []) or []:
            stitle = sec.get('section_title') or ''
            if (sec.get('passage') or '').strip():
                continue  # already has a passage — leave it alone (idempotent)
            if not READING_SECTION_RE.search(stitle):
                continue

            questions = sec.get('questions') or []

            # Find the question holding the genuine prose passage.
            holder = None
            for q in questions:
                if q.get('has_figure') and is_prose_passage(q.get('figure_description') or ''):
                    holder = q
                    break
            if holder is None:
                continue

            raw = holder.get('figure_description') or ''
            passage = format_passage(raw)
            if len(passage) < 120:
                continue  # safety: never create a too-short passage

            sec['passage'] = passage
            holder['has_figure'] = False
            holder['figure_description'] = None
            moved_passages += 1
            exam_touched = True

            # Clear sibling "figures" that only reference the passage.
            sib_cleared = 0
            for q in questions:
                if q is holder:
                    continue
                if q.get('has_figure') and is_passage_reference(q.get('figure_description') or ''):
                    q['has_figure'] = False
                    q['figure_description'] = None
                    sib_cleared += 1
            cleared_refs += sib_cleared

            report.append({
                'exam_id': exam.get('exam_id'),
                'subject': subject,
                'section_title': stitle,
                'passage_chars': len(passage),
                'sibling_refs_cleared': sib_cleared,
                'passage_preview': passage[:160],
            })

        if exam_touched:
            changed_exams += 1

    print('=' * 78)
    print('FIX EMBEDDED PASSAGES', '(dry-run — pass --write to apply)' if not write else '(WRITING)')
    print('=' * 78)
    print(f"exams changed     : {changed_exams}")
    print(f"passages moved    : {moved_passages}")
    print(f"reference figs cleared: {cleared_refs}")
    print('-' * 78)
    for r in report:
        print(f"\n• {r['subject']} — {r['exam_id']}")
        print(f"  section: {r['section_title']}")
        print(f"  passage ({r['passage_chars']} ch), sibling refs cleared: {r['sibling_refs_cleared']}")
        print(f"  preview: {r['passage_preview']}…")

    if not report:
        print('Nothing to fix — all clean.')
        return

    if write:
        bak = CATALOG_PATH + '.bak'
        if not os.path.exists(bak):
            shutil.copy2(CATALOG_PATH, bak)  # raw copy of the original, pre-mutation
        # Match the catalog's canonical serialization (indent=2, UTF-8, trailing
        # newline) so the git diff is limited to the lines that actually changed.
        with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f"\n✓ Wrote {os.path.relpath(CATALOG_PATH, ROOT)} (backup: {os.path.relpath(bak, ROOT)})")
        print("  Next: node scripts/split_exam_catalog.mjs")
    else:
        print('\n(dry-run) re-run with --write to apply the changes above.')


if __name__ == '__main__':
    main()
