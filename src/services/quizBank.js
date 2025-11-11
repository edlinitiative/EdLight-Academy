import { loadCSV } from '../utils/csvParser';

const BANK_CANDIDATES = [
  '/data/edlight_unified_quiz_database_expanded_with_chapters.csv',
  '/data/edlight_unified_quiz_database_expanded.csv',
  '/data/edlight_unified_quiz_database.csv'
];

export async function loadQuizBankSafe() {
  for (const url of BANK_CANDIDATES) {
    try {
      const rows = await loadCSV(url);
      console.info('[QuizBank] Loaded bank CSV:', url, 'rows:', rows.length);
      return rows;
    } catch (e) {
      // try next
      continue;
    }
  }
  console.warn('[QuizBank] No quiz bank CSV found from candidates:', BANK_CANDIDATES.join(', '));
  return [];
}

// Utility to read the first present key from a set of candidates
const pick = (obj, keys, fallback = '') => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
  }
  return fallback;
};

// Convert a bank row into a minimal Perseus multiple-choice item
export function toPerseusItemFromRow(row) {
  const stem = String(pick(row, ['question', 'question_text', 'prompt', 'stem'], '')).trim();
  const qTypeRaw = String(pick(row, ['question_type', 'type', 'qtype'], '')).trim();
  const qType = qTypeRaw ? qTypeRaw.toLowerCase() : '';

  // Collect options from either JSON array column ("options") or common schemas option_a..option_d
  let labels = [];
  const optionsJson = pick(row, ['options', 'choices'], '');
  if (optionsJson) {
    try {
      const arr = JSON.parse(optionsJson);
      if (Array.isArray(arr)) {
        labels = arr.map((v) => String(v));
      }
    } catch (e) {
      // Ignore parse failure and fall back to option_a..d
    }
  }
  if (labels.length === 0) {
    const optKeys = [
      ['option_a', 'optionA', 'A', 'choice_a', 'Choice A', 'choice_1', 'option1'],
      ['option_b', 'optionB', 'B', 'choice_b', 'Choice B', 'choice_2', 'option2'],
      ['option_c', 'optionC', 'C', 'choice_c', 'Choice C', 'choice_3', 'option3'],
      ['option_d', 'optionD', 'D', 'choice_d', 'Choice D', 'choice_4', 'option4'],
    ];
    for (const group of optKeys) {
      const val = pick(row, group, '');
      if (String(val).trim() !== '') labels.push(String(val));
    }
  }

  const correctRaw = String(pick(row, ['correct_option', 'correctOption', 'answer', 'correct', 'key', 'correct_answer'], '')).trim();

  // Normalize hints/explanations
  const hints = [];
  const hintKeys = ['hint', 'hint1', 'hint_1', 'explanation', 'solution', 'rationale'];
  for (const hk of hintKeys) {
    const h = pick(row, [hk], '');
    if (String(h).trim() !== '') hints.push(String(h));
  }

  // Branch by question type
  if (qType === 'truefalse' || qType === 'true/false' || qType === 'tf') {
    const tfLabels = labels.length >= 2 ? labels : ['True', 'False'];
    const corr = correctRaw.toLowerCase();
    const corrIdx = corr.startsWith('t') ? 0 : corr.startsWith('f') ? 1 : tfLabels.findIndex(l => l.trim().toLowerCase() === corr);
    const idx = corrIdx >= 0 ? corrIdx : 0;
    return {
      question: {
        content: `${stem}\n\n[[☃ multiple-choice 1]]`,
        images: {},
        widgets: {
          'multiple-choice 1': {
            type: 'multiple-choice',
            graded: true,
            options: {
              choices: tfLabels.slice(0, 2).map((content, i) => ({ content, correct: i === idx })),
              randomize: false,
            },
            version: { major: 0, minor: 0 },
          },
        },
      },
      answerArea: { calculator: false },
      hints: hints.map((h) => ({ content: h })),
      itemDataVersion: { major: 0, minor: 1 },
    };
  }

  if (qType === 'shortanswer' || qType === 'short' || qType === 'sa' || (labels.length === 0 && correctRaw)) {
    // Text input answer
    return {
      question: {
        content: `${stem}\n\n[[☃ text-input 1]]`,
        images: {},
        widgets: {
          'text-input 1': {
            type: 'text-input',
            graded: true,
            options: {
              value: correctRaw || '',
              width: 120,
            },
            version: { major: 0, minor: 0 },
          },
        },
      },
      answerArea: { calculator: false },
      hints: hints.map((h) => ({ content: h })),
      itemDataVersion: { major: 0, minor: 1 },
    };
  }

  // Default/MCQ path
  // Map correct to index: A/B/C/D or 1/2/3/4 or by content match
  let correctIdx = -1;
  if (/^[A-D]$/i.test(correctRaw)) {
    correctIdx = correctRaw.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  } else if (/^[1-9]$/.test(correctRaw)) {
    correctIdx = parseInt(correctRaw, 10) - 1;
  } else if (correctRaw) {
    const idx = labels.findIndex((l) => l.trim().toLowerCase() === correctRaw.trim().toLowerCase());
    if (idx !== -1) correctIdx = idx;
  }

  if (labels.length >= 2 && correctIdx >= 0) {
    return {
      question: {
        content: `${stem}\n\n[[☃ multiple-choice 1]]`,
        images: {},
        widgets: {
          'multiple-choice 1': {
            type: 'multiple-choice',
            graded: true,
            options: {
              choices: labels.map((content, i) => ({ content, correct: i === correctIdx })),
              randomize: true,
            },
            version: { major: 0, minor: 0 },
          },
        },
      },
      answerArea: { calculator: false },
      hints: hints.map((h) => ({ content: h })),
      itemDataVersion: { major: 0, minor: 1 },
    };
  }

  // Fallback: text-input if we can't construct a valid MCQ
  return {
    question: {
      content: `${stem}\n\n[[☃ text-input 1]]`,
      images: {},
      widgets: {
        'text-input 1': {
          type: 'text-input',
          graded: true,
          options: {
            value: correctRaw || '',
            width: 120,
          },
          version: { major: 0, minor: 0 },
        },
      },
    },
    answerArea: { calculator: false },
    hints: hints.map((h) => ({ content: h })),
    itemDataVersion: { major: 0, minor: 1 },
  };
}

