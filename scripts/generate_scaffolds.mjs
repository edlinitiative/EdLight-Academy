#!/usr/bin/env node
/**
 * generate_scaffolds.mjs  (v2 — multi-part aware)
 *
 * For every question with no `correct` answer, generates a **scaffolded model
 * answer** that mirrors the actual structure of the question:
 *
 *   • Multi-part questions (a/b/c/d or 1./2./3.) get one blank per sub-part
 *     with a label describing what that sub-part asks.
 *   • Single questions get subject+topic-matched templates.
 *   • fill_blank questions get a contextual prompt instead of the old generic.
 *
 * Also regenerates hints with better keyword targeting (fixes the
 * statistics→derivative, regression→vector mismatches).
 *
 * Output fields written to each question:
 *   scaffold_text   – string with {{n}} placeholders
 *   scaffold_blanks – array of { label } objects
 *   hints           – array of 3 progressive hint strings (rewritten)
 *
 * Run:  node scripts/generate_scaffolds.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG = resolve(__dirname, '../public/exam_catalog.json');

// ─── Subject normalisation ──────────────────────────────────────────────────

function subjectCategory(s) {
  if (!s) return 'general';
  const n = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/math/.test(n)) return 'math';
  if (/physi/.test(n)) return 'physics';
  if (/chimi/.test(n)) return 'chemistry';
  if (/svt|biolog|science.*vie|paleonto|anatomie|geolog/.test(n)) return 'biology';
  if (/anglais|english|business/.test(n)) return 'english';
  if (/espagnol|spanish/.test(n)) return 'spanish';
  if (/francais|french|litterat/.test(n)) return 'french';
  if (/philo/.test(n)) return 'philosophy';
  if (/histoire|geograph/.test(n)) return 'history';
  if (/econom|comptab|gestion/.test(n)) return 'economics';
  if (/anatom|sante|soins|infirm/.test(n)) return 'health';
  if (/kreyol|creole/.test(n)) return 'creole';
  if (/informatiq|computer/.test(n)) return 'computing';
  if (/musiq|art|dessin|peinture/.test(n)) return 'arts';
  if (/ethiq|relig|moral/.test(n)) return 'ethics';
  return 'general';
}

// ─── Multi-part splitter ────────────────────────────────────────────────────
// Detect and split questions containing a), b), c) … or 1) 2) 3) … patterns

function splitSubParts(text) {
  if (!text) return null;

  // Pattern 1: letter sub-parts — a) b) c) etc.
  // Sub-parts can follow: newline, semicolon, period+space, question+space, bracket+space, $+space etc.
  const letterPat = /(?:^|[\n;.?!\]$)]\s+)([a-l])\s*\)\s*/gi;
  const letterMatches = [...text.matchAll(letterPat)];
  if (letterMatches.length >= 2) {
    return extractLetterParts(text, letterMatches);
  }

  // Pattern 2: numbered sub-parts — 1) 2) 3) or 1° 2°
  const numPat = /(?:^|[\n;.?!\]$)]\s+)(\d+)\s*[)°]\s*/g;
  const numMatches = [...text.matchAll(numPat)];
  if (numMatches.length >= 2) {
    return extractNumberedParts(text, numMatches);
  }

  return null;
}

function extractLetterParts(text, matches) {
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const label = m[1];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    parts.push({ label, content });
  }
  const meaningful = parts.filter(p => p.content.length > 3);
  return meaningful.length >= 2 ? meaningful : null;
}

function extractNumberedParts(text, matches) {
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const label = m[1];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    parts.push({ label, content });
  }
  const meaningful = parts.filter(p => p.content.length > 3);
  return meaningful.length >= 2 ? meaningful : null;
}

// ─── Summarise what a sub-part asks for ─────────────────────────────────────

function summariseSubPart(content) {
  // Try to extract a short action verb phrase (French math exam style)
  const verbMatch = content.match(
    /^(Calculer|Déterminer|Montrer|Démontrer|Prouver|Résoudre|Donner|Trouver|Écrire|Vérifier|En déduire|Représenter|Justifier|Exprimer|Simplifier|Factoriser|Développer|Interpréter|Préciser|Établir|Tracer|Compléter|Dresser|Construire|Placer|Indiquer|Calculez|Déterminez|Montrez|Résolvez|Donnez|Trouvez|Écrivez|Vérifiez|Exprimez|Simplifiez|Factorisez|Développez|Interprétez|Précisez|Établissez|Tracez|Complétez|Dressez|Construisez|Placez|Indiquez)[^.;?!]*/i
  );
  if (verbMatch) {
    let label = verbMatch[0].trim();
    if (label.length > 120) label = label.slice(0, 117) + '…';
    return label;
  }

  // For short content, use it directly
  const first100 = content.slice(0, 100).replace(/\n/g, ' ').trim();
  if (content.length <= 100) return first100;

  // Fallback: first sentence
  const sentence = content.match(/^[^.;?!]+[.;?!]/);
  if (sentence) {
    let label = sentence[0].trim();
    if (label.length > 120) label = label.slice(0, 117) + '…';
    return label;
  }

  return first100 + '…';
}

// ─── Build scaffold for a multi-part question ───────────────────────────────

function buildMultiPartScaffold(subParts) {
  const scaffoldLines = [];
  const blanks = [];

  for (let i = 0; i < subParts.length; i++) {
    const part = subParts[i];
    const label = summariseSubPart(part.content);
    scaffoldLines.push(`${part.label}) {{${i}}}`);
    blanks.push({ label });
  }

  return {
    scaffold_text: scaffoldLines.join('\n\n'),
    scaffold_blanks: blanks,
  };
}

// ─── Topic detection (much more precise than v1) ────────────────────────────

