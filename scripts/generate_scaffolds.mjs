#!/usr/bin/env node
/**
 * generate_scaffolds.mjs
 *
 * For every question that has no `correct` answer, generates a **scaffolded
 * model answer** — the full worked solution with strategic blanks ({{0}}, {{1}},
 * …) that students must fill in.
 *
 * Output fields added to each such question:
 *   scaffold_text   – string with {{n}} placeholders for blanks
 *   scaffold_blanks – array of { label, answer? } objects
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

// ─── Scaffold template library ──────────────────────────────────────────────
//
// Each template: { match: RegExp on question text, scaffold_text, blanks }
// Blanks: { label, answer? }
// {{n}} in scaffold_text corresponds to blanks[n]
//
// Strategy:
//  • For calculation/quantitative: step-by-step with formula → substitution → result
//  • For short_answer/conceptual: key term / definition / justification blanks
//  • For fill_blank: extract the blank pattern and scaffold around it
//  • For essay: outline scaffold (intro → argument → conclusion)
//  • For MCQ without answers: "the correct option is {{0}}" with option analysis blanks

// ── MATH ──────────────────────────────────────────────────────────────────────

const MATH_CALC_TEMPLATES = [
  {
    match: /déri[vé]|f'\s*\(|f\s*'\s*\(/i,
    scaffold_text:
      "Pour dériver la fonction :\n" +
      "1. Identifier la règle de dérivation applicable : {{0}}\n" +
      "2. Appliquer la formule — écrire $f'(x) = $ {{1}}\n" +
      "3. Simplifier le résultat : $f'(x) = $ {{2}}",
    blanks: [
      { label: "Règle utilisée (ex: $(x^n)' = nx^{n-1}$)" },
      { label: "Expression brute de la dérivée" },
      { label: "Expression simplifiée de $f'(x)$" },
    ],
  },
  {
    match: /intégr|primitive|\\int/i,
    scaffold_text:
      "Pour calculer l'intégrale / primitive :\n" +
      "1. Identifier la forme d'intégration : {{0}}\n" +
      "2. Appliquer la formule : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Type (primitive directe, par parties, changement de variable)" },
      { label: "Calcul intermédiaire" },
      { label: "Résultat final (+ constante $C$ si primitive)" },
    ],
  },
  {
    match: /limite|\\lim/i,
    scaffold_text:
      "Pour calculer la limite :\n" +
      "1. Substituer directement — forme obtenue : {{0}}\n" +
      "2. Technique employée (factorisation, L'Hôpital, etc.) : {{1}}\n" +
      "3. Résultat : $\\lim = $ {{2}}",
    blanks: [
      { label: "Forme obtenue (nombre, $\\frac{0}{0}$, $\\frac{\\infty}{\\infty}$, etc.)" },
      { label: "Méthode utilisée et calcul" },
      { label: "Valeur de la limite" },
    ],
  },
  {
    match: /matrice|déterminant|\\det|dimension\s*\d/i,
    scaffold_text:
      "Calcul matriciel :\n" +
      "1. Écrire la matrice / les données : {{0}}\n" +
      "2. Appliquer l'opération (produit, déterminant, inverse) : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Matrice(s) ou vecteur(s)" },
      { label: "Détail du calcul" },
      { label: "Résultat matriciel / numérique" },
    ],
  },
  {
    match: /complexe|z_1|z_2|module|argument|affixe/i,
    scaffold_text:
      "Nombre complexe :\n" +
      "1. Forme algébrique $z = a + bi$ : {{0}}\n" +
      "2. Module : $|z| = $ {{1}}\n" +
      "3. Argument : $\\arg(z) = $ {{2}}",
    blanks: [
      { label: "Forme algébrique de $z$" },
      { label: "Module (utiliser $\\sqrt{a^2+b^2}$)" },
      { label: "Argument en radians" },
    ],
  },
  {
    match: /probabilit|dénombr|combinaison|arrangement|binomial/i,
    scaffold_text:
      "Probabilité / dénombrement :\n" +
      "1. Univers et nombre total de cas : {{0}}\n" +
      "2. Nombre de cas favorables : {{1}}\n" +
      "3. Probabilité : $P = $ {{2}}",
    blanks: [
      { label: "Card($\\Omega$) = ?" },
      { label: "Nombre de cas favorables" },
      { label: "Valeur de la probabilité" },
    ],
  },
  {
    match: /suite|u_n|u_{n|récurrence/i,
    scaffold_text:
      "Étude de la suite :\n" +
      "1. Calculer les premiers termes : {{0}}\n" +
      "2. Nature (arithmétique $r$, géométrique $q$, ou autre) : {{1}}\n" +
      "3. Formule explicite / limite : {{2}}",
    blanks: [
      { label: "Premiers termes ($u_0, u_1, u_2, \\ldots$)" },
      { label: "Type de suite et raison" },
      { label: "Formule de $u_n$ ou limite" },
    ],
  },
  {
    match: /équation|résoudre|inéquation|racine|solution/i,
    scaffold_text:
      "Résolution :\n" +
      "1. Mettre sous forme canonique : {{0}}\n" +
      "2. Discriminant ou méthode choisie : {{1}}\n" +
      "3. Solution(s) : {{2}}",
    blanks: [
      { label: "Équation réécrite" },
      { label: "Méthode / discriminant ($\\Delta$)" },
      { label: "Ensemble de solutions $S = \\{\\ldots\\}$" },
    ],
  },
  {
    match: /factori/i,
    scaffold_text:
      "Factorisation :\n" +
      "1. Facteur commun identifié : {{0}}\n" +
      "2. Identité remarquable (si applicable) : {{1}}\n" +
      "3. Forme factorisée : {{2}}",
    blanks: [
      { label: "Facteur commun" },
      { label: "Identité utilisée" },
      { label: "Expression factorisée" },
    ],
  },
  {
    match: /simplifi|rédui/i,
    scaffold_text:
      "Simplification :\n" +
      "1. Expression de départ réécrite : {{0}}\n" +
      "2. Étape de simplification : {{1}}\n" +
      "3. Résultat simplifié : {{2}}",
    blanks: [
      { label: "Expression réécrite" },
      { label: "Calcul intermédiaire" },
      { label: "Expression simplifiée" },
    ],
  },
  {
    match: /trigonométr|cos|sin|tan|cercle.*trigo/i,
    scaffold_text:
      "Calcul trigonométrique :\n" +
      "1. Formule ou identité utilisée : {{0}}\n" +
      "2. Calcul intermédiaire : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Identité / formule ($\\sin^2 + \\cos^2 = 1$, etc.)" },
      { label: "Substitution et calcul" },
      { label: "Valeur finale" },
    ],
  },
  {
    match: /logarithm|\\ln|\\log/i,
    scaffold_text:
      "Logarithme :\n" +
      "1. Propriété utilisée : {{0}}\n" +
      "2. Simplification : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Propriété ($\\ln(ab)$, $\\ln(a^n)$, etc.)" },
      { label: "Calcul intermédiaire" },
      { label: "Valeur numérique ou expression simplifiée" },
    ],
  },
  {
    match: /exponentiel|e\^/i,
    scaffold_text:
      "Exponentielle :\n" +
      "1. Propriété appliquée : {{0}}\n" +
      "2. Simplification : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Propriété ($e^{a+b} = e^a \\cdot e^b$, etc.)" },
      { label: "Calcul" },
      { label: "Résultat final" },
    ],
  },
  {
    match: /fonction|variation|tableau|domaine.*définition|continuité/i,
    scaffold_text:
      "Étude de fonction :\n" +
      "1. Domaine de définition : $D_f = $ {{0}}\n" +
      "2. Dérivée et signe : {{1}}\n" +
      "3. Tableau de variation / résultat : {{2}}",
    blanks: [
      { label: "Domaine $D_f$" },
      { label: "Expression de $f'(x)$ et signe" },
      { label: "Extrema, tableau de variation" },
    ],
  },
  {
    match: /vecteur|colinéaire|repère|coordon/i,
    scaffold_text:
      "Calcul vectoriel :\n" +
      "1. Coordonnées des vecteurs : {{0}}\n" +
      "2. Opération (norme, produit scalaire, colinéarité) : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Composantes des vecteurs" },
      { label: "Calcul intermédiaire" },
      { label: "Résultat final" },
    ],
  },
  {
    match: /géomét|triangle|cercle|angle|distance|milieu|médiatrice/i,
    scaffold_text:
      "Géométrie :\n" +
      "1. Données identifiées (longueurs, angles) : {{0}}\n" +
      "2. Théorème ou propriété appliqué(e) : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Données du problème" },
      { label: "Théorème utilisé (Pythagore, Thalès, etc.)" },
      { label: "Résultat (longueur, angle, aire, etc.)" },
    ],
  },
  {
    match: /statistiq|moyenne|médiane|écart.type|variance/i,
    scaffold_text:
      "Statistiques :\n" +
      "1. Données organisées (tableau, effectifs) : {{0}}\n" +
      "2. Formule et calcul : {{1}}\n" +
      "3. Résultat (moyenne, médiane, etc.) : {{2}}",
    blanks: [
      { label: "Données ou tableau" },
      { label: "Formule appliquée et calcul numérique" },
      { label: "Valeur du paramètre statistique" },
    ],
  },
];

const MATH_CALC_DEFAULT = {
  scaffold_text:
    "Résolution :\n" +
    "1. Formule ou méthode choisie : {{0}}\n" +
    "2. Application numérique / calcul : {{1}}\n" +
    "3. Résultat final : {{2}}",
  blanks: [
    { label: "Formule / méthode" },
    { label: "Calcul détaillé" },
    { label: "Résultat" },
  ],
};

// ── PHYSICS ───────────────────────────────────────────────────────────────────

const PHYSICS_CALC_TEMPLATES = [
  {
    match: /circuit|résistance|tension|courant|ohm|condensat|capacit|bobine|inductance|impédance/i,
    scaffold_text:
      "Circuit électrique :\n" +
      "1. Schéma simplifié & grandeurs connues : {{0}}\n" +
      "2. Loi ou formule appliquée ($U=RI$, $Z=\\ldots$, etc.) : {{1}}\n" +
      "3. Application numérique : {{2}}\n" +
      "4. Résultat avec unité : {{3}}",
    blanks: [
      { label: "Données ($R$, $C$, $L$, $U$, $I$, $\\omega$)" },
      { label: "Formule utilisée" },
      { label: "Calcul numérique" },
      { label: "Résultat + unité" },
    ],
  },
  {
    match: /force|newton|poids|frottement|dynamique|accéléra/i,
    scaffold_text:
      "Dynamique :\n" +
      "1. Bilan des forces : {{0}}\n" +
      "2. Application de $\\sum \\vec{F} = m\\vec{a}$ : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Forces identifiées ($\\vec{P}$, $\\vec{N}$, $\\vec{f}$, etc.)" },
      { label: "Projection et calcul" },
      { label: "Accélération / force résultante + unité" },
    ],
  },
  {
    match: /énergie|travail|puissance|cinétique|potentiel/i,
    scaffold_text:
      "Énergie :\n" +
      "1. Types d'énergie en jeu : {{0}}\n" +
      "2. Formule et calcul : {{1}}\n" +
      "3. Résultat en Joules ou Watts : {{2}}",
    blanks: [
      { label: "Formes d'énergie ($E_c$, $E_p$, $W$)" },
      { label: "Application numérique" },
      { label: "Résultat + unité" },
    ],
  },
  {
    match: /onde|fréquence|longueur.*onde|célérité|période/i,
    scaffold_text:
      "Ondes :\n" +
      "1. Grandeurs connues ($f$, $\\lambda$, $T$, $v$) : {{0}}\n" +
      "2. Relation utilisée ($v = \\lambda f$, $T = 1/f$) : {{1}}\n" +
      "3. Résultat : {{2}}",
    blanks: [
      { label: "Données numériques" },
      { label: "Formule et substitution" },
      { label: "Résultat + unité" },
    ],
  },
  {
    match: /optique|lentille|miroir|convergent|divergent|focale/i,
    scaffold_text:
      "Optique :\n" +
      "1. Données ($f'$, $\\overline{OA}$, objet/image) : {{0}}\n" +
      "2. Relation de conjugaison : {{1}}\n" +
      "3. Position de l'image et grandissement : {{2}}",
    blanks: [
      { label: "Données optiques" },
      { label: "Calcul avec $\\frac{1}{f'} = \\frac{1}{\\overline{OA'}} - \\frac{1}{\\overline{OA}}$" },
      { label: "Image : position + grandissement $\\gamma$" },
    ],
  },
  {
    match: /champ.*magnétique|induction|f\.?[eé]\.?m|Faraday|solénoïde|flux/i,
    scaffold_text:
      "Électromagnétisme :\n" +
      "1. Grandeurs données ($B$, $N$, $S$, $\\Delta t$, etc.) : {{0}}\n" +
      "2. Loi / formule appliquée (Faraday, f.é.m., etc.) : {{1}}\n" +
      "3. Résultat avec unité : {{2}}",
    blanks: [
      { label: "Données numériques" },
      { label: "Formule et calcul" },
      { label: "Résultat + unité" },
    ],
  },
  {
    match: /cinémat|mouvement|vitesse|chute|projectile|trajectoire/i,
    scaffold_text:
      "Cinématique :\n" +
      "1. Données ($v_0$, $a$, $t$, $x_0$) et type de mouvement : {{0}}\n" +
      "2. Équation(s) horaire(s) : {{1}}\n" +
      "3. Résultat demandé : {{2}}",
    blanks: [
      { label: "Données et type de mouvement" },
      { label: "Équation(s) et calcul" },
      { label: "Résultat + unité" },
    ],
  },
];

const PHYSICS_CALC_DEFAULT = {
  scaffold_text:
    "Résolution (physique) :\n" +
    "1. Données et grandeurs identifiées : {{0}}\n" +
    "2. Loi ou formule appliquée : {{1}}\n" +
    "3. Application numérique et résultat : {{2}}",
  blanks: [
    { label: "Données avec unités" },
    { label: "Formule utilisée" },
    { label: "Résultat + unité" },
  ],
};

// ── CHEMISTRY ─────────────────────────────────────────────────────────────────

const CHEMISTRY_CALC_TEMPLATES = [
  {
    match: /oxydation|réduction|redox|oxyd.*réduct/i,
    scaffold_text:
      "Réaction d'oxydo-réduction :\n" +
      "1. Identifier l'oxydant et le réducteur : {{0}}\n" +
      "2. Écrire les demi-équations (oxydation + réduction) : {{1}}\n" +
      "3. Équation bilan équilibrée : {{2}}",
    blanks: [
      { label: "Oxydant : … / Réducteur : …" },
      { label: "Demi-équations" },
      { label: "Équation bilan" },
    ],
  },
  {
    match: /hydrolys|eau/i,
    scaffold_text:
      "Hydrolyse :\n" +
      "1. Réactifs : {{0}}\n" +
      "2. Produits de la réaction : {{1}}\n" +
      "3. Équation bilan équilibrée : {{2}}",
    blanks: [
      { label: "Réactifs identifiés" },
      { label: "Produits (noms + formules)" },
      { label: "Équation bilan" },
    ],
  },
  {
    match: /combustion|brûl/i,
    scaffold_text:
      "Combustion :\n" +
      "1. Réactifs (combustible + comburant) : {{0}}\n" +
      "2. Produits : {{1}}\n" +
      "3. Équation bilan équilibrée : {{2}}",
    blanks: [
      { label: "Combustible + $O_2$" },
      { label: "Produits ($CO_2$, $H_2O$, etc.)" },
      { label: "Équation équilibrée" },
    ],
  },
  {
    match: /estérif|ester|acide.*alcool/i,
    scaffold_text:
      "Estérification :\n" +
      "1. Acide + Alcool : {{0}}\n" +
      "2. Produit (ester) + sous-produit : {{1}}\n" +
      "3. Équation bilan : {{2}}",
    blanks: [
      { label: "Réactifs (acide carboxylique + alcool)" },
      { label: "Ester formé + $H_2O$" },
      { label: "Équation équilibrée" },
    ],
  },
  {
    match: /mol|masse.*molair|concentration|volume.*molair|stœchiom|quantité.*matière/i,
    scaffold_text:
      "Calcul stœchiométrique :\n" +
      "1. Données ($m$, $M$, $C$, $V$) : {{0}}\n" +
      "2. Quantité de matière $n = $ {{1}}\n" +
      "3. Résultat demandé : {{2}}",
    blanks: [
      { label: "Données numériques avec unités" },
      { label: "Calcul de $n$ (mol)" },
      { label: "Résultat + unité" },
    ],
  },
  {
    match: /pH|acide|base|tampon|K_a/i,
    scaffold_text:
      "Chimie acido-basique :\n" +
      "1. Données ($C$, $K_a$, espèce) : {{0}}\n" +
      "2. Calcul ($pH = -\\log[H^+]$, etc.) : {{1}}\n" +
      "3. Résultat : pH = {{2}}",
    blanks: [
      { label: "Données" },
      { label: "Formule et calcul" },
      { label: "Valeur du pH" },
    ],
  },
];

const CHEMISTRY_CALC_DEFAULT = {
  scaffold_text:
    "Réaction chimique :\n" +
    "1. Réactifs identifiés : {{0}}\n" +
    "2. Produits et équation bilan : {{1}}\n" +
    "3. Résultat / bilan final : {{2}}",
  blanks: [
    { label: "Réactifs (noms + formules)" },
    { label: "Équation bilan équilibrée" },
    { label: "Résultat (quantités, noms, etc.)" },
  ],
};

// ── BIOLOGY / SVT ─────────────────────────────────────────────────────────────

const BIO_SHORT_TEMPLATES = [
  {
    match: /cellul|mitose|méiose|division|cycle/i,
    scaffold_text:
      "1. Type de division : {{0}}\n" +
      "2. Étapes principales : {{1}}\n" +
      "3. Résultat (nombre et type de cellules filles) : {{2}}",
    blanks: [
      { label: "Mitose / Méiose / autre" },
      { label: "Phases clés (prophase, métaphase, …)" },
      { label: "Cellules filles (nombre, ploïdie)" },
    ],
  },
  {
    match: /génétiq|gène|chromosome|allèle|phénotype|génotype|croisement/i,
    scaffold_text:
      "1. Génotype(s) des parents : {{0}}\n" +
      "2. Échiquier de croisement (Punnett) — résultat : {{1}}\n" +
      "3. Phénotype(s) attendu(s) et proportions : {{2}}",
    blanks: [
      { label: "Génotypes parentaux" },
      { label: "Gamètes et combinaisons" },
      { label: "Proportions phénotypiques" },
    ],
  },
  {
    match: /digestion|enzyme|substrat|métabolis/i,
    scaffold_text:
      "1. Organe / enzyme impliqué(e) : {{0}}\n" +
      "2. Substrat → Produit : {{1}}\n" +
      "3. Rôle / importance : {{2}}",
    blanks: [
      { label: "Enzyme et organe" },
      { label: "Réaction (substrat → produit)" },
      { label: "Fonction physiologique" },
    ],
  },
  {
    match: /écologi|biotope|biocénose|chaîne.*alimentaire|écosystème|climat/i,
    scaffold_text:
      "1. Concept / terme scientifique : {{0}}\n" +
      "2. Définition ou description : {{1}}\n" +
      "3. Exemple concret : {{2}}",
    blanks: [
      { label: "Terme clé" },
      { label: "Définition précise" },
      { label: "Exemple" },
    ],
  },
];

const BIO_SHORT_DEFAULT = {
  scaffold_text:
    "1. Terme ou concept clé : {{0}}\n" +
    "2. Explication / mécanisme : {{1}}\n" +
    "3. Exemple ou application : {{2}}",
  blanks: [
    { label: "Terme scientifique" },
    { label: "Explication" },
    { label: "Exemple" },
  ],
};

// ── ENGLISH ───────────────────────────────────────────────────────────────────

const ENGLISH_SHORT_TEMPLATES = [
  {
    match: /according.*text|passage|reading|comprehension/i,
    scaffold_text:
      "Based on the text:\n" +
      "1. Key information from the passage: {{0}}\n" +
      "2. Complete answer in your own words: {{1}}",
    blanks: [
      { label: "Quote or key detail from the text" },
      { label: "Your answer (complete sentence)" },
    ],
  },
  {
    match: /tense|verb|grammar|conjugat|transform/i,
    scaffold_text:
      "Grammar:\n" +
      "1. Identify the tense/structure required: {{0}}\n" +
      "2. Correct form: {{1}}",
    blanks: [
      { label: "Tense / grammatical rule" },
      { label: "Correct sentence" },
    ],
  },
];

const ENGLISH_SHORT_DEFAULT = {
  scaffold_text:
    "1. Key idea or answer: {{0}}\n" +
    "2. Supporting detail or justification: {{1}}",
  blanks: [
    { label: "Main answer" },
    { label: "Supporting detail" },
  ],
};

const ENGLISH_ESSAY = {
  scaffold_text:
    "Essay outline:\n" +
    "Introduction — state the topic and your position: {{0}}\n\n" +
    "Body paragraph 1 — first argument + example: {{1}}\n\n" +
    "Body paragraph 2 — second argument + example: {{2}}\n\n" +
    "Conclusion — summarize and restate your position: {{3}}",
  blanks: [
    { label: "Introduction (2-3 sentences)" },
    { label: "Argument 1 with example" },
    { label: "Argument 2 with example" },
    { label: "Conclusion (2-3 sentences)" },
  ],
};

// ── SPANISH ───────────────────────────────────────────────────────────────────

const SPANISH_SHORT_DEFAULT = {
  scaffold_text:
    "1. Idea principal o respuesta: {{0}}\n" +
    "2. Detalle de apoyo o justificación: {{1}}",
  blanks: [
    { label: "Respuesta principal" },
    { label: "Justificación" },
  ],
};

const SPANISH_ESSAY = {
  scaffold_text:
    "Plan de redacción:\n" +
    "Introducción — presentar el tema: {{0}}\n\n" +
    "Desarrollo — argumento 1 + ejemplo: {{1}}\n\n" +
    "Desarrollo — argumento 2 + ejemplo: {{2}}\n\n" +
    "Conclusión: {{3}}",
  blanks: [
    { label: "Introducción" },
    { label: "Argumento 1" },
    { label: "Argumento 2" },
    { label: "Conclusión" },
  ],
};

// ── PHILOSOPHY ────────────────────────────────────────────────────────────────

const PHILO_ESSAY = {
  scaffold_text:
    "Dissertation philosophique :\n" +
    "Introduction — reformuler le sujet et annoncer le plan : {{0}}\n\n" +
    "Thèse — premier point de vue avec argument et exemple : {{1}}\n\n" +
    "Antithèse — point de vue opposé avec argument et exemple : {{2}}\n\n" +
    "Synthèse / conclusion — dépassement et prise de position : {{3}}",
  blanks: [
    { label: "Introduction (problématique + plan)" },
    { label: "Thèse (argument + exemple philosophique)" },
    { label: "Antithèse (argument contraire + exemple)" },
    { label: "Synthèse et conclusion personnelle" },
  ],
};

const PHILO_SHORT = {
  scaffold_text:
    "1. Concept philosophique central : {{0}}\n" +
    "2. Explication / définition : {{1}}\n" +
    "3. Exemple ou référence (auteur, œuvre) : {{2}}",
  blanks: [
    { label: "Concept clé" },
    { label: "Explication" },
    { label: "Référence philosophique" },
  ],
};

// ── FRENCH ────────────────────────────────────────────────────────────────────

const FRENCH_ESSAY = {
  scaffold_text:
    "Plan de rédaction :\n" +
    "Introduction — présenter le sujet et la problématique : {{0}}\n\n" +
    "Développement — argument 1 + exemple : {{1}}\n\n" +
    "Développement — argument 2 + exemple : {{2}}\n\n" +
    "Conclusion — synthèse et ouverture : {{3}}",
  blanks: [
    { label: "Introduction (sujet + problématique)" },
    { label: "Argument 1 avec exemple" },
    { label: "Argument 2 avec exemple" },
    { label: "Conclusion" },
  ],
};

// ── ECONOMICS ─────────────────────────────────────────────────────────────────

const ECON_CALC_DEFAULT = {
  scaffold_text:
    "Calcul économique :\n" +
    "1. Données identifiées : {{0}}\n" +
    "2. Formule utilisée : {{1}}\n" +
    "3. Résultat : {{2}}",
  blanks: [
    { label: "Données (prix, quantités, taux, etc.)" },
    { label: "Formule et calcul" },
    { label: "Résultat avec unité" },
  ],
};

const ECON_SHORT_DEFAULT = {
  scaffold_text:
    "1. Concept ou terme économique : {{0}}\n" +
    "2. Définition / explication : {{1}}\n" +
    "3. Exemple concret : {{2}}",
  blanks: [
    { label: "Terme" },
    { label: "Définition" },
    { label: "Exemple" },
  ],
};

// ── HISTORY / GEOGRAPHY ───────────────────────────────────────────────────────

const HISTORY_SHORT = {
  scaffold_text:
    "1. Fait, date ou lieu clé : {{0}}\n" +
    "2. Explication / contexte : {{1}}\n" +
    "3. Conséquence ou signification : {{2}}",
  blanks: [
    { label: "Fait / date / lieu" },
    { label: "Contexte historique ou géographique" },
    { label: "Conséquence / importance" },
  ],
};

const HISTORY_ESSAY = {
  scaffold_text:
    "Rédaction (histoire/géographie) :\n" +
    "Introduction — situer le sujet dans son contexte : {{0}}\n\n" +
    "Développement — faits et analyse : {{1}}\n\n" +
    "Conclusion — bilan et portée : {{2}}",
  blanks: [
    { label: "Contexte et problématique" },
    { label: "Faits, dates, analyse" },
    { label: "Bilan" },
  ],
};

// ── MCQ scaffold (when correct answer is unknown) ─────────────────────────

function mcqScaffold(question) {
  const opts = question.options || {};
  const entries = Object.entries(opts);
  if (entries.length === 0) return null;

  const optionList = entries.map(([k, v]) => `${k.toUpperCase()}) ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' | ');

  return {
    scaffold_text:
      `Options : ${optionList}\n\n` +
      "1. La bonne réponse est l'option : {{0}}\n" +
      "2. Justification — pourquoi cette option est correcte : {{1}}",
    scaffold_blanks: [
      { label: "Lettre de la bonne option (A, B, C, …)" },
      { label: "Explication de votre choix" },
    ],
  };
}

// ── TRUE / FALSE scaffold ─────────────────────────────────────────────────

function tfScaffold() {
  return {
    scaffold_text:
      "1. Cette affirmation est : {{0}}\n" +
      "2. Justification : {{1}}",
    scaffold_blanks: [
      { label: "Vrai ou Faux" },
      { label: "Explication" },
    ],
  };
}

// ── FILL BLANK scaffold ─────────────────────────────────────────────────────

function fillBlankScaffold(question, cat) {
  // For fill_blank, the question itself contains blanks (__, ___, ……, etc.)
  // The scaffold should help the student identify what goes in the blank
  let contextHint = '';
  switch (cat) {
    case 'math': contextHint = 'Identifiez la valeur manquante à partir du calcul ou de la propriété mathématique.'; break;
    case 'physics': contextHint = 'Utilisez la loi physique correspondante pour trouver la grandeur manquante.'; break;
    case 'chemistry': contextHint = 'Complétez avec le terme chimique, la formule ou le produit approprié.'; break;
    case 'biology': contextHint = 'Complétez avec le terme biologique approprié.'; break;
    case 'english': contextHint = 'Fill in using the correct grammar form, vocabulary word, or phrase.'; break;
    case 'spanish': contextHint = 'Complete con la forma gramatical, palabra o expresión correcta.'; break;
    default: contextHint = 'Complétez avec le terme ou la valeur approprié(e).'; break;
  }

  return {
    scaffold_text:
      `💡 ${contextHint}\n\n` +
      "Votre réponse : {{0}}",
    scaffold_blanks: [
      { label: "Mot, terme ou valeur manquant(e)" },
    ],
  };
}

// ── MATCHING scaffold ─────────────────────────────────────────────────────

function matchingScaffold() {
  return {
    scaffold_text:
      "Correspondances :\n" +
      "1. Commencez par les paires les plus évidentes : {{0}}\n" +
      "2. Complétez les paires restantes par élimination : {{1}}\n" +
      "3. Toutes les correspondances (format 1-B, 2-A, …) : {{2}}",
    scaffold_blanks: [
      { label: "Paires évidentes" },
      { label: "Paires restantes" },
      { label: "Liste complète des correspondances" },
    ],
  };
}

// ── GENERIC fallbacks ─────────────────────────────────────────────────────

const GENERIC_SHORT = {
  scaffold_text:
    "1. Réponse principale : {{0}}\n" +
    "2. Justification ou détail : {{1}}",
  blanks: [
    { label: "Réponse" },
    { label: "Justification" },
  ],
};

const GENERIC_ESSAY = {
  scaffold_text:
    "Plan de rédaction :\n" +
    "Introduction : {{0}}\n\n" +
    "Développement : {{1}}\n\n" +
    "Conclusion : {{2}}",
  blanks: [
    { label: "Introduction" },
    { label: "Développement (arguments + exemples)" },
    { label: "Conclusion" },
  ],
};

const GENERIC_CALC = {
  scaffold_text:
    "Résolution :\n" +
    "1. Données identifiées : {{0}}\n" +
    "2. Méthode et calcul : {{1}}\n" +
    "3. Résultat : {{2}}",
  blanks: [
    { label: "Données" },
    { label: "Calcul" },
    { label: "Résultat" },
  ],
};

// ── Template selection engine ─────────────────────────────────────────────

function findTemplate(templates, questionText) {
  for (const t of templates) {
    if (t.match.test(questionText)) return t;
  }
  return null;
}

function selectScaffold(question, subject) {
  const cat = subjectCategory(subject);
  const type = question.type || 'short_answer';
  const text = question.question || '';

  // Special types handled directly
  if (type === 'multiple_choice') return mcqScaffold(question);
  if (type === 'true_false') return tfScaffold();
  if (type === 'matching') return matchingScaffold();
  if (type === 'fill_blank') return fillBlankScaffold(question, cat);

  // Calculation
  if (type === 'calculation') {
    switch (cat) {
      case 'math': {
        const t = findTemplate(MATH_CALC_TEMPLATES, text);
        return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: MATH_CALC_DEFAULT.scaffold_text, scaffold_blanks: MATH_CALC_DEFAULT.blanks };
      }
      case 'physics': {
        const t = findTemplate(PHYSICS_CALC_TEMPLATES, text);
        return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: PHYSICS_CALC_DEFAULT.scaffold_text, scaffold_blanks: PHYSICS_CALC_DEFAULT.blanks };
      }
      case 'chemistry': {
        const t = findTemplate(CHEMISTRY_CALC_TEMPLATES, text);
        return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: CHEMISTRY_CALC_DEFAULT.scaffold_text, scaffold_blanks: CHEMISTRY_CALC_DEFAULT.blanks };
      }
      case 'economics': return { scaffold_text: ECON_CALC_DEFAULT.scaffold_text, scaffold_blanks: ECON_CALC_DEFAULT.blanks };
      default: return { scaffold_text: GENERIC_CALC.scaffold_text, scaffold_blanks: GENERIC_CALC.blanks };
    }
  }

  // Essay
  if (type === 'essay') {
    switch (cat) {
      case 'english': return { scaffold_text: ENGLISH_ESSAY.scaffold_text, scaffold_blanks: ENGLISH_ESSAY.blanks };
      case 'spanish': return { scaffold_text: SPANISH_ESSAY.scaffold_text, scaffold_blanks: SPANISH_ESSAY.blanks };
      case 'philosophy': return { scaffold_text: PHILO_ESSAY.scaffold_text, scaffold_blanks: PHILO_ESSAY.blanks };
      case 'french': return { scaffold_text: FRENCH_ESSAY.scaffold_text, scaffold_blanks: FRENCH_ESSAY.blanks };
      case 'history': return { scaffold_text: HISTORY_ESSAY.scaffold_text, scaffold_blanks: HISTORY_ESSAY.blanks };
      default: return { scaffold_text: GENERIC_ESSAY.scaffold_text, scaffold_blanks: GENERIC_ESSAY.blanks };
    }
  }

  // Short answer (and unknown types)
  switch (cat) {
    case 'math': {
      // Math short_answer are often proofs — use method scaffold
      const t = findTemplate(MATH_CALC_TEMPLATES, text);
      return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: MATH_CALC_DEFAULT.scaffold_text, scaffold_blanks: MATH_CALC_DEFAULT.blanks };
    }
    case 'physics': {
      const t = findTemplate(PHYSICS_CALC_TEMPLATES, text);
      return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: PHYSICS_CALC_DEFAULT.scaffold_text, scaffold_blanks: PHYSICS_CALC_DEFAULT.blanks };
    }
    case 'chemistry': {
      const t = findTemplate(CHEMISTRY_CALC_TEMPLATES, text);
      return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: CHEMISTRY_CALC_DEFAULT.scaffold_text, scaffold_blanks: CHEMISTRY_CALC_DEFAULT.blanks };
    }
    case 'biology': {
      const t = findTemplate(BIO_SHORT_TEMPLATES, text);
      return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: BIO_SHORT_DEFAULT.scaffold_text, scaffold_blanks: BIO_SHORT_DEFAULT.blanks };
    }
    case 'english': {
      const t = findTemplate(ENGLISH_SHORT_TEMPLATES, text);
      return t ? { scaffold_text: t.scaffold_text, scaffold_blanks: t.blanks } : { scaffold_text: ENGLISH_SHORT_DEFAULT.scaffold_text, scaffold_blanks: ENGLISH_SHORT_DEFAULT.blanks };
    }
    case 'spanish': return { scaffold_text: SPANISH_SHORT_DEFAULT.scaffold_text, scaffold_blanks: SPANISH_SHORT_DEFAULT.blanks };
    case 'philosophy': return { scaffold_text: PHILO_SHORT.scaffold_text, scaffold_blanks: PHILO_SHORT.blanks };
    case 'economics': return { scaffold_text: ECON_SHORT_DEFAULT.scaffold_text, scaffold_blanks: ECON_SHORT_DEFAULT.blanks };
    case 'history': return { scaffold_text: HISTORY_SHORT.scaffold_text, scaffold_blanks: HISTORY_SHORT.blanks };
    case 'french': return { scaffold_text: FRENCH_ESSAY.scaffold_text, scaffold_blanks: FRENCH_ESSAY.blanks };
    default: return { scaffold_text: GENERIC_SHORT.scaffold_text, scaffold_blanks: GENERIC_SHORT.blanks };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Loading catalog…');
const catalog = JSON.parse(readFileSync(CATALOG, 'utf-8'));

let total = 0;
let scaffolded = 0;
let skipped = 0;

for (const exam of catalog) {
  const subject = exam.subject || '';
  for (const section of (exam.sections || [])) {
    for (const q of (section.questions || [])) {
      total++;

      // Only scaffold questions that lack a correct answer
      if (q.correct && q.correct !== '') {
        skipped++;
        continue;
      }

      const result = selectScaffold(q, subject);
      if (result) {
        q.scaffold_text = result.scaffold_text;
        q.scaffold_blanks = result.scaffold_blanks;
        scaffolded++;
      }
    }
  }
}

console.log(`\nProcessed ${total} questions`);
console.log(`  Scaffolded: ${scaffolded}`);
console.log(`  Skipped (has answer): ${skipped}`);

console.log('\nWriting catalog…');
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2), 'utf-8');
console.log('Done!');

// Samples
console.log('\n── Samples ──');
let samples = 0;
const seen = new Set();
for (const exam of catalog) {
  for (const sec of (exam.sections || [])) {
    for (const q of (sec.questions || [])) {
      if (!q.scaffold_text) continue;
      const key = subjectCategory(exam.subject) + '/' + q.type;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`\n[${exam.subject}] ${q.type}:`);
      console.log(`  Q: ${(q.question || '').slice(0, 100)}`);
      console.log(`  Scaffold: ${q.scaffold_text.slice(0, 200)}`);
      console.log(`  Blanks: ${q.scaffold_blanks.map(b => b.label).join(' | ')}`);
      samples++;
      if (samples >= 15) break;
    }
    if (samples >= 15) break;
  }
  if (samples >= 15) break;
}
