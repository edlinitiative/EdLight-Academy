import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LessonComplete from '../LessonComplete';

let mockStreak: any = null;
jest.mock('../../hooks/useStreak', () => ({
  useStreak: () => ({ streak: mockStreak }),
}));
jest.mock('../../contexts/store', () => ({
  __esModule: true,
  default: (selector: any) => selector({ language: 'fr' }),
}));

/** Local YYYY-MM-DD, matching the component's own day key. */
function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const noop = () => {};

describe('LessonComplete', () => {
  beforeEach(() => { mockStreak = null; });

  it('renders nothing until the lesson is actually complete', () => {
    const { container } = render(
      <LessonComplete open={false} next={{ title: 'Les solutions' }} onContinue={noop} onDismiss={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the next lesson as the primary action', () => {
    render(
      <LessonComplete
        open
        next={{ title: 'Les solutions', unit: 'Unité 3' }}
        onContinue={noop}
        onDismiss={noop}
      />
    );
    expect(screen.getByText('Les solutions')).toBeInTheDocument();
    expect(screen.getByText('Unité 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuer/i })).toBeInTheDocument();
  });

  it('claims the streak only once today has been counted', () => {
    // The streak service writes today's date as part of recording activity. If
    // the cached query is still pre-write, quoting its count would show the
    // student yesterday's number for work they just did.
    mockStreak = { currentStreak: 3, activeDays: ['2020-01-01'] };
    const { rerender } = render(
      <LessonComplete open next={{ title: 'Les solutions' }} onContinue={noop} onDismiss={noop} />
    );
    expect(screen.queryByText(/d'affilée/)).not.toBeInTheDocument();

    mockStreak = { currentStreak: 4, activeDays: [today()] };
    rerender(
      <LessonComplete open next={{ title: 'Les solutions' }} onContinue={noop} onDismiss={noop} />
    );
    expect(screen.getByText(/4 jours d'affilée/)).toBeInTheDocument();
  });

  it('closes the course out instead of pointing nowhere on the last lesson', () => {
    render(<LessonComplete open next={null} onContinue={noop} onDismiss={noop} />);
    expect(screen.getByText(/terminé toutes les leçons/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^continuer$/i })).not.toBeInTheDocument();
  });
});
