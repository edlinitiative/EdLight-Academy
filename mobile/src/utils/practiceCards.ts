/**
 * One parser for the Firestore quiz bank, shared by the per-lesson practice
 * sheet and the chapter test.
 *
 * The live documents are uneven: `options` is sometimes a JSON string and
 * sometimes an array, `correct_answer` is usually a letter but sometimes the
 * answer text or a 1-based index, and the unit/lesson keys come in two spellings
 * (`unit_no`/`lesson_no` from the generator, `Chapter_Number`/`Subchapter_Number`
 * from the original import). All of that is absorbed here so screens never see it.
 */

export type PracticeCard = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  answer: string;
  hint?: string;
  explanation?: string;
  /** Which lesson of the unit this question belongs to, when known. */
  lessonNo: number | null;
  /**
   * False when the row's answer key matches no option (`correctIndex` is -1).
   * Such a card is shown but never marked right or wrong, and never sent to
   * Révision — guessing a key used to mark every answer wrong (LJ-08).
   * Absent on hand-built cards, which are treated as gradable.
   */
  gradable?: boolean;
};

export const toInt = (v: any): number | null => {
  if (v == null || v === '') return null;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

export function parseOptions(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a.map(String);
    } catch { /* not json — fall through */ }
  }
  return [];
}

/** Case/whitespace/edge-punctuation-insensitive; accents stay significant (FR). */
export function normKey(s: unknown): string {
  return String(s ?? '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:!?'"()[\]]+|[\s.,;:!?'"()[\]]+$/g, '');
}

/**
 * Resolve the correct option, or -1 when the key matches nothing.
 *
 * Order matters: the answer TEXT wins first, because live keys are mostly the
 * option text, and a one-character text answer ("d" for the d orbital) would
 * otherwise be misread as the letter D. Then a letter, then a 1-based number.
 * There is no "first option" fallback any more: an unresolvable key means the
 * question cannot be auto-graded, which is said as such rather than guessed.
 */
export function resolveCorrectIndex(raw: any, options: string[]): number {
  const val = String(raw ?? '').trim();
  if (!val || !Array.isArray(options) || options.length === 0) return -1;
  const target = normKey(val);
  const byText = options.findIndex((o) => normKey(o) === target);
  if (byText >= 0) return byText;
  if (/^[A-Za-z]$/.test(val)) {
    const i = val.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < options.length) return i;
  }
  if (/^\d+$/.test(val)) {
    const i = parseInt(val, 10) - 1;
    if (i >= 0 && i < options.length) return i;
  }
  return -1;
}

export function toPracticeCard(row: any, index: number): PracticeCard | null {
  const question = String(row?.question ?? '').trim();
  const options = parseOptions(row?.options ?? row?.choices);
  if (!question || options.length < 2) return null;
  const correctIndex = resolveCorrectIndex(row?.correct_answer ?? row?.correct_option, options);
  return {
    id: row?.id || `q${index}`,
    question,
    options,
    correctIndex,
    answer: correctIndex >= 0 ? options[correctIndex] ?? '' : '',
    hint: row?.hint || undefined,
    // The authored explanation first; `good_response` ("Exactement ! …") is
    // praise for a right answer and only stands in when nothing else exists.
    explanation: row?.explanation || row?.good_response || undefined,
    lessonNo: toInt(row?.lesson_no ?? row?.Subchapter_Number),
    gradable: correctIndex >= 0,
  };
}

/**
 * Every question in one chapter (unit) of a subject. Pass `lessonNo` to narrow
 * to a single lesson — falling back to the whole chapter when that lesson has
 * no questions of its own, so the practice sheet is never empty for a lesson
 * that simply wasn't tagged.
 */
export function selectCards(
  raw: any[],
  subjectCode?: string,
  unitNo?: any,
  lessonNo?: any,
  { includeUngradable = false }: { includeUngradable?: boolean } = {},
): PracticeCard[] {
  return selectCardsScoped(raw, subjectCode, unitNo, lessonNo, { includeUngradable }).cards;
}

/**
 * `selectCards` plus WHICH scope the cards really came from, so a sheet opened
 * from a lesson can say "questions de cette leçon" only when the rows were
 * actually tagged with that lesson — otherwise it is the whole chapter (LJ-06).
 * Ungradable rows are left out unless asked for: a chapter test must only hold
 * questions it can score.
 */
export function selectCardsScoped(
  raw: any[],
  subjectCode?: string,
  unitNo?: any,
  lessonNo?: any,
  { includeUngradable = false }: { includeUngradable?: boolean } = {},
): { cards: PracticeCard[]; scope: 'lesson' | 'chapter' | 'none' } {
  if (!subjectCode || unitNo == null) return { cards: [], scope: 'none' };
  const u = toInt(unitNo);
  const chapter = (raw ?? []).filter(
    (r) => String(r?.subject_code) === String(subjectCode)
      && toInt(r?.unit_no ?? r?.Chapter_Number) === u,
  );
  let rows = chapter;
  let scope: 'lesson' | 'chapter' = 'chapter';
  const l = toInt(lessonNo);
  if (l != null) {
    const lessonRows = chapter.filter((r) => toInt(r?.lesson_no ?? r?.Subchapter_Number) === l);
    if (lessonRows.length > 0) { rows = lessonRows; scope = 'lesson'; }
  }
  const cards = rows
    .map(toPracticeCard)
    .filter((c): c is PracticeCard => c != null && (includeUngradable || c.gradable !== false));
  return { cards, scope: cards.length > 0 ? scope : 'none' };
}

/**
 * Build a chapter test: a round-robin draw across the unit's lessons so every
 * lesson is represented before any lesson gets a second question. That's what
 * makes the test a test — you can't clear it by knowing one lesson well.
 *
 * `shuffle` is injected so callers control randomness (and tests stay
 * deterministic).
 */
export function buildChapterTest(
  cards: PracticeCard[],
  limit: number,
  shuffle: <T>(items: T[]) => T[] = (items) => items,
): PracticeCard[] {
  if (cards.length === 0 || limit <= 0) return [];
  const byLesson = new Map<number | null, PracticeCard[]>();
  for (const card of cards) {
    const key = card.lessonNo;
    byLesson.set(key, [...(byLesson.get(key) ?? []), card]);
  }
  // Stable lesson order (untagged questions last), shuffled questions within.
  const buckets = Array.from(byLesson.entries())
    .sort((a, b) => {
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      return a[0] - b[0];
    })
    .map(([, group]) => shuffle(group));

  const picked: PracticeCard[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let tookAny = false;
    for (const bucket of buckets) {
      if (picked.length >= limit) break;
      if (round < bucket.length) { picked.push(bucket[round]); tookAny = true; }
    }
    if (!tookAny) break; // every bucket exhausted
  }
  return shuffle(picked);
}

/**
 * Per-lesson verdict for a finished chapter test: a lesson counts as proved
 * only when every question drawn from it was answered correctly.
 * Lessons the test didn't reach are absent from the result.
 */
export function chapterTestVerdicts(
  cards: PracticeCard[],
  correctByCardId: Record<string, boolean>,
  lessonIdByNo: Record<number, string>,
): Record<string, boolean> {
  const verdicts: Record<string, boolean> = {};
  for (const card of cards) {
    if (card.lessonNo == null) continue;
    const lessonId = lessonIdByNo[card.lessonNo];
    if (!lessonId) continue;
    const ok = correctByCardId[card.id] === true;
    verdicts[lessonId] = (verdicts[lessonId] ?? true) && ok;
  }
  return verdicts;
}
