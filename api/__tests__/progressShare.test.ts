import { MetaDb } from './helpers/metaDb';
import {
  createShare, eraseProgressShares, generateShareToken, hashShareToken, listShares, revokeShare, viewShare,
} from '../_lib/progressShare';
import { MAX_ACTIVE_SHARES, shareMessage, shareLink, toPublicProgress } from '../../shared/progressShare';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 19, 15);
let memory: MetaDb;
const db = () => memory as any;
const catalogs = {
  courses: [{ id: 'math-ns4', name: 'Maths NS4', modules: [{ id: 'U1', title: 'Fonctions', lessons: [{ id: 'L1' }, { id: 'L2' }] }] }],
  exams: new Map([['ex1', { exam_id: 'ex1', exam_title: 'Bac Maths', subject: 'Maths', year: '2024', level: 'terminale' }]]),
};

function seedStudent(uid = 'stu') {
  memory.put(`users/${uid}`, {
    full_name: 'Marie Claire Dupont', email: 'marie.dupont@example.org', grade: 'NS4', role: 'student',
    referralCode: 'SECRET', phone: '+50937000000',
  });
  memory.put(`users/${uid}/gamification/profile`, {
    xp: 1234, totalCorrect: 40, totalQuestions: 50,
    leaderboard: { school: 'Lycée Toussaint Louverture', city: 'Cap-Haïtien', displayName: 'Mimi' },
  });
  memory.put(`users/${uid}/streaks/global`, { currentStreak: 4, longestStreak: 9, lastActivityDate: '2026-10-19', activeDays: ['2026-10-19'] });
  memory.put(`users/${uid}/mastery/lessons`, { lessons: { L1: { bestPct: 100 }, L2: { completed: true } } });
  memory.put(`users/${uid}/progress/math-ns4`, { completedLessons: ['L1', 'L2'], totalPoints: 50, notes: 'private note' });
  memory.put(`users/${uid}/examResults/ex1`, {
    summary: { percentage: 72.4 }, submitted_at_ms: now - DAY,
    answers: { 0: 'my private essay about my family' }, preGradedResults: { 0: { feedback: 'secret feedback' } },
  });
  memory.put(`chatConversations/c1`, { uid, messages: ['I feel anxious about the Bac'] });
}

beforeEach(() => { memory = new MetaDb(); seedStudent(); });

