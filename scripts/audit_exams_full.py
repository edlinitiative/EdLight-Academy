#!/usr/bin/env python3
"""
Comprehensive parallel audit of every exam in exam_catalog.json.

Checks:
  1. STRUCTURE   – section/question completeness
  2. INSTRUCTIONS – missing or incoherent instructions
  3. ANSWERS      – missing, malformed, or mismatched correct answers
  4. AI GRADING   – essay/short_answer with bad or missing model_answer / scaffold
  5. CONTENT      – suspicious question text patterns

Runs checks in parallel using multiprocessing.
"""

import json, re, sys, os, time
from multiprocessing import Pool, cpu_count
from collections import Counter

# ── Load data ────────────────────────────────────────────────────────────────
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

# Types that MUST have a correct answer to be auto-gradable
GRADABLE_TYPES = {'multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'calculation', 'short_answer'}

# Types that use AI grading and need model_answer or answer_parts
AI_GRADED_TYPES = {'essay', 'short_answer'}

# ── Helpers ──────────────────────────────────────────────────────────────────
def blank_or_none(val):
    return val is None or (isinstance(val, str) and not val.strip())

def normalize(s):
    if not s:
        return ''
    return re.sub(r'\s+', ' ', s.strip().lower())

# ── Per-exam audit function (runs in worker process) ─────────────────────────
def audit_exam(args):
    """Audit a single exam. Returns (exam_index, exam_id, exam_title, [issues])."""
    ei, exam = args
    issues = []
    eid = exam.get('id', f'index-{ei}')
    etitle = (exam.get('exam_title') or '???')[:100]
    sections = exam.get('sections') or []

    def add(severity, category, message, section_idx=None, q_number=None):
        loc = ''
        if section_idx is not None:
            loc += f'S{section_idx}'
        if q_number is not None:
            loc += f'/Q{q_number}'
        issues.append({
            'severity': severity,
            'category': category,
            'location': loc,
            'message': message,
        })

    # ── Exam-level checks ────────────────────────────────────────────────
    if not sections:
        add(SEV_CRITICAL, 'STRUCTURE', 'Exam has no sections')
        return (ei, eid, etitle, issues)

    if not exam.get('exam_title'):
        add(SEV_HIGH, 'STRUCTURE', 'Missing exam_title')

    if not exam.get('subject'):
        add(SEV_MEDIUM, 'STRUCTURE', 'Missing subject field')

    if not exam.get('level'):
        add(SEV_MEDIUM, 'STRUCTURE', 'Missing level field')

    total_questions = 0

    # ── Section-level checks ─────────────────────────────────────────────
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

        # Check for "read the text" with no passage
        read_text_kw = re.search(
            r'(read the text|lisez le texte|lire le texte|étude de texte)',
            (instr + ' ' + stitle), re.I
        )
        text_refs_in_qs = sum(
            1 for q in qs
            if re.search(r'\b(in the text|from the text|dans le texte|du texte|the passage|according to the text|d.après le texte)\b', q.get('question',''), re.I)
        )
        if read_text_kw and not passage and len(instr) < 300 and text_refs_in_qs > 0:
            add(SEV_HIGH, 'INSTRUCTIONS',
                f"Section references reading a text ({text_refs_in_qs} Qs cite it) but has no passage or long instructions",
                si)

        # ── Question-level checks ────────────────────────────────────────
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

            # ── 1. Type validation ───────────────────────────────────────
            if qtype not in VALID_TYPES:
                add(SEV_HIGH, 'STRUCTURE', f'Unknown question type: "{qtype}"', si, qnum)

            # ── 2. Empty question text ───────────────────────────────────
            if blank_or_none(qtext):
                add(SEV_CRITICAL, 'STRUCTURE', 'Empty question text', si, qnum)
                continue

            # ── 3. Points ────────────────────────────────────────────────
            if points is None or points == 0:
                add(SEV_LOW, 'STRUCTURE', 'Missing or zero points', si, qnum)

            # ── 4. ANSWER checks by type ─────────────────────────────────

            # -- multiple_choice --
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
                    # Check for duplicate option values
                    vals = [normalize(v) for v in options.values() if v]
                    if len(vals) != len(set(vals)):
                        add(SEV_MEDIUM, 'ANSWERS', 'Duplicate MC option values', si, qnum)

            # -- multiple_select --
            elif qtype == 'multiple_select':
                if not options or not isinstance(options, dict):
                    add(SEV_CRITICAL, 'ANSWERS', 'Multi-select question missing options', si, qnum)
                if blank_or_none(correct) and not isinstance(correct, list):
                    add(SEV_CRITICAL, 'ANSWERS', 'Multi-select missing correct answer(s)', si, qnum)

            # -- true_false --
            elif qtype == 'true_false':
                if blank_or_none(correct):
                    add(SEV_CRITICAL, 'ANSWERS', 'True/false missing correct answer', si, qnum)
                elif normalize(str(correct)) not in ('true', 'false', 'vrai', 'faux', 'a', 'b'):
                    add(SEV_MEDIUM, 'ANSWERS',
                        f'True/false correct="{correct}" is unusual', si, qnum)

            # -- fill_blank --
            elif qtype == 'fill_blank':
                if blank_or_none(correct):
                    # Check if there are answer_parts or scaffold_blanks as fallback
                    if not answer_parts and not scaffold_blanks:
                        add(SEV_HIGH, 'ANSWERS', 'Fill-blank missing correct answer', si, qnum)
                # Check if question actually has a blank placeholder
                if '______' not in qtext and '____' not in qtext and '{{' not in qtext and '...' not in qtext:
                    # Some fill blanks are phrased as open questions
                    pass

            # -- calculation --
            elif qtype == 'calculation':
                if blank_or_none(correct):
                    if not answer_parts and not scaffold_blanks:
                        add(SEV_HIGH, 'ANSWERS', 'Calculation missing correct answer', si, qnum)

            # -- short_answer --
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

            # -- essay --
            elif qtype == 'essay':
                has_grading_material = (
                    bool(model_answer) or
                    bool(answer_parts) or
                    bool(scaffold_text and scaffold_blanks)
                )
                if not has_grading_material:
                    add(SEV_MEDIUM, 'AI_GRADING',
                        'Essay has no model_answer, answer_parts, or scaffold for AI grading', si, qnum)

            # ── 5. AI GRADING quality checks ─────────────────────────────
            if qtype in AI_GRADED_TYPES:
                # Check model_answer quality
                if model_answer:
                    if len(model_answer.strip()) < 10:
                        add(SEV_MEDIUM, 'AI_GRADING',
                            f'model_answer is very short ({len(model_answer)} chars)', si, qnum)
                    # Check if model_answer is just the question repeated
                    if normalize(model_answer)[:50] == normalize(qtext)[:50] and len(model_answer) > 20:
                        add(SEV_HIGH, 'AI_GRADING',
                            'model_answer appears to be a copy of the question text', si, qnum)

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
                        if not part.get('answer'):
                            add(SEV_HIGH, 'AI_GRADING',
                                f'answer_parts[{pi}] has empty answer', si, qnum)
                        if not part.get('label'):
                            add(SEV_LOW, 'AI_GRADING',
                                f'answer_parts[{pi}] missing label', si, qnum)

            # ── 6. CONTENT quality checks ────────────────────────────────

            # Very long question text (may have embedded passage)
            if len(qtext) > 1000 and qtype not in ('essay',):
                add(SEV_LOW, 'CONTENT',
                    f'Unusually long question text ({len(qtext)} chars)', si, qnum)

            # Remaining inline passage markers
            if re.search(r'\(Based on the provided text:', qtext, re.I):
                add(SEV_CRITICAL, 'CONTENT',
                    'Still has inline "(Based on the provided text:...)"', si, qnum)

            # Empty hints
            if hints and all(not h or (isinstance(h, str) and not h.strip()) for h in hints):
                add(SEV_LOW, 'CONTENT', 'All hints are empty strings', si, qnum)

            # MC: correct answer references non-existent option
            # (already checked above more specifically)

            # Fill-blank: correct answer is abnormally long (may be a passage, not an answer)
            if qtype == 'fill_blank' and correct and isinstance(correct, str) and len(correct) > 200:
                add(SEV_MEDIUM, 'ANSWERS',
                    f'Fill-blank correct answer is suspiciously long ({len(correct)} chars)', si, qnum)

            # Short-answer: correct is extremely long (should probably be model_answer)
            if qtype == 'short_answer' and correct and isinstance(correct, str) and len(str(correct)) > 500:
                add(SEV_LOW, 'ANSWERS',
                    f'Short-answer correct field is very long ({len(str(correct))} chars) — consider model_answer', si, qnum)

            # Check for answer / correct mismatch with type
            if qtype == 'multiple_choice' and correct and options:
                key = str(correct).strip().lower()
                if key in options:
                    val = options[key]
                    if blank_or_none(val):
                        add(SEV_HIGH, 'ANSWERS', f'MC correct option "{key}" has empty value', si, qnum)

            # Matching questions: need structured answer
            if qtype == 'matching':
                if blank_or_none(correct) and not answer_parts:
                    add(SEV_MEDIUM, 'ANSWERS', 'Matching question has no correct answer or answer_parts', si, qnum)

    # Exam-level summary issues
    if total_questions == 0:
        add(SEV_CRITICAL, 'STRUCTURE', 'Exam has 0 total questions')

    return (ei, eid, etitle, issues)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    data = json.load(open(CATALOG_PATH))
    print(f"Loaded {len(data)} exams, {sum(len(s.get('questions',[])) for e in data for s in e.get('sections',[]))} questions")

    # Prepare work items
    work = [(i, exam) for i, exam in enumerate(data)]

    # Run in parallel
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
        if issues:
            exams_with_issues += 1
        for iss in issues:
            sev_counts[iss['severity']] += 1
            cat_counts[iss['category']] += 1
            all_issues.append({**iss, 'exam_idx': ei, 'exam_id': eid, 'exam_title': etitle})

    # ── Print summary ────────────────────────────────────────────────────
    print("=" * 80)
    print(f"AUDIT COMPLETE — {elapsed:.1f}s — {len(data)} exams, {exams_with_issues} with issues")
    print("=" * 80)
    print(f"\nBy severity:")
    for sev in [SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW, SEV_INFO]:
        c = sev_counts.get(sev, 0)
        if c:
            print(f"  {sev:10s}: {c}")
    print(f"  {'TOTAL':10s}: {len(all_issues)}")

    print(f"\nBy category:")
    for cat, c in cat_counts.most_common():
        print(f"  {cat:15s}: {c}")

    # ── Print CRITICAL + HIGH issues ─────────────────────────────────────
    crit_high = [i for i in all_issues if i['severity'] in (SEV_CRITICAL, SEV_HIGH)]
    if crit_high:
        print(f"\n{'='*80}")
        print(f"CRITICAL + HIGH issues ({len(crit_high)}):")
        print(f"{'='*80}")
        # Group by exam
        by_exam = {}
        for i in crit_high:
            key = i['exam_idx']
            by_exam.setdefault(key, []).append(i)
        for eidx in sorted(by_exam.keys()):
            items = by_exam[eidx]
            print(f"\n  [{items[0]['severity']}+] Exam {eidx}: {items[0]['exam_title'][:70]}")
            for it in items:
                print(f"    [{it['severity']:8s}] {it['location']:10s} {it['category']:15s} {it['message'][:100]}")

    # ── Print MEDIUM issues summary (grouped) ────────────────────────────
    med = [i for i in all_issues if i['severity'] == SEV_MEDIUM]
    if med:
        print(f"\n{'='*80}")
        print(f"MEDIUM issues summary ({len(med)}):")
        print(f"{'='*80}")
        med_grouped = Counter()
        for i in med:
            # Group by category + message pattern
            msg = re.sub(r'\d+', 'N', i['message'][:60])
            med_grouped[(i['category'], msg)] += 1
        for (cat, msg), count in med_grouped.most_common(30):
            print(f"  {count:4d}x  [{cat}] {msg}")

    # ── Write full report JSON ───────────────────────────────────────────
    report_path = os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'exam_audit_report.json')
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, 'w') as f:
        json.dump({
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'exams_total': len(data),
            'exams_with_issues': exams_with_issues,
            'severity_counts': dict(sev_counts),
            'category_counts': dict(cat_counts),
            'issues': all_issues,
        }, f, indent=2, ensure_ascii=False)
    print(f"\nFull report saved to: {report_path}")


if __name__ == '__main__':
    main()
