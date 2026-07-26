import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Target, ChevronRight } from 'lucide-react-native';
import { useReadiness } from '../hooks/useReadiness';
import { getSubjectColor, SUBJECT_COLORS } from '../utils/shared';
import useStore from '../contexts/store';
import { useTheme, typeScale, type Palette } from '../theme/theme';
import { LoadingState } from './StateViews';

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(pct: number, c: Palette): string {
  if (pct < 40) return c.danger;
  if (pct < 60) return c.warn;
  if (pct < 75) return c.warn;
  if (pct < 90) return c.success;
  return c.success;
}

function scoreLabel(pct: number, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  if (pct < 40) return t('À travailler', 'Pou travay');
  if (pct < 60) return t('En progrès', 'N ap pwogrese');
  if (pct < 75) return t('Bien', 'Byen');
  if (pct < 90) return t('Très bien', 'Trè byen');
  return t('Excellent !', 'Ekselan !');
}

function subjectColor(name: string, c: Palette): string {
  const key = String(name || '').toUpperCase();
  return key in SUBJECT_COLORS ? getSubjectColor(key) : c.muted;
}

export default function ReadinessCard({ onFocusPress }: { onFocusPress?: (subject: string) => void } = {}) {
  const { overall, subjects, focus, hasData, isLoading } = useReadiness() as any;
  const { colors, cardSurface } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  if (isLoading) {
    return (
      <View style={{ ...cardSurface, padding: 16 }}>
        <LoadingState message="" />
      </View>
    );
  }

  const pct = Math.round(overall ?? 0);
  // No exam attempts yet → neutral ring with "—" (PWA behaviour), not a red 0%.
  const stroke = hasData ? scoreColor(pct, colors) : colors.border;
  const dashArray = hasData ? (pct / 100) * CIRCUMFERENCE : 0;

  // Top subjects by coefficient weight, descending
  const topSubjects = (subjects || []).slice(0, 5);

  // Weakest subject for focus
  const focusSubject = focus?.subject ?? (topSubjects.length ? topSubjects[topSubjects.length - 1]?.subject : null);
  const focusColor = focusSubject ? subjectColor(focusSubject, colors) : colors.azure;

  return (
    <View style={{ ...cardSurface, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Target color={colors.azure} size={18} />
        <Text style={[typeScale.title, { color: colors.ink }]}>{t('Score de préparation', 'Nòt preparasyon')}</Text>
      </View>

      <View className="flex-row items-center gap-5">
        {/* Donut ring */}
        <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={104} height={104} style={{ position: 'absolute' }}>
            {/* Track */}
            <Circle
              cx={52} cy={52} r={RADIUS}
              fill="none"
              stroke={colors.surfaceAlt}
              strokeWidth={14}
            />
            {/* Progress arc — omitted entirely with no data (a rounded cap at
                0% would still paint a stray dot on the track) */}
            {hasData && (
              <Circle
                cx={52} cy={52} r={RADIUS}
                fill="none"
                stroke={stroke}
                strokeWidth={14}
                strokeDasharray={`${dashArray} ${CIRCUMFERENCE}`}
                strokeLinecap="round"
                rotation={-90}
                origin="52, 52"
              />
            )}
          </Svg>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[typeScale.h1, { color: hasData ? colors.ink : colors.faint }]}>
              {hasData ? `${pct}%` : '—'}
            </Text>
            {hasData && (
              <Text style={[typeScale.overline, { color: colors.muted }]}>
                {scoreLabel(pct, isCreole)}
              </Text>
            )}
          </View>
        </View>

        {/* Subject bars */}
        <View className="flex-1 gap-2">
          {topSubjects.length === 0 ? (
            <Text style={[typeScale.label, { color: colors.muted }]}>
              {t(
                'Passe ton premier examen pour débloquer ton score de préparation 🎯',
                'Fè premye egzamen ou pou debloke nòt preparasyon ou 🎯',
              )}
            </Text>
          ) : (
            topSubjects.map((s: any) => {
              const sPct = Math.round(s.pct ?? 0);
              const color = subjectColor(s.subject, colors);
              const label = String(s.subject || '');
              return (
                <View key={s.subject}>
                  <View className="flex-row items-center justify-between mb-0.5">
                    <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
                    <Text style={[typeScale.caption, { color }]}>{sPct}%</Text>
                  </View>
                  <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceAlt }}>
                    <View
                      className="h-1.5 rounded-full"
                      style={{ backgroundColor: color, width: `${sPct}%` }}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Focus recommendation — tappable only when the parent wires a handler
          (e.g. Profile/Dashboard route it to Exams). Without one it renders as a
          plain callout, never a chevron that does nothing when tapped. */}
      {focusSubject && (() => {
        const inner = (
          <>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.caption, { color: focusColor }]}>
                {t('Focus recommandé', 'Konsantrasyon rekòmande')}
              </Text>
              <Text style={[typeScale.bodyMd, { color: colors.ink }]} className="mt-0.5" numberOfLines={1}>
                {focusSubject}
              </Text>
            </View>
            {onFocusPress ? <ChevronRight color={focusColor} size={18} /> : null}
          </>
        );
        return onFocusPress ? (
          <TouchableOpacity
            onPress={() => onFocusPress(focusSubject)}
            className="mt-3 flex-row items-center justify-between rounded-xl px-3 py-2.5"
            style={{ backgroundColor: focusColor + '15' }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t(`S'entraîner en ${focusSubject}`, `Antrene nan ${focusSubject}`)}
          >
            {inner}
          </TouchableOpacity>
        ) : (
          <View
            className="mt-3 flex-row items-center justify-between rounded-xl px-3 py-2.5"
            style={{ backgroundColor: focusColor + '15' }}
          >
            {inner}
          </View>
        );
      })()}
    </View>
  );
}
