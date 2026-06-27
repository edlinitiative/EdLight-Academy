// Mobile: quiz bank comes entirely from Firestore, not CSV files

const pick = (obj: any, keys: string[], fallback = '') => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
  }
  return fallback;
};

export async function loadQuizBankSafe(): Promise<any[]> {
  // On mobile the quiz bank is loaded from Firestore in dataService.loadAppData
  return [];
}

export function toPerseusItemFromRow(row: any): any {
  const stem = String(pick(row, ['question', 'question_text', 'prompt', 'stem'], '')).trim();
  let labels: string[] = [];
  const optionsJson = pick(row, ['options', 'choices'], '');
  if (optionsJson) {
    try {
      const arr = JSON.parse(optionsJson);
      if (Array.isArray(arr)) labels = arr.map(String);
    } catch { /* ignore */ }
  }
  if (labels.length === 0) {
    const optKeys = [
      ['option_a', 'optionA', 'A'],
      ['option_b', 'optionB', 'B'],
      ['option_c', 'optionC', 'C'],
      ['option_d', 'optionD', 'D'],
    ];
    for (const g of optKeys) {
      const val = pick(row, g, '');
      if (String(val).trim()) labels.push(String(val));
    }
  }
  const correctRaw = String(pick(row, ['correct_answer', 'answer', 'correct'], '')).trim();
  const correctIdx = labels.findIndex(
    (l, i) => l === correctRaw || ['A', 'B', 'C', 'D'][i] === correctRaw.toUpperCase(),
  );

  return {
    question: { content: stem, images: {}, widgets: {} },
    answerArea: { calculator: false },
    itemDataVersion: { major: 0, minor: 1 },
    widgets: {
      'radio 1': {
        type: 'radio',
        options: {
          choices: labels.map((l, i) => ({ content: l, correct: i === correctIdx })),
          deselectEnabled: false,
          randomize: false,
        },
      },
    },
  };
}

export function normalizeAndIndexQuizBank(quizzes: any[], _videos: any[]): any {
  const index: Record<string, any> = {};
  for (const quiz of quizzes) {
    const id = quiz.id || quiz.quiz_id;
    if (id) index[id] = quiz;
  }
  return { index, raw: quizzes };
}
