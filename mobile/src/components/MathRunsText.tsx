import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { mathToRuns, runsToText, type MathRun } from '../utils/mathText';

/**
 * Text with real exponents and indices, for the surfaces a KaTeX WebView cannot
 * reach (words flowing around an input, labels, answers).
 *
 * Unicode covers ² ⁻¹ ₙ but has no subscript G or d, so "x_G" or "Y_d" used to
 * reach students as "x_G" / "x_(G)". A raised or lowered run is drawn instead:
 * an inline View inside the Text, shifted off the baseline, with the run at
 * ~70% size. Inline views sit on the baseline on both platforms, so the shift
 * is measured from there.
 */
export function ScriptRun({ run, fontSize, style }: { run: MathRun; fontSize: number; style?: StyleProp<TextStyle> }) {
  const small = Math.round(fontSize * 0.7);
  const shift = run.script === 'sup' ? -fontSize * 0.38 : fontSize * 0.2;
  return (
    <View style={{ transform: [{ translateY: shift }] }}>
      <Text style={[style, { fontSize: small, lineHeight: Math.round(small * 1.15) }]}>{run.text}</Text>
    </View>
  );
}

/** The children for a <Text>: plain runs as strings, script runs drawn. */
export function renderRuns(runs: MathRun[], fontSize: number, style?: StyleProp<TextStyle>, keyPrefix = 'r'): React.ReactNode[] {
  return runs.map((r, i) => (r.script
    ? <ScriptRun key={`${keyPrefix}${i}`} run={r} fontSize={fontSize} style={style} />
    : r.text));
}

/** A <Text> whose content may carry LaTeX-ish markup ("x_G", "Fe^{2+}"). */
export default function MathRunsText({ text, style, numberOfLines }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const runs = mathToRuns(String(text ?? ''));
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
  const inner = { color: flat.color, fontFamily: flat.fontFamily, fontWeight: flat.fontWeight } as TextStyle;
  if (!runs.some((r) => r.script)) return <Text style={style} numberOfLines={numberOfLines}>{runs.map((r) => r.text).join('')}</Text>;
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={runsToText(runs)}>
      {renderRuns(runs, fontSize, inner)}
    </Text>
  );
}
