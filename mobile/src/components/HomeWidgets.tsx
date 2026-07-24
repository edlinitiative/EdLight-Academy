import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ClipboardList, Zap, Trophy, Compass, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useLeaderboard } from '../hooks/useLeaderboard';
import PressableScale from './ui/PressableScale';
import { useColors, useTheme } from '../theme/theme';

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
  value: string;
  label: string;
  accessibilityLabel: string;
  onPress?: () => void;
}

/** A tonal action tile — soft gradient tint, icon chip, chevron, value + label. */
function Tile({ icon, accent, value, label, accessibilityLabel, onPress }: TileProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.97}
      style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}
    >
      <LinearGradient
        colors={[tint(accent, 0.16), tint(accent, 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          minHeight: 96,
          padding: 13,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tint(accent, 0.28),
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              backgroundColor: tint(accent, 0.18),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
          <ChevronRight color={tint(accent, 0.55)} size={16} />
        </View>
        <View style={{ marginTop: 8 }}>
          <Text
            style={{ color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

interface HomeWidgetsProps {
  onNavigateExams?: () => void;
  onNavigateTrivia?: () => void;
  onNavigateDaily?: () => void;
  onNavigateCourses?: () => void;
  enrolledCount?: number;
  recommendedCourse?: any;
}

export default function HomeWidgets({
  onNavigateExams,
  onNavigateTrivia,
  onNavigateDaily,
  onNavigateCourses,
  enrolledCount = 0,
}: HomeWidgetsProps) {
  const colors = useColors();
  const { isDark } = useTheme();
  const { myRank } = useLeaderboard(25);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Per-tile accents. Blue/amber/green come from the theme palette (dark-aware);
  // violet has no palette token, so lift it on dark grounds to stay vivid.
  const blue = colors.azure;
  const amber = colors.warn;
  const violet = isDark ? '#a78bfa' : '#7c3aed';
  const green = colors.success;

  const ICON = 18;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile
          icon={<ClipboardList color={blue} size={ICON} />}
          accent={blue}
          value={t("S'entraîner", 'Antrene')}
          label={t('Examens Bac', 'Egzamen Bak')}
          accessibilityLabel={t('Examens Bac', 'Egzamen Bak')}
          onPress={onNavigateExams}
        />
        <Tile
          icon={<Trophy color={amber} size={ICON} />}
          accent={amber}
          value={myRank ? `#${myRank}` : '—'}
          label={t('Classement', 'Klasman')}
          accessibilityLabel={t('Classement', 'Klasman')}
          onPress={onNavigateTrivia}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile
          icon={<Zap color={violet} size={ICON} />}
          accent={violet}
          value={t('+50 XP', '+50 XP')}
          label={t('Défi du jour', 'Defi jodi a')}
          accessibilityLabel={t('Défi du jour', 'Defi jodi a')}
          onPress={onNavigateDaily ?? onNavigateTrivia}
        />
        <Tile
          icon={<Compass color={green} size={ICON} />}
          accent={green}
          value={enrolledCount > 0 ? t('Continuer', 'Kontinye') : t('Explorer', 'Eksplore')}
          label={enrolledCount > 0 ? t('Mes cours', 'Kou mwen yo') : t('Catalogue', 'Katalòg')}
          accessibilityLabel={t('Mes cours', 'Kou mwen yo')}
          onPress={onNavigateCourses}
        />
      </View>
    </View>
  );
}