// Convert a bank row into a simple, framework-agnostic quiz object we can render directly without Perseus
export function toDirectItemFromRow(row) {
  const stem = String(pick(row, ['question', 'question_text', 'prompt', 'stem'], '')).trim();
  const qTypeRaw = String(pick(row, ['question_type', 'type', 'qtype'], '')).trim().toLowerCase();
  const good = String(pick(row, ['good_response', 'good', 'explanation'], '')).trim();
  const wrong = String(pick(row, ['wrong_response', 'wrong', 'feedback'], '')).trim();
  const hints = [];
  for (const hk of ['hint', 'hint1', 'hint_1', 'hint2', 'hint_2', 'hint3', 'hint_3', 'rationale']) {
    const h = pick(row, [hk], '');
    if (String(h).trim() !== '') hints.push(String(h));
  }

  // Options extraction
  let labels = [];
  const optionsJson = pick(row, ['options', 'choices'], '');
  if (optionsJson) {
    try {
      const arr = JSON.parse(optionsJson);
      if (Array.isArray(arr)) labels = arr.map((v) => String(v));
    } catch {}
  }
  if (labels.length === 0) {
    const optKeys = [
      ['option_a', 'optionA', 'A', 'choice_a', 'Choice A', 'choice_1', 'option1'],
      ['option_b', 'optionB', 'B', 'choice_b', 'Choice B', 'choice_2', 'option2'],
      ['option_c', 'optionC', 'C', 'choice_c', 'Choice C', 'choice_3', 'option3'],
      ['option_d', 'optionD', 'D', 'choice_d', 'Choice D', 'choice_4', 'option4'],
    ];
    for (const group of optKeys) {
      const val = pick(row, group, '');
      if (String(val).trim() !== '') labels.push(String(val));
    }
  }

  const correctRaw = String(pick(row, ['correct_option', 'correctOption', 'answer', 'correct', 'key', 'correct_answer'], '')).trim();

  const asMcq = () => {
    // Determine correct index from A/B/C/D, 1-based numbers, or by matching content
    let correctIndex = -1;
    if (/^[A-D]$/i.test(correctRaw)) {
      correctIndex = correctRaw.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    } else if (/^[1-9]$/.test(correctRaw)) {
      correctIndex = parseInt(correctRaw, 10) - 1;
    } else if (correctRaw) {
      const idx = labels.findIndex((l) => l.trim().toLowerCase() === correctRaw.trim().toLowerCase());
      if (idx !== -1) correctIndex = idx;
    }
    if (labels.length >= 2 && correctIndex >= 0) {
      const correctLabel = labels[correctIndex];
      return { kind: 'mcq', stem, options: labels, correctIndex, correctLabel, hints, good, wrong };
    }
    // If MCQ unusable, fall back to short answer with correctRaw
    return { kind: 'short', stem, correctText: correctRaw, hints, good, wrong };
  };

  if (qTypeRaw === 'truefalse' || qTypeRaw === 'true/false' || qTypeRaw === 'tf') {
    const tfOptions = labels.length >= 2 ? labels.slice(0, 2) : ['True', 'False'];
    let idx = 0;
    const corr = correctRaw.toLowerCase();
    if (corr.startsWith('f')) idx = 1;
    else if (corr.startsWith('t')) idx = 0;
    else {
      const m = tfOptions.findIndex((l) => l.trim().toLowerCase() === corr);
      if (m >= 0) idx = m;
    }
    const correctLabel = tfOptions[idx] ?? 'True';
    return { kind: 'tf', stem, options: tfOptions, correctIndex: idx, correctLabel, hints, good, wrong };
  }

  if (qTypeRaw === 'shortanswer' || qTypeRaw === 'short' || qTypeRaw === 'sa' || (labels.length === 0 && correctRaw)) {
    return { kind: 'short', stem, correctText: correctRaw, hints, good, wrong };
  }

  // Default to MCQ flow
  return asMcq();
}

