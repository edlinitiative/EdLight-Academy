import { createCompletionController, type SaveFn } from '../completionController';

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));

function setup(save: SaveFn) {
  const track = jest.fn();
  const onConfirmed = jest.fn();
  const c = createCompletionController({ save, track, onConfirmed, slowAfterMs: 8000 });
  c.setScope('u1', 'chem');
  return { c, track, onConfirmed };
}

describe('completionController (LJ-05)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('saving → confirmed only on the server ack', async () => {
    const d = deferred<'saved'>();
    const { c, track, onConfirmed } = setup(() => d.promise);
    const run = c.complete('L1');
    expect(c.entryFor('L1').status).toBe('saving');
    expect(onConfirmed).not.toHaveBeenCalled();
    d.resolve('saved');
    await run;
    expect(c.entryFor('L1')).toEqual({ status: 'confirmed', outcome: 'saved' });
    expect(c.freshId()).toBe('L1');
    expect(onConfirmed).toHaveBeenCalledWith('L1', 'saved');
    expect(track).toHaveBeenCalledWith('lesson_completion_confirmed', expect.objectContaining({ lesson_id: 'L1', outcome: 'saved' }));
  });

  it('becomes "slow" after 8s without claiming success', async () => {
    const d = deferred<'saved'>();
    const { c } = setup(() => d.promise);
    c.complete('L1');
    jest.advanceTimersByTime(8001);
    expect(c.entryFor('L1').status).toBe('slow');
  });

  it('no double submit: a second tap while pending is a no-op; confirmed is never rewritten', async () => {
    const d = deferred<'saved'>();
    const save = jest.fn(() => d.promise);
    const { c } = setup(save);
    const a = c.complete('L1');
    c.complete('L1');
    c.complete('L1');
    expect(save).toHaveBeenCalledTimes(1);
    d.resolve('saved');
    await a;
    await c.complete('L1');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('offline → queued (pending, no celebration), back online → saving', async () => {
    const d = deferred<'saved'>();
    const { c, onConfirmed } = setup(() => d.promise);
    c.setOffline(true);
    c.complete('L1');
    expect(c.entryFor('L1').status).toBe('queued');
    c.setOffline(false);
    expect(c.entryFor('L1').status).toBe('saving');
    c.setOffline(true);
    expect(c.entryFor('L1').status).toBe('queued');
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('failure → failed with reason, then the same action retries', async () => {
    let attempt = 0;
    const save: SaveFn = jest.fn(async () => { attempt += 1; if (attempt === 1) throw new Error('denied'); return 'saved' as const; });
    const { c, track } = setup(save);
    await c.complete('L1');
    expect(c.entryFor('L1')).toEqual({ status: 'failed', reason: 'error' });
    expect(track).toHaveBeenCalledWith('learning_save_failed', expect.objectContaining({ reason: 'error' }));
    await c.complete('L1');
    expect(c.entryFor('L1').status).toBe('confirmed');
  });

  it('a failure while offline is reported as offline', async () => {
    const { c } = setup(async () => { throw new Error('x'); });
    c.setOffline(true);
    await c.complete('L1');
    expect(c.entryFor('L1')).toEqual({ status: 'failed', reason: 'offline' });
  });

  it('state is per lesson and dropped when the account/course changes mid-save', async () => {
    const d = deferred<'saved'>();
    const { c, onConfirmed } = setup(() => d.promise);
    const run = c.complete('L1');
    expect(c.entryFor('L2').status).toBe('idle');
    c.setScope('u2', 'chem');
    d.resolve('saved');
    await run;
    await flush();
    expect(c.entryFor('L1').status).toBe('idle');
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('guest saves report a local outcome', async () => {
    const c = createCompletionController({ save: async (uid) => (uid ? 'saved' : 'local') });
    c.setScope(null, 'chem');
    await c.complete('L1');
    expect(c.entryFor('L1')).toEqual({ status: 'confirmed', outcome: 'local' });
  });
});
