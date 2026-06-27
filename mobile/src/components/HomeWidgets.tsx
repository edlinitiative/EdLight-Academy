import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ClipboardList, Zap, Trophy, BookOpen } from 'lucide-react-native';
import { useLeaderboard } from '../hooks/useLeaderboard';

interface WidgetProps {
  color: string;
  textColor: string;
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub: string;
  onPress?: () => void;
}

function Widget({ color, textColor, icon, title, value, sub, onPress }: WidgetProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="flex-1 rounded-2xl p-3.5 min-h-[100px] justify-between"
      style={{ backgroundColor: color }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="opacity-80">{icon}</View>
      </View>
      <View>
        <Text style={{ color: textColor, fontSize: 22, fontWeight: '800', lineHeight: 26 }}>{value}</Text>
        <Text style={{ color: textColor, fontSize: 11, fontWeight: '700', opacity: 0.85, marginTop: 1 }}>{title}</Text>
        <Text style={{ color: textColor, fontSize: 10, opacity: 0.65, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface HomeWidgetsProps {
  onNavigateExams?: () => void;
  onNavigateTrivia?: () => void;
  onNavigateCourses?: () => void;
  enrolledCount?: number;
  recommendedCourse?: any;
}

export default function HomeWidgets({
  onNavigateExams,
  onNavigateTrivia,
  onNavigateCourses,
  enrolledCount = 0,
  recommendedCourse,
}: HomeWidgetsProps) {
  const { myRank } = useLeaderboard(25);

  return (
    <View className="flex-row gap-2.5 px-5">
      {/* Row 1 */}
      <View className="flex-1 gap-2.5">
        <Widget
          color="#4338ca"
          textColor="#e0e7ff"
          icon={<ClipboardList color="#c7d2fe" size={20} />}
          title="Examens Bac"
          value="≥ 5 ans"
          sub="Révise maintenant"
          onPress={onNavigateExams}
        />
        <Widget
          color="#7c3aed"
          textColor="#ede9fe"
          icon={<Zap color="#ddd6fe" size={20} />}
          title="Défi quotidien"
          value="Trivia"
          sub="Gagne des XP"
          onPress={onNavigateTrivia}
        />
      </View>
      <View className="flex-1 gap-2.5">
        <Widget
          color="#d97706"
          textColor="#fef3c7"
          icon={<Trophy color="#fde68a" size={20} />}
          title="Mon classement"
          value={myRank ? `#${myRank}` : '—'}
          sub="Semaine en cours"
          onPress={onNavigateTrivia}
        />
        <Widget
          color="#059669"
          textColor="#d1fae5"
          icon={<BookOpen color="#a7f3d0" size={20} />}
          title={recommendedCourse ? 'Continuer' : 'Cours disponibles'}
          value={recommendedCourse ? (recommendedCourse.name?.slice(0, 16) ?? 'Cours') : enrolledCount > 0 ? `${enrolledCount} cours` : 'Explorer'}
          sub={recommendedCourse ? `${recommendedCourse.level ?? ''}` : 'Catalogue complet'}
          onPress={onNavigateCourses}
        />
      </View>
    </View>
  );
}
