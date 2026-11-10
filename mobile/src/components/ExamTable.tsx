import React from 'react';
import { ScrollView, View } from 'react-native';
import { fonts, useColors } from '../theme/theme';
import MathRunsText from './MathRunsText';

/**
 * A table from exam text (see utils/tables): a quiet grid, header row on a
 * tinted band, hairline rules between rows only. Wide tables scroll sideways
 * instead of squeezing every column to a sliver.
 */
export default function ExamTable({ header, rows, fontSize = 15 }: { header: string[] | null; rows: string[][]; fontSize?: number }) {
  const colors = useColors();
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const minCell = width > 4 ? 84 : 72;
  const cell = (text: string, key: string, head: boolean, first: boolean) => (
    <View key={key} style={{ minWidth: minCell, flexGrow: 1, flexBasis: 0, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' }}>
      <MathRunsText
        text={text.replace(/\*\*([^*]+)\*\*/g, '$1') || ' '}
        style={{ fontSize, lineHeight: Math.round(fontSize * 1.35), color: colors.ink, fontFamily: head || first ? fonts.bold : fonts.regular, textAlign: first ? 'left' : 'center' }}
      />
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        {header ? (
          <View style={{ flexDirection: 'row', backgroundColor: colors.border }}>
            {header.map((h, i) => cell(h, `h${i}`, true, i === 0))}
          </View>
        ) : null}
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', borderTopWidth: ri === 0 && header ? 0 : ri === 0 ? 0 : 1, borderTopColor: colors.hairline }}>
            {r.map((c, ci) => cell(c, `${ri}-${ci}`, false, ci === 0))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
