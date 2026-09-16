/**
 * mathRouting — decide how a string of mixed prose + math should be rendered.
 *
 * KaTeX's auto-render walks text nodes and typesets only the segments wrapped
 * in $…$, \(…\) or \[…\]. Exam and quiz content, however, frequently ships
 * UNDELIMITED LaTeX ("36\sqrt{\frac{2}{7}}", "\alpha^2 = 3"). Those strings
 * still *look* mathy, so they used to be handed to the KaTeX WebView, where
 * auto-render found no delimiters and left the raw source on screen.
 *
 * Splitting the decision out of the component keeps it testable: delimited
 * math goes to KaTeX, everything else goes through `mathToText`, which turns
 * LaTeX into readable Unicode.
 */

/** Paired math delimiters — the only thing KaTeX auto-render will typeset. */
export const HAS_DELIMITED_MATH = /\$[^$\n]+\$|\\\(|\\\[/;

export function needsKatex(text: string | null | undefined): boolean {
  return HAS_DELIMITED_MATH.test(String(text ?? ''));
}
