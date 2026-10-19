import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthAdmin, getDb } from './_lib/firebaseAdmin';
import { requireAuthDecoded } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { isAdminUid } from './arena/_shared';
import { ClassError, classId, classText } from '../shared/classes';
import { classHome, completeAssignment, createClass, joinClass, mutateClass, readClass, syncExamClasses } from './_lib/classSpaces';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const user = await requireAuthDecoded(req, res);
  if (!user) return;
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    const action = classText(body.action, 30), uid = user.uid, db = getDb(), now = Date.now();
    if (!(await checkRateLimit(uid, action === 'home' || action === 'read' ? 'classes-read' : 'classes-write')).allowed) {
      res.status(429).json({ error: 'rate_limit' }); return;
    }
    let out: unknown;
    if (action === 'home') out = await classHome(db, uid);
    else if (action === 'read') out = await readClass(db, uid, classId(body.id), now);
    else if (action === 'create') out = await createClass(db, uid, body, now);
    else if (action === 'join') {
      if (body.consent !== true) throw new ClassError('invalid_input');
      out = await joinClass(db, uid, user.name || classText(body.name, 80), classText(body.code, 6).toUpperCase(), now);
    } else if (action === 'complete') out = await completeAssignment(db, uid, classId(body.id), classId(body.assignmentId), now);
    else if (action === 'sync-exam') out = await syncExamClasses(db, uid, classId(body.examId), now);
    else if (action === 'grant-teacher' || action === 'revoke-teacher') {
      if (!(await isAdminUid(db, uid))) throw new ClassError('forbidden');
      const application = await db.doc(`instructorApplications/${classId(body.applicationId)}`).get();
      if (!application.exists || (action === 'grant-teacher' && application.data()?.status !== 'approved')) throw new ClassError('teacher_required');
      const teacher = await getAuthAdmin().getUserByEmail(classText(application.data()?.email, 200));
      if (!teacher.emailVerified) throw new ClassError('teacher_required');
      await db.doc(`classTeachers/${teacher.uid}`).set({ active: action === 'grant-teacher', applicationId: application.id, grantedBy: uid, updatedAt: now });
      out = { ok: true };
    } else out = await mutateClass(db, uid, action, body, now);
    res.status(200).json(out);
  } catch (err) {
    if (err instanceof ClassError) res.status(err.code === 'forbidden' || err.code === 'teacher_required' ? 403 : 400).json({ error: err.code });
    else if (err instanceof SyntaxError) res.status(400).json({ error: 'invalid_input' });
    else { console.error('[classes] request failed'); res.status(503).json({ error: 'unavailable' }); }
  }
}
