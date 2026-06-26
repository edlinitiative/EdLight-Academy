#!/usr/bin/env python3
"""
fix_audit_track_a.py
---------------------------------------------------------------------------
Track A of the content-quality audit (scripts/audit_content_quality.mjs):
the SAFE, mechanical, non-translation fixes. Run against
public/exam_catalog.json (the source of truth); afterwards regenerate the
per-exam split with `node scripts/split_exam_catalog.mjs`.

Two transforms, both validated to be free of false positives:

1. CALC_AS_PROSE  -> short_answer
   Questions typed `calculation` whose only answer is plain prose
   ("Pas de réaction", "Question incomplète", Mendelian crosses like
   "RR et bb") are mis-typed: they show a "Calcul" badge + math keypad.
   Reclassify them to `short_answer`. The scaffold structure is driven by
   answer_parts/scaffold_blanks, not by `type`, so rendering is unaffected.

2. TOPIC truncation repair
   A parsing bug dropped the leading character of some section headers that
   leaked into the exam-level `topics[]` metadata (e.g. "IOLOGIE" instead of
   "BIOLOGIE", "nglais" instead of "Anglais"). Restore the dropped letter.
   This REPAIRS, never deletes — so legitimate all-caps topics (HISTOIRE,
   COMPETENCIA INTERPRETATIVA, LOC SANTÉ MENTALE) are left untouched and no
   exam is left without topics. Duplicates created by a repair are collapsed.

The script is idempotent: running it twice produces no further changes.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "public" / "exam_catalog.json"

# --- 1. CALC_AS_PROSE detection --------------------------------------------
_MATHY = re.compile(r"[=+\-×*/^√∑∫]|\\[a-zA-Z]+|\$")


def rep_answer(q: dict) -> str:
    cands: list[str] = []
    if isinstance(q.get("answer"), str):
        cands.append(q["answer"])
    if isinstance(q.get("correct_answer"), str):
        cands.append(q["correct_answer"])
    for p in q.get("answer_parts") or []:
        if p and isinstance(p.get("answer"), str):
            cands.append(p["answer"])
    for b in q.get("scaffold_blanks") or []:
        if b and isinstance(b.get("answer"), str):
            cands.append(b["answer"])
    return " ".join(cands).strip()


def is_prose(s: str) -> bool:
    if not s:
        return False
    if re.search(r"\d", s):
        return False
    if _MATHY.search(s):
        return False
    letters = len(re.sub(r"[^A-Za-zÀ-ÿ]", "", s))
    words = len([w for w in s.split() if w])
    return letters >= 15 and words >= 3


# --- 2. Topic truncation repair --------------------------------------------
TRUNCATIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^IOLOGIE\b"), "BIOLOGIE"),
    (re.compile(r"^HIMIE\b"), "CHIMIE"),
    (re.compile(r"^NATOMIE\b"), "ANATOMIE"),
    (re.compile(r"^ONNAISSANCES\b"), "CONNAISSANCES"),
    (re.compile(r"^ONCOURS\b"), "CONCOURS"),
    (re.compile(r"^ISSERTATION\b"), "DISSERTATION"),
    (re.compile(r"^nglais\b"), "Anglais"),
    (re.compile(r"^S DE COURS\b"), "QUESTIONS DE COURS"),
]


def repair_topic(s: str) -> tuple[str, bool]:
    if not isinstance(s, str):
        return s, False
    for rx, rep in TRUNCATIONS:
        if rx.search(s):
            return rx.sub(rep, s, count=1), True
    return s, False


def main() -> int:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))

    calc_fixed = 0
    topic_fixed = 0
    dupes_removed = 0

    for exam in data:
        # 1. calc -> short_answer
        for section in exam.get("sections") or []:
            for q in section.get("questions") or []:
                if q.get("type") == "calculation" and is_prose(rep_answer(q)):
                    q["type"] = "short_answer"
                    calc_fixed += 1

        # 2. topic truncation repair (+ de-dup, order preserving)
        topics = exam.get("topics")
        if isinstance(topics, list) and topics:
            new_topics: list = []
            seen: set = set()
            changed = False
            for t in topics:
                fixed, did = repair_topic(t)
                if did:
                    topic_fixed += 1
                    changed = True
                key = fixed if isinstance(fixed, str) else id(fixed)
                if key in seen:
                    dupes_removed += 1
                    changed = True
                    continue
                seen.add(key)
                new_topics.append(fixed)
            if changed:
                exam["topics"] = new_topics

    print(f"CALC_AS_PROSE reclassified (calculation -> short_answer): {calc_fixed}")
    print(f"Topic truncations repaired:                              {topic_fixed}")
    print(f"Duplicate topics collapsed after repair:                 {dupes_removed}")

    # Safety asserts so an unexpected match count fails loudly.
    if calc_fixed not in (0, 19):
        print(f"!! Unexpected CALC count {calc_fixed} (expected 19) — aborting.", file=sys.stderr)
        return 1

    CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {CATALOG.relative_to(CATALOG.parents[1])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
