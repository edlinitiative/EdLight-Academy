import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GraduationCap, ChevronRight, BookOpen, FlaskConical, Calculator, TrendingUp } from 'lucide-react-native';
import useStore from '../contexts/store';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamLanding'>;

const LEVELS = [
  {
    id: 'terminale',
    label: 'Terminale (Bac)',
    sublabel: 'Examens officiels du Baccalauréat',
    description: 'Révise les sujets des 5 dernières années.',
    color: '#0857A6',
    icon: GraduationCap,
    emoji: '🎓',
  },
  {
    id: '9e',
    label: '9ème Année',
    sublabel: 'Examens du cycle fondamental',
    description: 'Prépare les épreuves nationales de 9ème.',
    color: '#10b981',
    icon: BookOpen,
    emoji: '📚',
  },
  {
    id: 'university',
    label: 'Université',
    sublabel: 'Examens d\'entrée et concours',
    description: 'Accès aux études supérieures.',
    color: '#8b5cf6',
    icon: TrendingUp,
    emoji: '🏛️',
  },
];

export default function ExamLandingScreen() {
  const navigation = useNavigation<Nav>();
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View className="px-5 pt-6 pb-4">
          <Text className="text-2xl font-bold text-gray-900">
            {t('Examens du Bac', 'Egzamen Bac yo')}
          </Text>
          <Text className="text-gray-500 mt-1">
            {t('Entraîne-toi avec des sujets réels.', 'Pratike ak vrè sijè.')}
          </Text>
        </View>

        {/* Level cards */}
        <View className="px-5 gap-4">
          {LEVELS.map((level) => {
            const Icon = level.icon;
            return (
              <TouchableOpacity
                key={level.id}
                onPress={() => navigation.navigate('ExamBrowser', { level: level.id })}
                activeOpacity={0.85}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                <View className="h-1.5" style={{ backgroundColor: level.color }} />
                <View className="p-5 flex-row items-center gap-4">
                  <View
                    className="w-14 h-14 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: level.color + '18' }}
                  >
                    <Text className="text-3xl">{level.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-900 text-base">{level.label}</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">{level.sublabel}</Text>
                    <Text className="text-gray-400 text-xs mt-1">{level.description}</Text>
                  </View>
                  <ChevronRight color="#9ca3af" size={20} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Subject quick-links */}
        <View className="px-5 mt-6">
          <Text className="font-bold text-gray-900 mb-3">{t('Par matière', 'Pa matye')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {[
              { code: 'Mathématiques', color: '#4A93DD', emoji: '📐' },
              { code: 'Physique', color: '#0857A6', emoji: '⚛️' },
              { code: 'Chimie', color: '#0A66C2', emoji: '⚗️' },
              { code: 'SVT', color: '#10b981', emoji: '🌿' },
              { code: 'Français', color: '#f59e0b', emoji: '✍️' },
              { code: 'Anglais', color: '#8b5cf6', emoji: '🇬🇧' },
            ].map((subj) => (
              <TouchableOpacity
                key={subj.code}
                onPress={() => navigation.navigate('ExamBrowser', { level: 'terminale', subject: subj.code })}
                className="flex-row items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-full"
              >
                <Text>{subj.emoji}</Text>
                <Text className="text-sm font-medium text-gray-700">{subj.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