function detectMathTopic(text) {
  const t = (text || '').toLowerCase();
  // Order: most specific first
  if (/covariance|cov\s*\(|régression|droite.*ajust|nuage.*point|corrélation|série.*statistiq|point.*moyen|statistiq/i.test(t)) return 'statistics';
  if (/probabilit|dénombr|combinaison|arrangement|binomial|urne|tirage|boule|dé |loi.*de|variable.*aléatoire|espérance|variance|écart.type/i.test(t)) return 'probability';
  if (/matrice|déterminant|\\det|trace|inverse.*matrice|diagonalis/i.test(t)) return 'matrices';
  if (/complexe|z_1|z_2|module.*argument|argument.*module|affixe|form.*exponentiel|form.*trigonométr/i.test(t)) return 'complex';
  if (/suite.*géométri|suite.*arithméti|u_n|u_\{n|récurrence|convergence.*suite|raison.*suite|premier.*terme/i.test(t)) return 'sequences';
  if (/intégr|primitive|\\int/i.test(t)) return 'integrals';
  if (/déri[vé]|f'\s*\(|f\s*'\s*\(|tangente|taux.*variation/i.test(t)) return 'derivatives';
  if (/limite|\\lim/i.test(t)) return 'limits';
  if (/logarithm|\\ln|\\log/i.test(t)) return 'logarithms';
  if (/exponentiel|e\^|e\s*\{/i.test(t)) return 'exponentials';
  if (/trigonométr|\\cos|\\sin|\\tan|cercle.*trigo/i.test(t)) return 'trigonometry';
  if (/factori/i.test(t)) return 'factoring';
  if (/simplifi|rédui/i.test(t)) return 'simplification';
  if (/développer/i.test(t)) return 'expansion';
  if (/vecteur|colinéaire|repère|coordon/i.test(t)) return 'vectors';
  if (/géomét|triangle|cercle|angle|distance|milieu|médiatrice/i.test(t)) return 'geometry';
  if (/équation|résoudre|inéquation|racine|solution/i.test(t)) return 'equations';
  if (/fonction|variation|tableau.*signe|domaine.*définition|continuité/i.test(t)) return 'functions';
  if (/montrer|démontrer|prouver|justifier/i.test(t)) return 'proof';
  return 'general';
}

function detectPhysicsTopic(text) {
  const t = (text || '').toLowerCase();
  if (/circuit|résistance|tension|courant|ohm|condensat|capacit|bobine|inductance|impédance/i.test(t)) return 'circuits';
  if (/champ.*magnétique|induction|f\.?[eé]\.?m|faraday|solénoïde|flux/i.test(t)) return 'electromagnetism';
  if (/force|newton|poids|frottement|dynamique|accéléra/i.test(t)) return 'dynamics';
  if (/énergie|travail|puissance|cinétique|potentiel/i.test(t)) return 'energy';
  if (/onde|fréquence|longueur.*onde|célérité|période/i.test(t)) return 'waves';
  if (/optique|lentille|miroir|convergent|divergent|focale/i.test(t)) return 'optics';
  if (/cinémat|mouvement|vitesse|chute|projectile|trajectoire/i.test(t)) return 'kinematics';
  return 'general';
}

function detectChemTopic(text) {
  const t = (text || '').toLowerCase();
  if (/oxydation|réduction|redox/i.test(t)) return 'redox';
  if (/hydrolys/i.test(t)) return 'hydrolysis';
  if (/combustion|brûl/i.test(t)) return 'combustion';
  if (/estérif|ester|acide.*alcool/i.test(t)) return 'esterification';
  if (/mol|masse.*molair|concentration|volume.*molair|stœchiom|quantité.*matière/i.test(t)) return 'stoichiometry';
  if (/pH|acide|base|tampon|k_a/i.test(t)) return 'acidbase';
  if (/organique|carbone|hydrocarbure|alcool|alcane|alcène|aldéhyde|cétone|amine/i.test(t)) return 'organic';
  return 'general';
}

// ─── Single-question scaffold by subject + topic ────────────────────────────

function mathCalcScaffold(topic) {
  switch (topic) {
    case 'statistics': return {
      scaffold_text: "Statistiques :\n1. Calculer les moyennes $\\bar{x}$ et $\\bar{y}$ : {{0}}\n2. Appliquer la formule ($cov$, droite de régression, etc.) : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Moyennes ou données intermédiaires" }, { label: "Formule et calcul" }, { label: "Résultat" }],
    };
    case 'probability': return {
      scaffold_text: "Probabilité :\n1. Univers — nombre total de cas $|\\Omega|$ : {{0}}\n2. Cas favorables et calcul : {{1}}\n3. Résultat ($P$, $E(X)$, $\\sigma$, etc.) : {{2}}",
      scaffold_blanks: [{ label: "Univers / total de cas" }, { label: "Cas favorables / calcul" }, { label: "Résultat" }],
    };
    case 'matrices': return {
      scaffold_text: "Calcul matriciel :\n1. Données (matrice, trace, déterminant) : {{0}}\n2. Opération appliquée : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données matricielles" }, { label: "Calcul (produit, det, inverse)" }, { label: "Résultat" }],
    };
    case 'complex': return {
      scaffold_text: "Nombres complexes :\n1. Forme algébrique $z = a + bi$ : {{0}}\n2. Module et argument : {{1}}\n3. Résultat demandé : {{2}}",
      scaffold_blanks: [{ label: "Forme algébrique" }, { label: "Module et/ou argument" }, { label: "Résultat" }],
    };
    case 'sequences': return {
      scaffold_text: "Suites :\n1. Premiers termes ou formule : {{0}}\n2. Nature (arithm./géom.) et raison : {{1}}\n3. Résultat (formule, somme, limite) : {{2}}",
      scaffold_blanks: [{ label: "Termes calculés ou formule explicite" }, { label: "Nature et raison" }, { label: "Résultat" }],
    };
    case 'integrals': return {
      scaffold_text: "Intégrale / primitive :\n1. Primitive de la fonction : {{0}}\n2. Application des bornes / calcul : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Primitive $F(x)$" }, { label: "Calcul $F(b) - F(a)$" }, { label: "Valeur de l'intégrale" }],
    };
    case 'derivatives': return {
      scaffold_text: "Dérivation :\n1. Règle de dérivation applicable : {{0}}\n2. Calcul de $f'(x)$ : {{1}}\n3. Résultat simplifié : {{2}}",
      scaffold_blanks: [{ label: "Règle (chaîne, produit, quotient)" }, { label: "Expression de $f'(x)$" }, { label: "Forme simplifiée" }],
    };
    case 'limits': return {
      scaffold_text: "Limite :\n1. Substitution directe — forme obtenue : {{0}}\n2. Méthode (factorisation, L'Hôpital, etc.) : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Forme ($\\frac{0}{0}$, nombre, etc.)" }, { label: "Méthode et calcul" }, { label: "Valeur de la limite" }],
    };
    case 'logarithms': return {
      scaffold_text: "Logarithmes :\n1. Propriété utilisée : {{0}}\n2. Simplification : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Propriété ($\\ln(ab)$, $\\ln(a^n)$, etc.)" }, { label: "Calcul" }, { label: "Résultat" }],
    };
    case 'exponentials': return {
      scaffold_text: "Exponentielle :\n1. Propriété appliquée : {{0}}\n2. Calcul : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Propriété ($e^{a+b}$, dérivée, etc.)" }, { label: "Calcul" }, { label: "Résultat" }],
    };
    case 'trigonometry': return {
      scaffold_text: "Trigonométrie :\n1. Formule / identité utilisée : {{0}}\n2. Calcul : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Identité" }, { label: "Calcul" }, { label: "Résultat" }],
    };
    case 'equations': return {
      scaffold_text: "Résolution d'équation :\n1. Mise en forme : {{0}}\n2. Discriminant / méthode : {{1}}\n3. Solutions : {{2}}",
      scaffold_blanks: [{ label: "Équation réécrite" }, { label: "Méthode (discriminant, factorisation)" }, { label: "Ensemble de solutions" }],
    };
    case 'functions': return {
      scaffold_text: "Étude de fonction :\n1. Domaine de définition $D_f$ : {{0}}\n2. Dérivée et signe de $f'(x)$ : {{1}}\n3. Tableau de variation / résultat : {{2}}",
      scaffold_blanks: [{ label: "Domaine $D_f$" }, { label: "$f'(x)$ et signe" }, { label: "Résultat (extrema, etc.)" }],
    };
    case 'vectors': return {
      scaffold_text: "Calcul vectoriel :\n1. Coordonnées des vecteurs : {{0}}\n2. Opération (norme, produit scalaire) : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Composantes" }, { label: "Calcul" }, { label: "Résultat" }],
    };
    case 'geometry': return {
      scaffold_text: "Géométrie :\n1. Données (longueurs, angles) : {{0}}\n2. Théorème appliqué : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données" }, { label: "Théorème" }, { label: "Résultat" }],
    };
    case 'factoring': return {
      scaffold_text: "Factorisation :\n1. Facteur commun : {{0}}\n2. Identité remarquable : {{1}}\n3. Forme factorisée : {{2}}",
      scaffold_blanks: [{ label: "Facteur commun" }, { label: "Identité" }, { label: "Expression factorisée" }],
    };
    default: return {
      scaffold_text: "Résolution :\n1. Formule ou méthode : {{0}}\n2. Calcul : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Formule / méthode" }, { label: "Calcul détaillé" }, { label: "Résultat" }],
    };
  }
}

