#!/usr/bin/env node
/**
 * generate_answers_and_hints.mjs
 *
 * Processes exam_catalog.json to:
 * 1. Attempt to derive answers for MCQ (evaluate options via CAS)
 * 2. Generate contextual, progressive hints for EVERY question
 * 3. Write the patched catalog back
 *
 * Run:  node scripts/generate_answers_and_hints.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '../public/exam_catalog.json');
const OUTPUT_PATH  = CATALOG_PATH; // overwrite in place

// ─── Inline CAS (same logic as mathCAS.js) ──────────────────────────────────

function latexToJs(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/^\$\$?|\$\$?$/g, '').trim();
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, '');
  s = s.replace(/\\text\{([^}]*)\}/g, '($1)');

  // Inner constructs first
  for (let i = 0; i < 10; i++) { const b = s; s = s.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g, 'Math.pow($2,1/($1))'); if (s === b) break; }
  for (let i = 0; i < 10; i++) { const b = s; s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'Math.sqrt($1)'); if (s === b) break; }
  for (let i = 0; i < 10; i++) { const b = s; s = s.replace(/([0-9a-zA-Z.)]+)\s*\^\s*\{([^{}]*)\}/g, 'Math.pow($1,$2)'); if (s === b) break; }
  s = s.replace(/([0-9a-zA-Z.)]+)\s*\^\s*([0-9a-zA-Z])/g, 'Math.pow($1,$2)');

  // Frac after inner constructs
  for (let i = 0; i < 10; i++) { const b = s; s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))'); if (s === b) break; }

  s = s.replace(/\\pi\b/g, 'Math.PI');
  const fns = ['sin','cos','tan','ln','log','exp','abs'];
  for (const fn of fns) {
    const jsFn = fn === 'ln' ? 'Math.log' : fn === 'abs' ? 'Math.abs' : `Math.${fn}`;
    s = s.replace(new RegExp(`\\\\${fn}\\s*\\{([^{}]*)\\}`, 'g'), `${jsFn}($1)`);
    s = s.replace(new RegExp(`\\\\${fn}\\s*\\(([^)]*)\\)`, 'g'), `${jsFn}($1)`);
    s = s.replace(new RegExp(`\\\\${fn}\\s+([0-9a-zA-Z.]+)`, 'g'), `${jsFn}($1)`);
  }
  s = s.replace(/\\times/g, '*');
  s = s.replace(/\\cdot/g, '*');
  s = s.replace(/\\div/g, '/');
  s = s.replace(/\\pm/g, '+');
  s = s.replace(/\\[a-zA-Z]+/g, '');
  s = s.replace(/\{/g, '(');
  s = s.replace(/\}/g, ')');
  s = s.replace(/([0-9])(\()/g, '$1*$2');
  s = s.replace(/(\))(\()/g, '$1*$2');
  s = s.replace(/(\))(Math\.)/g, '$1*$2');
  s = s.replace(/(\))([0-9a-zA-Z])/g, '$1*$2');
  s = s.replace(/([0-9])(Math\.)/g, '$1*$2');
  s = s.replace(/([0-9])([a-zA-Z])/g, '$1*$2');
  s = s.replace(/\s+/g, '');
  s = s.replace(/\+\-/g, '-');
  s = s.replace(/\-\+/g, '-');
  return s || null;
}

function safeEval(expr) {
  if (!expr) return NaN;
  const sanitized = expr.replace(/Math\.\w+/g, '');
  if (/[^0-9+\-*/().,%e ]/.test(sanitized)) return NaN;
  try { return new Function('Math', `"use strict"; return (${expr});`)(Math); }
  catch { return NaN; }
}

function evalExpr(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  const plain = parseFloat(s.replace(/,/g, '.'));
  if (!isNaN(plain) && /^[0-9,.\-+]+$/.test(s)) return plain;
  const js = latexToJs(s);
  if (js) { const v = safeEval(js); if (!isNaN(v)) return v; }
  const asIs = s.replace(/sqrt/gi,'Math.sqrt').replace(/pi/gi,'Math.PI').replace(/\^/g,'**');
  const v2 = safeEval(asIs);
  if (!isNaN(v2)) return v2;
  return NaN;
}

// ─── Subject normalization ─────────────────────────────────────────────────

