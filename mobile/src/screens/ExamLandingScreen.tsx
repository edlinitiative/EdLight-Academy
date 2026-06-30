import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GraduationCap, ChevronRight, BookOpen, TrendingUp } from 'lucide-react-native';
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
    emoji: '🎓',
  },
  {
    id: '9e',
    label: '9ème Année',
    sublabel: 'Examens du cycle fondamental',
    description: 'Prépare les épreuves nationales de 9ème.',
    color: '#10b981',
    emoji: '📚',
  },
  {
    id: 'university',
    label: 'Université',
    sublabel: "Examens d'entrée et concours",
    description: 'Accès aux études supérieures.',
    color: '#7c3aed',
    emoji: '🏛️',
  },
];

const SUBJECTS = [
  { code: 'Mathématiques', color: '#2563eb', emoji: '📐' },
  { code: 'Physique', color: '#0857A6', emoji: '⚛️' },
  { code: 'Chimie', color: '#0891b2', emoji: '⚗️' },
  { code: 'SVT', color: '#10b981', emoji: '🌿' },
  { code: 'Français', color: '#d97706', emoji: '✍️' },
  { code: 'Anglais', color: '#7c3aed', emoji: '🌍' },
];

export default function ExamLandingScreen() {
  const navigation = useNavigation<Nav>();
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View className="px-5 pt-6 pb-5">
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 }}>
            {t('Examens', 'Egzamen yo')}
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            {t('Entraîne-toi avec des sujets officiels réels.', 'Pratike ak vrè sijè ofisyèl.')}
          </Text>
        </View>

        {/* Level cards */}
        <View className="px-5 gap-3">
          {LEVELS.map((level) => (
            <TouchableOpacity
              key={level.id}
              onPress={() => navigation.navigate('ExamBrowser', { level: level.id })}
              activeOpacity={0.82}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e8edf5',
                shadowColor: '#0857A6',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.07,
                shadowRadius: 8,
                elevation: 2,
                overflow: 'hidden',
                flexDirection: 'row',
              }}
            >
              {/* Left accent stripe */}
              <View style={{ width: 4, backgroundColor: level.color }} />

              <View style={{ flex: 1, padding: 16 }}>
                {/* Icon */}
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: level.color + '14',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{level.emoji}</Text>
                </View>

                <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 16, lineHeight: 22 }}>{level.label}</Text>
                <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4, lineHeight: 18 }}>{level.sublabel}</Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{level.description}</Text>

                {/* Explorer link */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 }}>
                  <Text style={{ color: level.color, fontSize: 14, fontWeight: '700' }}>
                    {t('Explorer', 'Eksplore')}
                  </Text>
                  <ChevronRight color={level.color} size={16} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Subject quick-links */}
        <View className="px-5 mt-6">
          <Text style={{ fontWeight: '700', color: '#0f172a', fontSize: 15, marginBottom: 12 }}>
            {t('Par matière', 'Pa matye')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUBJECTS.map((subj) => (
              <TouchableOpacity
                key={subj.code}
                onPress={() => navigation.navigate('ExamBrowser', { level: 'terminale', subject: subj.code })}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e8edf5',
                  borderRadius: 99,
                  shadowColor: '#0857A6',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <Text style={{ fontSize: 14 }}>{subj.emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>{subj.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
