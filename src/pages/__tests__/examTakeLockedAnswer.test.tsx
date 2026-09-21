/**
 * Regression test for the locked-answer promise on the exam-taking screen.
 *
 * WHY THIS EXISTS. In immediate-feedback mode, checking a question awards its
 * grade once and `gradeQuestionImmediate` refuses to re-grade it, so the screen
 * now says so out loud: "Réponse vérifiée — elle ne peut plus être modifiée."
 *
 * The only thing enforcing that was `pointer-events: none` on the card, which
 * stops a mouse and nothing else. A keyboard user could still tab into the
 * radio group and arrow to another option: `answers[i]` changed while the
 * awarded grade stayed the one already recorded, so the submitted paper
 * disagreed with the mark and the sentence on screen was false. The fix is
 * `disabled` on the controls that write the answer — an attribute the browser
 * itself enforces for pointer, keyboard and form submission alike.
 *
 * This is pinned in a test because it is invisible in a screenshot.
 */
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('remark-math', () => ({ __esModule: true, default: () => undefined }));
jest.mock('rehype-katex', () => ({ __esModule: true, default: () => undefined }));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MCQInput } from '../ExamTake';

const question = {
  type: 'multiple_choice',
  question: 'Une question',
  options: { a: 'Premier', b: 'Deuxième', c: 'Troisième' },
};

describe('MCQInput lock', () => {
  it('lets the student change a choice while the question is still open', () => {
    const onChange = jest.fn();
    render(<MCQInput question={question} index={3} value="a" onChange={onChange} disabled={false} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.disabled)).toEqual([false, false, false]);
    fireEvent.click(radios[2]);
    expect(onChange).toHaveBeenCalledWith(3, 'c');
  });

  // NOTE: the assertions below check `disabled`, not "onChange was not called".
  // `fireEvent` dispatches a synthetic event straight at the node, which React
  // delivers whatever the element's disabled state is — so a "click did
  // nothing" assertion would pass here even with the bug present, and prove
  // nothing. `disabled` is the behaviour: pointer, keyboard and tab order are
  // all suppressed by the browser, which is what was missing. The end-to-end
  // keyboard path was checked in a real browser.
  it('disables every option once the answer is locked', () => {
    render(<MCQInput question={question} index={3} value="a" onChange={jest.fn()} disabled />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.disabled)).toEqual([true, true, true]);
    // `:disabled` is the selector the browser uses to take a control out of the
    // tab order — the keyboard route that defeated `pointer-events: none`.
    radios.forEach((r) => expect(r.matches(':disabled')).toBe(true));
    expect(radios[0].checked).toBe(true);
  });

  it('locks the fallback text field used when a question ships no options', () => {
    render(
      <MCQInput question={{ ...question, options: {} }} index={3} value="" onChange={jest.fn()} disabled />,
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });
});
