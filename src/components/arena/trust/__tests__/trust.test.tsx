import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AnswerReceipt,
  ConnectionPill,
  ReportProblem,
  ResultStatus,
  RulesButton,
  answerReceiptView,
  connectionState,
  duelSubmitView,
  formatClock,
  isNetworkFailure,
  reportMailto,
  expiryLine,
} from '..';

jest.mock('../../../../services/challengeWebService', () => ({
  acceptChallenge: jest.fn(),
  getChallenge: jest.fn(),
}));

describe('connectionState', () => {
  const base = { online: true, hasSnapshot: true, listenerLost: false, lastRoundTripFailed: null, recovering: false };
  it('is connecting before any snapshot, live after', () => {
    expect(connectionState({ ...base, hasSnapshot: false })).toBe('connecting');
    expect(connectionState(base)).toBe('live');
  });
  it('reconnects on any real failure signal', () => {
    expect(connectionState({ ...base, online: false })).toBe('reconnecting');
    expect(connectionState({ ...base, listenerLost: true })).toBe('reconnecting');
    expect(connectionState({ ...base, lastRoundTripFailed: true })).toBe('reconnecting');
    expect(connectionState({ ...base, recovering: true })).toBe('reconnecting');
    // Offline before the first snapshot is still "connecting" — nothing to re-join.
    expect(connectionState({ ...base, hasSnapshot: false, online: false })).toBe('connecting');
  });
  it('treats only network-level errors as connection failures', () => {
    expect(isNetworkFailure('offline')).toBe(true);
    expect(isNetworkFailure('network')).toBe(true);
    expect(isNetworkFailure('http_503')).toBe(true);
    expect(isNetworkFailure('not_registered')).toBe(false);
    expect(isNetworkFailure('http_429')).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });
});

describe('answerReceiptView — never a false receipt', () => {
  const v = (o: Partial<Parameters<typeof answerReceiptView>[0]>) => answerReceiptView({
    choice: 1, status: 'sending', error: null, online: true, questionOpen: true, ...o,
  });
  it('only the server 200 is "received"', () => {
    expect(v({ status: 'accepted' })).toBe('received');
    for (const status of ['sending', 'retryable', null] as const) {
      expect(v({ status })).not.toBe('received');
      expect(v({ status, questionOpen: false })).not.toBe('received');
    }
  });
  it('splits an unconfirmed answer by network and by clock', () => {
    expect(v({ status: 'sending' })).toBe('sending');
    expect(v({ status: 'retryable', online: false })).toBe('waitingNetwork');
    expect(v({ status: 'retryable', online: true })).toBe('failed');
    expect(v({ status: 'retryable', questionOpen: false })).toBe('unconfirmedLate');
    expect(v({ status: 'sending', questionOpen: false })).toBe('unconfirmedLate');
  });
  it('names the server’s refusals', () => {
    expect(v({ status: 'rejected', error: 'window_closed' })).toBe('tooLate');
    expect(v({ status: 'rejected', error: 'answers_closed' })).toBe('tooLate');
    expect(v({ status: 'rejected', error: 'not_eligible' })).toBe('ineligible');
  });
  it('idle while open with no choice; noAnswer once closed', () => {
    expect(v({ choice: null, status: null })).toBe('idle');
    expect(v({ choice: null, status: null, questionOpen: false })).toBe('noAnswer');
  });
});

it('formats the clock floored, never rounding into a better tier', () => {
  expect(formatClock(7_999)).toBe('00:07');
  expect(formatClock(12_400)).toBe('00:12');
  expect(formatClock(-5)).toBe('00:00');
  expect(formatClock(65_000)).toBe('01:05');
});

it('duel submission states', () => {
  expect(duelSubmitView({ pending: true, online: true })).toBe('saving');
  expect(duelSubmitView({ pending: false, ok: true, online: true })).toBe('saved');
  expect(duelSubmitView({ pending: false, ok: false, error: 'network', online: false })).toBe('waitingNetwork');
  expect(duelSubmitView({ pending: false, ok: false, error: 'network', online: true })).toBe('failed');
  expect(duelSubmitView({ pending: false, ok: false, error: 'already_played', online: true })).toBe('refused');
  expect(duelSubmitView({ pending: false, ok: false, error: 'expired', online: true })).toBe('refused');
});

