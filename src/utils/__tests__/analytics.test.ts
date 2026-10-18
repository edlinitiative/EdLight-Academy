import { track, trackOutbound, trackThenLeave, setAnalyticsOptOut, isAnalyticsOptedOut } from '../analytics';

describe('track', () => {
  afterEach(() => {
    delete (window as any).gtag;
  });

  it('forwards the event and params to gtag', () => {
    const gtag = jest.fn();
    (window as any).gtag = gtag;
    track('sign_up', { method: 'google' });
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' });
  });

  it('is a no-op when gtag is not loaded', () => {
    expect(() => track('sign_up', { method: 'password' })).not.toThrow();
  });

  it('never throws into the caller when gtag throws', () => {
    (window as any).gtag = () => {
      throw new Error('blocked');
    };
    expect(() => track('quiz_complete', { quiz_id: 'q1' })).not.toThrow();
  });
});

describe('trackOutbound', () => {
  afterEach(() => {
    delete (window as any).gtag;
    delete (window as any).__edlightLoadGtag;
  });

  it('sends as a beacon and asks for gtag.js now', () => {
    const gtag = jest.fn();
    const load = jest.fn();
    (window as any).gtag = gtag;
    (window as any).__edlightLoadGtag = load;
    trackOutbound('app_download_click', { platform: 'android' });
    expect(load).toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledWith('event', 'app_download_click', {
      platform: 'android',
      transport_type: 'beacon',
    });
  });
});

describe('trackThenLeave', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete (window as any).gtag;
    delete (window as any).__edlightLoadGtag;
  });

  it('leaves once the hit is sent, and only once', () => {
    const then = jest.fn();
    let callback: (() => void) | undefined;
    (window as any).gtag = jest.fn((_c, _n, p) => { callback = p.event_callback; });
    trackThenLeave('app_download_click', { platform: 'redirect-ios' }, then);
    const params = (window as any).gtag.mock.calls[0][2];
    expect(params).toMatchObject({ platform: 'redirect-ios', transport_type: 'beacon' });
    expect(then).not.toHaveBeenCalled();
    callback!();
    callback!(); // a second destination reporting in
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('leaves after the timeout when gtag never reports back', () => {
    jest.useFakeTimers();
    const then = jest.fn();
    (window as any).gtag = jest.fn();
    trackThenLeave('app_download_click', {}, then, 1000);
    jest.advanceTimersByTime(999);
    expect(then).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('leaves at once without gtag', () => {
    const then = jest.fn();
    trackThenLeave('app_download_click', {}, then);
    expect(then).toHaveBeenCalledTimes(1);
  });
});

describe('setAnalyticsOptOut', () => {
  afterEach(() => {
    delete (window as any).gtag;
    localStorage.clear();
  });

  it('denies every signal and remembers it', () => {
    const gtag = jest.fn();
    (window as any).gtag = gtag;
    setAnalyticsOptOut(true);
    expect(isAnalyticsOptedOut()).toBe(true);
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('grants them again when the visitor allows measurement', () => {
    const gtag = jest.fn();
    (window as any).gtag = gtag;
    setAnalyticsOptOut(true);
    setAnalyticsOptOut(false);
    expect(isAnalyticsOptedOut()).toBe(false);
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', expect.objectContaining({ ad_storage: 'granted' }));
  });
});
