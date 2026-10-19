import {
  examDraftKey,
  readLocalExamDraft,
  pickResumeDraft,
  draftPosition,
  replaceFieldsOptions,
  settleWithin,
  isOtherAccountDraft,
} from '../../../shared/examDraft';

describe('readLocalExamDraft (account binding of the device mirror)', () => {
  const mine = JSON.stringify({ uid: 'A', status: 'in_progress', answers: { 0: 'x' }, updated_at_ms: 5 });

  it('returns the mirror for its own account', () => {
    expect(readLocalExamDraft(mine, 'A')?.answers).toEqual({ 0: 'x' });
  });

  it("never hands one student's answers to another account on a shared device", () => {
    expect(readLocalExamDraft(mine, 'B')).toBeNull();
  });

  it('ignores legacy mirrors without an owner, signed-out readers, corrupt JSON and finished drafts', () => {
    expect(readLocalExamDraft(JSON.stringify({ status: 'in_progress', answers: {} }), 'A')).toBeNull();
    expect(readLocalExamDraft(mine, null)).toBeNull();
    expect(readLocalExamDraft('{nope', 'A')).toBeNull();
    expect(readLocalExamDraft(JSON.stringify({ uid: 'A', status: 'submitted' }), 'A')).toBeNull();
  });

  it('keys by exam id', () => {
    expect(examDraftKey('bac-2021-math')).toBe('edlight-exam-draft-bac-2021-math');
  });
});

describe('pickResumeDraft', () => {
  const remote = { status: 'in_progress', updated_at_ms: 10, answers: { 0: 'r' } };
  const local = { status: 'in_progress', updated_at_ms: 20, answers: { 0: 'l' } };

  it('prefers the newer copy', () => {
    expect(pickResumeDraft(remote, local)?.answers).toEqual({ 0: 'l' });
    expect(pickResumeDraft({ ...remote, updated_at_ms: 30 }, local)?.answers).toEqual({ 0: 'r' });
  });

  it('does not resume a submitted attempt', () => {
    expect(pickResumeDraft({ status: 'submitted', updated_at_ms: 30 }, local)).toBeNull();
    expect(pickResumeDraft({ status: 'submitted', updated_at_ms: 1 }, null)).toBeNull();
  });

  it('resumes a newer local mirror over a submitted remote (submission never reached the server)', () => {
    expect(pickResumeDraft({ status: 'submitted', updated_at_ms: 1 }, local)).toBe(local);
  });

  it('handles nothing', () => {
    expect(pickResumeDraft(null, null)).toBeNull();
  });
});

describe('draftPosition', () => {
  it('reads the web field and the mobile field', () => {
    expect(draftPosition({ currentQ: 4 })).toBe(4);
    expect(draftPosition({ currentIdx: 3 })).toBe(3);
    expect(draftPosition({ currentQ: 0, currentIdx: 7 })).toBe(0);
    expect(draftPosition({})).toBeNull();
    expect(draftPosition(null)).toBeNull();
  });
});

describe('isOtherAccountDraft', () => {
  it("hides another account's mirror from listings, keeps own and legacy ones", () => {
    expect(isOtherAccountDraft({ uid: 'A' }, 'B')).toBe(true);
    expect(isOtherAccountDraft({ uid: 'A' }, null)).toBe(true);
    expect(isOtherAccountDraft({ uid: 'A' }, 'A')).toBe(false);
    expect(isOtherAccountDraft({}, 'B')).toBe(false);
  });
});

describe('replaceFieldsOptions', () => {
  it('lists every top-level field so maps are replaced, not deep-merged', () => {
    expect(replaceFieldsOptions({ answers: {}, status: 'in_progress' })).toEqual({ mergeFields: ['answers', 'status'] });
  });
});

describe('settleWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('confirms a write that resolves in time', async () => {
    const p = settleWithin(Promise.resolve('ok'), 1000);
    await expect(p).resolves.toEqual({ status: 'confirmed', value: 'ok' });
  });

  it('reports failure', async () => {
    const err = new Error('permission-denied');
    await expect(settleWithin(Promise.reject(err), 1000)).resolves.toEqual({ status: 'failed', error: err });
  });

  it('reports a never-settling (offline) write as pending instead of hanging', async () => {
    const p = settleWithin(new Promise(() => {}), 1000);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toEqual({ status: 'pending' });
  });
});
