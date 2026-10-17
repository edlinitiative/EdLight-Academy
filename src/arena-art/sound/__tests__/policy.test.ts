import {
  decide, ceremonyUntil, CUES, ONE_SHOT_CUES, MAX_VOICES, ActiveVoice,
  parseSettings, serializeSettings, loadSettings, saveSettings, DEFAULT_SETTINGS, STORAGE_KEY,
  clampVolume, volumeToGain,
} from '../policy';
import { memoryStorage } from './mockAudio';

const v = (cue: any, start: number, end: number): ActiveVoice => ({ cue, start, end });

describe('decide', () => {
  it('allows anything when nothing is playing', () => {
    for (const c of ONE_SHOT_CUES) expect(decide(c, [], 0)).toEqual({ allow: true });
  });
  it('never stacks the same cue more than twice', () => {
    const vs = [v('correct', 0, 1), v('correct', 0.1, 1)];
    expect(decide('correct', vs, 0.5)).toEqual({ allow: false, reason: 'same-cue-limit' });
    expect(decide('correct', vs, 1.01)).toEqual({ allow: true });
    expect(decide('correct', vs.slice(1), 0.5)).toEqual({ allow: true });
  });
  it('drops low-priority UI during a ceremony, but keeps feedback', () => {
    const vs = [v('victory', 0, 2.4)];
    expect(decide('press', vs, 1)).toEqual({ allow: false, reason: 'ceremony' });
    expect(decide('select', vs, 1)).toEqual({ allow: false, reason: 'ceremony' });
    expect(decide('correct', vs, 1)).toEqual({ allow: true });
    expect(decide('press', vs, 2.5)).toEqual({ allow: true });
  });
  it('a victory never talks over the championship', () => {
    const vs = [v('championship', 0, 5)];
    expect(decide('victory', vs, 1)).toEqual({ allow: false, reason: 'outranked' });
    expect(decide('promotion', vs, 1)).toEqual({ allow: false, reason: 'outranked' });
    expect(decide('championship', [v('victory', 0, 2)], 1)).toEqual({ allow: true });
  });
  it('caps simultaneous voices except for big moments', () => {
    const cues = ['correct', 'incorrect', 'reveal', 'scoreUp', 'submitted', 'countdown'];
    const vs = cues.slice(0, MAX_VOICES).map((c) => v(c, 0, 1));
    expect(decide('select', vs, 0.5)).toEqual({ allow: false, reason: 'voice-cap' });
    expect(decide('promotion', vs, 0.5)).toEqual({ allow: true });
  });
  it('reports how long the crowd should stay ducked', () => {
    expect(ceremonyUntil([v('victory', 0, 2), v('correct', 0, 3)], 1)).toBe(2);
    expect(ceremonyUntil([v('correct', 0, 3)], 1)).toBe(0);
  });
  it('only victory and championship are ceremonies; championship ranks highest', () => {
    expect(Object.entries(CUES).filter(([, m]) => m.ceremony).map(([k]) => k).sort()).toEqual(['championship', 'victory']);
    const top = Math.max(...Object.values(CUES).map((m) => m.priority));
    expect(CUES.championship.priority).toBe(top);
  });
});

describe('settings', () => {
  it('defaults to OFF', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
  });
  it('survives garbage field by field', () => {
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"enabled":"yes","volume":"0.4","muted":true}')).toEqual({ ...DEFAULT_SETTINGS, enabled: false, volume: 0.4, muted: true });
    expect(parseSettings('{"volume":7}').volume).toBe(1);
    expect(parseSettings('{"volume":null}').volume).toBe(DEFAULT_SETTINGS.volume);
  });
  it('round-trips', () => {
    const s = { enabled: true, muted: true, volume: 0.25, reducedSound: true };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });
  it('load/save never throw when storage throws', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ ...DEFAULT_SETTINGS, enabled: true }, bad)).toBe(false);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('saves under the versioned key', () => {
    const st = memoryStorage();
    expect(saveSettings({ ...DEFAULT_SETTINGS, volume: 0.3 }, st)).toBe(true);
    expect(JSON.parse(st.map.get(STORAGE_KEY)).volume).toBe(0.3);
  });
  it('volume helpers clamp and curve', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume('abc')).toBe(DEFAULT_SETTINGS.volume);
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9);
  });
});
