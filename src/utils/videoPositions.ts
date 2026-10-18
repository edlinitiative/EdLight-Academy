/**
 * Video resume positions ("reprendre la vidéo"), kept in localStorage — one
 * bucket PER STUDENT, not per device.
 *
 * The store used to be one device-wide map (`edlight-video-positions`), so on
 * a shared family or school computer the Home card could promise student B
 * "Reprend à 4:12" from student A's viewing. Now each signed-in uid has its own
 * bucket and signed-out (free-preview) viewers share a guest bucket:
 *
 *   edlight-video-positions:u:<uid>   { "<courseId>:<lessonId>": { t, d } }
 *   edlight-video-positions:guest
 *
 * The legacy device-wide map is moved ONCE into the first signed-in uid that
 * reads or writes positions on this device (it was most likely theirs), then
 * deleted — so no second account can inherit it.
 *
 * CourseDetail writes and reads through here; Home's continuation
 * (components/journey/home/homeJourney.ts) reads the same bucket.
 * Everything is best-effort: storage can be unavailable or full.
 */

export const LEGACY_VIDEO_POS_KEY = 'edlight-video-positions';
const MAX_ENTRIES = 200;

type Rec = { t: number; d?: number };
type Positions = Record<string, Rec>;

export function videoPositionsKey(uid?: string | null): string {
  return uid ? `${LEGACY_VIDEO_POS_KEY}:u:${uid}` : `${LEGACY_VIDEO_POS_KEY}:guest`;
}

function parse(raw: string | null): Positions {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Move the legacy device-wide map into `uid`'s bucket (its own entries win). */
function migrateLegacy(uid: string): void {
  try {
    const legacy = localStorage.getItem(LEGACY_VIDEO_POS_KEY);
    if (legacy == null) return;
    const key = videoPositionsKey(uid);
    const merged = { ...parse(legacy), ...parse(localStorage.getItem(key)) };
    localStorage.setItem(key, JSON.stringify(merged));
    localStorage.removeItem(LEGACY_VIDEO_POS_KEY);
  } catch {
    /* storage unavailable — try again next time */
  }
}

export function readVideoPositions(uid?: string | null): Positions {
  try {
    if (uid) migrateLegacy(uid);
    return parse(localStorage.getItem(videoPositionsKey(uid)));
  } catch {
    return {};
  }
}

function write(uid: string | null | undefined, all: Positions): void {
  const keys = Object.keys(all);
  // Bound the map so it can never grow without limit.
  for (let i = 0; i < keys.length - MAX_ENTRIES; i += 1) delete all[keys[i]];
  localStorage.setItem(videoPositionsKey(uid), JSON.stringify(all));
}

/** Persist one lesson's playback second; near the start / end drops it. */
export function saveVideoPosition(uid: string | null | undefined, key: string, t: number, d?: number): void {
  if (!key || !Number.isFinite(t)) return;
  try {
    const all = readVideoPositions(uid);
    if (t < 5 || (d && t > d * 0.95)) {
      delete all[key];
    } else {
      all[key] = { t: Math.floor(t), d: d ? Math.floor(d) : 0 };
    }
    write(uid, all);
  } catch {
    /* storage unavailable / quota exceeded — resume is best-effort */
  }
}

export function clearVideoPosition(uid: string | null | undefined, key: string): void {
  if (!key) return;
  try {
    const all = readVideoPositions(uid);
    if (!(key in all)) return;
    delete all[key];
    write(uid, all);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * The second to resume `key` ("courseId:lessonId") at, or 0 when there is no
 * meaningful position (under 15 s watched, or essentially finished).
 */
export function resumeSecondsFor(uid: string | null | undefined, key: string): number {
  if (!key) return 0;
  const rec = readVideoPositions(uid)[key];
  if (!rec || !Number.isFinite(rec.t) || rec.t < 15) return 0;
  if (rec.d && rec.t > rec.d * 0.95) return 0;
  return Math.floor(rec.t);
}
