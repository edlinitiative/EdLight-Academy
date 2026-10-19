import { readNextParam, safeInternalPath, signInRedirect } from '../returnPath';

describe('returnPath (A-2)', () => {
  it('accepts same-site paths with their query', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard');
    expect(safeInternalPath('/dashboard?tab=exams')).toBe('/dashboard?tab=exams');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/javascript:alert(1)', 'dashboard', '', '/\nx', null, 42]) {
      expect(safeInternalPath(bad)).toBeNull();
    }
    expect(safeInternalPath(`/${'a'.repeat(600)}`)).toBeNull();
  });

  it('round-trips through the sign-in redirect', () => {
    const to = signInRedirect('/dashboard?tab=exams');
    expect(to).toBe('/?next=%2Fdashboard%3Ftab%3Dexams');
    expect(readNextParam(to.slice(1))).toBe('/dashboard?tab=exams');
    expect(signInRedirect('//evil.com')).toBe('/');
    expect(readNextParam('?next=%2F%2Fevil.com')).toBeNull();
  });
});
