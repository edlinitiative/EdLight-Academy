/**
 * Arène sound engine — the "EdLight Arène" signature palette, synthesised at
 * runtime with the Web Audio API. No audio files, no samples.
 *
 * Contract (docs/design/2026-10-17-arena-visual-motion-broadcast-brief.md):
 *  - Silent by default. Nothing is created or played until `enable()` runs
 *    from a user gesture; the choice, mute and volume persist.
 *  - The experience never depends on sound: every cue's meaning must also be
 *    shown on screen. `countdown`'s onTick fires even when sound is off, so
 *    visuals can use one code path.
 *  - Priorities: ceremonies (victory, championship) duck the crowd and drop
 *    low-priority UI cues; the same cue never stacks more than twice; total
 *    simultaneous cues are capped.
 */
import {
  CueName, Category, CUES, ActiveVoice, decide, ceremonyUntil, liveVoices,
  SoundSettings, loadSettings, saveSettings, clampVolume, volumeToGain,
  CROWD_DUCK_LEVEL, StorageLike,
} from './policy';
import { Bus, makeNoise, makeImpulse } from './voices';
import * as C from './cues';

export * from './policy';
export { MOTIF, KOMPA_BPM, KATA_PATTERN, noteToFreq, midiToFreq, scheduleMotif } from './theory';
export { analyze, encodeWav } from './wav';

export interface PlayOptions {
  /** countdown: called with 3, 2, 1, then 0 ("go"), in sync with the audio. */
  onTick?: (n: number) => void;
  /** countdown: seconds between ticks (default 1). */
  interval?: number;
  /** scoreUp: number of counting ticks. */
  steps?: number;
}

export interface PlayResult {
  cue: CueName;
  played: boolean;
  /** Why it did not sound: 'off' (not enabled/unlocked), 'muted', or a policy reason. */
  reason?: string;
  /** Audio-clock start (s), when played. */
  start?: number;
  /** Seconds from start until the sound (incl. tail) ends. */
  duration?: number;
  /** Web Audio nodes this cue created (debug instrumentation). */
  nodes?: number;
  /** Cancel pending onTick callbacks (and nothing else). */
  cancel: () => void;
}

export interface DebugEntry extends Omit<PlayResult, 'cancel'> {
  at: number;
}

type CueFn = (bus: Bus, t: number, opts: PlayOptions) => number;

const CUE_FNS: Record<Exclude<CueName, 'crowdBed'>, CueFn> = {
  press: C.press,
  select: C.select,
  submitted: C.submitted,
  correct: C.correct,
  incorrect: C.incorrect,
  countdown: (b, t, o) => C.countdown(b, t, { interval: o.interval }),
  reveal: C.reveal,
  scoreUp: (b, t, o) => C.scoreUp(b, t, { steps: o.steps }),
  promotion: C.promotion,
  victory: C.victory,
  championship: C.championship,
};

/** Seconds to allocate when rendering a cue offline (covers the longest tail). */
export const OFFLINE_SECONDS: Record<CueName, number> = {
  press: 0.4, select: 0.5, submitted: 0.6, correct: 1.2, incorrect: 1.0,
  countdown: 5, reveal: 1.8, scoreUp: 1.4, promotion: 2.4, victory: 4,
  championship: 8, crowdBed: 6,
};

const CATEGORY_LEVEL: Record<Category, number> = { ui: 0.9, feedback: 1, music: 1 };

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  cats: Record<Category, { dry: GainNode; wet: GainNode }>;
  crowdDuck: GainNode;
  noise: AudioBuffer;
}

/** Category gains → master volume → gentle limiter → speakers, plus a shared reverb. */
function buildGraph(ctx: BaseAudioContext, masterGain: number): Graph {
  const master = ctx.createGain();
  master.gain.value = masterGain;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8;
  lim.knee.value = 6;
  lim.ratio.value = 6;
  lim.attack.value = 0.003;
  lim.release.value = 0.2;
  master.connect(lim);
  lim.connect(ctx.destination);
  const verbIn = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = makeImpulse(ctx);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(master);
  const mk = (c: Category) => {
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.gain.value = wet.gain.value = CATEGORY_LEVEL[c];
    dry.connect(master);
    wet.connect(verbIn);
    return { dry, wet };
  };
  const cats = { ui: mk('ui'), feedback: mk('feedback'), music: mk('music') };
  const crowdDuck = ctx.createGain();
  crowdDuck.connect(cats.music.dry);
  return { ctx, master, cats, crowdDuck, noise: makeNoise(ctx) };
}

