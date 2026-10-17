/**
 * stateMachine — a tiny, typed state machine for authored motion.
 *
 * It mirrors Rive's state-machine model on purpose, so every sequence built on
 * it can later be ported 1:1 into a Rive file (see RIVE-PORT.md):
 *
 *   Rive                         here
 *   ───────────────────────────  ───────────────────────────────────────────
 *   State (an animation)         `states[name]`
 *   Trigger input                `send(trigger)` → `on[trigger]` / `any[trigger]`
 *   Boolean / Number input       `set(name, value)` → guarded `always` transitions
 *   Transition condition         `guard(inputs)`
 *   Exit time                    `after: { ms, to }`
 *   Any State                    `any` — authoritative, preempts every state
 *
 * Interruption rule (brief, "Technical presentation principles"): a state
 * flagged `cosmetic` is presentation only. An authoritative input (`any`)
 * always wins over it, cancelling its pending timed exit. Nothing waits for a
 * cosmetic sequence to finish.
 *
 * The core is pure: every operation takes a snapshot and a clock reading and
 * returns a new snapshot, plus the list of states it entered (so the caller
 * runs `onEnter` side effects — sound, analytics — outside the reducer).
 * Timed transitions are resolved against the clock, not against timers: if a
 * tab sleeps through three timed states, `advance()` walks all three with
 * their exact scheduled timestamps and reports how late each one was.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type InputValue = boolean | number | string;
export type Inputs = Record<string, InputValue>;

export interface Guarded<S extends string, V extends Inputs> {
  to: S;
  guard?: (inputs: V) => boolean;
}

/** A target: a state name, one guarded target, or the first passing of several. */
export type Target<S extends string, V extends Inputs> = S | Guarded<S, V> | Array<Guarded<S, V>>;

export interface StateNode<S extends string, T extends string, V extends Inputs> {
  /** Presentation only — preempted by authoritative input, skippable. */
  cosmetic?: boolean;
  /** Trigger → target, evaluated only while in this state. */
  on?: Partial<Record<T, Target<S, V>>>;
  /** Exit time: leave for `to` once `ms` have elapsed in this state. */
  after?: { ms: number; to: S };
  /** Condition transitions on value inputs, re-checked after every change. */
  always?: Array<Guarded<S, V>>;
  /** Human note carried into the porting spec. */
  note?: string;
}

export interface MachineDef<S extends string, T extends string, V extends Inputs> {
  id: string;
  initial: S;
  inputs: V;
  states: Record<S, StateNode<S, T, V>>;
  /** "Any State" transitions — authoritative; checked before the state's own `on`. */
  any?: Partial<Record<T, Target<S, V>>>;
}

export interface Entry<S extends string> {
  state: S;
  /** When the state was (or should have been) entered, by the clock. */
  at: number;
  /** How far behind the clock this entry was processed (0 when on time). */
  lateMs: number;
  /** True when an authoritative `any` transition caused the entry. */
  preempted: boolean;
}

export interface Snapshot<S extends string, V extends Inputs> {
  state: S;
  enteredAt: number;
  inputs: V;
  /** States entered by the operation that produced this snapshot. */
  entered: Array<Entry<S>>;
}

/** Hard cap on chained transitions per operation — guards a mis-authored loop. */
const MAX_STEPS = 64;

export function defineMachine<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>,
): MachineDef<S, T, V> {
  // Validate references once, at definition time, so a typo fails loudly.
  const names = Object.keys(def.states) as S[];
  const check = (to: string, where: string) => {
    if (!(to in def.states)) throw new Error(`[${def.id}] ${where} targets unknown state "${to}"`);
  };
  check(def.initial, 'initial');
  const checkTarget = (t: Target<S, V> | undefined, where: string) => {
    if (t == null) return;
    if (typeof t === 'string') check(t, where);
    else if (Array.isArray(t)) t.forEach((g) => check(g.to, where));
    else check(t.to, where);
  };
  names.forEach((n) => {
    const node = def.states[n];
    Object.entries(node.on || {}).forEach(([k, t]) => checkTarget(t as Target<S, V>, `${n}.on.${k}`));
    if (node.after) check(node.after.to, `${n}.after`);
    (node.always || []).forEach((g) => check(g.to, `${n}.always`));
  });
  Object.entries(def.any || {}).forEach(([k, t]) => checkTarget(t as Target<S, V>, `any.${k}`));
  return def;
}

function resolve<S extends string, V extends Inputs>(t: Target<S, V> | undefined, inputs: V): S | null {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  const list = Array.isArray(t) ? t : [t];
  for (const g of list) if (!g.guard || g.guard(inputs)) return g.to;
  return null;
}

/** Follow timed exits and condition transitions until the machine is stable. */
function settle<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>, now: number,
): Snapshot<S, V> {
  let { state, enteredAt } = snap;
  const entered = [...snap.entered];
  for (let i = 0; i < MAX_STEPS; i += 1) {
    const node = def.states[state];
    const cond = (node.always || []).find((g) => !g.guard || g.guard(snap.inputs));
    if (cond && cond.to !== state) {
      state = cond.to; enteredAt = now;
      entered.push({ state, at: now, lateMs: 0, preempted: false });
      continue;
    }
    if (node.after && now >= enteredAt + node.after.ms) {
      const at = enteredAt + node.after.ms;
      state = node.after.to; enteredAt = at;
      entered.push({ state, at, lateMs: now - at, preempted: false });
      continue;
    }
    break;
  }
  return { state, enteredAt, inputs: snap.inputs, entered };
}

