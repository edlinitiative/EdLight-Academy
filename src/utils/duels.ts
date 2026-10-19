/**
 * "Défi d'un ami" on the web — the pure half.
 * ---------------------------------------------------------------------------
 * A duel stores the challenger's exact draw as INDEXES into a category bank
 * (challenges/{code}.questionIdxs). Whoever opens the link replays the
 * questions at those indexes, so both sides must read the SAME bank in the
 * SAME order — otherwise question 4 for one player is a different question
 * for the other and the scores compare nothing.
 *
 * The web's own bank (src/data/triviaData.ts) is not that bank: it has grown
 * to ~200 questions a deck with the additions PREPENDED, so not one index
 * lines up with the app's bank (mobile/src/data/triviaData.ts) outside the
 * three generated decks. The app is where every existing duel was minted, and
 * an Android phone opens academy.edlight.org/defi/* links straight in the app.
 * So the web plays duels from the app's bank — see utils/duelBank.ts — and a
 * duel made on a laptop is the same duel on a phone, in both directions,
 * without touching the server or shipping an app update.
 *
 * Everything here is free of React and Firebase so it can be unit-tested.
 */

export interface DuelQuestion {
  q: string;
  qHt?: string;
  options: string[];
  answer: number;
  optionsHt?: string[];
  explanation?: string;
  explanationHt?: string;
  flag?: string;
  flagIso?: string | null;
  [key: string]: unknown;
}

/** Duel rounds are the app's round: 10 questions, 15 s each. */
export const DUEL_ROUND = 10;

/** Challenge codes are 8 chars from create.ts's unambiguous alphabet. */
const CODE_RE = /^[2-9A-Z]{8}$/;

