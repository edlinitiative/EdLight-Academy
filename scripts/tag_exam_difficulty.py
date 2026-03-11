#!/usr/bin/env python3
"""
tag_exam_difficulty.py
─────────────────────
Enrich exam_catalog.json with two new fields per exam:
  • difficulty  (int 1-5)  — heuristic difficulty score
  • topics      (str[])    — extracted topic/theme tags from section titles & question content

Heuristics for difficulty scoring (each factor contributes a weighted sub-score):
  1. Level weight         — university > baccalauréat > 9ème AF
  2. Question-type mix    — essay/open weighted highest, TF/MCQ lowest
  3. Question count       — more questions ⇒ harder (time pressure)
  4. Answer complexity    — scaffold_blanks, answer_parts, approaches count
  5. Figure presence      — figures imply real-world / applied reasoning
  6. Text length          — long question stems signal multi-step reasoning

Topics are extracted by:
  1. Section titles (cleaned of boilerplate)
  2. Subject-specific keyword spotting in question text
  3. Deduplicated and title-cased

Usage:
    python scripts/tag_exam_difficulty.py [--dry-run]
"""

import json, re, sys, statistics
from pathlib import Path
from collections import Counter

CATALOG = Path(__file__).resolve().parent.parent / "public" / "exam_catalog.json"

# ── Question-type difficulty weights (0-1 scale) ────────────────────────────

QTYPE_WEIGHT = {
    "essay":        1.0,
    "open":         0.9,
    "calculation":  0.85,
    "scaffold":     0.7,
    "short_answer": 0.55,
    "mcq":          0.3,
    "true_false":   0.15,
}

# ── Level base scores ───────────────────────────────────────────────────────

LEVEL_BASE = {
    "universite":   0.8,
    "baccalaureat": 0.5,
    "9eme_af":      0.2,
}

# ── Topic extraction patterns per subject ───────────────────────────────────

