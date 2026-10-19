/**
 * shared/essayCalibration.ts — the essay-grader calibration harness, pure
 * parts (larger-product-additions doc, item 2, later stage).
 *
 * An admin uploads teacher-graded copies (CSV or JSON). The server grades each
 * copy with the SAME grader students get (api/_lib/essayGrader.ts), and this
 * module turns the pairs into agreement numbers:
 *
 *   MAE            mean |AI − teacher| on a 0–20 scale
 *   within ±2      share of copies where |AI − teacher| ≤ 2/20
 *   exact          share where round(AI) == round(teacher) on 0–20
 *   adjacent       share where they differ by at most 1 point on 0–20
 *   Pearson r      linear correlation of the 0–20 scores
 *   QWK            quadratic-weighted kappa on the integer 0–20 scale, and per
 *                  rubric criterion on the grader's 0/1/2 levels
 *   bias           mean signed error (AI − teacher): + means the AI is lenient
 *
 * Target (doc item 2): QWK ≥ 0.6 on 0–20 AND |error| ≤ 2/20 on ≥ 80% of copies.
 *
 * Used by the admin page (parse, metrics, CSV export) and the server (row
 * validation). No imports, no I/O.
 */

export const CALIBRATION_MAX_ROWS = 300;
export const CALIBRATION_TARGET = { qwk: 0.6, within2Share: 0.8, tolerance20: 2 };
const TEXT_MAX = 12000;
const PROMPT_MAX = 4000;

export interface CalibrationInput {
  /** An anonymous row id from the upload (never a student name). */
  ref?: string;
  examId?: string;
  questionIndex?: number;
  prompt?: string;
  subject?: string;
  level?: string;
  type?: 'essay' | 'short_answer';
  studentText: string;
  teacherScore: number;
  maxScore: number;
  /** Teacher levels per rubric criterion, on the grader's 0/1/2 scale, keyed by label. */
  criteria?: Record<string, number>;
}

export interface RowError { row: number; message: string }

// ── Parsing ─────────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV: quoted fields, doubled quotes, newlines inside quotes. `,` or `;` (French Excel). */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // Excel's UTF-8 BOM
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
};

/** One untrusted row (from JSON or a CSV record) → a validated input, or an error message. */
export function validateRow(raw: Record<string, unknown>): CalibrationInput | string {
  const studentText = str(raw.studentText, TEXT_MAX);
  if (!studentText) return 'studentText manquant';
  const examId = str(raw.examId, 120);
  if (examId && !/^[A-Za-z0-9_-]{1,120}$/.test(examId)) return 'examId invalide';
  const qi = num(raw.questionIndex);
  const prompt = str(raw.prompt, PROMPT_MAX);
  if (examId && (qi == null || !Number.isInteger(qi) || qi < 0)) {
    if (!prompt) return 'questionIndex manquant ou invalide (entier ≥ 0)';
  }
  if (!examId && !prompt) return 'examId + questionIndex, ou prompt, est requis';
  const maxScore = num(raw.maxScore) ?? 20;
  if (!(maxScore > 0) || maxScore > 1000) return 'maxScore invalide';
  const teacherScore = num(raw.teacherScore);
  if (teacherScore == null || teacherScore < 0 || teacherScore > maxScore) return `teacherScore invalide (0 à ${maxScore})`;
  const out: CalibrationInput = { studentText, teacherScore, maxScore };
  const ref = str(raw.ref ?? raw.id, 60);
  if (ref) out.ref = ref;
  if (examId && qi != null && Number.isInteger(qi) && qi >= 0) {
    out.examId = examId;
    out.questionIndex = qi;
  } else if (prompt) out.prompt = prompt;
  const subject = str(raw.subject, 80);
  const level = str(raw.level, 80);
  if (subject) out.subject = subject;
  if (level) out.level = level;
  if (raw.type === 'short_answer') out.type = 'short_answer';
  const criteria: Record<string, number> = {};
  const rawCriteria = raw.criteria && typeof raw.criteria === 'object' && !Array.isArray(raw.criteria)
    ? { ...(raw.criteria as Record<string, unknown>) }
    : {};
  for (const [k, v] of Object.entries(raw)) if (k.startsWith('crit:')) rawCriteria[k.slice(5)] = v;
  for (const [label, v] of Object.entries(rawCriteria).slice(0, 12)) {
    const n = num(v);
    const l = label.trim().slice(0, 120);
    if (!l || n == null) continue;
    if (!Number.isInteger(n) || n < 0 || n > 2) return `critère « ${l} » : niveau 0, 1 ou 2 attendu`;
    criteria[l] = n;
  }
  if (Object.keys(criteria).length) out.criteria = criteria;
  return out;
}

