/**
 * The double transform, from TestFlight build 58 ("fix the display").
 *
 * The reported question is properly delimited in the catalog:
 *   Simplifier l'expression suivante $A = \sum_{k=1}^{n} \frac{k-e^{k}}{k!}$.
 * and rendered on the phone as "∑_(k=1)^n (k-e^(k))/(k!)" — the `mathToText`
 * fallback, on a string that should have been typeset.
 *
 * Nothing was wrong with the routing. The screens ran `mathToText` BEFORE
 * handing the text to `MathText`, which strips the `$…$`, so `needsKatex()`
 * was then asked about a string whose delimiters no longer existed. The KaTeX
 * path was unreachable for every delimited question in the app.
 *
 * These tests pin the invariant that matters: whatever a screen hands to
 * `MathText` must still carry its delimiters.
 */
import { needsKatex } from '../mathRouting';
import { mathToText } from '../mathText';
import { normalizeOptions } from '../examOptions';

const REPORTED = "Simplifier l'expression suivante $A = \\sum_{k=1}^{n} \\frac{k-e^{k}}{k!}$.";

describe('the reported question', () => {
  it('is delimited, so it routes to KaTeX', () => {
    expect(needsKatex(REPORTED)).toBe(true);
  });

  /* The exact mechanism of the bug, pinned so it cannot come back quietly. */
  it('stops routing to KaTeX the moment something pre-transforms it', () => {
    expect(needsKatex(mathToText(REPORTED))).toBe(false);
  });

  it('degrades to the string he photographed, proving the diagnosis', () => {
    const degraded = mathToText(REPORTED);
    expect(degraded).toContain('∑');
    expect(degraded).not.toContain('$');
  });
});

describe('normalizeOptions keeps math renderable', () => {
  it('leaves delimiters on the label it hands to MathText', () => {
    const opts = normalizeOptions(['$\\frac{1}{2}$', '$\\frac{3}{4}$']);
    expect(opts[0].label).toBe('$\\frac{1}{2}$');
    expect(needsKatex(opts[0].label)).toBe(true);
  });

  it('still grades on the raw value', () => {
    const opts = normalizeOptions(['$\\frac{1}{2}$']);
    expect(opts[0].value).toBe('$\\frac{1}{2}$');
  });

  it('keeps the letter keys object options grade against', () => {
    const opts = normalizeOptions({ a: '$x^2$', b: 'deux' });
    expect(opts.map((o) => o.value)).toEqual(['a', 'b']);
    expect(opts[0].label).toBe('$x^2$');
  });

  it('passes undelimited text through untouched, for MathText to degrade', () => {
    const opts = normalizeOptions(['36\\sqrt{2}']);
    expect(opts[0].label).toBe('36\\sqrt{2}');
    expect(needsKatex(opts[0].label)).toBe(false);
  });
});
