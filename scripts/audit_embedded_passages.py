#!/usr/bin/env python3
"""
Audit (read-only) reading passages that were mis-stored inside a question's
`figure_description` instead of the section-level `section.passage` field.

Two failure modes are detected, both of which render badly in ExamTake:

  1. EMBEDDED_PASSAGE   A question carries `has_figure: true` and a
                        `figure_description` that is really the comprehension
                        reading text (long, multi-sentence prose). The UI shows
                        it as a block *under question 1* instead of the shared
                        "Texte de référence" panel, and — because the prose has
                        no paragraph breaks — it renders as one unformatted
                        run-on line (title + body + source all jammed together).

  2. PASSAGE_REFERENCE  A sibling question carries `has_figure: true` whose
                        `figure_description` is not a figure at all but a
                        pointer back to the text, e.g.
                        "El texto de lectura ... proporcionado en la sección I-A."
                        These show an empty "Figure" card.

The classification mirrors src/components/FigureRenderer.tsx (classifyFigure +
looksLikeProse) so the audit matches exactly what the UI would render.

Read-only. Prints a human report and writes artifacts/embedded_passages_audit.json.
"""

import json
import os
import re
import glob
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), '..')
EXAMS_DIR = os.path.join(ROOT, 'public', 'exams')
ART_DIR = os.path.join(ROOT, 'artifacts')


# ─── Faithful port of FigureRenderer.classifyFigure ──────────────────────────
def classify_figure(desc: str) -> str:
    d = (desc or '').lower()

    if re.search(r'\btable(?:au)?\b', d) or re.search(r'colonnes?\b', d) or \
       re.search(r'\brignes?\b', d) or re.search(r'\brows?\b', d) or re.search(r'\bcolumns?\b', d):
        return 'table'
    if re.search(r'pile\s*(voltaïque|galvanique|électrochimique)|galvanic\s+cell|voltaic\s+cell|pile.*électrode', d):
        return 'chemistry'
    if re.search(r'fresnel|vecteurs?\s+tournants?', d):
        return 'diagram'
    if re.search(r'solénoïde|électro-?aimant', d) and not re.search(r'circuit', d):
        return 'diagram'
    if re.search(r'circuit|résistance|condensateur|capacit|bobine|voltmètre|ampèremètre|dipôle|générateur', d) or \
       re.search(r'\b(resistor|capacitor|inductor|lamp|battery|voltmeter)\b', d):
        return 'circuit'
    if re.search(r'graphique|courbe|axe\s+(horizontal|vertical)|diagramme\s+(à\s+|en\s+|de\s+)?(barres?|bâtons?|cercle|circulaire|secteurs?)|graphe\b', d) or \
       re.search(r'\b(graph|chart|plot|axis|curve)\b', d):
        return 'graph'
    if re.search(r'portée\s*musicale|musical\s+staff|clé\s+de\s+(sol|fa|ut)|treble\s+clef|bass\s+clef|mesures?\s+(contenant|de\s+musique)|accords?\s+(de|parfait|majeur|mineur)|notes?\s+(blanch|noir|croch|ronde|pointée)|quarter\s+note|eighth\s+note|whole\s+note|half\s+note|dièses?|bémols?|gamme|intervalle|solfège|partition|temps\s+signature|time\s+signature|\bstaff\b.*\bnotes?\b', d):
        return 'music'
    if re.search(r'benzène|cycle aromatique|molécule|formule (topologique|semi-développée|développée)|substitué|chaîne (principale|carbonée)|groupe\s+(fonctionnel|hydroxyl|amino|nitro|méthyl|éthyl|carbonyl|carboxyl|aldéhyd)|amine|carbonyle|carboxyle', d) or \
       re.search(r'\b(zigzag chain|carbon atoms?|functional groups?|chemical structure|organic|skeletal (structure|formula)|cyclohex)\b', d) or \
       re.search(r'\b(aldehyde|hydroxyl|amino|nitro|methyl|ethyl|carbonyl|carboxyl)\s+groups?\b', d):
        return 'chemistry'
    if re.search(r'pendule|triangle|rectangle|cercle|carré|parallélogramme|angle|repère orthonorm|vecteur|plan (cartésien|orthonormé)|géométri', d) or \
       re.search(r'concentri|rayon|diamètre|sommet', d):
        return 'geometry'
    if re.match(r'^\$[^$]+\$$', (desc or '').strip()) or re.search(r'équation|formule mathématique|expression algébrique', d):
        return 'equation'
    if re.search(r'photograph|painting|image montrant|photo|coupe histologique|anatomie|schéma.*(anatomique|biologique)', d):
        return 'image'
    if re.search(r'schéma|diagramme|représentation|figure', d):
        return 'diagram'
    return 'text'


