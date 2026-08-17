import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GraduationCap, ChevronRight, BookOpen, Landmark, Check,
  Calculator, Atom, FlaskConical, Leaf, PenLine, Globe, Brain, HeartPulse, Lightbulb,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile, TRACKS as ALL_TRACKS, TRACK_LEVEL } from '../config/trackConfig';
import { useColors, useTheme, radius, gradients } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { tapLight } from '../utils/haptics';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamLanding'>;

// The Bac séries, straight from the canonical cross-platform config. This
// screen used to declare its own list with codes 'LETT' and 'TEC', which exist
// nowhere else: setTrack('LETT') then silently broke every consumer
// (TRACK_COEFFICIENTS['LETT'] is undefined → unweighted readiness, StudyPlan's
// TRACKS.find returns undefined, parseTrackDirectives never matches).
// PREFAC is excluded — these chips sit under the Terminale (Bac) card.
const TRACKS = ALL_TRACKS.filter((tr) => TRACK_LEVEL[tr.code] === 'baccalaureat');

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

// Subject quick-links per level — a Préfac student gets the concours pool
// (Culture Générale, Philo, Santé…), not the Bac subject list.
const SUBJECTS_BY_LEVEL: Record<string, Array<{ code: string; Icon: any }>> = {
  terminale: [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Physique', Icon: Atom },
    { code: 'Chimie', Icon: FlaskConical },
    { code: 'SVT', Icon: Leaf },
    { code: 'Français', Icon: PenLine },
    { code: 'Anglais', Icon: Globe },
  ],
  '9e': [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Physique', Icon: Atom },
    { code: 'Chimie', Icon: FlaskConical },
    { code: 'SVT', Icon: Leaf },
    { code: 'Français', Icon: PenLine },
    { code: 'Anglais', Icon: Globe },
  ],
  university: [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Culture Générale', Icon: Lightbulb },
    { code: 'Français', Icon: PenLine },
    { code: 'Philosophie', Icon: Brain },
    { code: 'Santé', Icon: HeartPulse },
    { code: 'Anglais', Icon: Globe },
  ],
};

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

  // The student's own exam level leads the page as a hero ("surround them with
  // THEIR content", per TestFlight feedback) — the other levels drop to a
  // compact secondary list instead of an undifferentiated stack of three.
  const EXAM_LEVEL_TO_ID: Record<string, string> = { baccalaureat: 'terminale', universite: 'university', '9eme_af': '9e' };
  const myLevelId = EXAM_LEVEL_TO_ID[gradeProfile(grade).examLevel ?? ''] ?? null;
  const myLevel = LEVELS.find((l) => l.id === myLevelId) ?? null;
  const otherLevels = myLevel ? LEVELS.filter((l) => l.id !== myLevel.id) : LEVELS;
  const subjectLevelId = myLevelId ?? 'terminale';
  const subjects = SUBJECTS_BY_LEVEL[subjectLevelId] ?? SUBJECTS_BY_LEVEL.terminale;

  function pickTrack(code: string) {
    setTrack(code);
    setOnboardingCompleted(true);
    navigation.navigate('ExamBrowser', { level: 'terminale' });
  }

  // Track (filière) chips — under the Terminale card/hero only.
  const trackChips = (onHero: boolean) => (
    <View style={{ paddingTop: onHero ? 14 : 2, paddingBottom: onHero ? 0 : 14, paddingHorizontal: onHero ? 0 : 16 }}>
      <Text style={[typeScale.overline, { color: onHero ? 'rgba(255,255,255,0.75)' : colors.faint, marginBottom: 8 }]}>
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
                borderColor: onHero
                  ? (active ? '#ffffff' : 'rgba(255,255,255,0.35)')
                  : (active ? colors.azure : colors.border),
                backgroundColor: onHero
                  ? (active ? '#ffffff' : 'rgba(255,255,255,0.14)')
                  : (active ? colors.azureSoft : colors.surfaceAlt),
              }}
            >
              {active && <Check color={colors.azure} size={12} />}
              <Text style={[typeScale.label, {
                color: onHero ? (active ? colors.azure : '#ffffff') : (active ? colors.azure : colors.muted),
              }]}>
                {tr.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

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

        {/* My level — the hero, when we know who the student is */}
        {myLevel && (
          <View className="px-5">
            <PressableScale
              onPress={() => { tapLight(); navigation.navigate('ExamBrowser', { level: myLevel.id }); }}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={t(myLevel.label, myLevel.labelHt)}
            >
              <LinearGradient
                colors={gradients.hero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.hero, padding: 18 }}
              >
                <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.75)' }]}>
                  {t('Ma préparation', 'Preparasyon mwen')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <View
                    style={{
                      width: 52, height: 52, borderRadius: 14,
                      backgroundColor: 'rgba(255,255,255,0.16)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <myLevel.Icon color="#ffffff" size={26} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[typeScale.h2, { color: '#ffffff' }]}>{t(myLevel.label, myLevel.labelHt)}</Text>
                    <Text style={[typeScale.caption, { color: '#bfdbfe', marginTop: 2 }]} numberOfLines={2}>
                      {t(myLevel.description, myLevel.descriptionHt)}
                    </Text>
                  </View>
                </View>

                {myLevel.id === 'terminale' && trackChips(true)}

                <View
                  style={{
                    marginTop: 16, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9,
                  }}
                >
                  <Text style={[typeScale.titleSm, { color: colors.azure }]}>
                    {t('Explorer mes sujets', 'Gade sijè mwen yo')}
                  </Text>
                  <ChevronRight color={colors.azure} size={16} />
                </View>
              </LinearGradient>
            </PressableScale>
          </View>
        )}

        {/* Subject quick-links — scoped to the student's level */}
        <View className="px-5 mt-6">
          <Text style={[typeScale.title, { color: colors.ink, marginBottom: 12 }]}>
            {t('Par matière', 'Pa matyè')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {subjects.map((subj) => (
              <PressableScale
                key={subj.code}
                onPress={() => navigation.navigate('ExamBrowser', { level: subjectLevelId, subject: subj.code })}
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

        {/* Other levels — compact secondary rows (the full stack when no grade) */}
        <View className="px-5 mt-6 gap-3">
          {myLevel && (
            <Text style={[typeScale.overline, { color: colors.faint }]}>
              {t('Autres niveaux', 'Lòt nivo yo')}
            </Text>
          )}
          {otherLevels.map((level) => (
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

              {/* Track (filière) chips — only when Terminale renders as a plain card (no grade chosen) */}
              {!myLevel && level.id === 'terminale' && trackChips(false)}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