describe('tokens', () => {
  it('are 192-bit base64url strings, unique, and only their SHA-256 is stored', async () => {
    const tokens = new Set(Array.from({ length: 500 }, generateShareToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(Buffer.from([...tokens][0], 'base64url').length * 8).toBeGreaterThanOrEqual(128);
    const { token, id } = await createShare(db(), 'stu', 30, now);
    expect(id).toBe(hashShareToken(token));
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(memory.store.has(`progressShares/${id}`)).toBe(true);
    expect(JSON.stringify([...memory.store.entries()])).not.toContain(token);
  });
  it('defaults to 90 days and accepts only 7, 30 or 90', async () => {
    expect((await createShare(db(), 'stu', undefined, now)).expiresAt).toBe(now + 90 * DAY);
    expect((await createShare(db(), 'stu', 7, now)).expiresAt).toBe(now + 7 * DAY);
    expect((await createShare(db(), 'stu', 365, now)).days).toBe(90);
  });
  it('caps active links; revoked links free a slot', async () => {
    const made = [];
    for (let i = 0; i < MAX_ACTIVE_SHARES; i++) made.push(await createShare(db(), 'stu', 30, now));
    await expect(createShare(db(), 'stu', 30, now)).rejects.toMatchObject({ code: 'limit' });
    await revokeShare(db(), 'stu', made[0].id, now);
    await expect(createShare(db(), 'stu', 30, now)).resolves.toBeTruthy();
  });
});

describe('public view', () => {
  it('returns the progress and counts the view', async () => {
    const { token, id } = await createShare(db(), 'stu', 30, now);
    const out = await viewShare(db(), token, now + 1000, catalogs);
    expect(out.status).toBe('ok');
    const record = memory.store.get(`progressShares/${id}`);
    expect(record.views).toBe(1);
    expect(record.lastViewedAt).toBe(now + 1000);
    const { shares } = await listShares(db(), 'stu', now + 2000);
    expect(shares).toEqual([{ id, createdAt: now, expiresAt: now + 30 * DAY, lastViewedAt: now + 1000, views: 1 }]);
  });
  it('leaks no private field: only first name, class, progress, exam percentages, streak, XP, last activity', async () => {
    const { token } = await createShare(db(), 'stu', 30, now);
    const out: any = await viewShare(db(), token, now, catalogs);
    const json = JSON.stringify(out);
    for (const secret of ['Claire', 'Dupont', 'example.org', 'Lycée', 'Cap-Ha', 'Mimi', 'SECRET', '+509', 'essay', 'feedback',
      'anxious', 'private note', 'stu', 'totalCorrect', 'answers', 'role', 'referral']) {
      expect(json).not.toContain(secret);
    }
    expect(Object.keys(out.progress).sort()).toEqual(['courses', 'exams', 'expiresAt', 'firstName', 'generatedAt', 'grade', 'lastActivityDay', 'lessonsDone', 'scope', 'streak', 'xp']);
    expect(out.progress).toMatchObject({ firstName: 'Marie', grade: 'NS4', xp: 1234, lessonsDone: 2, lastActivityDay: '2026-10-19', streak: { current: 4, best: 9 } });
    expect(out.progress.exams).toEqual([{ title: 'Bac Maths', subject: 'Maths', year: '2024', level: 'terminale', percentage: 72, submittedAtMs: now - DAY }]);
    expect(out.progress.courses[0]).toMatchObject({ courseId: 'math-ns4', name: 'Maths NS4', lessonsCompleted: 2, lessonTotal: 2 });
    expect(out.progress.courses[0].units[0].mastery.counts.proficient).toBe(1);
  });
  it('the scope filter rebuilds objects so extra properties are dropped', () => {
    const out = toPublicProgress({ firstName: 'Ana', grade: 'NS1', generatedAt: 1, expiresAt: 2, lastActivityDay: 'yesterday',
      streak: { current: 1, best: 2 }, xp: 5, lessonsDone: 1,
      courses: [{ courseId: 'c', name: 'C', email: 'x@y.z', mastery: { points: 1, secret: 'k' }, units: [{ unitId: 'u', title: 'U', answers: ['a'] }] }],
      exams: [{ title: 'T', percentage: 150, answers: { 0: 'a' } }] } as any);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/email|secret|answers/);
    expect(out.lastActivityDay).toBeNull();
    expect(out.exams[0].percentage).toBe(100);
  });
  it('revoked, expired and unknown links show only their status', async () => {
    const a = await createShare(db(), 'stu', 7, now);
    await revokeShare(db(), 'stu', a.id, now);
    expect(await viewShare(db(), a.token, now, catalogs)).toEqual({ status: 'revoked' });
    const b = await createShare(db(), 'stu', 7, now);
    expect(await viewShare(db(), b.token, now + 7 * DAY, catalogs)).toEqual({ status: 'expired' });
    expect(memory.store.get(`progressShares/${b.id}`).views).toBe(0);
    expect(await viewShare(db(), generateShareToken(), now, catalogs)).toEqual({ status: 'not_found' });
    expect(await viewShare(db(), '../../users/stu', now, catalogs)).toEqual({ status: 'not_found' });
  });
  it('only the owner can revoke; a stranger is told the link does not exist', async () => {
    const { id, token } = await createShare(db(), 'stu', 30, now);
    await expect(revokeShare(db(), 'stranger', id, now)).rejects.toMatchObject({ code: 'not_found' });
    expect((await viewShare(db(), token, now, catalogs)).status).toBe('ok');
    await revokeShare(db(), 'stu', id, now);
    await revokeShare(db(), 'stu', id, now + 5);
    expect(memory.store.get(`progressShares/${id}`).revokedAt).toBe(now);
    expect((await listShares(db(), 'stu', now)).shares).toEqual([]);
  });
  it('account deletion removes every link', async () => {
    const { token } = await createShare(db(), 'stu', 30, now);
    await createShare(db(), 'other', 30, now);
    await eraseProgressShares(db(), 'stu');
    expect(await viewShare(db(), token, now, catalogs)).toEqual({ status: 'not_found' });
    expect([...memory.store.values()].filter((v) => v?.uid === 'other')).toHaveLength(1);
  });
});

describe('share copy', () => {
  it('is one sentence plus the link, without em-dash', () => {
    const link = shareLink('a'.repeat(32));
    for (const lang of ['fr', 'ht'] as const) {
      const msg = shareMessage(link, lang);
      expect(msg.endsWith(link)).toBe(true);
      expect(msg).not.toMatch(/[—–]/);
      expect(msg.split(/[.!?]\s/).length).toBe(1);
    }
  });
});
