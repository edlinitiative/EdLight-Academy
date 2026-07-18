import React, { useMemo } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import MathText from './MathText';
import useStore from '../contexts/store';

/**
 * Guided condition builder for domain / sign / inequality answers (PWA parity).
 *
 * Each condition shows a pre-filled left expression (rendered with MathText),
 * an operator picker (tappable > ≥ < ≤ = ≠), and a value field. The answer
 * serializes to a JSON array of { operator, value } aligned by row to
 * `question.conditions`, and is graded by gradeConditionsAnswer in examUtils —
 * the same shape and grader as the web app.
 */

const PRIMARY = '#0857A6';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e8edf5';
const OPS = ['>', '≥', '<', '≤', '=', '≠'];

type Row = { operator: string; value: string };

export default function ConditionBuilder({
  question,
  value,
  onChange,
}: {
  question: any;
  value: string;
  onChange: (v: string) => void;
}) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const conditions: any[] = question?.conditions || [];

  const rows: Row[] = useMemo(() => {
    let parsed: any[] = [];
    try {
      const p = typeof value === 'string' ? JSON.parse(value) : value;
      if (Array.isArray(p)) parsed = p;
      else if (p && Array.isArray(p.conditions)) parsed = p.conditions;
    } catch { /* no answer yet */ }
    return conditions.map((_, i) => ({
      operator: parsed[i]?.operator || '',
      value: parsed[i]?.value || '',
    }));
  }, [value, conditions]);

  const update = (i: number, patch: Partial<Row>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(JSON.stringify(next));
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED }}>
        {t('Complétez chaque condition :', 'Konplete chak kondisyon :')}
      </Text>
      {conditions.map((cond, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={{ minWidth: 44 }}>
            <MathText text={`$${cond.left}$`} style={{ fontSize: 18, color: TEXT }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {OPS.map((op) => {
              const selected = rows[i].operator === op;
              return (
                <TouchableOpacity
                  key={op}
                  onPress={() => update(i, { operator: op })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    width: 36,
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? PRIMARY : BORDER,
                    backgroundColor: selected ? PRIMARY : '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '700', color: selected ? '#ffffff' : TEXT }}>
                    {op}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={rows[i].value}
            onChangeText={(v) => update(i, { value: v })}
            placeholder={t('valeur', 'valè')}
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minWidth: 80,
              flexGrow: 1,
              maxWidth: 160,
              height: 40,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 8,
              paddingHorizontal: 10,
              fontSize: 15,
              color: TEXT,
              backgroundColor: '#ffffff',
            }}
          />
        </View>
      ))}
    </View>
  );
}
