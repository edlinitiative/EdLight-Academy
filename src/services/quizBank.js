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

  // Collect options in common schemas: option_a..option_d, choice_1..choice_4
  const labels = [];
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

  const correctRaw = String(pick(row, ['correct_option', 'correctOption', 'answer', 'correct', 'key'], '')).trim();
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
  for (const row of rows) {
    const subjectCode = String(pick(row, ['subject_code', 'subject', 'course_code'], '')).trim();
    const unitNoRaw = pick(row, ['unit_no', 'unit', 'unit_number'], '').toString().trim();
    if (!subjectCode || !unitNoRaw) continue;
    const unitKey = `${subjectCode}|U${unitNoRaw.replace(/^U/i, '')}`;
    (byUnit[unitKey] = byUnit[unitKey] || []).push(row);
  }
  return { byUnit };
}

export function pickRandomQuestion(byUnit, subjectCode, unitId) {
  const key = `${subjectCode}|${unitId}`; // unitId like 'U1'
  const arr = byUnit[key] || [];
  if (arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}