/** CSV or JSON text → validated rows plus per-row errors (1-based data row numbers). */
export function parseCalibrationUpload(text: string): { rows: CalibrationInput[]; errors: RowError[] } {
  const trimmed = text.trim();
  let records: Array<Record<string, unknown>> = [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      records = list.filter((r: unknown) => r && typeof r === 'object') as Array<Record<string, unknown>>;
    } catch {
      return { rows: [], errors: [{ row: 0, message: 'JSON illisible' }] };
    }
  } else {
    const table = parseCsv(trimmed);
    const header = (table[0] || []).map((h) => h.trim());
    records = table.slice(1).map((cells) => {
      const r: Record<string, unknown> = {};
      header.forEach((h, i) => { if (h) r[h] = cells[i] ?? ''; });
      return r;
    });
  }
  const rows: CalibrationInput[] = [];
  const errors: RowError[] = [];
  records.forEach((r, i) => {
    if (rows.length >= CALIBRATION_MAX_ROWS) {
      if (i === CALIBRATION_MAX_ROWS) errors.push({ row: i + 1, message: `plus de ${CALIBRATION_MAX_ROWS} lignes : le reste est ignoré` });
      return;
    }
    const v = validateRow(r);
    if (typeof v === 'string') errors.push({ row: i + 1, message: v });
    else rows.push(v);
  });
  return { rows, errors };
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export interface GradedPair {
  ref?: string;
  index: number;
  teacher20: number;
  ai20: number;
  teacherCriteria?: Record<string, number>;
  aiCriteria?: Record<string, number>;
}

const round = (n: number, d = 3) => { const f = 10 ** d; return Math.round(n * f) / f; };
const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function meanAbsoluteError(a: number[], b: number[]): number | null {
  if (!a.length || a.length !== b.length) return null;
  return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2 || n !== b.length) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0; let va = 0; let vb = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va === 0 || vb === 0 ? null : cov / Math.sqrt(va * vb);
}

/**
 * Quadratic-weighted kappa between two integer ratings on [min, max].
 * Null when undefined (no pairs, or both raters' expected disagreement is 0).
 */
export function quadraticWeightedKappa(a: number[], b: number[], min: number, max: number): number | null {
  const n = a.length;
  if (!n || n !== b.length || max <= min) return null;
  const k = max - min + 1;
  const clampI = (x: number) => Math.min(max, Math.max(min, Math.round(x))) - min;
  const O = Array.from({ length: k }, () => new Array(k).fill(0));
  const ha = new Array(k).fill(0);
  const hb = new Array(k).fill(0);
  for (let i = 0; i < n; i += 1) {
    const x = clampI(a[i]);
    const y = clampI(b[i]);
    O[x][y] += 1; ha[x] += 1; hb[y] += 1;
  }
  let num = 0; let den = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const w = ((i - j) ** 2) / ((k - 1) ** 2);
      num += w * O[i][j];
      den += w * (ha[i] * hb[j]) / n;
    }
  }
  return den === 0 ? null : 1 - num / den;
}

