import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Play, RotateCcw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import Button from './ui/Button';
import VideoCover from './ui/VideoCover';
import { displayCourseName } from '../utils/courseName';
import { masteryNextStep } from '../utils/mastery';
import type { NextStep, LessonStep } from '../utils/nextStep';
import { TabParamList } from '../navigation/TabNavigator';
import { tapLight } from '../utils/haptics';
import { loadExamAttemptDraft } from '../services/examAttempts';
import { subjectDisplayName } from '../utils/examUtils';
import { evidenceLabel, trackJourney } from '../utils/learningJourney';
import { LEVEL_LABEL } from './journey/home/homeJourney';
import { GRADES } from '../config/trackConfig';
import { resetTabToRoot, openPractice } from '../navigation/navHelpers';
import { readLocalExamDraft, pickResumeDraft } from '../../../shared/examDraft';

type Nav = BottomTabNavigationProp<TabParamList>;

/**
 * The Home screen's one dominant answer to "what should I do right now?".
 *
 * It renders whatever utils/nextStep computed — resume the exact lesson, pick
 * up an abandoned exam, fix missed questions, start a real first lesson for the
 * student's class, or say honestly that their class has no video courses — as a
 * single card with ONE primary action (learning-journey PRD LJ-01/LJ-02). The
 * destination is always named before the tap: the lesson title, its course and
 * chapter, and what the lesson still asks for.
 */
