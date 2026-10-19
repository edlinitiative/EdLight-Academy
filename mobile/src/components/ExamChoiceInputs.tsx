import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import { normalizeOptions } from '../utils/examOptions';
import { parseMatchingKey } from '../utils/examUtils';
import { select } from '../utils/haptics';
import MathText from './MathText';
import PressableScale from './ui/PressableScale';

/**
 * The two exam inputs the web had and the phone did not (src/pages/ExamTake.tsx
 * MultiSelectInput / MatchingInput). Both store exactly what the web stores, so
 * the shared grader and a cross-device resume read them the same way:
 *  - multiple_select → JSON array of option keys, e.g. '["a","c","d"]';
 *  - matching        → JSON map of left key → right key, e.g. '{"1":"b"}'.
 * Before this, both fell through to one free-text box.
 */

function parseJson<T>(value: string, fallback: T): T {
  if (!value) return fallback;
  try { return (JSON.parse(value) as T) ?? fallback; } catch { return fallback; }
}

export function MultiSelectAnswer({ question, value, onChange }: {
  question: any;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const { radius } = useTheme();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const entries = normalizeOptions(question?.options);
  const picked = useMemo(() => {
    const p = parseJson<unknown>(value, []);
    return Array.isArray(p) ? p.map(String) : [];
  }, [value]);

  const toggle = (key: string) => {
    select();
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    onChange(next.length ? JSON.stringify(next) : '');
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={[typeScale.label, { color: colors.muted }]}>{t('Plusieurs réponses possibles', 'Plizyè repons posib')}</Text>
      {entries.map(({ key, label }) => {
        const on = picked.includes(key);
        return (
          <PressableScale
            key={key}
            onPress={() => toggle(key)}
            pressedScale={0.98}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${key.toUpperCase()}. ${label}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 56, borderRadius: radius.card,
              borderWidth: 1.5, borderColor: on ? colors.azure : colors.border, backgroundColor: on ? colors.azureSoft : colors.surface,
            }}
          >
            <View style={{
              width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
              borderWidth: on ? 0 : 1.5, borderColor: colors.border, backgroundColor: on ? colors.azureFill : 'transparent',
            }}>
              {on ? <Check color="#ffffff" size={16} strokeWidth={3} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <MathText text={label} style={{ fontSize: 16, lineHeight: 22, color: colors.ink }} />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** True when the phone can draw the structured matching input for `question`. */
export function hasStructuredMatching(question: any): boolean {
  const parsed = parseMatchingKey(question);
  return !!parsed && parsed.leftItems.length >= 2;
}

export function MatchingAnswer({ question, value, onChange }: {
  question: any;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const { radius } = useTheme();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const parsed = useMemo(() => parseMatchingKey(question), [question]);
  const sel = useMemo(() => {
    const p = parseJson<Record<string, string>>(value, {});
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  }, [value]);
  if (!parsed) return null;
  const { leftItems, rightOptions } = parsed as { leftItems: { key: string; text?: string }[]; rightOptions: { key: string; text?: string }[] };
  const showLegend = rightOptions.some((o) => o.text);
  const matched = leftItems.filter((it) => sel[it.key]).length;

  const setMatch = (left: string, right: string) => {
    select();
    const next = { ...sel };
    if (next[left] === right) delete next[left]; else next[left] = right;
    onChange(Object.keys(next).length ? JSON.stringify(next) : '');
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={[typeScale.label, { color: colors.muted }]}>
        {matched}/{leftItems.length} {t('associés', 'asosye')}
      </Text>
      {showLegend ? (
        <View style={{ gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.surfaceAlt }}>
          {rightOptions.map((o) => (
            <View key={o.key} style={{ flexDirection: 'row', gap: 6 }}>
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink }}>{o.key.toUpperCase()}.</Text>
              <View style={{ flex: 1 }}><MathText text={o.text || '—'} style={{ fontSize: 15, lineHeight: 21, color: colors.ink }} /></View>
            </View>
          ))}
        </View>
      ) : null}
      {leftItems.map((it) => (
        <View key={it.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, color: colors.ink }}>{String(it.key).toUpperCase()}.</Text>
            {it.text ? <View style={{ flex: 1 }}><MathText text={it.text} style={{ fontSize: 16, lineHeight: 22, color: colors.ink }} /></View> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {rightOptions.map((o) => {
              const on = sel[it.key] === o.key;
              return (
                <PressableScale
                  key={o.key}
                  onPress={() => setMatch(it.key, o.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${t("Correspondance pour l'élément", 'Korespondans pou eleman')} ${it.key} : ${o.key.toUpperCase()}`}
                  style={{
                    minWidth: 44, height: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: on ? colors.azureFill : colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: on ? '#ffffff' : colors.ink }}>{o.key.toUpperCase()}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
