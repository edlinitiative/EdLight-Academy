import React from 'react';
import { View, Text } from 'react-native';
import { ClipboardList, ListChecks, Trophy, Compass, Gamepad2 } from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { useLeaderboard } from '../hooks/useLeaderboard';
import PressableScale from './ui/PressableScale';
import { useColors, useTheme, typeScale } from '../theme/theme';

/** Append an 8-bit alpha to a 6-digit hex color (e.g. "#1B6FE0" + 0.12). */
function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}

interface TileProps {
  icon: React.ReactNode;
  accent: string;
  label: string;
  /** Tiny secondary line under the label (e.g. "#2" on Classement). */
  sublabel?: string;
  accessibilityLabel: string;
  onPress?: () => void;
}

/** One compact action tile — icon chip over a short label, single row of four. */
function Tile({ icon, accent, label, sublabel, accessibilityLabel, onPress }: TileProps) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.96}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.tile,
          backgroundColor: tint(accent, 0.16),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={[typeScale.label, { color: colors.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[typeScale.micro, { color: colors.muted, marginTop: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

interface HomeWidgetsProps {
  onNavigateExams?: () => void;
  onNavigateTrivia?: () => void;
  onNavigateCourses?: () => void;
  onNavigateLeaderboard?: () => void;
  enrolledCount?: number;
  /** 'quiz' for Quiz-primary grades → the practice tile leads with quizzes. */
  practiceMode?: 'exams' | 'quiz';
}

/**
 * Quick actions — one row of four compact tiles (was a 2×2 grid of hero-sized
 * cards). The Défi du jour tile moved up into <MissionCard>, so this row is
 * pure navigation: practice, board, games, catalogue.
 */
export default function HomeWidgets({
  onNavigateExams,
  onNavigateTrivia,
  onNavigateCourses,
  onNavigateLeaderboard,
  enrolledCount = 0,
  practiceMode = 'exams',
}: HomeWidgetsProps) {
  const colors = useColors();
  const { isDark } = useTheme();
  const { myRank } = useLeaderboard(25);
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // In exams mode the tile leads with the exam that fits the grade — the Bac
  // label is a mismatch for a 9e or Post-Bac student.
  const examLevel = gradeProfile(grade).examLevel;
  const examsLabel =
    examLevel === 'universite'
      ? t('Concours', 'Konkou')
      : examLevel === '9eme_af'
        ? t('Examen 9e', 'Egzamen 9yèm')
        : t('Examens', 'Egzamen');

  // Per-tile accents. Blue/amber/green come from the theme palette (dark-aware);
  // violet has no palette token, so lift it on dark grounds to stay vivid.
  const blue = colors.azure;
  const amber = colors.warn;
  const violet = isDark ? '#a78bfa' : '#7c3aed';
  const green = colors.success;

  const ICON = 17;

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Tile
        icon={practiceMode === 'quiz' ? <ListChecks color={blue} size={ICON} /> : <ClipboardList color={blue} size={ICON} />}
        accent={blue}
        label={t("S'entraîner", 'Antrene')}
        sublabel={practiceMode === 'quiz' ? t('Quiz', 'Quiz') : examsLabel}
        accessibilityLabel={
          practiceMode === 'quiz'
            ? t("S'entraîner, Quiz", 'Antrene, Quiz')
            : `${t("S'entraîner", 'Antrene')}, ${examsLabel}`
        }
        onPress={onNavigateExams}
      />
      <Tile
        icon={<Trophy color={amber} size={ICON} />}
        accent={amber}
        label={t('Classement', 'Klasman')}
        sublabel={myRank ? `#${myRank}` : t('Nouveau', 'Nouvo')}
        accessibilityLabel={
          myRank
            ? `${t('Classement', 'Klasman')}, ${t('rang', 'ran')} ${myRank}`
            : t('Classement, nouveau', 'Klasman, nouvo')
        }
        onPress={onNavigateLeaderboard ?? onNavigateTrivia}
      />
      <Tile
        icon={<Gamepad2 color={violet} size={ICON} />}
        accent={violet}
        label={t('Jeux', 'Jwèt')}
        sublabel={t('Arcade', 'Akad')}
        accessibilityLabel={t('Jeux, arcade', 'Jwèt, akad')}
        onPress={onNavigateTrivia}
      />
      <Tile
        icon={<Compass color={green} size={ICON} />}
        accent={green}
        label={enrolledCount > 0 ? t('Mes cours', 'Kou mwen') : t('Explorer', 'Eksplore')}
        sublabel={t('Catalogue', 'Katalòg')}
        accessibilityLabel={
          enrolledCount > 0
            ? t('Continuer, mes cours', 'Kontinye, kou mwen yo')
            : t('Explorer le catalogue', 'Eksplore katalòg')
        }
        onPress={onNavigateCourses}
      />
    </View>
  );
}
