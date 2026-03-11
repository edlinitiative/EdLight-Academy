#!/usr/bin/env python3
"""
Fix CRITICAL, HIGH, and MEDIUM audit issues in exam_catalog.json.

Categories handled:
  CRITICAL: 21 MC/TF questions with missing correct answers
  HIGH: Passages embedded in Q1 (extract to section.passage)
  MEDIUM: Duplicate MC options, long fill_blank answers
"""

import json
import copy
import re
import sys

INPUT  = "public/exam_catalog.json"
OUTPUT = "public/exam_catalog.json"   # overwrite in-place

def load():
    with open(INPUT) as f:
        return json.load(f)

def save(data):
    with open(OUTPUT, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅  Saved {OUTPUT}")


# ── helpers ─────────────────────────────────────────────────────────────────
def find_q(section, number_str):
    """Find a question in a section by its 'number' field (string match)."""
    for i, q in enumerate(section.get("questions", [])):
        if str(q.get("number", "")) == number_str:
            return i, q
    return None, None

def convert_type(q, new_type, reason=""):
    """Change question type and remove MC-only fields if leaving MC."""
    old = q.get("type")
    q["type"] = new_type
    if new_type not in ("multiple_choice", "multiple_select"):
        q.pop("options", None)
    if reason:
        q["_fix_note"] = reason
    print(f"    converted {old} → {new_type}" + (f" ({reason})" if reason else ""))


# ═══════════════════════════════════════════════════════════════════════════
#  CRITICAL FIXES
# ═══════════════════════════════════════════════════════════════════════════

def fix_critical(data):
    changes = 0

    # ── Exam 1  S? Q10 ─────────────────────────────────────────────────
    # Options are verb forms but question asks about "hardly spent ______ money"
    # Explanation says correct answer is "any"
    e = data[1]
    for sec in e["sections"]:
        _, q = find_q(sec, "10")
        if q and q.get("type") == "multiple_choice" and "hardly spent" in (q.get("question") or ""):
            convert_type(q, "fill_blank", "options don't match question; answer is 'any'")
            q["correct"] = "any"
            changes += 1
            break

    # ── Exam 107 – Spanish exam with missing passage ───────────────────
    # QB: short_answer – already correct type, just missing passage
    # QB.2, QB.3: true_false – need passage to answer
    e = data[107]
    for sec in e["sections"]:
        for qnum in ["B.2", "B.3"]:
            _, q = find_q(sec, qnum)
            if q and q.get("type") == "true_false" and q.get("correct") is None:
                convert_type(q, "short_answer", "T/F needs missing reading passage; convert to AI-graded")
                if not q.get("model_answer"):
                    q["model_answer"] = q.get("explanation") or "Respuesta depende del texto que falta."
                changes += 1

    # ── Exam 209 – Kreyòl Q7 & Q8 ─────────────────────────────────────
    # Q7: asks to identify word types – all options are nouns – not really MC
    # Q8: writing exercise – write sentences for each figure of style
    e = data[209]
    for sec in e["sections"]:
        _, q7 = find_q(sec, "7")
        if q7 and q7.get("type") == "multiple_choice" and "nati mo" in (q7.get("question") or ""):
            convert_type(q7, "short_answer", "identifies word types for all options, not single-answer MC")
            if q7.get("model_answer"):
                pass  # already has: "a. Veritab: non\nb. fwi: non..."
            changes += 1

        _, q8 = find_q(sec, "8")
        if q8 and q8.get("type") == "multiple_choice" and "figi estil" in (q8.get("question") or ""):
            convert_type(q8, "essay", "writing exercise: create sentences for each figure of style")
            changes += 1

    # ── Exam 210 – Kreyòl Q5 (short_answer already), Q2 (writing MC) ──
    e = data[210]
    for sec in e["sections"]:
        _, q2 = find_q(sec, "2")
        if q2 and q2.get("type") == "multiple_choice" and "Anplwaye mo" in (q2.get("question") or ""):
            convert_type(q2, "essay", "writing exercise: use words in new contexts")
            changes += 1

    # ── Exam 226 – Kreyòl Q2 (write sentences for grammatical structures)
    e = data[226]
    for sec in e["sections"]:
        _, q2 = find_q(sec, "2")
        if q2 and q2.get("type") == "multiple_choice" and "estrikti" in (q2.get("question") or ""):
            convert_type(q2, "essay", "writing exercise: write sentences for grammatical structures")
            changes += 1

    # ── Exam 241 – Math MC Q4 (singular matrix) & Q5 (answer not in opts)
    e = data[241]
    for sec in e["sections"]:
        _, q4 = find_q(sec, "4")
        if q4 and q4.get("type") == "multiple_choice" and "matrice" in (q4.get("question") or "").lower():
            convert_type(q4, "short_answer", "matrix A is singular (det=0); no valid MC solution")
            changes += 1

        _, q5 = find_q(sec, "5")
        if q5 and q5.get("type") == "multiple_choice" and "e^{2x+1}" in (q5.get("question") or ""):
            convert_type(q5, "short_answer", "correct answer x = -1 ± √(ln 3) not in options")
            q5["correct"] = "x = -1 ± √(ln 3)"
            changes += 1

    # ── Exam 308 – Music Q1, Q3 (need musical figures not in data) ─────
    e = data[308]
    for sec in e["sections"]:
        _, q1 = find_q(sec, "1")
        if q1 and q1.get("type") == "multiple_choice" and "renversements" in (q1.get("question") or ""):
            convert_type(q1, "short_answer", "requires musical figure images not available in data")
            changes += 1

        _, q3 = find_q(sec, "3")
        if q3 and q3.get("type") == "multiple_choice" and "chiffrerait" in (q3.get("question") or ""):
            convert_type(q3, "short_answer", "requires musical figure images not available in data")
            changes += 1

    # ── Exam 336 – Arts T/F Q4 (compound multi-part T/F) ──────────────
    e = data[336]
    for sec in e["sections"]:
        _, q4 = find_q(sec, "4")
        if q4 and q4.get("type") == "true_false" and "vrai ou faux" in (q4.get("question") or "").lower():
            convert_type(q4, "short_answer", "compound T/F with multiple sub-parts (a,b,c)")
            q4["correct"] = "a) Vrai, b) Faux (couleur tertiaire, pas primaire), c) Vrai (achromatiques)"
            if not q4.get("model_answer") or len(q4.get("model_answer","")) < 20:
                q4["model_answer"] = (
                    "a) Vrai – Le jaune + bleu donne le vert, une couleur secondaire. "
                    "b) Faux – Orange + rouge donne le rouge-orangé, une couleur tertiaire (pas primaire). "
                    "c) Vrai – Le noir et le blanc sont des couleurs achromatiques (valeurs, pas teintes)."
                )
            changes += 1

    # ── Exam 337 – Kreyòl QA) Konpreyansyon 4 (needs text) ────────────
    e = data[337]
    for sec in e["sections"]:
        _, q = find_q(sec, "A) Konpreyansyon 4")
        if q and q.get("type") == "multiple_choice" and q.get("correct") is None:
            convert_type(q, "short_answer", "text classification requires reading the passage (missing)")
            changes += 1

    # ── Exam 349 – Physics Q1.a, Q1.c, Q2.a, Q2.c ────────────────────
    # All have calculated answers that don't match any MC option
    e = data[349]
    for sec in e["sections"]:
        for qnum, reason, correct in [
            ("1.a", "calculated 5 nC, not in options (400/100/10 nC)", "5 nC"),
            ("1.c", "option exponents malformed ($10^{-N}$); answer ≈ 1.25 × 10⁻⁴ N", "1.25 × 10⁻⁴ N"),
            ("2.a", "calculated Z ≈ 82.07 Ω, not in options (20/99.6/21/10 Ω)", "82.07 Ω"),
            ("2.c", "calculated U₀ ≈ 464 V, not matching option amplitudes", None),
        ]:
            _, q = find_q(sec, qnum)
            if q and q.get("type") == "multiple_choice" and q.get("correct") is None:
                convert_type(q, "short_answer", reason)
                if correct:
                    q["correct"] = correct
                changes += 1

    # ── Exam 351 – Medical Q19 (options about hernias, question about head trauma)
    e = data[351]
    for sec in e["sections"]:
        _, q19 = find_q(sec, "19")
        if q19 and q19.get("type") == "multiple_choice" and "impression clinique" in (q19.get("question") or ""):
            convert_type(q19, "short_answer", "options (hernias) don't match question context (head trauma)")
            q19["correct"] = "Traumatisme crânien avec possible fracture de la base du crâne"
            changes += 1

    # ── Exam 449 – Physics QIII.2.c (answer is 0, not in options) ─────
    e = data[449]
    for sec in e["sections"]:
        _, q = find_q(sec, "III.2.c")
        if q and q.get("type") == "multiple_choice" and q.get("correct") is None:
            convert_type(q, "short_answer", "at equilibrium the torque is 0; not among options")
            q["correct"] = "0 N·m"
            changes += 1

    return changes


# ═══════════════════════════════════════════════════════════════════════════
#  HIGH FIXES – Passage extraction
# ═══════════════════════════════════════════════════════════════════════════

def fix_passages(data):
    changes = 0

    # ── Exam 359 S1 – Freud passage in Q1 ─────────────────────────────
    e = data[359]
    sec = e["sections"][1]
    if not sec.get("passage"):
        qs = sec.get("questions", [])
        if qs:
            q1 = qs[0]
            txt = q1.get("question", "")
            # Split at the question part
            # Passage ends at "PUF 1967)" and question starts after that
            m = re.search(r'(PUF\s+1967\))\s*', txt)
            if m:
                passage = txt[:m.end()].strip()
                question = txt[m.end():].strip()
                sec["passage"] = passage
                q1["question"] = question
                print(f"  Exam 359 S1: extracted {len(passage)} char Freud passage")
                changes += 1

    # ── Exam 369 S1 – Descartes passage in Q1 ─────────────────────────
    e = data[369]
    sec = e["sections"][1]
    if not sec.get("passage"):
        qs = sec.get("questions", [])
        if qs:
            q1 = qs[0]
            txt = q1.get("question", "")
            # Split at "Question 1:"
            m = re.search(r'\n\s*Question\s+1\s*:', txt)
            if m:
                passage = txt[:m.start()].strip()
                question = txt[m.end():].strip()
                sec["passage"] = passage
                q1["question"] = question
                print(f"  Exam 369 S1: extracted {len(passage)} char Descartes passage")
                changes += 1

    # ── Exam 347 S0 – Two Énoncés with questions ──────────────────────
    # This section has 2 énoncés (short philosophical quotes) each followed by
    # related questions. These are short statement + analysis pairs.
    # Best fix: extract each Énoncé text and store as section.passage with both.
    e = data[347]
    sec = e["sections"][0]
    if not sec.get("passage"):
        qs = sec.get("questions", [])
        # Q1 has "Énoncé I: ..." and Q5 (second Q1) has "Énoncé II: ..."
        enonces = []
        for q in qs:
            qtxt = q.get("question", "")
            if qtxt.startswith("Énoncé"):
                enonces.append(qtxt)
        if len(enonces) == 2:
            # Combine both énoncés as the passage
            combined = enonces[0].strip() + "\n\n" + enonces[1].strip()
            sec["passage"] = combined
            # Now strip the énoncé text from the questions that contained them
            for q in qs:
                qtxt = q.get("question", "")
                if qtxt.startswith("Énoncé"):
                    # The Q may contain trailing question text after the quote
                    # Check if there's a question after the quote
                    # These are typically just the full énoncé with no trailing question
                    # The actual questions are Q2, Q3, Q4 (after each énoncé)
                    # Keep Q1 as a reference marker
                    q["question"] = qtxt.split(":")[0].strip() + " (voir le texte ci-dessus)"
            print(f"  Exam 347 S0: extracted 2 Énoncés ({len(combined)} chars)")
            changes += 1

    # ── Exam 392 S0 – Two Textes with questions ───────────────────────
    e = data[392]
    sec = e["sections"][0]
    if not sec.get("passage"):
        qs = sec.get("questions", [])
        textes = []
        for q in qs:
            qtxt = q.get("question", "")
            if qtxt.startswith("Texte"):
                textes.append(qtxt)
        if len(textes) == 2:
            combined = textes[0].strip() + "\n\n" + textes[1].strip()
            sec["passage"] = combined
            for q in qs:
                qtxt = q.get("question", "")
                if qtxt.startswith("Texte"):
                    label = qtxt.split(":")[0].strip()
                    q["question"] = label + " (voir le texte ci-dessus)"
            print(f"  Exam 392 S0: extracted 2 Textes ({len(combined)} chars)")
            changes += 1

    return changes


# ═══════════════════════════════════════════════════════════════════════════
#  MEDIUM FIXES
# ═══════════════════════════════════════════════════════════════════════════

def fix_medium(data):
    changes = 0

    # ── Duplicate MC options ──────────────────────────────────────────
    dupes = [
        # (exam_idx, section_idx, q_number, fix_action)
        # Exam 0 Q13: 'Interested in' vs 'interested in' – case dupe
        (0, None, "13", "case"),
        # Exam 18 Q7: a='friend\'s house' == c='friend\'s house'
        (18, None, "7", "remove_dup"),
        # Exam 71 Q9: a == d (both $$a^x \ln^{2x} x + C$$)
        (71, None, "9", "remove_dup"),
        # Exam 71 Q2: c='+IV' == d='+IV'
        (71, None, "2", "remove_dup"),
        # Exam 144 QA.1: b='pierda' == d='pierda'
        (144, None, "A.1", "remove_dup"),
        # Exam 144 QA.3: b='levantó' == d='levantó'
        (144, None, "A.3", "remove_dup"),
        # Exam 241 Q1 (S6): c='15000 Gdes' == d='15000 Gdes'
        (241, None, "1", "remove_dup"),
        # Exam 307 Q1: a="A writer's words" == b="A writer's words"
        (307, None, "1", "remove_dup"),
    ]

    for exam_idx, sec_idx, qnum, action in dupes:
        e = data[exam_idx]
        found = False
        sections = [e["sections"][sec_idx]] if sec_idx is not None else e["sections"]
        for sec in sections:
            _, q = find_q(sec, qnum)
            if q and q.get("type") == "multiple_choice" and q.get("options"):
                opts = q["options"]
                # Find duplicate values
                seen = {}
                to_remove = []
                for key, val in opts.items():
                    norm = val.strip().lower() if action == "case" else val.strip()
                    if norm in seen:
                        to_remove.append(key)
                    else:
                        seen[norm] = key

                if to_remove:
                    for key in to_remove:
                        del opts[key]
                    # If correct was one of the removed keys, update
                    if q.get("correct") in to_remove:
                        # Point to the remaining copy
                        for norm, remaining_key in seen.items():
                            if norm == (opts.get(q["correct"], "").strip().lower() if action == "case" else opts.get(q["correct"], "").strip()):
                                q["correct"] = remaining_key
                                break
                    print(f"  Exam {exam_idx} Q{qnum}: removed {len(to_remove)} duplicate option(s): {to_remove}")
                    changes += 1
                    found = True
                    break
        if not found:
            pass  # might have been in a different section

    # ── Long fill_blank correct answers → convert to short_answer ─────
    long_fb = [(32, "9"), (69, "7"), (88, "II"), (341, "2")]
    for exam_idx, qnum in long_fb:
        e = data[exam_idx]
        for sec in e["sections"]:
            _, q = find_q(sec, qnum)
            if q and q.get("type") == "fill_blank":
                correct = q.get("correct", "")
                if correct and len(correct) > 100:
                    convert_type(q, "short_answer", f"fill_blank correct too long ({len(correct)} chars)")
                    q["model_answer"] = correct
                    changes += 1
                    break

    return changes


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    data = load()
    print(f"Loaded {len(data)} exams\n")

    print("── CRITICAL fixes (broken MC/TF) ──")
    c1 = fix_critical(data)
    print(f"  → {c1} questions fixed\n")

    print("── HIGH fixes (passage extraction) ──")
    c2 = fix_passages(data)
    print(f"  → {c2} sections fixed\n")

    print("── MEDIUM fixes (duplicates, long fill_blank) ──")
    c3 = fix_medium(data)
    print(f"  → {c3} issues fixed\n")

    total = c1 + c2 + c3
    print(f"═══ TOTAL: {total} fixes applied ═══")

    if total > 0:
        save(data)
    else:
        print("No changes to save.")

if __name__ == "__main__":
    main()