function normSubject(s) {
  if (!s) return 'general';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ').trim()
    .replace(/\s+/g, ' ');
}

function subjectCategory(subject) {
  const n = normSubject(subject);
  if (/math/.test(n)) return 'math';
  if (/physi/.test(n)) return 'physics';
  if (/chimi/.test(n)) return 'chemistry';
  if (/svt|biolog|science.*vie/.test(n)) return 'biology';
  if (/anglais|english/.test(n)) return 'english';
  if (/espagnol|spanish/.test(n)) return 'spanish';
  if (/francais|french|litterature/.test(n)) return 'french';
  if (/philo/.test(n)) return 'philosophy';
  if (/histoire|geograph|hist/.test(n)) return 'history';
  if (/econom|comptab|gestion/.test(n)) return 'economics';
  if (/anatom|sante|soins|infirm/.test(n)) return 'health';
  if (/kreyol|creole/.test(n)) return 'creole';
  if (/informatiq|computer/.test(n)) return 'computing';
  return 'general';
}

// ─── MCQ answer derivation via CAS ────────────────────────────────────────

function tryDeriveMCQAnswer(question) {
  const opts = question.options;
  if (!opts || typeof opts !== 'object') return null;

  const entries = Object.entries(opts);
  if (entries.length < 2) return null;

  const text = (question.question || '').toLowerCase();

  // Strategy 1: If options are numeric/LaTeX expressions and one evaluates to
  // a value that matches a number embedded in the question, pick it
  const evaluatedOptions = [];
  for (const [key, val] of entries) {
    const v = evalExpr(val);
    evaluatedOptions.push({ key, text: val, value: v });
  }

  // Strategy 2: true/false MCQ patterns
  if (entries.length === 2) {
    const texts = entries.map(([, v]) => v.toLowerCase().trim());
    if ((texts.includes('vrai') && texts.includes('faux')) ||
        (texts.includes('true') && texts.includes('false'))) {
      // Can't determine without solving — skip
      return null;
    }
  }

  // Strategy 3: "None of the above" / "Toutes les réponses" patterns
  for (const [key, val] of entries) {
    const lv = String(val).toLowerCase();
    if (lv.includes('toutes les réponses') || lv.includes('toutes ces réponses') ||
        lv.includes('all of the above')) {
      // Check if multiple other options are valid — not enough info to confirm
    }
  }

  return null; // Only return if we're confident — avoid wrong answers
}

// ─── Hint generation ────────────────────────────────────────────────────────

