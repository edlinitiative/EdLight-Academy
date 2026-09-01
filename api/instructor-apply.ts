/**
 * Vercel serverless function: POST /api/instructor-apply
 * ────────────────────────────────────────────────────────
 * Public (unauthenticated) intake for volunteer-instructor applications from
 * the web page /enseigner and the mobile app. Writes to the
 * `instructorApplications` collection through the Admin SDK — Firestore rules
 * keep the collection closed to all client writes, so this endpoint is the
 * only door in. Admins review applications at /admin/users/instructors.
 *
 * Anti-abuse (no auth wall — applicants are teachers, usually without an
 * account): IP-keyed sliding-window rate limit + a honeypot field that bots
 * fill in and humans never see (honeypot hits return 200 but write nothing).
 *
 * Request body:
 *   { name, email, whatsapp, subjects[], levels[], experience, school,
 *     department?, motivation?, lang?, source?, website? (honeypot) }
 *
 * Response: { ok: true } | { error }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, isAdminConfigured } from './_lib/firebaseAdmin';
import { checkRateLimit } from './_lib/rateLimit';
import { FieldValue } from 'firebase-admin/firestore';

const SUBJECTS = new Set(['math', 'physics', 'chemistry', 'economics', 'other']);
const LEVELS = new Set(['9af', 'ns1', 'ns2', 'ns3', 'ns4']);
const EXPERIENCE = new Set(['0-2', '3-5', '6-10', '10+']);

const clip = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const pickList = (v: unknown, allowed: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.has(x)))] : [];

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Honeypot: bots fill every field. Pretend success, store nothing.
  if (clip(body.website, 10)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = clip(body.name, 120);
  const email = clip(body.email, 200);
  const whatsapp = clip(body.whatsapp, 40);
  const school = clip(body.school, 200);
  const department = clip(body.department, 60);
  const motivation = clip(body.motivation, 2000);
  const experience = clip(body.experience, 8);
  const subjects = pickList(body.subjects, SUBJECTS);
  const levels = pickList(body.levels, LEVELS);
  const lang = clip(body.lang, 2) === 'ht' ? 'ht' : 'fr';
  const source = clip(body.source, 10) === 'mobile' ? 'mobile' : 'web';

  if (!name || !email || !whatsapp || !school || subjects.length === 0 || levels.length === 0) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }
  if (!EXPERIENCE.has(experience)) {
    res.status(400).json({ error: 'Invalid experience' });
    return;
  }

  const rate = await checkRateLimit(`ip_${clientIp(req)}`, 'instructor-apply');
  if (!rate.allowed) {
    res.status(429).json({ error: 'Too many applications from this connection. Try again later.' });
    return;
  }

  try {
    await getDb().collection('instructorApplications').add({
      name,
      email,
      whatsapp,
      subjects,
      levels,
      experience,
      school,
      department,
      motivation,
      lang,
      source,
      status: 'pending', // pending -> contacted -> approved | declined
      notes: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[instructor-apply] write failed', err);
    res.status(500).json({ error: 'Could not save application' });
  }
}
