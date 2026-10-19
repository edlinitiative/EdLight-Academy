import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdminUser } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { getDb } from './_lib/firebaseAdmin';
import { examFetcher } from './_lib/explainGate';
import { resolveOrigin } from './_lib/sandraProbes';
import { gradeEssay } from './_lib/essayGrader';
import {
  createRun,
  getRun,
  gradeCalibrationInput,
  listRuns,
  RUNS,
  stepRun,
  type RunsDb,
} from './_lib/essayCalibrationRuns';
import { CALIBRATION_MAX_ROWS, validateRow, type CalibrationInput } from '../shared/essayCalibration';

/**
 * /api/essay-calibration — admin-only essay-grader calibration harness
 * (Admin → Contenu → « Calibration des dissertations »). Every action needs a
 * signed-in user whose users/{uid}.role is 'admin' (401 / 403 otherwise).
 *
 *   GET                         → { runs }                      latest 50
 *   GET  ?runId=…               → { run, items }                items in upload order
 *   POST { action: 'create', name?, rows }  → { runId, existing }
 *        rows are re-validated here (shared/essayCalibration validateRow);
 *        the same rows always map to the same run (idempotent upload).
 *   POST { action: 'step', runId }          → { processed, graded, failed, total, complete }
 *        grades up to 4 pending items with the production grader
 *        (api/_lib/essayGrader.ts). Rate-limited per admin; 409 while another
 *        tab holds the run's lease. The page calls it until `complete`.
 *   POST { action: 'delete', runId }        → { deleted: true }
 */
export const maxDuration = 60;

const db = () => getDb() as unknown as RunsDb;
const RUN_ID = /^cal_[a-f0-9]{20}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const admin = await requireAdminUser(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const runId = Array.isArray(req.query?.runId) ? req.query.runId[0] : req.query?.runId;
      if (runId == null) {
        res.status(200).json({ runs: await listRuns(db()) });
        return;
      }
      if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
        res.status(400).json({ error: 'invalid_run' });
        return;
      }
      const out = await getRun(db(), runId);
      if (!out) res.status(404).json({ error: 'not_found' });
      else res.status(200).json(out);
      return;
    }

    const body = req.body || {};
    if (body.action === 'create') {
      if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > CALIBRATION_MAX_ROWS) {
        res.status(400).json({ error: 'invalid_rows', message: `1 à ${CALIBRATION_MAX_ROWS} lignes.` });
        return;
      }
      const rows: CalibrationInput[] = [];
      for (let i = 0; i < body.rows.length; i += 1) {
        const v = body.rows[i] && typeof body.rows[i] === 'object' ? validateRow(body.rows[i]) : 'ligne invalide';
        if (typeof v === 'string') {
          res.status(400).json({ error: 'invalid_row', row: i + 1, message: v });
          return;
        }
        rows.push(v);
      }
      const out = await createRun(db(), { rows, name: typeof body.name === 'string' ? body.name : undefined, admin });
      res.status(200).json(out);
      return;
    }

    if (body.action === 'step' || body.action === 'delete') {
      if (typeof body.runId !== 'string' || !RUN_ID.test(body.runId)) {
        res.status(400).json({ error: 'invalid_run' });
        return;
      }
      if (body.action === 'delete') {
        const ref = getDb().doc(`${RUNS}/${body.runId}`);
        await getDb().recursiveDelete(ref);
        res.status(200).json({ deleted: true });
        return;
      }
      const { allowed, resetAt } = await checkRateLimit(admin.uid, 'essay-calibration');
      if (!allowed) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
        res.status(429).json({ error: 'rate_limit_exceeded', resetAt });
        return;
      }
      const fetchExam = examFetcher(resolveOrigin());
      const out = await stepRun(db(), {
        runId: body.runId,
        grade: (input) => gradeCalibrationInput(input, { fetchExam, grade: (b) => gradeEssay(b) }),
      });
      if (out.kind === 'not_found') res.status(404).json({ error: 'not_found' });
      else if (out.kind === 'busy') res.status(409).json({ error: 'busy', leaseUntil: out.leaseUntil });
      else {
        const { kind: _kind, ...rest } = out;
        res.status(200).json(rest);
      }
      return;
    }

    res.status(400).json({ error: 'unknown_action' });
  } catch (error) {
    console.error('essay-calibration: failed:', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
}
