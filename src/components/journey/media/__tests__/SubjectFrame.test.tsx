import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import SubjectFrame, { subjectKey } from '../SubjectFrame';

const GOOD = 'https://i.ytimg.com/vi/6oKYUnJMdOw/sd3.jpg';
// FNrikFcFAMg (Chimie NS1 1.7) is in lessonFrames' NO_GOOD_FRAME list.
const WEAK = 'https://i.ytimg.com/vi/FNrikFcFAMg/sddefault.jpg';

test('subject codes normalise across spellings, unknown is neutral', () => {
  expect(subjectKey('CHEM')).toBe('chem');
  expect(subjectKey('chemistry')).toBe('chem');
  expect(subjectKey('Mathematics')).toBe('math');
  expect(subjectKey('PHYS')).toBe('phys');
  expect(subjectKey('economics')).toBe('econ');
  expect(subjectKey('SVT')).toBe('svt');
  expect(subjectKey('history')).toBe('neutral');
  expect(subjectKey('')).toBe('neutral');
});

test('a good still renders on the subject mat', () => {
  const { container } = render(<SubjectFrame subject="CHEM" still={GOOD} size="lg" />);
  const root = container.firstChild as HTMLElement;
  expect(root.className).toContain('sf--chem');
  expect(root.className).toContain('sf--lg');
  expect(root.className).toContain('sf--still');
  expect(container.querySelector('img')?.getAttribute('src')).toBe(GOOD);
  expect(container.querySelector('.sf__art')).toBeNull();
});

test('missing or weak stills render subject artwork, never an empty block', () => {
  for (const still of [null, undefined, '', WEAK]) {
    const { container, unmount } = render(<SubjectFrame subject="chem" still={still as any} label="Chimie" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.sf__art path')).not.toBeNull();
    expect(container.querySelector('.sf__pill')?.textContent).toBe('Chimie');
    unmount();
  }
});

test('a still that fails to load, or is YouTube\'s 120px placeholder, falls back to artwork', () => {
  const a = render(<SubjectFrame subject="MATH" still={GOOD} />);
  fireEvent.error(a.container.querySelector('img')!);
  expect(a.container.querySelector('img')).toBeNull();
  expect(a.container.querySelector('.sf__art')).not.toBeNull();

  const b = render(<SubjectFrame subject="MATH" still={GOOD} />);
  const img = b.container.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: 120 });
  fireEvent.load(img);
  expect(b.container.querySelector('img')).toBeNull();
});

test('decorative by default; named when alt is given; play disc and sm hide the pill', () => {
  const { container, rerender } = render(<SubjectFrame subject="ECON" play size="sm" label="Économie" />);
  const root = container.firstChild as HTMLElement;
  expect(root.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('.sf__play')).not.toBeNull();
  expect(container.querySelector('.sf__pill')).toBeNull();
  rerender(<SubjectFrame subject="ECON" alt="Offre et demande" />);
  const named = container.firstChild as HTMLElement;
  expect(named.getAttribute('role')).toBe('img');
  expect(named.getAttribute('aria-label')).toBe('Offre et demande');
  expect(named.className).toContain('sf--md');
});
