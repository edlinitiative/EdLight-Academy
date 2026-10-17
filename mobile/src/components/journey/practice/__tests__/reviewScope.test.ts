import { dueIdsInScope, dueRowsInScope } from '../reviewScope';

const raw = [
  { id: 'a', subject_code: 'CHEM-NSI', Chapter_Number: '1' },
  { id: 'b', subject_code: 'CHEM-NSI', Chapter_Number: '2' },
  { id: 'c', subject_code: 'PHYS-NSI', Chapter_Number: '1' },
  { id: 'd', subject_code: 'CHEM-NSI', Chapter_Number: '1' },
];
const review = {
  a: { missedAt: 30 },
  b: { missedAt: 20 },
  c: { missedAt: 40 },
  d: { missedAt: 10, correctAt: 50 }, // fixed — not due
  gone: { missedAt: 99 }, // no longer in the bank
};

it('keeps a result\'s topic: same subject and chapter only', () => {
  expect(dueIdsInScope(review, raw, { subjectCode: 'chem-ns1', unitNo: 1 })).toEqual(['a']);
  expect(dueIdsInScope(review, raw, { subjectCode: 'CHEM-NSI' })).toEqual(['a', 'b']);
});

it('includes ids named explicitly (this session\'s misses)', () => {
  expect(dueIdsInScope(review, raw, { subjectCode: 'CHEM-NSI', unitNo: 1, ids: ['c'] })).toEqual(['c', 'a']);
});

it('prefers the entry\'s own metadata over the bank row', () => {
  const r = { b: { missedAt: 5, subjectCode: 'CHEM-NSI', unitNo: 1 } };
  expect(dueIdsInScope(r, raw, { subjectCode: 'CHEM-NSI', unitNo: 1 })).toEqual(['b']);
});

it('without a scope returns every due question still in the bank, newest first', () => {
  expect(dueIdsInScope(review, raw, null)).toEqual(['c', 'a', 'b']);
  expect(dueRowsInScope(review, raw, null).map((r) => r.id)).toEqual(['c', 'a', 'b']);
});