function physicsCalcScaffold(topic) {
  switch (topic) {
    case 'circuits': return {
      scaffold_text: "Circuit électrique :\n1. Grandeurs connues ($R$, $C$, $L$, $U$, $I$) : {{0}}\n2. Loi ou formule : {{1}}\n3. Application numérique : {{2}}\n4. Résultat avec unité : {{3}}",
      scaffold_blanks: [{ label: "Données" }, { label: "Formule" }, { label: "Calcul numérique" }, { label: "Résultat + unité" }],
    };
    case 'electromagnetism': return {
      scaffold_text: "Électromagnétisme :\n1. Données ($B$, $N$, $S$, $\\Delta t$) : {{0}}\n2. Loi appliquée (Faraday, etc.) : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données" }, { label: "Formule" }, { label: "Résultat + unité" }],
    };
    case 'dynamics': return {
      scaffold_text: "Dynamique :\n1. Bilan des forces : {{0}}\n2. Application de $\\sum \\vec{F} = m\\vec{a}$ : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Forces identifiées" }, { label: "Projection et calcul" }, { label: "Résultat + unité" }],
    };
    case 'energy': return {
      scaffold_text: "Énergie :\n1. Formes d'énergie en jeu : {{0}}\n2. Formule et calcul : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Types d'énergie" }, { label: "Calcul" }, { label: "Résultat (J, W)" }],
    };
    case 'waves': return {
      scaffold_text: "Ondes :\n1. Données ($f$, $\\lambda$, $T$, $v$) : {{0}}\n2. Relation $v = \\lambda f$ ou $T = 1/f$ : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données" }, { label: "Formule" }, { label: "Résultat + unité" }],
    };
    case 'optics': return {
      scaffold_text: "Optique :\n1. Données ($f'$, $\\overline{OA}$) : {{0}}\n2. Relation de conjugaison : {{1}}\n3. Position de l'image et grandissement : {{2}}",
      scaffold_blanks: [{ label: "Données optiques" }, { label: "Calcul" }, { label: "Image + grandissement" }],
    };
    case 'kinematics': return {
      scaffold_text: "Cinématique :\n1. Données ($v_0$, $a$, $t$, $x_0$) : {{0}}\n2. Équation(s) horaire(s) : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données et type de mouvement" }, { label: "Équation(s)" }, { label: "Résultat" }],
    };
    default: return {
      scaffold_text: "Résolution (physique) :\n1. Données et grandeurs : {{0}}\n2. Loi / formule : {{1}}\n3. Résultat avec unité : {{2}}",
      scaffold_blanks: [{ label: "Données + unités" }, { label: "Formule" }, { label: "Résultat + unité" }],
    };
  }
}