export function indexQuizBank(rows) {
  const byUnit = {};
  const bySubject = {};

  const normalizeSubjectBase = (s) => {
    const t = String(s || '').trim().toLowerCase();
    if (!t) return '';
    if (/(chem|chim)/.test(t)) return 'CHEM';
    if (/(phys)/.test(t)) return 'PHYS';
    if (/(math)/.test(t)) return 'MATH';
    if (/(econ|écon|econo)/.test(t)) return 'ECON';
    return t.toUpperCase();
  };
  const normalizeLevel = (lvl) => {
    const t = String(lvl || '').toUpperCase().replace(/\s+/g, ' ').trim();
    // Try roman numerals
    const mRoman = t.match(/NS\s*(I{1,3}|IV)\b/);
    if (mRoman) return `NS${mRoman[1]}`;
    // Try digits
    const mDigit = t.match(/NS\s*(\d)\b/);
    if (mDigit) return `NS${'I'.repeat(parseInt(mDigit[1], 10))}`;
    // Already compact form like NSI/NSII
    const mCompact = t.match(/NS(IV|III|II|I)\b/);
    if (mCompact) return `NS${mCompact[1]}`;
    return 'NSI';
  };
  const deriveCourseCode = (row) => {
    // First priority: use the new subject_code column (e.g., "chem-ns1")
    const code = String(pick(row, ['subject_code', 'course_code'], '')).trim();
    if (code) {
      // Normalize to uppercase with dash (e.g., "chem-ns1" -> "CHEM-NSI")
      const parts = code.split('-');
      if (parts.length === 2) {
        const subj = parts[0].toUpperCase();
        const level = normalizeLevel(parts[1]);
        return `${subj}-${level}`;
      }
      return code.toUpperCase();
    }
    
    // Fallback: derive from separate subject and level columns
    const subj = normalizeSubjectBase(pick(row, ['subject', 'course', 'discipline'], ''));
    const level = normalizeLevel(pick(row, ['level', 'grade'], ''));
    return subj && level ? `${subj}-${level}` : '';
  };
  const extractUnitId = (row) => {
    // First, try the new Chapter_Number column (most reliable)
    let chapterNum = String(pick(row, ['Chapter_Number', 'chapter_number'], '')).trim();
    if (chapterNum) {
      // Extract just the chapter number (e.g., "1" from "1.1" or "1")
      const match = chapterNum.match(/^(\d{1,2})/);
      if (match) return `U${match[1]}`;
    }
    
    // Fallback: Prefer explicit unit number
    let raw = pick(row, ['unit_no', 'unit_number'], '').toString().trim();
    if (!raw) raw = pick(row, ['unit'], '').toString().trim();
    if (!raw) return '';
    // If looks like a number, or prefixed with U
    const mNum = raw.match(/\b(\d{1,2})\b/);
    if (mNum) return `U${mNum[1]}`;
    const mU = raw.match(/U\s*(\d{1,2})/i);
    if (mU) return `U${mU[1]}`;
    return ''; // unknown textual unit, skip per-unit index
  };

  for (const row of rows) {
    const subjectCode = deriveCourseCode(row);
    if (!subjectCode) continue;
    // Always index by subject for fallback
    (bySubject[subjectCode] = bySubject[subjectCode] || []).push(row);

    // Best-effort unit index using Chapter_Number
    const unitId = extractUnitId(row);
    if (unitId) {
      const unitKey = `${subjectCode}|${unitId}`;
      (byUnit[unitKey] = byUnit[unitKey] || []).push(row);
    }
  }
  
  // Log indexing summary for debugging
  console.log('[QuizBank] Indexed questions by subject:', Object.keys(bySubject).map(k => `${k} (${bySubject[k].length})`).join(', '));
  console.log('[QuizBank] Indexed questions by unit:', Object.keys(byUnit).slice(0, 10).map(k => `${k} (${byUnit[k].length})`).join(', '), '...');
  
  return { byUnit, bySubject };
}

