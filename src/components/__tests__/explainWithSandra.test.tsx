/**
 * "Explique-moi" on the web: the button hands Sandra a structured context
 * (never on a live paper), emits the one telemetry event, and the panel sends
 * that context to /api/chat in a fresh conversation.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../contexts/store';

const mockTrackEvent = jest.fn();
jest.mock('../../utils/telemetry', () => ({
  ...jest.requireActual('../../utils/telemetry'),
  trackEvent: (...a: unknown[]) => mockTrackEvent(...a),
}));

const mockAuthedFetch = jest.fn();
jest.mock('../../services/firebase', () => ({
  authedFetch: (...a: unknown[]) => mockAuthedFetch(...a),
}));

jest.mock('../../hooks/useTrivia', () => ({ useTrivia: () => ({ level: { level: 3 } }) }));
// react-markdown ships ESM only; the chat bubble's renderer is not under test.
jest.mock('../InstructionRenderer', () => ({ __esModule: true, default: ({ text }: { text: string }) => <span>{text}</span> }));

import { ExplainWithSandra } from '../SandraWidget';
import SandraPanel from '../SandraWidget/SandraPanel';

const context = {
  surface: 'exam_results' as const,
  question: 'Résoudre $2x = 4$',
  studentAnswer: 'x = 4',
  expectedAnswer: 'x = 2',
  explanation: 'On divise par 2.',
  questionType: 'short_answer',
  status: 'incorrect' as const,
  examId: 'bac-1',
};

beforeEach(() => {
  mockTrackEvent.mockReset();
  mockAuthedFetch.mockReset();
  act(() => { useStore.setState({ sandraAsk: null, user: { uid: 'u1' }, grade: 'NS4', track: 'SMP' } as any); });
  try { sessionStorage.clear(); } catch { /* jsdom */ }
});

describe('ExplainWithSandra', () => {
  it('opens Sandra with the structured question and records the event', () => {
    render(
      <MemoryRouter initialEntries={['/exams/terminale/bac-1/results']}>
        <ExplainWithSandra context={context} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Explique-moi/ }));

    const ask = useStore.getState().sandraAsk as any;
    expect(typeof ask).toBe('object');
    expect(ask.message).toMatch(/étape par étape/);
    expect(ask.questionContext).toMatchObject({ question: 'Résoudre $2x = 4$', studentAnswer: 'x = 4', expectedAnswer: 'x = 2' });
    expect(mockTrackEvent).toHaveBeenCalledWith('correction_explain_opened', {
      surface: 'exam_results', type: 'short_answer', status: 'incorrect', signedIn: true,
    });
  });

  it('is never offered on a live exam paper', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/exams/terminale/bac-1/take']}>
        <ExplainWithSandra context={context} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SandraPanel with an Explique-moi ask', () => {
  it('starts a fresh conversation and sends questionContext with the message', async () => {
    sessionStorage.setItem('edlight:sandra:conv', 'old-conv');
    mockAuthedFetch.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ reply: 'Étape 1 : on divise par 2.', conversationId: 'new-conv' }),
    });
    act(() => {
      useStore.getState().setSandraAsk({ message: 'Explique-moi cette question.', questionContext: context });
    });
    render(
      <MemoryRouter initialEntries={['/exams/terminale/bac-1/results']}>
        <SandraPanel open onClose={() => {}} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalledTimes(1));
    const [url, body] = mockAuthedFetch.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(body.message).toBe('Explique-moi cette question.');
    expect(body.questionContext).toMatchObject({ surface: 'exam_results', expectedAnswer: 'x = 2' });
    expect(body.conversationId).toBeUndefined();
    expect(await screen.findByText(/Sandra reçoit la question, ta réponse et la correction/)).toBeTruthy();
    expect(useStore.getState().sandraAsk).toBeNull();
  });

  it('keeps a plain search ask unchanged (no questionContext)', async () => {
    mockAuthedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: 'Salut', conversationId: 'c' }) });
    act(() => { useStore.getState().setSandraAsk('chimie'); });
    render(
      <MemoryRouter initialEntries={['/']}>
        <SandraPanel open onClose={() => {}} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockAuthedFetch).toHaveBeenCalledTimes(1));
    expect(mockAuthedFetch.mock.calls[0][1].questionContext).toBeUndefined();
    expect(mockAuthedFetch.mock.calls[0][1].message).toBe('chimie');
  });
});