/**
 * Per-cue output trim in dB, set by ear and checked by offline measurement:
 * UI ticks stay well below feedback, feedback below music, and nothing is
 * louder than the championship.
 */
export const CUE_TRIM_DB: Record<CueName, number> = {
  press: 7, select: 12, submitted: 9, correct: 5, incorrect: 8, countdown: 0,
  reveal: 7, scoreUp: 10, promotion: -3, victory: -1.5, championship: 1.5, crowdBed: 0,
};

function bus(g: Graph, cat: Category, reduced: boolean, stats = { nodes: 0, voices: 0 }, cue?: CueName): Bus & { trims: GainNode[] } {
  const trims: GainNode[] = [];
  let out: AudioNode = g.cats[cat].dry;
  let verb: AudioNode = g.cats[cat].wet;
  const db = cue ? CUE_TRIM_DB[cue] : 0;
  if (db) {
    const lin = Math.pow(10, db / 20);
    const d = g.ctx.createGain(); d.gain.value = lin; d.connect(out); out = d;
    const w = g.ctx.createGain(); w.gain.value = lin; w.connect(verb); verb = w;
    trims.push(d, w);
  }
  return { ctx: g.ctx, out, verb, noise: g.noise, reduced, stats, trims };
}

export interface EngineOptions {
  storage?: StorageLike | null;
  createContext?: () => AudioContext;
}

export class ArenaSoundEngine {
  private settings: SoundSettings;
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private voices: ActiveVoice[] = [];
  private crowd: C.CrowdHandle | null = null;
  private listeners = new Set<() => void>();
  private snapshot: Readonly<SoundSettings & { unlocked: boolean; crowdOn: boolean }>;
  private storage?: StorageLike | null;
  private createContext?: () => AudioContext;
  private gestureCleanup: (() => void) | null = null;
  debug = false;
  debugLog: DebugEntry[] = [];

  constructor(opts: EngineOptions = {}) {
    this.storage = opts.storage;
    this.createContext = opts.createContext;
    this.settings = loadSettings(this.storage);
    this.snapshot = this.makeSnapshot();
    // A listener who opted in earlier gets sound back on their next tap —
    // browsers require that gesture before audio may start.
    if (this.settings.enabled) this.armGestureUnlock();
  }

  /* ---------- state ---------- */

  getState() { return this.snapshot; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private makeSnapshot() {
    return Object.freeze({ ...this.settings, unlocked: !!this.ctx, crowdOn: !!this.crowd });
  }

  private emit(persist = true) {
    if (persist) saveSettings(this.settings, this.storage);
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((l) => { try { l(); } catch { /* listener bug */ } });
  }

  get audible(): boolean {
    return !!this.ctx && this.settings.enabled && !this.settings.muted && this.settings.volume > 0;
  }

  /* ---------- enabling (must be called from a user gesture) ---------- */

  /** Create/resume the AudioContext. Call from a click/tap/keypress handler. */
  enable(): boolean {
    const ok = this.unlock();
    this.settings = { ...this.settings, enabled: true };
    this.emit();
    return ok;
  }

  /** Turn sound off entirely (the default state). */
  disable(): void {
    this.stopCrowd();
    this.settings = { ...this.settings, enabled: false };
    if (this.ctx) { try { this.ctx.suspend(); } catch { /* ignore */ } }
    this.emit();
  }

  private unlock(): boolean {
    try {
      if (!this.ctx) {
        const make = this.createContext ?? (() => {
          const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!Ctor) throw new Error('Web Audio unavailable');
          return new Ctor({ latencyHint: 'interactive' });
        });
        this.ctx = make();
        this.graph = buildGraph(this.ctx, this.targetMasterGain());
        // iOS Safari: play one silent sample inside the gesture to unlock output.
        const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        s.onended = () => { try { s.disconnect(); } catch { /* ignore */ } };
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => { /* retried on next play */ });
      this.disarmGestureUnlock();
      return true;
    } catch {
      this.ctx = null;
      this.graph = null;
      return false;
    }
  }