// Subject-specific keyword→hint mappings
const MATH_HINTS = {
  'factoriser': [
    'Cherchez un facteur commun à tous les termes.',
    'Pensez aux identités remarquables : $(a+b)^2$, $(a-b)^2$, $a^2 - b^2$.',
    'Mettez en évidence le plus grand facteur commun, puis utilisez une identité remarquable si possible.',
  ],
  'simplifier|réduire': [
    'Regroupez les termes de même nature (même puissance, même variable).',
    'Effectuez les opérations arithmétiques sur les coefficients.',
    'Vérifiez votre résultat en développant à nouveau.',
  ],
  'résoudre|equation': [
    'Isolez l\'inconnue d\'un côté de l\'équation.',
    'Appliquez les opérations inverses : addition ↔ soustraction, multiplication ↔ division.',
    'Vérifiez votre solution en la substituant dans l\'équation originale.',
  ],
  'dérivée|dériver|f\'': [
    'Rappelez les formules de dérivation : $(x^n)\' = nx^{n-1}$, $(e^x)\' = e^x$.',
    'Pour une fonction composée, appliquez la règle de la chaîne : $(f \\circ g)\' = f\'(g) \\cdot g\'$.',
    'N\'oubliez pas la dérivée d\'un produit : $(uv)\' = u\'v + uv\'$.',
  ],
  'intégrale|intégrer|primitive': [
    'Cherchez une primitive en inversant les formules de dérivation.',
    'Essayez un changement de variable ou une intégration par parties si la forme directe ne marche pas.',
    'N\'oubliez pas la constante d\'intégration $+C$ pour une primitive.',
  ],
  'limite': [
    'Évaluez d\'abord par substitution directe. Si vous obtenez une forme indéterminée, factorisez.',
    'Pour les formes $\\frac{0}{0}$ ou $\\frac{\\infty}{\\infty}$, pensez à la règle de L\'Hôpital.',
    'Divisez numérateur et dénominateur par le terme dominant pour les limites en $\\pm\\infty$.',
  ],
  'suite|récurrence|convergence': [
    'Vérifiez si la suite est arithmétique ($u_{n+1} = u_n + r$) ou géométrique ($u_{n+1} = u_n \\times q$).',
    'Pour la convergence, étudiez la monotonie et le caractère borné de la suite.',
    'Si la suite est définie par récurrence, essayez de trouver sa formule explicite.',
  ],
  'probabilité|événement|dénombrement': [
    'Identifiez l\'univers $\\Omega$ et comptez les cas favorables / cas possibles.',
    'Vérifiez si les événements sont indépendants ou conditionnels.',
    'Pour le dénombrement, choisissez entre arrangement, combinaison ou permutation.',
  ],
  'matrice|déterminant': [
    'Rappelez les règles de multiplication matricielle : ligne × colonne.',
    'Le déterminant d\'une matrice $2 \\times 2$ : $\\det = ad - bc$.',
    'Pour inverser une matrice, vérifiez d\'abord que le déterminant est non nul.',
  ],
  'complexe|module|argument': [
    'Forme algébrique : $z = a + bi$. Module : $|z| = \\sqrt{a^2 + b^2}$.',
    'Forme trigonométrique : $z = |z|(\\cos\\theta + i\\sin\\theta)$.',
    'Pour les puissances de $z$, utilisez la formule de Moivre.',
  ],
  'vecteur|coordonnée|repère': [
    'Calculez les composantes du vecteur : $\\vec{AB} = (x_B - x_A, y_B - y_A)$.',
    'La norme d\'un vecteur : $\\|\\vec{u}\\| = \\sqrt{x^2 + y^2}$.',
    'Deux vecteurs sont colinéaires si leur déterminant est nul.',
  ],
  'développer': [
    'Appliquez la distributivité : $a(b+c) = ab + ac$.',
    'Pour $(a+b)^2$ : utilisez l\'identité $a^2 + 2ab + b^2$.',
    'Développez terme par terme, puis regroupez les termes semblables.',
  ],
  'calculer|déterminer': [
    'Identifiez les données et la formule appropriée.',
    'Remplacez les variables par leurs valeurs numériques.',
    'Vérifiez les unités et la cohérence du résultat.',
  ],
  'montrer|démontrer|prouver': [
    'Commencez par écrire clairement l\'hypothèse et la conclusion à montrer.',
    'Choisissez une méthode : directe, par contraposée, ou par l\'absurde.',
    'Reliez chaque étape logiquement à la précédente, sans sauter de pas.',
  ],
  'géométrie|triangle|cercle|angle': [
    'Faites un schéma clair et identifiez les données géométriques.',
    'Pensez aux théorèmes classiques : Pythagore, Thalès, médiane, bissectrice.',
    'Utilisez les propriétés des figures : angles inscrits, tangentes, etc.',
  ],
  'trigonométrie|cos|sin|tan': [
    'Rappelez les valeurs remarquables : $\\sin 30° = \\frac{1}{2}$, $\\cos 60° = \\frac{1}{2}$.',
    'Utilisez les formules : $\\sin^2 x + \\cos^2 x = 1$, $\\tan x = \\frac{\\sin x}{\\cos x}$.',
    'Pour les équations trigonométriques, ramenez tout à $\\sin$ ou $\\cos$.',
  ],
  'logarithme|ln|log': [
    'Rappelez : $\\ln(ab) = \\ln a + \\ln b$, $\\ln(a/b) = \\ln a - \\ln b$.',
    '$\\ln(a^n) = n \\cdot \\ln a$ et $\\ln(e) = 1$.',
    'Pour résoudre $\\ln(f(x)) = k$, passez à l\'exponentielle : $f(x) = e^k$.',
  ],
  'exponentielle|e\\^': [
    'Rappelez : $e^{a+b} = e^a \\cdot e^b$ et $e^0 = 1$.',
    'La dérivée de $e^{f(x)}$ est $f\'(x) \\cdot e^{f(x)}$.',
    'Pour résoudre $e^{f(x)} = k$, passez au logarithme : $f(x) = \\ln k$ (si $k > 0$).',
  ],
  'fonction|variation|tableau': [
    'Calculez la dérivée pour déterminer le signe de $f\'(x)$.',
    'Dressez le tableau de variation en notant les valeurs où $f\' = 0$.',
    'N\'oubliez pas les limites aux bornes du domaine de définition.',
  ],
};

