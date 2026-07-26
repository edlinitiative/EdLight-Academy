import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { GraduationCap, Landmark, ClipboardList, Gamepad2, BookOpen, ChevronRight, Sparkles, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { pickHomeSuggestion, type HomeSuggestionKind } from '../config/trackConfig';
import PressableScale from './ui/PressableScale';
import { radius, useTheme, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';

/**
 * "Recommandé pour toi" — a single season-aware Home card. It reads the student's
 * filière (track) and the calendar (currentPlanSeason) to surface the one next
 * step that matters right now: pick a filière, switch to Préfac once the Bac is
 * over, or revise for an upcoming Bac. Dismissible per season (see the store's
 * dismissedSuggestionKey). Renders nothing when there's nothing to nudge.
 */
export default function SmartSuggestion() {
  const navigation = useNavigation<any>();
  const { shadow } = useTheme();
  const { track, grade, language, dismissedSuggestionKey, setDismissedSuggestion } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const suggestion = pickHomeSuggestion({ track, grade });
  if (!suggestion || suggestion.key === dismissedSuggestionKey) return null;

  const COPY: Record<HomeSuggestionKind, {
    Icon: typeof GraduationCap;
    colors: [string, string, string];
    title: string;
    subtitle: string;
    cta: string;
    onPress: () => void;
  }> = {
    'choose-track': {
      Icon: GraduationCap,
      colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
      title: t('Choisis ta filière', 'Chwazi seri ou'),
      subtitle: t('Pour des recommandations sur mesure.', 'Pou rekòmandasyon ki fèt pou ou.'),
      cta: t('Choisir', 'Chwazi'),
      onPress: () => navigation.navigate('Exams'),
    },
    'prefac-switch': {
      Icon: Landmark,
      colors: ['#0EA5C4', '#0891B2', '#0E7490'],
      title: t('Le Bac est passé 🎓', 'Bak la fini 🎓'),
      subtitle: t(
        "Prochaine étape : prépare les concours d'entrée à l'université.",
        'Pwochen etap: prepare konkou antre inivèsite yo.',
      ),
      cta: t('Explorer la Préfac', 'Eksplore Prefak'),
      onPress: () =>
        navigation.navigate('Exams', { screen: 'ExamBrowser', params: { level: 'university' } }),
    },
    'bac-focus': {
      Icon: ClipboardList,
      colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
      title: t('Le Bac approche', 'Bak la ap pwoche'),
      subtitle: t('Révise avec les vrais sujets officiels.', 'Revize ak vre sijè ofisyèl yo.'),
      cta: t("S'entraîner", 'Antrene'),
      onPress: () => navigation.navigate('Exams'),
    },
    'trivia-first': {
      Icon: Gamepad2,
      colors: ['#7C3AED', '#6D28D9', '#5B21B6'],
      title: t('Apprends en jouant 🎮', 'Aprann ak jwèt 🎮'),
      subtitle: t('Des quiz rapides et des jeux pour progresser chaque jour.', 'Quiz rapid ak jwèt pou w pwogrese chak jou.'),
      cta: t('Jouer', 'Jwe'),
      onPress: () => navigation.navigate('Trivia'),
    },
    'cours-first': {
      Icon: BookOpen,
      colors: ['#0EA5C4', '#0891B2', '#0E7490'],
      title: t('Renforce tes bases', 'Ranfòse baz ou yo'),
      subtitle: t('Suis tes cours et teste-toi avec des quiz ciblés.', 'Swiv kou ou yo epi teste tèt ou ak quiz.'),
      cta: t('Voir les cours', 'Wè kou yo'),
      onPress: () => navigation.navigate('Courses'),
    },
    'exam9e-focus': {
      Icon: GraduationCap,
      colors: ['#2E86F0', '#1B6FE0', '#0857A6'],
      title: t("Prépare l'examen de 9ᵉ", 'Prepare egzamen 9yèm'),
      subtitle: t("Entraîne-toi avec les vrais sujets de 9ème année.", 'Antrene ak vre sijè 9yèm ane yo.'),
      cta: t("S'entraîner", 'Antrene'),
      onPress: () => navigation.navigate('Exams', { screen: 'ExamBrowser', params: { level: '9e' } }),
    },
  };

  const c = COPY[suggestion.kind];

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
            {t('Recommandé pour toi', 'Rekòmande pou ou')}
          </Text>
          <TouchableOpacity
            onPress={() => { tapLight(); setDismissedSuggestion(suggestion.key); }}
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
