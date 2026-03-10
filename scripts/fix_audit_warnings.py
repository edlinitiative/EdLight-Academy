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
  6. MCQ_LATEX_MATCH   — MCQ correct matched to option key via LaTeX-normalized text comparison
  7. MANUAL_REASON     — unanswerable questions (no correct, confirmed by model) get manual_reason field

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
    "mcq_latex_matched": 0,   # MCQ correct matched by LaTeX-normalized comparison
    "scaffold_truncated": 0,  # scaffold_blanks/answer_parts truncated
    "level_fixed":       0,   # level field inferred
    "manual_reason_set": 0,   # unanswerable questions flagged with manual_reason
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

PLACEHOLDER_RE = re.compile(r"\{\{\d+\}\}")

def placeholder_count(text):
    """Count {{N}} placeholders in scaffold_text."""
    return len(PLACEHOLDER_RE.findall(text or ""))

# ─── LaTeX text normalisation ─────────────────────────────────────────────────

_LATEX_STRIP_RE = re.compile(
    r"\\(?:text|mathrm|mathbf|mathit|textbf|operatorname)"
    r"\{([^}]*)\}",  # \text{N.m} → N.m
)
_LATEX_CMD_RE = re.compile(r"\\(?:times|cdot|Omega|ohm|mu|alpha|beta|pi|sqrt|frac|left|right|,|;|:| )")  # common commands → space
_LATEX_DOLLAR_RE = re.compile(r"\$+")  # strip $ delimiters
_MULTI_SPACE_RE = re.compile(r"\s+")

def strip_latex(text):
    """Normalise LaTeX-rich text to plain for fuzzy comparison.

    Examples:
        '$5\\text{ nC}$'        → '5 nc'
        '$82.07 \\Omega$'       → '82.07'
        '$1.25 \\times 10^{-4}$' → '1.25 10 -4'
    """
    if not isinstance(text, str):
        return ""
    t = text
    t = _LATEX_STRIP_RE.sub(r"\1", t)   # unwrap \text{…}
    t = _LATEX_CMD_RE.sub(" ", t)       # drop known commands
    t = _LATEX_DOLLAR_RE.sub("", t)     # strip $
    t = t.replace("{", "").replace("}", "")  # leftover braces
    t = t.replace("^", " ").replace("_", " ")
    t = _MULTI_SPACE_RE.sub(" ", t).strip().lower()
    return t

# ─── Unanswerable-question detection ─────────────────────────────────────────

UNANSWERABLE_PATTERNS = re.compile(
    r"(?:"
    r"no correct answer|impossible (?:à|a|de) répondre|erreur dans|aucune des options"
    r"|no se puede responder|information insuffisante|mwen pa gen tèks"
    r"|cannot be determined|tout mo yo se non"
    r"|egzanp pou chak|fraz pou chak|dyagram pyebwa"
    r")",
    re.IGNORECASE,
)

def is_unanswerable(text):
    """Return True if text confirms there's no deterministic correct answer."""
    if not isinstance(text, str):
        return False
    return bool(UNANSWERABLE_PATTERNS.search(text))

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
    Fix 6: Try matching correct (answer text) to an option value via LaTeX-normalized
    comparison. If that succeeds, set correct to the matching key.

    Otherwise clear correct → manual grading.
    """
    correct = question.get("correct")
    options = question.get("options")

    if not correct or not isinstance(options, dict):
        return

    # Already a valid key → nothing to do
    if is_option_key(correct, options):
        return

    # --- Fix 6: LaTeX-normalised match ---
    correct_norm = strip_latex(correct)
    if correct_norm:
        for key, val in options.items():
            val_norm = strip_latex(val)
            if val_norm and (val_norm == correct_norm or correct_norm in val_norm or val_norm in correct_norm):
                question["correct"] = key
                stats["mcq_latex_matched"] += 1
                return

    # No match possible — clear it
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


# ─── Fix 7: mark unanswerable questions ──────────────────────────────────────

def mark_unanswerable(question):
    """Add a `manual_reason` field when the question is confirmed unanswerable.

    Conditions (all must hold):
      - correct is null (no valid answer)
      - type is one that the auditor flags (MCQ, TF, open auto-gradable)
      - final_answer or model_answer contain an unanswerable indicator phrase
      - manual_reason is not already set
    """
    if question.get("correct"):
        return  # has a valid answer — not unanswerable
    if question.get("manual_reason"):
        return  # already flagged

    # Only flag types that the auditor would raise a warning about
    flaggable = {"multiple_choice", "true_false", "short_answer", "fill_blank", "calculation"}
    if question.get("type") not in flaggable:
        return

    fa = (question.get("final_answer") or "").strip()
    ma = (question.get("model_answer") or "").strip()

    if is_unanswerable(fa) or is_unanswerable(ma):
        # Pick the shortest human-readable reason
        reason = fa if fa and len(fa) < 100 else (
            ma[:120] if ma else "No valid answer found during digitisation"
        )
        question["manual_reason"] = reason
        stats["manual_reason_set"] += 1


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
    # ── Fix 7b: Targeted manual_reason for confirmed unanswerable questions ──────
    targeted = [
        # Physics MCQs where computed answer doesn't match any option
        ("ex_adc71f5f-720e-4626-b7ac-b962cdefcab9", 0, 7,
         "Computed answer (5 nC) does not match any option (400/100/2√2/10 nC)"),
        ("ex_adc71f5f-720e-4626-b7ac-b962cdefcab9", 0, 9,
         "Computed answer (1.25e-4 N) does not match any option (malformed exponents)"),
        ("ex_adc71f5f-720e-4626-b7ac-b962cdefcab9", 0, 10,
         "Computed answer (82.07 Ω) does not match any option (20/99.6/21/10 Ω)"),
        ("ex_adc71f5f-720e-4626-b7ac-b962cdefcab9", 0, 12,
         "Computed answer (463.69) does not match any option (32√2 ≈ 45.25)"),
        # Compound MCQ with multi-part answer_parts — not auto-gradable as single MCQ
        ("ex_fa0f28a5-e811-48ff-91f9-b57fc3cf8fa1", 1, 1,
         "Compound question with multiple sub-answers; cannot auto-grade as single MCQ"),
        # True/false with no answer data at all
        ("ex_e1f6b8ba-9494-4394-b938-739b5d13c33e", 4, 3,
         "No answer data provided during digitisation"),
    ]
    for eid, si, qi, reason in targeted:
        if eid in by_id:
            _, exam = by_id[eid]
            secs = exam.get("sections") or []
            if si < len(secs):
                qs = secs[si].get("questions") or []
                if qi < len(qs):
                    q = qs[qi]
                    if not q.get("manual_reason"):
                        q["manual_reason"] = reason
                        stats["manual_reason_set"] += 1
                        print(f"  manual_reason set: {eid[:24]} §{si} q{qi}")
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

                # Mark unanswerable questions with manual_reason
                mark_unanswerable(q)

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