export default function NextStepCard({
  step, onOpenReview, thumbs, reviewDue = 0,
}: {
  step: NonNullable<NextStep>;
  onOpenReview: () => void;
  /** Missed questions waiting; shown as the card's "↺ N à revoir" link. */
  reviewDue?: number;
  /**
   * Ordered video-still candidates, sharpest first. A list rather than one URL
   * because the sharp `hq720` still isn't served for every upload: the card
   * walks down on load failure instead of dropping straight to no image.
   */
  thumbs?: string[];
}) {
  const navigation = useNavigation<Nav>();
  const { colors, featureSurface, radius, typeScale, fonts } = useTheme();
  const [thumbAttempt, setThumbAttempt] = React.useState(0);
  const firstThumb = thumbs?.[0];
  React.useEffect(() => { setThumbAttempt(0); }, [firstThumb]);
  const thumb = thumbs?.[thumbAttempt] ?? null;
  // How far into the paper the student already is — "4 réponses" says more
  // than a title next to a generic glyph.
  const [examProgress, setExamProgress] = React.useState<{ done: number; total: number } | null>(null);
  const user = useStore((st) => st.user);
  const grade = useStore((st) => st.grade);
  const setGradeChosen = useStore((st) => st.setGradeChosen);
  const examPath = step.kind === 'resume-exam' ? step.resume.path : null;

  React.useEffect(() => {
    if (!examPath) { setExamProgress(null); return; }
    let active = true;
    (async () => {
      let draft: any = null;
      try { if (user?.uid) draft = await loadExamAttemptDraft(user.uid, String(examPath)); } catch { /* offline */ }
      // Same rule as ExamOverview/ExamTake: newest wins, own account only.
      let local: any = null;
      try {
        local = readLocalExamDraft(await AsyncStorage.getItem(`edlight-exam-draft-${examPath}`), user?.uid);
      } catch { /* storage unavailable */ }
      draft = pickResumeDraft(draft, local);
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

  const openLesson = (s: LessonStep, kind: string) => {
    trackJourney('learning_next_action_selected', {
      kind, reason: s.reason, course_id: s.courseId, lesson_id: s.lessonId, from_saved: !!s.fromSaved,
    });
    if (s.reason === 'resume' || s.reason === 'next') {
      trackJourney('lesson_resume_requested', { course_id: s.courseId, lesson_id: s.lessonId, reason: s.reason });
    }
    (navigation as any).navigate('Courses', {
      screen: 'CourseDetail',
      initial: false,
      params: { courseId: s.courseId, courseName: s.courseName, lessonId: s.lessonId },
    });
  };
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
  // Exams tab, with quick practice on top for quiz-primary grades.
  const openPracticeTab = () => openPractice(navigation, grade);
  const openCatalogue = () => resetTabToRoot(navigation, 'Courses', 'CourseList', { resetAt: Date.now() });
  const chooseClass = () => setGradeChosen(false); // the always-mounted WelcomeGradeModal opens

  /** "Chapitre 2 · Fonctions" — where the lesson sits. */
  const placeOf = (s: LessonStep) => {
    const parts: string[] = [];
    if (s.unitIndex != null) parts.push(`${t('Chapitre', 'Chapit')} ${s.unitIndex + 1}`);
    if (s.unitTitle) parts.push(s.unitTitle);
    return parts.join(' · ');
  };
  /** Status in the shared evidence words, plus what the ladder still asks. */
  const statusOf = (s: LessonStep) => {
    const parts: string[] = [];
    if (s.evidence) parts.push(evidenceLabel(s.evidence, isCreole));
    const ask = masteryNextStep(s.level, isCreole);
    if (ask) parts.push(ask);
    return parts.join(' · ');
  };
  const lessonCta = (s: LessonStep) => {
    if (s.action === 'practice' || s.action === 'perfect') return t("S'entraîner sur cette leçon", 'Antrene w sou leson sa a');
    if (s.action === 'test') return t('Ouvrir le test du chapitre', 'Louvri tès chapit la');
    switch (s.reason) {
      case 'resume': return t('Reprendre la leçon', 'Kontinye leson an');
      case 'next': return t('Leçon suivante', 'Pwochen leson');
      case 'start': return t('Commencer la leçon', 'Kòmanse leson an');
      default: return s.isStart ? t('Commencer la leçon', 'Kòmanse leson an') : t('Continuer le cours', 'Kontinye kou a');
    }
  };
  const lessonEyebrow = (s: LessonStep) => {
    if (s.reason === 'resume') return t('Reprendre', 'Kontinye');
    if (s.reason === 'next') return t('Leçon suivante', 'Pwochen leson');
    if (s.reason === 'start') return t('Ta première leçon', 'Premye leson ou');
    return t('Continuer', 'Kontinye');
  };

  let eyebrow = '';
  let title = '';
  let course: string | null = null;
  let place: string | null = null;
  let meta: string | null = null;
  let note: string | null = null;
  let tag: string | null = null;
  let cta = '';
  let onPress: () => void = () => {};
  let secondary: { label: string; onPress: () => void; review?: boolean }[] = [];
  let lessonDuration: number | null = null;
  let showImagery = false;

  switch (step.kind) {
    case 'welcome-back': {
      eyebrow = t('Content de te revoir', 'Nou kontan wè w ankò');
      const target = step.target;
      if (target) {
        title = target.lessonTitle || step.resume.title;
        course = target.courseName || step.resume.subtitle || null;
        place = placeOf(target) || null;
        meta = statusOf(target) || null;
        cta = target.reason === 'resume' ? t('Reprendre la leçon', 'Kontinye leson an') : lessonCta(target);
        onPress = () => openLesson(target, 'welcome-back');
        lessonDuration = target.duration ?? null;
        showImagery = true;
      } else {
        title = step.resume.type === 'exam' ? subjectDisplayName(step.resume.title) : step.resume.title;
        meta = step.resume.subtitle ?? null;
        cta = t("Reprendre où tu t'étais arrêté", 'Kontinye kote ou te rete a');
        onPress = () => {
          trackJourney('learning_next_action_selected', { kind: 'welcome-back', type: step.resume.type });
          resumeActivity(step.resume);
        };
      }
      break;
    }
    case 'resume-exam': {
      eyebrow = t('Examen en cours', 'Egzamen ou an ap tann ou');
      title = subjectDisplayName(step.resume.title);
      meta = examProgress
        ? (examProgress.total > 0
            ? `${examProgress.done}/${examProgress.total} ${t('réponses enregistrées', 'repons anrejistre')}`
            : `${examProgress.done} ${t('réponses enregistrées', 'repons anrejistre')}`)
        : (step.resume.subtitle ?? null);
      cta = t("Reprendre l'examen", 'Kontinye egzamen an');
      onPress = () => {
        trackJourney('learning_next_action_selected', { kind: 'resume-exam' });
        resumeActivity(step.resume);
      };
      break;
    }
    case 'review':
      eyebrow = t('Révision', 'Revizyon');
      title = t('Revois tes erreurs', 'Revize erè ou yo');
      meta = `${step.dueCount} ${t('questions manquées à revoir', 'kesyon rate pou revize')}`;
      cta = t('Commencer la révision', 'Kòmanse revizyon an');
      onPress = () => {
        trackJourney('learning_next_action_selected', { kind: 'review', due: step.dueCount });
        onOpenReview();
      };
      break;
    case 'lesson': {
      eyebrow = lessonEyebrow(step);
      title = step.lessonTitle || step.unitTitle || step.courseName;
      course = step.courseName || null;
      place = placeOf(step) || null;
      meta = statusOf(step) || null;
      if (step.otherLevel && step.courseLevel) {
        tag = `${t('Autre niveau', 'Lòt nivo')} · ${LEVEL_LABEL[step.courseLevel] ?? step.courseLevel}`;
      }
      if (step.staleLink) {
        note = t(
          "Ta dernière leçon n'est plus disponible. Voici la suite de ton cours.",
          'Dènye leson ou an pa disponib ankò. Men rès kou ou a.',
        );
      }
      cta = lessonCta(step);
      onPress = () => openLesson(step, 'lesson');
      lessonDuration = step.duration ?? null;
      showImagery = !step.fromSaved;
      secondary = [{ label: t('Voir tous les cours', 'Wè tout kou yo'), onPress: openCatalogue }];
      break;
    }
    case 'uncovered': {
      const g = GRADES.find((x) => x.code === step.grade);
      const gradeName = g ? (isCreole ? g.labelHt : g.label) : step.grade;
      eyebrow = t('Ta classe', 'Klas ou');
      title = t(
        `Pas encore de cours vidéo pour ${gradeName}`,
        `Poko gen kou videyo pou ${gradeName}`,
      );
      note = t(
        'Les cours vidéo couvrent NS I à NS IV. Tu peux déjà t\'entraîner, ou regarder un cours d\'un autre niveau.',
        'Kou videyo yo kouvri NS I rive NS IV. Ou ka deja antrene w, oswa gade yon kou nan yon lòt nivo.',
      );
      cta = t("S'entraîner", 'Antrene w');
      onPress = () => {
        trackJourney('learning_next_action_selected', { kind: 'uncovered', grade: step.grade });
        openPracticeTab();
      };
      const s = step.suggestion;
      if (s) {
        secondary.push({
          label: `${t('Voir', 'Gade')} ${s.courseName}${s.courseLevel ? ` (${t('autre niveau', 'lòt nivo')})` : ''}`,
          onPress: () => openLesson(s, 'uncovered-suggestion'),
        });
      }
      secondary.push({ label: t('Changer de classe', 'Chanje klas'), onPress: chooseClass });
      break;
    }
    case 'choose-class': {
      eyebrow = t('Pour commencer', 'Pou kòmanse');
      const s = step.suggestion;
      if (s) {
        title = s.lessonTitle;
        course = s.courseName || null;
        place = placeOf(s) || null;
        meta = null;
        cta = t('Commencer cette leçon', 'Kòmanse leson sa a');
        onPress = () => openLesson(s, 'choose-class');
        lessonDuration = s.duration ?? null;
        showImagery = true;
        secondary = [{ label: t('Choisir ma classe d\'abord', 'Chwazi klas mwen anvan'), onPress: chooseClass }];
      } else {
        title = t('Choisis ta classe', 'Chwazi klas ou');
        note = t('On te proposera les bons cours.', 'N ap pwopoze w bon kou yo.');
        cta = t('Choisir ma classe', 'Chwazi klas mwen');
        onPress = chooseClass;
      }
      break;
    }
    case 'level-empty':
      eyebrow = LEVEL_LABEL[step.level] ?? step.level;
      title = t('Les cours de ta classe arrivent bientôt', 'Kou klas ou yo ap vini talè');
      note = t(
        'En attendant, entraîne-toi ou explore les autres niveaux.',
        'Pandan n ap tann, antrene w oswa gade lòt nivo yo.',
      );
      cta = t('Voir tous les cours', 'Wè tout kou yo');
      onPress = () => {
        trackJourney('learning_next_action_selected', { kind: 'level-empty', level: step.level });
        openCatalogue();
      };
      secondary = [{ label: t("S'entraîner", 'Antrene w'), onPress: openPracticeTab }];
      break;
    case 'caught-up':
      eyebrow = step.level ? (LEVEL_LABEL[step.level] ?? step.level) : t('Tes cours', 'Kou ou yo');
      title = t('Toutes tes leçons sont maîtrisées', 'Tout leson ou yo metrize');
      note = t(
        'Garde le rythme avec une séance d\'entraînement.',
        'Kenbe ritm lan ak yon seyans antrènman.',
      );
      cta = t("S'entraîner", 'Antrene w');
      onPress = () => {
        trackJourney('learning_next_action_selected', { kind: 'caught-up' });
        openPracticeTab();
      };
      secondary = [{ label: t('Voir tous les cours', 'Wè tout kou yo'), onPress: openCatalogue }];
      break;
  }

  const showThumb = showImagery && !!thumb;
  // The duration chip only states what the catalogue knows (no watch position
  // is stored on mobile, so no invented "7 min restantes").
  const durationChip = showThumb && lessonDuration ? `${lessonDuration} min` : null;
  if (!showThumb && lessonDuration) meta = [meta, `${lessonDuration} min`].filter(Boolean).join(' · ');
  // ReviewCard folds into this card as a quiet link (web parity), unless the
  // card already IS the review.
  if (step.kind !== 'review' && reviewDue > 0) {
    secondary = [
      {
        label: reviewDue === 1
          ? t('1 question à revoir', '1 kesyon pou revize')
          : `${reviewDue} ${t('questions à revoir', 'kesyon pou revize')}`,
        onPress: () => {
          trackJourney('learning_next_action_selected', { kind: 'review-link', due: reviewDue });
          onOpenReview();
        },
        review: true,
      },
      ...secondary,
    ];
  }
  const press = () => { tapLight(); onPress(); };

  return (
    <View style={{ ...featureSurface, padding: showThumb ? 16 : 20 }}>
      {showThumb && (
        <VideoCover
          uri={thumb}
          onError={() => setThumbAttempt((a) => a + 1)}
          play={false}
          radiusTop={18}
          radiusBottom={18}
          onPress={press}
          accessibilityLabel={`${cta}. ${title}`}
        >
          {durationChip ? (
            <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#12213A', borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: '#ffffff' }}>{durationChip}</Text>
            </View>
          ) : null}
        </VideoCover>
      )}
      <View style={showThumb ? { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 4 } : null}>
        <View accessible accessibilityLabel={[eyebrow, title, course, place, meta, tag, note].filter(Boolean).join('. ')}>
          {eyebrow ? (
            <Text style={[typeScale.meta, { fontFamily: fonts.medium, color: colors.azureInk, marginBottom: 6 }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          {course || place ? (
            <Text style={[typeScale.meta, { color: colors.muted, marginBottom: 4 }]} numberOfLines={2}>
              {[course ? displayCourseName(course) : null, place].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <Text style={[typeScale.cardTitle, { color: colors.ink, fontSize: 22, lineHeight: 27, letterSpacing: -0.5 }]} numberOfLines={3}>
            {title}
          </Text>
          {meta ? (
            <Text style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
          {tag ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={[typeScale.label, { color: colors.ink }]}>{tag}</Text>
            </View>
          ) : null}
          {note ? (
            <Text style={[typeScale.instruction, { color: colors.muted, marginTop: 8 }]}>
              {note}
            </Text>
          ) : null}
        </View>

        {/* The page's one solid azure. */}
        <Button
          label={cta}
          onPress={onPress}
          size="lg"
          fullWidth
          accessibilityLabel={`${cta}. ${title}`}
          icon={<Play color="#ffffff" size={16} fill="#ffffff" strokeWidth={0} />}
          style={{ marginTop: 16 }}
        />

        {secondary.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 20, marginTop: 4 }}>
            {secondary.map((s) => (
              <TouchableOpacity
                key={s.label}
                onPress={() => { tapLight(); s.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                {s.review ? <RotateCcw color={colors.azureInk} size={16} strokeWidth={2.4} /> : null}
                <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: s.review ? colors.azureInk : colors.muted }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