export interface CriterionMetrics {
  label: string;
  n: number;
  exact: number | null;
  qwk: number | null;
  /** confusion[teacher][ai], levels 0..2. */
  confusion: number[][];
}

export interface CalibrationMetrics {
  n: number;
  mae: number | null;
  bias: number | null;
  within2Share: number | null;
  exactShare: number | null;
  adjacentShare: number | null;
  pearson: number | null;
  qwk: number | null;
  meetsTarget: boolean;
  criteria: CriterionMetrics[];
  worst: Array<GradedPair & { error: number }>;
}

export function calibrationMetrics(pairs: GradedPair[], worstN = 10): CalibrationMetrics {
  const t = pairs.map((p) => p.teacher20);
  const a = pairs.map((p) => p.ai20);
  const n = pairs.length;
  const share = (pred: (p: GradedPair) => boolean) => (n ? round(pairs.filter(pred).length / n) : null);
  const mae = meanAbsoluteError(a, t);
  const qwk = quadraticWeightedKappa(t, a, 0, 20);
  const within2Share = share((p) => Math.abs(p.ai20 - p.teacher20) <= CALIBRATION_TARGET.tolerance20 + 1e-9);

  // Per criterion: teacher and AI levels matched by folded label.
  const byLabel = new Map<string, { label: string; t: number[]; a: number[] }>();
  for (const p of pairs) {
    if (!p.teacherCriteria || !p.aiCriteria) continue;
    const ai = new Map(Object.entries(p.aiCriteria).map(([l, v]) => [fold(l), v]));
    for (const [label, tv] of Object.entries(p.teacherCriteria)) {
      const av = ai.get(fold(label));
      if (av == null) continue;
      const key = fold(label);
      const entry = byLabel.get(key) || { label, t: [], a: [] };
      entry.t.push(tv); entry.a.push(av);
      byLabel.set(key, entry);
    }
  }
  const criteria: CriterionMetrics[] = [...byLabel.values()].map((c) => {
    const confusion = [0, 1, 2].map(() => [0, 0, 0]);
    c.t.forEach((tv, i) => {
      const x = Math.min(2, Math.max(0, Math.round(tv)));
      const y = Math.min(2, Math.max(0, Math.round(c.a[i])));
      confusion[x][y] += 1;
    });
    const k = quadraticWeightedKappa(c.t, c.a, 0, 2);
    return {
      label: c.label,
      n: c.t.length,
      exact: c.t.length ? round(c.t.filter((tv, i) => Math.round(tv) === Math.round(c.a[i])).length / c.t.length) : null,
      qwk: k == null ? null : round(k),
      confusion,
    };
  });

  const worst = pairs
    .map((p) => ({ ...p, error: round(p.ai20 - p.teacher20, 2) }))
    .sort((x, y) => Math.abs(y.error) - Math.abs(x.error))
    .slice(0, worstN);

  const r = pearson(a, t);
  return {
    n,
    mae: mae == null ? null : round(mae, 2),
    bias: n ? round(a.reduce((s, x, i) => s + x - t[i], 0) / n, 2) : null,
    within2Share,
    exactShare: share((p) => Math.round(p.ai20) === Math.round(p.teacher20)),
    adjacentShare: share((p) => Math.abs(Math.round(p.ai20) - Math.round(p.teacher20)) <= 1),
    pearson: r == null ? null : round(r),
    qwk: qwk == null ? null : round(qwk),
    meetsTarget: qwk != null && within2Share != null && qwk >= CALIBRATION_TARGET.qwk && within2Share >= CALIBRATION_TARGET.within2Share,
    criteria,
    worst,
  };
}

// ── Stored items → pairs, and CSV export ────────────────────────────────────

export type CalibrationItemStatus = 'pending' | 'graded' | 'failed';

