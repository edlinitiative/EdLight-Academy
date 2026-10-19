/**
 * Pure builders for the offline revision packs (no file system access), so
 * tests can pin them. scripts/build_offline_packs.mjs does the I/O.
 *
 * A pack is one level + subject. A subject whose papers would exceed
 * `maxPackBytes` is split into volumes, newest papers first, so a student on
 * metered data can take the recent years without the whole archive.
 * `fnv1a` and `utf8Bytes` must stay identical to shared/offlinePacks.ts.
 */

export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function utf8Bytes(text) {
  return Buffer.byteLength(text, 'utf8');
}

/** Fields the take and results screens never read. */
const DROP_FIELDS = new Set(['_api_usage', '_source_file', '_fix_note', '_debundled_from', '_debundled_year']);

const LEVEL_SLUG = { baccalaureat: 'bac', '9eme_af': '9af', universite: 'univ' };

export function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';
}

function yearOf(exam) {
  const m = String(exam?.year ?? '').match(/(19|20)\d{2}/g);
  return m ? parseInt(m[m.length - 1], 10) : null;
}

function questionCount(exam) {
  let n = 0;
  for (const s of exam?.sections || []) n += Array.isArray(s?.questions) ? s.questions.length : 0;
  return n;
}

export function slimExam(exam) {
  const out = {};
  for (const [k, v] of Object.entries(exam)) if (!DROP_FIELDS.has(k)) out[k] = v;
  return out;
}

/**
 * Build every pack. Returns [{ entry, text }] where `text` is the exact file
 * content and `entry` its manifest line (hash and size measured on `text`).
 */
export function buildExamPacks(catalog, { maxPackBytes = 1_200_000, now = Date.now(), gzipBytes } = {}) {
  const groups = new Map();
  for (const exam of Array.isArray(catalog) ? catalog : []) {
    if (!exam?.exam_id || !exam.level || !exam.subject || questionCount(exam) === 0) continue;
    const key = `${exam.level}\u0000${exam.subject}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slimExam(exam));
  }
  const out = [];
  const keys = [...groups.keys()].sort();
  for (const key of keys) {
    const [level, subject] = key.split('\u0000');
    // Newest first; ties by id so the build is deterministic.
    const exams = groups.get(key).sort((a, b) => (yearOf(b) ?? 0) - (yearOf(a) ?? 0) || String(a.exam_id).localeCompare(String(b.exam_id)));
    const volumes = [];
    let current = [];
    let bytes = 0;
    for (const exam of exams) {
      const size = utf8Bytes(JSON.stringify(exam));
      if (current.length && bytes + size > maxPackBytes) {
        volumes.push(current);
        current = [];
        bytes = 0;
      }
      current.push(exam);
      bytes += size;
    }
    if (current.length) volumes.push(current);
    const base = `exam-${LEVEL_SLUG[level] || slug(level)}-${slug(subject)}`;
    volumes.forEach((list, i) => {
      const id = volumes.length > 1 ? `${base}-${i + 1}` : base;
      const body = { schema: 1, id, kind: 'exam', level, subject, exams: list };
      const text = JSON.stringify(body);
      const hash = fnv1a(text);
      const years = list.map(yearOf).filter((y) => y != null);
      const entry = {
        id,
        kind: 'exam',
        level,
        subject,
        title: subject,
        ...(volumes.length > 1 ? { volume: i + 1, volumes: volumes.length } : {}),
        years: years.length ? [Math.min(...years), Math.max(...years)] : [null, null],
        items: list.length,
        questionCount: list.reduce((s, e) => s + questionCount(e), 0),
        sizeBytes: utf8Bytes(text),
        ...(gzipBytes ? { downloadBytes: gzipBytes(text) } : {}),
        hash,
        file: `${id}.${hash}.json`,
        createdAt: now,
      };
      out.push({ entry, text });
    });
  }
  return out;
}

export function buildManifest(packs, now = Date.now()) {
  return { schema: 1, createdAt: now, packs: packs.map((p) => p.entry) };
}