function chemCalcScaffold(topic) {
  switch (topic) {
    case 'redox': return {
      scaffold_text: "Oxydo-réduction :\n1. Oxydant / réducteur : {{0}}\n2. Demi-équations : {{1}}\n3. Équation bilan : {{2}}",
      scaffold_blanks: [{ label: "Oxydant et réducteur" }, { label: "Demi-équations" }, { label: "Équation bilan" }],
    };
    case 'stoichiometry': return {
      scaffold_text: "Stœchiométrie :\n1. Données ($m$, $M$, $C$, $V$) : {{0}}\n2. Calcul de $n$ : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Données numériques" }, { label: "Quantité de matière $n$" }, { label: "Résultat + unité" }],
    };
    case 'acidbase': return {
      scaffold_text: "Acido-basique :\n1. Données ($C$, $K_a$) : {{0}}\n2. Calcul ($pH = -\\log[H^+]$) : {{1}}\n3. pH = {{2}}",
      scaffold_blanks: [{ label: "Données" }, { label: "Calcul" }, { label: "Valeur du pH" }],
    };
    case 'organic': return {
      scaffold_text: "Chimie organique :\n1. Groupe fonctionnel / famille : {{0}}\n2. Formule ou réaction : {{1}}\n3. Nom IUPAC / résultat : {{2}}",
      scaffold_blanks: [{ label: "Famille et groupe fonctionnel" }, { label: "Formule ou équation" }, { label: "Résultat" }],
    };
    default: return {
      scaffold_text: "Réaction chimique :\n1. Réactifs : {{0}}\n2. Produits et équation bilan : {{1}}\n3. Résultat : {{2}}",
      scaffold_blanks: [{ label: "Réactifs" }, { label: "Équation bilan" }, { label: "Résultat" }],
    };
  }
}

// ─── fill_blank — contextual scaffold ───────────────────────────────────────

function fillBlankScaffold(question, cat) {
  const text = question.question || '';

  if (cat === 'math') {
    const topic = detectMathTopic(text);
    switch (topic) {
      case 'derivatives': return {
        scaffold_text: "Appliquer la règle de dérivation :\n\nVotre réponse : $f'(x) = $ {{0}}",
        scaffold_blanks: [{ label: "Expression de la dérivée $f'(x)$" }],
      };
      case 'sequences': return {
        scaffold_text: "Calculer la valeur demandée pour la suite :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur (raison, terme, somme)" }],
      };
      case 'complex': return {
        scaffold_text: "Écrire le nombre complexe sous la forme demandée :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Forme algébrique, trigonométrique ou exponentielle" }],
      };
      case 'matrices': return {
        scaffold_text: "Calculer la valeur matricielle demandée :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur (trace, déterminant, élément)" }],
      };
      case 'probability': return {
        scaffold_text: "Calculer la probabilité ou l'espérance demandée :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur numérique ($P$, $E(X)$, $\\sigma$)" }],
      };
      case 'statistics': return {
        scaffold_text: "Calculer le paramètre statistique demandé :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur ($\\bar{x}$, $cov$, $a$, etc.)" }],
      };
      case 'logarithms': return {
        scaffold_text: "Simplifier l'expression logarithmique :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Expression simplifiée" }],
      };
      case 'exponentials': return {
        scaffold_text: "Calculer l'expression exponentielle :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur ou expression" }],
      };
      case 'functions': return {
        scaffold_text: "Déterminer le domaine ou la propriété de la fonction :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Domaine $D_f$ ou résultat" }],
      };
      case 'integrals': return {
        scaffold_text: "Calculer l'intégrale ou la primitive :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur de l'intégrale ou primitive" }],
      };
      case 'equations': return {
        scaffold_text: "Résoudre l'équation :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Ensemble de solutions" }],
      };
      case 'trigonometry': return {
        scaffold_text: "Calculer la valeur trigonométrique :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur trigonométrique" }],
      };
      case 'vectors': return {
        scaffold_text: "Calculer la valeur vectorielle demandée :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Composantes ou norme" }],
      };
      case 'geometry': return {
        scaffold_text: "Calculer la mesure géométrique :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Longueur, angle ou aire" }],
      };
      default: return {
        scaffold_text: "Calculer la valeur manquante :\n\nVotre réponse : {{0}}",
        scaffold_blanks: [{ label: "Valeur ou expression" }],
      };
    }
  }

  if (cat === 'physics') return {
    scaffold_text: "Compléter avec la grandeur physique ou le terme correct :\n\nVotre réponse : {{0}}",
    scaffold_blanks: [{ label: "Grandeur, terme ou valeur + unité" }],
  };

  if (cat === 'chemistry') return {
    scaffold_text: "Compléter avec le terme chimique, la formule ou le produit :\n\nVotre réponse : {{0}}",
    scaffold_blanks: [{ label: "Terme, formule ou produit chimique" }],
  };

  if (cat === 'english') return {
    scaffold_text: "Fill in with the correct word or expression:\n\nYour answer: {{0}}",
    scaffold_blanks: [{ label: "Word, phrase, or grammatical form" }],
  };

  if (cat === 'spanish') return {
    scaffold_text: "Complete con la palabra o expresión correcta:\n\nSu respuesta: {{0}}",
    scaffold_blanks: [{ label: "Palabra o expresión" }],
  };

  if (cat === 'biology') return {
    scaffold_text: "Compléter avec le terme biologique approprié :\n\nVotre réponse : {{0}}",
    scaffold_blanks: [{ label: "Terme scientifique" }],
  };

  return {
    scaffold_text: "Compléter :\n\nVotre réponse : {{0}}",
    scaffold_blanks: [{ label: "Réponse" }],
  };
}

// ─── MCQ scaffold ───────────────────────────────────────────────────────────

function mcqScaffold(question) {
  const opts = question.options || {};
  const entries = Object.entries(opts);
  if (entries.length === 0) return null;

  const optionList = entries.map(([k, v]) =>
    `${k.toUpperCase()}) ${typeof v === 'string' ? v : JSON.stringify(v)}`
  ).join(' | ');

  return {
    scaffold_text:
      `Options : ${optionList}\n\n` +
      "1. La bonne réponse est l'option : {{0}}\n" +
      "2. Justification : {{1}}",
    scaffold_blanks: [
      { label: "Lettre de la bonne option" },
      { label: "Explication de votre choix" },
    ],
  };
}

// ─── Essay / short_answer scaffolds ─────────────────────────────────────────

