/**
 * api/_lib/essayGrading.ts — deterministic, standards-based essay scoring.
 *
 * Philosophy: you cannot grade reliably by asking an LLM "give this a score" —
 * the number drifts run-to-run and has no anchor. Instead we grade against an
 * explicit RUBRIC (a minimum expectation appropriate to the student's level)
 * and let CODE compute the score. The LLM only does what it is good at:
 * judging, per criterion, whether the student addressed it (level 0/1/2) and
 * writing feedback. All arithmetic here is pure and reproducible — no model,
 * no network — which is exactly why it is unit-tested.
 *
 * The "minimum expectation" has two sources:
 *   1. Content rubric — each essay already ships `answer_parts`: the specific
 *      points a correct answer must cover (avg 3.5 per essay). These ARE the
 *      standard; no human gold set required.
 *   2. Competency axes — task response, organization, language — judged at a
 *      high-school level, generous toward L2 writers (Haitian students compose
 *      in French/English/Kreyòl/Spanish).
 *
 * No file in the dataset carries a word limit, so expectations are defined here
 * by question type and used both to gate submission (floor) and to cap credit
 * for under-developed answers (a 20-word "essay" cannot earn full marks).
 */

export type QuestionType = 'essay' | 'short_answer' | string;

export interface WordExpectation {
  submitMin: number; // below this, the UI should not submit
  developTarget: number; // full "development" credit needs at least this many
  softMax: number; // above this, warn (padding) — never blocks
}

export const WORD_EXPECTATIONS: Record<'essay' | 'short_answer', WordExpectation> = {
  // Haitian high-school exam «rédaction» (worth 20–40 pts). L2 writers, so the
  // floor is forgiving but full marks require a developed, multi-paragraph text.
  essay: { submitMin: 50, developTarget: 130, softMax: 650 },
  short_answer: { submitMin: 5, developTarget: 25, softMax: 180 },
};

export function wordExpectation(type: QuestionType): WordExpectation {
  return type === 'short_answer' ? WORD_EXPECTATIONS.short_answer : WORD_EXPECTATIONS.essay;
}

export function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export type WordStatus = 'empty' | 'too_short' | 'developing' | 'ok' | 'long';

export interface WordAnalysis {
  words: number;
  status: WordStatus;
  submitMin: number;
  developTarget: number;
  softMax: number;
  /** French, student-facing. */
  message: string;
}

export function analyzeWordCount(text: string, type: QuestionType): WordAnalysis {
  const exp = wordExpectation(type);
  const words = countWords(text);
  let status: WordStatus;
  let message: string;
  if (words === 0) {
    status = 'empty';
    message = 'Aucune réponse rédigée.';
  } else if (words < exp.submitMin) {
    status = 'too_short';
    message = `Réponse très courte (${words} mots). Visez au moins ${exp.submitMin} mots pour être évalué.`;
  } else if (words < exp.developTarget) {
    status = 'developing';
    message = `Réponse encore brève (${words} mots). Développez vers ~${exp.developTarget} mots pour viser tous les points.`;
  } else if (words > exp.softMax) {
    status = 'long';
    message = `Réponse longue (${words} mots). Veillez à rester clair et structuré.`;
  } else {
    status = 'ok';
    message = `${words} mots — longueur adaptée.`;
  }
  return { words, status, submitMin: exp.submitMin, developTarget: exp.developTarget, softMax: exp.softMax, message };
}

// ── Rubric ──────────────────────────────────────────────────────────────────

export interface AnswerPart {
  label?: string;
  answer?: string;
  alternatives?: string[];
}

export interface RubricCriterion {
  id: number; // 1-based, stable index used to align the LLM response
  label: string;
  expected: string; // the expected point(s); merged when a label repeats
}

export interface EssayRubric {
  criteria: RubricCriterion[];
  hasContentRubric: boolean;
}

const BOILERPLATE_LABEL = /^(matching\s+pair|point|partie|aspect)\s*\d*$/i;
const DEPENDS_LABEL = /^(answer|réponse|reponse|respuesta)\s+(depends|dépend|depend|depende)/i;

/**
 * Build a content rubric from `answer_parts`. Drops boilerplate and
 * passage-dependent placeholders, and merges repeated labels (e.g. three
 * "Drawbacks of small town living" rows) into one criterion listing every
 * expected item — so the LLM judges coverage, not row-by-row duplicates.
 */
