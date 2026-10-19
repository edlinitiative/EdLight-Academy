import { MetaDb } from './helpers/metaDb';
import {
  ambassadorDashboard, ambassadorDirectory, ambassadorRecruitDetail, ambassadorReport, designateAmbassador, eraseAmbassadorAccount,
  recordRecruitSignal, refreshRecruits, revokeAmbassador, setReward, SCANS_PER_REQUEST,
} from '../_lib/ambassadors';
import {
  AMBASSADOR_RULES, fraudFlags, haitiDayKey, haitiPeriod, recruitState, reportCsv, summarizeRecruits, windowDays, type RecruitRecord,
} from '../../shared/ambassadors';

const H = 3_600_000, DAY = 24 * H;
// 2026-10-05 12:00 in Haiti (UTC-4 in October).
const signup = Date.UTC(2026, 9, 5, 16);
let memory: MetaDb;
const db = () => memory as any;
const rec = (id: string, days: string[], extra: Partial<RecruitRecord> = {}): RecruitRecord => ({ id, referrerUid: 'amb', signupAt: signup, days, ...extra });

describe('retained recruit definition', () => {
  it('uses the Haiti calendar, not UTC', () => {
    expect(haitiDayKey(Date.UTC(2026, 9, 20, 2))).toBe('2026-10-19');
    expect(haitiPeriod(Date.UTC(2026, 10, 1, 3))).toBe('2026-10');
  });
  it('needs 3 distinct days inside the 14-day window starting on the signup day', () => {
    expect(windowDays(rec('a', ['2026-10-05', '2026-10-05', '2026-10-06']))).toBe(2);
    expect(recruitState(rec('a', ['2026-10-05', '2026-10-06']), signup + 3 * DAY)).toBe('pending');
    expect(recruitState(rec('a', ['2026-10-05', '2026-10-06', '2026-10-18']), signup + 20 * DAY)).toBe('retained');
    // Day 15 is outside the window; days before signup never count.
    expect(recruitState(rec('a', ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-19']), signup + 20 * DAY)).toBe('not_retained');
    expect(recruitState(rec('a', []), signup + 13 * DAY)).toBe('pending');
    expect(recruitState(rec('a', []), signup + 14 * DAY)).toBe('not_retained');
  });
  it('counts distinct accounts only and never the ambassador themself', () => {
    const three = ['2026-10-05', '2026-10-06', '2026-10-07'];
    const s = summarizeRecruits([rec('a', three), rec('a', three), rec('amb', three), rec('b', [])], signup + 20 * DAY);
    expect(s).toMatchObject({ recruits: 2, retained: 1, notRetained: 1, pending: 0 });
  });
});

describe('fraud flags', () => {
  it('flags a burst of signups within minutes and a shared hashed address', () => {
    const burst = Array.from({ length: AMBASSADOR_RULES.burstMinSignups }, (_, i) => rec(`b${i}`, [], { signupAt: signup + i * 60_000 }));
    const spread = [rec('s1', [], { signupAt: signup + 5 * H }), rec('s2', [], { signupAt: signup + 9 * H })];
    const flags = fraudFlags([...burst, ...spread]);
    expect(burst.every((r) => flags[r.id]?.includes('burst'))).toBe(true);
    expect(flags.s1).toBeUndefined();
    const ip = fraudFlags([rec('i1', [], { ipHash: 'x' }), rec('i2', [], { ipHash: 'x', signupAt: signup + 2 * H }), rec('i3', [], { ipHash: 'x', signupAt: signup + 4 * H }), rec('i4', [], { ipHash: 'y' })]);
    expect(ip.i1).toEqual(['shared_ip']);
    expect(ip.i4).toBeUndefined();
  });
  it('a flagged retained recruit is reported apart from the unflagged count', () => {
    const three = ['2026-10-05', '2026-10-06', '2026-10-07'];
    const s = summarizeRecruits([rec('i1', three, { ipHash: 'x' }), rec('i2', three, { ipHash: 'x' }), rec('i3', three, { ipHash: 'x' }), rec('c', three)], signup + 20 * DAY);
    expect(s).toMatchObject({ retained: 4, retainedUnflagged: 1, flagged: 3 });
  });
});

describe('CSV export', () => {
  it('has fixed columns, quotes, and neutralises spreadsheet formulas', () => {
    const csv = reportCsv([{ uid: 'u1', name: '=HYPERLINK("x")', school: 'Collège "A", Cap', period: '2026-10', active: true,
      recruits: 3, retained: 2, retainedUnflagged: 1, pending: 1, notRetained: 0, flagged: 1, rewardDelivered: false, rewardNotes: 'line\nbreak' }]);
    const [header] = csv.split('\n');
    expect(header).toBe('periode,ambassadeur,ecole,actif,recrues,retenues,retenues_sans_signalement,en_cours,non_retenues,signalees,recompense_remise,notes,uid');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Collège ""A"", Cap"');
    expect(csv).toContain('oui');
    expect(csv).toContain('"line\nbreak"');
  });
});

describe('server', () => {
  const now = signup + 20 * DAY;
  beforeEach(() => {
    memory = new MetaDb();
    memory.put('users/amb', { full_name: 'Jean Baptiste Pierre', email: 'jean@example.org' }, signup - 90 * DAY);
    memory.put('users/other', { full_name: 'Rose' }, signup - 90 * DAY);
  });
  const recruit = (uid: string, activity: number[], at = signup) => {
    memory.put(`users/${uid}`, { full_name: `${uid} X` }, at);
    memory.put(`referrals/amb_${uid}`, { referrerUid: 'amb', referredUid: uid, status: 'confirmed', createdAt: { toMillis: () => at + H } });
    activity.forEach((t, i) => memory.put(`users/${uid}/quizAttempts/q${i}`, { score: 1 }, t));
  };

  it('designation is admin-recorded, capped at two per school, and revocation ends dashboard access', async () => {
    await designateAmbassador(db(), 'admin', 'amb', 'Lycée Pétion', now);
    await designateAmbassador(db(), 'admin', 'other', 'lycee petion', now);
    memory.put('users/third', { full_name: 'Third' });
    await expect(designateAmbassador(db(), 'admin', 'third', 'Lycée  Pétion', now)).rejects.toMatchObject({ code: 'school_full' });
    await expect(designateAmbassador(db(), 'admin', 'ghost', 'Lycée Pétion', now)).rejects.toMatchObject({ code: 'not_found' });
    expect(memory.store.get('ambassadors/amb')).toMatchObject({ name: 'Jean', active: true, designatedBy: 'admin' });
    expect((await ambassadorDirectory(db())).uids.sort()).toEqual(['amb', 'other']);
    await expect(ambassadorDashboard(db(), 'stranger', now)).rejects.toMatchObject({ code: 'forbidden' });
    await revokeAmbassador(db(), 'admin', 'other', now);
    await expect(ambassadorDashboard(db(), 'other', now)).rejects.toMatchObject({ code: 'forbidden' });
    expect((await ambassadorDirectory(db())).uids).toEqual(['amb']);
    await designateAmbassador(db(), 'admin', 'third', 'Lycée Pétion', now);
  });

  it('retention comes from server write times, never from dates a client wrote', async () => {
    await designateAmbassador(db(), 'admin', 'amb', 'Lycée Pétion', now);
    recruit('r1', [signup + H, signup + DAY, signup + 2 * DAY]);
    recruit('r2', [signup + H]);
    // The client can write any dates it likes into its own streak doc; only the server's update time counts.
    memory.put('users/r2/streaks/global', { activeDays: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'], lastActivityDate: '2026-10-08' }, signup + H);
    recruit('r3', [signup + 30 * DAY]); // activity after the window
    const dash = await ambassadorDashboard(db(), 'amb', now);
    expect(dash.total).toMatchObject({ recruits: 3, retained: 1, notRetained: 2 });
    expect(dash.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(dash.link).toContain(`?ref=${dash.code}`);
    expect(JSON.stringify(dash)).not.toMatch(/r1|r2|r3|example\.org/);
    expect(memory.store.get('ambassadorRecruits/r1')).toMatchObject({ final: true, days: ['2026-10-05', '2026-10-06', '2026-10-07'] });
  });

  it('keeps every day ever observed, and stops rescanning a final record', async () => {
    recruit('r1', [signup + H]);
    await refreshRecruits(db(), 'amb', signup + 2 * H);
    memory.updateTimes.set('users/r1/quizAttempts/q0', signup + DAY); // the same doc updated the next day
    await refreshRecruits(db(), 'amb', signup + DAY + 8 * H);
    memory.updateTimes.set('users/r1/quizAttempts/q0', signup + 2 * DAY);
    await refreshRecruits(db(), 'amb', signup + 2 * DAY + 8 * H);
    expect(memory.store.get('ambassadorRecruits/r1').days).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    await refreshRecruits(db(), 'amb', now);
    expect(memory.store.get('ambassadorRecruits/r1').final).toBe(true);
    memory.put('users/r1/quizAttempts/late', {}, signup + 3 * DAY);
    await refreshRecruits(db(), 'amb', now + DAY);
    expect(memory.store.get('ambassadorRecruits/r1').days).toHaveLength(3);
  });

  it('bounds scanning per request', async () => {
    for (let i = 0; i < SCANS_PER_REQUEST + 5; i++) recruit(`r${i}`, [signup + H]);
    await refreshRecruits(db(), 'amb', signup + 2 * H);
    const scanned = [...memory.store.entries()].filter(([k, v]) => k.startsWith('ambassadorRecruits/') && v.scannedAt > 0);
    expect(scanned).toHaveLength(SCANS_PER_REQUEST);
  });

  it('records the hashed address at redemption and flags shared ones in the admin detail', async () => {
    for (const uid of ['a1', 'a2', 'a3']) {
      memory.put(`users/${uid}`, {}, signup);
      memory.put(`referrals/amb_${uid}`, { referrerUid: 'amb', referredUid: uid });
      await recordRecruitSignal(db(), 'amb', uid, 'hash1', signup + H);
    }
    await recordRecruitSignal(db(), 'amb', 'amb', 'hash1', signup);
    expect(memory.store.has('ambassadorRecruits/amb')).toBe(false);
    const detail = await ambassadorRecruitDetail(db(), 'amb', now);
    expect(detail.recruits).toHaveLength(3);
    expect(detail.recruits.every((r: any) => r.flags.includes('shared_ip'))).toBe(true);
  });

  it('report rows per period with the manual reward record', async () => {
    await designateAmbassador(db(), 'admin', 'amb', 'Lycée Pétion', now);
    recruit('r1', [signup + H, signup + DAY, signup + 2 * DAY]);
    await setReward(db(), 'admin', 'amb', '2026-10', true, 'Recharge 500 HTG remise le 3 nov.', now);
    await expect(setReward(db(), 'admin', 'amb', 'octobre', true, '', now)).rejects.toMatchObject({ code: 'invalid_input' });
    const { rows } = await ambassadorReport(db(), '2026-10', now);
    expect(rows).toEqual([expect.objectContaining({ uid: 'amb', name: 'Jean', recruits: 1, retained: 1, rewardDelivered: true, rewardNotes: 'Recharge 500 HTG remise le 3 nov.' })]);
    expect((await ambassadorReport(db(), '2026-09', now)).rows[0]).toMatchObject({ recruits: 0, rewardDelivered: false });
  });

  it('account deletion pseudonymizes recruit and ambassador links', async () => {
    await designateAmbassador(db(), 'admin', 'amb', 'Lycée Pétion', now);
    recruit('r1', [signup + H, signup + DAY, signup + 2 * DAY]);
    await recordRecruitSignal(db(), 'amb', 'r1', 'hash1', signup + H);
    await refreshRecruits(db(), 'amb', now);
    await eraseAmbassadorAccount(db(), 'r1');
    const outside = () => JSON.stringify([...memory.store.entries()].filter(([k]) => !k.startsWith('users/')));
    expect(outside()).not.toContain('r1');
    expect(outside()).not.toContain('hash1');
    expect(summarizeRecruits(await refreshRecruits(db(), 'amb', now), now)).toMatchObject({ recruits: 1, retained: 1 });
    await setReward(db(), 'admin', 'amb', '2026-10', true, 'Téléphone de Jean : 3700', now);
    await eraseAmbassadorAccount(db(), 'amb');
    expect(outside()).not.toMatch(/"amb"|amb_|ambassadors\/amb|3700/);
    expect((await ambassadorDirectory(db())).uids).toEqual([]);
  });
});
