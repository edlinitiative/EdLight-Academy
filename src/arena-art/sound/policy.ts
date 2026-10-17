/**
 * Arène sound — pure policy: cue catalogue, priorities/ducking decisions and
 * settings persistence parsing. No Web Audio, no DOM: unit-tested directly.
 */

export type CueName =
  | 'press' | 'select' | 'submitted'
  | 'correct' | 'incorrect'
  | 'countdown' | 'reveal' | 'scoreUp'
  | 'promotion' | 'victory' | 'championship'
  | 'crowdBed';

export type Category = 'ui' | 'feedback' | 'music';

export interface CueMeta {
  category: Category;
  /** 0 (trivial) … 6 (the biggest moment). */
  priority: number;
  /** A ceremony ducks the crowd and silences low-priority UI while it plays. */
  ceremony?: boolean;
  /** Looping / ambient — started and stopped, never "played" as a one-shot. */
  ambient?: boolean;
}

export const CUES: Record<CueName, CueMeta> = {
  press: { category: 'ui', priority: 0 },
  select: { category: 'ui', priority: 1 },
  submitted: { category: 'ui', priority: 2 },
  correct: { category: 'feedback', priority: 3 },
  incorrect: { category: 'feedback', priority: 3 },
  countdown: { category: 'ui', priority: 3 },
  reveal: { category: 'feedback', priority: 3 },
  scoreUp: { category: 'feedback', priority: 2 },
  promotion: { category: 'music', priority: 4 },
  victory: { category: 'music', priority: 5, ceremony: true },
  championship: { category: 'music', priority: 6, ceremony: true },
  crowdBed: { category: 'music', priority: 0, ambient: true },
};

export const CUE_NAMES = Object.keys(CUES) as CueName[];
export const ONE_SHOT_CUES = CUE_NAMES.filter((c) => !CUES[c].ambient);

/** Never more than this many copies of the same cue sounding at once. */
export const MAX_SAME_CUE = 2;
/** Hard cap on simultaneous one-shot cues (cheap on low-end phones). */
export const MAX_VOICES = 6;
/** While a ceremony plays, cues below this priority are dropped. */
export const CEREMONY_MIN_PRIORITY = 2;
/** Crowd bed level multiplier while a ceremony plays. */
export const CROWD_DUCK_LEVEL = 0.15;

export interface ActiveVoice {
  cue: CueName;
  start: number;
  end: number;
}

export type Decision =
  | { allow: true }
  | { allow: false; reason: 'same-cue-limit' | 'ceremony' | 'voice-cap' | 'outranked' };

/** Voices still sounding at `now`. */
export function liveVoices(voices: readonly ActiveVoice[], now: number): ActiveVoice[] {
  return voices.filter((v) => v.end > now);
}

/**
 * Should `cue` start now, given what is already sounding?
 * Rules, in order:
 *  1. at most MAX_SAME_CUE copies of one cue;
 *  2. during a ceremony, drop cues below CEREMONY_MIN_PRIORITY, and drop any
 *     music cue that ranks below the ceremony in progress (a `victory` never
 *     talks over the `championship`);
 *  3. above MAX_VOICES, only priority ≥ 4 cues may still start.
 */
export function decide(cue: CueName, voices: readonly ActiveVoice[], now: number): Decision {
  const meta = CUES[cue];
  const live = liveVoices(voices, now);
  if (live.filter((v) => v.cue === cue).length >= MAX_SAME_CUE) return { allow: false, reason: 'same-cue-limit' };
  const ceremonies = live.filter((v) => CUES[v.cue].ceremony);
  if (ceremonies.length) {
    const top = Math.max(...ceremonies.map((v) => CUES[v.cue].priority));
    if (meta.priority < CEREMONY_MIN_PRIORITY) return { allow: false, reason: 'ceremony' };
    if (meta.category === 'music' && meta.priority < top) return { allow: false, reason: 'outranked' };
  }
  if (live.length >= MAX_VOICES && meta.priority < 4) return { allow: false, reason: 'voice-cap' };
  return { allow: true };
}

/** End time of the latest ceremony still sounding (0 if none) — for ducking. */
export function ceremonyUntil(voices: readonly ActiveVoice[], now: number): number {
  return liveVoices(voices, now)
    .filter((v) => CUES[v.cue].ceremony)
    .reduce((mx, v) => Math.max(mx, v.end), 0);
}

/* ------------------------------------------------------------------ */
/* Settings persistence                                                */
/* ------------------------------------------------------------------ */

export interface SoundSettings {
  /** The listener explicitly opted in. Default false: the Arène is silent. */
  enabled: boolean;
  muted: boolean;
  /** 0–1. */
  volume: number;
  /** Shorter, tail-less versions of long cues. */
  reducedSound: boolean;
}

export const DEFAULT_SETTINGS: Readonly<SoundSettings> = Object.freeze({
  enabled: false,
  muted: false,
  volume: 0.7,
  reducedSound: false,
});

export const STORAGE_KEY = 'edlight.arena.sound.v1';

export function clampVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.volume;
  return Math.min(1, Math.max(0, n));
}

/** Parse whatever was stored; anything malformed falls back to defaults field by field. */
export function parseSettings(raw: string | null | undefined): SoundSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ...DEFAULT_SETTINGS };
  return {
    enabled: obj.enabled === true,
    muted: obj.muted === true,
    volume: 'volume' in obj ? clampVolume(obj.volume) : DEFAULT_SETTINGS.volume,
    reducedSound: obj.reducedSound === true,
  };
}

export function serializeSettings(s: SoundSettings): string {
  return JSON.stringify({ enabled: !!s.enabled, muted: !!s.muted, volume: clampVolume(s.volume), reducedSound: !!s.reducedSound });
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Read settings; never throws (private mode, blocked storage, SSR). */
export function loadSettings(storage?: StorageLike | null): SoundSettings {
  try {
    const s = storage === undefined ? (typeof window !== 'undefined' ? window.localStorage : null) : storage;
    return parseSettings(s ? s.getItem(STORAGE_KEY) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Write settings; returns false (never throws) if storage is unavailable. */
export function saveSettings(settings: SoundSettings, storage?: StorageLike | null): boolean {
  try {
    const s = storage === undefined ? (typeof window !== 'undefined' ? window.localStorage : null) : storage;
    if (!s) return false;
    s.setItem(STORAGE_KEY, serializeSettings(settings));
    return true;
  } catch {
    return false;
  }
}

/** Perceptual volume curve: slider 0–1 → linear gain (≈ −40 dB … 0 dB). */
export function volumeToGain(v: number): number {
  const x = clampVolume(v);
  return x <= 0 ? 0 : x * x;
}
