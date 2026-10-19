import { createHash, randomInt } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { CLASS_CONSENT_VERSION, CLASS_LIMITS, ClassError, assertMember, assertTeacher, classDetail, classId, classText, classWeek, type ClassDetail, type ClassRecord, type ClassWeek } from '../../shared/classes';
import { balanceHouses, keepAndFill, parseHouses, smallestHouse } from '../../shared/classHouses';
import { detachFromClassTournaments } from '../tournois/_shared';
import { eraseTeacherFixtures, fixtureCategories, fixtureViews, readOpenFixtures } from './classFixtures';
import { flattenQuestions, gradeExam } from '../../shared/examUtils';
import { isEssayType } from '../../shared/essayGradeCore';
import { examFetcher } from './explainGate';

/** Essay grading updates the result shortly after submit; edits later than this aren't trusted. */
export const RESULT_EDIT_GRACE_MS = 10 * 60 * 1000;

const fetchExam = examFetcher('https://academy.edlight.org');
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');
const stableId = (uid: string, requestId: unknown) => createHash('sha256').update(`${uid}:${classId(requestId)}`).digest('hex').slice(0, 28);
const emptyWeek = (): ClassWeek => ({ xp: {}, completed: {} });
const previousWeek = (now: number) => classWeek(now - 7 * 86400000);

export async function classHome(db: Firestore, uid: string) {
  const [account, role, owned] = await Promise.all([
    db.doc(`classAccounts/${uid}`).get(), db.doc(`classTeachers/${uid}`).get(),
    db.collection('classes').where('teacherUid', '==', uid).limit(CLASS_LIMITS.perTeacher).get(),
  ]);
  const ids = (account.data()?.ids || []) as string[];
  const joined = ids.length ? await db.getAll(...ids.map((id) => db.doc(`classes/${id}`))) : [];
  const rows = [...new Map([...owned.docs, ...joined].filter((d) => d.exists).map((d) => [d.id, d.data() as ClassRecord])).values()];
  return { canTeach: role.data()?.active === true, classes: rows.filter((c) => c.teacherUid === uid || c.members[uid] || c.pending[uid])
    .map((c) => ({ id: c.id, title: c.title, school: c.school, teacher: c.teacherUid === uid, pending: !!c.pending[uid], archived: c.archived })) };
}

