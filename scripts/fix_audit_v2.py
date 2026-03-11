#!/usr/bin/env python3
"""Fix all actionable issues found by audit_exams_v2.py."""

import json
import re
import sys

CATALOG = "public/exam_catalog.json"

def main():
    with open(CATALOG, "r", encoding="utf-8") as f:
        exams = json.load(f)

    stats = {
        "control_chars_stripped": 0,
        "empty_math_cleaned": 0,
        "question_types_fixed": 0,
        "unbalanced_math_fixed": 0,
    }

    # Regex for control characters (keep \n, \r, \t)
    ctrl_re = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]')

    # Regex for truly empty math: $ $ where it's standalone (not between two expressions)
    # Pattern: $\s$ that is NOT preceded by closing content or followed by opening content
    empty_math_re = re.compile(r'\$\s+\$(?!\s*[\\a-zA-Z0-9({])')

    text_fields = [
        'question', 'model_answer', 'explanation', 'hint',
        'option_a', 'option_b', 'option_c', 'option_d'
    ]

    for eidx, exam in enumerate(exams):
        for si, sec in enumerate(exam.get('sections', [])):
            for qi, q in enumerate(sec.get('questions', [])):
                for field in text_fields:
                    val = q.get(field)
                    if not val or not isinstance(val, str):
                        continue

                    original = val

                    # 1. Strip control characters (form feeds, backspaces, etc.)
                    if ctrl_re.search(val):
                        # Replace form feed with newline, strip others
                        val = val.replace('\x0c', '\n')
                        val = ctrl_re.sub('', val)

                    q[field] = val
                    if val != original:
                        stats["control_chars_stripped"] += 1

    # Fix Exam 338 S0/Q5 — missing question_type (it's a short_answer about vodou heritage)
    e338 = exams[338]
    q5 = e338['sections'][0]['questions'][4]
    if not q5.get('question_type'):
        q5['question_type'] = 'short_answer'
        stats['question_types_fixed'] += 1
        print(f"  Fixed Exam 338 S0/Q5: set question_type=short_answer")

    # Fix any other questions missing question_type
    missing_type_count = 0
    for eidx, exam in enumerate(exams):
        for si, sec in enumerate(exam.get('sections', [])):
            for qi, q in enumerate(sec.get('questions', [])):
                if not q.get('question_type'):
                    # Try to infer type from structure
                    has_options = any(q.get(f'option_{x}') for x in 'abcd')
                    has_correct = q.get('correct_answer', '')
                    ma = q.get('model_answer', '')

                    if has_options:
                        q['question_type'] = 'multiple_choice'
                    elif has_correct and len(str(has_correct)) < 50:
                        q['question_type'] = 'short_answer'
                    elif ma and len(ma) > 200:
                        q['question_type'] = 'essay'
                    else:
                        q['question_type'] = 'short_answer'

                    missing_type_count += 1

    if missing_type_count > 0:
        stats['question_types_fixed'] += missing_type_count
        print(f"  Fixed {missing_type_count} questions with missing question_type")

    # Write back
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)

    print(f"\n=== FIX SUMMARY ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"\nSaved to {CATALOG}")


if __name__ == "__main__":
    main()
