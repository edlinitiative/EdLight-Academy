/** Shared fixtures: one real-shaped course and a small indexed bank. */
const mcq = (id: string, unit: string, n: number, extra: Record<string, unknown> = {}) => ({
  id,
  question: `Question ${id} ?`,
  options: JSON.stringify([`${id}-a`, `${id}-b`, `${id}-c`, `${id}-d`]),
  correct_option: 'A',
  good_response: `Explication ${id}`,
  subject_code_norm: 'CHEM-NSI',
  unit_id_norm: unit,
  unit_no: n,
  ...extra,
});

export const u1Rows = [mcq('r1', 'U1', 1), mcq('r2', 'U1', 1), mcq('r3', 'U1', 1)];
// A key-less short answer: cannot be auto-graded.
export const ungradableRow = { id: 'r9', question: 'Explique.', question_type: 'short', correct_option: '', subject_code_norm: 'CHEM-NSI', unit_id_norm: 'U1' };
export const physRow = { ...mcq('p1', 'U1', 1), subject_code_norm: 'PHYS-NSI' };

export const quizBank = {
  rows: [...u1Rows, ungradableRow, physRow],
  byUnit: { 'CHEM-NSI|U1': [...u1Rows, ungradableRow], 'PHYS-NSI|U1': [physRow] },
  bySubject: { 'CHEM-NSI': [...u1Rows, ungradableRow], 'PHYS-NSI': [physRow] },
};

export const courses = [
  {
    id: 'chem-ns1',
    code: 'CHEM-NSI',
    subject: 'CHEM',
    level: 'NSI',
    modules: [
      { id: 'chem-ns1-u1', title: 'Grandeurs et Mesures', order: 1, unit_no: 1, lessons: [
        { id: 'CHEM-NSI-U1-L1', title: 'Mesurer une longueur', order: 1 },
        { id: 'CHEM-NSI-U1-L2', title: 'Les unités', order: 2 },
      ] },
      // A unit the bank has no questions for yet.
      { id: 'chem-ns1-u2', title: "L'Atome", order: 2, unit_no: 2, lessons: [
        { id: 'CHEM-NSI-U2-L1', title: "L'Atome (Partie 1)", order: 1 },
      ] },
    ],
  },
  { id: 'phys-ns1', code: 'PHYS-NSI', subject: 'PHYS', level: 'NSI', modules: [{ id: 'phys-ns1-u1', title: 'Forces', order: 1, unit_no: 1, lessons: [] }] },
];