export function buildEssayRubric(answerParts: AnswerPart[] | undefined): EssayRubric {
  const parts = Array.isArray(answerParts) ? answerParts : [];
  const order: string[] = [];
  const byLabel = new Map<string, { label: string; expected: string[] }>();
  for (const p of parts) {
    const label = String(p?.label || '').trim();
    const answer = String(p?.answer || '').trim();
    if (!label || BOILERPLATE_LABEL.test(label) || DEPENDS_LABEL.test(label)) continue;
    const key = label.toLowerCase();
    let entry = byLabel.get(key);
    if (!entry) { entry = { label, expected: [] }; byLabel.set(key, entry); order.push(key); }
    if (answer) entry.expected.push(answer);
    for (const alt of p.alternatives || []) {
      const a = String(alt || '').trim();
      if (a) entry.expected.push(a);
    }
  }
  const criteria: RubricCriterion[] = order.map((key, i) => {
    const e = byLabel.get(key)!;
    return { id: i + 1, label: e.label, expected: [...new Set(e.expected)].join(' ; ') };
  });
  return { criteria, hasContentRubric: criteria.length > 0 };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export interface PromptInput {
  question: string;
  answer: string;
  modelAnswer?: string;
  context?: string;
  subject?: string;
  level?: string;
  rubric: EssayRubric;
  word: WordAnalysis;
}

export function buildGradingPrompt(input: PromptInput): { system: string; user: string } {
  const { question, answer, modelAnswer, context, subject, level, rubric, word } = input;

  const system = [
    'You are an experienced Haitian high-school examiner grading a student composition.',
    'Grade ONLY against the explicit rubric below — it defines the minimum expectations for this level.',
    'The students are Haitian high-schoolers writing in a second language; they may answer in French, English, Haitian Creole, or Spanish.',
    'Judge IDEAS and whether each expected point is addressed — be fair and encouraging, and do not penalize minor second-language grammar or spelling.',
    'For each rubric criterion assign a level: 0 = absent, 1 = mentioned but thin, 2 = clearly addressed/developed.',
    'Also rate three competency axes 0–2: task_response (answers the actual prompt / takes a position), organization (intro–body–conclusion, logical connectors), language (clarity for this level).',
    'Quote a SHORT snippet of the student text as evidence for each criterion when possible; never invent content the student did not write.',
    'Do NOT output any numeric score, grade, or percentage — the teacher computes that. Write all feedback in FRENCH, addressing the student directly and kindly.',
    'Respond with ONLY a JSON object matching the requested schema.',
  ].join('\n');

  const rubricBlock = rubric.hasContentRubric
    ? rubric.criteria.map((c) => `  ${c.id}. ${c.label} — attendu: ${c.expected || '(idée pertinente sur ce point)'}`).join('\n')
    : '  (Pas de points imposés — jugez la pertinence globale par rapport à la réponse-modèle.)';

  const user = [
    subject ? `MATIÈRE: ${subject}${level ? ` (${level})` : ''}` : '',
    context ? `TEXTE DE RÉFÉRENCE:\n${context}` : '',
    `QUESTION:\n${question}`,
    `LONGUEUR: ${word.words} mots (attendu ≈ ${word.developTarget}).`,
    `RUBRIQUE (critères de contenu):\n${rubricBlock}`,
    modelAnswer ? `RÉPONSE-MODÈLE (référence enseignant, ne pas exiger le mot-à-mot):\n${modelAnswer}` : '',
    `RÉPONSE DE L'ÉLÈVE:\n${answer}`,
    '',
    'SCHÉMA JSON ATTENDU:',
    '{',
    '  "criteria": [{ "id": <number>, "level": 0|1|2, "evidence": "<court extrait de l\'élève>", "comment": "<1 phrase en français>" }],',
    '  "task_response": 0|1|2,',
    '  "organization": 0|1|2,',
    '  "language": 0|1|2,',
    '  "strengths": ["<2 à 3 points forts, en français>"],',
    '  "improvements": ["<2 à 3 conseils concrets, en français>"],',
    '  "feedback": "<2-3 phrases de synthèse bienveillante, en français>"',
    '}',
  ].filter(Boolean).join('\n\n');

  return { system, user };
}

// ── Normalize the LLM response ────────────────────────────────────────────────

export interface CriterionResult {
  id: number;
  label: string;
  level: 0 | 1 | 2;
  evidence: string;
  comment: string;
}

export interface NormalizedGrade {
  criteria: CriterionResult[];
  taskResponse: 0 | 1 | 2;
  organization: 0 | 1 | 2;
  language: 0 | 1 | 2;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

const clampLevel = (v: unknown): 0 | 1 | 2 => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 2 ? 2 : 1;
};

const cleanStr = (v: unknown, max = 400): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const cleanList = (v: unknown, maxItems = 4): string[] => {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanStr(x, 240)).filter(Boolean).slice(0, maxItems);
};

