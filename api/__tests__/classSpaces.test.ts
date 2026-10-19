import { ClassDb } from './helpers/classDb';
import { classHome, completeAssignment, createClass, eraseClassAccount, joinClass, mutateClass, prepareClassXp, readClass, syncExamClasses } from '../_lib/classSpaces';
import { classWeek } from '../../shared/classes';

jest.mock('../_lib/explainGate', () => ({ examFetcher: () => async () => ({
  exam_id: 'exam1', sections: [{ questions: [
    { type: 'multiple_choice', question: '2+2?', options: { a: '4', b: '3' }, correct: 'a', points: 2 },
    { type: 'essay', question: 'Explique.', points: 10 },
    { type: 'multiple_choice', question: 'Source incomplète', correct: 'N/A', points: 99 },
  ] }],
}) }));

const now = Date.UTC(2026, 9, 19, 12);
let memory: ClassDb;
const db = () => memory as any;
let id: string;
const code = () => memory.store.get(`classes/${id}`).code;
const teacher = () => memory.store.set('classTeachers/teacher', { active: true });
const join = (uid = 'student') => joinClass(db(), uid, uid === 'student' ? 'Élève A' : 'Élève B', code(), now);
const approve = (uid = 'student') => mutateClass(db(), 'teacher', 'approve', { id, studentUid: uid }, now);
const assign = () => mutateClass(db(), 'teacher', 'assign', { id, requestId: 'assignment1', title: 'Maths', examId: 'exam1', level: 'terminale', dueAt: now + 86400000 }, now);
const seedSubmission = (at = now + 1000) => {
  memory.store.set('users/student/examAttempts/exam1', { status: 'submitted', submitted_at: { toMillis: () => at } });
  memory.store.set('users/student/examResults/exam1', { answers: { 0: 'a', 1: 'private essay text' }, summary: { percentage: 999 } });
};
beforeEach(async () => {
  memory = new ClassDb(); teacher();
  ({ id } = await createClass(db(), 'teacher', { title: 'NS4 A', school: 'Lycée', grade: 'NS4', requestId: 'create1' }, now));
});

