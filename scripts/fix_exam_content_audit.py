#!/usr/bin/env python3
"""
Fix exam content data-integrity defects found during the full audit.

Two defect classes are repaired (no subject-matter answers are fabricated):

  1. AI-REFUSAL ARTIFACTS
     Many reading-comprehension questions reference a source passage that was
     never digitized. Their answer/grading fields therefore contain AI refusals
     such as "Je ne peux pas répondre car le texte n'est pas fourni" or
     "Como no tengo el texto...". These would (a) be shown to students as a
     "model answer" and (b) be fed to the AI grader as the reference answer,
     penalising correct student work. We neutralise them: replace the refusal
     with a clean, language-appropriate note and drop the fake structured answers.

  2. PHRASE CONTAMINATION (Exam 3, items C.1–C.4)
     A sentence-transformation exercise was contaminated with phrases from a
     different sub-exercise ("of my generation", "of the same generation", ...).
     The source instructions for that sub-exercise are missing, so we cannot
     reconstruct the intended answer; we clear the contaminated grading material
     and flag the item for manual review.

The script is idempotent and prints a before/after summary.
"""

import json
import os
import re

CATALOG_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'exam_catalog.json')

# Phrases that indicate the AI could not answer (missing source text)
REFUSAL_RE = re.compile(
    r'(como no tengo|no tengo el texto'
    r"|i (do not|don't) have (the|access)"
    r"|i (cannot|can't) (answer|provide|complete|translate)"
    r'|as an ai'
    r"|je ne peux pas (répondre|compléter|traduire|fournir)"
    r'|sans le texte'
    r"|n'ayant pas (le |acc)"
    r'|impossible de (répondre|traduire)'
    r"|texte (n'est pas|non) (fourni|disponible|numéris)"
    r"|texte n'a pas été (fourni|numéris)"
    r'|texto no (fue|está) (proporcionado|disponible)'
    r'|i am unable|unable to (answer|provide)'
    r"|puisque le texte n'est pas|le texte n'étant pas"
    r'|need the text|besoin du texte|provide the text|veuillez fournir)',
    re.I,
)

# Exam-3 contamination tokens
GEN_RE = re.compile(r'\bof (my|the same|this|the younger|that|our|your) generation\b', re.I)

MISSING_PASSAGE_NOTE = {
    'en': 'Reference answer unavailable — this question refers to a reading text that was not digitized in the original exam. Answer based on the source text in your printed exam.',
    'fr': "Réponse de référence indisponible — cette question se réfère à un texte de lecture qui n'a pas été numérisé dans l'examen original. Répondez à partir du texte source de votre épreuve.",
    'es': 'Respuesta de referencia no disponible — esta pregunta se refiere a un texto de lectura que no fue digitalizado en el examen original. Responda según el texto fuente de su examen.',
}

REVIEW_NOTE = {
    'en': 'Reference answer pending review — the instructions for this exercise were incomplete in the source exam.',
    'fr': "Réponse de référence à vérifier — les consignes de cet exercice étaient incomplètes dans l'examen source.",
    'es': 'Respuesta de referencia por revisar — las instrucciones de este ejercicio estaban incompletas en el examen original.',
}


def is_refusal(v):
    return isinstance(v, str) and bool(REFUSAL_RE.search(v))


def note_lang(exam):
    subj = (exam.get('subject') or '').strip().lower()
    if subj.startswith('anglais'):
        return 'en'
    if subj.startswith('espagnol'):
        return 'es'
    lang = (exam.get('language') or '').strip().lower()
    if lang in ('en', 'fr', 'es'):
        return lang
    return 'fr'


def neutralize_question(q, note):
    """Strip refusal/contaminated grading material; install a clean note. Returns True if changed."""
    changed = False

    if is_refusal(q.get('model_answer')):
        q['model_answer'] = note
        changed = True

    if is_refusal(q.get('final_answer')):
        q['final_answer'] = None
        changed = True

    # scaffold_text that is itself a refusal → drop scaffolding entirely
    if is_refusal(q.get('scaffold_text')):
        q['scaffold_text'] = None
        q['scaffold_blanks'] = []
        changed = True

    # Drop refusal entries from structured answer arrays
    for arr_key in ('answer_parts', 'scaffold_blanks'):
        arr = q.get(arr_key)
        if isinstance(arr, list) and arr:
            kept = [p for p in arr if not is_refusal(p.get('answer'))]
            if len(kept) != len(arr):
                q[arr_key] = kept
                changed = True

    # If scaffold_blanks were emptied but scaffold_text still has placeholders,
    # the scaffold is now inconsistent → drop it so the item renders as plain text.
    st = q.get('scaffold_text')
    sb = q.get('scaffold_blanks') or []
    if isinstance(st, str) and st.count('{{') != len(sb):
        q['scaffold_text'] = None
        q['scaffold_blanks'] = []
        changed = True

    return changed


def main():
    data = json.load(open(CATALOG_PATH, encoding='utf-8'))

    refusal_qs = 0
    contam_qs = 0
    refusal_exams = set()

    for ei, exam in enumerate(data):
        lang = note_lang(exam)
        for si, sec in enumerate(exam.get('sections', []) or []):
            for q in sec.get('questions', []) or []:
                fields = [q.get('model_answer'), q.get('scaffold_text'), q.get('final_answer')]
                fields += [p.get('answer') for p in (q.get('answer_parts') or [])]
                fields += [p.get('answer') for p in (q.get('scaffold_blanks') or [])]

                if any(is_refusal(f) for f in fields):
                    if neutralize_question(q, MISSING_PASSAGE_NOTE[lang]):
                        refusal_qs += 1
                        refusal_exams.add(ei)

    # ── Exam 3 phrase contamination (items C.1–C.4) ──────────────────────────
    if len(data) > 3:
        exam = data[3]
        lang = note_lang(exam)
        for sec in exam.get('sections', []) or []:
            for q in sec.get('questions', []) or []:
                num = str(q.get('number'))
                if num in ('C.1', 'C.2', 'C.3', 'C.4'):
                    # All grading fields are contaminated with "of X generation"
                    fa = q.get('final_answer')
                    if GEN_RE.search(fa or '') or GEN_RE.search(q.get('model_answer') or ''):
                        q['model_answer'] = REVIEW_NOTE[lang]
                        q['final_answer'] = None
                        q['answer_parts'] = []
                        q['scaffold_text'] = None
                        q['scaffold_blanks'] = []
                        contam_qs += 1

    with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('Fix complete.')
    print(f'  AI-refusal questions neutralised : {refusal_qs} (across {len(refusal_exams)} exams)')
    print(f'  Exam-3 contaminated items fixed  : {contam_qs}')


if __name__ == '__main__':
    main()