function essayScaffold(cat) {
  switch (cat) {
    case 'english': return {
      scaffold_text: "Introduction — state the topic and your position:\n{{0}}\n\nBody — arguments with examples:\n{{1}}\n\nConclusion — summarize:\n{{2}}",
      scaffold_blanks: [{ label: "Introduction (2-3 sentences)" }, { label: "Arguments + examples" }, { label: "Conclusion" }],
    };
    case 'spanish': return {
      scaffold_text: "Introducción — presentar el tema:\n{{0}}\n\nDesarrollo — argumentos con ejemplos:\n{{1}}\n\nConclusión:\n{{2}}",
      scaffold_blanks: [{ label: "Introducción" }, { label: "Argumentos + ejemplos" }, { label: "Conclusión" }],
    };
    case 'philosophy': return {
      scaffold_text: "Introduction — reformuler le sujet, problématique, plan :\n{{0}}\n\nThèse — argument + exemple :\n{{1}}\n\nAntithèse — argument contraire + exemple :\n{{2}}\n\nSynthèse / conclusion :\n{{3}}",
      scaffold_blanks: [{ label: "Introduction (problématique + plan)" }, { label: "Thèse (argument + référence)" }, { label: "Antithèse" }, { label: "Synthèse et conclusion" }],
    };
    case 'french': return {
      scaffold_text: "Introduction — sujet et problématique :\n{{0}}\n\nDéveloppement — argument 1 + exemple :\n{{1}}\n\nDéveloppement — argument 2 + exemple :\n{{2}}\n\nConclusion :\n{{3}}",
      scaffold_blanks: [{ label: "Introduction" }, { label: "Argument 1 + exemple" }, { label: "Argument 2 + exemple" }, { label: "Conclusion" }],
    };
    case 'history': return {
      scaffold_text: "Introduction — situer le contexte :\n{{0}}\n\nDéveloppement — faits et analyse :\n{{1}}\n\nConclusion — bilan :\n{{2}}",
      scaffold_blanks: [{ label: "Contexte et problématique" }, { label: "Faits, dates, analyse" }, { label: "Bilan" }],
    };
    default: return {
      scaffold_text: "Introduction :\n{{0}}\n\nDéveloppement :\n{{1}}\n\nConclusion :\n{{2}}",
      scaffold_blanks: [{ label: "Introduction" }, { label: "Développement (arguments + exemples)" }, { label: "Conclusion" }],
    };
  }
}

function shortAnswerScaffold(cat, text) {
  // Check for multi-part in short_answer too
  const subParts = splitSubParts(text);
  if (subParts) return buildMultiPartScaffold(subParts);

  switch (cat) {
    case 'biology': return {
      scaffold_text: "1. Terme ou concept clé : {{0}}\n2. Explication / mécanisme : {{1}}\n3. Exemple : {{2}}",
      scaffold_blanks: [{ label: "Terme scientifique" }, { label: "Explication" }, { label: "Exemple" }],
    };
    case 'english': return {
      scaffold_text: "1. Key idea: {{0}}\n2. Supporting detail: {{1}}",
      scaffold_blanks: [{ label: "Main answer" }, { label: "Supporting detail" }],
    };
    case 'spanish': return {
      scaffold_text: "1. Idea principal: {{0}}\n2. Detalle de apoyo: {{1}}",
      scaffold_blanks: [{ label: "Respuesta principal" }, { label: "Justificación" }],
    };
    case 'philosophy': return {
      scaffold_text: "1. Concept philosophique : {{0}}\n2. Explication : {{1}}\n3. Référence (auteur, œuvre) : {{2}}",
      scaffold_blanks: [{ label: "Concept clé" }, { label: "Explication" }, { label: "Référence" }],
    };
    case 'economics': return {
      scaffold_text: "1. Terme économique : {{0}}\n2. Définition : {{1}}\n3. Exemple : {{2}}",
      scaffold_blanks: [{ label: "Terme" }, { label: "Définition" }, { label: "Exemple" }],
    };
    case 'history': return {
      scaffold_text: "1. Fait / date / lieu : {{0}}\n2. Contexte : {{1}}\n3. Conséquence : {{2}}",
      scaffold_blanks: [{ label: "Fait clé" }, { label: "Contexte" }, { label: "Conséquence" }],
    };
    default: return {
      scaffold_text: "1. Réponse : {{0}}\n2. Justification : {{1}}",
      scaffold_blanks: [{ label: "Réponse" }, { label: "Justification" }],
    };
  }
}

// ─── T/F, Matching ──────────────────────────────────────────────────────────

function tfScaffold() {
  return {
    scaffold_text: "1. Cette affirmation est : {{0}}\n2. Justification : {{1}}",
    scaffold_blanks: [{ label: "Vrai ou Faux" }, { label: "Explication" }],
  };
}

function matchingScaffold() {
  return {
    scaffold_text: "Correspondances :\n1. Paires évidentes : {{0}}\n2. Paires restantes : {{1}}\n3. Liste complète (1-B, 2-A, …) : {{2}}",
    scaffold_blanks: [{ label: "Paires évidentes" }, { label: "Paires restantes" }, { label: "Liste complète" }],
  };
}

// ─── Main scaffold selection ────────────────────────────────────────────────

