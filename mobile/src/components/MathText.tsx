import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { fonts, useColors } from '../theme/theme';
import { KATEX_CSS, KATEX_JS } from './katexAssets';
import { katexSource } from '../utils/mathRouting';
import { mathToRuns } from '../utils/mathText';
import { renderRuns } from './MathRunsText';
import ExamTable from './ExamTable';
import { hasTable, splitTables } from '../utils/tables';
import { proseSegments, stripProseMarks } from '../utils/proseMarks';

/**
 * Render mixed prose + LaTeX. The whole string is NOT LaTeX — only the
 * segments delimited by $…$ / $$…$$ / \(…\) are. KaTeX's auto-render walks the
 * text nodes and typesets just those, so plain French sentences stay plain
 * (the old code fed the entire sentence to katex.render, which painted it in
 * KaTeX's red error style and clipped it at a fixed height).
 *
 * TRUE OFFLINE: the KaTeX CSS (with every woff2 font inlined as a base64
 * data: URI), engine, and auto-render helper are all bundled via `katexAssets`
 * (snapshotted from the installed katex package by scripts/genKatexAssets.mjs).
 * Nothing is fetched from a CDN, so math typesets fully with zero network —
 * essential for the poor-connectivity contexts this app targets. If KaTeX ever
 * fails to run we still degrade gracefully to delimiter-stripped raw LaTeX in
 * the themed ink color.
 *
 * The WebView reports its rendered height back through postMessage so long,
 * wrapping questions are never cut off.
 */
const KATEX_HTML = (text: string, display: boolean, ink: string) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${KATEX_CSS}</style>
<style>
  body {
    margin: 0; padding: 2px;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 16px; line-height: 1.5; color: ${ink};
    background: transparent;
  }
  /* The text's own line breaks ("a) …\nb) …") are kept; HTML would run the
     sub-questions of a paper into one paragraph. */
  #math { white-space: pre-line; }
  /* KaTeX inherits currentColor, so themed body color carries into the math. */
  .katex { font-size: ${display ? '1.15em' : '1.05em'}; color: ${ink}; }
</style>
<script>${KATEX_JS}</script>
</head>
<body>
<div id="math"></div>
<script>
  function postHeight() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));
    }
  }
  document.addEventListener("DOMContentLoaded", function() {
    var el = document.getElementById("math");
    el.textContent = ${JSON.stringify(text)};
    try {
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\\\(', right: '\\\\)', display: false },
            { left: '\\\\[', right: '\\\\]', display: true },
          ],
          throwOnError: false,
        });
      } else {
        // Should not happen (KaTeX is bundled), but if the engine failed to
        // evaluate: the raw text is already in the (themed) body color; strip
        // the delimiters so it reads cleaner.
        el.textContent = el.textContent
          .replace(/\\$\\$?/g, '')
          .replace(/\\\\[()\\[\\]]/g, '');
      }
    } catch (e) { /* leave plain text in the themed ink color */ }
    postHeight();
    setTimeout(postHeight, 150);
    setTimeout(postHeight, 500);
  });
</script>
</body>
</html>
`;

// Only reach for the WebView when the text plausibly contains typeset math:
// paired $…$ delimiters or an actual TeX command. Exported so other surfaces
// (e.g. the Sandra chat) can route just the math-bearing lines through KaTeX.
export const HAS_MATH = /\$[^$]+\$|\\\(|\\\[|\\frac|\\sqrt|\\int|\\sum|\\prod|\\lim|\\pm|\\times|\\cdot|\\div/;

interface MathTextProps {
  text: string;
  display?: boolean;
  style?: any;
}

/**
 * Text that carries a table ("| Prix | Quantité |…" or "[Table: …]") is drawn
 * as prose blocks and real grids; everything else goes straight to the
 * formula/prose renderer below.
 */
export function MathText(props: MathTextProps) {
  const raw = String(props.text ?? '');
  if (!hasTable(raw)) return <MathTextBody {...props} />;
  const flat = StyleSheet.flatten(props.style) ?? {};
  const fontSize = typeof flat.fontSize === 'number' ? Math.min(flat.fontSize, 16) : 15;
  return (
    <View style={{ gap: 12, alignSelf: 'stretch' }}>
      {splitTables(raw).map((b, i) => (b.kind === 'table'
        ? <ExamTable key={i} header={b.header} rows={b.rows} fontSize={fontSize - 1} />
        : b.kind === 'code'
          ? <CodeBlock key={i} text={b.text} />
          : <MathTextBody key={i} {...props} text={b.text} />))}
    </View>
  );
}

/** A structural formula or diagram drawn in characters: monospaced, unwrapped. */
function CodeBlock({ text }: { text: string }) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}
      style={{ borderRadius: 12, backgroundColor: colors.surfaceAlt }}
      contentContainerStyle={{ padding: 14 }}>
      <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, lineHeight: 18, color: colors.ink }}>{text}</Text>
    </ScrollView>
  );
}

function MathTextBody({ text, display = false, style }: MathTextProps) {
  const colors = useColors();
  const rawText = String(text ?? '');
  // KaTeX only typesets DELIMITED segments. Undelimited LaTeX — which exam
  // content ships constantly ("36\sqrt{\frac{2}{7}}") — used to reach the
  // WebView, match no delimiters, and leave raw source on screen. Route it
  // through mathToText instead, which renders readable Unicode.
  // What KaTeX should typeset, or null for the plain path: delimited math,
  // a bare formula given its delimiters, prose words wrapped in \text{} — see
  // utils/mathRouting.
  const katex = katexSource(stripProseMarks(rawText));
  const useKatex = katex != null;
  const safeText = useKatex ? katex : rawText;
  const [height, setHeight] = useState(display ? 44 : 28);
  const html = useMemo(() => KATEX_HTML(safeText, display, colors.ink), [safeText, display, colors.ink]);

  if (!safeText) return null;
  // Plain path: prose with its bold runs, and every bit of LaTeX-ish markup
  // turned into text with real exponents and indices (MathRunsText).
  if (!useKatex) {
    const flat = StyleSheet.flatten(style) ?? {};
    const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
    const inner = { color: flat.color ?? colors.ink, fontFamily: flat.fontFamily };
    return (
      <Text style={[{ color: colors.ink }, style]}>
        {proseSegments(safeText).map((r, i) => (r.bold
          ? <Text key={i} style={{ fontFamily: fonts.bold }}>{renderRuns(mathToRuns(r.text), fontSize, { ...inner, fontFamily: fonts.bold }, `b${i}-`)}</Text>
          : <React.Fragment key={i}>{renderRuns(mathToRuns(r.text), fontSize, inner, `p${i}-`)}</React.Fragment>))}
      </Text>
    );
  }

  return (
    <WebView
      source={{ html }}
      // `backgroundColor: 'transparent'` alone only clears the surface on iOS —
      // on Android the native WebView still paints white, which hid every
      // formula in dark mode (near-white ink on white). `opaque={false}` makes
      // the Android surface genuinely transparent; it's a no-op on iOS.
      opaque={false}
      style={{ height, backgroundColor: 'transparent', ...StyleSheet.flatten(style) }}
      onMessage={(e) => {
        const h = Number(e.nativeEvent?.data);
        if (Number.isFinite(h) && h > 0) setHeight(Math.min(Math.max(h, 24), 800));
      }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      originWhitelist={['*']}
    />
  );
}

export function MathBlock({ latex }: { latex: string }) {
  return (
    <View className="my-2">
      <MathText text={`$$${String(latex ?? '')}$$`} display />
    </View>
  );
}

export default MathText;
