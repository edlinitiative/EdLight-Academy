import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdminUser, requireAuth } from './_lib/requireAuth';
import { getDb } from './_lib/firebaseAdmin';
import {
  castVote,
  EXPLANATION_STATUSES,
  isExplanationKey,
  listExplanations,
  reviewExplanation,
  type CacheDb,
  type ExplanationStatus,
} from './_lib/explanationCache';

/**
 * /api/explanations — reviewed "Explique-moi" explanations
 * (api/_lib/explanationCache.ts).
 *
 * Student (any signed-in user):
 *   POST { action: 'vote', id, helpful: boolean }
 *     → 200 { outcome: 'counted' | 'duplicate' }   one vote per explanation per day
 *     → 404 not_found / 409 not_approved
 *
 * Admin only (users/{uid}.role == 'admin'; 401 without a token, 403 otherwise):
 *   GET  ?status=pending|approved|rejected&lang=fr|ht&subject=…&limit=…
 *     → 200 { explanations: ExplanationDoc[] }       most used first
 *   POST { action: 'review', id, decision: 'approve' | 'reject', text? }
 *     → 200 { explanation }  `text` = edit-then-approve; audit fields
 *       reviewedBy / reviewedByName / reviewedAt / reviewHistory are set here.
 */

/** The dedupe hash secret. A fixed fallback still hides the uid; set it in Vercel to make it unguessable. */
function voteSecret(): string {
  return process.env.EXPLANATION_VOTE_SECRET || process.env.CRON_SECRET || 'edlight-explanation-votes-v1';
}

const db = () => getDb() as unknown as CacheDb;

async function handleVote(req: VercelRequest, res: VercelResponse): Promise<void> {
  const uid = await requireAuth(req, res);
  if (!uid) return;
  // No per-uid rate-limit bucket on purpose: _rateLimits docs are keyed by
  // uid and are not removed on account deletion. The daily dedupe already
  // bounds a voter to one vote per approved explanation per day.
  const body = req.body || {};
  if (!isExplanationKey(body.id) || typeof body.helpful !== 'boolean') {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  const outcome = await castVote(db(), { key: body.id, uid, helpful: body.helpful, secret: voteSecret() });
  if (outcome === 'not_found') res.status(404).json({ error: 'not_found' });
  else if (outcome === 'not_approved') res.status(409).json({ error: 'not_approved' });
  else res.status(200).json({ outcome });
}

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const q = req.query || {};
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const status = one(q.status);
  const lang = one(q.lang);
  const subject = one(q.subject);
  const limit = Number(one(q.limit));
  const explanations = await listExplanations(db(), {
    status: EXPLANATION_STATUSES.includes(status as ExplanationStatus) ? (status as ExplanationStatus) : undefined,
    lang: lang === 'fr' || lang === 'ht' ? lang : undefined,
    subject: typeof subject === 'string' && subject.trim() ? subject.slice(0, 80) : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  res.status(200).json({ explanations });
}

async function handleReview(req: VercelRequest, res: VercelResponse): Promise<void> {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const body = req.body || {};
  const decision = body.decision;
  if (!isExplanationKey(body.id) || (decision !== 'approve' && decision !== 'reject')) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  if (body.text != null && typeof body.text !== 'string') {
    res.status(400).json({ error: 'invalid_text' });
    return;
  }
  const out = await reviewExplanation(db(), {
    key: body.id,
    action: decision,
    text: decision === 'approve' && typeof body.text === 'string' ? body.text : undefined,
    reviewer: admin,
  });
  if (!out.ok) {
    res.status(out.error === 'not_found' ? 404 : 400).json({ error: out.error });
    return;
  }
  res.status(200).json({ explanation: out.doc });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'GET') return await handleList(req, res);
    if (req.method === 'POST') {
      const action = (req.body || {}).action;
      if (action === 'vote') return await handleVote(req, res);
      if (action === 'review') return await handleReview(req, res);
      res.status(400).json({ error: 'unknown_action' });
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error('explanations: failed:', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
}