TOPIC_PATTERNS = {
    "Chimie": [
        (r"\b(?:hydrocarbure|alcane|alc[eè]ne|alcyne|hydrocarbon)\b", "Hydrocarbures"),
        (r"\b(?:alcool|[ée]thanol|m[ée]thanol)\b", "Alcools"),
        (r"\b(?:acide|base|pH|neutralisation|titrage|titration)\b", "Acides & Bases"),
        (r"\b(?:oxydor[ée]duction|redox|oxydation|r[ée]duction)\b", "Oxydoréduction"),
        (r"\b(?:organique|carbone|fonctionnel|organic)\b", "Chimie organique"),
        (r"\b(?:mol[ée]cule|liaison|atomique|mol|mole)\b", "Structure moléculaire"),
        (r"\b(?:thermochimie|enthalpie|calorim[ée]trie|chaleur)\b", "Thermochimie"),
        (r"\b(?:cin[ée]tique|vitesse.*r[ée]action|rate)\b", "Cinétique chimique"),
        (r"\b(?:[ée]quilibre chimique|constante.*[ée]quilibre|Le\s*Chatelier)\b", "Équilibre chimique"),
        (r"\b(?:solution|concentration|diluition|solvant|solut[ée])\b", "Solutions"),
        (r"\b(?:macromol[ée]cule|polym[eè]re|polymer)\b", "Macromolécules"),
        (r"\b(?:ester|est[ée]rification|saponification)\b", "Esters"),
        (r"\b(?:gaz|loi.*gaz|pression|volume|Boyle|Charles|Gay-Lussac)\b", "Gaz"),
        (r"\b(?:[ée]lectrolyse|pile|[ée]lectrochimie|galvanique)\b", "Électrochimie"),
        (r"\b(?:ion|ionique|anion|cation)\b", "Ions"),
    ],
    "Physique": [
        (r"\b(?:onde|fr[ée]quence|longueur.*onde|wave|oscillation)\b", "Ondes"),
        (r"\b(?:[ée]lectricit[ée]|circuit|r[ée]sistance|courant|tension|ohm)\b", "Électricité"),
        (r"\b(?:optique|lentille|miroir|r[ée]fraction|r[ée]flexion|prisme)\b", "Optique"),
        (r"\b(?:m[ée]canique|force|Newton|acc[ée]l[ée]ration|vitesse|mouvement)\b", "Mécanique"),
        (r"\b(?:thermodynamique|chaleur|temp[ée]rature|entropie)\b", "Thermodynamique"),
        (r"\b(?:gravit[ée]|pesanteur|chute libre|projectile)\b", "Gravitation"),
        (r"\b(?:[ée]nergie|travail|puissance|cin[ée]tique|potentielle)\b", "Énergie"),
        (r"\b(?:magn[ée]tisme|champ.*magn[ée]tique|inductance|solénoïde)\b", "Magnétisme"),
        (r"\b(?:nucl[ée]aire|radioactiv|fission|fusion|isotope)\b", "Physique nucléaire"),
        (r"\b(?:fluide|Archim[eè]de|pression|hydrostatique)\b", "Fluides"),
    ],
    "Mathématiques": [
        (r"\b(?:d[ée]riv[ée]e|diff[ée]rentiation|tangente|derivative)\b", "Dérivées"),
        (r"\b(?:int[ée]grale|primitive|aire.*courbe|integration)\b", "Intégrales"),
        (r"\b(?:suite|s[ée]rie|arithm[ée]tique|g[ée]om[ée]trique|convergence)\b", "Suites & Séries"),
        (r"\b(?:probabilit[ée]|combinaison|permutation|d[ée]nombrement)\b", "Probabilités"),
        (r"\b(?:statistique|moyenne|[ée]cart[- ]type|m[ée]diane|variance)\b", "Statistiques"),
        (r"\b(?:matrice|d[ée]terminant|syst[eè]me.*lin[ée]aire)\b", "Algèbre linéaire"),
        (r"\b(?:trigonom[ée]tri|sinus|cosinus|tangente|sin|cos|tan)\b", "Trigonométrie"),
        (r"\b(?:logarithme|exponentielle|ln|log|exp)\b", "Fonctions exp/log"),
        (r"\b(?:complexe|imaginaire|module|argument)\b", "Nombres complexes"),
        (r"\b(?:g[ée]om[ée]trie|cercle|triangle|droite|plan|vecteur)\b", "Géométrie"),
        (r"\b(?:[ée]quation|in[ée]quation|polyn[oô]me|racine)\b", "Équations"),
        (r"\b(?:fonction|domaine|image|variation|extremum|limit[ée])\b", "Fonctions"),
        (r"\b(?:topographie|levé|azimut|coord)\b", "Topographie"),
    ],
    "SVT": [
        (r"\b(?:g[ée]n[ée]tique|ADN|ARN|chromosome|allèle|mutation|DNA|RNA)\b", "Génétique"),
        (r"\b(?:cellule|cytologie|mitose|m[ée]iose|membrane|organite)\b", "Cytologie"),
        (r"\b(?:anatomie|organe|syst[eè]me|muscle|squelette)\b", "Anatomie"),
        (r"\b(?:morphologie|forme|structure|tissu)\b", "Morphologie"),
        (r"\b(?:[ée]cologie|[ée]cosyst[eè]me|biodiversit|environnement)\b", "Écologie"),
        (r"\b(?:pal[ée]ontologie|fossile|[ée]volution|esp[eè]ce)\b", "Paléontologie"),
        (r"\b(?:microbiologie|bact[ée]rie|virus|infection|immunit[ée])\b", "Microbiologie"),
        (r"\b(?:g[ée]ologie|roche|minerai|tectonique|s[ée]isme|volcan)\b", "Géologie"),
        (r"\b(?:cardiaque|cœur|coeur|sang|circulation|pression\s*art[ée]rielle)\b", "Système cardiovasculaire"),
        (r"\b(?:respiration|poumon|ventilation|O2|CO2)\b", "Respiration"),
        (r"\b(?:digestion|estomac|intestin|enzyme|nutrition)\b", "Digestion"),
        (r"\b(?:reproduction|gamète|fécondation|embryon|grossesse)\b", "Reproduction"),
        (r"\b(?:histologie|tissu|épithélium|conjonctif)\b", "Histologie"),
        (r"\b(?:nerveux|neurone|synapse|cerveau|réflexe)\b", "Système nerveux"),
    ],
    "Philosophie": [
        (r"\b(?:esth[ée]tique|beau|art|sublime|goût)\b", "Esthétique"),
        (r"\b(?:logique|raisonnement|syllogisme|argument)\b", "Logique"),
        (r"\b(?:religion|dieu|foi|sacr[ée]|Dieu)\b", "Religion"),
        (r"\b(?:[ée]thique|morale|devoir|vertu|bien|mal)\b", "Éthique"),
        (r"\b(?:politique|[ée]tat|justice|libert[ée]|d[ée]mocratie|pouvoir)\b", "Philosophie politique"),
        (r"\b(?:connaissance|v[ée]rit[ée]|savoir|raison|science)\b", "Épistémologie"),
        (r"\b(?:existence|être|conscience|mort|absurde)\b", "Existentialisme"),
    ],
    "Français": [
        (r"\b(?:grammaire|syntaxe|accord|conjugaison|verbe)\b", "Grammaire"),
        (r"\b(?:compr[ée]hension|texte|lecture|passage|extrait)\b", "Compréhension de texte"),
        (r"\b(?:r[ée]daction|dissertation|essai|argumentation)\b", "Rédaction"),
        (r"\b(?:vocabulaire|synonyme|antonyme|lexique)\b", "Vocabulaire"),
        (r"\b(?:litt[ée]rature|po[èe]me|roman|auteur|œuvre)\b", "Littérature"),
        (r"\b(?:orthographe|dict[ée]e|accent)\b", "Orthographe"),
    ],
    "Anglais": [
        (r"\b(?:reading\s*comprehension|passage|text)\b", "Reading Comprehension"),
        (r"\b(?:grammar|tense|verb|adjective|adverb)\b", "Grammar"),
        (r"\b(?:vocabulary|synonym|antonym|word)\b", "Vocabulary"),
        (r"\b(?:essay|writing|composition|paragraph)\b", "Writing"),
        (r"\b(?:listening|spoken|oral|pronunciation)\b", "Listening & Speaking"),
    ],
    "Économie": [
        (r"\b(?:march[ée]|offre|demande|prix|[ée]quilibre)\b", "Marché"),
        (r"\b(?:PIB|croissance|inflation|chômage|d[ée]veloppement)\b", "Macroéconomie"),
        (r"\b(?:entreprise|production|coût|profit|b[ée]n[ée]fice)\b", "Microéconomie"),
        (r"\b(?:monnaie|banque|taux.*int[ée]rêt|cr[ée]dit)\b", "Monnaie & Finance"),
        (r"\b(?:commerce|import|export|[ée]change|international)\b", "Commerce international"),
        (r"\b(?:budget|fisc|impôt|taxe|d[ée]pense\s*publique)\b", "Finances publiques"),
    ],
    "Histoire-Géo": [
        (r"\b(?:r[ée]volution|ind[ée]pendance|colonisation|d[ée]colonisation)\b", "Révolutions & Indépendance"),
        (r"\b(?:guerre.*mondiale|WW|conflit\s*mondial)\b", "Guerres mondiales"),
        (r"\b(?:Ha[ïi]ti|Toussaint|Dessalines|Louverture)\b", "Histoire d'Haïti"),
        (r"\b(?:g[ée]ographie|climat|relief|population|urbanisation)\b", "Géographie"),
        (r"\b(?:Afrique|Europe|Am[ée]rique|Asie|continent)\b", "Géographie mondiale"),
        (r"\b(?:d[ée]mocratie|constitution|gouvernement|politique)\b", "Sciences politiques"),
    ],
}

