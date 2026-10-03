import { track } from '../analytics';

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
