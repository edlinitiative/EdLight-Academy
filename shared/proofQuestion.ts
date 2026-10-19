/**
 * Proof / demonstration questions ("Montrer que…", "Simplifier…", "Résoudre
 * l'équation…") and the step template each kind gets. Moved out of the web's
 * ExamTake so the phone asks them the same way (steps + justification + final
 * answer), stored as JSON { steps: [{ math, justification }], finalAnswer } —
 * the grader scores `finalAnswer` (shared/examUtils).
 */
const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);

export interface ProofSubtype {
  key: string;
  re?: RegExp;
  label: string;
  icon: string;
  scaffoldSteps: { hint: string }[];
  askFinalAnswer: boolean;
  finalLabel: string;
}

/** Proof sub-type scaffolds — detected from question text */
const PROOF_SUBTYPES: ProofSubtype[] = [
  {
    key: 'simplify',
    re: /\b(simplifier|réduire|écrire.*sous.*forme|mettre.*sous.*forme)\b/i,
    label: 'Simplification',
    icon: '',
    scaffoldSteps: [
      { hint: 'Identifiez et simplifiez chaque terme séparément' },
      { hint: 'Combinez les termes semblables' },
      { hint: 'Écrivez le résultat sous la forme demandée' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Résultat simplifié',
  },
  {
    key: 'factor',
    re: /\b(factoriser)\b/i,
    label: 'Factorisation',
    icon: '',
    scaffoldSteps: [
      { hint: 'Identifiez le facteur commun ou l\'identité remarquable' },
      { hint: 'Mettez en facteur' },
      { hint: 'Vérifiez en développant' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Forme factorisée',
  },
  {
    key: 'solve',
    re: /\b(résoudre|trouver.*solution|déterminer.*valeur|trouver.*valeur)\b/i,
    label: 'Résolution',
    icon: '',
    scaffoldSteps: [
      { hint: 'Posez l\'équation ou identifiez les données' },
      { hint: 'Isolez l\'inconnue étape par étape' },
      { hint: 'Vérifiez la / les solution(s)' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Solution(s)',
  },
  {
    key: 'calculate',
    re: /\b(calculer|évaluer|déterminer)\b/i,
    label: 'Calcul',
    icon: '',
    scaffoldSteps: [
      { hint: 'Posez le calcul avec les données' },
      { hint: 'Effectuez les opérations' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Résultat',
  },
  {
    key: 'prove',
    re: /\b(montrer\s+que|démontrer|prouver\s+que|déduire\s+que|vérifier\s+que|justifier\s+que|en\s+déduire)\b/i,
    label: 'Démonstration',
    icon: '',
    scaffoldSteps: [
      { hint: 'Partez de l\'hypothèse ou de l\'expression de départ' },
      { hint: 'Développez le raisonnement' },
      { hint: 'Concluez en retrouvant le résultat demandé' },
    ],
    askFinalAnswer: false,
    finalLabel: '',
  },
  {
    key: 'develop',
    re: /\b(développer|développer\s+et\s+réduire)\b/i,
    label: 'Développement',
    icon: '',
    scaffoldSteps: [
      { hint: 'Appliquez la distributivité ou l\'identité remarquable' },
      { hint: 'Réduisez les termes semblables' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Forme développée',
  },
];

/** Default scaffold for unrecognized proof types */
const DEFAULT_SCAFFOLD: ProofSubtype = {
  key: 'generic', label: 'Raisonnement', icon: '',
  scaffoldSteps: [
    { hint: 'Première étape de votre raisonnement' },
    { hint: 'Continuez…' },
  ],
  askFinalAnswer: true, finalLabel: 'Résultat final',
};

export function detectProofSubtype(text: string): ProofSubtype {
  for (const st of PROOF_SUBTYPES) {
    if (st.re && st.re.test(text)) return st;
  }
  return DEFAULT_SCAFFOLD;
}

/** Detect proof / demonstration questions by their phrasing */
export const PROOF_RE = /\b(montrer\s+que|démontrer|prouver\s+que|déduire\s+que|vérifier\s+que|justifier\s+que|en\s+déduire|simplifier|factoriser|développer\s+et\s+réduire|calculer\s+et\s+simplifier|résoudre\s+(dans|l['']équation)|déterminer)\b/i;

export function isProofQuestion(question: any, subject?: string): boolean {
  const text = question._displayText || question.question || '';
  const type = question.type || '';
  // Only activate for open-ended math types — never for essays
  if (!['calculation', 'short_answer'].includes(type)) return false;
  // Never activate for non-math subjects (culture, history, languages, etc.)
  if (subject && !MATH_SUBJECTS.has(subject)) return false;
  // Must contain a proof/demonstration keyword
  return PROOF_RE.test(text);
}


export const JUSTIFICATION_OPTIONS: string[] = [
  '', 'Par définition', 'Par hypothèse', 'Par simplification', 'Par factorisation',
  'Par substitution', 'Par identité remarquable', 'Par calcul', 'Par développement',
  'Par récurrence', 'Par l\'absurde', 'Par contraposée', 'D\'après le théorème',
  'En utilisant la propriété', 'On en déduit que', 'Autre',
];
