/**
 * Lesson video resume positions on the phone — the AsyncStorage port of the
 * web's src/utils/videoPositions.ts (same rules, CON-02).
 *
 *   • one bucket per student (`…:u:<uid>`) or for the guest, never shared;
 *   • entries keyed "<courseId>:<lessonId>" → { t, d } seconds, capped;
 *   • nothing under 5 s is stored, and a position past 95% is forgotten
 *     (the video is finished — reopening starts it again);
 *   • a resume is offered only after 15 s of watching.
 *
 * Positions come from the YouTube player bridge in LessonPlayer (the iframe
 * widget protocol, enablejsapi=1) and are restored with the embed's `start=`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface VideoPosition { t: number; d?: number }
type Positions = Record<string, VideoPosition>;

const PREFIX = 'edlight:video-positions';
const MAX_ENTRIES = 200;

export const videoPositionsKey = (uid?: string | null) => (uid ? `${PREFIX}:u:${uid}` : `${PREFIX}:guest`);

/** Pure: the second to resume at, or 0 (same thresholds as the web). */
export function resumeSecondsFrom(rec: VideoPosition | null | undefined): number {
  if (!rec || !Number.isFinite(rec.t) || rec.t < 15) return 0;
  if (rec.d && rec.t > rec.d * 0.95) return 0;
  return Math.floor(rec.t);
}

/** Pure: the next bucket after saving `t` (or forgetting it), bounded. */
export function nextPositions(prev: Positions, key: string, t: number, d?: number): Positions {
  const next: Positions = { ...prev };
  delete next[key];
  const finished = d && d > 0 && t > d * 0.95;
  if (Number.isFinite(t) && t >= 5 && !finished) {
    next[key] = d && Number.isFinite(d) ? { t: Math.round(t), d: Math.round(d) } : { t: Math.round(t) };
  }
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete next[k];
  return next;
}

async function read(uid?: string | null): Promise<Positions> {
  try {
    const raw = await AsyncStorage.getItem(videoPositionsKey(uid));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function resumeSecondsFor(uid: string | null | undefined, key: string): Promise<number> {
  if (!key) return 0;
  return resumeSecondsFrom((await read(uid))[key]);
}

// Serialize writes per bucket so two quick saves never interleave.
let chain: Promise<unknown> = Promise.resolve();
export function saveVideoPosition(uid: string | null | undefined, key: string, t: number, d?: number): Promise<void> {
  if (!key) return Promise.resolve();
  const run = chain.then(async () => {
    const next = nextPositions(await read(uid), key, t, d);
    await AsyncStorage.setItem(videoPositionsKey(uid), JSON.stringify(next));
  }).catch(() => undefined);
  chain = run;
  return run as Promise<void>;
}

export function clearVideoPosition(uid: string | null | undefined, key: string): Promise<void> {
  return saveVideoPosition(uid, key, 0);
}

/** "2:05" */
export function formatResume(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
