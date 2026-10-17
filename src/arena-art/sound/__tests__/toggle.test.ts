import { ArenaSoundEngine, STORAGE_KEY, loadSettings } from '../arenaSound';
import { pressSoundToggle, soundToggleView } from '../toggle';
import { MockAudioContext, memoryStorage } from './mockAudio';

const make = (storage = memoryStorage()) => ({
  storage,
  engine: new ArenaSoundEngine({ storage, createContext: () => new MockAudioContext() as unknown as AudioContext }),
});

describe('the student sound switch (audit X2)', () => {
  it('maps the persisted settings to on/off and the next action', () => {
    expect(soundToggleView({ enabled: false, muted: false })).toEqual({ on: false, next: 'enable' });
    expect(soundToggleView({ enabled: true, muted: false })).toEqual({ on: true, next: 'mute' });
    expect(soundToggleView({ enabled: true, muted: true })).toEqual({ on: false, next: 'unmute' });
    // A muted-but-never-enabled store is still "off, needs the opt-in".
    expect(soundToggleView({ enabled: false, muted: true })).toEqual({ on: false, next: 'enable' });
  });

  it('is off by default and silent until pressed', () => {
    const { engine } = make();
    expect(soundToggleView(engine.getState()).on).toBe(false);
    expect(engine.play('correct').played).toBe(false);
  });

  it('press → on (enabled, persisted); press → muted (persisted); a new visit keeps the mute', () => {
    const { engine, storage } = make();
    expect(pressSoundToggle(engine)).toBe('enable');
    expect(engine.getState().enabled).toBe(true);
    expect(engine.play('correct').played).toBe(true);
    expect(JSON.parse(storage.map.get(STORAGE_KEY)).enabled).toBe(true);

    expect(pressSoundToggle(engine)).toBe('mute');
    expect(soundToggleView(engine.getState()).on).toBe(false);
    expect(engine.play('correct').played).toBe(false);
    expect(loadSettings(storage)).toMatchObject({ enabled: true, muted: true });

    // Next visit, same viewer: still muted, and silent.
    const again = make(storage).engine;
    expect(soundToggleView(again.getState())).toEqual({ on: false, next: 'unmute' });
    expect(pressSoundToggle(again)).toBe('unmute');
    expect(loadSettings(storage)).toMatchObject({ enabled: true, muted: false });
    expect(again.getState().unlocked).toBe(true);
  });

  it('a different viewer (fresh storage) starts silent', () => {
    make().engine.enable();
    expect(soundToggleView(make().engine.getState()).on).toBe(false);
  });
});
