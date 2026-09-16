import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useColors, useTheme, typeScale } from '../theme/theme';
import useStore from '../contexts/store';

/**
 * One input per blank, for questions whose text carries more than one blank.
 *
 * 883 of the 2291 fill_blank questions in the catalog have two or more blanks
 * ("... unis par une ____ liaison tandis qu'on trouve une ____ liaison ..."),
 * but the app only ever drew a single "Complétez le blanc…" box, so one of the
 * answers was literally impossible to give. The PWA has handled this for a
 * while (`FillBlankText` in src/pages/ExamTake.tsx) with inline inputs; on a
 * phone, inline fields inside wrapping text are cramped and easy to mis-tap, so
 * the blanks are numbered in the sentence (①②③…) and answered in a labeled row
 * each — the same shape the scaffold answers already use.
 *
 * Values are stored pipe-joined ("val1|val2"), the format the shared grader
 * splits per blank, so web and mobile attempts stay interchangeable.
 */

/** Authored blanks are runs of 4+ underscores or dots. Matches the PWA. */
export const BLANK_RE = /_{4,}|\.{4,}/g;

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const circled = (i: number) => CIRCLED[i] ?? `(${i + 1})`;

export function countBlanks(text: string): number {
  return (String(text ?? '').match(BLANK_RE) ?? []).length;
}

/** Split a pipe-joined value into exactly `count` entries. */
export function splitValues(value: string, count: number): string[] {
  const parts = String(value ?? '').split('|');
  return Array.from({ length: count }, (_, i) => parts[i] ?? '');
}

export default function FillBlankAnswer({
  text,
  value,
  onChange,
}: {
  text: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const { radius, shadow } = useTheme();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const segments = useMemo(() => String(text ?? '').split(BLANK_RE), [text]);
  const count = Math.max(segments.length - 1, 0);
  const values = splitValues(value, count);

  // A parenthetical right after a blank labels it, e.g. "____ (plan)".
  const hints = useMemo(
    () => segments.slice(1).map((seg) => seg.match(/^\s*\(([^)]+)\)/)?.[1] ?? ''),
    [segments],
  );

  const setBlank = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    // Trailing empties are kept so blank 2 still lands in slot 2 when blank 1
    // is left empty — the grader matches by position. But when EVERY blank is
    // empty, emit '' rather than "|": a pipe-only string is a non-empty value,
    // so typing a character and deleting it would otherwise leave the question
    // counted as answered in the header, the submit warning and the draft.
    const joined = next.join('|');
    onChange(next.some((v2) => v2.trim() !== '') ? joined : '');
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={[typeScale.label, { color: colors.muted }]}>
        {t(`Complète les ${count} blancs`, `Ranpli ${count} espas vid yo`)}
      </Text>

      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            {
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: values[i] ? colors.azure : colors.border,
              padding: 14,
              gap: 8,
            },
            shadow.sm,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16, color: colors.azure }}>{circled(i)}</Text>
            <Text style={[typeScale.label, { color: colors.ink, flex: 1 }]}>
              {hints[i] || t(`Blanc ${i + 1}`, `Espas ${i + 1}`)}
            </Text>
          </View>
          <TextInput
            value={values[i]}
            onChangeText={(v) => setBlank(i, v)}
            placeholder={t('Ta réponse…', 'Repons ou…')}
            placeholderTextColor={colors.faint}
            accessibilityLabel={
              hints[i]
                ? `${t('Blanc', 'Espas')} ${i + 1}, ${hints[i]}`
                : `${t('Blanc', 'Espas')} ${i + 1}`
            }
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.control,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              color: colors.ink,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The question sentence with each blank replaced by its circled number, so the
 * student can see which input fills which hole.
 */
export function numberBlanks(text: string): string {
  let i = 0;
  return String(text ?? '').replace(BLANK_RE, () => {
    const marker = ` ${circled(i)} `;
    i += 1;
    return marker;
  });
}