/** Coerce arbitrary model output into a safe, fully-populated grade object. */
export function normalizeGraderResponse(raw: unknown, rubric: EssayRubric): NormalizedGrade {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const rawCriteria = Array.isArray(obj.criteria) ? obj.criteria as Array<Record<string, unknown>> : [];
  const byId = new Map<number, Record<string, unknown>>();
  rawCriteria.forEach((c, i) => {
    const id = Number(c?.id);
    byId.set(Number.isFinite(id) ? id : i + 1, c);
  });

  const criteria: CriterionResult[] = rubric.criteria.map((rc) => {
    const c = byId.get(rc.id) || {};
    return {
      id: rc.id,
      label: rc.label,
      level: clampLevel(c.level),
      evidence: cleanStr(c.evidence, 200),
      comment: cleanStr(c.comment, 240),
    };
  });

  return {
    criteria,
    taskResponse: clampLevel(obj.task_response),
    organization: clampLevel(obj.organization),
    language: clampLevel(obj.language),
    strengths: cleanList(obj.strengths),
    improvements: cleanList(obj.improvements),
    feedback: cleanStr(obj.feedback, 600),
  };
}

// ── Deterministic scoring ─────────────────────────────────────────────────────

export interface ScoreInput {
  grade: NormalizedGrade;
  rubric: EssayRubric;
  word: WordAnalysis;
  points: number; // max points for the question
}

export interface EssayScore {
  ratio: number; // 0..1
  awarded: number; // points
  maxPoints: number;
  score: string; // "x.x/10" — kept for the existing front-end contract
  isCorrect: boolean;
  contentRatio: number; // 0..1 across rubric criteria
  capped: boolean; // true when word-count development cap reduced the score
}

// Weights when a content rubric exists vs. when only competency axes apply.
const W_WITH = { content: 0.58, task: 0.12, organization: 0.14, language: 0.16 };
const W_WITHOUT = { task: 0.5, organization: 0.22, language: 0.28 };

const round = (n: number, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };

/**
 * Combine the per-criterion levels and competency axes into a single score.
 * Pure and deterministic — same input always yields the same grade.
 */
export function computeEssayScore(input: ScoreInput): EssayScore {
  const { grade, rubric, word, points } = input;
  const pts = points > 0 ? points : 1;

  const axis = (l: number) => Math.max(0, Math.min(1, l / 2));
  const task = axis(grade.taskResponse);
  const org = axis(grade.organization);
  const lang = axis(grade.language);

  let contentRatio = 0;
  let raw: number;
  if (rubric.hasContentRubric && grade.criteria.length > 0) {
    const sum = grade.criteria.reduce((s, c) => s + c.level, 0);
    contentRatio = sum / (2 * grade.criteria.length);
    raw = W_WITH.content * contentRatio + W_WITH.task * task + W_WITH.organization * org + W_WITH.language * lang;
  } else {
    contentRatio = task; // task_response stands in for "covers the prompt"
    raw = W_WITHOUT.task * task + W_WITHOUT.organization * org + W_WITHOUT.language * lang;
  }

  // Development cap: an under-length answer cannot earn full credit, regardless
  // of how the axes scored. This is the "minimum expectation" enforced in code.
  let ratio = raw;
  let capped = false;
  if (word.status === 'empty') { ratio = 0; }
  else if (word.status === 'too_short') { if (ratio > 0.35) { ratio = 0.35; capped = true; } }
  else if (word.status === 'developing') { if (ratio > 0.8) { ratio = 0.8; capped = true; } }

  ratio = round(Math.max(0, Math.min(1, ratio)), 3);
  const awarded = round(pts * ratio, 2);
  return {
    ratio,
    awarded,
    maxPoints: pts,
    score: `${round(ratio * 10, 1)}/10`,
    isCorrect: ratio >= 0.6,
    contentRatio: round(contentRatio, 3),
    capped,
  };
}
