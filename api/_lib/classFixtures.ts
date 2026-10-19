/**
 * Class-vs-class fixtures on the existing user-tournament engine.
 *
 *   classFixtures/{fid}         SERVER ONLY: the challenge, both sides, its config, the tournament id
 *   classFixtureCodes/{code}    SERVER ONLY: { fixtureId } while the challenge waits for the other teacher
 *   userTournaments/{tid}       the engine doc: window format, teamRule 'class', private, no PIN
 *
 * Authority: only an active approved teacher proposes (for a class they own) and
 * only an active approved teacher accepts (for a different class they own). Both
 * grants are re-read in the acceptance transaction. Students enter only through
 * `joinFixture`, which re-checks approved membership; the engine re-checks it again
 * inside its own join transaction. Timing, the question draw and every score are the
 * engine's: nothing a client sends is a score. A class's result is read from the
 * engine's server-rebuilt standings.
 */
import { createHash, randomInt } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../src/data/triviaData';
import {
  CLASS_LIMITS, ClassError, FIXTURE_AGGREGATES, FIXTURE_LIMITS, assertTeacher, classId, firstName,
  type ClassFixture, type ClassRecord, type FixturePreview, type FixtureTeamScore, type FixtureView,
} from '../../shared/classes';
import { LIMITS, cleanText, validateTournamentInput } from '../../shared/tournois/config';
import { buildSchedule } from '../../shared/tournois/schedule';
import { drawQuestions, type BankQuestion } from '../../shared/tournois/questions';
import { poolPlan, splitPools } from '../tournois/create';
import { advanceTournament, classTeamKey, joinTournament, type TournamentDoc } from '../tournois/_shared';

const ALLOWED = TRIVIA_CATEGORIES.map((c) => c.id);
const BANK = TRIVIA_QUESTIONS as unknown as Record<string, BankQuestion[]>;
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');
const HOUR = 3600_000;
export const FIXTURE_MAX_PLAYERS = 2 * CLASS_LIMITS.students;
export const fixtureCategories = () => TRIVIA_CATEGORIES.map((c) => ({ id: c.id, name: c.name, nameHt: c.nameHt || c.name }));
export const fixtureTid = (fid: string) => `fx${fid}`;

async function activeTeacher(get: (path: string) => Promise<any>, uid: string) {
  if ((await get(`classTeachers/${uid}`))?.active !== true) throw new ClassError('teacher_required');
}

function parseConfig(body: Record<string, unknown>, now: number) {
  const pick = <T>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : null);
  const categories = [...new Set(Array.isArray(body.categories) ? body.categories.filter((c): c is string => typeof c === 'string' && ALLOWED.includes(c)) : [])];
  const questionCount = pick(Number(body.questionCount), FIXTURE_LIMITS.questionCounts);
  const secondsPerQuestion = pick(Number(body.secondsPerQuestion), FIXTURE_LIMITS.seconds);
  const windowHours = pick(Number(body.windowHours), FIXTURE_LIMITS.windowHours);
  const teamSize = pick(Number(body.teamSize), FIXTURE_LIMITS.teamSizes);
  const aggregate = pick(body.aggregate ?? 'average', FIXTURE_AGGREGATES);
  const startsAt = Math.round(Number(body.startsAt));
  if (!categories.length || categories.length > FIXTURE_LIMITS.categoriesMax || !questionCount || !secondsPerQuestion || !windowHours || !teamSize || !aggregate
    || !Number.isFinite(startsAt) || startsAt < now - 5 * 60_000 || startsAt > now + LIMITS.maxLeadMs) throw new ClassError('invalid_input');
  const title = cleanText(body.title, 60);
  return { categories, questionCount, secondsPerQuestion, windowHours, teamSize, aggregate, startsAt, title };
}

