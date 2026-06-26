#!/usr/bin/env python3
"""
fix_audit_track_b_math.py
---------------------------------------------------------------------------
Track B (subject pilot: Mathématiques) of the content-quality audit.

Translates English scaffold/answer-part LABELS in Mathématiques exams into
French AND wraps bare math tokens (U_n, x_G, e^x, f(x), z^2 ...) in `$...$`
so KaTeX renders them (labels go through <MathText>, which only renders math
inside `$...$`).

Strategy (reviewable, false-positive-gated):
  1. OVERRIDES  — explicit, hand-checked French for idiomatic / prose labels
                  (probability & combinatorics wording, fixed phrases).
  2. RULES      — ordered regex templates for systematic math "head of <expr>"
                  labels (Value of, Derivative of, Limit of, Module of ...).
  3. norm_math  — ASCII-math -> LaTeX so KaTeX never errors
                  (sqrt()-> \\sqrt{}, infinity -> \\infty, ^()-> ^{} ...).
  4. ZERO-ENGLISH GATE — after translating, any label still containing a
     high-confidence English word (spelled differently in French: of, the,
     value, derivative, ways, balls, outcomes, ...) is reported. In --apply
     mode a non-empty residual ABORTS the write, so we never ship English.

Run:
  python scripts/fix_audit_track_b_math.py          # dry-run report
  python scripts/fix_audit_track_b_math.py --apply  # writes catalog
Then: node scripts/split_exam_catalog.mjs
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "public" / "exam_catalog.json"
SUBJECT = "Mathématiques"

# ---------------------------------------------------------------------------
# Math-notation normalisation: ASCII-ish math -> valid LaTeX
# ---------------------------------------------------------------------------
def norm_math(p: str) -> str:
    s = p.strip()
    # multi-char exponents / subscripts -> braces:  e^(2x) -> e^{2x}, q^(n+1)
    s = re.sub(r"\^\(([^()]*)\)", r"^{\1}", s)
    s = re.sub(r"_\(([^()]*)\)", r"_{\1}", s)
    # multi-DIGIT exponents / subscripts must be braced (z^10 not z^1 0, U_11)
    s = re.sub(r"\^(-?\d{2,})", r"^{\1}", s)
    s = re.sub(r"_(-?\d{2,})", r"_{\1}", s)
    # sqrt(...) -> \sqrt{...}  (no \b so "2sqrt(3)" / "i*sqrt(3)" convert too)
    s = re.sub(r"sqrt\s*\(([^()]*)\)", r"\\sqrt{\1}", s)
    s = re.sub(r"√\s*\(([^()]*)\)", r"\\sqrt{\1}", s)
    s = re.sub(r"√\s*(\d+)", r"\\sqrt{\1}", s)
    # infinity: match the English/French WORD only (never the LaTeX "infty",
    # else the bare rule would re-match and double the backslash).
    s = re.sub(r"[-−]\s*inf(?:inity|ini)\b", r"-\\infty", s, flags=re.I)
    s = re.sub(r"\+\s*inf(?:inity|ini)\b", r"+\\infty", s, flags=re.I)
    s = re.sub(r"\binf(?:inity|ini)\b", r"\\infty", s, flags=re.I)
    # statistical bars
    s = re.sub(r"\bx_bar\b", r"\\bar{x}", s)
    s = re.sub(r"\by_bar\b", r"\\bar{y}", s)
    # named functions -> LaTeX operators (\ln, \arg, \exp, ...). Lookbehind so
    # we never double an already-escaped command.
    for fn in ("ln", "log", "exp", "sin", "cos", "tan", "cot", "sec", "csc",
               "arg", "max", "min", "det", "dim", "gcd", "lcm"):
        s = re.sub(rf"(?<!\\)\b{fn}\b", rf"\\{fn}", s)
    # bare "letter+digit(s)" token -> proper subscript (z1 -> z_{1}, U11 -> U_{11})
    s = re.sub(r"(?<![\\A-Za-z])([A-Za-z])(\d{1,2})(?![A-Za-z0-9])", r"\1_{\2}", s)
    # greek words occasionally appear bare
    for g in ("alpha", "beta", "gamma", "lambda", "theta", "pi", "mu", "sigma"):
        s = re.sub(rf"(?<!\\)\b{g}\b", rf"\\{g}", s)
    # comparators
    s = s.replace("<=", r"\le ").replace(">=", r"\ge ").replace("!=", r"\ne ")
    # implicit multiplication: i*sqrt -> i\sqrt ;  3*X -> 3X
    s = s.replace("*", "")
    # tidy doubled spaces introduced by the substitutions
    s = re.sub(r" {2,}", " ", s)
    return s.strip()


# Words that mean a captured payload is PROSE, not a math expression.
_PROSE_IN_PAYLOAD = re.compile(
    r"\b(of|the|for|with|to|and|ways?|choose|choosing|balls?|red|white|black|yellow|green|blue|"
    r"outcomes?|even|odd|colou?rs?|same|different|sexes|students?|employees?|weeks?|buy|bicycle|"
    r"scores?|terms?|sequence|increasing|decreasing|number|total|tail|pile|face|group|values?|"
    r"roots?|first|second|third|fourth|fifth|draws?|divisors?|vector|events?|interest|series|"
    r"slope|line|circle|plane|tangent|triangle|points?|union|intersection)\b",
    re.I,
)


def is_math_payload(p: str) -> bool:
    if _PROSE_IN_PAYLOAD.search(p):
        return False
    return bool(re.search(r"[\\^_(){}=+\-/|√']", p)) or len(p.split()) <= 1


def m(p: str) -> str:
    """Wrap a math payload in $...$ (idempotent)."""
    p = p.strip()
    if not p:
        return p
    if p.startswith("$") and p.endswith("$"):
        return p
    return "$" + norm_math(p) + "$"


def mw(p: str) -> str:
    """Math-wrap if the payload is math, else leave the (already-French) prose."""
    return m(p) if is_math_payload(p) else p.strip()


# ---------------------------------------------------------------------------
# Ordered regex rules for systematic "head of <expr>" math labels.
# Each entry: (pattern, replacement-callable(match) -> str). First match wins.
# ---------------------------------------------------------------------------
def _rules():
    R: list[tuple[re.Pattern[str], object]] = []

    def add(pat, fn):
        R.append((re.compile(pat, re.I), fn))

    # coordinates
    add(r"^x-?coordinate of (.+)$", lambda mt: f"Abscisse de {mw(mt.group(1))}")
    add(r"^y-?coordinate of (.+)$", lambda mt: f"Ordonnée de {mw(mt.group(1))}")
    add(r"^z-?coordinate of (.+)$", lambda mt: f"Cote de {mw(mt.group(1))}")
    add(r"^coordinates of (.+)$", lambda mt: f"Coordonnées de {mw(mt.group(1))}")
    # value(s)
    add(r"^values of (.+)$", lambda mt: f"Valeurs de {mw(mt.group(1))}")
    add(r"^value of (.+)$", lambda mt: f"Valeur de {mw(mt.group(1))}")
    add(r"^approximate value of (.+)$", lambda mt: f"Valeur approchée de {mw(mt.group(1))}")
    # derivative
    add(r"^first derivative$", lambda mt: "Dérivée première")
    add(r"^second derivative$", lambda mt: "Dérivée seconde")
    add(r"^derivative of (.+)$", lambda mt: f"Dérivée de {mw(mt.group(1))}")
    add(r"^derivative (.+)$", lambda mt: f"Dérivée {mw(mt.group(1))}")
    add(r"^derivative$", lambda mt: "Dérivée")
    # domain
    add(r"^domain of definition$", lambda mt: "Domaine de définition")
    add(r"^domain of (.+)$", lambda mt: f"Domaine de {mw(mt.group(1))}")
    # limits with "as ... approaches ..."
    add(
        r"^limit of (.+?) as (.+?) approaches (.+)$",
        lambda mt: f"Limite de {mw(mt.group(1))} quand {mw(mt.group(2))} tend vers {mw(mt.group(3))}",
    )
    add(
        r"^limit as (.+?) approaches (.+?) from the left$",
        lambda mt: f"Limite quand {mw(mt.group(1))} tend vers {mw(mt.group(2))} par la gauche",
    )
    add(
        r"^limit as (.+?) approaches (.+?) from the right$",
        lambda mt: f"Limite quand {mw(mt.group(1))} tend vers {mw(mt.group(2))} par la droite",
    )
    add(r"^limit as (.+?) approaches (.+)$",
        lambda mt: f"Limite quand {mw(mt.group(1))} tend vers {mw(mt.group(2))}")
    add(r"^limit at (.+)$", lambda mt: f"Limite en {mw(mt.group(1))}")
    add(r"^limit of (.+)$", lambda mt: f"Limite de {mw(mt.group(1))}")
    # modulus / argument (complex numbers)
    add(r"^modulus and argument of (.+)$", lambda mt: f"Module et argument de {mw(mt.group(1))}")
    add(r"^module and argument of (.+)$", lambda mt: f"Module et argument de {mw(mt.group(1))}")
    add(r"^modulus of (.+)$", lambda mt: f"Module de {mw(mt.group(1))}")
    add(r"^module of (.+)$", lambda mt: f"Module de {mw(mt.group(1))}")
    add(r"^argument of (.+)$", lambda mt: f"Argument de {mw(mt.group(1))}")
    # real / imaginary part
    add(r"^real part of (.+)$", lambda mt: f"Partie réelle de {mw(mt.group(1))}")
    add(r"^imaginary part of (.+)$", lambda mt: f"Partie imaginaire de {mw(mt.group(1))}")
    # exponential / trigonometric form
    add(r"^(.+?) in exponential form$", lambda mt: f"{mw(mt.group(1))} sous forme exponentielle")
    add(r"^exponential form of (.+)$", lambda mt: f"Forme exponentielle de {mw(mt.group(1))}")
    add(r"^trigonometric form of (.+)$", lambda mt: f"Forme trigonométrique de {mw(mt.group(1))}")
    # determinant / factorization / primitive
    add(r"^determinant of (.+)$", lambda mt: f"Déterminant de {mw(mt.group(1))}")
    add(r"^factorization of (.+)$", lambda mt: f"Factorisation de {mw(mt.group(1))}")
    add(r"^primitive of (.+)$", lambda mt: f"Primitive de {mw(mt.group(1))}")
    # NB: no bare "^primitive (.+)$" rule — "Primitive" is a FR/EN homograph, so
    # it would re-match already-translated French ("Primitive finale"). The only
    # bare case, "Primitive F(x)", is handled via OVERRIDES.
    # solutions / roots
    add(r"^solutions? of (.+)$", lambda mt: f"Solutions de {mw(mt.group(1))}")
    add(r"^roots of (.+)$", lambda mt: f"Racines de {mw(mt.group(1))}")
    # expression
    add(r"^expression of (.+)$", lambda mt: f"Expression de {mw(mt.group(1))}")
    add(r"^expression for (.+)$", lambda mt: f"Expression de {mw(mt.group(1))}")
    add(r"^general expression of (.+)$", lambda mt: f"Expression générale de {mw(mt.group(1))}")
    # variance / mean (pure math payload)
    add(r"^variance of (.+)$", lambda mt: f"Variance de {mw(mt.group(1))}")
    # nature / type / sign / parity / monotonicity
    add(r"^nature of (.+)$", lambda mt: f"Nature de {mw(mt.group(1))}")
    add(r"^type of (.+)$", lambda mt: f"Type de {mw(mt.group(1))}")
    add(r"^sign of (.+)$", lambda mt: f"Signe de {mw(mt.group(1))}")
    add(r"^parity of (.+)$", lambda mt: f"Parité de {mw(mt.group(1))}")
    add(r"^monotonicity of (.+)$", lambda mt: f"Monotonie de {mw(mt.group(1))}")
    # probability of a SYMBOL (prose handled by overrides)
    add(r"^probability of ([A-Za-z]['′]?)$", lambda mt: f"Probabilité de {mw(mt.group(1))}")
    # "<X> coordinates" -> Coordonnées de X
    add(r"^(.+) coordinates$", lambda mt: f"Coordonnées de {mw(mt.group(1))}")
    # solve / solving
    add(r"^solve for (.+)$", lambda mt: f"Résoudre pour {mw(mt.group(1))}")
    add(r"^solving for (.+)$", lambda mt: f"Calcul de {mw(mt.group(1))}")
    # solutions / solution-to
    add(r"^solution to equation (\d+)$", lambda mt: f"Solution de l'équation {mt.group(1)}")
    add(r"^solutions? for (.+)$", lambda mt: f"Solutions pour {mw(mt.group(1))}")
    add(r"^solution z(\d+)$", lambda mt: f"Solution $z_{mt.group(1)}$")
    add(r"^solution to (.+)$", lambda mt: f"Solution de {mw(mt.group(1))}")
    # verification / simplification / interpretation / covariance / matrix
    add(r"^verification of (.+)$", lambda mt: f"Vérification de {mw(mt.group(1))}")
    add(r"^simplification of (.+)$", lambda mt: f"Simplification de {mw(mt.group(1))}")
    add(r"^interpretation of (.+)$", lambda mt: f"Interprétation de {mw(mt.group(1))}")
    add(r"^covariance of (.+)$", lambda mt: f"Covariance de {mw(mt.group(1))}")
    add(r"^matrix of (.+)$", lambda mt: f"Matrice de {mw(mt.group(1))}")
    add(r"^standard deviation of (.+)$", lambda mt: f"Écart-type de {mw(mt.group(1))}")
    add(r"^proof of (.+)$", lambda mt: f"Démonstration de {mw(mt.group(1))}")
    # negation / sigma notation keep the trailing item-letter as-is
    add(r"^negation of (.+)$", lambda mt: f"Négation de {mt.group(1)}")
    add(r"^sigma notation for (.+)$", lambda mt: f"Notation sigma pour {mt.group(1)}")
    # piecewise F(x) for <interval>
    add(r"^F\(x\) for (.+)$", lambda mt: f"$F(x)$ pour {mw(mt.group(1))}")
    # imperative math heads (overrides catch the prose-payload cases first)
    add(r"^calculate (.+)$", lambda mt: f"Calculer {mw(mt.group(1))}")
    add(r"^calculating (.+)$", lambda mt: f"Calcul de {mw(mt.group(1))}")
    add(r"^find (.+)$", lambda mt: f"Calculer {mw(mt.group(1))}")
    add(r"^solve (.+)$", lambda mt: f"Résoudre {mw(mt.group(1))}")
    add(r"^ratio (.+)$", lambda mt: f"Rapport {mw(mt.group(1))}")
    add(r"^deduction from (.+)$", lambda mt: f"Déduction à partir de {mw(mt.group(1))}")
    add(r"^relationship between (.+?) and (.+)$",
        lambda mt: f"Relation entre {mw(mt.group(1))} et {mw(mt.group(2))}")
    add(r"^distance from (.+?) to (.+)$",
        lambda mt: f"Distance de {mw(mt.group(1))} à {mw(mt.group(2))}")
    return R


RULES = _rules()

# ---------------------------------------------------------------------------
# Explicit overrides (idiomatic / prose / fixed phrases). Highest priority.
# ---------------------------------------------------------------------------
OVERRIDES: dict[str, str] = {
    # generic finals & headers
    "Final answer": "Réponse finale",
    "Final Answer": "Réponse finale",
    "Final equation": "Équation finale",
    "Final domain": "Domaine final",
    "Final limit": "Limite finale",
    "Final expression": "Expression finale",
    "Final result": "Résultat final",
    "Final sum": "Somme finale",
    "Final area": "Aire finale",
    "Final amount": "Montant final",
    "Final inequality": "Inégalité finale",
    "Final magnitude": "Module final",
    "Final primitive": "Primitive finale",
    "Final relation": "Relation finale",
    "Final solution for x": "Solution finale pour $x$",
    "Final solution set": "Ensemble des solutions final",
    "Final value of |z|": "Valeur finale de $|z|$",
    "Final lambda": "Valeur finale de $\\lambda$",
    "Calcul final": "Calcul final",
    # bare math nouns
    "Variance": "Variance",
    "Variance value": "Valeur de la variance",
    "Variance formula": "Formule de la variance",
    "Probability": "Probabilité",
    "Total probability": "Probabilité totale",
    "Probability distribution": "Loi de probabilité",
    "Probability p": "Probabilité $p$",
    "Derivative": "Dérivée",
    "First derivative": "Dérivée première",
    "Second derivative": "Dérivée seconde",
    "Antiderivative": "Primitive",
    "Integral": "Intégrale",
    "Integral expression": "Expression de l'intégrale",
    "Integral result": "Résultat de l'intégrale",
    "Integral value": "Valeur de l'intégrale",
    "Integral setup": "Mise en place de l'intégrale",
    "Equation": "Équation",
    "Equation setup": "Mise en équation",
    "Quadratic equation": "Équation du second degré",
    "Symmetric equation": "Équation symétrique",
    "Expanded equation": "Équation développée",
    "Barycenter equation": "Équation barycentrique",
    "Regression equation": "Équation de régression",
    "Regression line equation": "Équation de la droite de régression",
    "Equation of regression line": "Équation de la droite de régression",
    "Asymptote": "Asymptote",
    "Oblique asymptote": "Asymptote oblique",
    "Vertical asymptote": "Asymptote verticale",
    "Asymptote oblique": "Asymptote oblique",
    "Asymptote verticale": "Asymptote verticale",
    "Asymptote correcte": "Asymptote correcte",
    "Asymptote proof": "Démonstration de l'asymptote",
    "Slope": "Pente",
    "Slope value": "Valeur de la pente",
    "Imaginary part": "Partie imaginaire",
    "Inverse Matrix": "Matrice inverse",
    "Transposed matrix": "Matrice transposée",
    "Matrix multiplication": "Produit matriciel",
    "Associated matrix form": "Forme matricielle associée",
    "Expected value": "Espérance",
    "Minimum value": "Valeur minimale",
    "Argument": "Argument",
    "Probability of A": "Probabilité de $A$",
    "Probability of B": "Probabilité de $B$",
    # mixed FR/EN already-partly-French
    "Equation transformée": "Équation transformée",
    "Equation simplifiée": "Équation simplifiée",
    "Equation à résoudre": "Équation à résoudre",
    "Equation barycentrique": "Équation barycentrique",
    "Equation après carré": "Équation après élévation au carré",
    "Asymptote en +infini": "Asymptote en $+\\infty$",
    "Asymptote en -infini": "Asymptote en $-\\infty$",
    "Limit at +$\\infty$": "Limite en $+\\infty$",
    "Limit at 0+": "Limite en $0^+$",
    "Limit at 0-": "Limite en $0^-$",
    "c) Limit": "c) Limite",
    # limits with bounds / sequences
    "Limit of the sequence": "Limite de la suite",
    "Limit of the sum": "Limite de la somme",
    "Limit of the lower bound": "Limite de la borne inférieure",
    "Limit of the upper bound": "Limite de la borne supérieure",
    "Limit of the inequality bound": "Limite de la borne de l'inégalité",
    "Limit application": "Application de la limite",
    "Horizontal asymptote at +infinity": "Asymptote horizontale en $+\\infty$",
    "Horizontal asymptote at -infinity": "Asymptote horizontale en $-\\infty$",
    # means by group
    "Mean of x": "Moyenne de $x$",
    "Mean of y": "Moyenne de $y$",
    "Mean of x for group 1": "Moyenne de $x$ pour le groupe 1",
    "Mean of x for group 2": "Moyenne de $x$ pour le groupe 2",
    "Mean of y for group 1": "Moyenne de $y$ pour le groupe 1",
    "Mean of y for group 2": "Moyenne de $y$ pour le groupe 2",
    # geometry with articles
    "Equation of tangent": "Équation de la tangente",
    "Equation of the circle": "Équation du cercle",
    "Equation of the line": "Équation de la droite",
    "Equation of the line (AB)": "Équation de la droite $(AB)$",
    "Equation of the plane": "Équation du plan",
    "Equation of the image of the line": "Équation de l'image de la droite",
    "Equation of the interior of a circle": "Équation de l'intérieur d'un cercle",
    "Equation of (G_1G_2)": "Équation de $(G_1G_2)$",
    "Equation of P": "Équation de $P$",
    "General form of the plane": "Forme générale du plan",
    "Name of the line": "Nom de la droite",
    "Area of the circle": "Aire du cercle",
    "Center of the circle": "Centre du cercle",
    "Center of the image of the circle": "Centre de l'image du cercle",
    "Radius of the image of the circle": "Rayon de l'image du cercle",
    "Nature of triangle ABC": "Nature du triangle $ABC$",
    "Nature of ABCD": "Nature de $ABCD$",
    "Base of the logarithm": "Base du logarithme",
    "Affix of the isobarycenter": "Affixe de l'isobarycentre",
    "Barycenter equation": "Équation barycentrique",
    # set theory
    "Cardinality of A intersection B": "Cardinal de $A \\cap B$",
    "Intersection of A and B": "Intersection de $A$ et $B$",
    "Intersection of P and P'": "Intersection de $P$ et $P'$",
    "Set of complex numbers for U to be zero": "Ensemble des nombres complexes pour lesquels $U$ est nul",
    "Set of points for U to be real": "Ensemble des points pour lesquels $U$ est réel",
    # values / expected value
    "E(X) value": "Valeur de $E(X)$",
    "Expected value E(X)": "Espérance $E(X)$",
    "Excluded values": "Valeurs interdites",
    "Possible values of X": "Valeurs possibles de $X$",
    "Values of X": "Valeurs de $X$",
    "Values of G": "Valeurs de $G$",
    "Values of a and b": "Valeurs de $a$ et $b$",
    "Condition for domain": "Condition sur le domaine",
    "Conclusion about the position of Cf": "Conclusion sur la position de $C_f$",
    "Maximum benefit in thousands of dollars": "Bénéfice maximal en milliers de dollars",
    "Maximum benefit value": "Valeur du bénéfice maximal",
    # quartiles / terms / sequences
    "First Quartile": "Premier quartile",
    "First blank": "Premier blanc",
    "First solution": "Première solution",
    "Find the number of terms": "Trouver le nombre de termes",
    "Finding a vector in F": "Trouver un vecteur de $F$",
    "Finding the common difference r": "Trouver la raison $r$",
    "Finding the first term U_0": "Trouver le premier terme $U_0$",
    "Fifth roots of U": "Racines cinquièmes de $U$",
    "Fifth term of the arithmetic sequence": "Cinquième terme de la suite arithmétique",
    "Third term of the sequence": "Troisième terme de la suite",
    "First term of the geometric sequence": "Premier terme de la suite géométrique",
    "Reason of the arithmetic sequence": "Raison de la suite arithmétique",
    "Reason of the geometric sequence": "Raison de la suite géométrique",
    "Ratio of consecutive terms": "Rapport des termes consécutifs",
    "Period of the sequence": "Période de la suite",
    "Nature of the sequence": "Nature de la suite",
    "Type of sequence": "Type de suite",
    "Parity of the function": "Parité de la fonction",
    "Sum of the first 10 terms of U_n": "Somme des 10 premiers termes de $U_n$",
    "Sum of the geometric series": "Somme de la série géométrique",
    "Sum of the scores": "Somme des notes",
    # formulas
    "Formula for compound interest": "Formule des intérêts composés",
    "Formula for conditional probability": "Formule des probabilités conditionnelles",
    "Formula for independent events": "Formule des événements indépendants",
    "Formula for regression coefficient": "Formule du coefficient de régression",
    "Formula for Sn": "Formule de $S_n$",
    "Formula for the slope": "Formule de la pente",
    "Formula for the sum of a geometric series": "Formule de la somme d'une suite géométrique",
    "Formula for x_G": "Formule de $x_G$",
    "Formula for y_G": "Formule de $y_G$",
    "Formula for y_n": "Formule de $y_n$",
    "Coefficient directeur formula": "Formule du coefficient directeur",
    "Apply the sum formula": "Appliquer la formule de la somme",
    "Applying the variance formula": "Application de la formule de la variance",
    "Using the union probability formula": "À l'aide de la formule des probabilités de la réunion",
    "Mean Value Theorem application": "Application du théorème des accroissements finis",
    "Apply L'Hopital's rule (or know the limit)": "Appliquer la règle de L'Hôpital (ou connaître la limite)",
    "Constant of integration": "Constante d'intégration",
    "Splitting the integral": "Découpage de l'intégrale",
    "Lower bound integral": "Borne inférieure de l'intégrale",
    "Upper bound integral": "Borne supérieure de l'intégrale",
    "Trigonometric form of i and -i": "Forme trigonométrique de $i$ et $-i$",
    # combinatorics / probability prose
    "Number of red balls": "Nombre de boules rouges",
    "Number of yellow balls": "Nombre de boules jaunes",
    "Number of even numbers": "Nombre de nombres pairs",
    "Number of odd numbers": "Nombre de nombres impairs",
    "Number of scores": "Nombre de notes",
    "Number of favorable outcomes": "Nombre d'issues favorables",
    "Number of possible outcomes": "Nombre d'issues possibles",
    "Number of correctly labeled objects": "Nombre d'objets correctement étiquetés",
    "Number of employees older than 26": "Nombre d'employés de plus de 26 ans",
    "Number of weeks to buy the bicycle": "Nombre de semaines pour acheter le vélo",
    "Number of draws of 4 black balls": "Nombre de tirages de 4 boules noires",
    "Number of draws of 4 red balls": "Nombre de tirages de 4 boules rouges",
    "Number of draws of 4 white balls": "Nombre de tirages de 4 boules blanches",
    "Number of ways to choose 1 fast dance": "Nombre de façons de choisir 1 danse rapide",
    "Number of ways to choose 2 slow dances": "Nombre de façons de choisir 2 danses lentes",
    "Number of ways to choose 3 slow dances": "Nombre de façons de choisir 3 danses lentes",
    "Number of ways to choose 2 from 8": "Nombre de façons de choisir 2 parmi 8",
    "Number of ways to choose one boy and one girl": "Nombre de façons de choisir un garçon et une fille",
    "Total number of outcomes": "Nombre total d'issues",
    "Total number of choices": "Nombre total de choix",
    "Total number of combinations": "Nombre total de combinaisons",
    "Total number of possible draws": "Nombre total de tirages possibles",
    "Total number of programs": "Nombre total de programmes",
    "Total number of ways to choose 2 students": "Nombre total de façons de choisir 2 élèves",
    "Calculate the probability": "Calculer la probabilité",
    "Calculate the total number of outcomes": "Calculer le nombre total d'issues",
    "Probability of choosing students of different sexes": "Probabilité de choisir des élèves de sexes différents",
    "Probability of drawing 4 balls of the same color": "Probabilité de tirer 4 boules de la même couleur",
    "Probability of two red balls": "Probabilité de deux boules rouges",
    "Probability of null vote": "Probabilité d'un vote nul",
    "Probability of one tail": "Probabilité d'obtenir une fois pile",
    "Probability of pile for biased coin": "Probabilité de pile pour la pièce truquée",
    "Probability of pile for normal coin": "Probabilité de pile pour la pièce normale",
    "Probability of intersection": "Probabilité de l'intersection",
    "Probability of 3 piles": "Probabilité de 3 piles",
    "P(3 balls of different colors)": "$P$(3 boules de couleurs différentes)",
    "P(3 balls of same color)": "$P$(3 boules de même couleur)",
    "Number of ways to choose 2 students": "Nombre de façons de choisir 2 élèves",
    "Number of red balls drawn": "Nombre de boules rouges tirées",
    # misc prose
    "Excluded values": "Valeurs interdites",
    "Slope a": "Pente $a$",
    "Slope at (0, f(0))": "Pente en $(0, f(0))$",
    "Intercept b": "Ordonnée à l'origine $b$",
    "Real part X": "Partie réelle $X$",
    "Imaginary part Y": "Partie imaginaire $Y$",
    "x-coordinate where slope is zero": "Abscisse où la pente est nulle",
    "y-coordinate where slope is zero": "Ordonnée où la pente est nulle",
    "Interval where f is decreasing": "Intervalle où $f$ est décroissante",
    "Interval where f is increasing": "Intervalle où $f$ est croissante",
    "Intervals of increase and decrease": "Intervalles de croissance et de décroissance",
    "Intervals of increasing/decreasing": "Intervalles de croissance et de décroissance",
    "h(x) is increasing": "$h(x)$ est croissante",
    "Variation of h": "Variation de $h$",
    "Variations of f": "Variations de $f$",
    "U_n in terms of n": "$U_n$ en fonction de $n$",
    # --- residual batch 2 ---
    "Apply the initial condition": "Appliquer la condition initiale",
    "Apply the integration rule": "Appliquer la règle d'intégration",
    "Applying the squeeze theorem": "Application du théorème des gendarmes",
    "Calculate the sum": "Calculer la somme",
    "Calculating the inverse of M": "Calcul de l'inverse de $M$",
    "Calculating the modulus": "Calcul du module",
    "Center Omega": "Centre $\\Omega$",
    "Condition for barycenter existence": "Condition d'existence du barycentre",
    "Condition for bijectivity": "Condition de bijectivité",
    "Condition for denominator": "Condition sur le dénominateur",
    "Condition for exponential function": "Condition pour la fonction exponentielle",
    "Condition for ln(x)": "Condition pour $\\ln(x)$",
    "Condition for perpendicularity": "Condition de perpendicularité",
    "Cosine and sine values": "Valeurs du cosinus et du sinus",
    "Determinant non-zero": "Déterminant non nul",
    "Eigenvector for eigenvalue -1": "Vecteur propre pour la valeur propre $-1$",
    "Eigenvector for eigenvalue 1": "Vecteur propre pour la valeur propre $1$",
    "Equation f'(x) = -3": "Équation $f'(x) = -3$",
    "Equation for lambda": "Équation pour $\\lambda$",
    "Equation for number of divisors": "Équation pour le nombre de diviseurs",
    "Equation for |z|^2": "Équation pour $|z|^2$",
    "Equation from E(X)": "Équation à partir de $E(X)$",
    "Equation from probabilities": "Équation à partir des probabilités",
    "Evaluating the derivative at x=e": "Évaluation de la dérivée en $x=e$",
    "Express U_2, U_5, U_8 in terms of U_0 and r": "Exprimer $U_2$, $U_5$, $U_8$ en fonction de $U_0$ et $r$",
    "Expressing x and z in terms of y": "Exprimer $x$ et $z$ en fonction de $y$",
    "Favorable outcomes": "Issues favorables",
    "Possible outcomes": "Issues possibles",
    "Total possible outcomes": "Nombre total d'issues possibles",
    "Identify the favorable outcomes": "Identifier les issues favorables",
    "Final expression for AG": "Expression finale de $AG$",
    "Final expression for F(x)": "Expression finale de $F(x)$",
    "Final expression for h": "Expression finale de $h$",
    "Final limit of U_n": "Limite finale de $U_n$",
    "Final limit of Un": "Limite finale de $U_n$",
    "Find a particular solution": "Trouver une solution particulière",
    "Find the common difference": "Trouver la raison",
    "Find the general term Un": "Trouver le terme général $U_n$",
    "General solution": "Solution générale",
    "Geometric sequence": "Suite géométrique",
    "Geometric sequence proof": "Démonstration de la suite géométrique",
    "Impossibility of one mislabeled object": "Impossibilité d'un seul objet mal étiqueté",
    "Inequality proof": "Démonstration de l'inégalité",
    "Limit of first derivative at -infinity": "Limite de la dérivée première en $-\\infty$",
    "Lower bound": "Borne inférieure",
    "Upper bound": "Borne supérieure",
    "Magnitude of denominator": "Module du dénominateur",
    "Magnitude of numerator": "Module du numérateur",
    "Maximum benefit in dollars": "Bénéfice maximal en dollars",
    "Maximum benefit quantity": "Quantité du bénéfice maximal",
    "Monotonicity": "Monotonie",
    "Multiplying by the conjugate": "Multiplication par le conjugué",
    "Normalizing the vector": "Normalisation du vecteur",
    "Parallelism of (AB) and (CD)": "Parallélisme de $(AB)$ et $(CD)$",
    "Position of C with respect to D": "Position de $C$ par rapport à $D$",
    "Product of roots": "Produit des racines",
    "Product of other roots": "Produit des autres racines",
    "Proof of symmetry": "Démonstration de la symétrie",
    "Proof that OAB is equilateral": "Démonstration que $OAB$ est équilatéral",
    "Reason for An": "Raison de $A_n$",
    "Reason for Bn": "Raison de $B_n$",
    "Reason for no solution": "Raison de l'absence de solution",
    "Recognize the form u'(x)u(x)": "Reconnaître la forme $u'(x)u(x)$",
    "Recurrence equation for In": "Relation de récurrence pour $I_n$",
    "Simplified recurrence equation (assuming constant r)": "Relation de récurrence simplifiée (en supposant $r$ constant)",
    "Regression line equation x in y": "Équation de la droite de régression de $x$ en $y$",
    "Regression line equation y in x": "Équation de la droite de régression de $y$ en $x$",
    "Rewrite the function": "Réécrire la fonction",
    "Rewriting the expression": "Réécriture de l'expression",
    "Roots": "Racines",
    "Second derivative test": "Test de la dérivée seconde",
    "Second solution": "Deuxième solution",
    "Third solution": "Troisième solution",
    "Setting the imaginary part to zero": "Annulation de la partie imaginaire",
    "Simplified complex number": "Nombre complexe simplifié",
    "Simplify the ratio": "Simplifier le rapport",
    "Solution set": "Ensemble des solutions",
    "Solution to the equation": "Solution de l'équation",
    "Solve the homogeneous equation": "Résoudre l'équation homogène",
    "Standard deviation of -3X+5": "Écart-type de $-3X+5$",
    "State the particular solution": "Donner la solution particulière",
    "State the primitive F(x)": "Donner la primitive $F(x)$",
    "Substitute into the given equation": "Substituer dans l'équation donnée",
    "Substituting the given values": "Substitution des valeurs données",
    "Substitution of G coordinates": "Substitution des coordonnées de $G$",
    "Sum of (distance * effectif)": "Somme de (distance × effectif)",
    "Sum of effectif": "Somme des effectifs",
    "Sum of f(-x) and f(x)": "Somme de $f(-x)$ et $f(x)$",
    "Sum of x_i * y_i": "Somme de $x_i y_i$",
    "Sum of y_i values": "Somme des valeurs $y_i$",
    "Sum of (x_i - x_bar)(y_i - y_bar)": "Somme de $(x_i - \\bar{x})(y_i - \\bar{y})$",
    "Sum of (x_i - x_bar)^2": "Somme de $(x_i - \\bar{x})^2$",
    "Sum of (y_i - y_bar)^2": "Somme de $(y_i - \\bar{y})^2$",
    "The three numbers": "Les trois nombres",
    "Third Quartile": "Troisième quartile",
    "Total of xi": "Total des $x_i$",
    "Total of xi^2": "Total des $x_i^2$",
    "Total of xiyi": "Total des $x_i y_i$",
    "Total of yi": "Total des $y_i$",
    "Total of yi^2": "Total des $y_i^2$",
    "Triplet solution": "Solution (triplet)",
    "U1 value": "Valeur de $U_1$",
    "Unique Solution": "Solution unique",
    "Verification that A is on the circle": "Vérification que $A$ est sur le cercle",
    "Verification that g is a symmetry": "Vérification que $g$ est une symétrie",
    "Vertical asymptotes": "Asymptotes verticales",
    "Week when Marconi touches more than 800 gourdes": "Semaine où Marconi touche plus de 800 gourdes",
    "Week when U_n > 800": "Semaine où $U_n > 800$",
    "Weeks to buy bicycle": "Semaines pour acheter le vélo",
    "a) Reason r": "a) Raison $r$",
    "n for z^n imaginary": "$n$ pour que $z^n$ soit imaginaire",
    "n for z^n real": "$n$ pour que $z^n$ soit réel",
    "x' in terms of x and y": "$x'$ en fonction de $x$ et $y$",
    "y' in terms of x and y": "$y'$ en fonction de $x$ et $y$",
    "P(3 red balls)": "$P$(3 boules rouges)",
    "P(exactly 2 black balls)": "$P$(exactement 2 boules noires)",
    "P(no red balls)": "$P$(aucune boule rouge)",
    # --- prose payloads that must not be math-wrapped ---
    "Calculate Z1/Z2 in exponential form": "Calculer $Z_1/Z_2$ sous forme exponentielle",
    "Sign of derivative": "Signe de la dérivée",
    "Type of event": "Type d'événement",
    "Type of extremum": "Type d'extremum",
    "Value of I+J (assuming corrected question)": "Valeur de $I+J$ (en supposant la question corrigée)",
    "Value of r that maximizes V(r)": "Valeur de $r$ qui maximise $V(r)$",
    "Value of the central term": "Valeur du terme central",
    "Value of the common ratio": "Valeur de la raison",
    "Value of the integral B": "Valeur de l'intégrale $B$",
    "Variance Var(X)": "Variance $\\mathrm{Var}(X)$",
    "Primitive F(x)": "Primitive $F(x)$",
    # --- residual batch 3 (broad-sweep stragglers) ---
    "Standard deviation": "Écart-type",
    "Standard Deviation": "Écart-type",
    "Standard deviation sigma(X)": "Écart-type $\\sigma(X)$",
    "General primitive": "Primitive générale",
    "P(i) and P(-i)": "$P(i)$ et $P(-i)$",
    "Relationship between z and its conjugate": "Relation entre $z$ et son conjugué",
    "Conjugate multiplication": "Multiplication par le conjugué",
    "Eigenvalue 1": "Valeur propre $1$",
    "Eigenvalue -1": "Valeur propre $-1$",
    "Sum": "Somme",
    "Sum S": "Somme $S$",
    "Sum Sn": "Somme $S_n$",
    "Raise both sides to 3/2": "Élever les deux membres à la puissance $3/2$",
    "Angle between vectors": "Angle entre les vecteurs",
    "Showing D and P are supplementary": "Montrer que $D$ et $P$ sont supplémentaires",
    "Find P(A U B)": "Calculer $P(A \\cup B)$",
    "Find Var(X)": "Calculer $\\mathrm{Var}(X)$",
    "a) Relationship between P(X=7), P(X=8), P(X=9)": "a) Relation entre $P(X=7)$, $P(X=8)$, $P(X=9)$",
    "Assuming p(1)=p(3)=p(5) and p(2)=p(4)": "En supposant $p(1)=p(3)=p(5)$ et $p(2)=p(4)$",
    "Limits at -∞ and +∞": "Limites en $-\\infty$ et $+\\infty$",
    "Limits at 0- and 1+": "Limites en $0^-$ et $1^+$",
    "Showing V_n is arithmetic": "Montrer que $V_n$ est arithmétique",
    "Similar triangles relationship": "Relation des triangles semblables",
    # --- batch 4: stragglers surfaced by the independent vocabulary sweep ---
    "A: Event type": "A : Type d'événement",
    "B: Event type": "B : Type d'événement",
    "C: Event type": "C : Type d'événement",
    "Answer": "Réponse",
    "Apply De Morgan's Law": "Appliquer la loi de De Morgan",
    "Applying L'Hopital's rule or Taylor expansion": "Application de la règle de L'Hôpital ou du développement de Taylor",
    "Area": "Aire",
    "Area A": "Aire $A$",
    "Area calculation": "Calcul de l'aire",
    "Assumption 1": "Hypothèse 1",
    "Average": "Moyenne",
    "Average distance": "Distance moyenne",
    "BC calculation": "Calcul de $BC$",
    "BD calculation": "Calcul de $BD$",
    "CD calculation": "Calcul de $CD$",
    "Behavior as t -> infinity": "Comportement lorsque $t \\to +\\infty$",
    "Calculation": "Calcul",
    "Case 1: x is rational": "Cas 1 : $x$ est rationnel",
    "Case 2: x is irrational": "Cas 2 : $x$ est irrationnel",
    "Common difference": "Raison",
    "Conclusion (not a square)": "Conclusion (pas un carré parfait)",
    "Corrected answer": "Réponse corrigée",
    "Corrected problem assumption": "Hypothèse corrigée du problème",
    "Correlation coefficient": "Coefficient de corrélation",
    "Correlation type": "Type de corrélation",
    "Critical point": "Point critique",
    "Critical points": "Points critiques",
    "Cross product condition": "Condition du produit vectoriel",
    "Cumulative distribution function": "Fonction de répartition",
    "Curve position": "Position de la courbe",
    "Define h(x)": "Définir $h(x)$",
    "Dividing by 3^n": "Division par $3^{n}$",
    "Dividing by e^n": "Division par $e^{n}$",
    "Ecart interquartile": "Écart interquartile",
    "Evaluation at limits": "Évaluation aux bornes",
    "Factorization": "Factorisation",
    "Fairness": "Équité",
    "Geometric figure": "Figure géométrique",
    "Intermediate result": "Résultat intermédiaire",
    "Interquartile Range": "Écart interquartile",
    "Isolating z": "Isolement de $z$",
    "L is injective iff ker(L) = {0}": "$L$ injective si et seulement si $\\ker(L) = \\{0\\}$",
    "L is surjective iff Im(L) = V": "$L$ surjective si et seulement si $\\operatorname{Im}(L) = V$",
    "Limits at boundaries": "Limites aux bornes",
    "Membership in R": "Appartenance à $\\mathbb{R}$",
    "Minimal average cost": "Coût moyen minimal",
    "Minimal cost": "Coût minimal",
    "Minimum cost": "Coût minimum",
    "Missing f(x)": "$f(x)$ manquant",
    "P(2i) calculation": "Calcul de $P(2i)$",
    "P(A union B) calculation": "Calcul de $P(A \\cup B)$",
    "P(B) calculation": "Calcul de $P(B)$",
    "Partial fraction decomposition": "Décomposition en éléments simples",
    "Percentage decrease": "Pourcentage de diminution",
    "Perimeter calculation": "Calcul du périmètre",
    "Prime factorization": "Décomposition en facteurs premiers",
    "Probabilities": "Probabilités",
    "Proportionality": "Proportionnalité",
    "Recursive relation": "Relation de récurrence",
    "Second blank": "Deuxième réponse",
    "Set A": "Ensemble $A$",
    "Set B": "Ensemble $B$",
    "Set E": "Ensemble $E$",
    "Set F": "Ensemble $F$",
    "Set up equations": "Mise en équation",
    "Simplified expression": "Expression simplifiée",
    "Simplified f(x)": "$f(x)$ simplifié",
    "Simplified g(x)": "$g(x)$ simplifié",
    "Simplified inequality": "Inéquation simplifiée",
    "Simplify": "Simplifier",
    "Simplifying": "Simplification",
    "Smallest n": "Plus petit entier $n$",
    "Sn convergence": "Convergence de $S_n$",
    "Total interest": "Intérêts totaux",
    "Trigonometric form": "Forme trigonométrique",
    "Trigonometric identity application": "Application de l'identité trigonométrique",
    "U_0 calculation": "Calcul de $U_0$",
    "U_15 calculation": "Calcul de $U_{15}$",
    "Vaccine is effective": "Le vaccin est efficace",
    "Verification": "Vérification",
    "Vn is geometric": "Montrer que $V_n$ est géométrique",
    "f(x) factored": "$f(x)$ factorisé",
    "x coordinate": "Abscisse",
    "x-coordinate": "Abscisse",
    "y coordinate": "Ordonnée",
    "y-coordinate": "Ordonnée",
    "z2*z3 in trigonometric form": "$z_2 z_3$ sous forme trigonométrique",
    "z_1z_2 in algebraic form": "$z_1 z_2$ sous forme algébrique",
    "z_1z_2 in trigonometric form": "$z_1 z_2$ sous forme trigonométrique",
    "Correct Option": "Bonne réponse",
    "Is (Vn - Un) convergent?": "$(V_n - U_n)$ est-elle convergente ?",
    "Is (tn) constant?": "$(t_n)$ est-elle constante ?",
    "Is f(x) constant?": "$f(x)$ est-elle constante ?",
}


# ---------------------------------------------------------------------------
# Translation entry point
# ---------------------------------------------------------------------------
def _fix_accents(s: str) -> str:
    # bare "Equation" (no accent) is always the French "Équation"
    return re.sub(r"\bEquation\b", "Équation", s)


def translate(label: str) -> str:
    s = label.strip()
    if s in OVERRIDES:
        return OVERRIDES[s]
    # Idempotency guard: a label that already carries rendered math ($...$) and
    # no residual English has been processed before — never re-run rules on it.
    if "$" in s and not residual_english(s):
        return s
    for pat, fn in RULES:
        mt = pat.match(s)
        if mt:
            return fn(mt)  # type: ignore[operator]
    return _fix_accents(s)  # French already — just normalise accents


# High-confidence English words (spelled differently in French) -> residual gate
_RESIDUAL_EN = re.compile(
    r"\b(of|the|for|with|value|values|derivative|domain|mean|ways?|choose|choosing|balls?|"
    r"red|white|black|yellow|green|blue|outcomes?|even|odd|employees?|weeks?|buy|bicycle|"
    r"scores?|choices?|programs?|students?|same|colou?rs?|tail|increasing|decreasing|roots?|"
    r"sequence|imaginary|transposed|antiderivative|setup|circle|line|where|upper|lower|bound|"
    r"magnitude|numerator|denominator|consecutive|reason|recurrence|benefit|thousands|dollars|"
    r"draws?|slope|intercept|number|formula|limit|equation|exponential|coordinates|probability|"
    r"variance|primitive|solutions?|expression|modulus|module|argument|asymptote|nature|finding|"
    r"first|second|third|fourth|fifth|total|determinant|matrix|integral|approximate|excluded|"
    r"horizontal|vertical|oblique|cardinality|intersection|affix|isobarycenter|parity|monotonicity|"
    r"period|interval|intervals|variation|variations|negation|symmetry|proof|center|radius|"
    r"explain|why|show|showing|prove|proves|given|such|when|calculate|calculating|solve|solving|"
    r"assuming|relationship|between|eigenvalue|eigenvector|conjugate|supplementary|raise|sides|"
    r"deduction|standard|deviation|ratio|event|answer|law|expansion|rule|area|assumption|"
    r"average|calculation|rational|irrational|common|square|corrected|correlation|critical|"
    r"cross|product|cumulative|curve|define|dividing|evaluation|fairness|geometric|intermediate|"
    r"isolating|iff|boundaries|membership|missing|decomposition|partial|percentage|decrease|"
    r"perimeter|prime|probabilities|proportionality|recursive|blank|simplified|simplify|"
    r"simplifying|smallest|interest|trigonometric|vaccine|effective|verification|factored|"
    r"coordinate|behavior|infinity|set|equations|form|is)\b",
    re.I,
)
# French homographs / accepted tokens that the gate must NOT flag.
_ALLOWED_FR = re.compile(
    r"\b(de|du|des|la|le|les|une?|et|en|pour|avec|dans|sur|au|aux|par|à|sous|forme|solutions?|valeur|valeurs|"
    r"dérivée|domaine|moyenne|façons?|boules?|rouges?|jaunes?|blanches?|noires?|issues?|pairs?|"
    r"impairs?|nombre|notes?|choix|programmes?|élèves?|couleur|couleurs?|tirages?|suite|croissante|"
    r"décroissante|racines?|imaginaire|transposée|matrice|primitive|équation|exponentielle|"
    r"coordonnées|probabilité|variance|expression|module|argument|asymptote|nature|trouver|premier|"
    r"première|deuxième|second|seconde|troisième|cinquième|total|totale|déterminant|intégrale|"
    r"approchée|interdites|horizontale|verticale|oblique|cardinal|intersection|affixe|isobarycentre|"
    r"parité|monotonie|période|intervalle|intervalles|variation|variations|symétrie|centre|rayon|"
    r"pente|borne|réunion|espérance|formule|limite|série|réelle|partie|dollars|gourdes|milliers)\b",
    re.I,
)


def residual_english(s: str) -> bool:
    # strip math segments; English inside $...$ is notation, not prose
    plain = re.sub(r"\$[^$]*\$", " ", s)
    for w in _RESIDUAL_EN.findall(plain):
        if not _ALLOWED_FR.match(w):
            return True
    # also catch English that got *hidden* inside a $...$ wrap (e.g. force-wrapped prose)
    for seg in re.findall(r"\$([^$]*)\$", s):
        if _english_in_math(seg):
            return True
    return False


# math command / function tokens that legitimately appear inside $...$
_MATH_TOKENS_OK = {
    "sqrt", "infty", "frac", "bar", "cdot", "times", "div", "left", "right", "text",
    "alpha", "beta", "gamma", "delta", "theta", "lambda", "sigma", "omega", "phi", "rho", "mu", "pi",
    "exp", "sin", "cos", "tan", "cot", "sec", "csc", "log", "lim", "max", "min", "det", "dim",
    "mathbb", "mathrm", "vec", "overline", "le", "ge", "ne", "leq", "geq", "ln",
}


def _english_in_math(seg: str) -> bool:
    plain = re.sub(r"\\[a-zA-Z]+", " ", seg)  # drop LaTeX commands
    for w in re.findall(r"[A-Za-z]{4,}", plain):
        if w.isupper():            # ABCD, OAB — point / shape labels
            continue
        if w.lower() in _MATH_TOKENS_OK:
            continue
        return True                # a real (English) word leaked into math
    return False


def iter_labels(data):
    for e in data:
        if e.get("subject") != SUBJECT:
            continue
        for sec in e.get("sections") or []:
            for q in sec.get("questions") or []:
                for key in ("scaffold_blanks", "answer_parts"):
                    for p in q.get(key) or []:
                        if p and isinstance(p.get("label"), str):
                            yield e, p


def main() -> int:
    apply = "--apply" in sys.argv
    data = json.loads(CATALOG.read_text(encoding="utf-8"))

    distinct: dict[str, str] = {}
    residuals: Counter = Counter()
    changed = 0
    for _e, p in iter_labels(data):
        before = p["label"]
        after = translate(before)
        distinct[before] = after
        if residual_english(after):
            residuals[after] += 1
        if after != before:
            p["label"] = after
            changed += 1

    # Report
    untouched_en = [(b, a) for b, a in distinct.items() if residual_english(a)]
    print(f"Subject: {SUBJECT}")
    print(f"Distinct labels seen: {len(distinct)}")
    print(f"Label occurrences rewritten: {changed}")
    print(f"Distinct labels still flagged English: {len(untouched_en)}")
    if untouched_en:
        print("\n--- RESIDUAL ENGLISH (need OVERRIDES / RULES) ---")
        for b, a in sorted(untouched_en):
            print(f"  {b!r}  ->  {a!r}")

    # sample of good translations
    print("\n--- sample translations ---")
    sample = [(b, a) for b, a in distinct.items() if a != b and not residual_english(a)]
    for b, a in sorted(sample)[:30]:
        print(f"  {b!r}\n      -> {a!r}")

    if apply:
        if untouched_en:
            print("\n!! Residual English present — ABORTING write.", file=sys.stderr)
            return 1
        CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote {CATALOG.name} ({changed} labels rewritten).")
    else:
        print("\n(dry-run — no file written; pass --apply to write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
