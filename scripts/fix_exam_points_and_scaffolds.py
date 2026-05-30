#!/usr/bin/env python3
"""
Round-2 exam content fixes (points + scaffold placeholders).

1. MISSING POINTS
   ~4,900 questions have no `points`. Per-question points act as grading
   weights (awarded = points * ratio) and feed the exam cover stats. We fill
   any missing value with the median points already used for that question
   type across the catalog, so relative weighting stays sensible:
       multiple_choice / true_false      -> small
       fill_blank / short_answer / matching -> medium
       essay / calculation               -> large
   For exams whose `total_points` is missing, we set it to the sum of the
   (now complete) question points so the cover stat is internally consistent.
   Exams that already declare total_points are left untouched.

2. SCAFFOLD PLACEHOLDER CORRUPTION (26 questions)
   A handful of scaffolds had placeholder markers mangled by stray LaTeX
   braces, e.g. `{{{{1}}}}` or `\frac{5U_n}{{{{{3}}}}U_n+5}`, producing
   out-of-range indices and leaking literal `{{` into the student-visible
   "solution text". We rewrite each placeholder run to a clean `{{k}}`
   (0-based, in appearance order) while PRESERVING the brace imbalance of the
   original token, which guarantees the surrounding LaTeX stays balanced.
   Grading is positional (scaffoldValues[i] -> answer_parts[i]) so indices
   only affect display; appearance order matches the dominant catalog
   convention (6,782 / 7,734 clean scaffolds).

Idempotent. Prints a before/after summary.
"""

import json
import os
import re
import statistics

CATALOG_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'exam_catalog.json')

# Fallback defaults if a type has no existing data to take a median from.
DEFAULT_POINTS = {
    'multiple_choice': 5,
    'multiple_select': 4,
    'true_false': 2,
    'fill_blank': 4,
    'short_answer': 5,
    'matching': 5,
    'calculation': 20,
    'essay': 15,
}

PLACEHOLDER = re.compile(r'\{\{(\d+)\}\}')
# A placeholder RUN: 2+ braces on BOTH sides around digits.
# This never matches single-brace LaTeX like `{3}` (e.g. \frac{5}{3}).
RUN = re.compile(r'\{{2,}\s*\d+\s*\}{2,}')


def compute_type_medians(data):
    buckets = {}
    for exam in data:
        for sec in exam.get('sections', []) or []:
            for q in sec.get('questions', []) or []:
                p = q.get('points')
                if isinstance(p, (int, float)) and p > 0:
                    buckets.setdefault(q.get('type'), []).append(p)
    medians = {}
    for t, vals in buckets.items():
        medians[t] = int(round(statistics.median(vals)))
    return medians


def fill_points(data, medians):
    filled_q = 0
    filled_totals = 0
    for exam in data:
        exam_has_questions = False
        running_total = 0
        for sec in exam.get('sections', []) or []:
            for q in sec.get('questions', []) or []:
                exam_has_questions = True
                p = q.get('points')
                if not isinstance(p, (int, float)) or p <= 0:
                    t = q.get('type')
                    p = medians.get(t) or DEFAULT_POINTS.get(t, 5)
                    q['points'] = p
                    filled_q += 1
                running_total += q['points']
        # Only set total_points when it is missing/zero.
        tp = exam.get('total_points')
        if exam_has_questions and (not isinstance(tp, (int, float)) or tp <= 0):
            exam['total_points'] = running_total
            filled_totals += 1
    return filled_q, filled_totals


def fix_scaffold_text(st):
    """Rewrite placeholder runs to clean {{k}} (appearance order), preserving
    each token's brace imbalance so surrounding LaTeX stays balanced."""
    counter = [0]

    def repl(m):
        tok = m.group(0)
        net = tok.count('{') - tok.count('}')
        idx = counter[0]
        counter[0] += 1
        core = '{{' + str(idx) + '}}'
        if net > 0:
            core = '{' * net + core
        elif net < 0:
            core = core + '}' * (-net)
        return core

    return RUN.sub(repl, st), counter[0]


def fix_scaffolds(data):
    fixed = 0
    for exam in data:
        for sec in exam.get('sections', []) or []:
            for q in sec.get('questions', []) or []:
                st = q.get('scaffold_text')
                sb = q.get('scaffold_blanks') or []
                if not isinstance(st, str) or not sb:
                    continue
                idxs = [int(x) for x in PLACEHOLDER.findall(st)]
                if not any(i >= len(sb) for i in idxs):
                    continue  # already well-formed

                bal_before = st.count('{') - st.count('}')
                new, cnt = fix_scaffold_text(st)
                bal_after = new.count('{') - new.count('}')
                new_idxs = [int(x) for x in PLACEHOLDER.findall(new)]

                # Safety gates — skip if anything looks off.
                if (cnt == len(sb)
                        and bal_before == bal_after
                        and len(new_idxs) == len(sb)
                        and all(i < len(sb) for i in new_idxs)):
                    q['scaffold_text'] = new
                    fixed += 1
    return fixed


def main():
    data = json.load(open(CATALOG_PATH, encoding='utf-8'))

    medians = compute_type_medians(data)
    filled_q, filled_totals = fill_points(data, medians)
    fixed_scaffolds = fix_scaffolds(data)

    with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('Round-2 fixes complete.')
    print(f'  Type medians used        : {medians}')
    print(f'  Question points filled   : {filled_q}')
    print(f'  Exam total_points filled : {filled_totals}')
    print(f'  Scaffolds repaired       : {fixed_scaffolds}')


if __name__ == '__main__':
    main()