export async function readClass(db: Firestore, uid: string, id: string, now: number): Promise<ClassDetail> {
  await syncClassAssignments(db, uid, classId(id), now);
  // Read permission and payload in one snapshot to prevent a concurrent leave exposing the old board.
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`classes/${classId(id)}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ClassError('not_found');
    const c = snap.data() as ClassRecord;
    assertMember(c, uid);
    const [week, completions] = await Promise.all([
      tx.get(ref.collection('weeks').doc(classWeek(now))), tx.get(ref.collection('state').doc('completions')),
    ]);
    const items = completions.data()?.byUid || {};
    const approved = Object.fromEntries(Object.entries(items).filter(([id]) => !!c.members[id]));
    const byUid = Object.fromEntries(Object.entries(approved).map(([id, value]) => [id, Object.keys(value as object)]));
    const out = classDetail(c, uid, (week.data() as ClassWeek) || emptyWeek(), byUid, now);
    // Scores are private to the teacher; answers and transcripts are never returned.
    return { detail: { ...out, scores: out.teacher ? approved as ClassDetail['scores'] : {} } as ClassDetail, c };
  }).then(async ({ detail, c }) => ({
    ...detail,
    fixtures: await fixtureViews(db, c, uid, now),
    ...(detail.teacher ? { fixtureCategories: fixtureCategories() } : {}),
  }));
}

export async function createClass(db: Firestore, uid: string, body: Record<string, unknown>, now: number) {
  const id = stableId(uid, body.requestId);
  const title = classText(body.title), school = classText(body.school), grade = classText(body.grade, 30);
  const code = newCode();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`classes/${id}`);
    const [existing, role, owned, pin] = await Promise.all([
      tx.get(ref), tx.get(db.doc(`classTeachers/${uid}`)),
      tx.get(db.collection('classes').where('teacherUid', '==', uid).limit(CLASS_LIMITS.perTeacher)),
      tx.get(db.doc(`classCodes/${code}`)),
    ]);
    if (role.data()?.active !== true) throw new ClassError('teacher_required');
    if (existing.exists) return;
    if (owned.size >= CLASS_LIMITS.perTeacher) throw new ClassError('full');
    if (pin.exists) throw new ClassError('unavailable'); // Safe retry with the same request id generates another code.
    const c: ClassRecord = { id, title, school, grade, teacherUid: uid, code, createdAt: now, archived: false,
      memberUids: [], pendingUids: [], members: {}, pending: {}, assignments: [] };
    tx.create(ref, c);
    tx.create(db.doc(`classCodes/${code}`), { classId: id });
  });
  return { id };
}

/** Recover the post-submit handoff when the app closed before it reached the server. */
export async function syncClassAssignments(db: Firestore, uid: string, id: string, now: number, examId?: string) {
  const ref = db.doc(`classes/${classId(id)}`), snap = await ref.get();
  if (!snap.exists) throw new ClassError('not_found');
  const c = snap.data() as ClassRecord;
  assertMember(c, uid);
  if (!c.members[uid] || c.archived) return;
  const done = await ref.collection('state').doc('completions').get();
  const pending = c.assignments.filter((a) => (!examId || a.examId === examId) && !done.data()?.byUid?.[uid]?.[a.id]);
  if (!pending.length) return;
  const attempts = await db.getAll(...pending.map((a) => db.doc(`users/${uid}/examAttempts/${a.examId}`)));
  for (let index = 0; index < pending.length; index++) {
    const a = pending[index], attempt = attempts[index].data();
    if (attempt?.status !== 'submitted' || (attempt.submitted_at?.toMillis?.() || 0) < a.createdAt) continue;
    try { await completeAssignment(db, uid, id, a.id, now); }
    catch (error) { if (!(error instanceof ClassError && error.code === 'not_submitted')) throw error; }
  }
}

export async function syncExamClasses(db: Firestore, uid: string, examId: string, now: number) {
  const classes = await db.collection('classes').where('memberUids', 'array-contains', uid).limit(CLASS_LIMITS.perStudent).get();
  for (const c of classes.docs) await syncClassAssignments(db, uid, c.id, now, examId);
  return { ok: true };
}

export async function joinClass(db: Firestore, uid: string, name: string, code: string, now: number) {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new ClassError('not_found');
  return db.runTransaction(async (tx) => {
    const pin = await tx.get(db.doc(`classCodes/${code}`));
    if (!pin.exists) throw new ClassError('not_found');
    const ref = db.doc(`classes/${classId(pin.data()?.classId)}`);
    const accountRef = db.doc(`classAccounts/${uid}`);
    const [snap, account] = await Promise.all([tx.get(ref), tx.get(accountRef)]);
    if (!snap.exists) throw new ClassError('not_found');
    const c = snap.data() as ClassRecord;
    if (c.archived) throw new ClassError('archived');
    if (c.teacherUid === uid || c.members[uid] || c.pending[uid]) return { id: c.id, pending: !!c.pending[uid] };
    const ids = (account.data()?.ids || []) as string[];
    if (ids.length >= CLASS_LIMITS.perStudent || c.pendingUids.length >= CLASS_LIMITS.pending || c.memberUids.length >= CLASS_LIMITS.students) throw new ClassError('full');
    c.pending[uid] = { name: name.slice(0, 80), joinedAt: now, consent: CLASS_CONSENT_VERSION };
    c.pendingUids.push(uid);
    tx.set(ref, c);
    tx.set(accountRef, { ids: [...new Set([...ids, c.id])] });
    return { id: c.id, pending: true };
  });
}

export async function mutateClass(db: Firestore, uid: string, action: string, body: Record<string, unknown>, now: number) {
  const out = await mutateClassTx(db, uid, action, body, now);
  if (action === 'remove' || action === 'leave') {
    // Stop counting for this class in class tournaments. Scores stay; standings re-check membership regardless.
    const target = action === 'leave' ? uid : classId(body.studentUid);
    await detachFromClassTournaments(db, target, classId(body.id), now).catch(() => console.error('[classes] tournament detach failed'));
  }
  return out;
}

async function mutateClassTx(db: Firestore, uid: string, action: string, body: Record<string, unknown>, now: number) {
  const id = classId(body.id);
  // Fetch and validate published content before starting a transaction. No arbitrary URL supplied by clients.
  let exam: any;
  if (action === 'assign') {
    exam = await fetchExam(classId(body.examId));
    if (!exam || flattenQuestions(exam).length === 0) throw new ClassError('not_found');
  }
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`classes/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ClassError('not_found');
    const c = snap.data() as ClassRecord;
    if (action !== 'leave' && action !== 'share-mastery') {
      assertTeacher(c, uid);
      const role = await tx.get(db.doc(`classTeachers/${uid}`));
      if (role.data()?.active !== true) throw new ClassError('teacher_required');
    }
    else if (action === 'leave' && !c.members[uid] && !c.pending[uid]) return { ok: true, joined: false };
    if (action === 'share-mastery') {
      // A member who joined under the earlier disclosure re-accepts the current one.
      if (!c.members[uid]) throw new ClassError('forbidden');
      c.members[uid] = { ...c.members[uid], consent: CLASS_CONSENT_VERSION };
      tx.set(ref, c);
      return { ok: true, joined: false };
    }
    if (c.archived && action !== 'leave') throw new ClassError('archived');
    let joined = false;
    if (action === 'approve' || action === 'reject' || action === 'remove' || action === 'leave') {
      const target = action === 'leave' ? uid : classId(body.studentUid);
      const accountRef = db.doc(`classAccounts/${target}`);
      const account = await tx.get(accountRef);
      const completionsRef = ref.collection('state').doc('completions');
      const completions = action === 'approve' ? null : await tx.get(completionsRef);
      if (action === 'approve') {
        if (!c.pending[target] && !c.members[target]) throw new ClassError('not_found');
        if (!c.members[target]) {
          if (c.memberUids.length >= CLASS_LIMITS.students) throw new ClassError('full');
          c.members[target] = c.pending[target]; c.memberUids.push(target); joined = true;
          // A new member lands in the smallest house, so headcounts stay within one.
          const house = smallestHouse((c.houses || []).map((h) => h.id), c.houseOf || {}, c.memberUids);
          if (house) c.houseOf = { ...(c.houseOf || {}), [target]: house };
        }
      } else {
        delete c.members[target]; c.memberUids = c.memberUids.filter((v) => v !== target);
        if (c.houseOf) delete c.houseOf[target];
        tx.set(accountRef, { ids: ((account.data()?.ids || []) as string[]).filter((v) => v !== id) });
        const byUid = completions?.data()?.byUid || {};
        delete byUid[target];
        tx.set(completionsRef, { byUid });
      }
      delete c.pending[target]; c.pendingUids = c.pendingUids.filter((v) => v !== target);
    } else if (action === 'assign') {
      const aid = stableId(uid, body.requestId);
      if (!c.assignments.some((a) => a.id === aid)) {
        if (c.assignments.length >= CLASS_LIMITS.assignments) throw new ClassError('full');
        const dueAt = Number(body.dueAt);
        if (!Number.isFinite(dueAt) || dueAt <= now || dueAt > now + 366 * 86400000) throw new ClassError('invalid_input');
        const rawLevel = String(exam.level || '').toLowerCase();
        const level = /9|neuvi/.test(rawLevel) ? '9e' : /univers/.test(rawLevel) ? 'university' : 'terminale';
        c.assignments.push({ id: aid, title: classText(body.title), examId: classId(body.examId), level, createdAt: now, dueAt });
      }
    } else if (action === 'archive') {
      const open = await readOpenFixtures(tx, db, c);
      c.archived = true;
      tx.delete(db.doc(`classCodes/${c.code}`));
      for (const f of open) {
        tx.set(db.doc(`classFixtures/${f.id}`), { ...f, state: 'cancelled', decidedAt: now });
        tx.delete(db.doc(`classFixtureCodes/${f.code}`));
      }
    } else if (action === 'houses-set' || action === 'houses-balance') {
      const houses = action === 'houses-set' ? parseHouses(body.houses) : c.houses || [];
      if (!houses.length) throw new ClassError('invalid_input');
      const ids = houses.map((h) => h.id);
      if (action === 'houses-set' && body.mode === 'keep') c.houseOf = keepAndFill(c.memberUids, ids, c.houseOf || {});
      else {
        // Spread recent strength: this week's and last week's practice XP.
        const [now0, prev] = await Promise.all([tx.get(ref.collection('weeks').doc(classWeek(now))), tx.get(ref.collection('weeks').doc(previousWeek(now)))]);
        const strength: Record<string, number> = {};
        for (const w of [now0.data(), prev.data()] as Array<ClassWeek | undefined>) for (const [u, xp] of Object.entries(w?.xp || {})) strength[u] = (strength[u] || 0) + xp;
        c.houseOf = balanceHouses(c.memberUids, ids, strength);
      }
      c.houses = houses;
    } else if (action === 'house-move') {
      const target = classId(body.studentUid), house = classId(body.houseId);
      if (!c.members[target] || !(c.houses || []).some((h) => h.id === house)) throw new ClassError('not_found');
      c.houseOf = { ...(c.houseOf || {}), [target]: house };
    } else if (action === 'houses-clear') {
      delete c.houses; delete c.houseOf;
    } else throw new ClassError('invalid_input');
    tx.set(ref, c);
    return { ok: true, joined };
  });
}

