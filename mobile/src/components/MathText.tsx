import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColors } from '../theme/theme';

/**
 * Render mixed prose + LaTeX. The whole string is NOT LaTeX — only the
 * segments delimited by $…$ / $$…$$ / \(…\) are. KaTeX's auto-render walks the
 * text nodes and typesets just those, so plain French sentences stay plain
 * (the old code fed the entire sentence to katex.render, which painted it in
 * KaTeX's red error style and clipped it at a fixed height).
 *
 * The WebView reports its rendered height back through postMessage so long,
 * wrapping questions are never cut off.
 */
const KATEX_HTML = (text: string, display: boolean, ink: string) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
  body {
    margin: 0; padding: 2px;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 16px; line-height: 1.5; color: ${ink};
    background: transparent;
  }
  /* KaTeX inherits currentColor, so themed body color carries into the math. */
  .katex { font-size: ${display ? '1.15em' : '1.05em'}; color: ${ink}; }
</style>
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
        // Offline / slow network: KaTeX never loaded. The raw text is already
        // in the (themed) body color; strip the delimiters so it reads cleaner.
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
// paired $…$ delimiters or an actual TeX command.
const HAS_MATH = /\$[^$]+\$|\\\(|\\\[|\\frac|\\sqrt|\\int|\\sum|\\prod|\\lim|\\pm|\\times|\\cdot|\\div/;

interface MathTextProps {
  text: string;
  display?: boolean;
  style?: any;
}

export function MathText({ text, display = false, style }: MathTextProps) {
  const colors = useColors();
  const safeText = String(text ?? '');
  const hasMath = HAS_MATH.test(safeText);
  const [height, setHeight] = useState(display ? 44 : 28);
  const html = useMemo(() => KATEX_HTML(safeText, display, colors.ink), [safeText, display, colors.ink]);

  if (!safeText) return null;
  // Themed ink is the default text color so plain prose is legible in dark mode
  // too; callers can still override via `style`.
  if (!hasMath) return <Text style={[{ color: colors.ink }, style]}>{safeText}</Text>;

  return (
    <WebView
      source={{ html }}
      style={{ height, backgroundColor: 'transparent', ...style }}
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
