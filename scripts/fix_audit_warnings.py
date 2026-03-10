#!/usr/bin/env python3
"""
fix_audit_warnings.py
─────────────────────
Targeted deterministic fixes for the warnings that remain after running
fix_all_exams.py, add_tracks_to_exams.js, and format_exam_text.py.

Fixes applied (all deterministic, no AI):
  1. TF_OPTION_MAP     — true_false correct='a'/'b' where options={a:'Vrai',b:'Faux'} → 'vrai'/'faux'
  2. TF_CLEAR          — true_false correct is non-string or unanswerable long text → null
  3. MCQ_CLEAR         — MCQ correct is answer text not a key (unfixable by text match) → null
  4. SCAFFOLD_TRUNCATE — scaffold_blanks / answer_parts truncated to match {{N}} placeholder count
  5. LEVEL_FIX         — missing level field inferred from context

Usage:
  python3 scripts/fix_audit_warnings.py
  python3 scripts/fix_audit_warnings.py --dry-run
"""

import json
import re
import copy
import shutil
import sys

CATALOG_PATH = "public/exam_catalog.json"
BACKUP_PATH  = "public/exam_catalog.json.bak_warnings"
DRY_RUN      = "--dry-run" in sys.argv

# ─── Stats ────────────────────────────────────────────────────────────────────

