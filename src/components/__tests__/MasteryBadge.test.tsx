import React from 'react';
import { render, screen } from '@testing-library/react';
import MasteryBadge from '../MasteryBadge';
import { MASTERY_ORDER, lessonMastery, summarize } from '../../../shared/mastery';
import { toProgressMap } from '../../services/masteryService';

// The badge is the only place the mastery ladder becomes visible on the web, so
// what it does at each rung — and crucially what it does at ZERO — is worth
// pinning. "Quiet at zero" is a product rule, not a detail: a course nobody has
// started must not render a column of markers on every lesson.
describe('MasteryBadge', () => {
  it('renders nothing at `none`', () => {
    const { container } = render(<MasteryBadge level="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a missing level rather than throwing', () => {
    // Real callers pass lessonMastery(map[id]) where the id may be undefined.
    const { container } = render(<MasteryBadge level={undefined as any} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names every earned rung in French', () => {
    const expected = {
      seen: 'Vu',
      familiar: 'Familier',
      proficient: 'Solide',
      mastered: 'Maîtrisé',
    };
    for (const [level, label] of Object.entries(expected)) {
      const { unmount } = render(<MasteryBadge level={level as any} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('uses the Creole label when asked', () => {
    render(<MasteryBadge level="mastered" isCreole />);
    expect(screen.getByText('Metrize')).toBeInTheDocument();
  });

  it('carries the level as an accessible name when the label is hidden', () => {
    // dotOnly is used in the narrow sidebar; without this the state would be
    // conveyed by colour alone, which is unreadable to a screen reader.
    render(<MasteryBadge level="familiar" dotOnly />);
    expect(screen.getByLabelText('Familier')).toBeInTheDocument();
    expect(screen.queryByText('Familier')).not.toBeInTheDocument();
  });

  it('paints each rung with a distinct role class, not a hardcoded colour', () => {
    const roles = MASTERY_ORDER.filter((l) => l !== 'none').map((level) => {
      const { container, unmount } = render(<MasteryBadge level={level} />);
      const cls = container.querySelector('.mastery-badge')!.className;
      unmount();
      return cls;
    });
    // Four earned rungs, four different role classes.
    expect(new Set(roles).size).toBe(4);
    expect(roles.every((c) => /mastery-badge--/.test(c))).toBe(true);
  });

  it('is not a pill: the wrapper borrows none of the chip utilities', () => {
    // Ted asked for every pill on every page to go. `chip` / `chip--*` are the
    // capsule utilities in index.css that used to be reached for here; guard
    // against someone "fixing" the styling later by pulling one back in.
    // (`mastery-badge--<role>` is this component's own modifier and is fine.)
    const { container } = render(<MasteryBadge level="mastered" />);
    const classes = container.querySelector('.mastery-badge')!.className.split(/\s+/);
    expect(classes.some((c) => c === 'chip' || c.startsWith('chip--') || c === 'pill')).toBe(false);
  });

  // The badge is only as good as the level handed to it, and both call sites
  // derive that from a raw Firestore progress doc. This is the seam where a
  // wrong reading would show a student the wrong state.
  describe('fed from a real progress doc', () => {
    const doc = {
      completedLessons: ['L1'],
      lessons: { L2: { bestPct: 80 }, L3: { bestPct: 100 }, L4: { masteredAt: 1 } },
    };

    it('shows the earned rung per lesson', () => {
      const map = toProgressMap(doc);
      const seen = ['L1', 'L2', 'L3', 'L4'].map((id) => lessonMastery(map[id]));
      expect(seen).toEqual(['seen', 'familiar', 'proficient', 'mastered']);
    });

    it('shows a unit at its weakest lesson, so a green chapter is worth something', () => {
      const map = toProgressMap(doc);
      const unit = summarize(['L1', 'L2', 'L3', 'L4'], map);
      render(<MasteryBadge level={unit.level} />);
      // L1 is only `seen`, so the chapter is `seen` however good the rest is.
      expect(screen.getByText('Vu')).toBeInTheDocument();
    });

    it('stays silent for a unit nobody has touched', () => {
      const unit = summarize(['A', 'B'], toProgressMap(null));
      const { container } = render(<MasteryBadge level={unit.level} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
