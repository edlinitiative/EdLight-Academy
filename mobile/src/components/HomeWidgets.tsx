import React from 'react';
import { View, Text } from 'react-native';
import { ClipboardList, Zap, Trophy, BookOpen, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useLeaderboard } from '../hooks/useLeaderboard';
import PressableScale from './ui/PressableScale';
import { colors, radius, cardSurface } from '../theme/theme';

interface WidgetProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub: string;
  tint: string; // icon-tile background
  accessibilityLabel: string;
  onPress?: () => void;
}

function Widget({ icon, title, value, sub, tint, accessibilityLabel, onPress }: WidgetProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        flex: 1,
        ...cardSurface,
        padding: 14,
        minHeight: 112,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.tile,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
        <ChevronRight color="#cbd5e1" size={16} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Text
          style={{ color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.4, lineHeight: 23 }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
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
  recommendedCourse,
}: HomeWidgetsProps) {
  const { myRank } = useLeaderboard(25);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1, gap: 12 }}>
        <Widget
          icon={<ClipboardList color={colors.azure} size={19} />}
          tint={colors.azureSoft}
          title={t('Examens Bac', 'Egzamen Bak')}
          value={t("S'entraîner", 'Antrene')}
          sub={t('Sujets officiels', 'Sijè ofisyèl')}
          accessibilityLabel={t('Examens Bac', 'Egzamen Bak')}
          onPress={onNavigateExams}
        />
        <Widget
          icon={<Zap color={colors.coral} size={19} />}
          tint={colors.coralSoft}
          title={t('Défi du jour', 'Defi jodi a')}
          value={t('Jouer', 'Jwe')}
          sub={t('+50 XP bonus', '+50 XP boni')}
          accessibilityLabel={t('Défi du jour', 'Defi jodi a')}
          onPress={onNavigateDaily ?? onNavigateTrivia}
        />
      </View>
      <View style={{ flex: 1, gap: 12 }}>
        <Widget
          icon={<Trophy color={colors.azure} size={19} />}
          tint={colors.azureSoft}
          title={t('Classement', 'Klasman')}
          value={myRank ? `#${myRank}` : '—'}
          sub={t('Cette semaine', 'Semèn sa a')}
          accessibilityLabel={t('Classement', 'Klasman')}
          onPress={onNavigateTrivia}
        />
        <Widget
          icon={<BookOpen color={colors.azure} size={19} />}
          tint={colors.azureSoft}
          title={recommendedCourse ? t('Continuer', 'Kontinye') : t('Mes cours', 'Kou mwen yo')}
          value={
            recommendedCourse
              ? (recommendedCourse.name?.slice(0, 14) ?? t('Cours', 'Kou'))
              : enrolledCount > 0
                ? `${enrolledCount}`
                : t('Explorer', 'Eksplore')
          }
          sub={recommendedCourse ? (recommendedCourse.level ?? t('cours', 'kou')) : t('Catalogue', 'Katalòg')}
          accessibilityLabel={recommendedCourse ? t('Continuer le cours', 'Kontinye kou a') : t('Mes cours', 'Kou mwen yo')}
          onPress={onNavigateCourses}
        />
      </View>
    </View>
  );
}
