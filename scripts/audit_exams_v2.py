#!/usr/bin/env python3
"""
Comprehensive parallel audit v2 of every exam in exam_catalog.json.

Checks:
  1. STRUCTURE     – section/question completeness, numbering, exam metadata
  2. INSTRUCTIONS  – missing or incoherent instructions, passage issues
  3. ANSWERS       – missing, malformed, mismatched correct answers
  4. AI_GRADING    – model_answer / scaffold quality for AI-graded Qs
  5. CONTENT       – embedded passages, suspicious text, encoding issues
  6. MATH          – broken LaTeX, unbalanced delimiters, malformed formulas
  7. LANGUAGE      – mixed language issues, encoding artifacts
  8. CONSISTENCY   – duplicate questions, numbering gaps, type mismatches
  9. GRADING_RISK  – questions likely to grade incorrectly at runtime

Runs in parallel using multiprocessing.
"""

import json, re, sys, os, time, math
from multiprocessing import Pool, cpu_count
from collections import Counter

CATALOG_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'exam_catalog.json')

# ── Severity ─────────────────────────────────────────────────────────────────
SEV_CRITICAL = 'CRITICAL'
SEV_HIGH     = 'HIGH'
SEV_MEDIUM   = 'MEDIUM'
SEV_LOW      = 'LOW'
SEV_INFO     = 'INFO'

VALID_TYPES = {
    'multiple_choice', 'multiple_select', 'true_false', 'fill_blank',
    'calculation', 'short_answer', 'essay', 'matching',
}

