/**
 * GradeProgress — a grade-appropriate progress card.
 *
 * Shown on Profile in place of the Bac "Score de préparation" (ReadinessCard)
 * for NON-Bac grades, where a coefficient-weighted Bac readiness score would be
 * meaningless. Instead of an empty gap, it reflects the progress a student at
 * ANY grade actually has: level/XP, quizzes completed, courses followed and the
 * current streak — framed encouragingly for their grade.
 *
 * Self-contained: reads its own data from the store + trivia/streak hooks, the
 * same pattern ReadinessCard uses. Tokenized, bilingual FR/HT.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { TrendingUp, Zap, Target, BookOpen, Flame } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { gradeProfile } from '../config/trackConfig';
import { useTheme, typeScale, radius } from '../theme/theme';

/** One compact stat row: icon tile + value + label. */
function ProgressRow({
  icon,
  iconBg,
  value,
  label,
  last,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  label: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconBg,
        }}
      >
        {icon}
      </View>
      <Text style={[typeScale.bodyMd, { flex: 1, color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[typeScale.title, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A short, grade-appropriate motivating line. Mirrors the Home suggestion
 * framing: play-to-learn for 7e/8e, foundations for NS1–NS3, the national exam
 * for 9e, concours for Post-Bac.
 */
function motivationLine(grade: string | null | undefined, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (grade) {
    case '7e':
    case '8e':
      return t(
        'Chaque quiz te fait gagner des XP — continue à jouer pour apprendre !',
        'Chak quiz fè w genyen XP — kontinye jwe pou w aprann !',
      );
    case '9e':
      return t(
        'Continue comme ça — tu construis de bonnes bases pour l’examen de 9ᵉ.',
        'Kontinye konsa — w ap bati bon baz pou egzamen 9yèm nan.',
      );
    case 'NS1':
    case 'NS2':
    case 'NS3':
      return t(
        'Tu poses des bases solides. Régularité chaque jour = grands progrès.',
        'W ap poze bon baz. Regilarite chak jou = gwo pwogrè.',
      );
    case 'POSTBAC':
      return t(
        'Belle régularité — chaque session te rapproche de ton concours.',
        'Bèl regilarite — chak sesyon pwoche w de konkou w la.',
      );
    default:
      return t(
        'Continue sur ta lancée — chaque effort compte.',
        'Kontinye konsa — chak efò konte.',
      );
  }
}

export default function GradeProgress() {
  const { colors, cardSurface } = useTheme();
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const quizAttempts = useStore((s) => s.quizAttempts);
  const enrolledCourses = useStore((s) => s.enrolledCourses);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();

  const totalQuizzes = (Object.values(quizAttempts).flat() as unknown[]).length;
  const currentStreak = streak?.currentStreak ?? 0;
  const coursesCount = enrolledCourses.length;
  const xp = profile?.xp ?? 0;
  const levelNum = level?.level ?? 1;

  // Which practice surface leads for this grade decides whether "courses" is a
  // meaningful row: trivia-first grades (7e/8e) rarely follow courses, so lead
  // with the level/quiz stats and drop the courses row when it's empty.
  const leadsWithCours = gradeProfile(grade).lead[0] === 'cours';
  const showCourses = leadsWithCours || coursesCount > 0;

  const rows = [
    {
      key: 'level',
      icon: <Zap color={colors.azure} size={19} />,
      iconBg: colors.azureSoft,
      value: t(`Niveau ${levelNum}`, `Nivo ${levelNum}`),
      label: `${xp} XP`,
    },
    {
      key: 'quizzes',
      icon: <Target color={colors.azure} size={19} />,
      iconBg: colors.azureSoft,
      value: totalQuizzes,
      label: t('Quiz complétés', 'Quiz fini'),
    },
    ...(showCourses
      ? [{
          key: 'courses',
          icon: <BookOpen color={colors.azure} size={19} />,
          iconBg: colors.azureSoft,
          value: coursesCount,
          label: t('Cours suivis', 'Kou swivi'),
        }]
      : []),
    {
      key: 'streak',
      icon: <Flame color={colors.danger} size={19} />,
      iconBg: colors.dangerSoft,
      value: currentStreak,
      label: t('Jours de série', 'Jou seri'),
    },
  ];

  return (
    <View style={{ ...cardSurface, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <TrendingUp color={colors.azure} size={18} />
        <Text style={[typeScale.title, { color: colors.ink }]}>
          {t('Ta progression', 'Pwogrè ou')}
        </Text>
      </View>

      <View>
        {rows.map((r, i) => (
          <ProgressRow
            key={r.key}
            icon={r.icon}
            iconBg={r.iconBg}
            value={r.value}
            label={r.label}
            last={i === rows.length - 1}
          />
        ))}
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: radius.tile,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.azureSoft,
        }}
      >
        <Text style={[typeScale.caption, { color: colors.azure }]}>
          {motivationLine(grade, isCreole)}
        </Text>
      </View>
    </View>
  );
}
