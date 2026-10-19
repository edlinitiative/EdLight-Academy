import {
  ABSENT_MS,
  claimAuthority,
  initialControl,
  legBounds,
  newTeamAttempt,
  parseGameMode,
  relayCatchUp,
  relayStartLeg,
  relayTurnMs,
  sharedSubmitRefusal,
  teamAnswer,
  transferAuthority,
} from '../../shared/teams/modes';
import { modeRules, practiceScript, relayLiveTurns, teamPanelModel, type TeamState } from '../../shared/teams/client';

const entry = { id: 'team', captainUid: 'a', starters: ['a', 'b', 'c'] };
const MIN = 60_000;

describe('authority policy', () => {
  it('parses modes without coercion and defaults the holder to the captain', () => {
    expect(parseGameMode(undefined)).toBe('independent');
    expect(parseGameMode('relay')).toBe('relay');
    expect(parseGameMode('solo')).toBeNull();
    const c = initialControl({ ...entry, captainUid: 'z' }, 'shared', 0);
    expect([c.holderUid, c.deputyUid]).toEqual(['a', 'b']);
    expect(initialControl({ ...entry, roles: { submitter: 'c', deputy: 'b' } }, 'shared', 0).holderUid).toBe('c');
  });
  it('versions every change; stale and non-holder submissions are refused', () => {
    const c = initialControl(entry, 'shared', 0);
    const t = transferAuthority(c, 'a', 'c', 1, 10);
    expect(t.ok && t.control).toMatchObject({ holderUid: 'c', authorityVersion: 2 });
    if (!t.ok) throw new Error();
    expect(sharedSubmitRefusal(t.control, 'a', 1)).toBe('authority_stale');
    expect(sharedSubmitRefusal(t.control, 'a', 2)).toBe('not_authority_holder');
    expect(sharedSubmitRefusal(t.control, 'c', 2)).toBeNull();
    expect(transferAuthority(t.control, 'b', 'a', 2, 11)).toEqual({ ok: false, error: 'not_authority_holder' });
    expect(transferAuthority(t.control, 'c', 'z', 2, 11)).toEqual({ ok: false, error: 'invalid_recipient' });
  });
  it('lets the deputy claim after ABSENT_MS and anyone after twice that', () => {
    const c = { ...initialControl(entry, 'shared', 0), lastSeen: { a: 1000 } };
    expect(claimAuthority(c, 'b', 1, 1000 + ABSENT_MS - 1)).toEqual({ ok: false, error: 'holder_present' });
    expect(claimAuthority(c, 'b', 1, 1000 + ABSENT_MS).ok).toBe(true);
    expect(claimAuthority(c, 'c', 1, 1000 + ABSENT_MS)).toEqual({ ok: false, error: 'holder_present' });
    expect(claimAuthority(c, 'c', 1, 1000 + 2 * ABSENT_MS).ok).toBe(true);
    expect(claimAuthority(c, 'b', 0, 1000 + ABSENT_MS)).toEqual({ ok: false, error: 'authority_stale' });
    expect(claimAuthority(initialControl(entry, 'relay', 0), 'b', 1, 1e9)).toEqual({ ok: false, error: 'unsupported_mode' });
  });
});

