import { ArenaSoundEngine, STORAGE_KEY, ONE_SHOT_CUES } from '../arenaSound';
import { MockAudioContext, memoryStorage } from './mockAudio';

const make = (init: Record<string, string> = {}) => {
  const storage = memoryStorage(init);
  const factory = jest.fn(() => new MockAudioContext() as unknown as AudioContext);
  const engine = new ArenaSoundEngine({ storage, createContext: factory });
  return { engine, storage, factory };
};

describe('ArenaSoundEngine', () => {
  it('is silent and creates no AudioContext until enable()', () => {
    const { engine, factory } = make();
    expect(engine.getState().enabled).toBe(false);
    const r = engine.play('correct');
    expect(r.played).toBe(false);
    expect(r.reason).toBe('off');
    expect(factory).not.toHaveBeenCalled();
  });

  it('enable() opens the context, persists, and every cue schedules without throwing', () => {
    const { engine, storage, factory } = make();
    expect(engine.enable()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.map.get(STORAGE_KEY)).enabled).toBe(true);
    const ctx = MockAudioContext.instances[MockAudioContext.instances.length - 1];
    for (const cue of ONE_SHOT_CUES) {
      ctx.currentTime += 10; // let previous cues finish
      const r = engine.play(cue);
      expect(r.played).toBe(true);
      expect(r.duration).toBeGreaterThan(0.03);
      expect(r.nodes).toBeGreaterThan(0);
    }
  });

  it('cue durations are in their target ranges', () => {
    const { engine } = make();
    engine.enable();
    const ctx = MockAudioContext.instances[MockAudioContext.instances.length - 1];
    const d = (cue: any) => { ctx.currentTime += 10; return engine.play(cue).duration; };
    expect(d('press')).toBeLessThanOrEqual(0.09);
    expect(d('select')).toBeLessThanOrEqual(0.16);
    expect(d('submitted')).toBeLessThanOrEqual(0.2);
    expect(d('correct')).toBeLessThanOrEqual(0.4);
    expect(d('incorrect')).toBeLessThanOrEqual(0.33);
    expect(d('victory')).toBeGreaterThanOrEqual(1.5);
    expect(d('victory')).toBeLessThanOrEqual(2.6);
    const champ = d('championship');
    expect(champ).toBeGreaterThanOrEqual(4);
    expect(champ).toBeLessThanOrEqual(6);
    engine.setReducedSound(true);
    expect(d('championship')).toBeLessThan(champ * 0.65);
  });

  it('muted: nothing is scheduled; the choice persists', () => {
    const { engine, storage } = make();
    engine.enable();
    engine.setMuted(true);
    expect(engine.play('victory')).toMatchObject({ played: false, reason: 'muted' });
    expect(JSON.parse(storage.map.get(STORAGE_KEY)).muted).toBe(true);
  });

  it('applies the ducking/priority policy', () => {
    const { engine } = make();
    engine.enable();
    expect(engine.play('victory').played).toBe(true);
    expect(engine.play('press')).toMatchObject({ played: false, reason: 'ceremony' });
    expect(engine.play('correct').played).toBe(true);
    expect(engine.play('correct').played).toBe(true);
    expect(engine.play('correct')).toMatchObject({ played: false, reason: 'same-cue-limit' });
  });

  it('countdown onTick fires 3,2,1,0 even with sound off', () => {
    jest.useFakeTimers();
    const { engine } = make();
    const ticks: number[] = [];
    engine.play('countdown', { onTick: (n) => ticks.push(n), interval: 0.5 });
    jest.advanceTimersByTime(1600);
    expect(ticks).toEqual([3, 2, 1, 0]);
    jest.useRealTimers();
  });

  it('countdown cancel() stops pending ticks', () => {
    jest.useFakeTimers();
    const { engine } = make();
    engine.enable();
    const ticks: number[] = [];
    const r = engine.play('countdown', { onTick: (n) => ticks.push(n) });
    jest.advanceTimersByTime(1100);
    r.cancel();
    jest.advanceTimersByTime(5000);
    expect(ticks).toEqual([3, 2]);
    jest.useRealTimers();
  });

  it('remembers an earlier opt-in but still waits for a gesture', () => {
    const { engine, factory } = make({ [STORAGE_KEY]: JSON.stringify({ enabled: true, volume: 0.4 }) });
    expect(engine.getState()).toMatchObject({ enabled: true, unlocked: false, volume: 0.4 });
    expect(engine.play('press').reason).toBe('off');
    expect(factory).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(engine.getState().unlocked).toBe(true);
    engine.dispose();
  });

  it('crowd bed starts only on request and is never automatic', () => {
    const { engine } = make();
    expect(engine.startCrowd()).toBe(false);
    engine.enable();
    expect(engine.getState().crowdOn).toBe(false);
    expect(engine.play('crowdBed').played).toBe(true);
    expect(engine.getState().crowdOn).toBe(true);
    engine.stopCrowd();
    expect(engine.getState().crowdOn).toBe(false);
  });

  it('works when storage throws', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    const engine = new ArenaSoundEngine({ storage: bad, createContext: () => new MockAudioContext() as any });
    expect(() => { engine.enable(); engine.setVolume(0.2); engine.setMuted(false); }).not.toThrow();
    expect(engine.getState().volume).toBe(0.2);
    expect(engine.play('select').played).toBe(true);
  });
});
