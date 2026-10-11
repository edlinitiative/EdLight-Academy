import { sandraRestrictionFor } from '../SandraWidget';

describe('Sandra stays out of competitions', () => {
  it('is blocked on the whole web championship play room, lobby included', () => {
    expect(sandraRestrictionFor('/arena/jouer', false)).toBe('competition');
    expect(sandraRestrictionFor('/arena/jouer/abc123', false)).toBe('competition');
  });

  it('is blocked during a Mode Histoire round, free on its map', () => {
    expect(sandraRestrictionFor('/arena/histoire', true)).toBe('competition');
    expect(sandraRestrictionFor('/arena/histoire', false)).toBeNull();
  });

  it('stays available on the arcade lobby and championship info page', () => {
    expect(sandraRestrictionFor('/arena', false)).toBeNull();
    expect(sandraRestrictionFor('/arena/championnat', false)).toBeNull();
  });
});
