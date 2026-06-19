#!/usr/bin/env python3
"""
Inject reconstructed reading-comprehension passages into the exam catalog.

Background
----------
A number of language exams (Anglais / Espagnol, mostly Bac + 9ème AF) are
reading-comprehension sections whose ORIGINAL source passage was never
digitized — it exists in no file in this repo and is not recoverable verbatim
from any accessible archive. Those sections currently show questions with no
text to read at all (see scripts/investigate_language_passages.py).

Because the catalog already stores a model_answer / final_answer for every
question, the *facts* each passage must contain are known. We therefore author
faithful, level-appropriate passages that are fully consistent with the
questions and their answer keys, so the comprehension exercises become usable.

These are clearly marked as reconstructed (NOT the verbatim official scan):
  section['passage']               = <authored text>
  section['passage_reconstructed'] = True

The UI renders a "Texte reconstitué" badge for transparency.

Content source of truth: scripts/reconstructed_passages.json
  { "<exam_id>": { "<section_index>": "<passage text>", ... }, ... }

This script is idempotent. After running it, re-split the catalog:
  node scripts/split_exam_catalog.mjs
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_PATH = os.path.join(ROOT, 'public', 'exam_catalog.json')
PASSAGES_PATH = os.path.join(ROOT, 'scripts', 'reconstructed_passages.json')


def main():
    if not os.path.exists(PASSAGES_PATH):
        print(f"ERROR: {PASSAGES_PATH} not found", file=sys.stderr)
        sys.exit(1)

    passages = json.load(open(PASSAGES_PATH, encoding='utf-8'))
    catalog = json.load(open(CATALOG_PATH, encoding='utf-8'))

    by_id = {}
    for exam in catalog:
        eid = exam.get('exam_id')
        if eid:
            by_id[eid] = exam

    applied = 0
    skipped_existing = 0
    cleared_missing = 0
    unflagged = 0
    warnings = []

    for eid, sec_map in passages.items():
        if eid.startswith('_'):
            continue  # metadata keys (e.g. "_comment") are not exam ids
        exam = by_id.get(eid)
        if not exam:
            warnings.append(f"exam_id not found in catalog: {eid}")
            continue
        sections = exam.get('sections') or []
        for sidx_str, text in sec_map.items():
            text = (text or '').strip()
            if not text:
                continue
            try:
                sidx = int(sidx_str)
            except ValueError:
                warnings.append(f"{eid}: non-integer section index {sidx_str!r}")
                continue
            if sidx < 0 or sidx >= len(sections):
                warnings.append(f"{eid}: section index {sidx} out of range "
                                f"(0..{len(sections) - 1})")
                continue
            sec = sections[sidx]

            existing = (sec.get('passage') or '').strip()
            if existing and not sec.get('passage_reconstructed'):
                # Never clobber an authentic, non-reconstructed passage.
                skipped_existing += 1
                warnings.append(f"{eid} §{sidx}: already has a non-reconstructed "
                                f"passage — skipped")
                continue

            sec['passage'] = text
            sec['passage_reconstructed'] = True
            # Now that a usable text exists, drop the "not digitized" flag.
            if sec.pop('passage_missing', None):
                cleared_missing += 1
            applied += 1

    # Sanity: count any language sections still lacking a passage is left to the
    # investigate script; here we just report what we changed.
    with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('Reconstructed-passage injection complete.')
    print(f'  Passages applied              : {applied}')
    print(f'  Stale passage_missing cleared : {cleared_missing}')
    print(f'  Skipped (authentic passage)   : {skipped_existing}')
    if warnings:
        print(f'  Warnings ({len(warnings)}):')
        for w in warnings:
            print(f'    - {w}')
    print('\nNext: node scripts/split_exam_catalog.mjs')


if __name__ == '__main__':
    main()
