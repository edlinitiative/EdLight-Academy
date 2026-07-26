import React from 'react';
import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Landmark, GraduationCap } from 'lucide-react-native';
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
 */

/** Whole days from `from` until `date`, clamped at 0 (never negative). */
function daysUntil(date: Date, from: Date): number {
  return Math.max(0, Math.round((date.getTime() - from.getTime()) / 86_400_000));
}

export default function SeasonCountdown() {
  const { language, grade } = useStore();
  const { shadow } = useTheme();
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

  const level = gradeProfile(grade).examLevel;

  // Resolve the card content from the grade's exam level. `null` → render nothing.
  let content:
    | {
        Icon: typeof CalendarClock;
        colors: [string, string, string];
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
      colors: ['#2E6FE6', '#123A86', '#0A1F52'], // aurora — deep, focused
      title: t('Bac', 'Bak'),
      subtitle: t('jusqu’à la prochaine session', 'jiska pwochen sesyon an'),
      days,
      accessibilityLabel: t(`Bac dans ${days} jours`, `Bak nan ${days} jou`),
    };
  } else if (level === 'universite') {
    // Post-Bac concours have no single national date → encourage prep, don't count.
    content = {
      Icon: Landmark,
      colors: ['#0EA5C4', '#0891B2', '#0E7490'],
      title: t('Prépare les concours', 'Prepare konkou yo'),
      subtitle: t(
        'Entraîne-toi pour l’entrée à l’université.',
        'Antrene ou pou antre inivèsite.',
      ),
      days: null,
      accessibilityLabel: t(
        'Prépare les concours d’entrée à l’université',
        'Prepare konkou antre inivèsite yo',
      ),
    };
  } else if (level === '9eme_af') {
    const now = new Date();
    const nextExam = new Date(seasonAnchorYear(now), 6, 5); // 9ème AF national exam ~ July
    const days = daysUntil(nextExam, now);
    content = {
      Icon: GraduationCap,
      colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
      title: t('Examen de 9ème', 'Egzamen 9yèm'),
      subtitle: t('jusqu’à l’examen national', 'jiska egzamen nasyonal la'),
      days,
      accessibilityLabel: t(`Examen de 9ème dans ${days} jours`, `Egzamen 9yèm nan ${days} jou`),
    };
  }

  // 7e/8e, NS1–NS3 (examLevel null) — nothing to count down to.
  if (!content) return null;

  const { Icon, colors: grad, title, subtitle, days, accessibilityLabel } = content;

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
        style={{ borderRadius: radius.card, overflow: 'hidden', ...shadow.md }}
      >
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.tile,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon color="#fff" size={22} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[typeScale.titleSm, { color: '#fff' }]} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={[typeScale.caption, { color: 'rgba(255,255,255,0.88)', marginTop: 1 }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          </View>

          {/* Countdown badge — only when there's a real date to count toward. */}
          {days !== null && (
            <View style={{ alignItems: 'flex-end', minWidth: 56 }}>
              <Text style={[typeScale.h1, { color: '#fff' }]} maxFontSizeMultiplier={1.3}>
                {days}
              </Text>
              <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.88)', marginTop: -2 }]}>
                {days <= 1 ? t('jour', 'jou') : t('jours', 'jou')}
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>
    </Animated.View>
  );
}