describe('relay legs', () => {
  const qMs = 10_000;
  const closes = 60 * MIN;
  const turn = relayTurnMs(60 * MIN);
  it('splits questions into consecutive legs and bounds the turn window', () => {
    expect(legBounds(10, 3)).toEqual([[0, 3], [3, 6], [6, 10]]);
    expect(relayTurnMs(60 * MIN)).toBe(15 * MIN);
    expect(relayTurnMs(14 * 24 * 60 * MIN)).toBe(4 * 60 * MIN);
    expect(relayTurnMs(MIN)).toBe(10 * MIN);
  });
  it('a leg cannot outlast its own questions, and the window close forfeits what is left', () => {
    let a = newTeamAttempt('team', 'relay', 0, [0, 1, 2, 3, 4, 5], ['a', 'b', 'c'], 0, 1);
    a = relayStartLeg(a, 'a', 1000, qMs, closes, turn).attempt;
    expect(a.servedAt[0]).toBe(1000);
    // a answers once then vanishes: the leg ends when its last question timed out, not when someone looks.
    a = teamAnswer(a, 'a', 0, 1, 1, 2000, qMs, closes, turn).attempt;
    a = relayCatchUp(a, 10 * MIN, qMs, closes, turn);
    expect(a.legs![0].endedAt).toBe(2000 + qMs);
    expect(a.legs![1].openedAt).toBe(2000 + qMs);
    // b starts, then nobody touches it: the unserved question is never served after the hard end.
    a = relayStartLeg(a, 'b', 2000 + qMs + 1, qMs, closes, turn).attempt;
    const started = 2000 + qMs + 1;
    a = { ...a, servedAt: a.servedAt.map((v, i) => (i === 2 ? 0 : v)) };
    a = relayCatchUp(a, started + 2 * qMs + 1500, qMs, closes, turn);
    expect(a.legs![1].endedAt).toBe(started + 2 * qMs + 1500);
    expect(a.pos).toBe(4);
    a = relayCatchUp(a, closes + 1, qMs, closes, turn);
    expect(a.done).toBe(true);
    expect([a.legs![1].forfeited, a.legs![2].forfeited]).toEqual([false, true]);
  });
  it('refuses another starter’s leg and an unopened turn', () => {
    const a = newTeamAttempt('team', 'relay', 0, [0, 1, 2], ['a', 'b', 'c'], 0, 1);
    expect(relayStartLeg(a, 'b', 1, qMs, closes, turn).refused).toBe('not_your_turn');
    expect(teamAnswer(a, 'b', 0, 0, 0, 1, qMs, closes, turn).refused).toBe('not_your_turn');
  });
});

describe('panel model', () => {
  const names = (u: string) => u.toUpperCase();
  const base: TeamState = {
    mode: 'shared', policy: 'shared-authority-v1', entryId: 'team', label: 'Étoiles', starters: ['a', 'b', 'c'],
    captainUid: 'a', started: true, holderUid: 'a', deputyUid: 'b', authorityVersion: 1, claimableAt: 20_000,
    slots: ['a', 'b', 'c'], dutiesConfirmed: [], rolesVersion: 0, serverNow: 0,
    live: { index: 0, phase: 'question', closesAt: 10_000, owner: null, answer: null },
  };
  it('offers the answer only to the holder and a claim only when the server allows it', () => {
    expect(teamPanelModel(base, 'a', 1000, names, 5)).toMatchObject({ canAnswer: true, canClaim: false, canTransfer: true });
    const mate = teamPanelModel(base, 'b', 1000, names, 5);
    expect(mate).toMatchObject({ canAnswer: false, canClaim: false, claimIn: 19_000, canTransfer: false });
    expect(teamPanelModel(base, 'b', 20_000, names, 5).canClaim).toBe(true);
    const sent = teamPanelModel({ ...base, live: { ...base.live!, answer: { uid: 'a', choice: 2 } } }, 'a', 2000, names, 5);
    expect(sent).toMatchObject({ canAnswer: false, teamChoice: 2 });
  });
  it('relay shows whose turn it is and never offers another player’s turn', () => {
    const relay: TeamState = { ...base, mode: 'relay', claimableAt: null, live: { ...base.live!, index: 1, owner: 'b' } };
    expect(teamPanelModel(relay, 'a', 1000, names, 6)).toMatchObject({ canAnswer: false, status: ['Tour de B.', 'Tou B.'] });
    expect(teamPanelModel(relay, 'b', 1000, names, 6).canAnswer).toBe(true);
    expect(relayLiveTurns(['a', 'b', 'c'], 'b', 6)).toEqual([2, 5]);
  });
  it('has bilingual rules and a practice script for every mode, with no pause control', () => {
    for (const mode of ['shared', 'relay'] as const) {
      for (const copy of [...modeRules(mode, 'live'), ...modeRules(mode, 'window'), ...practiceScript(mode)])
        expect(copy[0]).not.toBe(copy[1]);
      expect(JSON.stringify(modeRules(mode, 'window'))).not.toMatch(/pause/i);
    }
  });
});