  private armGestureUnlock() {
    if (typeof window === 'undefined' || this.gestureCleanup) return;
    const handler = () => { if (this.settings.enabled) { this.unlock(); this.emit(false); } };
    const evs = ['pointerdown', 'keydown', 'touchend'];
    evs.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
    this.gestureCleanup = () => evs.forEach((e) => window.removeEventListener(e, handler, { capture: true } as any));
  }

  private disarmGestureUnlock() {
    if (this.gestureCleanup) { this.gestureCleanup(); this.gestureCleanup = null; }
  }

  /* ---------- controls ---------- */

  private targetMasterGain() {
    return this.settings.muted ? 0 : volumeToGain(this.settings.volume);
  }

  private applyMaster() {
    if (!this.graph || !this.ctx) return;
    const p = this.graph.master.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(this.targetMasterGain(), now + 0.04);
  }

  setMuted(muted: boolean) {
    this.settings = { ...this.settings, muted: !!muted };
    this.applyMaster();
    this.emit();
  }

  setVolume(volume: number) {
    this.settings = { ...this.settings, volume: clampVolume(volume) };
    this.applyMaster();
    this.emit();
  }

  setReducedSound(reduced: boolean) {
    this.settings = { ...this.settings, reducedSound: !!reduced };
    this.emit();
  }

  setCategoryLevel(cat: Category, level: number) {
    if (!this.graph) return;
    const v = Math.max(0, Math.min(1.5, level));
    this.graph.cats[cat].dry.gain.value = v;
    this.graph.cats[cat].wet.gain.value = v;
  }

  setDebug(on: boolean) { this.debug = !!on; }

  /* ---------- playing ---------- */

  play(cue: CueName, opts: PlayOptions = {}): PlayResult {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cancel = () => { timers.forEach(clearTimeout); timers.length = 0; };
    const result = (r: Omit<PlayResult, 'cancel' | 'cue'>): PlayResult => {
      const out: PlayResult = { cue, ...r, cancel };
      if (this.debug) {
        const { cancel: _c, ...rest } = out;
        this.debugLog.push({ ...rest, at: Date.now() });
        if (this.debugLog.length > 200) this.debugLog.shift();
        // eslint-disable-next-line no-console
        console.debug('[arena-sound]', rest);
      }
      return out;
    };

    if (cue === 'crowdBed') {
      const ok = this.startCrowd();
      return result({ played: ok, reason: ok ? undefined : (this.ctx ? 'muted' : 'off') });
    }

    // Visual sync for the countdown works with or without sound.
    const scheduleTicks = (startAudioTime: number | null) => {
      if (cue !== 'countdown' || !opts.onTick) return;
      const interval = opts.interval ?? 1;
      const lead = this.ctx && startAudioTime != null ? Math.max(0, startAudioTime - this.ctx.currentTime) : 0;
      const outLatency = this.ctx ? ((this.ctx as any).outputLatency || this.ctx.baseLatency || 0) : 0;
      for (let i = 0; i <= 3; i++) {
        const ms = (lead + outLatency + i * interval) * 1000;
        const n = 3 - i;
        timers.push(setTimeout(() => { try { opts.onTick(n); } catch { /* caller bug */ } }, ms));
      }
    };

    if (!this.ctx || !this.graph || !this.settings.enabled) { scheduleTicks(null); return result({ played: false, reason: 'off' }); }
    if (this.settings.muted || this.settings.volume <= 0) { scheduleTicks(null); return result({ played: false, reason: 'muted' }); }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => { /* ignore */ });

    const now = this.ctx.currentTime;
    this.voices = liveVoices(this.voices, now);
    const d = decide(cue, this.voices, now);
    if (d.allow === false) { scheduleTicks(null); return result({ played: false, reason: d.reason }); }