# ── Section title boilerplate to strip ──────────────────────────────────────

SECTION_BOILERPLATE = re.compile(
    r"^(?:partie|section|exercice|probl[eè]me|question|item|num[ée]ro|"
    r"activit[ée]|[ée]preuve|test|examen|sujet|dossier|I{1,4}|[A-D]|"
    r"\d+)\s*[.:)\-–—]?\s*",
    re.IGNORECASE,
)

# Full section titles to suppress (exact lower match or startswith)
SECTION_TITLE_BLACKLIST = re.compile(
    r"^(?:premi[eè]re\s+partie|deuxi[eè]me\s+partie|troisi[eè]me\s+partie|"
    r"quatri[eè]me\s+partie|cinqui[eè]me\s+partie|sixi[eè]me\s+partie|"
    r"[ée]preuve\b|partie\s+[ivx]+|section\s+[ivx]+|partie\s+[a-d]|"
    r"uxième\s+partie|euxi[eè]me\s+partie|roisi[eè]me\s+partie)",
    re.IGNORECASE,
)

# ═══════════════════════════════════════════════════════════════════════════════

def compute_difficulty(exam):
    """Return a difficulty int 1-5 for a single exam."""
    questions = []
    for sec in exam.get("sections", []):
        questions.extend(sec.get("questions", []))

    n = len(questions)
    if n == 0:
        return 2  # default if empty

    # ─ Factor 1: Level base (0-1)
    level_raw = (exam.get("level") or "").strip().lower()
    f_level = LEVEL_BASE.get(level_raw, 0.5)

    # ─ Factor 2: Question-type complexity (weighted avg, 0-1)
    type_scores = []
    for q in questions:
        qt = (q.get("type") or "mcq").lower().strip()
        type_scores.append(QTYPE_WEIGHT.get(qt, 0.5))
    f_type = statistics.mean(type_scores) if type_scores else 0.5

    # ─ Factor 3: Question count pressure (0-1, sigmoid-ish)
    #   10 questions → ~0.3, 20 → ~0.5, 40+ → ~0.8
    f_count = min(1.0, n / 50)

    # ─ Factor 4: Answer complexity — scaffold blanks, answer_parts, approaches
    complexity_hits = 0
    for q in questions:
        blanks = q.get("scaffold_blanks")
        if blanks and len(blanks) > 0:
            complexity_hits += min(len(blanks), 5)
        parts = q.get("answer_parts")
        if parts and len(parts) > 0:
            complexity_hits += min(len(parts), 4)
        approaches = q.get("approaches")
        if approaches and len(approaches) > 0:
            complexity_hits += len(approaches)
    # Normalize: 0 hits → 0, 50+ → 1.0
    f_complexity = min(1.0, complexity_hits / (n * 3))

    # ─ Factor 5: Figure presence ratio (0-1)
    fig_count = sum(1 for q in questions if q.get("has_figure"))
    f_figures = min(1.0, fig_count / max(n, 1))

    # ─ Factor 6: Average question text length (0-1)
    text_lengths = [len(q.get("question") or "") for q in questions]
    avg_len = statistics.mean(text_lengths) if text_lengths else 50
    # 50 chars → ~0.2, 200 → ~0.5, 500+ → ~1.0
    f_text_len = min(1.0, avg_len / 500)

    # ─ Weighted combination ─────────────────────────────────────────────
    raw = (
        0.20 * f_level
        + 0.25 * f_type
        + 0.10 * f_count
        + 0.20 * f_complexity
        + 0.10 * f_figures
        + 0.15 * f_text_len
    )

    # Map 0-1 → 1-5 using stretched thresholds for better spread
    # Map 0-1 → 1-5 using data-driven percentile thresholds
    # P10≈0.47  P30≈0.52  P70≈0.58  P90≈0.63
    if raw < 0.47:
        score = 1
    elif raw < 0.52:
        score = 2
    elif raw < 0.58:
        score = 3
    elif raw < 0.63:
        score = 4
    else:
        score = 5
    return score, raw


