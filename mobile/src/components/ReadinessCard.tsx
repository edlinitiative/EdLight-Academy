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

  // Only subjects with a real attempt behind them. `subjects` is seeded from the
  // track's coefficient table, so as soon as a student picks a filière it holds
  // ~13 rows at pct:0 — which made this render five 0% bars (and skip the
  // encouraging empty copy below, since the array wasn't actually empty). That
  // "wall of zeros" is the exact thing the Home goal card was built to avoid.
  const withData = (subjects || []).filter((s: any) => s.hasData);
  const topSubjects = withData.slice(0, 5);

  // Weakest subject for focus — only meaningful once something has been scored.
  const focusSubject = hasData
    ? (focus?.subject ?? (topSubjects.length ? topSubjects[topSubjects.length - 1]?.subject : null))
    : null;
  const focusColor = focusSubject ? subjectColor(focusSubject, colors) : colors.azure;
  // Highest-coefficient subject — where a first mock exam is worth the most.
  const suggestedStart = (subjects || [])[0]?.subject ?? null;

  return (
    <View style={{ ...cardSurface, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Target color={colors.azure} size={18} />
        <Text style={[typeScale.title, { color: colors.ink }]}>{t('Score de préparation', 'Nòt preparasyon')}</Text>
      </View>

      <View className="flex-row items-center gap-5">
        {/* Donut ring */}
        <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Svg
            width={104}
            height={104}
            style={{ position: 'absolute' }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
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
          <View
            style={{ alignItems: 'center', justifyContent: 'center' }}
            accessible
            accessibilityLabel={
              hasData
                ? `${t('Score de préparation', 'Nòt preparasyon')}: ${pct} ${t('pour cent', 'pou san')}, ${scoreLabel(pct, isCreole)}`
                : `${t('Score de préparation', 'Nòt preparasyon')}: ${t('non disponible', 'poko disponib')}`
            }
          >
            <Text
              style={[typeScale.h1, { color: hasData ? colors.ink : colors.faint }]}
              maxFontSizeMultiplier={1.3}
            >
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
            <View>
              <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
                {t('Pas encore de score', 'Poko gen nòt')}
              </Text>
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
                {t(
                  'Fais un examen blanc pour voir où tu en es, matière par matière.',
                  'Fè yon egzamen blan pou wè kote ou ye, matyè pa matyè.',
                )}
              </Text>
              {onFocusPress && suggestedStart ? (
                <TouchableOpacity
                  onPress={() => onFocusPress(suggestedStart)}
                  activeOpacity={0.8}
                  className="mt-2 flex-row items-center self-start rounded-full px-3 py-2"
                  style={{ backgroundColor: colors.azureSoft }}
                  accessibilityRole="button"
                  accessibilityLabel={t('Commencer un examen blanc', 'Kòmanse yon egzamen blan')}
                >
                  <Text style={[typeScale.label, { color: colors.azure }]}>
                    {t('Commencer un examen blanc', 'Kòmanse yon egzamen blan')}
                  </Text>
                  <ChevronRight color={colors.azure} size={15} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            topSubjects.map((s: any) => {
              const sPct = Math.round(s.pct ?? 0);
              const color = subjectColor(s.subject, colors);
              const label = String(s.subject || '');
              return (
                <View
                  key={s.subject}
                  accessible
                  accessibilityLabel={`${label} ${sPct} ${t('pour cent', 'pou san')}`}
                >
                  <View className="flex-row items-center justify-between mb-0.5">
                    <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
                    <Text style={[typeScale.caption, { color }]} maxFontSizeMultiplier={1.3}>{sPct}%</Text>
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