export function init<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, now: number, inputs?: Partial<V>,
): Snapshot<S, V> {
  const start: Snapshot<S, V> = {
    state: def.initial, enteredAt: now, inputs: { ...def.inputs, ...(inputs || {}) } as V,
    entered: [{ state: def.initial, at: now, lateMs: 0, preempted: false }],
  };
  return settle(def, start, now);
}

/** Resolve any timed exits that have come due by `now`. */
export function advance<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>, now: number,
): Snapshot<S, V> {
  return settle(def, { ...snap, entered: [] }, now);
}

/**
 * Fire a trigger. Due timed exits are resolved first (so a trigger is judged
 * against the state the clock says we are in), then `any` (authoritative),
 * then the current state's own `on`. An unhandled trigger is a no-op.
 */
export function send<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>, trigger: T, now: number,
): Snapshot<S, V> {
  const cur = advance(def, snap, now);
  const fromAny = resolve(def.any?.[trigger], cur.inputs);
  const target = fromAny ?? resolve(def.states[cur.state].on?.[trigger], cur.inputs);
  if (target == null) return cur;
  const next: Snapshot<S, V> = {
    state: target, enteredAt: now, inputs: cur.inputs,
    entered: [...cur.entered, { state: target, at: now, lateMs: 0, preempted: fromAny != null }],
  };
  return settle(def, next, now);
}

/** Set a value input (Rive boolean/number input) and re-check conditions. */
export function setInput<S extends string, T extends string, V extends Inputs, K extends keyof V>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>, name: K, value: V[K], now: number,
): Snapshot<S, V> {
  const cur = advance(def, snap, now);
  if (cur.inputs[name] === value) return cur;
  return settle(def, { ...cur, inputs: { ...cur.inputs, [name]: value } }, now);
}

/** When the next timed exit falls due, or null if the machine is at rest. */
export function nextDeadline<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>,
): number | null {
  const a = def.states[snap.state].after;
  return a ? snap.enteredAt + a.ms : null;
}

/** Progress (0–1) through the current timed state; 1 for a resting state. */
export function progress<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, snap: Snapshot<S, V>, now: number,
): number {
  const a = def.states[snap.state].after;
  if (!a) return 1;
  return Math.max(0, Math.min(1, (now - snap.enteredAt) / a.ms));
}

/** Sum of exit times along the timed chain from `from` (for specs and tests). */
export function chainDuration<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, from: S,
): { ms: number; path: S[] } {
  let ms = 0; const path: S[] = [from]; let s = from;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    const a = def.states[s].after;
    if (!a) break;
    ms += a.ms; s = a.to; path.push(s);
  }
  return { ms, path };
}

// ─── React binding ────────────────────────────────────────────────────────────

export interface MachineHandle<S extends string, T extends string, V extends Inputs> {
  state: S;
  inputs: V;
  snapshot: Snapshot<S, V>;
  send: (trigger: T) => void;
  set: <K extends keyof V>(name: K, value: V[K]) => void;
  /** Back to the initial state (a fresh run). */
  reset: () => void;
}

export interface MachineOptions<S extends string, V extends Inputs> {
  /** Runs once per entered state, after the reducer — sound, analytics, callbacks. */
  onEnter?: (entry: Entry<S>, snap: Snapshot<S, V>) => void;
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number;
}

/**
 * Run a machine in a component. Timed exits are scheduled with a single
 * timeout to the next deadline, and re-resolved from the clock when the tab
 * becomes visible again, so a throttled or sleeping tab catches up to the
 * state it should be in instead of replaying a backlog.
 */
export function useStateMachine<S extends string, T extends string, V extends Inputs>(
  def: MachineDef<S, T, V>, opts: MachineOptions<S, V> = {},
): MachineHandle<S, T, V> {
  const clock = opts.now || Date.now;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const snapRef = useRef<Snapshot<S, V> | null>(null);
  if (snapRef.current === null) snapRef.current = init(def, clock());
  const [snap, setSnap] = useState<Snapshot<S, V>>(snapRef.current);

  const commit = useCallback((next: Snapshot<S, V>) => {
    const prev = snapRef.current;
    if (prev && next.state === prev.state && next.enteredAt === prev.enteredAt
      && next.inputs === prev.inputs && next.entered.length === 0) return;
    snapRef.current = next;
    setSnap(next);
    const cb = optsRef.current.onEnter;
    if (cb) next.entered.forEach((e) => cb(e, next));
  }, []);

  // Initial entry hooks.
  useEffect(() => {
    const cb = optsRef.current.onEnter;
    const s = snapRef.current;
    if (cb && s) s.entered.forEach((e) => cb(e, s));
  }, []);

  // Schedule the next timed exit.
  useEffect(() => {
    const due = nextDeadline(def, snap);
    if (due == null) return undefined;
    const id = window.setTimeout(() => commit(advance(def, snapRef.current!, clock())),
      Math.max(0, due - clock()));
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, snap, commit]);

  // Catch up after the tab was hidden or throttled.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') commit(advance(def, snapRef.current!, clock()));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, commit]);

  const sendT = useCallback((trigger: T) => commit(send(def, snapRef.current!, trigger, clock())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, commit]);
  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) =>
    commit(setInput(def, snapRef.current!, name, value, clock())),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [def, commit]);
  const reset = useCallback(() => commit(init(def, clock(), snapRef.current!.inputs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, commit]);

  return { state: snap.state, inputs: snap.inputs, snapshot: snap, send: sendT, set, reset };
}
