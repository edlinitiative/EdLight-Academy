/**
 * api/tournois/_team — shared-answer (J12) and relay (J13) team play.
 * ───────────────────────────────────────────────────────────────────────────
 * Reached only through POST /api/tournois/play with a `team-*` action, and
 * only for an engine doc whose `gameMode` is 'shared' or 'relay'. The legacy
 * `live-answer` / `start` / `answer` actions refuse those tournaments
 * (`team_client_required`), so an old client can watch but never submit a
 * team answer through an individual handler.
 *
 * SERVER-ONLY RECORDS (firestore.rules: userTournaments/{tid}/{server=**})
 *   teamControl/{entryId}         frozen roles: submitter authority + version, relay slots, presence
 *   teamAnswers/{index}_{entryId} live: the ONE answer of a team to question `index` (create-only)
 *   teamAttempts/{round}_{entryId} window: the team's timed attempt (relay: with legs)
 *
 * Every decision runs inside one Firestore transaction that reads the control
 * record, so an old holder and a new holder racing cannot both be accepted:
 * the version check and the create-only answer record serialize them.
 *
 * Responses never carry correctness, points or a key (integrity rule 2).
 */
import type { VercelResponse } from '@vercel/node';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import type { EventEntry } from '../../shared/competition/platform';
import {
  claimAuthority,
  claimableAt,
  initialControl,
  isTeamGameMode,
  legIndexAt,
  newTeamAttempt,
  newlyOpenedLegs,
  plannedRoles,
  relayCatchUp,
  relayLiveOwner,
  relayStartLeg,
  relayTurnMs,
  sharedCatchUp,
  teamAnswer,
  touch,
  transferAuthority,
  type AuthorityOutcome,
  type RelayLeg,
  type TeamAttempt,
  type TeamControl,
  type TeamGameMode,
} from '../../shared/teams/modes';
import { ANSWER_GRACE_MS, livePositionAt, roundAt } from '../../shared/tournois/schedule';
import { clampLiveStart, scoreAnswer } from '../../shared/tournois/scoring';
import { attemptOrder, toPublicQuestion, type StoredQuestion } from '../../shared/tournois/questions';
import { PENDING } from '../../shared/tournois/attempt';
import { deliverCompetitionNotices, type CompetitionNotice } from '../_lib/competitionNotify';
import { boundedInt, recomputeStandings, sub, subCol, tRef, type TournamentDoc } from './_shared';

export const TEAM_ACTIONS = [
  'team-state',
  'team-live-answer',
  'team-start',
  'team-answer',
  'team-transfer',
  'team-claim',
] as const;

export const isTeamAction = (action: unknown): boolean =>
  typeof action === 'string' && (TEAM_ACTIONS as readonly string[]).includes(action);

const STANDINGS_THROTTLE_MS = 15_000;
const PROGRESS_THROTTLE_MS = 1_000;

class TeamError extends Error {
  constructor(public code: string, public status = 409) {
    super(code);
  }
}
function ensure(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new TeamError(code, status);
}

/** Map a pure authority refusal to its literal API code. */
function ensureAuthority(out: AuthorityOutcome): asserts out is Extract<AuthorityOutcome, { ok: true }> {
  if (out.ok) return;
  ensure(out.error !== 'not_a_starter', 'not_a_starter', 403);
  ensure(out.error !== 'authority_stale', 'authority_stale');
  ensure(out.error !== 'not_authority_holder', 'not_authority_holder', 403);
  ensure(out.error !== 'holder_present', 'holder_present');
  ensure(out.error !== 'invalid_recipient', 'invalid_recipient', 400);
  ensure(false, 'unsupported_mode', 400);
}

interface TeamContext {
  entryId: string;
  entry: EventEntry;
  controlRef: DocumentReference;
  /** Null before the start: roles are still the entry's planned ones. */
  control: TeamControl | null;
  /** Created by this request (the freeze); must be written. */
  created: boolean;
}