GRADABLE_TYPES = {'multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'calculation'}
AI_GRADED_TYPES = {'essay', 'short_answer'}

# ── Helpers ──────────────────────────────────────────────────────────────────
def blank_or_none(val):
    return val is None or (isinstance(val, str) and not val.strip())

def normalize(s):
    if not s: return ''
    return re.sub(r'\s+', ' ', s.strip().lower())

def check_latex_balance(text):
    """Check for unbalanced LaTeX delimiters. Returns list of issues."""
    if not text: return []
    issues = []
    # Check $...$ (inline math)
    single_dollars = [m.start() for m in re.finditer(r'(?<!\$)\$(?!\$)', text)]
    if len(single_dollars) % 2 != 0:
        issues.append('Odd number of $ delimiters (unbalanced inline math)')
    # Check $$...$$ (display math)
    double_dollars = [m.start() for m in re.finditer(r'\$\$', text)]
    if len(double_dollars) % 2 != 0:
        issues.append('Odd number of $$ delimiters (unbalanced display math)')
    # Check \(...\) and \[...\]
    paren_opens = len(re.findall(r'(?<!\\)\\\(', text))
    paren_closes = len(re.findall(r'(?<!\\)\\\)', text))
    if paren_opens != paren_closes:
        issues.append(f'Unbalanced \\(...\\): {paren_opens} opens, {paren_closes} closes')
    bracket_opens = len(re.findall(r'(?<!\\)\\\[', text))
    bracket_closes = len(re.findall(r'(?<!\\)\\\]', text))
    if bracket_opens != bracket_closes:
        issues.append(f'Unbalanced \\[...\\]: {bracket_opens} opens, {bracket_closes} closes')
    # Check \begin{} \end{} balance
    begins = re.findall(r'\\begin\{(\w+)\}', text)
    ends = re.findall(r'\\end\{(\w+)\}', text)
    if sorted(begins) != sorted(ends):
        issues.append(f'Unbalanced \\begin/\\end: begins={begins}, ends={ends}')
    # Check for common broken LaTeX patterns
    # Only flag truly empty math (not adjacent expressions separated by newline)
    if re.search(r'\$[ \t]+\$', text):
        issues.append('Empty math expression ($ $)')
    if re.search(r'\\frac\s*\{[^}]*\}\s*$', text):
        issues.append('Incomplete \\frac (missing denominator)')
    if re.search(r'10\^\{-N\}', text):
        issues.append('Malformed exponent $10^{-N}$ — likely missing actual number')
    return issues

def check_encoding_issues(text):
    """Check for encoding artifacts and garbled characters."""
    if not text: return []
    issues = []
    # Common UTF-8 mojibake patterns
    if re.search(r'Ã©|Ã¨|Ã |Ã§|Ãª|Ã®|Ã´|Ã¹|Ã¢', text):
        issues.append('Mojibake detected (double-encoded UTF-8)')
    # Replacement character
    if '\ufffd' in text:
        issues.append('Unicode replacement character (�) found')
    # Null bytes
    if '\x00' in text:
        issues.append('Null byte found in text')
    # Control characters (except newline, tab)
    if re.search(r'[\x01-\x08\x0b\x0c\x0e-\x1f]', text):
        issues.append('Control characters found in text')
    return issues

def has_math(text):
    """Check if text contains math expressions."""
    if not text: return False
    return bool(re.search(r'\$.*?\$|\\frac|\\sqrt|\\begin|\\sum|\\int|\\times|\\div|\\pm', text))

def similarity_ratio(a, b):
    """Quick similarity check without importing difflib."""
    if not a or not b: return 0.0
    a, b = a[:200].lower(), b[:200].lower()
    if a == b: return 1.0
    # Simple Jaccard on character trigrams
    def trigrams(s):
        return set(s[i:i+3] for i in range(len(s)-2))
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb: return 0.0
    return len(ta & tb) / len(ta | tb)

# ── Per-exam audit function ──────────────────────────────────────────────────
def audit_exam(args):
    ei, exam = args
    issues = []
    eid = exam.get('exam_id', f'index-{ei}')
    etitle = (exam.get('exam_title') or '???')[:100]
    sections = exam.get('sections') or []

    def add(severity, category, message, section_idx=None, q_number=None):
        loc = ''
        if section_idx is not None: loc += f'S{section_idx}'
        if q_number is not None: loc += f'/Q{q_number}'
        issues.append({'severity': severity, 'category': category, 'location': loc, 'message': message})

    # ═══════════════════════════════════════════════════════════════════════
    #  EXAM-LEVEL CHECKS
    # ═══════════════════════════════════════════════════════════════════════

    if not sections:
        add(SEV_CRITICAL, 'STRUCTURE', 'Exam has no sections')
        return (ei, eid, etitle, issues)

    if not exam.get('exam_title'):
        add(SEV_HIGH, 'STRUCTURE', 'Missing exam_title')
    if not exam.get('subject'):
        add(SEV_MEDIUM, 'STRUCTURE', 'Missing subject field')
    if not exam.get('level'):
        add(SEV_MEDIUM, 'STRUCTURE', 'Missing level field')
    if not exam.get('exam_id'):
        add(SEV_HIGH, 'STRUCTURE', 'Missing exam id')

    # Check exam_title encoding
    for iss_msg in check_encoding_issues(exam.get('exam_title', '')):
        add(SEV_HIGH, 'LANGUAGE', f'exam_title: {iss_msg}')

    total_questions = 0
    all_q_texts = []  # For duplicate detection within exam

    # ═══════════════════════════════════════════════════════════════════════
    #  SECTION-LEVEL CHECKS
    # ═══════════════════════════════════════════════════════════════════════

    for si, sec in enumerate(sections):
        stitle = sec.get('section_title', '')
        instr = sec.get('instructions', '') or ''
        passage = sec.get('passage', '') or ''
        qs = sec.get('questions') or []

        if not stitle:
            add(SEV_LOW, 'STRUCTURE', 'Missing section_title', si)

        if not qs:
            add(SEV_HIGH, 'STRUCTURE', 'Section has no questions', si)
            continue

        # Instructions quality
        if not instr and not passage:
            add(SEV_LOW, 'INSTRUCTIONS', 'No instructions or passage for section', si)

        # "Read the text" with no passage
        read_text_kw = re.search(
            r'(read the text|lisez le texte|lire le texte|étude de texte)',
            (instr + ' ' + stitle), re.I
        )
        text_refs_in_qs = sum(
            1 for q in qs
            if re.search(r'\b(in the text|from the text|dans le texte|du texte|the passage|according to the text|d.après le texte|tèks la|nan tèks)\b',
                         q.get('question',''), re.I)
        )
        if read_text_kw and not passage and len(instr) < 300 and text_refs_in_qs > 0:
            # Check if instructions already have our "not digitized" note
            if 'pas été numérisé' not in instr and 'not digitized' not in instr:
                add(SEV_HIGH, 'INSTRUCTIONS',
                    f'Section references reading a text ({text_refs_in_qs} Qs cite it) but has no passage',
                    si)

        # Passage encoding/quality
        for iss_msg in check_encoding_issues(passage):
            add(SEV_HIGH, 'LANGUAGE', f'passage: {iss_msg}', si)
        for iss_msg in check_encoding_issues(instr):
            add(SEV_MEDIUM, 'LANGUAGE', f'instructions: {iss_msg}', si)

        # Passage LaTeX
        for iss_msg in check_latex_balance(passage):
            add(SEV_MEDIUM, 'MATH', f'passage: {iss_msg}', si)

        # ═══════════════════════════════════════════════════════════════════
        #  QUESTION-LEVEL CHECKS
        # ═══════════════════════════════════════════════════════════════════

        seen_numbers = set()
        for qi, q in enumerate(qs):
            total_questions += 1
            qnum = q.get('number', f'{qi}')
            qtype = q.get('type', '')
            qtext = q.get('question', '') or ''
            correct = q.get('correct')
            options = q.get('options')
            points = q.get('points')
            model_answer = q.get('model_answer', '') or ''
            scaffold_text = q.get('scaffold_text', '') or ''
            scaffold_blanks = q.get('scaffold_blanks') or []
            answer_parts = q.get('answer_parts') or []
            hints = q.get('hints') or []
            explanation = q.get('explanation', '') or ''
            alternatives = q.get('alternatives') or []

            # Collect for duplicate detection
            all_q_texts.append((si, qnum, qtype, normalize(qtext)[:120]))

            # ── 1. Type validation ───────────────────────────────────────
            if qtype not in VALID_TYPES:
                add(SEV_HIGH, 'STRUCTURE', f'Unknown question type: "{qtype}"', si, qnum)

            # ── 2. Empty question text ───────────────────────────────────
            if blank_or_none(qtext):
                add(SEV_CRITICAL, 'STRUCTURE', 'Empty question text', si, qnum)
                continue

            # ── 3. Duplicate question number ─────────────────────────────
            qnum_str = str(qnum)
            if qnum_str in seen_numbers:
                add(SEV_MEDIUM, 'CONSISTENCY', f'Duplicate question number "{qnum}" in section', si, qnum)
            seen_numbers.add(qnum_str)

            # ── 4. Points ────────────────────────────────────────────────
            if points is None or points == 0:
                add(SEV_LOW, 'STRUCTURE', 'Missing or zero points', si, qnum)

            # ── 5. ENCODING checks ───────────────────────────────────────
            for field_name, field_val in [('question', qtext), ('explanation', explanation),
                                           ('model_answer', model_answer)]:
                for iss_msg in check_encoding_issues(field_val):
                    add(SEV_HIGH, 'LANGUAGE', f'{field_name}: {iss_msg}', si, qnum)

            # ── 6. MATH / LaTeX checks ───────────────────────────────────
            for field_name, field_val in [('question', qtext), ('model_answer', model_answer),
                                           ('explanation', explanation)]:
                if has_math(field_val):
                    for iss_msg in check_latex_balance(field_val):
                        add(SEV_MEDIUM, 'MATH', f'{field_name}: {iss_msg}', si, qnum)

            # Check options for LaTeX issues
            if options and isinstance(options, dict):
                for key, val in options.items():
                    if val and has_math(str(val)):
                        for iss_msg in check_latex_balance(str(val)):
                            add(SEV_MEDIUM, 'MATH', f'option {key}: {iss_msg}', si, qnum)

            # ── 7. ANSWER checks by type ─────────────────────────────────

            if qtype == 'multiple_choice':
                if not options or not isinstance(options, dict):
                    add(SEV_CRITICAL, 'ANSWERS', 'MC question missing options object', si, qnum)
                elif len(options) < 2:
                    add(SEV_HIGH, 'ANSWERS', f'MC question has only {len(options)} option(s)', si, qnum)
                else:
                    if blank_or_none(correct):
                        add(SEV_CRITICAL, 'ANSWERS', 'MC question missing correct answer', si, qnum)
                    elif str(correct).strip().lower() not in [k.lower() for k in options.keys()]:
                        add(SEV_CRITICAL, 'ANSWERS',
                            f'MC correct="{correct}" not in options keys {list(options.keys())}', si, qnum)
                    else:
                        # Verify correct option value isn't empty
                        correct_key = str(correct).strip().lower()
                        for k, v in options.items():
                            if k.lower() == correct_key and blank_or_none(v):
                                add(SEV_HIGH, 'ANSWERS', f'MC correct option "{k}" has empty value', si, qnum)

                    # Duplicate option values
                    vals = [normalize(v) for v in options.values() if v]
                    if len(vals) != len(set(vals)):
                        add(SEV_MEDIUM, 'ANSWERS', 'Duplicate MC option values', si, qnum)

                    # All options identical
                    if len(set(vals)) == 1 and len(vals) > 1:
                        add(SEV_HIGH, 'ANSWERS', 'All MC options are identical', si, qnum)

                    # Options with only 1 remaining after dedup
                    if len(set(vals)) == 1 and len(vals) > 1:
                        pass  # covered above

            elif qtype == 'multiple_select':
                if not options or not isinstance(options, dict):
                    add(SEV_CRITICAL, 'ANSWERS', 'Multi-select question missing options', si, qnum)
                if blank_or_none(correct) and not isinstance(correct, list):
                    add(SEV_CRITICAL, 'ANSWERS', 'Multi-select missing correct answer(s)', si, qnum)

            elif qtype == 'true_false':
                if blank_or_none(correct):
                    add(SEV_CRITICAL, 'ANSWERS', 'True/false missing correct answer', si, qnum)
                elif normalize(str(correct)) not in ('true', 'false', 'vrai', 'faux', 'a', 'b'):
                    add(SEV_MEDIUM, 'ANSWERS',
                        f'True/false correct="{correct}" is unusual', si, qnum)

            elif qtype == 'fill_blank':
                if blank_or_none(correct):
                    if not answer_parts and not scaffold_blanks:
                        add(SEV_HIGH, 'ANSWERS', 'Fill-blank missing correct answer', si, qnum)
                elif isinstance(correct, str) and len(correct) > 200:
                    add(SEV_MEDIUM, 'ANSWERS',
                        f'Fill-blank correct answer is suspiciously long ({len(correct)} chars)', si, qnum)

            elif qtype == 'calculation':
                if blank_or_none(correct):
                    if not answer_parts and not scaffold_blanks:
                        add(SEV_HIGH, 'ANSWERS', 'Calculation missing correct answer', si, qnum)

            elif qtype == 'short_answer':
                has_any_answer = (
                    not blank_or_none(correct) or
                    bool(model_answer) or
                    bool(answer_parts) or
                    bool(scaffold_blanks)
                )
                if not has_any_answer:
                    add(SEV_HIGH, 'ANSWERS',
                        'Short-answer has no correct, model_answer, answer_parts, or scaffold', si, qnum)

            elif qtype == 'essay':
                has_grading_material = (
                    bool(model_answer) or
                    bool(answer_parts) or
                    bool(scaffold_text and scaffold_blanks)
                )
                if not has_grading_material:
                    add(SEV_MEDIUM, 'AI_GRADING',
                        'Essay has no model_answer, answer_parts, or scaffold for AI grading', si, qnum)

            elif qtype == 'matching':
                if blank_or_none(correct) and not answer_parts:
                    add(SEV_MEDIUM, 'ANSWERS', 'Matching question has no correct answer', si, qnum)

            # ── 8. AI GRADING quality checks ─────────────────────────────
            if qtype in AI_GRADED_TYPES:
                if model_answer:
                    ma_stripped = model_answer.strip()
                    if len(ma_stripped) < 10:
                        add(SEV_MEDIUM, 'AI_GRADING',
                            f'model_answer is very short ({len(ma_stripped)} chars)', si, qnum)
                    # model_answer is just a copy of the question
                    q_norm = normalize(qtext)[:50]
                    ma_norm = normalize(model_answer)[:50]
                    if q_norm == ma_norm and len(model_answer) > 20:
                        # Check if MA adds content beyond Q
                        extra = model_answer.strip()[len(qtext.strip()):].strip()
                        if len(extra) < 15:
                            add(SEV_HIGH, 'AI_GRADING',
                                'model_answer is essentially a copy of the question with no real answer',
                                si, qnum)
                    # model_answer is a refusal / "cannot answer"
                    ma_low = model_answer.lower()
                    refusal_markers = [
                        'il est impossible de', "je ne peux pas", "cannot answer",
                        "no correct answer", "mwen pa ka reponn", "aucune des options",
                        "impossible de déterminer", "information fournie est insuffisante"
                    ]
                    if any(marker in ma_low for marker in refusal_markers):
                        add(SEV_MEDIUM, 'AI_GRADING',
                            'model_answer indicates inability to answer (may be bad for grading)',
                            si, qnum)

                # Scaffold quality
                if scaffold_text:
                    blank_count = scaffold_text.count('{{')
                    if scaffold_blanks and len(scaffold_blanks) != blank_count:
                        add(SEV_HIGH, 'AI_GRADING',
                            f'Scaffold placeholder count ({blank_count}) != scaffold_blanks count ({len(scaffold_blanks)})',
                            si, qnum)
                    if not scaffold_blanks:
                        add(SEV_MEDIUM, 'AI_GRADING',
                            'Has scaffold_text but no scaffold_blanks', si, qnum)

                # answer_parts quality
                if answer_parts:
                    for pi, part in enumerate(answer_parts):
                        if not isinstance(part, dict):
                            add(SEV_HIGH, 'AI_GRADING',
                                f'answer_parts[{pi}] is not an object', si, qnum)
                            continue
                        if not part.get('answer'):
                            add(SEV_HIGH, 'AI_GRADING',
                                f'answer_parts[{pi}] has empty answer', si, qnum)
                        if not part.get('label'):
                            add(SEV_LOW, 'AI_GRADING',
                                f'answer_parts[{pi}] missing label', si, qnum)

            # ── 9. CONTENT quality checks ────────────────────────────────

            # Very long question text
            if len(qtext) > 1500 and qtype not in ('essay',):
                add(SEV_LOW, 'CONTENT',
                    f'Unusually long question text ({len(qtext)} chars)', si, qnum)

            # Inline passage markers
            if re.search(r'\(Based on the provided text:', qtext, re.I):
                add(SEV_CRITICAL, 'CONTENT',
                    'Still has inline "(Based on the provided text:...)"', si, qnum)

            # Placeholder / incomplete question
            if re.search(r'(?<!\w)(TODO|FIXME|XXX|PLACEHOLDER)(?!\w)', qtext):
                add(SEV_HIGH, 'CONTENT', 'Question contains placeholder text', si, qnum)

            # Question text that is just a number or very short
            if len(qtext.strip()) < 5 and qtype not in ('fill_blank',):
                add(SEV_HIGH, 'CONTENT',
                    f'Question text is extremely short ({len(qtext.strip())} chars): "{qtext.strip()}"',
                    si, qnum)

            # Empty / placeholder explanations
            if explanation:
                expl_low = explanation.strip().lower()
                if expl_low in ('n/a', 'na', '-', '.', 'none', 'no explanation'):
                    add(SEV_LOW, 'CONTENT', f'Explanation is placeholder: "{explanation.strip()}"', si, qnum)

            # Empty hints
            if hints:
                all_empty = all(
                    not h or (isinstance(h, str) and not h.strip())
                    for h in hints
                )
                if all_empty:
                    add(SEV_LOW, 'CONTENT', 'All hints are empty strings', si, qnum)

            # ── 10. GRADING RISK checks ──────────────────────────────────

            # Fill-blank with multi-value correct that contains commas (ambiguous)
            if qtype == 'fill_blank' and correct and isinstance(correct, str):
                if ',' in correct and not alternatives:
                    parts = [p.strip() for p in correct.split(',')]
                    if len(parts) > 1 and all(len(p) > 2 for p in parts):
                        add(SEV_LOW, 'GRADING_RISK',
                            f'Fill-blank correct has commas — may be multi-answer without alternatives field',
                            si, qnum)

            # MC where correct answer value is very similar to another option (confusing)
            if qtype == 'multiple_choice' and options and correct:
                correct_key = str(correct).strip().lower()
                correct_val = None
                for k, v in options.items():
                    if k.lower() == correct_key:
                        correct_val = normalize(v)
                        break
                if correct_val:
                    for k, v in options.items():
                        if k.lower() != correct_key and normalize(v):
                            sim = similarity_ratio(correct_val, normalize(v))
                            if sim > 0.85 and correct_val != normalize(v):
                                add(SEV_LOW, 'GRADING_RISK',
                                    f'Correct option very similar to option {k} (sim={sim:.2f})',
                                    si, qnum)
                                break

            # Calculation with non-numeric correct answer
            if qtype == 'calculation' and correct and isinstance(correct, str):
                cleaned = re.sub(r'[\s,$€%°]', '', str(correct))
                cleaned = re.sub(r'\\text\{[^}]*\}', '', cleaned)
                cleaned = re.sub(r'[a-zA-Z]{3,}', '', cleaned)  # strip unit words
                if cleaned and not re.search(r'[\d]', cleaned):
                    add(SEV_MEDIUM, 'GRADING_RISK',
                        f'Calculation correct answer has no digits: "{correct[:50]}"', si, qnum)

            # Short-answer with very long correct (should use model_answer for AI)
            if qtype == 'short_answer' and correct and isinstance(correct, str) and len(correct) > 500:
                add(SEV_LOW, 'ANSWERS',
                    f'Short-answer correct is very long ({len(correct)} chars)', si, qnum)

    # ── Cross-question duplicate detection ───────────────────────────────
    if len(all_q_texts) > 1:
        text_index = {}
        for si, qnum, qtype, ntext in all_q_texts:
            if ntext and len(ntext) > 20:
                key = ntext[:80]
                if key in text_index:
                    prev_si, prev_qnum = text_index[key]
                    # Only flag if same type (different types might be intentional)
                    add(SEV_LOW, 'CONSISTENCY',
                        f'Possible duplicate: S{si}/Q{qnum} matches S{prev_si}/Q{prev_qnum}',
                        si, qnum)
                else:
                    text_index[key] = (si, qnum)

    # Exam-level summary
    if total_questions == 0:
        add(SEV_CRITICAL, 'STRUCTURE', 'Exam has 0 total questions')

    return (ei, eid, etitle, issues)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    data = json.load(open(CATALOG_PATH))
    total_qs = sum(len(s.get('questions',[])) for e in data for s in e.get('sections',[]))
    print(f"Loaded {len(data)} exams, {total_qs} questions")

    work = [(i, exam) for i, exam in enumerate(data)]
    workers = min(cpu_count(), 8)
    print(f"Auditing with {workers} workers...\n")

    with Pool(workers) as pool:
        results = pool.map(audit_exam, work, chunksize=max(1, len(work) // (workers * 4)))

    elapsed = time.time() - t0

    # ── Aggregate results ────────────────────────────────────────────────
    all_issues = []
    exams_with_issues = 0
    sev_counts = Counter()
    cat_counts = Counter()

    for ei, eid, etitle, issues in results:
        if issues: exams_with_issues += 1
        for iss in issues:
            sev_counts[iss['severity']] += 1
            cat_counts[iss['category']] += 1
            all_issues.append({**iss, 'exam_idx': ei, 'exam_id': eid, 'exam_title': etitle})

    # ── Print summary ────────────────────────────────────────────────────
    print("=" * 80)
    print(f"AUDIT v2 COMPLETE — {elapsed:.1f}s — {len(data)} exams, {total_qs} Qs, {exams_with_issues} with issues")
    print("=" * 80)

    print(f"\nBy severity:")
    for sev in [SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW, SEV_INFO]:
        c = sev_counts.get(sev, 0)
        if c: print(f"  {sev:10s}: {c}")
    print(f"  {'TOTAL':10s}: {len(all_issues)}")

    print(f"\nBy category:")
    for cat, c in cat_counts.most_common():
        print(f"  {cat:15s}: {c}")

    # ── CRITICAL + HIGH ──────────────────────────────────────────────────
    crit_high = [i for i in all_issues if i['severity'] in (SEV_CRITICAL, SEV_HIGH)]
    if crit_high:
        print(f"\n{'='*80}")
        print(f"CRITICAL + HIGH issues ({len(crit_high)}):")
        print(f"{'='*80}")
        by_exam = {}
        for i in crit_high:
            by_exam.setdefault(i['exam_idx'], []).append(i)
        for eidx in sorted(by_exam.keys()):
            items = by_exam[eidx]
            print(f"\n  Exam {eidx}: {items[0]['exam_title'][:70]}")
            for it in items:
                print(f"    [{it['severity']:8s}] {it['location']:12s} {it['category']:15s} {it['message'][:95]}")

    # ── MEDIUM summary ───────────────────────────────────────────────────
    med = [i for i in all_issues if i['severity'] == SEV_MEDIUM]
    if med:
        print(f"\n{'='*80}")
        print(f"MEDIUM issues summary ({len(med)}):")
        print(f"{'='*80}")
        med_grouped = Counter()
        for i in med:
            msg = re.sub(r'\d+', 'N', i['message'][:70])
            med_grouped[(i['category'], msg)] += 1
        for (cat, msg), count in med_grouped.most_common(40):
            print(f"  {count:4d}x  [{cat}] {msg}")

    # ── LOW summary ──────────────────────────────────────────────────────
    low = [i for i in all_issues if i['severity'] == SEV_LOW]
    if low:
        print(f"\n{'='*80}")
        print(f"LOW issues summary ({len(low)}):")
        print(f"{'='*80}")
        low_grouped = Counter()
        for i in low:
            msg = re.sub(r'\d+', 'N', i['message'][:70])
            low_grouped[(i['category'], msg)] += 1
        for (cat, msg), count in low_grouped.most_common(20):
            print(f"  {count:4d}x  [{cat}] {msg}")

    # ── Write report ─────────────────────────────────────────────────────
    report_path = os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'exam_audit_report_v2.json')
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, 'w') as f:
        json.dump({
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'exams_total': len(data),
            'questions_total': total_qs,
            'exams_with_issues': exams_with_issues,
            'severity_counts': dict(sev_counts),
            'category_counts': dict(cat_counts),
            'issues': all_issues,
        }, f, indent=2, ensure_ascii=False)
    print(f"\nFull report saved to: {report_path}")


if __name__ == '__main__':
    main()
