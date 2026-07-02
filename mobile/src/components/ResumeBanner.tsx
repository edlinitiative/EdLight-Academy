import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { History, Play, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { TabParamList } from '../navigation/TabNavigator';

type Nav = BottomTabNavigationProp<TabParamList>;

const ACCENT: Record<string, string> = {
  lesson: '#0857A6',
  exam: '#0857A6',
  quiz: '#0857A6',
};

const EYEBROW: Record<string, string> = {
  lesson: 'Leçon',
  exam: 'Examen',
  quiz: 'Quiz',
};

export default function ResumeBanner() {
  const navigation = useNavigation<Nav>();
  const lastActivity = useStore((s) => s.lastActivity);
  const clearActivity = useStore((s) => s.clearActivity);

  if (!lastActivity) return null;

  const accent = ACCENT[lastActivity.type] ?? '#0857A6';
  const eyebrow = EYEBROW[lastActivity.type] ?? 'Activité';

  function handleResume() {
    if (lastActivity!.type === 'exam') {
      navigation.navigate('Exams');
    } else {
      navigation.navigate('Courses');
    }
  }

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e8edf5',
        shadowColor: '#0857A6',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 10,
      }}
    >
      {/* Icon circle */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: accent + '18',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <History color={accent} size={18} />
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
          style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}
          numberOfLines={1}
        >
          {lastActivity.title}
        </Text>
        {lastActivity.subtitle ? (
          <Text
            style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}
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
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        <Play color="#ffffff" size={12} fill="#ffffff" />
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Reprendre</Text>
      </TouchableOpacity>

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={clearActivity}
        activeOpacity={0.82}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ flexShrink: 0 }}
      >
        <X color="#9ca3af" size={16} />
      </TouchableOpacity>
    </View>
  );
}
