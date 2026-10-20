/**
 * The essay workshop ("Atelier de rédaction") — the rules both apps share.
 *
 * An essay is asked in three steps: understand & plan (a brouillon), write
 * (one real essay, with the plan beside it and a live checklist), then
 * feedback & one rewrite. This module decides everything that is not UI:
 * what kind of essay it is, which plan slots it gets, the method hint for each
 * slot, the length to aim for, what the checklist checks, and which authored
 * ideas may be shown — only AFTER the final submission.
 *
 * Why not the authored `answer_parts` as the plan: they come in two kinds.
 * Structural labels ("Introduction", "Thèse", "Conclusion") teach method and
 * are safe. Content labels ("Crise économique", "Répression politique") are
 * the expected ideas, and their `answer` is the model answer — 91 essay
 * ladders printed it outright. So the plan is built from STRUCTURE only, and
 * content becomes "the key ideas expected", revealed after submission.
 *
 * The plan is process: it is never graded. Only the final text is, by the
 * existing AI essay grader.
 */

export type EssayKind = 'dissertation' | 'histoire' | 'argumentatif' | 'langue' | 'general';

export interface PlanSlot {
  key: string;
  /** Slot name, FR / HT. */
  label: { fr: string; ht: string };
  /** A METHOD hint, never content. */
  hint: { fr: string; ht: string };
}

export interface EssayPlan {
  problematique: string;
  ideas: Record<string, string>;
}