const PHYSICS_HINTS = {
  'force|newton|dynamique': [
    'Appliquez la 2e loi de Newton : $\\sum \\vec{F} = m\\vec{a}$.',
    'Faites un bilan des forces : poids, normal, frottement, tension.',
    'Projetez les forces sur les axes choisis.',
  ],
  'énergie|travail|puissance': [
    'Identifiez les formes d\'énergie en jeu : cinétique, potentielle, thermique.',
    'Appliquez le théorème de l\'énergie cinétique ou la conservation de l\'énergie.',
    'Puissance = Énergie / Temps. Vérifiez les unités (Watts, Joules).',
  ],
  'circuit|résistance|tension|courant': [
    'Appliquez la loi d\'Ohm : $U = R \\cdot I$.',
    'En série : les résistances s\'ajoutent. En parallèle : $\\frac{1}{R_{eq}} = \\frac{1}{R_1} + \\frac{1}{R_2}$.',
    'Vérifiez avec les lois de Kirchhoff : loi des nœuds et loi des mailles.',
  ],
  'onde|fréquence|longueur.*onde': [
    'Relation fondamentale : $v = \\lambda \\times f$.',
    'La période $T = \\frac{1}{f}$.',
    'Distinguez ondes mécaniques (besoin d\'un milieu) et électromagnétiques.',
  ],
  'cinéma|mouvement|vitesse|accélération': [
    'Choisissez le référentiel et les axes.',
    'Pour un mouvement uniforme : $x = x_0 + vt$. Uniformément accéléré : $x = x_0 + v_0 t + \\frac{1}{2}at^2$.',
    'La vitesse est la dérivée de la position, l\'accélération est la dérivée de la vitesse.',
  ],
  'optique|lentille|miroir': [
    'Appliquez la relation de conjugaison : $\\frac{1}{f\'} = \\frac{1}{\\overline{OA\'}} - \\frac{1}{\\overline{OA}}$.',
    'Le grandissement : $\\gamma = \\frac{\\overline{A\'B\'}}{\\overline{AB}}$.',
    'Image réelle si elle se forme de l\'autre côté de la lentille.',
  ],
};

const CHEMISTRY_HINTS = {
  'équation|réaction|bilan': [
    'Équilibrez l\'équation : même nombre d\'atomes de chaque élément des deux côtés.',
    'Commencez par les atomes les moins fréquents, puis ajustez H et O en dernier.',
    'Vérifiez la conservation de la charge pour les réactions ioniques.',
  ],
  'mol|concentration|volume': [
    'Rappel : $n = \\frac{m}{M}$ (quantité de matière = masse / masse molaire).',
    'Concentration : $C = \\frac{n}{V}$ en mol/L.',
    'Volume molaire des gaz : $V_m = 22,4$ L/mol (CNTP) ou $24$ L/mol (20°C).',
  ],
  'oxydoréduction|redox|potentiel': [
    'Identifiez l\'oxydant (qui gagne des électrons) et le réducteur (qui perd des électrons).',
    'Écrivez les demi-équations puis combinez-les en équilibrant les électrons.',
    'Le potentiel de la pile : $E = E_{cathode} - E_{anode}$.',
  ],
  'organique|carbone|hydrocarbure|alcool': [
    'Identifiez le groupe fonctionnel : -OH (alcool), -COOH (acide), -CHO (aldéhyde).',
    'Formule brute des alcanes : $C_nH_{2n+2}$.',
    'Nommez selon les règles IUPAC : chaîne principale la plus longue + suffixe du groupe.',
  ],
  'pH|acide|base': [
    'Rappel : $pH = -\\log[H^+]$ et $pOH = -\\log[OH^-]$.',
    'Acide fort : dissociation totale. Acide faible : utilisez $K_a$.',
    'À 25°C : $pH + pOH = 14$.',
  ],
};

