/**
 * P0 code validation (2026-10-19) — shared school/family computers.
 * Web logout kept the previous student's class (grade/gradeChosen) and
 * Sandra conversation id, so the next account skipped the class question,
 * got the wrong level's content, and every Sandra message 403'd (the server
 * refuses another user's conversation).
 */
jest.mock('../../services/firebase', () => ({ updateUserGrade: jest.fn(() => Promise.resolve()) }));
import useStore from '../store';

describe('web logout isolates the next account', () => {
  it('clears class choice and the Sandra conversation', () => {
    useStore.setState({ user: { uid: 'A' } as any, isAuthenticated: true, grade: 'NS4', gradeChosen: true, dismissedSuggestionKey: 'k' });
    sessionStorage.setItem('edlight:sandra:conv', 'conv-of-A');
    useStore.getState().logout();
    const s = useStore.getState();
    expect(s.grade).toBeNull();
    expect(s.gradeChosen).toBe(false);
    expect(s.dismissedSuggestionKey).toBeNull();
    expect(sessionStorage.getItem('edlight:sandra:conv')).toBeNull();
  });
});
