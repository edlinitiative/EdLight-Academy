import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { History, Play, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import { TabParamList } from '../navigation/TabNavigator';

type Nav = BottomTabNavigationProp<TabParamList>;

const EYEBROW: Record<string, string> = {
  lesson: 'Leçon',
  exam: 'Examen',
  quiz: 'Quiz',
};

const EYEBROW_HT: Record<string, string> = {
  lesson: 'Leson',
  exam: 'Egzamen',
  quiz: 'Quiz',
};

export default function ResumeBanner() {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface, shadow, radius } = useTheme();
  const lastActivity = useStore((s) => s.lastActivity);
  const clearActivity = useStore((s) => s.clearActivity);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  if (!lastActivity) return null;

  const accent = colors.azure;
  const eyebrow = t(EYEBROW[lastActivity.type] ?? 'Activité', EYEBROW_HT[lastActivity.type] ?? 'Aktivite');

  function handleResume() {
    const a = lastActivity!;
    // Deep-link into the actual exam / course, not just the tab. Previously this
    // only navigated to the tab root ('Exams' / 'Courses'), so tapping Reprendre
    // dropped the user on the exam list instead of reopening what they left off.
    if (a.type === 'exam') {
      (navigation as any).navigate('Exams', {
        screen: 'ExamTake',
        params: { level: a.level ?? '', examId: a.path },
      });
    } else {
      // lesson (path = courseId) → reopen the course
      (navigation as any).navigate('Courses', {
        screen: 'CourseDetail',
        params: { courseId: a.path, courseName: a.subtitle },
      });
    }
  }

  return (
    <View
      style={{
        ...cardSurface,
        ...shadow.md,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 10,
      }}
    >
      {/* Icon chip */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: accent + '18',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <History color={accent} size={19} />
      </View>

      {/* Text block */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 10, fontWeight: '600', color: accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}
          numberOfLines={1}
        >
          {eyebrow}
        </Text>
        <Text
          style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}
          numberOfLines={1}
        >
          {lastActivity.title}
        </Text>
        {lastActivity.subtitle ? (
          <Text
            style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}
            numberOfLines={1}
          >
            {lastActivity.subtitle}
          </Text>
        ) : null}
      </View>

      {/* Reprendre button */}
      <TouchableOpacity
        onPress={handleResume}
        activeOpacity={0.82}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: accent,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: radius.control,
          flexShrink: 0,
        }}
      >
        <Play color="#ffffff" size={12} fill="#ffffff" />
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>{t('Reprendre', 'Kontinye')}</Text>
      </TouchableOpacity>

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={clearActivity}
        activeOpacity={0.82}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ flexShrink: 0 }}
      >
        <X color={colors.faint} size={16} />
      </TouchableOpacity>
    </View>
  );
}
