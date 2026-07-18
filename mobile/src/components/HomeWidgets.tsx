import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ClipboardList, Zap, Trophy, BookOpen, ChevronRight } from 'lucide-react-native';
import { useLeaderboard } from '../hooks/useLeaderboard';

interface WidgetProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub: string;
  onPress?: () => void;
}

function Widget({ icon, title, value, sub, onPress }: WidgetProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 14,
        minHeight: 110,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#e8edf5',
        shadowColor: '#0857A6',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#eaf2fb',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
        <ChevronRight color="#cbd5e1" size={14} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '800', letterSpacing: -0.5, lineHeight: 24 }} numberOfLines={1}>
          {value}
        </Text>
        <Text style={{ color: '#0f172a', fontSize: 12, fontWeight: '600', marginTop: 2 }}>{title}</Text>
        <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
    </TouchableOpacity>
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

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 10 }}>
        <Widget
          icon={<ClipboardList color="#0857A6" size={18} />}
          title="Examens Bac"
          value="≥ 5 ans"
          sub="Sujets officiels"
          onPress={onNavigateExams}
        />
        <Widget
          icon={<Zap color="#0857A6" size={18} />}
          title="Défi du jour"
          value="Jouer"
          sub="+50 XP bonus"
          onPress={onNavigateDaily ?? onNavigateTrivia}
        />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <Widget
          icon={<Trophy color="#0857A6" size={18} />}
          title="Classement"
          value={myRank ? `#${myRank}` : '—'}
          sub="Cette semaine"
          onPress={onNavigateTrivia}
        />
        <Widget
          icon={<BookOpen color="#0857A6" size={18} />}
          title={recommendedCourse ? 'Continuer' : 'Mes cours'}
          value={recommendedCourse ? (recommendedCourse.name?.slice(0, 14) ?? 'Cours') : enrolledCount > 0 ? `${enrolledCount}` : 'Explorer'}
          sub={recommendedCourse ? (recommendedCourse.level ?? 'cours') : 'Catalogue'}
          onPress={onNavigateCourses}
        />
      </View>
    </View>
  );
}