describe('ConnectionPill', () => {
  it('says each state in words, bilingual', () => {
    const { rerender } = render(<ConnectionPill state="connecting" isCreole={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Connexion…');
    rerender(<ConnectionPill state="live" isCreole={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('En direct');
    rerender(<ConnectionPill state="live" liveWord="connected" isCreole={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecté');
    rerender(<ConnectionPill state="reconnecting" isCreole />);
    expect(screen.getByRole('status')).toHaveTextContent('N ap rekonekte…');
  });
});

describe('AnswerReceipt', () => {
  it('shows the ack clock only on a received answer', () => {
    render(<AnswerReceipt kind="received" ackClock="00:07" choiceLabel="B" isCreole={false} />);
    expect(screen.getByText('Réponse reçue ✓ à 00:07')).toBeInTheDocument();
  });
  it('in flight says "envoyée", with the choice, and no tick', () => {
    render(<AnswerReceipt kind="sending" ackClock="00:07" choiceLabel="B" isCreole={false} />);
    expect(screen.getByText('Réponse envoyée (B)…')).toBeInTheDocument();
    expect(screen.queryByText(/✓/)).toBeNull();
  });
  it('offers a resend only when it can help', () => {
    const onRetry = jest.fn();
    const { rerender } = render(<AnswerReceipt kind="failed" choiceLabel="C" onRetry={onRetry} isCreole={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Renvoyer/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<AnswerReceipt kind="tooLate" onRetry={onRetry} isCreole={false} />);
    expect(screen.getByText('Temps écoulé — réponse non comptée')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('a duplicate tells the student which answer counts', () => {
    render(<AnswerReceipt kind="received" duplicate isCreole={false} />);
    expect(screen.getByText(/c’est elle qui compte/)).toBeInTheDocument();
  });
});

describe('RulesSheet', () => {
  it('is a labelled modal dialog that traps focus and restores it', () => {
    render(<RulesButton variant="duel" isCreole={false} />);
    const trigger = screen.getByRole('button', { name: /Comment le gagnant est décidé/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Comment le gagnant est décidé' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.textContent).toContain('+20 XP');
    expect(dialog.textContent).toContain('+10 XP chacun');
    expect(dialog.textContent).toContain('7 jours');
    expect(dialog.textContent).toContain('15 secondes');
    const close = screen.getByRole('button', { name: 'Fermer' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('arena rules state the tiers and the provisional/final difference', () => {
    render(<RulesButton variant="arena" isCreole teamSize={5} minPlayers={5} />);
    fireEvent.click(screen.getByRole('button', { name: /Règ yo/ }));
    const text = screen.getByRole('dialog').textContent || '';
    expect(text).toContain('1000');
    expect(text).toContain('500');
    expect(text).toContain('Rezilta pwovizwa');
    expect(text).toContain('72 èdtan');
  });
});

describe('ReportProblem', () => {
  it('builds a mailto to the support inbox with the context a reviewer needs', () => {
    const href = reportMailto({ kind: 'arena', ref: 'edition-1', questionIndex: 3, uid: 'u9' }, false, new Date('2026-10-17T18:40:00Z'));
    expect(href.startsWith('mailto:info@edlight.org?subject=')).toBe(true);
    const body = decodeURIComponent(href.split('&body=')[1]);
    expect(body).toContain('Édition : edition-1');
    expect(body).toContain('Question : 4');
    expect(body).toContain('2026-10-17T18:40:00.000Z');
    expect(body).toContain('Compte : u9');
  });
  it('renders as a link with a dispute wording when asked', () => {
    render(<ReportProblem context={{ kind: 'duel', ref: 'AB2CD3EF', reason: 'dispute' }} isCreole={false} />);
    const a = screen.getByRole('link', { name: /Contester un résultat/ });
    expect(decodeURIComponent(a.getAttribute('href') || '')).toContain('[Défi] Contester un résultat — AB2CD3EF');
  });
});

it('ResultStatus reads provisional vs final', () => {
  const { rerender } = render(<ResultStatus final={false} isCreole={false} />);
  expect(screen.getByText('Résultats provisoires')).toBeInTheDocument();
  rerender(<ResultStatus final isCreole={false} />);
  expect(screen.getByText('Résultats définitifs')).toBeInTheDocument();
});

it('expiryLine counts down from the duel’s own deadline', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  expect(expiryLine(now + 3 * 86_400_000 + 1000, false, now)).toMatch(/^Expire dans 3 jours/);
  expect(expiryLine(now + 5 * 3_600_000, false, now)).toBe('Expire dans 5 h');
  expect(expiryLine(now - 1, false, now)).toMatch(/^Expiré le/);
  expect(expiryLine(0, false, now)).toBeNull();
});
