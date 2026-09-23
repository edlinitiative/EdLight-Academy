import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SprintSolo from '../SprintSolo';
import LiveRoomEntry from '../LiveRoomEntry';
import { loadBank, loadHistory } from '../sprintLogic';

const mockRecord = jest.fn().mockResolvedValue({ xpEarned: 20, guest: true });
jest.mock('../../../hooks/useTrivia', () => ({ useTrivia: () => ({ recordResult: mockRecord, isAuthed: false }) }));
jest.mock('../../../utils/telemetry', () => ({ trackEvent: jest.fn() }));

const bank = {
  maths: [
    { q: 'Deux plus deux ?', qHt: 'De plis de ?', options: ['4', '5'], answer: 0, explanation: '2 + 2 = 4.' },
    { q: 'Trois fois trois ?', qHt: 'Twa fwa twa ?', options: ['6', '9'], answer: 1, explanation: '3 × 3 = 9.' },
  ],
};
const categories = [{ id: 'maths', name: 'Maths', nameHt: 'Matematik' }];

beforeEach(() => { localStorage.clear(); mockRecord.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

function renderSprint() {
  return render(<MemoryRouter><SprintSolo isCreole={false} categories={categories} questionsMap={bank} /></MemoryRouter>);
}

it('plays a sprint: accuracy updates, the explanation shows, misses go to the error bank', async () => {
  renderSprint();
  fireEvent.click(screen.getByText('Maths'));
  fireEvent.click(screen.getByText('Lancer le sprint'));
  expect(screen.getByTestId('sprint-accuracy')).toHaveTextContent('—');

  // Answer whichever question came first: pick option 1 (index 0) with the keyboard.
  const first = screen.getByRole('heading', { level: 2 }).textContent;
  fireEvent.keyDown(window, { key: '1' });
  fireEvent.keyDown(window, { key: 'Enter' });
  const firstRight = first === 'Deux plus deux ?';
  expect(screen.getByTestId('sprint-accuracy')).toHaveTextContent(firstRight ? '100%' : '0%');
  expect(screen.getByRole('status')).toHaveTextContent(firstRight ? '2 + 2 = 4.' : '3 × 3 = 9.');

  // Next, then answer the second one with option 1 too, then finish.
  fireEvent.keyDown(window, { key: 'Enter' });
  fireEvent.keyDown(window, { key: '1' });
  fireEvent.keyDown(window, { key: 'Enter' });
  expect(screen.getByTestId('sprint-accuracy')).toHaveTextContent('50%');
  await act(async () => { fireEvent.click(screen.getByText('Voir le bilan')); });

  expect(screen.getByText('Sprint terminé')).toBeInTheDocument();
  // Exactly one of the two was wrong ("Trois fois trois ?" with "6").
  expect(loadBank().map((b) => b.question.q)).toEqual(['Trois fois trois ?']);
  expect(loadHistory()).toHaveLength(1);
  expect(mockRecord).toHaveBeenCalledWith({ category: 'maths', score: 1, total: 2, isDaily: false });
  expect(screen.getByText(/Session zéro faute \(1\)/)).toBeInTheDocument();
});

it('ends when the countdown reaches zero, and pause stops the clock', async () => {
  jest.useFakeTimers();
  renderSprint();
  fireEvent.click(screen.getByText('3 min'));
  fireEvent.click(screen.getByText('Lancer le sprint'));
  expect(screen.getByTestId('sprint-clock')).toHaveTextContent('03:00');
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.getByTestId('sprint-clock')).toHaveTextContent('02:55');
  fireEvent.click(screen.getByText('Pause'));
  act(() => { jest.advanceTimersByTime(10000); });
  expect(screen.getByTestId('sprint-clock')).toHaveTextContent('02:55');
  fireEvent.click(screen.getByText('Reprendre'));
  await act(async () => { jest.advanceTimersByTime(180000); });
  expect(screen.getByText('Sprint terminé')).toBeInTheDocument();
  // Nothing answered → no XP call.
  expect(mockRecord).not.toHaveBeenCalled();
});

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p>; }

it('joins a live room by its 6-digit PIN', () => {
  render(
    <MemoryRouter initialEntries={['/jeux/trivia?mode=live']}>
      <Routes>
        <Route path="/jeux/trivia" element={<LiveRoomEntry isCreole={false} />} />
        <Route path="/tournois/rejoindre" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  const join = screen.getByText('Rejoindre').closest('button')!;
  expect(join).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Code du salon'), { target: { value: '82a9 415' } });
  expect(join).not.toBeDisabled();
  fireEvent.click(join);
  expect(screen.getByTestId('where')).toHaveTextContent('/tournois/rejoindre?pin=829415');
});