it('requires an explicit teacher grant, with idempotent creation', async () => {
  await expect(createClass(db(), 'student', { title: 'A', school: 'B', grade: 'C', requestId: 'create1' }, now)).rejects.toMatchObject({ code: 'teacher_required' });
  const retry = await createClass(db(), 'teacher', { title: 'NS4 A', school: 'Lycée', grade: 'NS4', requestId: 'create1' }, now);
  expect(retry.id).toBe(id);
  expect([...memory.store.keys()].filter((p) => p.startsWith('classCodes/'))).toHaveLength(1);
});
it('a join code creates only a pending request; strangers and pending students cannot read a class', async () => {
  await join();
  expect((await classHome(db(), 'student')).classes[0].pending).toBe(true);
  await expect(readClass(db(), 'student', id, now)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(readClass(db(), 'stranger', id, now)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(mutateClass(db(), 'student', 'approve', { id, studentUid: 'student' }, now)).rejects.toMatchObject({ code: 'forbidden' });
});
it('approval is idempotent, hides the code and pending names from students, and exposes no answers', async () => {
  await join(); await join('other'); await approve();
  const retry = await approve(); expect(retry.joined).toBe(false);
  const student = await readClass(db(), 'student', id, now);
  expect(student.classroom.code).toBeUndefined(); expect(student.pending).toEqual([]); expect(student.scores).toEqual({});
  const host = await readClass(db(), 'teacher', id, now);
  expect(host.classroom.code).toBe(code()); expect(host.pending[0].name).toBe('Élève B');
  expect(JSON.stringify(student)).not.toContain('private essay text');
});
it('cannot manage classes after the teacher grant is revoked', async () => {
  await join(); memory.store.set('classTeachers/teacher', { active: false });
  await expect(approve()).rejects.toMatchObject({ code: 'teacher_required' });
});
it('leaving and removal revoke access and delete saved assignment details', async () => {
  await join(); await approve(); await assign(); seedSubmission();
  await syncExamClasses(db(), 'student', 'exam1', now + 2000);
  await mutateClass(db(), 'student', 'leave', { id }, now);
  expect((await classHome(db(), 'student')).classes).toEqual([]);
  await expect(readClass(db(), 'student', id, now)).rejects.toMatchObject({ code: 'forbidden' });
  expect(memory.store.get(`classes/${id}/state/completions`).byUid.student).toBeUndefined();
});
it('recomputes objective marks and credits one completion despite concurrent retries', async () => {
  await join(); await approve(); await assign(); seedSubmission();
  const aid = memory.store.get(`classes/${id}`).assignments[0].id;
  await Promise.all([completeAssignment(db(), 'student', id, aid, now), completeAssignment(db(), 'student', id, aid, now)]);
  const host = await readClass(db(), 'teacher', id, now);
  expect(host.completionCounts[aid]).toBe(1);
  expect(host.scores.student[aid].objectiveScore).toBe(100);
  expect(host.members[0].completed).toBe(1);
  expect(JSON.stringify(host)).not.toContain('private essay text');
  const student = await readClass(db(), 'student', id, now);
  expect(student.scores).toEqual({});
});
it('does not count a prior submission, an in-progress retake, or a forged client score', async () => {
  await join(); await approve(); await assign(); seedSubmission(now - 1);
  const aid = memory.store.get(`classes/${id}`).assignments[0].id;
  await expect(completeAssignment(db(), 'student', id, aid, now)).rejects.toMatchObject({ code: 'not_submitted' });
  seedSubmission(); memory.store.get('users/student/examAttempts/exam1').status = 'in_progress';
  await expect(completeAssignment(db(), 'student', id, aid, now)).rejects.toMatchObject({ code: 'not_submitted' });
});
it('opening the class repairs a lost post-submit handoff once', async () => {
  await join(); await approve(); await assign(); seedSubmission();
  const first = await readClass(db(), 'student', id, now + 2000);
  expect(first.completed).toHaveLength(1);
  const retry = await readClass(db(), 'student', id, now + 3000);
  expect(retry.members[0].completed).toBe(1);
});
it('class XP follows approved membership, and stops after leaving', async () => {
  const award = () => memory.runTransaction(async (tx) => { const write = await prepareClassXp(db(), tx, 'student', 20, now); write(); });
  await join(); await award(); expect(memory.store.has(`classes/${id}/weeks/${classWeek(now)}`)).toBe(false);
  await approve(); await award(); await award();
  expect((await readClass(db(), 'student', id, now)).members[0].xp).toBe(40);
  await mutateClass(db(), 'student', 'leave', { id }, now); await award();
  expect(memory.store.get(`classes/${id}/weeks/${classWeek(now)}`).xp.student).toBe(40);
});
it('archiving closes assignments and code entry', async () => {
  const pin = code(); await mutateClass(db(), 'teacher', 'archive', { id }, now);
  await expect(joinClass(db(), 'student', 'A', pin, now)).rejects.toMatchObject({ code: 'not_found' });
  await expect(assign()).rejects.toMatchObject({ code: 'archived' });
});
it('deletes student identity and weekly aggregates; teacher deletion removes the class tree', async () => {
  await join(); await approve(); await assign(); seedSubmission(); await syncExamClasses(db(), 'student', 'exam1', now);
  await eraseClassAccount(db(), 'student');
  expect(JSON.stringify([...memory.store.entries()].filter(([p]) => !p.startsWith('users/')))).not.toContain('student');
  await join('other'); await approve('other'); await eraseClassAccount(db(), 'teacher');
  expect(memory.store.has(`classes/${id}`)).toBe(false);
  expect(memory.store.get('classAccounts/other').ids).toEqual([]);
});
