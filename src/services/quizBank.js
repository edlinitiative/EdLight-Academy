import { loadCSV } from '../utils/csvParser';

const BANK_URL = '/data/edlight_unified_quiz_database_expanded.csv';

export async function loadQuizBankSafe() {
  try {
    const rows = await loadCSV(BANK_URL);
    return rows;
  } catch (e) {
    // 404 or network: treat as no bank available
    console.warn('[QuizBank] Unified quiz CSV not found or failed to load:', e?.message || e);
    return [];
  }
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
  // Map A/B/C/D or 1/2/3/4 to index
  let correctIdx = -1;
  if (/^[A-D]$/i.test(correctRaw)) {
    correctIdx = correctRaw.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  } else if (/^[1-4]$/.test(correctRaw)) {
    correctIdx = parseInt(correctRaw, 10) - 1;
  } else if (correctRaw) {
    // try matching by content
    const idx = labels.findIndex((l) => l.trim().toLowerCase() === correctRaw.trim().toLowerCase());
    if (idx !== -1) correctIdx = idx;
  }

  const hints = [];
  const hintKeys = ['hint', 'hint1', 'hint_1', 'explanation', 'solution', 'rationale'];
  for (const hk of hintKeys) {
    const h = pick(row, [hk], '');
    if (String(h).trim() !== '') hints.push(String(h));
  }

  // Build Perseus item
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

  // Fallback: simple numeric/text input item if options are not usable
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
            width: 80,
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
    const code = String(pick(row, ['subject_code', 'course_code'], '')).trim();
    if (code) return code;
    const subj = normalizeSubjectBase(pick(row, ['subject', 'course', 'discipline'], ''));
    const level = normalizeLevel(pick(row, ['level', 'grade'], ''));
    return subj && level ? `${subj}-${level}` : '';
  };
  const extractUnitId = (row) => {
    // Prefer explicit unit number
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

    // Best-effort unit index
    const unitId = extractUnitId(row);
    if (unitId) {
      const unitKey = `${subjectCode}|${unitId}`;
      (byUnit[unitKey] = byUnit[unitKey] || []).push(row);
    }
  }
  return { byUnit, bySubject };
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