/** Reads only — callers do every read before their first write. */
async function loadTeam(tx: Transaction, db: Firestore, t: TournamentDoc, uid: string, now: number): Promise<TeamContext> {
  const eventId = t.competitionEventId as string;
  const claim = await tx.get(db.doc(`entryClaims/${eventId}_${uid}`));
  ensure(claim.exists, 'not_a_starter', 403);
  const entryId = String(claim.data()?.entryId || '');
  const entrySnap = await tx.get(db.doc(`competitionEvents/${eventId}/entries/${entryId}`));
  const entry = entrySnap.data() as EventEntry | undefined;
  ensure(entry && entry.state === 'registered' && entry.starters.includes(uid), 'not_a_starter', 403);
  const controlRef = sub(db, t.id, `teamControl/${entryId}`);
  const snap = await tx.get(controlRef);
  let control = snap.exists ? (snap.data() as TeamControl) : null;
  let created = false;
  // The roles and slot order freeze at the first request after the start.
  if (!control && now >= t.schedule.startsAt) {
    control = initialControl(entry, t.gameMode as TeamGameMode, now);
    created = true;
  }
  return { entryId, entry, controlRef, control, created };
}

/** Presence + freeze: the control record to write, or null. */
function controlWrite(ctx: TeamContext, uid: string, now: number, next?: TeamControl): TeamControl | null {
  const base = next ?? ctx.control;
  if (!base) return null;
  const touched = touch(base, uid, now);
  if (touched) return touched;
  return ctx.created || next ? base : null;
}

const turnMsOf = (t: TournamentDoc) => {
  const w = t.schedule.rounds[0];
  return relayTurnMs(w ? w.closesAt - w.opensAt : 0);
};

function inboxNotice(
  tx: Transaction, db: Firestore, t: TournamentDoc, to: string, action: 'relay_turn' | 'authority_received', now: number,
): CompetitionNotice {
  const eventId = t.competitionEventId as string;
  tx.set(db.doc(`users/${to}/competitionInbox/team_${eventId}`), {
    id: `team_${eventId}`,
    kind: 'event',
    targetKind: 'event',
    targetId: eventId,
    action,
    title: t.title,
    read: false,
    updatedAt: now,
  });
  return { uid: to, action, targetKind: 'event', targetId: eventId, title: t.title };
}

function legView(legs: RelayLeg[] | undefined, turnMs: number, closesAt: number) {
  return (legs || []).map((leg) => ({
    ...leg,
    startBy: leg.openedAt && !leg.startedAt && !leg.forfeited ? Math.min(leg.openedAt + turnMs, closesAt) : null,
  }));
}

/** What a starter sees: roles, whose turn it is, and — only when allowed — the open question. */
function view(
  t: TournamentDoc,
  ctx: TeamContext,
  control: TeamControl | null,
  uid: string,
  now: number,
  extra: { live?: unknown; window?: unknown } = {},
) {
  const planned = plannedRoles(ctx.entry);
  return {
    ok: true,
    mode: t.gameMode,
    policy: t.teamPolicy ?? null,
    entryId: ctx.entryId,
    label: ctx.entry.label,
    starters: ctx.entry.starters,
    captainUid: ctx.entry.captainUid,
    started: !!control,
    holderUid: control ? control.holderUid : planned.holderUid,
    deputyUid: control ? control.deputyUid : planned.deputyUid,
    authorityVersion: control ? control.authorityVersion : 0,
    claimableAt: control ? claimableAt(control, uid) : null,
    slots: control ? control.slots : planned.slots,
    dutiesConfirmed: ctx.entry.dutiesConfirmed ?? [],
    rolesVersion: ctx.entry.rolesVersion ?? 0,
    ...extra,
    serverNow: now,
  };
}

function windowView(t: TournamentDoc, a: TeamAttempt | null, pool: StoredQuestion[], uid: string, now: number) {
  const win = t.schedule.rounds[0];
  const questionMs = t.schedule.questionMs;
  const turnMs = turnMsOf(t);
  if (!a)
    return {
      round: 0,
      pos: 0,
      count: t.questionCount,
      question: null,
      servedAt: null,
      deadline: null,
      done: !!win && now >= win.closesAt,
      begun: false,
      legs: [],
      turnMs,
      opensAt: win?.opensAt ?? null,
      closesAt: win?.closesAt ?? null,
    };
  const serving = !a.done && a.pos < a.order.length && a.servedAt[a.pos] > 0;
  const leg = a.legs ? a.legs[legIndexAt(a, a.pos)] : null;
  // Relay: the question is shown only to the slot owner; teammates follow progress.
  const visible = serving && (!leg || leg.owner === uid);
  return {
    round: a.round,
    pos: a.pos,
    count: a.order.length,
    question: visible ? toPublicQuestion(pool[a.order[a.pos]]) : null,
    servedAt: serving ? a.servedAt[a.pos] : null,
    deadline: serving ? a.servedAt[a.pos] + questionMs : null,
    done: a.done,
    begun: true,
    answered: a.choices.filter((c) => c >= 0).length,
    lastChoice: a.pos > 0 && a.choices[a.pos - 1] >= 0 ? { pos: a.pos - 1, choice: a.choices[a.pos - 1], uid: a.answeredBy?.[a.pos - 1] ?? null } : null,
    legs: legView(a.legs, turnMs, win.closesAt),
    turnMs,
    opensAt: win.opensAt,
    closesAt: win.closesAt,
  };
}

