import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const KATEX_HTML = (math: string, display: boolean) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<style>
  body { margin: 0; padding: 4px; font-family: system-ui; background: transparent; }
  .katex { font-size: ${display ? '1.1em' : '1em'}; }
</style>
</head>
<body>
<div id="math"></div>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    try {
      katex.render(${JSON.stringify(math)}, document.getElementById("math"), {
        throwOnError: false,
        displayMode: ${display},
      });
    } catch(e) {
      document.getElementById("math").textContent = ${JSON.stringify(math)};
    }
  });
</script>
</body>
</html>
`;

const HAS_MATH = /\$|\\\(|\\frac|\\sqrt|\\int|\\sum|\\prod|\\lim|\\pm|\\times/;

interface MathTextProps {
  text: string;
  display?: boolean;
  style?: any;
}

export function MathText({ text, display = false, style }: MathTextProps) {
  if (!text) return null;
  if (!HAS_MATH.test(text)) return <Text style={style}>{text}</Text>;

  const html = useMemo(() => KATEX_HTML(text, display), [text, display]);
  const h = display ? 60 : 32;

  return (
    <WebView
      source={{ html }}
      style={{ height: h, backgroundColor: 'transparent', ...style }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      originWhitelist={['*']}
    />
  );
}

export function MathBlock({ latex }: { latex: string }) {
  return (
    <View className="my-2">
      <WebView
        source={{ html: KATEX_HTML(latex, true) }}
        style={{ height: 60, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
      />
    </View>
  );
}

export default MathText;