export interface CalibrationItem {
  index: number;
  input: CalibrationInput;
  status: CalibrationItemStatus;
  attempts: number;
  ai?: {
    ratio: number;
    graded: boolean;
    wordStatus?: string;
    rubricProfile?: string;
    criteria?: Array<{ label: string; level: number }>;
  };
  error?: string;
  gradedAt?: number;
}

export function itemPair(item: CalibrationItem): GradedPair | null {
  if (item.status !== 'graded' || !item.ai || !(item.input.maxScore > 0)) return null;
  const pair: GradedPair = {
    index: item.index,
    teacher20: round((item.input.teacherScore / item.input.maxScore) * 20, 2),
    ai20: round(item.ai.ratio * 20, 2),
  };
  if (item.input.ref) pair.ref = item.input.ref;
  if (item.input.criteria) pair.teacherCriteria = item.input.criteria;
  if (item.ai.criteria?.length) pair.aiCriteria = Object.fromEntries(item.ai.criteria.map((c) => [c.label, c.level]));
  return pair;
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line per item: what was compared and how far apart. Student text is not exported. */
export function calibrationCsv(items: CalibrationItem[]): string {
  const labels = [...new Set(items.flatMap((i) => [
    ...Object.keys(i.input.criteria || {}),
    ...(i.ai?.criteria || []).map((c) => c.label),
  ]))];
  const header = ['row', 'ref', 'examId', 'questionIndex', 'status', 'teacherScore', 'maxScore', 'teacher20', 'ai20', 'error20', 'wordStatus', 'rubricProfile',
    ...labels.flatMap((l) => [`teacher:${l}`, `ai:${l}`])];
  const lines = [header.map(csvCell).join(',')];
  for (const item of [...items].sort((x, y) => x.index - y.index)) {
    const p = itemPair(item);
    const aiC = new Map((item.ai?.criteria || []).map((c) => [c.label, c.level]));
    lines.push([
      item.index + 1, item.input.ref ?? '', item.input.examId ?? '', item.input.questionIndex ?? '', item.status,
      item.input.teacherScore, item.input.maxScore, p?.teacher20 ?? '', p?.ai20 ?? '', p ? round(p.ai20 - p.teacher20, 2) : '',
      item.ai?.wordStatus ?? '', item.ai?.rubricProfile ?? '',
      ...labels.flatMap((l) => [item.input.criteria?.[l] ?? '', aiC.get(l) ?? '']),
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * An anonymized template: invented texts, no real student. Shows both ways
 * of pointing at a question (catalog exam + flattened index, or a free
 * prompt) and the optional `crit:<label>` teacher levels (0/1/2).
 */
export const CALIBRATION_SAMPLE_CSV = [
  'ref,examId,questionIndex,prompt,subject,level,studentText,teacherScore,maxScore,crit:Introduction et problématique,crit:Plan,crit:Argumentation et exemples,crit:Conclusion',
  'copie-001,,,"Le bonheur dépend-il de nous ?",Philosophie,Terminale,"Depuis toujours, les hommes cherchent le bonheur. Mais dépend-il vraiment de nous, ou des circonstances que nous ne choisissons pas ? Nous verrons d\'abord que nos choix comptent, puis que le hasard et la société pèsent aussi, avant de montrer que le bonheur se construit entre les deux. (texte inventé pour l\'exemple)",13,20,2,1,1,1',
  'copie-002,,,"Le bonheur dépend-il de nous ?",Philosophie,Terminale,"Le bonheur c\'est important. Tout le monde veut être heureux et c\'est bien. Il faut travailler à l\'école pour être heureux plus tard. (texte inventé pour l\'exemple)",5,20,0,0,0,0',
  'copie-003,EXAM_ID_DU_CATALOGUE,4,,,,"Réponse inventée à la question 5 (index 4) de l\'examen indiqué. Remplace EXAM_ID_DU_CATALOGUE par un exam_id réel de /exam_catalog_index.json.",11.5,20,,,,',
].join('\n') + '\n';
