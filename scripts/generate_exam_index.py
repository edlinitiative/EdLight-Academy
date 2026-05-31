#!/usr/bin/env python3
"""
Generate a slim browse index from the full exam catalog.

The full `public/exam_catalog.json` (~27 MB) embeds every question of all 494
exams. The exam *browser* only needs per-exam metadata + a few precomputed
counts, so shipping the whole catalog just to render cards forces every visitor
to download ~27 MB.

This script writes `public/exam_catalog_index.json` (~310 KB) containing each
exam WITHOUT its `sections` payload, plus the precomputed fields that
`buildExamIndex()` would otherwise derive from `sections`:
  - _questionCount
  - _autoGradable
  - _typeCounts

Array order is preserved so legacy numeric-index routes still resolve against
the full catalog in ExamTake/ExamResults.

Run:  python3 scripts/generate_exam_index.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "exam_catalog.json")
OUT = os.path.join(ROOT, "public", "exam_catalog_index.json")

# Mirror of QUESTION_TYPE_META gradable flags in src/utils/examUtils.ts
GRADABLE_TYPES = {
    "multiple_choice",
    "multiple_select",
    "true_false",
    "fill_blank",
    "calculation",
    "short_answer",
}

# Heavy / server-only fields the browser never needs.
DROP_FIELDS = {"sections", "_api_usage", "_source_file"}


def count_questions(exam):
    """Replicate buildExamIndex() counting logic exactly."""
    q_count = 0
    auto_gradable = 0
    type_counts = {}
    for sec in exam.get("sections") or []:
        for q in sec.get("questions") or []:
            q_count += 1
            t = q.get("type") or "unknown"
            type_counts[t] = type_counts.get(t, 0) + 1
            is_gradable = t in GRADABLE_TYPES
            has_parts = bool(q.get("answer_parts"))
            if (is_gradable and q.get("correct")) or has_parts:
                auto_gradable += 1
    return q_count, auto_gradable, type_counts


def main():
    if not os.path.exists(SRC):
        print(f"ERROR: {SRC} not found", file=sys.stderr)
        return 1

    with open(SRC, encoding="utf-8") as f:
        catalog = json.load(f)

    if not isinstance(catalog, list):
        print("ERROR: expected a list catalog", file=sys.stderr)
        return 1

    slim = []
    for exam in catalog:
        q_count, auto_gradable, type_counts = count_questions(exam)
        entry = {k: v for k, v in exam.items() if k not in DROP_FIELDS}
        entry["_questionCount"] = q_count
        entry["_autoGradable"] = auto_gradable
        entry["_typeCounts"] = type_counts
        slim.append(entry)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))

    src_kb = os.path.getsize(SRC) / 1024
    out_kb = os.path.getsize(OUT) / 1024
    print(f"Wrote {OUT}")
    print(f"  exams: {len(slim)}")
    print(f"  full catalog: {src_kb/1024:.1f} MB  ->  index: {out_kb:.1f} KB"
          f"  ({src_kb/out_kb:.0f}x smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
