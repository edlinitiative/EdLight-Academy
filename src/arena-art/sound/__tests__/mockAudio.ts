/** Minimal AudioContext mock: records node creation, supports every call the engine makes. */
export function mockParam(v = 0): any {
  const p: any = { value: v, events: [] as any[] };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
    p[m] = jest.fn((...a: any[]) => { p.events.push([m, ...a]); return p; });
  }
  return p;
}

export class MockAudioContext {
  static instances: MockAudioContext[] = [];
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  baseLatency = 0;
  created: Record<string, number> = {};
  destination: any = { connect: jest.fn(), disconnect: jest.fn() };
  resume = jest.fn(() => Promise.resolve());
  suspend = jest.fn(() => Promise.resolve());
  close = jest.fn(() => Promise.resolve());
  constructor() { MockAudioContext.instances.push(this); }
  private node(kind: string, extra: any = {}) {
    this.created[kind] = (this.created[kind] || 0) + 1;
    return { connect: jest.fn(), disconnect: jest.fn(), ...extra };
  }
  private src(kind: string, extra: any = {}) {
    return this.node(kind, { start: jest.fn(), stop: jest.fn(), onended: null, ...extra });
  }
  createGain() { return this.node('gain', { gain: mockParam(1) }); }
  createOscillator() { return this.src('osc', { type: 'sine', frequency: mockParam(440), detune: mockParam(0) }); }
  createBufferSource() { return this.src('buffer', { buffer: null, loop: false }); }
  createBiquadFilter() { return this.node('filter', { type: 'lowpass', frequency: mockParam(350), Q: mockParam(1) }); }
  createStereoPanner() { return this.node('pan', { pan: mockParam(0) }); }
  createConvolver() { return this.node('conv', { buffer: null, normalize: true }); }
  createDynamicsCompressor() {
    return this.node('comp', { threshold: mockParam(), knee: mockParam(), ratio: mockParam(), attack: mockParam(), release: mockParam() });
  }
  createBuffer(ch: number, len: number, sr: number) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i: number) => data[i] };
  }
}

export function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k) : null), setItem: (k: string, v: string) => { m.set(k, v); }, map: m };
}
