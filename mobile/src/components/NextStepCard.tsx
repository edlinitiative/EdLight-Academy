import React from 'react';
import { View, Text, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ArrowRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import { useTheme, typeScale, courseTint } from '../theme/theme';
import { masteryNextStep } from '../utils/mastery';
import type { NextStep } from '../utils/nextStep';
import PressableScale from './ui/PressableScale';
import { TabParamList } from '../navigation/TabNavigator';
import { tapLight } from '../utils/haptics';
import { loadExamAttemptDraft } from '../services/examAttempts';
import { subjectDisplayName } from '../utils/examUtils';

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
  step, onOpenReview, thumbs,
}: {
  step: NonNullable<NextStep>;
  onOpenReview: () => void;
  /** The course's video still — the card leads with real imagery when it has some. */
  /**
   * Ordered video-still candidates, sharpest first. A list rather than one URL
   * because the sharp `hq720` still isn't served for every upload: the card
   * walks down on load failure instead of dropping straight to no image. This
   * is the largest image on the home screen, so the resolution shows.
   */
  thumbs?: string[];
}) {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface, shadow, radius } = useTheme();
  const [thumbAttempt, setThumbAttempt] = React.useState(0);
  const thumb = thumbs?.[thumbAttempt] ?? null;
  // How far into the paper the student already is. An abandoned exam is the
  // strongest open loop on the home screen, but the card used to show only its
  // title next to a generic target glyph — nothing that said "you are 4
  // questions in". ("it's a french exams - how can we make it more attractive")
  const [examProgress, setExamProgress] = React.useState<{ done: number; total: number } | null>(null);
  const user = useStore((st) => st.user);
  const examPath = step.kind === 'resume-exam' ? step.resume.path : null;

  React.useEffect(() => {
    if (!examPath) { setExamProgress(null); return; }
    let active = true;
    (async () => {
      let draft: any = null;
      try { if (user?.uid) draft = await loadExamAttemptDraft(user.uid, String(examPath)); } catch { /* offline */ }
      try {
        const raw = await AsyncStorage.getItem(`edlight-exam-draft-${examPath}`);
        if (raw) {
          const local = JSON.parse(raw);
          // Same freshness rule as ExamOverview/ExamTake: newest wins.
          if (local?.status === 'in_progress' &&
              (!draft || (local.updated_at_ms || 0) > (draft.updated_at_ms || 0))) draft = local;
        }
      } catch { /* corrupt mirror */ }
      if (!active) return;
      const done = draft?.answers ? Object.keys(draft.answers).length : 0;
      const total = Number(draft?.questionCount) || 0;
      setExamProgress(done > 0 ? { done, total } : null);
    })();
    return () => { active = false; };
  }, [examPath, user?.uid]);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const accent = step.kind === 'lesson' ? courseTint(step.courseColor) : colors.azure;

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
      eyebrow = t('Tu nous as manqué ! 👋', 'Nou manke w! 👋');
      title = step.resume.title;
      meta = step.resume.subtitle ?? null;
      cta = t("Reprendre où tu t'étais arrêté", 'Kontinye kote ou te rete a');
      onPress = () => resumeActivity(step.resume);
      break;
    case 'resume-exam': {
      eyebrow = t('Examen en cours', 'Egzamen ou an ap tann ou');
      title = subjectDisplayName(step.resume.title);
      // Lead with how far in they are; fall back to the paper's own subtitle.
      meta = examProgress
        ? (examProgress.total > 0
            ? `${examProgress.done}/${examProgress.total} ${t('réponses', 'repons')}`
            : `${examProgress.done} ${t('réponses enregistrées', 'repons anrejistre')}`)
        : (step.resume.subtitle ?? null);
      cta = t("Continuer l'examen", 'Kontinye egzamen an');
      onPress = () => resumeActivity(step.resume);
      break;
    }
    case 'review':
      eyebrow = t("Pour toi aujourd'hui", 'Pou ou jodi a');
      title = t('Revois tes erreurs', 'Revize erè ou yo');
      meta = `${step.dueCount} ${t('questions', 'kesyon')} · ~${Math.max(1, Math.ceil(step.dueCount / 2))} min`;
      cta = t('Teste-toi 🧠', 'Teste tèt ou 🧠');
      onPress = onOpenReview;
      break;
    case 'lesson': {
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

  const showThumb = !!thumb;

  return (
    <View style={{ ...cardSurface, ...shadow.md, padding: 0, overflow: 'hidden' }}>
      {showThumb && (
        <Image
          source={{ uri: thumb! }}
          resizeMode="cover"
          onError={() => setThumbAttempt((a) => a + 1)}
          style={{ width: '100%', height: 150, backgroundColor: colors.surfaceAlt }}
        />
      )}
      <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* With real imagery above, a tinted icon tile is just clutter. */}
        {/* No icon tile. Ted has now asked for this treatment to go three
            times — the Examens landing rows, the MissionCard eyebrow, and here
            — and he is right that a tinted square repeated beside every title
            is filler: the eyebrow already says what kind of thing this is. */}
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
