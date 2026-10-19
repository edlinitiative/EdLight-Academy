import { shouldReplayInitialTarget } from '../initialLink';
import { resolveAppPath } from '../arenaLinks';

describe('cold-start link replay', () => {
  it('replays a duel invite that launched the app (was dropped → Home)', () => {
    const target = resolveAppPath('https://academy.edlight.org/defi/ABCDEFGH');
    expect(target?.screen).toBe('Defi');
    expect(shouldReplayInitialTarget(target, 'Main')).toBe(true);
  });

  it('replays Arène links too', () => {
    const target = resolveAppPath('https://academy.edlight.org/arena');
    expect(shouldReplayInitialTarget(target, 'Main')).toBe(true);
  });

  it('does not navigate twice when linking already applied (warm start)', () => {
    expect(shouldReplayInitialTarget({ screen: 'Defi' }, 'Defi')).toBe(false);
  });

  it('ignores unresolvable links', () => {
    expect(shouldReplayInitialTarget(null, 'Main')).toBe(false);
  });
});