const norm = (s: unknown) => String(s ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

const S = (key: string, fr: string, ht: string, hfr: string, hht: string): PlanSlot => ({
  key, label: { fr, ht }, hint: { fr: hfr, ht: hht },
});

const INTRO = S('intro', 'Introduction', 'Entwodiksyon',
  'Amène le sujet, pose la question qu’il soulève, annonce ton plan.',
  'Prezante sijè a, poze kesyon li leve a, anonse plan ou.');
const CONCL = S('conclusion', 'Conclusion', 'Konklizyon',
  'Réponds clairement à la question de départ, puis ouvre sur une idée plus large.',
  'Reponn kesyon depa a klè, epi louvri sou yon lide pi laj.');

const PLANS: Record<EssayKind, PlanSlot[]> = {
  dissertation: [
    INTRO,
    S('these', 'Thèse', 'Tèz', 'Défends une première réponse avec un argument et un exemple.', 'Defann yon premye repons ak yon agiman ak yon egzanp.'),
    S('antithese', 'Antithèse', 'Antitèz', 'Une antithèse répond à la thèse : quelle objection ferait un adversaire ?', 'Yon antitèz reponn tèz la : ki objeksyon yon advèsè ta fè ?'),
    S('synthese', 'Synthèse', 'Sentèz', 'Dépasse l’opposition : à quelle condition les deux ont-elles raison ?', 'Depase opozisyon an : nan ki kondisyon tou de gen rezon ?'),
    CONCL,
  ],
  histoire: [
    INTRO,
    S('contexte', 'Contexte', 'Kontèks', 'Situe : quand, où, qui ? Donne une date ou un repère.', 'Sitiye : ki lè, ki kote, ki moun ? Bay yon dat oswa yon repè.'),
    S('causes', 'Causes', 'Kòz', 'Pourquoi cela s’est-il produit ? Une cause par phrase.', 'Poukisa sa te rive ? Yon kòz pa fraz.'),
    S('consequences', 'Conséquences', 'Konsekans', 'Qu’est-ce que cela a changé, à court et à long terme ?', 'Kisa sa te chanje, nan ti tan ak nan long tèm ?'),
    CONCL,
  ],
  argumentatif: [
    INTRO,
    S('arg1', 'Argument 1', 'Agiman 1', 'Ton argument le plus fort, avec un exemple précis.', 'Pi bon agiman ou, ak yon egzanp presi.'),
    S('arg2', 'Argument 2', 'Agiman 2', 'Un deuxième argument différent du premier.', 'Yon dezyèm agiman ki diferan de premye a.'),
    S('objection', 'Objection et réponse', 'Objeksyon ak repons', 'Qu’est-ce qu’on pourrait te répondre ? Réponds-y.', 'Kisa yo ta ka reponn ou ? Reponn li.'),
    CONCL,
  ],
  langue: [
    S('opening', 'Ouverture', 'Ouvèti', 'Commence par la forme demandée (Dear…, Querido…) ou une phrase qui présente ton idée.', 'Kòmanse ak fòm yo mande a (Dear…, Querido…) oswa yon fraz ki prezante lide ou.'),
    S('point1', 'Idée 1', 'Lide 1', 'Une idée, une phrase simple et correcte, puis un exemple.', 'Yon lide, yon fraz senp ki kòrèk, epi yon egzanp.'),
    S('point2', 'Idée 2', 'Lide 2', 'Une deuxième idée, reliée à la première par un connecteur.', 'Yon dezyèm lide, ki lye ak premye a pa yon konektè.'),
    S('closing', 'Fin', 'Fen', 'Termine avec la formule ou la phrase de conclusion attendue.', 'Fini ak fòmil oswa fraz konklizyon yo atann lan.'),
  ],
  general: [
    INTRO,
    S('dev1', 'Développement 1', 'Devlopman 1', 'Ta première idée principale, expliquée et illustrée.', 'Premye lide prensipal ou, eksplike ak ilistre.'),
    S('dev2', 'Développement 2', 'Devlopman 2', 'Ta deuxième idée principale.', 'Dezyèm lide prensipal ou.'),
    CONCL,
  ],
};

/** The kind of essay, from the subject (and the wording, for a few cases). */
export function essayKind(q: any, subject = ''): EssayKind {
  const s = norm(subject);
  const text = norm(q?._displayText || q?.question || '');
  if (s.includes('philo')) return 'dissertation';
  if (/histoire|geo|economie|sciences sociales|education civique/.test(s)) return 'histoire';
  if (/anglais|espagnol|english|espanol/.test(s)) return 'langue';
  if (/kreyol|creole|francais/.test(s)) {
    return /lettre|dialogue|recit|narratif|konte|istwa/.test(text) ? 'general' : 'argumentatif';
  }
  return 'general';
}

const STRUCTURAL = [
  /^introduction$|^entwodiksyon$/, /^conclusion$|^konklizyon$/,
  /^these( principale)?$/, /^antithese( principale)?$/, /^synthese$/,
  /^argument \d$/, /^developpement( \d)?$/, /^partie \d$/, /^paragraphe \d$/,
];

/** True when an authored part label is about structure, not content. */
export function isStructuralLabel(label: unknown): boolean {
  const n = norm(label).replace(/[.:]$/, '');
  return !!n && STRUCTURAL.some((re) => re.test(n));
}

/** The plan slots for this essay — structure only, never the expected ideas. */
export function planSlots(q: any, subject = ''): PlanSlot[] {
  return PLANS[essayKind(q, subject)];
}

/** Words to aim for, from the question's points (a 20-point essay ≈ 350). */
export function wordTarget(q: any): number {
  const pts = Number(q?.points) || 0;
  if (pts >= 30) return 450;
  if (pts >= 20) return 350;
  if (pts >= 10) return 220;
  return 150;
}

export function countWords(text: string): number {
  return (String(text ?? '').trim().match(/\S+/g) ?? []).length;
}

const CONNECTORS = [
  // fr
  'cependant', 'pourtant', 'en effet', 'de plus', 'ainsi', 'donc', 'par ailleurs', 'en revanche', 'enfin', 'tout d’abord', "tout d'abord", 'ensuite', 'en conclusion', 'certes', 'toutefois', 'car', 'mais',
  // ht
  'sepandan', 'poutan', 'anplis', 'konsa', 'donk', 'premyeman', 'answit', 'finalman', 'paske', 'men', 'kidonk',
  // en
  'however', 'moreover', 'therefore', 'furthermore', 'firstly', 'finally', 'in conclusion', 'because', 'although', 'but',
  // es
  'sin embargo', 'además', 'ademas', 'por lo tanto', 'primero', 'finalmente', 'en conclusión', 'porque', 'aunque', 'pero',
];
const CONCLUDING = /\b(en conclusion|pour conclure|finalement|en somme|in conclusion|to conclude|en conclusión|para concluir|an konklizyon|pou fini|finalman)\b/i;

export interface ChecklistItem {
  key: 'length' | 'intro' | 'paragraphs' | 'connectors' | 'conclusion';
  ok: boolean;
  label: { fr: string; ht: string };
}

/** The live writing checklist: cheap, honest checks, never a grade. */
export function essayChecklist(text: string, q: any, subject = ''): ChecklistItem[] {
  const t = String(text ?? '');
  const words = countWords(t);
  const target = wordTarget(q);
  const paragraphs = t.split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => countWords(p) >= 12);
  const slots = planSlots(q, subject).length;
  const lower = t.toLowerCase().replace(/’/g, "'");
  // Word-boundary match that also works at a paragraph start and before a comma.
  const connectors = CONNECTORS.filter((c) => {
    const esc = c.replace(/’/g, "'").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}])${esc}(?=[^\\p{L}]|$)`, 'u').test(lower);
  }).length;
  const last = paragraphs[paragraphs.length - 1] ?? '';
  return [
    { key: 'length', ok: words >= Math.round(target * 0.7), label: { fr: `Au moins ${Math.round(target * 0.7)} mots`, ht: `Omwen ${Math.round(target * 0.7)} mo` } },
    { key: 'intro', ok: paragraphs.length >= 1, label: { fr: 'Une introduction', ht: 'Yon entwodiksyon' } },
    { key: 'paragraphs', ok: paragraphs.length >= Math.max(2, slots - 1), label: { fr: 'Un paragraphe par partie du plan', ht: 'Yon paragraf pou chak pati plan an' } },
    { key: 'connectors', ok: connectors >= 3, label: { fr: 'Des mots de liaison (cependant, donc…)', ht: 'Mo pou lye lide (sepandan, donk…)' } },
    { key: 'conclusion', ok: paragraphs.length >= 2 && (CONCLUDING.test(last) || countWords(last) >= 25), label: { fr: 'Une conclusion qui répond à la question', ht: 'Yon konklizyon ki reponn kesyon an' } },
  ];
}

/**
 * The authored ideas, shown only after the final submission as "the key ideas
 * expected". Content labels with their answer; structural ones are skipped
 * (they told nothing the plan did not).
 */
export function expectedIdeas(q: any): { label: string; idea: string }[] {
  const parts = Array.isArray(q?.answer_parts) ? q.answer_parts : [];
  return parts
    .filter((p: any) => p && typeof p === 'object' && (p.answer || p.label))
    .map((p: any) => ({
      label: isStructuralLabel(p.label) ? '' : String(p.label ?? ''),
      idea: String(p.answer ?? p.label ?? ''),
    }))
    .filter((x: { label: string; idea: string }) => x.idea.trim())
    .slice(0, 8);
}

/** Highlightable key terms of the sujet: content words in reading order, max 4. */
const STOP = new Set(['est', 'sont', 'pour', 'dans', 'avec', 'sans', 'une', 'des', 'les', 'que', 'qui', 'quoi', 'pas', 'plus', 'faut', 'peut', 'cette', 'votre', 'vous', 'nous', 'leur', 'their', 'what', 'which', 'with', 'this', 'that', 'your', 'about', 'para', 'como', 'esta', 'sobre', 'sou', 'nan', 'pou', 'yon', 'sila', 'konsa', 'ki',
  // stock question verbs — the task, not the topic
  'envisager', 'considerer', 'penser', 'pensez', 'expliquer', 'expliquez', 'montrer', 'montrez', 'discuter', 'discutez', 'analyser', 'analysez', 'commenter', 'commentez', 'justifier', 'justifiez', 'peut-on', 'doit-on', 'faut-il', 'suffit-il', 'sujet', 'explain', 'discuss', 'describe', 'write', 'think', 'eksplike', 'diskite', 'ekri', 'etre', 'avoir', 'faire', 'nous-memes']);
export function sujetKeyTerms(q: any): string[] {
  const raw = String(q?._displayText || q?.question || '').replace(/^\s*sujet\s*\d+\s*[:.-]\s*/i, '');
  const text = raw.split(/[.?!]/)[0];
  const words = (text.match(/[A-Za-zÀ-ÿ’'-]{4,}/g) ?? [])
    .map((w) => w.replace(/^[a-z]’|^[a-z]'/i, ''))
    .filter((w) => w.length >= 4 && !STOP.has(norm(w)) && !/ment$/i.test(w));
  const uniq: string[] = [];
  for (const w of words) if (!uniq.some((u) => norm(u) === norm(w))) uniq.push(w);
  return uniq.slice(0, 4);
}

/**
 * "Je bloque": a sentence starter for the slot — the classic way to unblock a
 * student without writing the idea for them.
 */
const STARTERS: Record<string, { fr: string; ht: string }> = {
  intro: { fr: 'Aujourd’hui, on entend souvent dire que… Mais est-ce vraiment le cas ?', ht: 'Jodi a, nou tande souvan yo di… Men èske se vre ?' },
  these: { fr: 'D’abord, on pourrait croire que… En effet,…', ht: 'Premyeman, nou ta ka kwè ke… Vre,…' },
  antithese: { fr: 'Cependant, on peut objecter que…', ht: 'Sepandan, nou ka di ke…' },
  synthese: { fr: 'En réalité, les deux positions se rejoignent si…', ht: 'An reyalite, de pozisyon yo rankontre si…' },
  conclusion: { fr: 'En conclusion, à la question de savoir si…, on peut répondre que…', ht: 'An konklizyon, pou kesyon si…, nou ka reponn ke…' },
  contexte: { fr: 'En [année], à [lieu], …', ht: 'An [ane], nan [kote], …' },
  causes: { fr: 'Cela s’explique d’abord par…, ensuite par…', ht: 'Sa eksplike premyeman pa…, answit pa…' },
  consequences: { fr: 'Cet événement a entraîné…', ht: 'Evènman sa a te lakòz…' },
  arg1: { fr: 'Le premier argument est que… Par exemple,…', ht: 'Premye agiman an se ke… Pa egzanp,…' },
  arg2: { fr: 'De plus,…', ht: 'Anplis,…' },
  objection: { fr: 'Certains diront que… Pourtant,…', ht: 'Gen moun ki ka di ke… Poutan,…' },
  opening: { fr: 'Dear… / Querido… / In my opinion,…', ht: 'Dear… / Querido… / In my opinion,…' },
  point1: { fr: 'First of all,… / En primer lugar,…', ht: 'First of all,… / En primer lugar,…' },
  point2: { fr: 'Moreover,… / Además,…', ht: 'Moreover,… / Además,…' },
  closing: { fr: 'In conclusion,… / Best regards, / En conclusión,…', ht: 'In conclusion,… / Best regards, / En conclusión,…' },
  dev1: { fr: 'Tout d’abord,…', ht: 'Premyeman,…' },
  dev2: { fr: 'Ensuite,…', ht: 'Answit,…' },
};
export function slotStarter(key: string): { fr: string; ht: string } | null {
  return STARTERS[key] ?? null;
}

/** True when nothing has been planned yet. */
export function planIsEmpty(p: EssayPlan | null | undefined): boolean {
  return !p || (!String(p.problematique ?? '').trim() && !Object.values(p.ideas ?? {}).some((v) => String(v ?? '').trim()));
}
