import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GraduationCap, ChevronRight, BookOpen, Landmark, Check,
  Calculator, Atom, FlaskConical, Leaf, PenLine, Globe,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { useColors, useTheme } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
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
    labelHt: 'Tèminal (Bak)',
    sublabel: 'Examens officiels du Baccalauréat',
    sublabelHt: 'Egzamen ofisyèl Bakaloreya a',
    description: 'Révise les sujets des 5 dernières années.',
    descriptionHt: 'Revize sijè 5 dènye ane yo.',
    Icon: GraduationCap,
  },
  {
    id: '9e',
    label: '9ème Année',
    labelHt: '9yèm Ane',
    sublabel: 'Examens du cycle fondamental',
    sublabelHt: 'Egzamen sik fondamantal la',
    description: 'Prépare les épreuves nationales de 9ème.',
    descriptionHt: 'Prepare eprèv nasyonal 9yèm yo.',
    Icon: BookOpen,
  },
  {
    id: 'university',
    label: 'Université',
    labelHt: 'Inivèsite',
    sublabel: "Examens d'entrée et concours",
    sublabelHt: 'Egzamen antre ak konkou',
    description: 'Accès aux études supérieures.',
    descriptionHt: 'Aksè nan etid siperyè.',
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
  const colors = useColors();
  const { cardSurface, typeScale, shadow } = useTheme();
  const centerColumn = useContentContainerStyle('readable', { fill: true }); // iPad: center short hub content vertically
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, track, grade, setTrack, setOnboardingCompleted } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Lead with the level that matches the student's grade (prefac → Université
  // first, 9e → 9ème first, etc.) so the relevant path is the top card.
  const EXAM_LEVEL_TO_ID: Record<string, string> = { baccalaureat: 'terminale', universite: 'university', '9eme_af': '9e' };
  const myLevelId = EXAM_LEVEL_TO_ID[gradeProfile(grade).examLevel ?? ''] ?? null;
  const orderedLevels = myLevelId
    ? [...LEVELS].sort((a, b) => (a.id === myLevelId ? -1 : b.id === myLevelId ? 1 : 0))
    : LEVELS;

  function pickTrack(code: string) {
    setTrack(code);
    setOnboardingCompleted(true);
    navigation.navigate('ExamBrowser', { level: 'terminale' });
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View className="px-5 pt-6 pb-5">
          <Text style={[typeScale.display, { color: colors.ink }]}>
            {t('Examens', 'Egzamen yo')}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>
            {t('Entraîne-toi avec des sujets officiels réels.', 'Pratike ak vrè sijè ofisyèl.')}
          </Text>
        </View>

        {/* Level cards */}
        <View className="px-5 gap-3">
          {orderedLevels.map((level) => (
            <View
              key={level.id}
              style={[cardSurface, { overflow: 'hidden' }]}
            >
              <PressableScale
                onPress={() => navigation.navigate('ExamBrowser', { level: level.id })}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={t(level.label, level.labelHt)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
              >
                {/* Compact horizontal row — icon · title/sublabel · chevron.
                    Keeps the level cards short so "Par matière" stays above the
                    fold (was a tall vertical card with a redundant Explorer link). */}
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.azureSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <level.Icon color={colors.azure} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.title, { color: colors.ink }]}>{t(level.label, level.labelHt)}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                    {t(level.sublabel, level.sublabelHt)}
                  </Text>
                </View>
                <ChevronRight color={colors.faint} size={20} />
              </PressableScale>

              {/* Track (filière) chips — only for Terminale */}
              {level.id === 'terminale' && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 }}>
                  <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 8 }]}>
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
                            borderColor: active ? colors.azure : colors.border,
                            backgroundColor: active ? colors.azureSoft : colors.surfaceAlt,
                          }}
                        >
                          {active && <Check color={colors.azure} size={12} />}
                          <Text style={[typeScale.label, { color: active ? colors.azure : colors.muted }]}>
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
          <Text style={[typeScale.title, { color: colors.ink, marginBottom: 12 }]}>
            {t('Par matière', 'Pa matyè')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUBJECTS.map((subj) => (
              <PressableScale
                key={subj.code}
                onPress={() => navigation.navigate('ExamBrowser', { level: 'terminale', subject: subj.code })}
                accessibilityRole="button"
                accessibilityLabel={subj.code}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 99,
                  ...shadow.sm,
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <subj.Icon color={colors.azure} size={13} />
                </View>
                <Text style={[typeScale.label, { color: colors.muted }]}>{subj.code}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