const ENGLISH_HINTS = {
  'tense|verb|grammar|conjugat': [
    'Identify the time markers in the sentence (yesterday, tomorrow, always, etc.).',
    'Check subject-verb agreement: singular subjects take singular verbs.',
    'Review the key tenses: simple present, past simple, present perfect, future.',
  ],
  'vocabulary|word|synonym|antonym': [
    'Look for context clues in the surrounding sentences.',
    'Think about word families: the root, prefix, and suffix can give meaning.',
    'Eliminate options that don\'t fit the tone or register of the text.',
  ],
  'comprehension|reading|passage|text': [
    'Read the question first, then scan the text for relevant information.',
    'Pay attention to transition words (however, therefore, although).',
    'For inference questions, look for what the text implies, not just what it states directly.',
  ],
  'essay|writing|composition': [
    'Plan your essay: introduction, 2-3 body paragraphs, conclusion.',
    'Use linking words: firstly, moreover, however, in conclusion.',
    'Support your arguments with specific examples.',
  ],
  'default': [
    'Read the question carefully and identify what is being asked.',
    'Look for key words in both the question and the answer options.',
    'Eliminate clearly wrong answers first, then choose the best remaining option.',
  ],
};

const SPANISH_HINTS = {
  'default': [
    'Lee la pregunta atentamente e identifica las palabras clave.',
    'Recuerda las reglas de concordancia: género y número.',
    'Presta atención a los tiempos verbales y sus marcadores temporales.',
  ],
};

const BIOLOGY_HINTS = {
  'cellule|mitose|méiose': [
    'Rappelez la structure de la cellule : membrane, cytoplasme, noyau.',
    'Mitose = 2 cellules identiques. Méiose = 4 cellules haploïdes.',
    'Identifiez la phase du cycle cellulaire.',
  ],
  'génétique|gène|chromosome|allèle': [
    'Faites un échiquier de Punnett pour les croisements.',
    'Distinguez génotype (allèles) et phénotype (caractère visible).',
    'Dominant masque récessif : notez majuscule/minuscule.',
  ],
  'default': [
    'Identifiez le processus biologique en question.',
    'Faites un schéma pour organiser les étapes.',
    'Reliez structure et fonction dans votre raisonnement.',
  ],
};

const GENERIC_HINTS_BY_TYPE = {
  multiple_choice: [
    'Éliminez d\'abord les options clairement incorrectes.',
    'Relisez la question — un mot clé peut changer le sens (toujours, jamais, sauf).',
    'Choisissez la réponse la plus complète et précise.',
  ],
  true_false: [
    'Cherchez un contre-exemple — un seul suffit pour rendre faux.',
    'Attention aux mots absolus : « toujours », « jamais » sont souvent faux.',
    'Relisez l\'affirmation mot par mot.',
  ],
  fill_blank: [
    'Le type de réponse attendu est indiqué par le contexte (nombre, mot, expression).',
    'Vérifiez que votre réponse est cohérente grammaticalement avec le reste de la phrase.',
    'Les unités comptent — vérifiez si on attend une réponse avec unité.',
  ],
  calculation: [
    'Identifiez les données et ce qu\'on vous demande de trouver.',
    'Choisissez la formule appropriée et vérifiez les unités.',
    'Vérifiez votre calcul en utilisant un ordre de grandeur.',
  ],
  short_answer: [
    'Répondez de manière concise — la plupart du temps, un mot ou une phrase courte suffit.',
    'Vérifiez l\'orthographe des termes techniques.',
    'Utilisez le vocabulaire du cours.',
  ],
  essay: [
    'Organisez votre réponse : introduction, développement, conclusion.',
    'Appuyez chaque argument sur un exemple concret.',
    'Relisez pour corriger les fautes et améliorer la clarté.',
  ],
  matching: [
    'Commencez par les associations dont vous êtes sûr(e).',
    'Procédez par élimination pour les paires restantes.',
    'Vérifiez que chaque élément est utilisé une seule fois.',
  ],
};

// ─── Hint generation engine ─────────────────────────────────────────────────