def extract_topics(exam):
    """Return a deduplicated list of topic tags for the exam."""
    subject = (exam.get("subject") or "").strip()
    topics = set()

    # Gather all question text + section titles into one blob
    text_parts = []
    for sec in exam.get("sections", []):
        title = sec.get("section_title") or ""
        # Strip boilerplate from section title and use as topic
        clean_title = SECTION_BOILERPLATE.sub("", title).strip()
        clean_title = re.sub(r"^\s*[-–—:,.]+|[-–—:,.]+\s*$", "", clean_title).strip()
        if clean_title and len(clean_title) > 3:
            # Avoid duplicating the subject name
            if clean_title.lower().replace(" ", "") != subject.lower().replace(" ", ""):
                # Skip boilerplate section titles
                if not SECTION_TITLE_BLACKLIST.search(clean_title):
                    topics.add(clean_title[:80])  # cap length

        for q in sec.get("questions", []):
            text_parts.append(q.get("question") or "")
            text_parts.append(q.get("explanation") or "")
            text_parts.append(q.get("model_answer") or "")

    blob = " ".join(text_parts)

    # Pattern-match subject-specific topics
    patterns = TOPIC_PATTERNS.get(subject, [])
    for regex, tag in patterns:
        if re.search(regex, blob, re.IGNORECASE):
            topics.add(tag)

    # Deduplicate near-identical topics (case-insensitive)
    seen_lower = {}
    final = []
    for t in sorted(topics):
        key = t.lower().strip()
        if key not in seen_lower:
            seen_lower[key] = True
            final.append(t)

    return final[:15]  # cap at 15 topics


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"📂 Loading {CATALOG.name} …")
    with open(CATALOG, "r", encoding="utf-8") as f:
        exams = json.load(f)

    print(f"   {len(exams)} exams loaded")

    diff_dist = Counter()
    topic_counts = Counter()
    changed = 0
    raw_scores = []

    for exam in exams:
        difficulty, raw = compute_difficulty(exam)
        topics = extract_topics(exam)
        raw_scores.append(raw)

        # Track changes
        old_diff = exam.get("difficulty")
        old_topics = exam.get("topics")
        if old_diff != difficulty or old_topics != topics:
            changed += 1

        exam["difficulty"] = difficulty
        exam["topics"] = topics

        diff_dist[difficulty] += 1
        for t in topics:
            topic_counts[t] += 1

    # ── Summary ────────────────────────────────────────────────────────
    print("\n✅ Difficulty distribution:")
    for d in range(1, 6):
        bar = "█" * diff_dist.get(d, 0)
        pct = diff_dist.get(d, 0) / len(exams) * 100 if exams else 0
        labels = {1: "Very Easy", 2: "Easy", 3: "Medium", 4: "Hard", 5: "Very Hard"}
        print(f"   {d} ({labels[d]:>9s}): {diff_dist.get(d, 0):>4d}  ({pct:5.1f}%)  {bar}")

    print(f"\n📎 Unique topics: {len(topic_counts)}")
    print("   Top 20 topics:")
    for tag, count in topic_counts.most_common(20):
        print(f"   {count:>4d}  {tag}")

    # Exams with no topics
    no_topics = sum(1 for e in exams if not e.get("topics"))
    print(f"\n   Exams with no topics: {no_topics}")

    # Raw score percentiles for threshold tuning
    if raw_scores:
        raw_scores.sort()
        for p in [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]:
            idx = int(len(raw_scores) * p / 100)
            idx = min(idx, len(raw_scores) - 1)
            print(f"   P{p:02d}: {raw_scores[idx]:.4f}")
        print(f"   Min: {raw_scores[0]:.4f}  Max: {raw_scores[-1]:.4f}")

    print(f"\n   Changed exams: {changed}/{len(exams)}")

    if dry_run:
        print("\n🔍 Dry run — no file written.")
        return

    # ── Write ──────────────────────────────────────────────────────────
    print(f"\n💾 Writing {CATALOG.name} …")
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)
    print("   Done.")


if __name__ == "__main__":
    main()
