/**
 * P0 code validation (2026-10-19). On sign-in, a FAILED profile read (flaky
 * network, cache miss offline) came back as `null` and was treated as "no
 * document", so the create path ran a non-merge setDoc that reset
 * track:'' / onboarding_completed:false and dropped grade, school, push tokens…
 * Only a CONFIRMED absence may create.
 */
jest.mock('../../utils/analytics', () => ({ track: jest.fn() }));
import { shouldCreateUserDoc } from '../authService';

describe('shouldCreateUserDoc', () => {
  it('creates for a brand-new account', () => {
    expect(shouldCreateUserDoc(true, { status: 'error' })).toBe(true);
  });
  it('creates when the read confirmed the document is missing', () => {
    expect(shouldCreateUserDoc(false, { status: 'missing' })).toBe(true);
  });
  it('never creates (overwrites) when the read failed', () => {
    expect(shouldCreateUserDoc(false, { status: 'error' })).toBe(false);
  });
  it('touches an existing document', () => {
    expect(shouldCreateUserDoc(false, { status: 'found', data: {} })).toBe(false);
  });
});