function generateHints(question, subject) {
  const text = (question.question || '').toLowerCase();
  const type = question.type || 'short_answer';
  const cat = subjectCategory(subject);
  const hints = [];

  // 1. Subject-specific hints (match on keywords in question text)
  let subjectHintBank = {};
  switch (cat) {
    case 'math': subjectHintBank = MATH_HINTS; break;
    case 'physics': subjectHintBank = PHYSICS_HINTS; break;
    case 'chemistry': subjectHintBank = CHEMISTRY_HINTS; break;
    case 'biology': subjectHintBank = BIOLOGY_HINTS; break;
    case 'english': subjectHintBank = ENGLISH_HINTS; break;
    case 'spanish': subjectHintBank = SPANISH_HINTS; break;
  }

  // Find matching keyword entries
  let matched = false;
  for (const [pattern, hintList] of Object.entries(subjectHintBank)) {
    if (pattern === 'default') continue;
    try {
      if (new RegExp(pattern, 'i').test(text)) {
        hints.push(...hintList);
        matched = true;
        break; // Use the first matching pattern only
      }
    } catch { /* invalid regex, skip */ }
  }

  // Fall back to subject default
  if (!matched && subjectHintBank.default) {
    hints.push(...subjectHintBank.default);
  }

  // 2. Type-specific hints (if we don't have enough subject hints)
  if (hints.length < 2) {
    const typeHints = GENERIC_HINTS_BY_TYPE[type] || GENERIC_HINTS_BY_TYPE.short_answer;
    for (const h of typeHints) {
      if (!hints.includes(h)) hints.push(h);
    }
  }

  // 3. Special case: figure-dependent questions
  if (question.has_figure) {
    hints.unshift('Examinez attentivement la figure — les données clés y sont indiquées.');
  }

  // Cap at 3 hints
  return hints.slice(0, 3);
}

// ─── Answer derivation for fill_blank with clear patterns ─────────────────

function tryDeriveFillBlank(question) {
  const text = question.question || '';
  // Pattern: "blah = ___" where we might be able to compute the left side
  // This is too risky without an LLM — return null
  return null;
}

// ─── Main processing ─────────────────────────────────────────────────────────

console.log('Loading exam catalog...');
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));

let totalQuestions = 0;
let answersAdded = 0;
let hintsAdded = 0;
let alreadyHadHints = 0;
let alreadyHadAnswers = 0;

for (let ei = 0; ei < catalog.length; ei++) {
  const exam = catalog[ei];
  const subject = exam.subject || '';
  const sections = exam.sections || [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const questions = section.questions || [];

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      totalQuestions++;

      // ── Hints ──
      if (q.hints && q.hints.length > 0) {
        alreadyHadHints++;
      } else {
        q.hints = generateHints(q, subject);
        if (q.hints.length > 0) hintsAdded++;
      }

      // ── Answer derivation ──
      if (q.correct && q.correct !== '' && q.correct !== null) {
        alreadyHadAnswers++;
        continue;
      }

      // Try MCQ derivation
      if (q.type === 'multiple_choice') {
        const answer = tryDeriveMCQAnswer(q);
        if (answer) {
          q.correct = answer;
          answersAdded++;
          continue;
        }
      }

      // Try fill_blank derivation
      if (q.type === 'fill_blank') {
        const answer = tryDeriveFillBlank(q);
        if (answer) {
          q.correct = answer;
          answersAdded++;
        }
      }
    }
  }
}

console.log(`\nProcessed ${totalQuestions} questions across ${catalog.length} exams`);
console.log(`  Hints: ${hintsAdded} added (${alreadyHadHints} already had hints)`);
console.log(`  Answers: ${answersAdded} derived (${alreadyHadAnswers} already had answers)`);
console.log(`  Total without answers: ${totalQuestions - alreadyHadAnswers - answersAdded}`);

console.log('\nWriting patched catalog...');
writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
console.log(`Done! Wrote ${OUTPUT_PATH}`);

// ── Print some sample hints to verify quality ──
console.log('\n── Sample hints ──');
let samples = 0;
for (const exam of catalog) {
  for (const section of (exam.sections || [])) {
    for (const q of (section.questions || [])) {
      if (q.hints && q.hints.length > 0 && samples < 12) {
        console.log(`\n[${exam.subject}] ${q.type}: "${(q.question || '').slice(0, 80)}..."`);
        q.hints.forEach((h, i) => console.log(`  💡 Hint ${i + 1}: ${h}`));
        samples++;
      }
    }
  }
}