export function normalizeDuelCode(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function isDuelCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function duelUrl(code: string): string {
  return `https://academy.edlight.org/defi/${code}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * What makes two bank entries the same question. The text alone is not
 * enough: every flag question reads "De quel pays est ce drapeau ?", and an
 * edited answer under an unchanged question is a different question.
 */
export function questionKey(q: Pick<DuelQuestion, 'q' | 'options' | 'answer' | 'flag'>): string {
  const text = String(q?.q ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const correct = String(q?.options?.[q?.answer] ?? '').trim().toLowerCase();
  return `${text}␟${q?.flag ?? ''}␟${correct}`;
}

/**
 * The bank indexes of a round that was played from SOME bank, or null when
 * any question is missing from `bank` — the round then cannot be replayed
 * faithfully and must not become a duel.
 */
export function idxsInBank(bank: DuelQuestion[] | undefined, played: DuelQuestion[]): number[] | null {
  if (!bank?.length || !played.length || played.length > 50) return null;
  const at = new Map<string, number>();
  bank.forEach((q, i) => {
    const k = questionKey(q);
    if (!at.has(k)) at.set(k, i);
  });
  const out: number[] = [];
  for (const q of played) {
    const i = at.get(questionKey(q));
    if (i == null) return null;
    out.push(i);
  }
  return new Set(out).size === out.length ? out : null;
}

/** The questions at `idxs`, or null when any index is out of range. */
export function questionsAt(bank: DuelQuestion[] | undefined, idxs: number[]): DuelQuestion[] | null {
  if (!bank?.length || !idxs.length) return null;
  const out: DuelQuestion[] = [];
  for (const i of idxs) {
    if (!Number.isInteger(i) || i < 0 || i >= bank.length) return null;
    out.push(bank[i]);
  }
  return out;
}

/** `count` distinct indexes of a bank of `size`, in random order. */
export function drawIdxs(size: number, count: number, rng: () => number = Math.random): number[] {
  const all = Array.from({ length: Math.max(0, size) }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.max(0, Math.min(count, size)));
}

/**
 * Reshuffle a question's options for this play, keeping the Kreyòl options
 * aligned and the answer index pointing at the same option. The bank's own
 * order is shuffled once per page load, so this is cosmetic, not fairness.
 */
export function shuffleOptions(q: DuelQuestion, rng: () => number = Math.random): DuelQuestion {
  const order = drawIdxs(q.options.length, q.options.length, rng);
  const ht = Array.isArray(q.optionsHt) && q.optionsHt.length === q.options.length ? q.optionsHt : undefined;
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    optionsHt: ht ? order.map((i) => ht[i]) : undefined,
    answer: order.indexOf(q.answer),
  };
}

/* ─── Reading a duel ─────────────────────────────────────────────────────── */

export interface DuelLike {
  code: string;
  challengerUid: string;
  challengerScore: number;
  total: number;
  expiresAt: number;
  status: 'open' | 'played';
  opponent: { uid: string; name: string | null; score: number; playedAt: number; avatar?: string } | null;
}

export type DuelOutcome = 'won' | 'lost' | 'tie';

/**
 * The result from the VIEWER's side. The document always stores
 * challenger-vs-opponent; read it backwards and a student is told they won a
 * duel they lost. Null while the duel has not been played, or when the viewer
 * is neither side.
 */
export function outcomeFor(c: DuelLike, uid: string | null | undefined): DuelOutcome | null {
  if (!c.opponent || !uid) return null;
  const mine = uid === c.challengerUid ? c.challengerScore : uid === c.opponent.uid ? c.opponent.score : null;
  const theirs = uid === c.challengerUid ? c.opponent.score : c.challengerScore;
  if (mine == null) return null;
  if (mine > theirs) return 'won';
  if (mine < theirs) return 'lost';
  return 'tie';
}

export type DuelState =
  | 'to-play'   // someone else's duel, still open — yours to play
  | 'waiting'   // your duel, nobody has played it yet
  | 'played'    // finished
  | 'expired'   // open past its deadline
  | 'taken';    // someone else's duel, played by a third person

export function duelState(c: DuelLike, uid: string | null | undefined, now = Date.now()): DuelState {
  if (c.opponent || c.status === 'played') {
    if (uid && (uid === c.challengerUid || uid === c.opponent?.uid)) return 'played';
    return 'taken';
  }
  if (c.expiresAt && now > c.expiresAt) return 'expired';
  return uid && uid === c.challengerUid ? 'waiting' : 'to-play';
}

/** Sort for "Mes défis": yours-to-play first, then newest activity. */
export function sortDuels<T extends DuelLike & { createdAt: number }>(list: T[], uid: string | null | undefined, now = Date.now()): T[] {
  const rank = (c: T) => (duelState(c, uid, now) === 'to-play' ? 0 : 1);
  const when = (c: T) => c.opponent?.playedAt || c.createdAt || 0;
  return [...list].sort((a, b) => rank(a) - rank(b) || when(b) - when(a));
}

/** De-duplicate by code (a duel can be both "sent" and remembered locally). */
export function uniqueByCode<T extends { code: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
}

/* ─── Messages ───────────────────────────────────────────────────────────── */

/** The WhatsApp text — same words as the app's, minus the emoji. */
export function duelShareMessage(opts: {
  categoryLabel: string;
  score: number;
  total: number;
  url: string;
  referralCode?: string | null;
  isCreole: boolean;
}): string {
  const { categoryLabel, score, total, url, referralCode, isCreole } = opts;
  // One sentence + the link, no em-dash (owner feedback on long share texts).
  const code = referralCode ? (isCreole ? ` (kòd ${referralCode})` : ` (code ${referralCode})`) : '';
  return isCreole
    ? `Mwen fè ${score}/${total} nan ${categoryLabel} sou EdLight, bat mwen sou menm kesyon yo${code} : ${url}`
    : `J'ai fait ${score}/${total} en ${categoryLabel} sur EdLight, bats-moi sur les mêmes questions${code} : ${url}`;
}

/** The accept endpoint's error codes, in words a student can act on. */
export function acceptErrorMessage(error: string | null | undefined, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (error) {
    case 'already_played':
      return t('Ce défi a déjà été relevé — un seul essai par défi.', 'Yon moun deja jwe defi sa a — yon sèl tantativ pa defi.');
    case 'expired':
      return t('Ce défi a expiré (7 jours).', 'Defi sa a ekspire (7 jou).');
    case 'not_found':
      return t('Défi introuvable.', 'Nou pa jwenn defi a.');
    case 'self_challenge':
      return t('Tu ne peux pas relever ton propre défi.', 'Ou pa ka jwe pwòp defi pa w.');
    case 'bank_mismatch':
      return t('Ce défi a été créé avec d’autres questions. Mets à jour la page ou l’app, puis réessaie.', 'Defi sa a te fèt ak lòt kesyon. Mete paj la oswa app la ajou, epi eseye ankò.');
    case 'rate_limit_exceeded':
      return t('Trop d’essais d’un coup. Réessaie dans quelques minutes.', 'Twòp esè yon sèl kou. Eseye ankò nan kèk minit.');
    default:
      return t('Le score n’a pas pu être envoyé. Vérifie ta connexion.', 'Nòt la pa t ka voye. Verifye koneksyon ou.');
  }
}

/**
 * What the server grades a duel from (P0 validation D-8): the French text of
 * the option picked for each question, null for a timeout. `selected` indexes
 * the question's own (shuffled) `options`, which stay French.
 */
export function duelPicks(answers: Array<{ question?: { options?: unknown }; selected?: number }>): Array<string | null> {
  return answers.map((a) => {
    const opts = Array.isArray(a?.question?.options) ? (a.question!.options as unknown[]) : [];
    const i = typeof a?.selected === 'number' ? a.selected : -1;
    const v = i >= 0 && i < opts.length ? opts[i] : null;
    return typeof v === 'string' && v ? v : null;
  });
}
