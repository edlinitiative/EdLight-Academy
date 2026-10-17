import {
  reportError,
  trackEvent,
  setTelemetrySink,
  setTelemetryContext,
  getRecentTelemetry,
  getBuildInfo,
  __resetTelemetryForTests,
} from '../../services/telemetry';

beforeEach(() => __resetTelemetryForTests());

describe('telemetry', () => {
  it('delivers events to the sink with merged context', () => {
    const sink = jest.fn();
    setTelemetrySink(sink);
    setTelemetryContext({ updateId: 'u1' });
    trackEvent('practice_completed', { mode: 'lesson' });
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      type: 'event', name: 'practice_completed', detail: { mode: 'lesson' }, context: { updateId: 'u1' },
    }));
  });

  it('a throwing sink never breaks the caller', () => {
    setTelemetrySink(() => { throw new Error('boom'); });
    expect(() => reportError(new Error('x'))).not.toThrow();
  });

  it('keeps a bounded ring buffer of recent events', () => {
    for (let i = 0; i < 80; i += 1) trackEvent(`e${i}`);
    const recent = getRecentTelemetry();
    expect(recent).toHaveLength(50);
    expect(recent[recent.length - 1].name).toBe('e79');
  });

  it('build info never throws and has a platform', () => {
    const info = getBuildInfo();
    expect(info).toHaveProperty('platform');
  });
});