export { prepareClassXp } from './classXp';

/** Recompute objective practice marks with the existing grader; never accept a caller-supplied score. */
export async function completeAssignment(db: Firestore, uid: string, id: string, assignmentId: string, now: number) {
  const ref = db.doc(`classes/${classId(id)}`);
  const first = await ref.get();
  if (!first.exists) throw new ClassError('not_found');
  const initial = first.data() as ClassRecord;
  assertMember(initial, uid);
  const assignment = initial.assignments.find((a) => a.id === assignmentId);
  if (!assignment) throw new ClassError('not_found');
  const exam = await fetchExam(assignment.examId);
  if (!exam) throw new ClassError('not_found');
  return db.runTransaction(async (tx) => {
    const doneRef = ref.collection('state').doc('completions'), weekRef = ref.collection('weeks').doc(classWeek(now));
    const [current, done, result, attempt, weekSnap] = await Promise.all([
      tx.get(ref), tx.get(doneRef), tx.get(db.doc(`users/${uid}/examResults/${assignment.examId}`)),
      tx.get(db.doc(`users/${uid}/examAttempts/${assignment.examId}`)), tx.get(weekRef),
    ]);
    const c = current.data() as ClassRecord;
    if (!c) throw new ClassError('not_found');
    if (!c.members[uid]) throw new ClassError('forbidden');
    if (c.archived) throw new ClassError('archived');
    const byUid = done.data()?.byUid || {}, items = byUid[uid] || {};
    if (items[assignmentId]) return { ok: true, duplicate: true };
    // Firestore timestamps (not client *_ms values) establish that this was submitted after assignment publication.
    const submittedAt = attempt.data()?.submitted_at?.toMillis?.() || 0;
    if (attempt.data()?.status !== 'submitted' || !result.exists || submittedAt < assignment.createdAt) throw new ClassError('not_submitted');
    // The result doc is client-writable: its server-set updateTime must sit at the
    // submission (plus time for essay grading to land), so answers rewritten after
    // seeing the correction can't be counted for the class.
    const resultUpdatedAt = result.updateTime?.toMillis?.();
    if (resultUpdatedAt != null && resultUpdatedAt > submittedAt + RESULT_EDIT_GRACE_MS) throw new ClassError('not_submitted');
    const questions = flattenQuestions(exam);
    const answers = result.data()?.answers || {};
    const objective = questions.filter((q: any) => !isEssayType(q));
    // Keep flattened positions while omitting written items from the reported objective mark.
    const objectiveAnswers = Object.fromEntries(questions.flatMap((q: any, index: number) => isEssayType(q) ? [] : [[objective.indexOf(q), answers[index] ?? '']]));
    const graded = gradeExam(objective, objectiveAnswers);
    const marked = graded.results.filter((r: any) => r.status !== 'manual' && r.status !== 'ungraded');
    const possible = marked.reduce((sum: number, r: any) => sum + Number(r.result?.maxPoints || 0), 0);
    const earned = marked.reduce((sum: number, r: any) => sum + Number(r.result?.awarded || 0), 0);
    const score = possible > 0 ? Math.round(earned / possible * 100) : null;
    items[assignmentId] = { completedAt: submittedAt, late: submittedAt > assignment.dueAt, objectiveScore: score };
    const week = (weekSnap.data() as ClassWeek) || emptyWeek();
    week.completed[uid] = (week.completed[uid] || 0) + 1;
    byUid[uid] = items;
    tx.set(doneRef, { byUid }); tx.set(weekRef, week);
    return { ok: true };
  });
}

