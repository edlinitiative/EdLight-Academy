/**
 * A blank can sit INSIDE a formula ("… est $Df = ____ $"). Splitting there
 * leaves each side with an unmatched `$`, so neither renders as maths and the
 * student reads raw dollar signs. Close the formula before the blank and
 * reopen it after; a formula left empty by that ("$ $") is dropped.
 */
export function balanceMathAcrossBlanks(parts: string[]): string[] {
  const out = [...parts];
  const dollars = (str: string) => (str.replace(/\\\$/g, '').match(/\$/g) || []).length;
  for (let i = 0; i < out.length - 1; i += 1) {
    if (dollars(out[i]) % 2 === 1) {
      out[i] = `${out[i].replace(/\s+$/, '')}$ `;
      // The text after the blank either closes the formula at once (drop that
      // `$`, nothing is left inside) or continues it (reopen).
      out[i + 1] = /^\s*\$(?!\$)/.test(out[i + 1])
        ? out[i + 1].replace(/^\s*\$/, ' ')
        : `$${out[i + 1]}`;
    }
  }
  return out;
}
