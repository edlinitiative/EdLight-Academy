/**
 * Vercel serverless function: POST /api/tournois/create
 * ────────────────────────────────────────────────────────────────────────────
 * A student (or a teacher) creates a tournament; the server does the rest.
 *
 *   { action?: 'create', title, description?, format, teamRule, teamSize?,
 *     visibility, categories[], questionCount, secondsPerQuestion, startsAt,
 *     windowHours?, roundHours?, roundCount?, maxPlayers?, creatorPlays?,
 *     displayName?, school?, grade? }
 *     → 200 { ok, tid, pin }   · 400 { error: 'invalid', fields[] } | 'not_enough_questions'
 *
 *   { action: 'cancel', tid } → 200 { ok }  (creator only, before it starts)
 *
 * The creator picks CATEGORIES, never questions: the draw runs here, from the
 * shipped trivia banks (src/data/triviaData.ts — the same source the daily
 * trivia cron reads), and the drawn questions are written to a subcollection
 * no client can read. The creator never sees a key; that is what lets them
 * play their own tournament on an equal footing.
 *
 * The schedule is built here too (shared/tournois/schedule.buildSchedule):
 * the creator chooses a start and a shape, the server lays out every window.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../src/data/triviaData';
import { isValidTid, makePin, validateTournamentInput, type TournamentConfig } from '../../shared/tournois/config';
import { bracketRoundCount, buildSchedule } from '../../shared/tournois/schedule';
import { drawQuestions, POOL_FACTOR, type BankQuestion, type StoredQuestion } from '../../shared/tournois/questions';
import {
  COLLECTION,
  PINS,
  enforceRateLimit,
  joinTournament,
  parseBody,
  resolveIdentity,
  sub,
  tRef,
  type TournamentDoc,
} from './_shared';

const ALLOWED = TRIVIA_CATEGORIES.map((c) => c.id);
const BANK = TRIVIA_QUESTIONS as unknown as Record<string, BankQuestion[]>;

/** How many separate question pools a tournament needs, and how big each must be. */
export function poolPlan(cfg: TournamentConfig): { pools: number; perPool: number; min: number } {
  if (cfg.format === 'live') return { pools: 1, perPool: cfg.questionCount, min: cfg.questionCount };
  const pools = cfg.format === 'rounds' ? cfg.roundCount
    : cfg.format === 'bracket' ? Math.max(1, bracketRoundCount(cfg.maxPlayers)) : 1;
  return { pools, perPool: cfg.questionCount * POOL_FACTOR, min: cfg.questionCount };
}

/** Split one draw into `pools` equal pools; null when any pool would be short. */
export function splitPools(drawn: StoredQuestion[], pools: number, min: number): StoredQuestion[][] | null {
  const size = Math.floor(drawn.length / pools);
  if (size < min) return null;
  return Array.from({ length: pools }, (_, i) => drawn.slice(i * size, (i + 1) * size));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid } = decoded;
  const body = parseBody(req);
  const db = getDb();
  const now = Date.now();

  if (body.action === 'cancel') {
    if (!isValidTid(body.tid)) {
      res.status(400).json({ error: 'invalid_tid' });
      return;
    }
    const tid = body.tid;
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(tRef(db, tid));
      if (!snap.exists) return 'not_found';
      const t = snap.data() as TournamentDoc;
      if (t.creatorUid !== uid) return 'forbidden';
      if (t.state !== 'scheduled' || now >= t.startsAt) return 'already_started';
      tx.update(tRef(db, tid), { state: 'cancelled', nextDeadlineAt: null, updatedAt: now });
      tx.delete(db.doc(`${PINS}/${t.pin}`));
      return 'ok';
    });
    if (out === 'ok') res.status(200).json({ ok: true });
    else res.status(out === 'not_found' ? 404 : out === 'forbidden' ? 403 : 409).json({ error: out });
    return;
  }

  if (!(await enforceRateLimit(res, uid, 'tournois-create'))) return;

  const v = validateTournamentInput(body, now, ALLOWED);
  if (!v.ok) {
    res.status(400).json({ error: 'invalid', fields: v.errors });
    return;
  }
  const cfg = v.config;

  const identity = await resolveIdentity(db, uid, decoded.name, body);
  if (!identity) {
    res.status(400).json({ error: 'name_required' });
    return;
  }

  const plan = poolPlan(cfg);
  const drawn = drawQuestions(BANK, cfg.categories, plan.pools * plan.perPool, Math.random);
  const pools = splitPools(drawn, plan.pools, plan.min);
  if (!pools) {
    res.status(400).json({ error: 'not_enough_questions' });
    return;
  }

  const ref = db.collection(COLLECTION).doc();
  const tid = ref.id;
  const schedule = buildSchedule(cfg);

  // A PIN that is not in use. Six digits, so a collision is rare, and the
  // create() in the transaction makes the rare case a retry, not a clash.
  let pin = '';
  for (let attempt = 0; attempt < 8 && !pin; attempt += 1) {
    const candidate = makePin(Math.random);
    try {
      await db.doc(`${PINS}/${candidate}`).create({ tid, createdAt: now });
      pin = candidate;
    } catch {
      /* taken — draw another */
    }
  }
  if (!pin) {
    res.status(503).json({ error: 'pin_unavailable' });
    return;
  }

  const doc: TournamentDoc = {
    ...cfg,
    id: tid,
    creatorUid: uid,
    creatorName: identity.displayName,
    pin,
    state: 'scheduled',
    schedule,
    nextDeadlineAt: schedule.startsAt,
    playerCount: 0,
    currentRound: -1,
    closedThrough: -1,
    bracketRounds: 0,
    winner: null,
    standingsDirty: false,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(ref, doc);
  if (cfg.format === 'live') {
    batch.set(sub(db, tid, 'questions/live'), { items: pools[0] });
    batch.set(sub(db, tid, 'live/state'), {
      phase: 'lobby',
      index: -1,
      opensAt: schedule.startsAt,
      closesAt: schedule.startsAt + schedule.questionMs,
      revealUntil: schedule.startsAt + schedule.questionMs + schedule.revealMs,
      questionCount: cfg.questionCount,
      questionMs: schedule.questionMs,
      question: null,
      reveal: null,
      updatedAt: now,
    });
  } else {
    pools.forEach((items, r) => batch.set(sub(db, tid, `questions/r${r}`), { items }));
  }
  batch.set(sub(db, tid, 'standings/current'), { rows: [], teams: [], total: 0, final: false, updatedAt: now });
  batch.set(db.doc(`users/${uid}/myTournaments/${tid}`), {
    tid,
    title: cfg.title,
    format: cfg.format,
    startsAt: cfg.startsAt,
    role: 'creator',
    joinedAt: now,
  });
  await batch.commit();

  if (cfg.creatorPlays) {
    const joined = await joinTournament(db, tid, identity, now);
    if (!joined.ok) {
      // School vs school with no school on the creator's profile: the
      // tournament still exists, the creator just hosts until they join.
      res.status(200).json({ ok: true, tid, pin, creatorJoined: false, joinError: joined.error });
      return;
    }
  }
  res.status(200).json({ ok: true, tid, pin, creatorJoined: cfg.creatorPlays });
}