/** No personal classroom records survive account deletion. Teacher deletion removes their bounded pilot classes. */
export async function eraseClassAccount(db: Firestore, uid: string) {
  const owned = await db.collection('classes').where('teacherUid', '==', uid).get();
  for (const d of owned.docs) {
    const c = d.data() as ClassRecord;
    for (const member of [...c.memberUids, ...c.pendingUids]) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`classAccounts/${member}`), snap = await tx.get(ref);
        tx.set(ref, { ids: ((snap.data()?.ids || []) as string[]).filter((id) => id !== c.id) });
      });
    }
    await eraseTeacherFixtures(db, uid, c, Date.now());
    await db.doc(`classCodes/${c.code}`).delete(); await db.recursiveDelete(d.ref);
  }
  const account = await db.doc(`classAccounts/${uid}`).get();
  for (const id of (account.data()?.ids || []) as string[]) {
    const ref = db.doc(`classes/${classId(id)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const c = snap.data() as ClassRecord;
      delete c.members[uid]; delete c.pending[uid];
      if (c.houseOf) delete c.houseOf[uid];
      c.memberUids = c.memberUids.filter((v) => v !== uid); c.pendingUids = c.pendingUids.filter((v) => v !== uid);
      tx.set(ref, c);
    });
    await db.runTransaction(async (tx) => {
      const doneRef = ref.collection('state').doc('completions'), done = await tx.get(doneRef);
      const byUid = done.data()?.byUid || {}; delete byUid[uid]; tx.set(doneRef, { byUid });
    });
    await detachFromClassTournaments(db, uid, classId(id), Date.now());
    const weeks = await ref.collection('weeks').get();
    for (const w of weeks.docs) await db.runTransaction(async (tx) => {
      const snap = await tx.get(w.ref); const week = snap.data() as ClassWeek;
      delete week.xp[uid]; delete week.completed[uid]; tx.set(w.ref, week);
    });
  }
  await db.doc(`classAccounts/${uid}`).delete(); await db.doc(`classTeachers/${uid}`).delete();
}
