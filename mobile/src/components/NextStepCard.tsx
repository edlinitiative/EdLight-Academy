import React from 'react';
import { View, Text, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Play, Zap, Target, Brain, History, ArrowRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, typeScale, courseTint } from '../theme/theme';
import { masteryNextStep } from '../utils/mastery';
import type { NextStep } from '../utils/nextStep';
import PressableScale from './ui/PressableScale';
import { TabParamList } from '../navigation/TabNavigator';
import { tapLight } from '../utils/haptics';

type Nav = BottomTabNavigationProp<TabParamList>;

/**
 * The Home screen's one dominant answer to "what should I do right now?".
 *
 * It renders whatever utils/nextStep computed — resume a lesson, pick up an
 * abandoned exam, fix missed questions, or come back after a quiet week — as a
 * single card with a single CTA. The student should never have to work out
 * their next step from a list; this card IS the next step.
 */
export default function NextStepCard({
  step, onOpenReview, thumb,
}: {
  step: NonNullable<NextStep>;
  onOpenReview: () => void;
  /** The course's video still — the card leads with real imagery when it has some. */
  thumb?: string | null;
}) {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface, shadow, radius } = useTheme();
  const [thumbFailed, setThumbFailed] = React.useState(false);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const accent = step.kind === 'lesson' ? courseTint(step.courseColor) : colors.azure;

  let Icon = Play;
  let eyebrow = '';
  let title = '';
  let meta: string | null = null;
  let cta = '';
  let onPress: () => void;

  const resumeActivity = (resume: { type: string; path: string; level?: string; lessonId?: string; subtitle?: string }) => {
    if (resume.type === 'exam') {
      (navigation as any).navigate('Exams', {
        screen: 'ExamTake',
        initial: false,
        params: { level: resume.level ?? '', examId: resume.path },
      });
    } else {
      (navigation as any).navigate('Courses', {
        screen: 'CourseDetail',
        initial: false,
        params: { courseId: resume.path, courseName: resume.subtitle, lessonId: resume.lessonId },
      });
    }
  };

  switch (step.kind) {
    case 'welcome-back':
      Icon = History;
      eyebrow = t('Tu nous as manqué ! 👋', 'Nou manke w! 👋');
      title = step.resume.title;
      meta = step.resume.subtitle ?? null;
      cta = t("Reprendre où tu t'étais arrêté", 'Kontinye kote ou te rete a');
      onPress = () => resumeActivity(step.resume);
      break;
    case 'resume-exam':
      Icon = Target;
      eyebrow = t('Examen en cours', 'Egzamen ou an ap tann ou');
      title = step.resume.title;
      meta = step.resume.subtitle ?? null;
      cta = t("Continuer l'examen", 'Kontinye egzamen an');
      onPress = () => resumeActivity(step.resume);
      break;
    case 'review':
      Icon = Brain;
      eyebrow = t("Pour toi aujourd'hui", 'Pou ou jodi a');
      title = t('Revois tes erreurs', 'Revize erè ou yo');
      meta = `${step.dueCount} ${t('questions', 'kesyon')} · ~${Math.max(1, Math.ceil(step.dueCount / 2))} min`;
      cta = t('Teste-toi 🧠', 'Teste tèt ou 🧠');
      onPress = onOpenReview;
      break;
    case 'lesson': {
      Icon = step.action === 'watch' ? Play : step.action === 'test' ? Target : Zap;
      eyebrow = step.courseName;
      title = step.lessonTitle || step.unitTitle || step.courseName;
      const parts: string[] = [];
      // The ladder's own words for what this lesson still asks of the student.
      const ask = masteryNextStep(step.level, isCreole);
      if (ask) parts.push(ask);
      if (step.duration) parts.push(`${step.duration} min`);
      meta = parts.join(' · ') || null;
      cta = step.isStart ? t('Commencer', 'Kòmanse') : t('Continuer à apprendre', 'Kontinye aprann');
      onPress = () =>
        (navigation as any).navigate('Courses', {
          screen: 'CourseDetail',
          initial: false,
          params: { courseId: step.courseId, courseName: step.courseName, lessonId: step.lessonId },
        });
      break;
    }
  }

  const showThumb = !!thumb && !thumbFailed;

  return (
    <View style={{ ...cardSurface, ...shadow.md, padding: 0, overflow: 'hidden' }}>
      {showThumb && (
        <Image
          source={{ uri: thumb! }}
          resizeMode="cover"
          onError={() => setThumbFailed(true)}
          style={{ width: '100%', height: 150, backgroundColor: colors.surfaceAlt }}
        />
      )}
      <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* With real imagery above, a tinted icon tile is just clutter. */}
        {!showThumb && (
          <View
            style={{
              width: 44, height: 44, borderRadius: radius.tile,
              backgroundColor: accent + '18',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon color={accent} size={20} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typeScale.overline, { color: accent, marginBottom: 2 }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[typeScale.title, { color: colors.ink }]} numberOfLines={2}>
            {title}
          </Text>
          {meta ? (
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <PressableScale
        onPress={() => { tapLight(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={`${cta}. ${title}`}
        style={{
          marginTop: 14,
          // One blue for every action — subject tints stay on eyebrows/icons.
          backgroundColor: colors.azureFill,
          borderRadius: radius.control,
          paddingVertical: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Text style={[typeScale.bodyMd, { color: '#ffffff' }]}>{cta}</Text>
        <ArrowRight color="#ffffff" size={16} />
      </PressableScale>
      </View>
    </View>
  );
}