/** A teacher challenges another class. Idempotent per request id. */
export async function proposeFixture(db: Firestore, uid: string, body: Record<string, unknown>, now: number) {
  const homeId = classId(body.id);
  const cfg = parseConfig(body, now);
  const fid = createHash('sha256').update(`fixture:${uid}:${classId(body.requestId)}`).digest('hex').slice(0, 28);
  const code = newCode();
  return db.runTransaction(async (tx) => {
    const get = async (path: string) => (await tx.get(db.doc(path))).data();
    const homeRef = db.doc(`classes/${homeId}`);
    const [home, existing, pin] = await Promise.all([get(`classes/${homeId}`) as Promise<ClassRecord | undefined>, get(`classFixtures/${fid}`), get(`classFixtureCodes/${code}`)]);
    await activeTeacher(get, uid);
    if (!home) throw new ClassError('not_found');
    assertTeacher(home, uid);
    if (existing) return { id: fid, code: existing.state === 'proposed' ? existing.code : undefined };
    if (home.archived) throw new ClassError('archived');
    if (pin) throw new ClassError('unavailable'); // retry with the same request id draws another code
    const ids = home.fixtureIds || [];
    const others = await Promise.all(ids.map((f) => get(`classFixtures/${f}`)));
    if (others.filter((f) => f?.state === 'proposed').length >= CLASS_LIMITS.openFixtures) throw new ClassError('full');
    const fixture: ClassFixture = {
      id: fid, code, state: 'proposed', away: null, createdAt: now, decidedAt: null, tid: null,
      home: { classId: homeId, title: home.title, school: home.school, teacherUid: uid },
      title: cfg.title || 'Défi de classes',
      categories: cfg.categories, questionCount: cfg.questionCount, secondsPerQuestion: cfg.secondsPerQuestion,
      startsAt: cfg.startsAt, windowHours: cfg.windowHours, teamSize: cfg.teamSize, aggregate: cfg.aggregate,
    };
    tx.create(db.doc(`classFixtures/${fid}`), fixture);
    tx.create(db.doc(`classFixtureCodes/${code}`), { fixtureId: fid });
    tx.set(homeRef, { ...home, fixtureIds: [fid, ...ids].slice(0, CLASS_LIMITS.fixtures) });
    return { id: fid, code };
  });
}

const validCode = (v: unknown) => {
  const code = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new ClassError('not_found');
  return code;
};

/** What a teacher holding a code sees before accepting: the other class's name and the rules, nothing else. */
export async function previewFixture(db: Firestore, uid: string, rawCode: unknown): Promise<FixturePreview> {
  const code = validCode(rawCode);
  await activeTeacher(async (p) => (await db.doc(p).get()).data(), uid);
  const pin = (await db.doc(`classFixtureCodes/${code}`).get()).data();
  const f = pin && (await db.doc(`classFixtures/${classId(pin.fixtureId)}`).get()).data() as ClassFixture | undefined;
  if (!f) throw new ClassError('not_found');
  if (f.state !== 'proposed') throw new ClassError('fixture_closed');
  return { id: f.id, title: f.title, home: { title: f.home.title, school: f.home.school }, startsAt: f.startsAt, windowHours: f.windowHours,
    teamSize: f.teamSize, aggregate: f.aggregate, questionCount: f.questionCount, secondsPerQuestion: f.secondsPerQuestion };
}

/** The second teacher accepts for one of their classes; the engine tournament is created in the same transaction. */
export async function acceptFixture(db: Firestore, uid: string, rawCode: unknown, awayClassId: unknown, now: number) {
  const code = validCode(rawCode);
  const awayId = classId(awayClassId);
  return db.runTransaction(async (tx) => {
    const get = async (path: string) => (await tx.get(db.doc(path))).data();
    const pin = await get(`classFixtureCodes/${code}`);
    if (!pin) throw new ClassError('not_found');
    const f = await get(`classFixtures/${classId(pin.fixtureId)}`) as ClassFixture | undefined;
    if (!f) throw new ClassError('not_found');
    if (f.state !== 'proposed') throw new ClassError('fixture_closed');
    if (f.home.classId === awayId) throw new ClassError('same_class');
    const [away, home] = await Promise.all([get(`classes/${awayId}`), get(`classes/${f.home.classId}`)]) as Array<ClassRecord | undefined>;
    if (!away || !home) throw new ClassError('not_found');
    assertTeacher(away, uid);
    // Both acceptances must still stand: the proposer's grant and class too.
    await activeTeacher(get, uid);
    await activeTeacher(get, f.home.teacherUid);
    if (away.archived || home.archived || home.teacherUid !== f.home.teacherUid) throw new ClassError('fixture_closed');
    const tid = fixtureTid(f.id);
    if (await get(`userTournaments/${tid}`)) throw new ClassError('fixture_closed');
    // A start that passed while the challenge waited opens shortly after acceptance instead.
    const startsAt = Math.max(f.startsAt, now + LIMITS.minLeadMs);
    const v = validateTournamentInput({
      title: f.title, description: '', format: 'window', teamRule: 'class', teamSize: f.teamSize,
      teamAggregate: f.aggregate, visibility: 'private', categories: f.categories, questionCount: f.questionCount,
      secondsPerQuestion: f.secondsPerQuestion, startsAt, windowHours: f.windowHours, maxPlayers: FIXTURE_MAX_PLAYERS, creatorPlays: false,
    }, now, ALLOWED);
    if (!v.ok) throw new ClassError('invalid_input');
    const cfg = v.config;
    const plan = poolPlan(cfg);
    const pools = splitPools(drawQuestions(BANK, cfg.categories, plan.pools * plan.perPool, Math.random), plan.pools, plan.min);
    if (!pools) throw new ClassError('not_enough_questions');
    const schedule = buildSchedule(cfg);
    const doc: TournamentDoc = {
      ...cfg, id: tid, creatorUid: f.home.teacherUid, creatorName: cleanText(home.title, 40), pin: '', state: 'scheduled', schedule,
      nextDeadlineAt: schedule.startsAt, playerCount: 0, currentRound: -1, closedThrough: -1, bracketRounds: 0, winner: null,
      standingsDirty: false, createdAt: now, updatedAt: now,
      classFixtureId: f.id, classIds: [f.home.classId, awayId], classTeacherUids: [...new Set([f.home.teacherUid, uid])],
    };
    tx.create(db.doc(`userTournaments/${tid}`), doc);
    tx.create(db.doc(`userTournaments/${tid}/questions/r0`), { items: pools[0] });
    tx.create(db.doc(`userTournaments/${tid}/standings/current`), { rows: [], teams: [], total: 0, final: false, updatedAt: now });
    for (const teacher of doc.classTeacherUids!) {
      tx.set(db.doc(`users/${teacher}/myTournaments/${tid}`), { tid, title: cfg.title, format: cfg.format, startsAt: cfg.startsAt,
        role: teacher === f.home.teacherUid ? 'creator' : 'player', joinedAt: now });
    }
    tx.set(db.doc(`classFixtures/${f.id}`), { ...f, state: 'accepted', decidedAt: now, tid, startsAt,
      away: { classId: awayId, title: away.title, school: away.school, teacherUid: uid } });
    tx.delete(db.doc(`classFixtureCodes/${code}`));
    tx.set(db.doc(`classes/${awayId}`), { ...away, fixtureIds: [f.id, ...(away.fixtureIds || []).filter((x) => x !== f.id)].slice(0, CLASS_LIMITS.fixtures) });
    return { id: f.id, tid };
  });
}