function selectScaffold(question, subject) {
  const cat = subjectCategory(subject);
  const type = question.type || 'short_answer';
  const text = question.question || '';

  // --- Step 1: check for multi-part structure ---
  if (type === 'calculation' || type === 'short_answer' || type === 'essay') {
    const subParts = splitSubParts(text);
    if (subParts && subParts.length >= 2) {
      return buildMultiPartScaffold(subParts);
    }
  }

  // --- Step 2: type-specific scaffolds ---
  if (type === 'multiple_choice') return mcqScaffold(question);
  if (type === 'true_false') return tfScaffold();
  if (type === 'matching') return matchingScaffold();
  if (type === 'fill_blank') return fillBlankScaffold(question, cat);

  if (type === 'essay') return essayScaffold(cat);

  // --- Step 3: calculation with single-part ---
  if (type === 'calculation') {
    switch (cat) {
      case 'math': return mathCalcScaffold(detectMathTopic(text));
      case 'physics': return physicsCalcScaffold(detectPhysicsTopic(text));
      case 'chemistry': return chemCalcScaffold(detectChemTopic(text));
      case 'economics': return {
        scaffold_text: "Calcul économique :\n1. Données : {{0}}\n2. Formule et calcul : {{1}}\n3. Résultat : {{2}}",
        scaffold_blanks: [{ label: "Données" }, { label: "Formule et calcul" }, { label: "Résultat" }],
      };
      default: return {
        scaffold_text: "Résolution :\n1. Données : {{0}}\n2. Méthode et calcul : {{1}}\n3. Résultat : {{2}}",
        scaffold_blanks: [{ label: "Données" }, { label: "Calcul" }, { label: "Résultat" }],
      };
    }
  }

  // --- Step 4: short_answer ---
  if (type === 'short_answer') return shortAnswerScaffold(cat, text);

  // Fallback
  return {
    scaffold_text: "1. Réponse : {{0}}\n2. Justification : {{1}}",
    scaffold_blanks: [{ label: "Réponse" }, { label: "Justification" }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HINTS (v2 — more precise keyword matching)
// ═══════════════════════════════════════════════════════════════════════════════

const MATH_HINTS_V2 = {
  'statistics': [
    'Calculez d\'abord les moyennes $\\bar{x}$ et $\\bar{y}$.',
    'Covariance : $cov(x,y) = \\frac{1}{n}\\sum x_i y_i - \\bar{x}\\bar{y}$. Droite de régression : $y = ax + b$ avec $a = \\frac{cov(x,y)}{V(x)}$.',
    'Le point moyen $G(\\bar{x}, \\bar{y})$ appartient toujours à la droite de régression.',
  ],
  'probability': [
    'Identifiez l\'univers $\\Omega$ et comptez les cas (combinaisons si tirage sans remise).',
    'Pour une variable aléatoire : $E(X) = \\sum x_i P(X=x_i)$ et $V(X) = E(X^2) - [E(X)]^2$.',
    'Vérifiez que $\\sum P(X=x_i) = 1$.',
  ],
  'matrices': [
    'Trace = somme des éléments diagonaux. Déterminant $2\\times 2$ : $ad - bc$.',
    'Pour inverser, vérifiez que $\\det \\neq 0$, puis utilisez la formule de la comatrice.',
    'Produit matriciel : l\'élément $(i,j)$ est le produit scalaire de la ligne $i$ par la colonne $j$.',
  ],
  'complex': [
    'Forme algébrique : $z = a + bi$. Module : $|z| = \\sqrt{a^2 + b^2}$.',
    'Forme exponentielle : $z = |z|e^{i\\theta}$ avec $\\theta = \\arg(z)$.',
    'Pour résoudre $P(z)=0$, cherchez une racine évidente, puis factorisez.',
  ],
  'sequences': [
    'Suite arithmétique : $u_{n+1} = u_n + r$ → $u_n = u_0 + nr$ → $S_n = \\frac{(n+1)(u_0+u_n)}{2}$.',
    'Suite géométrique : $u_{n+1} = u_n \\times q$ → $u_n = u_0 \\times q^n$ → $S_n = u_0 \\times \\frac{1-q^{n+1}}{1-q}$.',
    'Pour la raison, calculez $\\frac{u_{n+1}}{u_n}$ (géom.) ou $u_{n+1} - u_n$ (arithm.).',
  ],
  'integrals': [
    'Cherchez une primitive $F$ telle que $F\'(x) = f(x)$.',
    '$\\int_a^b f(x)dx = F(b) - F(a)$. Valeur moyenne : $\\frac{1}{b-a}\\int_a^b f(x)dx$.',
    'Pour $\\int \\frac{u\'}{u} dx = \\ln|u| + C$ et $\\int u\' e^u dx = e^u + C$.',
  ],
  'derivatives': [
    'Formules : $(x^n)\' = nx^{n-1}$, $(e^u)\' = u\'e^u$, $(\\ln u)\' = \\frac{u\'}{u}$.',
    'Règle de la chaîne : $(f \\circ g)\' = (f\' \\circ g) \\cdot g\'$.',
    'Produit : $(uv)\' = u\'v + uv\'$. Quotient : $(\\frac{u}{v})\' = \\frac{u\'v - uv\'}{v^2}$.',
  ],
  'limits': [
    'Essayez la substitution directe. Forme indéterminée → factorisez ou L\'Hôpital.',
    'En $\\pm\\infty$ : divisez par le terme dominant.',
    'Croissances comparées : $e^x \\gg x^n \\gg \\ln x$ quand $x \\to +\\infty$.',
  ],
  'logarithms': [
    '$\\ln(ab) = \\ln a + \\ln b$, $\\ln(a/b) = \\ln a - \\ln b$, $\\ln(a^n) = n\\ln a$.',
    '$\\ln(e) = 1$, $\\ln(1) = 0$. Domaine : argument > 0.',
    'Pour résoudre $\\ln(f(x)) = k$ : $f(x) = e^k$ (si $f(x) > 0$).',
  ],
  'exponentials': [
    '$e^{a+b} = e^a \\cdot e^b$, $e^0 = 1$, $(e^x)\' = e^x$.',
    'Dérivée de $e^{u(x)}$ : $u\'(x) \\cdot e^{u(x)}$.',
    'Pour résoudre $e^{f(x)} = k$ avec $k > 0$ : $f(x) = \\ln k$.',
  ],
  'functions': [
    'Domaine : trouvez les valeurs où $f(x)$ est définie (dénominateur $\\neq 0$, argument du $\\ln > 0$, etc.).',
    'Dérivez pour trouver les variations : $f\' > 0$ → croissante, $f\' < 0$ → décroissante.',
    'Calculez les limites aux bornes du domaine.',
  ],
  'equations': [
    'Isolez l\'inconnue. Pour le 2nd degré : $\\Delta = b^2 - 4ac$.',
    'Si $\\Delta > 0$ : 2 solutions, $\\Delta = 0$ : 1 solution, $\\Delta < 0$ : pas de solution réelle.',
    'Vérifiez vos solutions dans l\'équation originale.',
  ],
  'trigonometry': [
    'Valeurs remarquables : $\\sin 30° = \\frac{1}{2}$, $\\cos 60° = \\frac{1}{2}$, $\\sin 45° = \\frac{\\sqrt{2}}{2}$.',
    '$\\sin^2 x + \\cos^2 x = 1$, $\\tan x = \\frac{\\sin x}{\\cos x}$.',
    'Formules d\'addition et de duplication.',
  ],
  'vectors': [
    '$\\vec{AB} = (x_B - x_A, y_B - y_A)$. Norme : $\\|\\vec{u}\\| = \\sqrt{x^2 + y^2}$.',
    'Colinéarité : $\\det(\\vec{u}, \\vec{v}) = x_u y_v - y_u x_v = 0$.',
    'Produit scalaire : $\\vec{u} \\cdot \\vec{v} = x_u x_v + y_u y_v = \\|\\vec{u}\\|\\|\\vec{v}\\|\\cos\\theta$.',
  ],
  'geometry': [
    'Pythagore : $a^2 + b^2 = c^2$. Thalès : rapports de longueurs parallèles.',
    'Aire du triangle : $\\frac{1}{2}bh$. Théorème de la médiane, bissectrice.',
    'Propriétés des figures : angles inscrits, tangentes, etc.',
  ],
  'proof': [
    'Identifiez ce qu\'il faut montrer (l\'objectif) et les hypothèses (le point de départ).',
    'Essayez une approche directe, par récurrence, ou par l\'absurde.',
    'Reliez chaque étape à un théorème ou une propriété connue.',
  ],
  'general': [
    'Identifiez les données et la question posée.',
    'Choisissez la formule ou le théorème approprié.',
    'Vérifiez votre résultat.',
  ],
};

const PHYSICS_HINTS_V2 = {
  'circuits': [
    'Loi d\'Ohm : $U = R \\cdot I$. Impédance : $Z = \\sqrt{R^2 + (L\\omega - \\frac{1}{C\\omega})^2}$.',
    'Série : $R_{eq} = R_1 + R_2$. Parallèle : $\\frac{1}{R_{eq}} = \\frac{1}{R_1} + \\frac{1}{R_2}$.',
    'Lois de Kirchhoff : nœuds (courants) et mailles (tensions).',
  ],
  'electromagnetism': [
    'Loi de Faraday : $e = -\\frac{d\\Phi}{dt}$, avec $\\Phi = NBS\\cos\\theta$.',
    'F.é.m. d\'auto-induction : $e = -L\\frac{dI}{dt}$.',
    'Force de Laplace : $\\vec{F} = I\\vec{l} \\times \\vec{B}$.',
  ],
  'dynamics': [
    'PFD : $\\sum \\vec{F} = m\\vec{a}$. Faites le bilan des forces.',
    'Poids : $P = mg$. Frottement : $f = \\mu N$.',
    'Projetez sur les axes et résolvez.',
  ],
  'energy': [
    '$E_c = \\frac{1}{2}mv^2$, $E_p = mgh$. Théorème de l\'énergie cinétique.',
    'Conservation : $E_c + E_p = $ constante (si pas de frottement).',
    'Puissance : $P = \\frac{W}{\\Delta t} = F \\cdot v$.',
  ],
  'waves': [
    '$v = \\lambda f$, $T = \\frac{1}{f}$.',
    'Distinguez ondes mécaniques et électromagnétiques.',
    'Diffraction : plus le trou est petit, plus l\'effet est grand.',
  ],
  'optics': [
    'Conjugaison : $\\frac{1}{\\overline{OA\'}} - \\frac{1}{\\overline{OA}} = \\frac{1}{f\'}$.',
    'Grandissement : $\\gamma = \\frac{\\overline{A\'B\'}}{\\overline{AB}} = \\frac{\\overline{OA\'}}{\\overline{OA}}$.',
    'Image réelle ↔ du côté transmis. Image virtuelle ↔ même côté.',
  ],
  'kinematics': [
    'MRU : $x = x_0 + vt$. MRUA : $x = x_0 + v_0 t + \\frac{1}{2}at^2$.',
    '$v = v_0 + at$. $v^2 = v_0^2 + 2a(x - x_0)$.',
    'Choisissez le référentiel et les axes avant de projeter.',
  ],
};

const CHEMISTRY_HINTS_V2 = {
  'redox': [
    'Oxydant = gagne des $e^-$ (se réduit). Réducteur = perd des $e^-$ (s\'oxyde).',
    'Écrivez les demi-équations, équilibrez les $e^-$, puis combinez.',
    'Vérifiez la conservation des atomes ET des charges.',
  ],
  'stoichiometry': [
    '$n = \\frac{m}{M}$, $C = \\frac{n}{V}$. Volume molaire : $V_m = 22{,}4$ L/mol (CNTP).',
    'Utilisez les coefficients stœchiométriques pour les rapports molaires.',
    'Vérifiez l\'unité du résultat (g, mol, L, mol/L).',
  ],
  'acidbase': [
    '$pH = -\\log[H_3O^+]$. Acide fort → dissociation totale.',
    'Acide faible : $K_a = \\frac{[A^-][H_3O^+]}{[HA]}$.',
    'À 25°C : $pH + pOH = 14$ et $K_e = 10^{-14}$.',
  ],
  'organic': [
    'Groupes fonctionnels : $-OH$ (alcool), $-COOH$ (acide), $-CHO$ (aldéhyde), $-CO-$ (cétone).',
    'Alcanes : $C_nH_{2n+2}$. Alcènes : $C_nH_{2n}$.',
    'Nommez selon IUPAC : chaîne la plus longue + suffixe du groupe.',
  ],
  'hydrolysis': [
    'Hydrolyse = réaction avec l\'eau. Identifiez les produits.',
    'Équilibrez l\'équation chimique (atomes et charges).',
    'Calculez les quantités de matière en utilisant les coefficients.',
  ],
  'combustion': [
    'Combustion complète : $C_xH_y + O_2 \\to CO_2 + H_2O$.',
    'Équilibrez C, puis H, puis O en dernier.',
    'Combustion incomplète → $CO$ ou $C$ (suie).',
  ],
};

function generateHintsV2(question, subject) {
  const text = (question.question || '').toLowerCase();
  const type = question.type || 'short_answer';
  const cat = subjectCategory(subject);

  // --- Math hints (precise topic matching) ---
  if (cat === 'math') {
    const topic = detectMathTopic(text);
    if (MATH_HINTS_V2[topic]) return [...MATH_HINTS_V2[topic]];
    return [...MATH_HINTS_V2['general']];
  }

  // --- Physics hints ---
  if (cat === 'physics') {
    const topic = detectPhysicsTopic(text);
    if (PHYSICS_HINTS_V2[topic]) return [...PHYSICS_HINTS_V2[topic]];
    return [
      'Identifiez les grandeurs données et la grandeur cherchée.',
      'Choisissez la loi ou formule appropriée.',
      'Faites l\'application numérique et vérifiez l\'unité.',
    ];
  }

  // --- Chemistry hints ---
  if (cat === 'chemistry') {
    const topic = detectChemTopic(text);
    if (CHEMISTRY_HINTS_V2[topic]) return [...CHEMISTRY_HINTS_V2[topic]];
    return [
      'Identifiez les réactifs et les produits.',
      'Équilibrez l\'équation chimique.',
      'Vérifiez la conservation des atomes et des charges.',
    ];
  }

  // --- Biology / SVT ---
  if (cat === 'biology') {
    if (/cellul|mitose|méiose|division|cycle/i.test(text)) return [
      'Rappelez la structure cellulaire : membrane, cytoplasme, noyau.',
      'Mitose → 2 cellules identiques (diploïdes). Méiose → 4 cellules haploïdes.',
      'Identifiez la phase du cycle.',
    ];
    if (/génétiq|gène|chromosome|allèle|phénotype|croisement/i.test(text)) return [
      'Échiquier de Punnett pour les croisements.',
      'Dominant (majuscule) masque récessif (minuscule).',
      'Génotype = allèles. Phénotype = caractère visible.',
    ];
    return [
      'Identifiez le processus biologique en question.',
      'Faites un schéma pour organiser les étapes.',
      'Reliez structure et fonction.',
    ];
  }

  // --- English ---
  if (cat === 'english') {
    if (/according.*text|passage|reading|comprehension|text/i.test(text)) return [
      'Read the question first, then scan the text for relevant information.',
      'Pay attention to transition words (however, therefore, although).',
      'For inference questions, look for what the text implies, not just states.',
    ];
    if (/tense|verb|grammar|conjugat|transform/i.test(text)) return [
      'Identify time markers (yesterday, tomorrow, always, currently).',
      'Check subject-verb agreement and tense consistency.',
      'Review: simple past, present perfect, conditional, passive voice.',
    ];
    return [
      'Read the question carefully — identify what is being asked.',
      'Look for key words in the question and answer options.',
      'Eliminate clearly wrong answers first.',
    ];
  }

  // --- Spanish ---
  if (cat === 'spanish') return [
    'Lee la pregunta atentamente e identifica las palabras clave.',
    'Recuerda las reglas de concordancia: género y número.',
    'Presta atención a los tiempos verbales.',
  ];

  // --- Philosophy ---
  if (cat === 'philosophy') {
    return type === 'essay'
      ? [
        'Reformulez le sujet sous forme de question (problématique).',
        'Thèse / Antithèse / Synthèse : organisez votre plan.',
        'Citez au moins un philosophe pour appuyer votre argument.',
      ]
      : [
        'Définissez les termes clés du sujet.',
        'Distinguez les différentes positions philosophiques.',
        'Appuyez-vous sur des exemples ou des références.',
      ];
  }

  // --- History ---
  if (cat === 'history') return [
    'Situez les événements dans leur contexte historique.',
    'Identifiez les causes, les faits et les conséquences.',
    'Utilisez des dates et des noms précis.',
  ];

  // --- Economics ---
  if (cat === 'economics') return [
    'Identifiez les données et la grandeur économique cherchée.',
    'Appliquez la formule appropriée.',
    'Vérifiez l\'unité et la cohérence du résultat.',
  ];

  // --- Generic by type ---
  switch (type) {
    case 'multiple_choice':
      return ['Éliminez les options clairement incorrectes.', 'Relisez la question — un mot clé peut changer le sens.', 'Choisissez la réponse la plus complète.'];
    case 'true_false':
      return ['Un seul contre-exemple suffit pour rendre faux.', 'Attention aux mots absolus : toujours, jamais.', 'Relisez l\'affirmation mot par mot.'];
    case 'fill_blank':
      return ['Le contexte indique le type de réponse attendu.', 'Vérifiez la cohérence grammaticale.', 'Vérifiez les unités si applicable.'];
    case 'essay':
      return ['Introduction → développement → conclusion.', 'Appuyez chaque argument sur un exemple.', 'Relisez pour corriger les fautes.'];
    default:
      return ['Lisez attentivement la question.', 'Identifiez les mots clés.', 'Vérifiez votre réponse.'];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('Loading catalog…');
const catalog = JSON.parse(readFileSync(CATALOG, 'utf-8'));

let total = 0;
let scaffolded = 0;
let multiPartScaffolded = 0;
let hintsUpdated = 0;
let skippedHasAnswer = 0;

for (const exam of catalog) {
  const subject = exam.subject || '';
  for (const section of (exam.sections || [])) {
    for (const q of (section.questions || [])) {
      total++;

      // --- Always regenerate hints (v2) ---
      q.hints = generateHintsV2(q, subject);
      hintsUpdated++;

      // --- Scaffold only for questions without correct answer ---
      if (q.correct && q.correct !== '') {
        skippedHasAnswer++;
        // Clean up old scaffolds on answered questions
        delete q.scaffold_text;
        delete q.scaffold_blanks;
        continue;
      }

      const result = selectScaffold(q, subject);
      if (result) {
        q.scaffold_text = result.scaffold_text;
        q.scaffold_blanks = result.scaffold_blanks;
        scaffolded++;
        // Check if it was multi-part
        const subParts = splitSubParts(q.question || '');
        if (subParts && subParts.length >= 2) multiPartScaffolded++;
      }
    }
  }
}

console.log(`\nProcessed ${total} questions across ${catalog.length} exams`);
console.log(`  Scaffolded: ${scaffolded} (${multiPartScaffolded} multi-part)`);
console.log(`  Skipped (has answer): ${skippedHasAnswer}`);
console.log(`  Hints regenerated: ${hintsUpdated}`);

console.log('\nWriting catalog…');
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2), 'utf-8');
console.log('Done ✓');