// Helper: basic string normalize for fuzzy title match
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[\u2012-\u2015]/g, '-')
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function parseChapterNo(row) {
  // Accept numeric or dotted strings; return integer chapter number when possible
  const raw = String(pick(row, ['Chapter_Number', 'chapter_number', 'chapterNo', 'chapter', 'lesson_no', 'lesson_number', 'Subchapter_Number', 'subchapter_number'], '')).trim();
  if (!raw) return '';
  // If "1.1" -> 1
  const dotted = raw.match(/^(\d+)(?:[\.-]\d+)?$/);
  if (dotted) return dotted[1];
  const num = raw.match(/\b(\d{1,2})\b/);
  if (num) return num[1];
  return '';
}

function matchVideoForRow(row, videos) {
  if (!Array.isArray(videos) || videos.length === 0) return null;
  const subjCode = (() => {
    const fromRow = String(row.subject_code || '').trim();
    if (fromRow) return fromRow;
    const subjLevelCode = (() => {
      const derive = (() => {
        const t = String(row.subject || '').trim();
        const lvl = String(row.level || '').trim();
        if (!t || !lvl) return '';
        const base = t.toLowerCase().includes('chem') || t.toLowerCase().includes('chim') ? 'CHEM'
          : t.toLowerCase().includes('phys') ? 'PHYS'
          : t.toLowerCase().includes('math') ? 'MATH'
          : t.toLowerCase().includes('econ') ? 'ECON'
          : t.toUpperCase();
        const roman = lvl.toUpperCase().match(/NS\s*(IV|III|II|I)\b/);
        const digit = lvl.toUpperCase().match(/NS\s*(\d)\b/);
        const compact = lvl.toUpperCase().match(/NS(IV|III|II|I)\b/);
        const ns = roman ? `NS${roman[1]}` : (digit ? `NS${'I'.repeat(parseInt(digit[1], 10))}` : (compact ? `NS${compact[1]}` : 'NSI'));
        return `${base}-${ns}`;
      })();
      return derive;
    })();
    return subjLevelCode;
  })();

  const unitNo = (() => {
    // Try explicit numeric first
    const raw = (row.unit_no || row.unit_number || row.unit || '').toString();
    const m = raw.match(/\b(\d{1,2})\b/);
    if (m) return m[1];
    const m2 = raw.match(/U\s*(\d{1,2})/i);
    if (m2) return m2[1];
    return '';
  })();
  const chapterNo = parseChapterNo(row);

  // Try to match by video title when subject code present but unit missing
  const rowTitle = norm(row.video_title || row.question || '');
  const candidates = videos.filter(v => !subjCode || v.subject_code === subjCode);

  // Prefer direct subject+unit+lesson (chapter) match when available
  if (subjCode && unitNo && chapterNo) {
    const exact = candidates.find(v => String(v.unit_no) === String(unitNo) && String(v.lesson_no) === String(chapterNo));
    if (exact) {
      return { video: exact, subject_code: exact.subject_code, unit_no: String(exact.unit_no) };
    }
  }
  let best = null;
  for (const v of candidates) {
    if (!v.video_title) continue;
    const vt = norm(v.video_title);
    if (!vt || !rowTitle) continue;
    // Simple contains in either direction
    if (vt.includes(rowTitle) || rowTitle.includes(vt)) {
      best = v;
      break;
    }
  }
  if (best) {
    return { video: best, subject_code: best.subject_code, unit_no: String(best.unit_no || '').trim() };
  }
  if (subjCode && unitNo) {
    // fallback to first video with that subject/unit
    const v = candidates.find(v => String(v.unit_no) === String(unitNo));
    if (v) return { video: v, subject_code: v.subject_code, unit_no: String(v.unit_no) };
  }
  return null;
}

