import { animateValue, flipReorder, prefersReducedMotion } from '../webMotion';

/**
 * The environment is jsdom (jest.config.js sets it globally), which gives us
 * `window`, elements and inline styles but no layout engine and no real clock.
 * So both the frame loop and the media query are driven by hand here: a test
 * that waited on a real rAF would be flaky, and one that trusted jsdom's
 * matchMedia could never see the reduced-motion branch at all.
 */

type FrameCallback = (time: number) => void;

let frames: Map<number, FrameCallback>;
let nextFrameId: number;

/** Run every frame currently queued, at `time`. Frames queued by those
 *  callbacks wait for the next flush — same as a real browser. */
function flushFrames(time: number): void {
  const due = Array.from(frames.entries());
  frames = new Map();
  due.forEach(([, cb]) => cb(time));
}

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** jsdom has no layout, so `offsetTop` is always 0 — pin it per element. */
function rowAt(top: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });
  document.body.appendChild(el);
  return el;
}

const realMatchMedia = window.matchMedia;
const realRaf = window.requestAnimationFrame;
const realCancelRaf = window.cancelAnimationFrame;

beforeEach(() => {
  frames = new Map();
  nextFrameId = 1;
  window.requestAnimationFrame = ((cb: FrameCallback) => {
    const id = nextFrameId++;
    frames.set(id, cb);
    return id;
  }) as unknown as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    frames.delete(id);
  }) as unknown as typeof window.cancelAnimationFrame;
  setReducedMotion(false);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCancelRaf;
  document.body.innerHTML = '';
});

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false, not a throw, when matchMedia is missing (prerender)', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('animateValue', () => {
  it('lands on exactly `to`, not an eased approximation', () => {
    const seen: number[] = [];
    const done = jest.fn();
    animateValue({ from: 40, to: 65, duration: 1000, onUpdate: (v) => seen.push(v), onDone: done });

    flushFrames(0);    // start timestamp
    flushFrames(500);  // mid-flight
    flushFrames(1000); // final

    expect(seen[seen.length - 1]).toBe(65);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('decelerates — it is past the halfway value at the halfway time', () => {
    const seen: number[] = [];
    animateValue({ from: 0, to: 100, duration: 1000, onUpdate: (v) => seen.push(v) });

    flushFrames(0);
    flushFrames(500);

    expect(seen[seen.length - 1]).toBeGreaterThan(50);
    expect(seen[seen.length - 1]).toBeLessThan(100);
  });

  it('stops updating after cancel and leaves no queued frame', () => {
    const onUpdate = jest.fn();
    const onDone = jest.fn();
    const cancel = animateValue({ from: 0, to: 100, duration: 1000, onUpdate, onDone });

    flushFrames(0);
    const callsBefore = onUpdate.mock.calls.length;
    cancel();

    expect(frames.size).toBe(0);
    flushFrames(500);
    flushFrames(1000);
    expect(onUpdate).toHaveBeenCalledTimes(callsBefore);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('jumps straight to `to` under reduced motion, scheduling no frames', () => {
    setReducedMotion(true);
    const onUpdate = jest.fn();
    const onDone = jest.fn();
    const cancel = animateValue({ from: 40, to: 65, duration: 1000, onUpdate, onDone });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(65);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(() => cancel()).not.toThrow();
  });
});

describe('flipReorder', () => {
  it('inverts a moved row, then releases it on the next frame', () => {
    const el = rowAt(200);
    const elements = new Map([['lycee', el]]);

    const tops = flipReorder(elements, new Map([['lycee', 80]]));

    expect(tops.get('lycee')).toBe(200);
    // Invert: drawn back at its old position, with no transition.
    expect(el.style.transform).toBe('translateY(-120px)');
    expect(el.style.transition).toBe('none');

    flushFrames(0);
    expect(el.style.transform).toBe('');
    expect(el.style.transition).toContain('transform');
  });

  it('leaves an unmoved row completely alone', () => {
    const el = rowAt(80);
    flipReorder(new Map([['lycee', el]]), new Map([['lycee', 80]]));
    expect(el.style.transform).toBe('');
    expect(frames.size).toBe(0);
  });

  it('is a no-op under reduced motion but still returns fresh measurements', () => {
    setReducedMotion(true);
    const el = rowAt(200);

    const tops = flipReorder(new Map([['lycee', el]]), new Map([['lycee', 80]]));

    expect(tops.get('lycee')).toBe(200);
    expect(el.style.transform).toBe('');
    expect(el.style.transition).toBe('');
    expect(frames.size).toBe(0);
  });

  it('tolerates a school present in only one map', () => {
    const joined = rowAt(300); // brand new: no previous measurement
    const moved = rowAt(40);
    const elements = new Map([['joined', joined], ['moved', moved]]);
    // 'left' is in the previous measurements but has no element any more.
    const previous = new Map([['left', 10], ['moved', 140]]);

    let tops!: Map<string, number>;
    expect(() => { tops = flipReorder(elements, previous); }).not.toThrow();

    expect(Array.from(tops.keys()).sort()).toEqual(['joined', 'moved']);
    expect(tops.has('left')).toBe(false);
    // A joiner must not fly in from the top of the board.
    expect(joined.style.transform).toBe('');
    expect(moved.style.transform).toBe('translateY(100px)');
  });

  it('survives an empty board', () => {
    expect(() => flipReorder(new Map(), new Map())).not.toThrow();
    expect(flipReorder(new Map(), new Map()).size).toBe(0);
  });
});