/** Decline (any active teacher holding the code) or cancel (the proposer). Only a waiting challenge. */
export async function closeFixture(db: Firestore, uid: string, body: Record<string, unknown>, action: 'fixture-decline' | 'fixture-cancel', now: number) {
  return db.runTransaction(async (tx) => {
    const get = async (path: string) => (await tx.get(db.doc(path))).data();
    let f: ClassFixture | undefined;
    if (action === 'fixture-decline') {
      const pin = await get(`classFixtureCodes/${validCode(body.code)}`);
      f = pin && await get(`classFixtures/${classId(pin.fixtureId)}`) as ClassFixture | undefined;
      await activeTeacher(get, uid);
    } else {
      f = await get(`classFixtures/${classId(body.fixtureId)}`) as ClassFixture | undefined;
      if (f && f.home.teacherUid !== uid) throw new ClassError('forbidden');
    }
    if (!f) throw new ClassError('not_found');
    if (f.state !== 'proposed') return { ok: true };
    tx.set(db.doc(`classFixtures/${f.id}`), { ...f, state: action === 'fixture-decline' ? 'declined' : 'cancelled', decidedAt: now });
    tx.delete(db.doc(`classFixtureCodes/${f.code}`));
    return { ok: true };
  });
}

/** An approved student enters the fixture for their own class, under their first name only. */
export async function joinFixture(db: Firestore, uid: string, rawClass: unknown, rawFixture: unknown, now: number) {
  const id = classId(rawClass);
  const [cSnap, fSnap] = await Promise.all([db.doc(`classes/${id}`).get(), db.doc(`classFixtures/${classId(rawFixture)}`).get()]);
  const c = cSnap.data() as ClassRecord | undefined, f = fSnap.data() as ClassFixture | undefined;
  if (!c || !c.members[uid]) throw new ClassError('forbidden');
  if (!f || !f.tid || f.state !== 'accepted' || (f.home.classId !== id && f.away?.classId !== id)) throw new ClassError('not_found');
  if (c.archived) throw new ClassError('archived');
  const out = await joinTournament(db, f.tid, {
    uid, displayName: firstName(c.members[uid].name), school: null, grade: null,
    classId: id, classKey: classTeamKey(id), classLabel: cleanText(`${c.title} · ${c.school}`, 80),
  }, now);
  if (!out.ok) throw new ClassError(out.error === 'closed' || out.error === 'full' ? 'fixture_closed' : out.error === 'class_required' ? 'forbidden' : 'not_found');
  return { ok: true, tid: f.tid };
}

function teamScore(teams: any[], classIdValue: string): FixtureTeamScore | null {
  const row = (teams || []).find((t) => t.key === classTeamKey(classIdValue));
  return row ? { score: row.score, counted: row.counted, members: row.members, qualified: !!row.qualified, needed: row.needed || 0 } : null;
}