stats = {
    "tf_option_map":     0,   # TF a/b → vrai/faux via options lookup
    "tf_cleared":        0,   # TF correct cleared (non-string or unanswerable)
    "mcq_cleared":       0,   # MCQ correct cleared (answer text, no option match)
    "scaffold_truncated": 0,  # scaffold_blanks/answer_parts truncated
    "level_fixed":       0,   # level field inferred
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

PLACEHOLDER_RE = re.compile(r"\{\{\d+\}\}")

def placeholder_count(text):
    """Count {{N}} placeholders in scaffold_text."""
    return len(PLACEHOLDER_RE.findall(text or ""))

# Patterns that indicate a true/false question cannot be answered (text acting as correct)
TF_UNANSWERABLE_PATTERNS = [
    r"no se puede responder",   # Spanish: can't be answered without text
    r"cannot be determined",
    r"impossible (à|a) déterminer",
    r"pas (de )?réponse",
    r"information insuffisante",
]
TF_UNANSWERABLE_RE = re.compile(
    "|".join(TF_UNANSWERABLE_PATTERNS), re.IGNORECASE
)

def is_unanswerable_tf(correct):
    """Return True if the correct value is clearly an unanswerable indicator."""
    if not isinstance(correct, str):
        return False
    return bool(TF_UNANSWERABLE_RE.search(correct))

def is_option_key(correct, options):
    """Return True if correct is already a valid option key."""
    if not isinstance(correct, str) or not isinstance(options, dict):
        return False
    return correct.lower().strip() in {k.lower() for k in options}

def options_are_vrai_faux(options):
    """
    Return True if the options dict maps a → 'Vrai' (or variant) and b → 'Faux'.
    Handles case-insensitive and accent variants.
    """
    if not isinstance(options, dict):
        return False
    vrai_keys = set()
    faux_keys = set()
    for k, v in options.items():
        vl = (v or "").strip().lower()
        if vl in ("vrai", "vrai.", "true", "v"):
            vrai_keys.add(k.lower())
        elif vl in ("faux", "faux.", "false", "f"):
            faux_keys.add(k.lower())
    return bool(vrai_keys) and bool(faux_keys), vrai_keys, faux_keys

# ─── Per-question fixers ──────────────────────────────────────────────────────

def fix_true_false(question):
    """
    Fix 1: map a/b correct to vrai/faux when options explicitly label them.
    Fix 2: clear correct when it's a non-string or long unanswerable text.
    """
    correct = question.get("correct")
    options = question.get("options")

    # Fix 1: options explicitly spell out Vrai/Faux
    result = options_are_vrai_faux(options)
    if isinstance(result, tuple) and result[0]:
        _, vrai_keys, faux_keys = result
        if isinstance(correct, str):
            ck = correct.lower().strip()
            if ck in vrai_keys:
                question["correct"] = "vrai"
                stats["tf_option_map"] += 1
                return
            elif ck in faux_keys:
                question["correct"] = "faux"
                stats["tf_option_map"] += 1
                return

    # Fix 2a: correct is not a string at all (e.g. accidentally set to the options dict)
    if not isinstance(correct, str):
        question["correct"] = None
        stats["tf_cleared"] += 1
        return

    # Fix 2b: correct is a long unanswerable message
    if is_unanswerable_tf(correct) or (len(correct) > 30 and correct.lower() not in
                                       {"vrai", "faux", "true", "false", "v", "f"}):
        question["correct"] = None
        stats["tf_cleared"] += 1


def fix_mcq_text_not_key(question):
    """
    Clear MCQ correct that is answer text instead of an option key and
    can't be mapped by fuzzy matching (already attempted by fix_all_exams.py).
    These are 'none of the above' or data-error situations.
    """
    correct = question.get("correct")
    options = question.get("options")

    if not correct or not isinstance(options, dict):
        return

    # Already a valid key → nothing to do
    if is_option_key(correct, options):
        return

    # clear it — grading will fall back to manual
    question["correct"] = None
    stats["mcq_cleared"] += 1


def fix_scaffold_mismatch(question):
    """
    Truncate scaffold_blanks (and answer_parts if present) to match the
    number of {{N}} placeholders in scaffold_text.
    The text template is authoritative — extra blanks beyond the placeholder
    count have no display slot and cannot be graded.
    """
    scaffold_text = question.get("scaffold_text", "")
    scaffold_blanks = question.get("scaffold_blanks")
    answer_parts = question.get("answer_parts")

    if not scaffold_text or not scaffold_blanks:
        return

    n_placeholders = placeholder_count(scaffold_text)
    if n_placeholders <= 0 or len(scaffold_blanks) <= n_placeholders:
        return  # no mismatch

    question["scaffold_blanks"] = scaffold_blanks[:n_placeholders]
    stats["scaffold_truncated"] += 1

    # Keep answer_parts in sync if it has the same original length
    if isinstance(answer_parts, list) and len(answer_parts) == len(scaffold_blanks):
        question["answer_parts"] = answer_parts[:n_placeholders]


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Loading exam catalog…")
    with open(CATALOG_PATH, encoding="utf-8") as f:
        data = json.load(f)
    print(f"  {len(data)} exams loaded")

    # Build index for targeted fixes
    by_id = {e.get("exam_id"): (i, e) for i, e in enumerate(data)}

    # ── Fix 5: MISSING_LEVEL ──────────────────────────────────────────────────
    # ex_718f9e7c: "ANNALES" / Français / 2007 / 20 sections
    # "Annales" is a collection of baccalauréat past exam questions.
    ex_missing_id = "ex_718f9e7c-da8c-4af0-9514-17a729c52e88"
    if ex_missing_id in by_id:
        _, exam = by_id[ex_missing_id]
        if not exam.get("level"):
            exam["level"] = "baccalaureat"
            stats["level_fixed"] += 1
            print(f"  Level fixed: {ex_missing_id}")

    # ── Iterate all questions ─────────────────────────────────────────────────
    for exam in data:
        for sec in exam.get("sections") or []:
            for q in sec.get("questions") or []:
                qtype = q.get("type")

                if qtype == "true_false":
                    fix_true_false(q)

                elif qtype == "multiple_choice":
                    fix_mcq_text_not_key(q)

                # Scaffold mismatch — applies to any type that has scaffold_text
                if q.get("scaffold_text") and q.get("scaffold_blanks"):
                    fix_scaffold_mismatch(q)

    # ── Report ────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("FIX REPORT")
    print("=" * 60)
    for key, val in sorted(stats.items()):
        if val > 0:
            print(f"  {key}: {val}")
    total = sum(stats.values())
    print(f"\n  Total changes: {total}")

    if DRY_RUN:
        print("\n🔍 DRY RUN — no changes written.")
        return

    # ── Backup + save ─────────────────────────────────────────────────────────
    print(f"\nBacking up to {BACKUP_PATH}…")
    shutil.copy2(CATALOG_PATH, BACKUP_PATH)

    print(f"Saving to {CATALOG_PATH}…")
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    size_mb = __import__("os").path.getsize(CATALOG_PATH) / 1024 / 1024
    print(f"  Saved ({size_mb:.1f} MB)")
    print("  Done ✓")


if __name__ == "__main__":
    main()
