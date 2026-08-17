import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { GraduationCap, Landmark, ClipboardList, Gamepad2, BookOpen, RefreshCw, ChevronRight, Sparkles, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { pickHomeSuggestion, gradeProfile, type HomeSuggestionKind } from '../config/trackConfig';
import { useReviewQueue } from '../hooks/useReviewQueue';
import PressableScale from './ui/PressableScale';
import { resetTabToRoot } from '../navigation/navHelpers';
import { radius, useTheme, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';

/** The fields any Home suggestion card needs to render. */
type CardConfig = {
  Icon: typeof GraduationCap;
  colors: [string, string, string];
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  onPress: () => void;
  dismissKey: string;
};

/**
 * "Recommandé pour toi" — a single season-aware Home card. Priority order:
 *   1. Spaced repetition — if the student has reviews due today (Adaptive Engine,
 *      Slice 2), nudge them to revise first; it's time-sensitive and decays.
 *   2. Otherwise the grade/season heuristic (pickHomeSuggestion): pick a filière,
 *      switch to Préfac once the Bac is over, revise for an upcoming Bac, etc.
 * Each card is dismissible (review dismisses for the day; others per season).
 * Renders nothing when there's nothing to nudge.
 */
export default function SmartSuggestion() {
  const navigation = useNavigation<any>();
  const { shadow } = useTheme();
  const { track, grade, language, dismissedSuggestionKey, setDismissedSuggestion } = useStore();
  const { reviewQueue } = useReviewQueue();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // The 3rd tab is named "Exams" for every grade, but Quiz-primary grades
  // (7e–8e, NS1–NS3) mount QuizNavigator behind it, which has no ExamLanding
  // route — naming the wrong screen would make these cards dead for them.
  const practiceRoot = gradeProfile(grade).primaryTab === 'Quiz' ? 'Quizzes' : 'ExamLanding';

  const card = pickCard();
  if (!card || card.dismissKey === dismissedSuggestionKey) return null;

  return renderCard(card);

  // ── Card selection ─────────────────────────────────────────────────────────
  function pickCard(): CardConfig | null {
    // 1) Reviews due today take precedence — dismissible for the day only.
    if (reviewQueue.length > 0) {
      const dayStamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const n = reviewQueue.length;
      const topSubject = reviewQueue[0].subject;
      return {
        Icon: RefreshCw,
        colors: ['#10B981', '#059669', '#047857'],
        eyebrow: t('À réviser aujourd’hui', 'Pou revize jodi a'),
        title: n === 1
          ? t('1 sujet à revoir', '1 sijè pou revize')
          : t(`${n} sujets à revoir`, `${n} sijè pou revize`),
        subtitle: topSubject
          ? t(`Reprends ${topSubject} pour ancrer tes acquis.`, `Reprann ${topSubject} pou konsolide sa w konnen.`)
          : t('Une courte révision pour ancrer tes acquis.', 'Yon ti revizyon pou konsolide sa w konnen.'),
        cta: t('Réviser', 'Revize'),
        // Reset, don't navigate: React Navigation 7's `navigate` no longer pops
        // back to a screen already in the stack — it pushes a second copy of the
        // root over whatever the tab retained (a stale exam). See navHelpers.
        onPress: () => resetTabToRoot(navigation, 'Exams', practiceRoot),
        dismissKey: `review-${dayStamp}`,
      };
    }

    // 2) Grade/season heuristic (existing behaviour).
    const suggestion = pickHomeSuggestion({ track, grade });
    if (!suggestion) return null;
    const copy = homeCopy()[suggestion.kind];
    return { ...copy, dismissKey: suggestion.key };
  }

  // ── Presentational card (shared by both branches) ────────────────────────────
  function renderCard(c: CardConfig) {
    return (
      <PressableScale
        onPress={() => { tapLight(); c.onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={`${c.title}. ${c.cta}`}
        style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: radius.card, overflow: 'hidden', ...shadow.lg, shadowColor: c.colors[1] }}
      >
        <LinearGradient colors={c.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 15 }}>
          {/* Eyebrow + dismiss */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Sparkles color="#fde68a" size={13} />
            <Text style={[typeScale.overline, { marginLeft: 5, flex: 1, color: 'rgba(255,255,255,0.9)' }]}>
              {c.eyebrow}
            </Text>
            <TouchableOpacity
              onPress={() => { tapLight(); setDismissedSuggestion(c.dismissKey); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('Ignorer', 'Inyore')}
            >
              <X color="rgba(255,255,255,0.75)" size={16} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <c.Icon color="#ffffff" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.titleSm, { color: '#ffffff' }]}>{c.title}</Text>
              <Text style={[typeScale.caption, { color: 'rgba(255,255,255,0.88)', marginTop: 2 }]}>{c.subtitle}</Text>
            </View>
          </View>

          {/* CTA chip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.chip, paddingLeft: 13, paddingRight: 9, paddingVertical: 7 }}>
            <Text style={[typeScale.bodyMd, { color: '#ffffff' }]}>{c.cta}</Text>
            <ChevronRight color="#ffffff" size={16} />
          </View>
        </LinearGradient>
      </PressableScale>
    );
  }

  // ── Copy for the grade/season heuristic kinds ────────────────────────────────
  function homeCopy(): Record<HomeSuggestionKind, Omit<CardConfig, 'dismissKey'>> {
    return {
      'choose-track': {
        Icon: GraduationCap,
        colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t('Choisis ta filière', 'Chwazi seri ou'),
        subtitle: t('Pour des recommandations sur mesure.', 'Pou rekòmandasyon ki fèt pou ou.'),
        cta: t('Choisir', 'Chwazi'),
        onPress: () => resetTabToRoot(navigation, 'Exams', practiceRoot),
      },
      'prefac-switch': {
        Icon: Landmark,
        colors: ['#0EA5C4', '#0891B2', '#0E7490'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t('Le Bac est passé 🎓', 'Bak la fini 🎓'),
        subtitle: t(
          "Prochaine étape : prépare les concours d'entrée à l'université.",
          'Pwochen etap: prepare konkou antre inivèsite yo.',
        ),
        cta: t('Explorer la Préfac', 'Eksplore Prefak'),
        // initial:false keeps ExamLanding under ExamBrowser so Back pops to the
        // level picker rather than exiting the tab.
        onPress: () =>
          navigation.navigate('Exams', { screen: 'ExamBrowser', initial: false, params: { level: 'university' } }),
      },
      'bac-focus': {
        Icon: ClipboardList,
        colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t('Le Bac approche', 'Bak la ap pwoche'),
        subtitle: t('Révise avec les vrais sujets officiels.', 'Revize ak vre sijè ofisyèl yo.'),
        cta: t("S'entraîner", 'Antrene'),
        onPress: () => resetTabToRoot(navigation, 'Exams', practiceRoot),
      },
      'trivia-first': {
        Icon: Gamepad2,
        colors: ['#7C3AED', '#6D28D9', '#5B21B6'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t('Apprends en jouant 🎮', 'Aprann ak jwèt 🎮'),
        subtitle: t('Des quiz rapides et des jeux pour progresser chaque jour.', 'Quiz rapid ak jwèt pou w pwogrese chak jou.'),
        cta: t('Jouer', 'Jwe'),
        onPress: () => navigation.navigate('Trivia'),
      },
      'cours-first': {
        Icon: BookOpen,
        colors: ['#0EA5C4', '#0891B2', '#0E7490'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t('Renforce tes bases', 'Ranfòse baz ou yo'),
        subtitle: t('Suis tes cours et teste-toi avec des quiz ciblés.', 'Swiv kou ou yo epi teste tèt ou ak quiz.'),
        cta: t('Voir les cours', 'Wè kou yo'),
        onPress: () => resetTabToRoot(navigation, 'Courses', 'CourseList'),
      },
      'exam9e-focus': {
        Icon: GraduationCap,
        colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
        eyebrow: t('Recommandé pour toi', 'Rekòmande pou ou'),
        title: t("Prépare l'examen de 9ᵉ", 'Prepare egzamen 9yèm'),
        subtitle: t("Entraîne-toi avec les vrais sujets de 9ème année.", 'Antrene ak vre sijè 9yèm ane yo.'),
        cta: t("S'entraîner", 'Antrene'),
        onPress: () => navigation.navigate('Exams', { screen: 'ExamBrowser', initial: false, params: { level: '9e' } }),
      },
    };
  }
}