# ─── Faithful port of FigureRenderer.looksLikeProse ──────────────────────────
def looks_like_prose(desc: str) -> bool:
    text = (desc or '').strip()
    if len(text) < 180:
        return False
    if len([w for w in re.split(r'\s+', text) if w]) < 35:
        return False
    if len(re.findall(r'[.!?…]', text)) < 2:
        return False
    if len(re.findall(r'\$', text)) >= 4:
        return False
    return True


# A short figure_description that merely points back at the reading text.
PASSAGE_REFERENCE_RE = re.compile(
    r"(texto de lectura|texte de lecture|reading (text|passage)|el texto|le texte|the text)"
    r"[^.]{0,80}"
    r"(proporcionad|fourni|provided|present[ée]|mencionad|de la secci[oó]n|dans la section"
    r"|in section|de la section|en la secci[oó]n|anteriormente|ci-dessus|above|previous)",
    re.I,
)

# Visual-artifact meta-language: a description that LEADS with one of these is a
# figure (image / table / diagram / staff / tree / chart), not a reading text.
# Multilingual (FR / EN / ES / Kreyòl) because the UI's classifyFigure keyword
# lists are FR-centric and therefore mis-classify many real figures as "text".
# Up to two adjectives may sit between the article and the visual noun
# ("A bronze sculpture", "A two-column table", "Une petite image").
VISUAL_META_RE = re.compile(
    r"^\W*"
    r"(?:une?|deux|trois|a|an|the|el|la|los|las|yon|des|de)?\s*"
    r"(?:[\wéèàçôî'-]+\s+){0,2}"
    r"(image|images|imaj|photo|photographie|photograph|figure|fig\.?|illustration|dessin|drawing"
    r"|tableau|table|tablo|grille|graphique|graph|chart|courbe|diagramme|diagram|arborescence"
    r"|arbre|tree|sch[ée]ma|sculpture|peinture|painting|portrait|carte|map|plan|portée|staff"
    r"|stave|partition|gamme|[ée]lectrophor[èe]se|histogramme|pyramide|frise|repère|reseau|r[ée]seau"
    r"|capture|screenshot|circle|cercle|wheel|grid|layout|list|liste"
    r"|repr[ée]sentation\s+graphique)\b",
    re.I,
)
# Anywhere a heavy concentration of visual meta-terms appears also signals a figure.
VISUAL_META_ANY_RE = re.compile(
    r"\b(portée|staff|clé\s+de\s+(sol|fa|ut)|treble\s+clef|whole\s+notes?|colonne|column|rows?|lignes?"
    r"|axe\s+des|vanishing\s+point|perspective|branches?\s+(du|de\s+l)|niveau\s+de\s+l'arbre)\b",
    re.I,
)
# Third-person "this is a picture/exercise of …" phrasing only ever describes a
# visual artifact or a layout exercise — never a comprehension reading text.
VISUAL_PHRASE_RE = re.compile(
    r"\b(to\s+be\s+matched|to\s+be\s+filled|fill\s+in\s+the|the\s+task\s+is\s+to"
    r"|colou?r\s+wheel|vanishing\s+point|labell?ed|depicting|depicts"
    r"|on\s+the\s+left\s+and|on\s+the\s+right|à\s+relier|à\s+remplir|à\s+compléter"
    r"|étiquetée?s?|représente\s+(un|une|le|la|les))\b",
    re.I,
)


def is_visual_figure(desc: str) -> bool:
    """True when the description is clearly describing a visual artifact."""
    text = (desc or '').strip()
    if not text:
        return False
    if VISUAL_META_RE.search(text):
        return True
    if VISUAL_PHRASE_RE.search(text):
        return True
    # Two or more distinct visual-meta hits anywhere → a figure, not prose.
    if len(set(m[0].lower() if isinstance(m, tuple) else m.lower()
               for m in VISUAL_META_ANY_RE.findall(text))) >= 2:
        return True
    return False

# Section is a reading-comprehension section.
READING_SECTION_RE = re.compile(
    r"(reading|comprehension|compr[ée]hension|lectura|comprensi[oó]n|lisez le texte"
    r"|read the (text|passage)|[ée]tude de texte)",
    re.I,
)