export function normalizeAndIndexQuizBank(rows, videos = []) {
  const rowsNorm = rows.map((r) => {
    const subjectCode = (() => {
      const code = (r.subject_code || r.course_code || '').toString().trim();
      if (code) return code;
      // derive
      const base = String(r.subject || '').toLowerCase();
      const subj = base.includes('chem') || base.includes('chim') ? 'CHEM'
        : base.includes('phys') ? 'PHYS'
        : base.includes('math') ? 'MATH'
        : base.includes('econ') ? 'ECON'
        : (r.subject || '').toString().toUpperCase();
      const lvl = String(r.level || '').toUpperCase();
      const roman = lvl.match(/NS\s*(IV|III|II|I)\b/);
      const digit = lvl.match(/NS\s*(\d)\b/);
      const compact = lvl.match(/NS(IV|III|II|I)\b/);
      const ns = roman ? `NS${roman[1]}` : (digit ? `NS${'I'.repeat(parseInt(digit[1], 10))}` : (compact ? `NS${compact[1]}` : 'NSI'));
      return `${subj}-${ns}`;
    })();
    let unitNo = (() => {
      const raw = (r.unit_no || r.unit_number || r.unit || '').toString();
      const m = raw.match(/\b(\d{1,2})\b/);
      if (m) return m[1];
      const m2 = raw.match(/U\s*(\d{1,2})/i);
      if (m2) return m2[1];
      return '';
    })();
    let videoId = '';
    const mv = matchVideoForRow(r, videos);
    if (mv) {
      videoId = mv.video?.id || '';
      if (!unitNo && mv.unit_no) unitNo = mv.unit_no;
    }
    return { ...r, subject_code_norm: subjectCode, unit_no_norm: unitNo, unit_id_norm: unitNo ? `U${unitNo}` : '', video_id_match: videoId };
  });

  const byUnit = {};
  const bySubject = {};
  const byVideoId = {};
  for (const r of rowsNorm) {
    if (r.subject_code_norm) {
      (bySubject[r.subject_code_norm] = bySubject[r.subject_code_norm] || []).push(r);
      if (r.unit_no_norm) {
        const key = `${r.subject_code_norm}|U${r.unit_no_norm}`;
        (byUnit[key] = byUnit[key] || []).push(r);
      }
    }
    if (r.video_id_match) {
      (byVideoId[r.video_id_match] = byVideoId[r.video_id_match] || []).push(r);
    }
  }
  return { rows: rowsNorm, byUnit, bySubject, byVideoId };
}

export function pickRandomQuestion(indexByUnit, subjectCode, unitId, indexBySubject) {
  // Try exact unit match first
  const key = `${subjectCode}|${unitId}`; // unitId like 'U1'
  let arr = (indexByUnit && indexByUnit[key]) || [];
  if (arr.length === 0 && indexBySubject) {
    // Fallback: any question for this subject
    arr = indexBySubject[subjectCode] || [];
  }
  if (arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}