    const meta = CUES[cue];
    const stats = { nodes: 0, voices: 0 };
    const t = now + 0.012;
    let end: number;
    try {
      const b = bus(this.graph, meta.category, this.settings.reducedSound, stats, cue);
      end = CUE_FNS[cue](b, t, opts);
      if (b.trims.length) {
        setTimeout(() => b.trims.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } }), (end - now + 2) * 1000);
      }
    } catch {
      scheduleTicks(null);
      return result({ played: false, reason: 'error' });
    }
    this.voices.push({ cue, start: t, end });
    if (meta.ceremony) this.duckCrowd(end);
    scheduleTicks(t);
    return result({ played: true, start: t, duration: end - t, nodes: stats.nodes });
  }

  /* ---------- ambient crowd ---------- */

  startCrowd(): boolean {
    if (!this.audible || !this.graph || this.crowd) return !!this.crowd;
    const t = this.ctx.currentTime + 0.02;
    this.graph.crowdDuck.gain.setValueAtTime(this.duckedUntil() > t ? CROWD_DUCK_LEVEL : 1, t);
    this.crowd = C.crowdBed({ ...bus(this.graph, 'music', false), out: this.graph.crowdDuck, verb: null }, t);
    this.emit(false);
    return true;
  }

  stopCrowd(): void {
    if (!this.crowd) return;
    this.crowd.stop();
    this.crowd = null;
    this.emit(false);
  }

  private duckedUntil() { return this.ctx ? ceremonyUntil(this.voices, this.ctx.currentTime) : 0; }

  private duckCrowd(until: number) {
    if (!this.graph || !this.ctx) return;
    const p = this.graph.crowdDuck.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(CROWD_DUCK_LEVEL, now + 0.15);
    const end = Math.max(until, this.duckedUntil());
    p.setValueAtTime(CROWD_DUCK_LEVEL, end);
    p.linearRampToValueAtTime(1, end + 1.2);
  }

  /** Release the audio device (e.g. when leaving the Arène). Settings are kept. */
  dispose(): void {
    this.stopCrowd();
    this.disarmGestureUnlock();
    if (this.ctx) { try { this.ctx.close(); } catch { /* ignore */ } }
    this.ctx = null;
    this.graph = null;
    this.voices = [];
    this.emit(false);
  }
}

/* ---------- offline rendering (measurement + review exports) ---------- */

export interface OfflineRender {
  buffer: AudioBuffer;
  /** Seconds from cue start to the scheduled end of its last voice. */
  scheduledDuration: number;
  nodes: number;
}

export async function renderCueOffline(
  cue: CueName,
  opts: { sampleRate?: number; reduced?: boolean; volume?: number } = {},
): Promise<OfflineRender> {
  const sr = opts.sampleRate ?? 44100;
  const W: any = typeof window !== 'undefined' ? window : globalThis;
  const Off: typeof OfflineAudioContext = W.OfflineAudioContext || W.webkitOfflineAudioContext;
  const ctx = new Off(2, Math.ceil(OFFLINE_SECONDS[cue] * sr), sr);
  const g = buildGraph(ctx, volumeToGain(opts.volume ?? 1));
  const stats = { nodes: 0, voices: 0 };
  const t = 0.01;
  let end: number;
  if (cue === 'crowdBed') {
    const h = C.crowdBed({ ...bus(g, 'music', false, stats), out: g.crowdDuck, verb: null }, t);
    h.stop(4);
    end = 4.65;
  } else {
    end = CUE_FNS[cue](bus(g, CUES[cue].category, !!opts.reduced, stats, cue), t, {});
  }
  const buffer = await ctx.startRendering();
  return { buffer, scheduledDuration: end - t, nodes: stats.nodes };
}

/* ---------- singleton ---------- */

let shared: ArenaSoundEngine | null = null;

/** The one engine for the page (lazy; creates no AudioContext by itself). */
export function getArenaSound(): ArenaSoundEngine {
  if (!shared) shared = new ArenaSoundEngine();
  return shared;
}