def is_prose_passage(desc: str) -> bool:
    """A figure_description the UI would render as a reading passage (prose)."""
    return classify_figure(desc) == 'text' and looks_like_prose(desc) and not is_visual_figure(desc)


def is_passage_reference(desc: str) -> bool:
    """A short figure_description that just points back at the passage."""
    text = (desc or '').strip()
    if not text or is_prose_passage(text):
        return False
    if len(text) > 320:
        return False
    return bool(PASSAGE_REFERENCE_RE.search(text))


def main():
    files = sorted(glob.glob(os.path.join(EXAMS_DIR, '*.json')))
    report = []
    totals = defaultdict(int)

    for path in files:
        try:
            exam = json.load(open(path, encoding='utf-8'))
        except Exception as e:  # noqa: BLE001
            print(f"!! could not read {path}: {e}")
            continue

        exam_id = exam.get('exam_id') or os.path.splitext(os.path.basename(path))[0]
        subject = exam.get('subject') or ''
        level = exam.get('level') or ''

        for sec_idx, sec in enumerate(exam.get('sections', []) or []):
            stitle = sec.get('section_title') or ''
            has_passage = bool((sec.get('passage') or '').strip())
            questions = sec.get('questions') or []

            embedded = []   # questions whose figure is really the passage
            refs = []       # questions whose figure just references the passage
            for qi, q in enumerate(questions):
                if not q.get('has_figure'):
                    continue
                desc = q.get('figure_description') or ''
                if not desc.strip():
                    continue
                if is_prose_passage(desc):
                    embedded.append((qi, q.get('number'), len(desc)))
                elif is_passage_reference(desc):
                    refs.append((qi, q.get('number'), desc.strip()[:80]))

            if not embedded and not refs:
                continue

            # Only an issue if the passage isn't already in section.passage.
            issue_kinds = []
            if embedded and not has_passage:
                issue_kinds.append('EMBEDDED_PASSAGE')
                totals['EMBEDDED_PASSAGE'] += 1
            if refs:
                issue_kinds.append('PASSAGE_REFERENCE')
                totals['PASSAGE_REFERENCE'] += len(refs)

            if not issue_kinds:
                continue

            totals['sections_affected'] += 1
            report.append({
                'exam_id': exam_id,
                'subject': subject,
                'level': level,
                'section_idx': sec_idx,
                'section_title': stitle,
                'reading_section': bool(READING_SECTION_RE.search(stitle)),
                'has_passage_already': has_passage,
                'issue_kinds': issue_kinds,
                'embedded_questions': [
                    {'q_index': qi, 'number': num, 'desc_len': dl} for qi, num, dl in embedded
                ],
                'reference_questions': [
                    {'q_index': qi, 'number': num, 'desc_preview': dp} for qi, num, dp in refs
                ],
            })

    report.sort(key=lambda r: (r['subject'], r['exam_id']))

    os.makedirs(ART_DIR, exist_ok=True)
    out_path = os.path.join(ART_DIR, 'embedded_passages_audit.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'totals': dict(totals), 'sections': report}, f, ensure_ascii=False, indent=2)

    # ── Human report ─────────────────────────────────────────────────────────
    print('=' * 78)
    print('EMBEDDED-PASSAGE AUDIT')
    print('=' * 78)
    print(f"Exams scanned          : {len(files)}")
    print(f"Sections affected      : {totals['sections_affected']}")
    print(f"  with EMBEDDED_PASSAGE: {totals['EMBEDDED_PASSAGE']}")
    print(f"  PASSAGE_REFERENCE figs: {totals['PASSAGE_REFERENCE']}")
    print('-' * 78)

    by_subject = defaultdict(int)
    for r in report:
        by_subject[r['subject']] += 1
    print('Affected sections by subject:')
    for subj, n in sorted(by_subject.items(), key=lambda kv: -kv[1]):
        print(f"  {n:3d}  {subj}")
    print('-' * 78)

    for r in report:
        kinds = ', '.join(r['issue_kinds'])
        print(f"\n[{kinds}] {r['subject']} ({r['level']}) — {r['exam_id']}")
        print(f"   section {r['section_idx']}: {r['section_title']}")
        for e in r['embedded_questions']:
            print(f"     • EMBEDDED passage in Q#{e['number']} (q_index {e['q_index']}, {e['desc_len']} chars)")
        for ref in r['reference_questions']:
            print(f"     • REF figure in Q#{ref['number']} (q_index {ref['q_index']}): {ref['desc_preview']}…")

    print('\nWrote', os.path.relpath(out_path, ROOT))


if __name__ == '__main__':
    main()
