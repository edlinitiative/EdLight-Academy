/**
 * Sandra knowledge-base chunk builders — PURE functions, no I/O, no imports.
 *
 * Each builder turns a live content record (a Firestore course/quiz doc or an
 * exam-JSON question) into flat, embeddable chunks of the shape:
 *
 *   { text, courseId, level, subject, type: 'lesson'|'quiz'|'exam', sourceId }
 *
 * `text` is capped at MAX_CHUNK_CHARS so a single chunk never blows past the
 * embedding model's practical window. Kept dependency-free so it can be unit
 * tested in jest and imported by the firebase-admin build script alike.
 *
 * Data quirks handled here (from live Firestore):
 *   - a quiz doc's `options` is a JSON *string* (e.g. '["a","b"]'), not an array;
 *   - a quiz doc's `correct_answer` is a bare letter ("B") that must resolve to
 *     the matching option text;
 *   - lesson / quiz / exam titles and fields are unevenly populated.
 */

export const MAX_CHUNK_CHARS = 1500;

/** Trim, coerce to string, and hard-truncate to the chunk budget. */
function truncate(text) {
  const t = String(text == null ? '' : text).trim();
  return t.length <= MAX_CHUNK_CHARS ? t : t.slice(0, MAX_CHUNK_CHARS).trimEnd();
}

/** Parse subject + level out of a course id like "chem-ns1" → { subject:'chem', level:'ns1' }. */
function parseCourseId(courseId) {
  const [subjPart, lvlPart] = String(courseId || '').split('-');
  return {
    subject: subjPart ? subjPart.toLowerCase() : '',
    level: lvlPart ? lvlPart.toLowerCase() : '',
  };
}

/** Parse an `options` field that may be a JSON string, an array, or absent. */
function parseOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string' && options.trim()) {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON — treat as no options */
    }
  }
  return [];
}

/** Render options as "A. …\nB. …" lines. */
function optionLines(options) {
  return options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
}

/**
 * Resolve a `correct_answer` that may be a bare letter ("B") into readable text.
 * Falls back to the raw value when it isn't a single letter or can't be mapped.
 */
function resolveCorrect(rawCorrect, options) {
  const raw = rawCorrect == null ? '' : String(rawCorrect).trim();
  if (!raw) return '';
  const letter = raw.match(/^([A-Za-z])$/);
  if (letter && options.length) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return `${letter[1].toUpperCase()}. ${options[idx]}`;
  }
  return raw;
}

/**
 * chunkCourse — one 'lesson' chunk per lesson that has a title.
 * Skips lessons with no title. Level/subject come from the course id
 * ("chem-ns1"), overridable by explicit doc fields.
 */
export function chunkCourse(courseDoc) {
  if (!courseDoc || !courseDoc.id) return [];
  const courseId = courseDoc.id;
  const parsed = parseCourseId(courseId);
  const subject = (courseDoc.subject || parsed.subject || '').toLowerCase();
  const level = (courseDoc.level || parsed.level || '').toLowerCase();

  const chunks = [];
  for (const unit of courseDoc.units || []) {
    const unitTitle = unit.title || '';
    for (const lesson of unit.lessons || []) {
      const title = lesson && lesson.title ? String(lesson.title).trim() : '';
      if (!title) continue; // skip lessons with no title
      const objectives = lesson.objectives || lesson.learning_objectives || '';
      const parts = [
        `Cours ${courseId} (${subject} ${level})`.trim(),
        unitTitle ? `Unité: ${unitTitle}` : '',
        `Leçon: ${title}`,
        objectives ? `Objectifs: ${objectives}` : '',
      ].filter(Boolean);
      chunks.push({
        text: truncate(parts.join('\n')),
        courseId,
        level,
        subject,
        type: 'lesson',
        sourceId: lesson.lessonId || `${courseId}:${unitTitle}:${title}`,
      });
    }
  }
  return chunks;
}

/**
 * chunkQuiz — one 'quiz' chunk per quiz doc (each doc is a single question).
 * `courseIdGuess` supplies courseId/level/subject; falls back to the doc's
 * own subject_code when no guess is given. Handles JSON-string options and
 * letter `correct_answer`.
 */
export function chunkQuiz(quizDoc, courseIdGuess) {
  if (!quizDoc) return [];
  const question = quizDoc.question ? String(quizDoc.question).trim() : '';
  if (!question) return [];

  const courseId = courseIdGuess || '';
  const parsed = parseCourseId(courseId);
  const subject = (parsed.subject || (quizDoc.subject_code ? String(quizDoc.subject_code).split('-')[0].toLowerCase() : '')).toLowerCase();
  const level = parsed.level || '';

  const options = parseOptions(quizDoc.options);
  const correctText = resolveCorrect(quizDoc.correct_answer, options);
  const explanation = quizDoc.explanation || quizDoc.hint || quizDoc.good_response || '';
  const lines = options.length ? optionLines(options) : '';

  const parts = [
    `Question de quiz: ${question}`,
    lines ? `Options:\n${lines}` : '',
    correctText ? `Bonne réponse: ${correctText}` : '',
    explanation ? `Explication: ${explanation}` : '',
  ].filter(Boolean);

  return [{
    text: truncate(parts.join('\n')),
    courseId,
    level,
    subject,
    type: 'quiz',
    sourceId: quizDoc.id || quizDoc.question_id || `quiz:${question.slice(0, 80)}`,
  }];
}

/**
 * chunkExamQuestion — one 'exam' chunk per exam question.
 * `meta` = { examId, subject, level, courseId? }. Statement comes from
 * `question`, the démarche from scaffold_text/hints, and the solution from
 * model_answer/final_answer/correct/explanation.
 */
export function chunkExamQuestion(q, meta = {}) {
  if (!q) return [];
  const statement = (q.question || q.statement || '').toString().trim();
  if (!statement) return [];

  const courseId = meta.courseId || '';
  const parsedFromCourse = parseCourseId(courseId);
  const subject = (meta.subject || parsedFromCourse.subject || '').toString().toLowerCase();
  const level = (meta.level || parsedFromCourse.level || '').toString().toLowerCase();
  const examId = meta.examId || meta.exam_id || '';

  const options = parseOptions(q.options);
  const hints = Array.isArray(q.hints) ? q.hints.filter(Boolean) : [];
  const demarche = q.scaffold_text || (hints.length ? hints.join(' ') : '');
  const solution = q.model_answer || q.final_answer || q.correct || q.explanation || '';
  const lines = options.length ? optionLines(options) : '';

  const header = examId
    ? `Question d'examen (${examId}${q.number != null ? ` n°${q.number}` : ''})`
    : "Question d'examen";
  const parts = [
    `${header}: ${statement}`,
    lines ? `Options:\n${lines}` : '',
    demarche ? `Démarche: ${demarche}` : '',
    solution ? `Solution: ${solution}` : '',
  ].filter(Boolean);

  return [{
    text: truncate(parts.join('\n')),
    courseId,
    level,
    subject,
    type: 'exam',
    sourceId: `${examId || 'exam'}:${q.number != null ? q.number : statement.slice(0, 40)}`,
  }];
}
