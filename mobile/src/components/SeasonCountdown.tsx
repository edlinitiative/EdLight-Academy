import React from 'react';
import { View, Text, Animated } from 'react-native';
import { CalendarClock, GraduationCap } from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile, seasonAnchorYear } from '../config/trackConfig';
import { useTheme, radius, typeScale } from '../theme/theme';
import { useReduceMotion } from '../utils/motion';

/**
 * SeasonCountdown — a compact, grade-aware card that gives the student the one
 * date that matters to them, near the top of the Home:
 *   • NS4 / Bac (examLevel 'baccalaureat')  → "Bac dans X jours" (next July 5)
 *   • Post-Bac (examLevel 'universite')      → Préfac / concours prep framing
 *                                              (no fixed national date → no count)
 *   • 9e (examLevel '9eme_af')               → "Examen de 9ème dans X jours"
 *   • everything else (7e/8e, NS1–NS3)       → renders nothing
 *
 * The Bac anchor reuses seasonAnchorYear (the year of the next July-5 Bac session
 * on/after today) so it never drifts from currentPlanSeason. Bilingual FR/HT via
 * the file's t(fr, ht) pattern. A gentle fade-in respects reduce-motion.
 *
 * Deliberately QUIET: this is a date, not an action. Gradients on Home are
 * reserved for the hero and the single "Mission du jour" CTA — stacking a third
 * saturated card here made four blue blocks compete in one screen and cost real
 * vertical space (repeat TestFlight feedback: "be intentional about the sizes").
 * The day count still lands via a large azure numeral on a calm surface.
 */

/** Whole days from `from` until `date`, clamped at 0 (never negative). */
function daysUntil(date: Date, from: Date): number {
  return Math.max(0, Math.round((date.getTime() - from.getTime()) / 86_400_000));
}

export default function SeasonCountdown() {
  const { language, grade } = useStore();
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const reduceMotion = useReduceMotion();

  // Gentle entrance — instant when the OS asks for reduced motion.
  const anim = React.useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  React.useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [reduceMotion, anim]);

  // Only count down when we actually know the student's year — gradeProfile(null)
  // defaults to Bac, which showed a "Bac dans N jours" card to 7ᵉ-graders and
  // anyone who skipped the class question.
  const level = grade ? gradeProfile(grade).examLevel : null;

  // Resolve the card content from the grade's exam level. `null` → render nothing.
  let content:
    | {
        Icon: typeof CalendarClock;
        title: string;
        subtitle: string;
        days: number | null;
        accessibilityLabel: string;
      }
    | null = null;

  if (level === 'baccalaureat') {
    const now = new Date();
    const nextBac = new Date(seasonAnchorYear(now), 6, 5); // next July 5 session
    const days = daysUntil(nextBac, now);
    content = {
      Icon: CalendarClock,
      title: t('Bac', 'Bak'),
      subtitle: t('jusqu’à la prochaine session', 'jiska pwochen sesyon an'),
      days,
      accessibilityLabel: t(`Bac dans ${days} jours`, `Bak nan ${days} jou`),
    };
  } else if (level === 'universite') {
    // Post-Bac concours have no single national date, and a dateless "Prépare
    // les concours" card duplicated SmartSuggestion's prefac card right above
    // it. This component only earns its Home slot with a real countdown, so
    // université renders nothing.
    content = null;
  } else if (level === '9eme_af') {
    const now = new Date();
    const nextExam = new Date(seasonAnchorYear(now), 6, 5); // 9ème AF national exam ~ July
    const days = daysUntil(nextExam, now);
    content = {
      Icon: GraduationCap,
      title: t('Examen de 9ème', 'Egzamen 9yèm'),
      subtitle: t('jusqu’à l’examen national', 'jiska egzamen nasyonal la'),
      days,
      accessibilityLabel: t(`Examen de 9ème dans ${days} jours`, `Egzamen 9yèm nan ${days} jou`),
    };
  }

  // 7e/8e, NS1–NS3 (examLevel null) — nothing to count down to.
  if (!content) return null;

  const { Icon, title, subtitle, days, accessibilityLabel } = content;

  return (
    <Animated.View
      style={{
        paddingHorizontal: 20,
        marginBottom: 16,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
          },
        ],
      }}
    >
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={accessibilityLabel}
        style={{ ...cardSurface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.tile,
            backgroundColor: colors.azureSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon color={colors.azure} size={19} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        {/* Countdown badge — only when there's a real date to count toward. */}
        {days !== null && (
          <View style={{ alignItems: 'flex-end', minWidth: 52 }}>
            <Text style={[typeScale.h2, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>
              {days}
            </Text>
            <Text style={[typeScale.micro, { color: colors.faint, marginTop: -2 }]}>
              {days <= 1 ? t('jour', 'jou') : t('jours', 'jou')}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
