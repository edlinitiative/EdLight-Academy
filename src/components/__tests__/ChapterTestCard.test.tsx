import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChapterTestCard from '../ChapterTestCard';
import { summarize, type ProgressMap } from '../../../shared/mastery';

// The chapter test is the ONLY route to `mastered`, and this card is the only
// way to reach it on the web. Two things matter enough to pin: it must not
// offer a whole-unit test to someone who hasn't practised anything (they'd
// fail a test that then can't promote anything), and it must not be silently
// unclickable when it IS available.
const summaryFor = (progress: ProgressMap, ids: string[]) => summarize(ids, progress);

describe('ChapterTestCard', () => {
  it('is locked, and says why, before anything has been practised', () => {
    const onStart = jest.fn();
    render(
      <ChapterTestCard summary={summaryFor({ a: { completed: true } }, ['a', 'b'])} onStart={onStart} />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // Watching the video is not practice — the copy has to name the way out.
    expect(screen.getByText(/exercices/i)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('unlocks once one lesson is practised, and starts the test', () => {
    const onStart = jest.fn();
    render(<ChapterTestCard summary={summaryFor({ a: { bestPct: 70 } }, ['a', 'b'])} onStart={onStart} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('stays available after the whole chapter is mastered', () => {
    // Nothing left to earn, but a student revising for an exam should still be
    // able to sit the test — it must not lock behind its own success.
    const onStart = jest.fn();
    render(
      <ChapterTestCard
        summary={summaryFor({ a: { masteredAt: 1 }, b: { masteredAt: 2 } }, ['a', 'b'])}
        onStart={onStart}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalled();
  });

  it('renders nothing for a unit with no lessons', () => {
    const { container } = render(<ChapterTestCard summary={summaryFor({}, [])} onStart={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the unit in its accessible label when given one', () => {
    // Several of these can exist across a course; the label is what tells a
    // screen-reader user which chapter this one belongs to.
    render(
      <ChapterTestCard
        summary={summaryFor({ a: { bestPct: 100 } }, ['a'])}
        onStart={() => {}}
        unitTitle="Nombres et Calcul"
      />,
    );
    expect(screen.getByRole('button', { name: /Nombres et Calcul/ })).toBeInTheDocument();
  });
});
