import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GraduationCap, ChevronRight, BookOpen, Landmark, Check,
  Calculator, Atom, FlaskConical, Leaf, PenLine, Globe,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamLanding'>;

const TRACKS = [
  { code: 'SVT', shortLabel: 'SVT' },
  { code: 'SMP', shortLabel: 'SMP' },
  { code: 'SES', shortLabel: 'SES' },
  { code: 'LETT', shortLabel: 'LETT' },
  { code: 'TEC', shortLabel: 'TEC' },
];

const LEVELS = [
  {
    id: 'terminale',
    label: 'Terminale (Bac)',
    sublabel: 'Examens officiels du Baccalauréat',
    description: 'Révise les sujets des 5 dernières années.',
    Icon: GraduationCap,
  },
  {
    id: '9e',
    label: '9ème Année',
    sublabel: 'Examens du cycle fondamental',
    description: 'Prépare les épreuves nationales de 9ème.',
    Icon: BookOpen,
  },
  {
    id: 'university',
    label: 'Université',
    sublabel: "Examens d'entrée et concours",
    description: 'Accès aux études supérieures.',
    Icon: Landmark,
  },
];

const SUBJECTS = [
  { code: 'Mathématiques', Icon: Calculator },
  { code: 'Physique', Icon: Atom },
  { code: 'Chimie', Icon: FlaskConical },
  { code: 'SVT', Icon: Leaf },
  { code: 'Français', Icon: PenLine },
  { code: 'Anglais', Icon: Globe },
];

export default function ExamLandingScreen() {
  const navigation = useNavigation<Nav>();
  const { language, track, setTrack, setOnboardingCompleted } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  function pickTrack(code: string) {
    setTrack(code);
    setOnboardingCompleted(true);
    navigation.navigate('ExamBrowser', { level: 'terminale' });
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
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
            <View
              key={level.id}
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
                overflow: 'hidden',
              }}
            >
              <TouchableOpacity
                onPress={() => navigation.navigate('ExamBrowser', { level: level.id })}
                activeOpacity={0.82}
                style={{ flexDirection: 'row' }}
              >
                <View style={{ flex: 1, padding: 16 }}>
                  {/* Icon */}
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: '#eaf2fb',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <level.Icon color="#0857A6" size={24} />
                  </View>

                  <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 16, lineHeight: 22 }}>{level.label}</Text>
                  <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4, lineHeight: 18 }}>{level.sublabel}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{level.description}</Text>

                  {/* Explorer link */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 }}>
                    <Text style={{ color: '#0857A6', fontSize: 14, fontWeight: '700' }}>
                      {t('Explorer', 'Eksplore')}
                    </Text>
                    <ChevronRight color="#0857A6" size={16} />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Track (filière) chips — only for Terminale */}
              {level.id === 'terminale' && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#94a3b8', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
                    {t('Ma filière', 'Seri mwen')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {TRACKS.map((tr) => {
                      const active = track === tr.code;
                      return (
                        <TouchableOpacity
                          key={tr.code}
                          onPress={() => pickTrack(tr.code)}
                          activeOpacity={0.75}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 99,
                            borderWidth: 1,
                            borderColor: active ? '#0857A6' : '#e8edf5',
                            backgroundColor: active ? '#eaf2fb' : '#f8faff',
                          }}
                        >
                          {active && <Check color="#0857A6" size={12} />}
                          <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#0857A6' : '#64748b' }}>
                            {tr.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Subject quick-links */}
        <View className="px-5 mt-6">
          <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 16, marginBottom: 12 }}>
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
                  shadowRadius: 6,
                  elevation: 1,
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#eaf2fb', alignItems: 'center', justifyContent: 'center' }}>
                  <subj.Icon color="#0857A6" size={13} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>{subj.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
