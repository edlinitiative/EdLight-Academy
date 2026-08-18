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

/** Resolve the correct option from a letter, a 1-based number, or the answer text. */
export function resolveCorrectIndex(raw: any, options: string[]): number {
  const val = String(raw ?? '').trim();
  if (/^[A-Za-z]$/.test(val)) {
    const i = val.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < options.length) return i;
  }
  if (/^\d+$/.test(val)) {
    const i = parseInt(val, 10) - 1;
    if (i >= 0 && i < options.length) return i;
  }
  const byText = options.findIndex((o) => String(o).trim() === val);
  return byText >= 0 ? byText : 0;
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
    answer: options[correctIndex] ?? '',
    hint: row?.hint || undefined,
    explanation: row?.good_response || row?.explanation || undefined,
    lessonNo: toInt(row?.lesson_no ?? row?.Subchapter_Number),
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
): PracticeCard[] {
  if (!subjectCode || unitNo == null) return [];
  const u = toInt(unitNo);
  const chapter = (raw ?? []).filter(
    (r) => String(r?.subject_code) === String(subjectCode)
      && toInt(r?.unit_no ?? r?.Chapter_Number) === u,
  );
  let rows = chapter;
  const l = toInt(lessonNo);
  if (l != null) {
    const lessonRows = chapter.filter((r) => toInt(r?.lesson_no ?? r?.Subchapter_Number) === l);
    if (lessonRows.length > 0) rows = lessonRows;
  }
  return rows.map(toPracticeCard).filter((c): c is PracticeCard => c != null);
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