/** Decide a finished fixture from the two class rows. A class short of its minimum cannot win. */
export function fixtureOutcome(mine: FixtureTeamScore | null, theirs: FixtureTeamScore | null): 'win' | 'loss' | 'draw' | 'none' {
  const a = mine?.qualified ? mine.score : null, b = theirs?.qualified ? theirs.score : null;
  if (a == null && b == null) return 'none';
  if (b == null) return 'win';
  if (a == null) return 'loss';
  return a > b ? 'win' : a < b ? 'loss' : 'draw';
}

/** Fixture cards for a class board. Called only after the reader's membership was checked. */
export async function fixtureViews(db: Firestore, c: ClassRecord, viewer: string, now: number): Promise<FixtureView[]> {
  const ids = (c.fixtureIds || []).slice(0, CLASS_LIMITS.fixtures);
  if (!ids.length) return [];
  const docs = await db.getAll(...ids.map((f) => db.doc(`classFixtures/${f}`)));
  const views: FixtureView[] = [];
  for (const d of docs) {
    const f = d.data() as ClassFixture | undefined;
    if (!f) continue;
    const side = f.home.classId === c.id ? 'home' : 'away';
    const opponent = side === 'home' ? f.away : f.home;
    let phase: FixtureView['phase'] = f.state === 'proposed' ? 'waiting' : f.state === 'accepted' ? 'upcoming' : 'closed';
    let mine: FixtureTeamScore | null = null, theirs: FixtureTeamScore | null = null;
    let joined: boolean | undefined;
    if (f.state === 'accepted' && f.tid) {
      let t = (await db.doc(`userTournaments/${f.tid}`).get()).data() as TournamentDoc | undefined;
      // Lazy, idempotent catch-up (the same step the tick and cron take) so a closed window shows its final result.
      if (t && t.nextDeadlineAt != null && t.nextDeadlineAt <= now) {
        await advanceTournament(db, f.tid, now);
        t = (await db.doc(`userTournaments/${f.tid}`).get()).data() as TournamentDoc | undefined;
      }
      const standings = (await db.doc(`userTournaments/${f.tid}/standings/current`).get()).data();
      mine = teamScore(standings?.teams, c.id);
      theirs = opponent ? teamScore(standings?.teams, opponent.classId) : null;
      phase = t?.state === 'finished' ? 'final' : t?.state === 'cancelled' ? 'closed' : now < f.startsAt ? 'upcoming' : 'open';
      if (c.teacherUid !== viewer) joined = (await db.doc(`userTournaments/${f.tid}/roster/${viewer}`).get()).exists;
    }
    views.push({
      id: f.id, state: f.state, side, title: f.title,
      opponent: opponent ? { title: opponent.title, school: opponent.school } : null,
      ...(side === 'home' && f.state === 'proposed' && c.teacherUid === viewer ? { code: f.code } : {}),
      startsAt: f.startsAt, endsAt: f.startsAt + f.windowHours * HOUR, teamSize: f.teamSize, aggregate: f.aggregate, questionCount: f.questionCount,
      tid: f.state === 'accepted' ? f.tid : null, phase, mine, theirs,
      outcome: phase === 'final' ? fixtureOutcome(mine, theirs) : null,
      ...(joined === undefined ? {} : { joined }),
    });
  }
  return views;
}

/** Archiving a class withdraws its waiting challenges. Runs inside the archive transaction (reads first). */
export async function readOpenFixtures(tx: { get: (ref: any) => Promise<any> }, db: Firestore, c: ClassRecord) {
  const out: ClassFixture[] = [];
  for (const f of c.fixtureIds || []) {
    const data = (await tx.get(db.doc(`classFixtures/${f}`))).data() as ClassFixture | undefined;
    if (data?.state === 'proposed' && data.home.classId === c.id) out.push(data);
  }
  return out;
}

/** Account deletion of a teacher: withdraw their waiting challenges, keep played results under a neutral name. */
export async function eraseTeacherFixtures(db: Firestore, uid: string, c: ClassRecord, now: number) {
  for (const fid of c.fixtureIds || []) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`classFixtures/${fid}`);
      const f = (await tx.get(ref)).data() as ClassFixture | undefined;
      if (!f) return;
      const tRef = f.tid ? db.doc(`userTournaments/${f.tid}`) : null;
      const t = tRef ? (await tx.get(tRef)).data() : null;
      if (f.state === 'proposed') {
        tx.delete(db.doc(`classFixtureCodes/${f.code}`));
        tx.delete(ref);
        return;
      }
      const scrub = (s: ClassFixture['home'] | null) => (s && s.classId === c.id ? { classId: s.classId, title: 'Classe supprimée', school: '', teacherUid: '' } : s);
      tx.set(ref, { ...f, home: scrub(f.home), away: scrub(f.away), decidedAt: f.decidedAt ?? now });
      if (tRef && t) tx.set(tRef, { ...t, classTeacherUids: (t.classTeacherUids || []).filter((x: string) => x !== uid) });
    });
  }
}