function relayNotices(tx: Transaction, db: Firestore, t: TournamentDoc, before: TeamAttempt | null, after: TeamAttempt, now: number) {
  return newlyOpenedLegs(before, after).map((leg) => inboxNotice(tx, db, t, leg.owner, 'relay_turn', now));
}

export async function teamPlay(
  db: Firestore, res: VercelResponse, t: TournamentDoc, uid: string, body: Record<string, unknown>, now: number,
): Promise<void> {
  try {
    ensure(isTeamGameMode(t.gameMode) && t.competitionEventId, 'not_team_mode', 400);
    ensure(t.format === 'live' || t.format === 'window', 'unsupported_mode', 400);
    ensure(t.state !== 'cancelled', 'cancelled');
    switch (body.action) {
      case 'team-state':
        return await teamState(db, res, t, uid, now);
      case 'team-live-answer':
        return await liveTeamAnswer(db, res, t, uid, body, now);
      case 'team-start':
        return await windowStep(db, res, t, uid, body, now, true);
      case 'team-answer':
        return await windowStep(db, res, t, uid, body, now, false);
      case 'team-transfer':
      case 'team-claim':
        return await authority(db, res, t, uid, body, now);
      default:
        ensure(false, 'invalid_action', 400);
    }
  } catch (err) {
    if (err instanceof TeamError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    throw err;
  }
}

// ── State (poll + presence + recovery) ─────────────────────────────────────

async function teamState(db: Firestore, res: VercelResponse, t: TournamentDoc, uid: string, now: number): Promise<void> {
  let notices: CompetitionNotice[] = [];
  let finishedNow = false;
  const out = await db.runTransaction(async (tx) => {
    notices = [];
    finishedNow = false;
    const ctx = await loadTeam(tx, db, t, uid, now);
    if (t.format === 'live') {
      const pos = livePositionAt(t.schedule, now);
      const index = pos.phase === 'question' || pos.phase === 'reveal' ? pos.index : -1;
      const answer = index >= 0 ? await tx.get(sub(db, t.id, `teamAnswers/${index}_${ctx.entryId}`)) : null;
      const write = controlWrite(ctx, uid, now);
      if (write) tx.set(ctx.controlRef, write);
      const control = write ?? ctx.control;
      const a = answer?.exists ? answer.data()! : null;
      return view(t, ctx, control, uid, now, {
        live: {
          index,
          phase: pos.phase,
          closesAt: pos.closesAt,
          owner: control && index >= 0 && control.mode === 'relay' ? relayLiveOwner(control.slots, index) : null,
          // The team's own submitted option (never its correctness) for the shared reveal.
          answer: a ? { uid: a.uid, choice: a.choice } : null,
        },
      });
    }
    const attemptRef = sub(db, t.id, `teamAttempts/0_${ctx.entryId}`);
    const [aSnap, poolSnap] = await Promise.all([tx.get(attemptRef), tx.get(sub(db, t.id, 'questions/r0'))]);
    const pool = (poolSnap.data()?.items || []) as StoredQuestion[];
    const win = t.schedule.rounds[0];
    const stored = aSnap.exists ? (aSnap.data() as TeamAttempt) : null;
    let a = stored;
    if (ctx.control && win && pool.length) {
      if (a)
        a = a.mode === 'relay'
          ? relayCatchUp(a, now, t.schedule.questionMs, win.closesAt, turnMsOf(t))
          : sharedCatchUp(a, now, t.schedule.questionMs, win.closesAt);
      else if (ctx.control.mode === 'relay' && now >= win.opensAt)
        // Relay legs are timed from the window's opening whoever looks first.
        a = relayCatchUp(
          newTeamAttempt(ctx.entryId, 'relay', 0, attemptOrder(pool.length, t.questionCount, Math.random), ctx.control.slots, now, win.opensAt),
          now, t.schedule.questionMs, win.closesAt, turnMsOf(t),
        );
    }
    const write = controlWrite(ctx, uid, now);
    if (write) tx.set(ctx.controlRef, write);
    if (a && JSON.stringify(a) !== JSON.stringify(stored)) {
      tx.set(attemptRef, a);
      if (a.mode === 'relay') notices = relayNotices(tx, db, t, stored, a, now);
      if (a.done && !stored?.done) {
        finishedNow = true;
        tx.update(tRef(db, t.id), { standingsDirty: true, updatedAt: now });
      }
    }
    return view(t, ctx, write ?? ctx.control, uid, now, { window: windowView(t, a, pool, uid, now) });
  });
  await after(db, t, uid, now, notices, finishedNow);
  res.status(200).json(out);
}

async function after(db: Firestore, t: TournamentDoc, uid: string, now: number, notices: CompetitionNotice[], finishedNow: boolean) {
  if (notices.length) await deliverCompetitionNotices(db, notices, uid).catch(() => undefined);
  if (!finishedNow) return;
  try {
    const st = (await sub(db, t.id, 'standings/current').get()).data();
    if (!st || now - (st.updatedAt || 0) >= STANDINGS_THROTTLE_MS) await recomputeStandings(db, t.id, now);
  } catch (err) {
    console.warn('[tournois/team] standings refresh failed:', err);
  }
}

// ── Live: one answer per team per question ─────────────────────────────────

async function liveTeamAnswer(
  db: Firestore, res: VercelResponse, t: TournamentDoc, uid: string, body: Record<string, unknown>, receivedAt: number,
): Promise<void> {
  ensure(t.format === 'live', 'not_live', 400);
  const index = boundedInt(body.index, 0, 99);
  const choice = boundedInt(body.choice, 0, 11);
  ensure(index !== null && choice !== null, 'invalid_input', 400);
  const pos = livePositionAt(t.schedule, receivedAt);
  const inQuestion = pos.index === index && pos.phase === 'question';
  const inGrace = pos.index === index && pos.phase === 'reveal' && receivedAt <= pos.closesAt + ANSWER_GRACE_MS;
  ensure(inQuestion || inGrace, 'answers_closed');
  const late = !inQuestion;
  const out = await db.runTransaction(async (tx) => {
    const ctx = await loadTeam(tx, db, t, uid, receivedAt);
    ensure(ctx.control, 'team_not_started');
    const control = ctx.control;
    const ref = sub(db, t.id, `teamAnswers/${index}_${ctx.entryId}`);
    const [aSnap, qSnap] = await Promise.all([tx.get(ref), tx.get(sub(db, t.id, 'questions/live'))]);
    const existing = aSnap.exists ? aSnap.data()! : null;
    // A retry of the answer this device already landed: idempotent, even if authority moved since.
    if (existing && existing.uid === uid && existing.choice === choice) return { duplicate: true, version: control.authorityVersion };
    if (control.mode === 'shared') {
      ensure(body.version === control.authorityVersion, 'authority_stale');
      ensure(uid === control.holderUid, 'not_authority_holder', 403);
    } else ensure(relayLiveOwner(control.slots, index) === uid, 'not_your_turn', 403);
    // Never overwritten: the first accepted team answer stands.
    ensure(!existing, 'team_answer_exists');
    const q = ((qSnap.data()?.items || []) as StoredQuestion[])[index];
    ensure(q, 'question_not_found', 404);
    const correct = choice === q.answer;
    const scored = scoreAnswer({
      correct,
      startedAt: clampLiveStart(pos.opensAt, body.clientShownAt),
      receivedAt,
      questionMs: t.schedule.questionMs,
      late,
    });
    tx.create(ref, {
      entryId: ctx.entryId,
      index,
      uid,
      choice,
      correct: correct && !late,
      late,
      points: scored.points,
      tier: scored.tier,
      elapsedMs: Math.min(scored.elapsedMs, t.schedule.questionMs),
      receivedAt,
      mode: control.mode,
      authorityVersion: control.authorityVersion,
    });
    const write = controlWrite(ctx, uid, receivedAt);
    if (write) tx.set(ctx.controlRef, write);
    return { duplicate: false, version: control.authorityVersion };
  });
  if (!out.duplicate) {
    try {
      const progRef = sub(db, t.id, 'live/progress');
      const prog = (await progRef.get()).data();
      if (!prog || prog.index !== index || receivedAt - (prog.updatedAt || 0) >= PROGRESS_THROTTLE_MS) {
        const agg = await subCol(db, t.id, 'teamAnswers').where('index', '==', index).count().get();
        await progRef.set({ index, answered: agg.data().count, updatedAt: Date.now() });
      }
    } catch (err) {
      console.warn('[tournois/team] progress update failed:', err);
    }
  }
  res.status(200).json({ ok: true, recorded: true, duplicate: out.duplicate, authorityVersion: out.version });
}

// ── Window: the team's attempt ─────────────────────────────────────────────

async function windowStep(
  db: Firestore, res: VercelResponse, t: TournamentDoc, uid: string, body: Record<string, unknown>, now: number, start: boolean,
): Promise<void> {
  ensure(t.format === 'window', 'live_format', 400);
  const win = t.schedule.rounds[0];
  ensure(win, 'invalid_round', 400);
  if (start) ensure(roundAt(t.schedule.rounds, now), 'no_open_round');
  const pos = start ? null : boundedInt(body.pos, 0, 99);
  const choice = start ? null : boundedInt(body.choice, -1, 11);
  if (!start) {
    ensure(boundedInt(body.round, 0, 0) === 0, 'invalid_round', 400);
    ensure(pos !== null && choice !== null, 'invalid_input', 400);
  }
  const questionMs = t.schedule.questionMs;
  const turnMs = turnMsOf(t);
  let notices: CompetitionNotice[] = [];
  let finishedNow = false;
  const out = await db.runTransaction(async (tx) => {
    notices = [];
    finishedNow = false;
    const ctx = await loadTeam(tx, db, t, uid, now);
    const attemptRef = sub(db, t.id, `teamAttempts/0_${ctx.entryId}`);
    const [aSnap, poolSnap] = await Promise.all([tx.get(attemptRef), tx.get(sub(db, t.id, 'questions/r0'))]);
    ensure(ctx.control, 'team_not_started');
    const control = ctx.control;
    const pool = (poolSnap.data()?.items || []) as StoredQuestion[];
    ensure(pool.length, 'question_not_found', 404);
    const stored = aSnap.exists ? (aSnap.data() as TeamAttempt) : null;
    let a: TeamAttempt;
    let recorded = false;
    let duplicate = false;
    if (start) {
      const fresh = () => newTeamAttempt(ctx.entryId, control.mode, 0, attemptOrder(pool.length, t.questionCount, Math.random), control.slots, now, win.opensAt);
      if (control.mode === 'shared') {
        ensure(body.version === control.authorityVersion, 'authority_stale');
        ensure(uid === control.holderUid, 'not_authority_holder', 403);
        a = sharedCatchUp(stored ?? fresh(), now, questionMs, win.closesAt);
      } else {
        const r = relayStartLeg(stored ?? fresh(), uid, now, questionMs, win.closesAt, turnMs);
        ensure(r.refused !== 'not_your_turn', 'not_your_turn', 403);
        ensure(r.refused !== 'turn_not_open', 'turn_not_open');
        a = r.attempt;
      }
    } else {
      ensure(stored, 'not_started');
      const p = pos as number;
      const c = choice as number;
      const retry = p < stored.pos && stored.answeredBy?.[p] === uid && stored.choices[p] === (c >= 0 ? c : -1);
      if (control.mode === 'shared' && !retry) {
        ensure(body.version === control.authorityVersion, 'authority_stale');
        ensure(uid === control.holderUid, 'not_authority_holder', 403);
      }
      const q = pool[stored.order[p]];
      const r = teamAnswer(stored, uid, p, c, q ? q.answer : -99, now, questionMs, win.closesAt, turnMs);
      ensure(r.refused !== 'not_your_turn', 'not_your_turn', 403);
      if (r.refused) {
        // The device's view is stale (a timeout or a teammate moved it on): hand back where it really is.
        a = stored.mode === 'relay'
          ? relayCatchUp(stored, now, questionMs, win.closesAt, turnMs)
          : sharedCatchUp(stored, now, questionMs, win.closesAt);
      } else {
        a = r.attempt;
        duplicate = r.duplicate;
        recorded = !r.duplicate;
      }
    }
    const write = controlWrite(ctx, uid, now);
    if (write) tx.set(ctx.controlRef, write);
    if (JSON.stringify(a) !== JSON.stringify(stored)) {
      tx.set(attemptRef, a);
      if (a.mode === 'relay') notices = relayNotices(tx, db, t, stored, a, now);
      if (a.done && !stored?.done) {
        finishedNow = true;
        tx.update(tRef(db, t.id), { standingsDirty: true, updatedAt: now });
      }
    }
    return { ...view(t, ctx, write ?? control, uid, now, { window: windowView(t, a, pool, uid, now) }), recorded, duplicate };
  });
  await after(db, t, uid, now, notices, finishedNow);
  res.status(200).json(out);
}

// ── Authority: transfer and failover claim ─────────────────────────────────

async function authority(
  db: Firestore, res: VercelResponse, t: TournamentDoc, uid: string, body: Record<string, unknown>, now: number,
): Promise<void> {
  ensure(t.gameMode === 'shared', 'unsupported_mode', 400);
  ensure(now < t.schedule.endsAt, 'answers_closed');
  let notices: CompetitionNotice[] = [];
  const out = await db.runTransaction(async (tx) => {
    notices = [];
    const ctx = await loadTeam(tx, db, t, uid, now);
    ensure(ctx.control, 'team_not_started');
    const result = body.action === 'team-transfer'
      ? transferAuthority(ctx.control, uid, String(body.to || ''), body.version, now)
      : claimAuthority(ctx.control, uid, body.version, now);
    ensureAuthority(result);
    if (!result.already) {
      tx.set(ctx.controlRef, result.control);
      if (result.control.holderUid !== uid)
        notices = [inboxNotice(tx, db, t, result.control.holderUid, 'authority_received', now)];
    } else if (ctx.created) tx.set(ctx.controlRef, result.control);
    return view(t, ctx, result.control, uid, now);
  });
  if (notices.length) await deliverCompetitionNotices(db, notices, uid).catch(() => undefined);
  res.status(200).json(out);
}

// ── Review after the close ─────────────────────────────────────────────────

/** The team's correction sheet; null when the caller is not a starter of a team-mode event. */
export async function teamReview(db: Firestore, t: TournamentDoc, uid: string, now: number) {
  const claim = (await db.doc(`entryClaims/${t.competitionEventId}_${uid}`).get()).data();
  if (!claim) throw new TeamError('not_a_starter', 403);
  const entryId = String(claim.entryId);
  if (t.format === 'live') {
    if (now < t.schedule.endsAt) throw new TeamError('not_closed');
    const [qSnap, mine] = await Promise.all([
      sub(db, t.id, 'questions/live').get(),
      subCol(db, t.id, 'teamAnswers').where('entryId', '==', entryId).get(),
    ]);
    const items = (qSnap.data()?.items || []) as StoredQuestion[];
    const byIndex = new Map(mine.docs.map((d) => [d.data().index as number, d.data()]));
    return items.map((q, i) => ({
      ...toPublicQuestion(q),
      answer: q.answer,
      explanation: q.explanation,
      explanationHt: q.explanationHt,
      choice: byIndex.has(i) ? byIndex.get(i)!.choice : null,
      points: byIndex.has(i) ? byIndex.get(i)!.points : 0,
      by: byIndex.has(i) ? byIndex.get(i)!.uid : null,
    }));
  }
  const win = t.schedule.rounds[0];
  if (!win || now < win.closesAt) throw new TeamError('not_closed');
  const [aSnap, poolSnap] = await Promise.all([
    sub(db, t.id, `teamAttempts/0_${entryId}`).get(),
    sub(db, t.id, 'questions/r0').get(),
  ]);
  if (!aSnap.exists) throw new TeamError('no_attempt', 404);
  const a = aSnap.data() as TeamAttempt;
  const pool = (poolSnap.data()?.items || []) as StoredQuestion[];
  return a.order.map((qi, i) => {
    const q = pool[qi];
    return {
      ...toPublicQuestion(q),
      answer: q.answer,
      explanation: q.explanation,
      explanationHt: q.explanationHt,
      choice: a.choices[i] >= 0 ? a.choices[i] : null,
      points: a.choices[i] === PENDING ? 0 : a.points[i] || 0,
      by: a.answeredBy?.[i] ?? null,
    };
  });
}

export { TeamError };
