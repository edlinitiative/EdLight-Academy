/**
 * QuizzesScreen — the question bank: general practice (Subject → Level →
 * Chapter) and the receiving end of every practice handoff (LJ-06).
 *
 *   browse    pick a subject, a level, a chapter (chapters come from the
 *             course's real units, not the bank's "Général" catch-all)
 *   entry     PracticeEntry: topic, mode, real count, what is saved, Commencer
 *   taking    PracticeRunner (quiz or open practice)
 *   results   PracticeResult: tallies, what was saved, one next action,
 *             corrections, Révision for this topic
 *
 * A handoff arrives as `route.params.handoff` (utils/learningJourney
 * `practiceParams`). It is resolved against loaded data in one pass, so the
 * entry never flashes "0 questions"; a stale or unknown scope lands on the
 * browse list with an explanation and an explicit choice, never a silent
 * swap. Mounted in the Courses stack and as the Quiz tab (QuizNavigator).
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ChevronRight, BookOpen } from 'lucide-react-native';
import { usePracticeQuizzes, useCourses } from '../hooks/useData';
import { logAnswerEvent } from '../services/answerEventsService';
import { useCrowdOrderedQuestions } from '../hooks/useCrowdOrderedQuestions';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import { useColors, useTheme, typeScale, radius } from '../theme/theme';
import { subjectColor } from '../utils/examUtils';
import { tapLight, success, warn } from '../utils/haptics';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import BeatMyScoreCard from '../components/share/BeatMyScoreCard';
import DefiHandoffCard from '../components/DefiHandoffCard';
import ReviewSession from '../components/ReviewSession';
import { resolveCorrectIndex, normKey } from '../utils/practiceCards';
import { dueQuestionIds } from '../utils/review';
import { readPracticeHandoff, trackJourney, type PracticeHandoff } from '../utils/learningJourney';
import { readableCourseMeta } from '../services/searchIndex';
import PracticeEntry, { ScopeNotice } from '../components/journey/practice/PracticeEntry';
import PracticeRunner, { type FinishReason } from '../components/journey/practice/PracticeRunner';
import PracticeResult from '../components/journey/practice/PracticeResult';
import { useReviewConfirmation } from '../components/journey/practice/useReviewConfirmation';
import { useOnline } from '../components/journey/practice/useOnline';
import { questionsLabel } from '../components/journey/practice/copy';
import type { ReviewScope } from '../components/journey/practice/reviewScope';
import {
  buildDeck, chooseNextAction, fisherYates, itemFromQuizQuestion, reviewIdsOf, sessionSlice, tally,
  type LogEntry, type SessionItem, type SessionMode,
} from '../components/journey/practice/session';
import {
  chaptersFor, countQuizzable, courseWideScope, findCourse, itemsForScope, normalizeCourseCode,
  resolvePracticeScope, scopeForChapter, type BrowseChapter, type ResolvedScope,
} from '../components/journey/practice/practiceScope';

type Translate = (fr: string, ht: string) => string;

/** Pretty subject name — the part before " — " in a grouped quiz title. */
function subjectNameOf(quiz: any): string {
  const title = String(quiz?.title ?? '');
  const before = title.split(' — ')[0]?.trim();
  return before || String(quiz?.subject ?? 'Divers');
}

/**
 * Split a quiz's subject code ("CHEM-NSI") into a BASE subject ("Chimie") and a
 * GRADE LEVEL ("NSI"), so the bank reads Subject → Level → Chapter.
 */
function subjectParts(quiz: any): { baseName: string; baseCode: string; levelLabel: string | null } {
  const fullName = subjectNameOf(quiz);
  const code = String(quiz?.subject ?? '');
  const dash = code.indexOf('-');
  const baseCode = (dash >= 0 ? code.slice(0, dash) : code) || fullName.toLowerCase();
  const levelRaw = dash >= 0 ? code.slice(dash + 1) : '';
  const levelLabel = levelRaw ? levelRaw.toUpperCase() : null;
  const baseName = levelRaw
    ? (fullName.replace(new RegExp(`\\s*${levelRaw}\\s*$`, 'i'), '').trim() || fullName)
    : fullName;
  return { baseName, baseCode, levelLabel };
}

/**
 * Is `given` (an option's text, or a letter) the right answer? Kept for the
 * grading tests and any caller holding a raw bank question. Resolution is the
 * shared one (utils/practiceCards.resolveCorrectIndex): answer text first,
 * then a letter, then a 1-based number. An unresolvable key is never "right".
 */
export function isQuizAnswerCorrect(question: any, given: string | undefined): boolean {
  if (given == null || given === '') return false;
  const options: string[] = (question.options ?? question.choices ?? []).map(String);
  const raw = String(question.answer ?? question.correct_answer ?? question.correctAnswer ?? '').trim();
  if (!raw) return false;
  const idx = resolveCorrectIndex(raw, options);
  if (idx < 0) return false;
  return normKey(given) === normKey(options[idx]) || normKey(given) === normKey(raw);
}

type Entry = {
  scope: ResolvedScope;
  pool: SessionItem[];
  origin: 'handoff' | 'browse';
  from?: PracticeHandoff['from'];
};
type Session = { id: number; deck: SessionItem[]; mode: SessionMode };
type Result = { log: Array<LogEntry | null>; reason: FinishReason };

const stemOf = (q: SessionItem) => q?.question ?? '';

/** Freezes crowd-difficulty order once per mounted session (Adaptive Engine 3b). */
function SessionShell(props: Omit<React.ComponentProps<typeof PracticeRunner>, 'items'> & { deck: SessionItem[] }) {
  const { deck, ...rest } = props;
  const ordered = useCrowdOrderedQuestions(deck, stemOf);
  return <PracticeRunner items={ordered} {...rest} />;
}

export default function QuizzesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const quizzesQ = usePracticeQuizzes();
  const coursesQ = useCourses();
  const { language, recordQuizAttempt, setFocusMode, isAuthenticated, recordReviewOutcome, setShowAuthModal } = useStore();
  const review = useStore((s) => s.review);
  const colors = useColors();
  const { shadow } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const online = useOnline();
  const isCreole = language === 'ht';
  const t: Translate = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
  const countOf = (n: number, fr: string, ht: string) => `${n} ${isCreole ? ht : fr + (n > 1 ? 's' : '')}`;

  const courses: any[] = useMemo(() => (Array.isArray(coursesQ.data) ? coursesQ.data : []), [coursesQ.data]);

  // ── The bank, as session items ─────────────────────────────────────────────
  const quizzes = useMemo(() => {
    const data = quizzesQ.data;
    return Array.isArray(data) ? data.filter((q: any) => (q.questions?.length ?? 0) > 0) : [];
  }, [quizzesQ.data]);
  const quizItems = useMemo(
    () => quizzes.map((q: any) => ({
      id: String(q.id),
      unit: q.unit as string | undefined,
      title: String(q.title ?? ''),
      subject: String(q.subject ?? ''),
      items: (q.questions ?? []).map(itemFromQuizQuestion).filter((x: SessionItem | null): x is SessionItem => !!x),
      quiz: q,
    })),
    [quizzes],
  );
  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const out: SessionItem[] = [];
    for (const q of quizItems) for (const it of q.items) {
      if (it.id && seen.has(it.id)) continue;
      if (it.id) seen.add(it.id);
      out.push(it);
    }
    return out;
  }, [quizItems]);

  // ── Browse drill: Subject (baseName) → Level (code) → Chapters ─────────────
  type QuizLevel = { levelLabel: string | null; name: string; code: string; groups: typeof quizItems; questionCount: number };
  type QuizSubject = { baseName: string; baseCode: string; levels: QuizLevel[]; questionCount: number };
  const subjectGroups = useMemo<QuizSubject[]>(() => {
    const bases = new Map<string, { baseName: string; baseCode: string; levels: Map<string, QuizLevel> }>();
    for (const g of quizItems) {
      const { baseName, baseCode, levelLabel } = subjectParts(g.quiz);
      const bKey = baseName.toLowerCase();
      let base = bases.get(bKey);
      if (!base) { base = { baseName, baseCode, levels: new Map() }; bases.set(bKey, base); }
      const lKey = String(g.subject || levelLabel || baseName).toLowerCase();
      let lvl = base.levels.get(lKey);
      if (!lvl) { lvl = { levelLabel, name: subjectNameOf(g.quiz), code: g.subject, groups: [], questionCount: 0 }; base.levels.set(lKey, lvl); }
      lvl.groups.push(g);
      lvl.questionCount += g.items.length;
    }
    return Array.from(bases.values())
      .map((b) => {
        const levels = Array.from(b.levels.values()).sort((a, c) => a.name.localeCompare(c.name, 'fr'));
        return { baseName: b.baseName, baseCode: b.baseCode, levels, questionCount: levels.reduce((s, l) => s + l.questionCount, 0) };
      })
      .sort((a, c) => a.baseName.localeCompare(c.baseName, 'fr'));
  }, [quizItems]);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const activeBase = useMemo(
    () => subjectGroups.find((b) => b.baseName.toLowerCase() === selectedSubject?.toLowerCase()) ?? null,
    [subjectGroups, selectedSubject],
  );
  const activeLevel = useMemo(
    () => activeBase?.levels.find((l) => l.code === selectedLevel) ?? null,
    [activeBase, selectedLevel],
  );
  const levelChapters = useMemo<BrowseChapter[]>(
    () => (activeLevel ? chaptersFor(activeLevel.code, activeLevel.groups, findCourse(courses, activeLevel.code)) : []),
    [activeLevel, courses],
  );

  /** Drill straight to a course's chapter list. */
  const openLevelFor = useCallback((courseCode: string) => {
    const want = normalizeCourseCode(courseCode);
    for (const b of subjectGroups) {
      const lvl = b.levels.find((l) => normalizeCourseCode(l.code) === want);
      if (lvl) { setSelectedSubject(b.baseName); setSelectedLevel(lvl.code); return; }
    }
  }, [subjectGroups]);

  const openBase = useCallback((b: QuizSubject) => {
    tapLight();
    setSelectedSubject(b.baseName);
    setSelectedLevel(b.levels.length === 1 ? b.levels[0].code : null);
  }, []);
  const backFromChapters = useCallback(() => {
    tapLight();
    if (activeBase && activeBase.levels.length === 1) setSelectedSubject(null);
    setSelectedLevel(null);
  }, [activeBase]);

  // ── Session state ──────────────────────────────────────────────────────────
  const [notice, setNotice] = useState<ResolvedScope | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [mode, setMode] = useState<SessionMode>('quiz');
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const sessionSeq = useRef(0);

  const phase: 'browse' | 'entry' | 'taking' | 'results' = result ? 'results' : session ? 'taking' : entry ? 'entry' : 'browse';

  // Hide the floating tab bar outside the browse list so it never covers
  // « Commencer » / « Vérifier » / the result actions.
  useFocusEffect(
    useCallback(() => {
      setFocusMode(phase !== 'browse');
      return () => setFocusMode(false);
    }, [phase, setFocusMode]),
  );

  const openEntry = useCallback((scope: ResolvedScope, pool: SessionItem[], origin: Entry['origin'], from?: Entry['from'], wanted?: SessionMode) => {
    setNotice(null);
    setResult(null);
    setSession(null);
    setEntry({ scope, pool, origin, from });
    const canQuiz = scope.quizCount > 0;
    setMode(wanted === 'practice' || !canQuiz ? 'practice' : 'quiz');
  }, []);

  // ── Receiving a handoff (LJ-06) ────────────────────────────────────────────
  const [pendingHandoff, setPendingHandoff] = useState<PracticeHandoff | null>(null);
  const rawHandoff = route.params?.handoff ?? (route.params?.courseId ? { course: route.params.courseId } : null);
  const handoffKey = rawHandoff ? JSON.stringify(rawHandoff) : '';
  useEffect(() => {
    const h = readPracticeHandoff(rawHandoff);
    if (!h) return;
    setPendingHandoff(h);
    // Consumed: returning to this tab later must not reopen the same entry.
    navigation.setParams({ handoff: undefined, courseId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffKey]);

  const dataReady = !quizzesQ.isLoading && !coursesQ.isLoading && !!quizzesQ.data;
  useEffect(() => {
    if (!pendingHandoff || !dataReady) return;
    const h = pendingHandoff;
    setPendingHandoff(null);
    const scope = resolvePracticeScope(h, courses, allItems);
    if (!scope) return;
    trackJourney('practice_handoff_opened', {
      from: h.from ?? null, status: scope.status, course: scope.course?.id ?? h.course, unit: scope.unit?.value ?? h.unit ?? null, mode: h.mode ?? null,
    });
    if (scope.status === 'ok') {
      openEntry(scope, itemsForScope(scope, allItems), 'handoff', h.from, h.mode);
    } else {
      setEntry(null); setSession(null); setResult(null);
      setNotice(scope);
      if (scope.courseCode) openLevelFor(scope.courseCode);
      else { setSelectedSubject(null); setSelectedLevel(null); }
    }
  }, [pendingHandoff, dataReady, courses, allItems, openEntry, openLevelFor]);

  // ── Labels ─────────────────────────────────────────────────────────────────
  const subjectLabelOf = useCallback((scope: ResolvedScope): string => {
    const c = scope.course;
    if (c?.subject && c?.level) return readableCourseMeta(`${c.subject} · ${c.level}`, isCreole);
    const code = String(scope.courseCode || '');
    const [subj, lvl] = code.split('-');
    return readableCourseMeta([subj, lvl].filter(Boolean).join(' · '), isCreole);
  }, [isCreole]);
  const contextOf = useCallback((scope: ResolvedScope) => {
    const chapter = scope.unitIndex ? t(`Chapitre ${scope.unitIndex}`, `Chapit ${scope.unitIndex}`) : '';
    return [subjectLabelOf(scope), chapter].filter(Boolean).join(' · ');
  }, [subjectLabelOf, t]);

  // ── Starting, answering, finishing ─────────────────────────────────────────
  const start = useCallback((m: SessionMode) => {
    if (!entry) return;
    const deck = buildDeck(entry.pool, m, fisherYates);
    if (deck.length === 0) return;
    sessionSeq.current += 1;
    setResult(null);
    setSession({ id: sessionSeq.current, deck, mode: m });
    trackJourney('practice_started', {
      mode: m, source: entry.origin, from: entry.from ?? null,
      course: entry.scope.course?.id ?? entry.scope.courseCode ?? null,
      unit: entry.scope.unit?.value ?? null, count: deck.length,
      scope: entry.scope.unit?.value === '*' ? 'course' : 'chapter',
    });
  }, [entry]);

  const onAnswer = useCallback((item: SessionItem, _e: LogEntry, outcome: boolean | null) => {
    if (outcome == null) return; // ungraded: nothing learned, nothing stored
    logAnswerEvent(item.question, outcome);
    recordReviewOutcome(item.id, outcome, { subjectCode: item.subjectCode, unitNo: item.unitNo });
  }, [recordReviewOutcome]);

  const onFinish = useCallback((log: Array<LogEntry | null>, reason: FinishReason) => {
    if (!session || !entry) return;
    const slice = sessionSlice(session.deck, log, session.mode);
    const tl = tally(slice.items, slice.log);
    const answered = tl.total - tl.unanswered;
    if (session.mode === 'quiz' && answered > 0 && tl.scored > 0) {
      recordQuizAttempt(`bank:${entry.scope.courseCode}|${entry.scope.unit?.value}`, { score: tl.correct, total: tl.scored, date: Date.now() });
      if (tl.correct / tl.scored >= 0.6) success(); else warn();
    }
    trackJourney('practice_completed', {
      mode: session.mode, reason, total: tl.total, correct: tl.correct, incorrect: tl.incorrect,
      unanswered: tl.unanswered, ungraded: tl.ungraded,
    });
    setResult({ log, reason });
  }, [session, entry, recordQuizAttempt]);

  // ── Result state (computed every render; hooks stay unconditional) ────────
  const slice = session && result ? sessionSlice(session.deck, result.log, session.mode) : null;
  const reviewIds = useMemo(() => (slice ? reviewIdsOf(slice.items, slice.log) : []), [slice?.items, slice?.log]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = useReviewConfirmation(!!isAuthenticated && phase === 'results', reviewIds);
  const scopeIds = useMemo(() => new Set((entry?.pool ?? []).map((it) => it.id).filter(Boolean)), [entry]);
  const dueInScope = useMemo(() => dueQuestionIds(review).filter((id) => scopeIds.has(id)).length, [review, scopeIds]);

  const reviewScope = useMemo<ReviewScope | null>(() => {
    if (!entry) return null;
    const wide = entry.scope.unit?.value === '*';
    return {
      subjectCode: entry.scope.courseCode,
      unitNo: wide ? null : entry.scope.unit?.no ?? null,
      ids: Array.from(scopeIds),
      label: [subjectLabelOf(entry.scope), entry.scope.unit?.label].filter(Boolean).join(' · '),
      source: 'result',
    };
  }, [entry, scopeIds, subjectLabelOf]);

  const backToBrowse = useCallback(() => {
    const code = entry?.scope.courseCode;
    setResult(null); setSession(null); setEntry(null);
    if (code) openLevelFor(code);
  }, [entry, openLevelFor]);

  const goNextLesson = useCallback(() => {
    const course = entry?.scope.course;
    const next = entry?.scope.nextLesson;
    if (!course || !next) return;
    trackJourney('learning_next_action_selected', { action: 'next_lesson', source: 'practice_result' });
    const params = { courseId: course.id, courseName: course.name, lessonId: next.id };
    const state = navigation.getState?.();
    setResult(null); setSession(null); setEntry(null);
    if (state?.routeNames?.includes('CourseDetail')) {
      if (typeof navigation.popTo === 'function' && state.routes?.some((r: any) => r.name === 'CourseDetail')) navigation.popTo('CourseDetail', params);
      else navigation.navigate('CourseDetail', params);
    } else {
      navigation.navigate('Courses', { screen: 'CourseDetail', params, initial: false });
    }
  }, [entry, navigation]);

  // Back to the lesson only when the lesson really sits under us in this stack.
  const stackDepth = navigation.getState?.()?.routes?.length ?? 1;
  const canBackToLesson = entry?.origin === 'handoff' && entry?.from === 'lesson' && stackDepth > 1;

  // ── Render ─────────────────────────────────────────────────────────────────
  // Mounted only while open: Révision rebuilds cards from the full app data,
  // which the bank tab otherwise never needs to load.
  const reviewModal = reviewOpen ? (
    <ReviewSession visible onClose={() => setReviewOpen(false)} isCreole={isCreole} scope={reviewScope} />
  ) : null;

  if (phase === 'taking' && session && entry) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <SessionShell
          key={session.id}
          deck={session.deck}
          mode={session.mode}
          t={t}
          title={entry.scope.unit?.label || ''}
          context={contextOf(entry.scope)}
          onAnswer={onAnswer}
          onFinish={onFinish}
          onExit={() => setSession(null)}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'results' && session && entry && result && slice) {
    const tl = tally(slice.items, slice.log);
    const poolSize = session.mode === 'quiz' ? countQuizzable(entry.pool) : entry.pool.length;
    const next = chooseNextAction({ dueInScope, hasNextLesson: !!entry.scope.nextLesson && entry.origin === 'handoff', poolSize }, tl);
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <PracticeResult
          items={session.deck}
          log={result.log}
          mode={session.mode}
          stopped={result.reason === 'stopped'}
          t={t}
          title={entry.scope.unit?.label || ''}
          context={contextOf(entry.scope)}
          signedIn={!!isAuthenticated}
          onSignIn={() => setShowAuthModal(true)}
          newErrors={reviewIds.length}
          confirm={confirm.state}
          onRecheck={confirm.recheck}
          next={next}
          nextLessonTitle={entry.scope.nextLesson?.title}
          dueInScope={dueInScope}
          actions={{
            onReview: () => { trackJourney('learning_next_action_selected', { action: 'review', source: 'practice_result' }); setReviewOpen(true); },
            onNextLesson: goNextLesson,
            onReplay: () => start(session.mode),
            onOtherChapter: backToBrowse,
          }}
          onCorrectionsOpened={(count) => trackJourney('correction_opened', { source: 'result', mode: session.mode, count })}
          onClose={canBackToLesson ? () => { setResult(null); setSession(null); setEntry(null); navigation.goBack(); } : backToBrowse}
        >
          {session.mode === 'quiz' && tl.scored > 0 && tl.total - tl.unanswered > 0 ? (
            <View style={{ gap: 12, marginTop: 8 }}>
              <BeatMyScoreCard title={`${subjectLabelOf(entry.scope)} — ${entry.scope.unit?.label || ''}`} score={tl.correct} total={tl.scored} variant="surface" source="quiz" />
              <DefiHandoffCard />
            </View>
          ) : null}
        </PracticeResult>
        {reviewModal}
      </SafeAreaView>
    );
  }

  if (phase === 'entry' && entry) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <PracticeEntry
          scope={entry.scope}
          subjectLabel={subjectLabelOf(entry.scope)}
          mode={mode}
          onMode={setMode}
          signedIn={!!isAuthenticated}
          online={online}
          onSignIn={() => setShowAuthModal(true)}
          onStart={() => start(mode)}
          onChange={backToBrowse}
          onBackToLesson={canBackToLesson ? () => { setEntry(null); navigation.goBack(); } : undefined}
          t={t}
        />
      </SafeAreaView>
    );
  }

  // Browse — with a handoff still resolving, the skeleton holds the place: the
  // screen never claims "0 questions" while the bank loads.
  if (quizzesQ.isLoading || (pendingHandoff && !dataReady)) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <ListSkeleton rows={6} label={t('Chargement des questions…', 'N ap chaje kesyon yo…')} />
      </SafeAreaView>
    );
  }
  if (quizzesQ.isError && quizzes.length === 0) {
    return (
      <ErrorState
        title={t('Questions indisponibles', 'Kesyon yo pa disponib')}
        message={t('Les questions n’ont pas pu être chargées. Vérifie ta connexion : une fois chargées, elles restent sur ton téléphone.',
          'Kesyon yo pa t ka chaje. Verifye koneksyon ou : depi yo chaje, yo rete sou telefòn ou.')}
        onRetry={() => quizzesQ.refetch()}
      />
    );
  }

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  };

  const noticeView = notice ? (
    <ScopeNotice
      scope={notice}
      courseLabel={String(notice.course?.name || notice.courseCode || '')}
      onCourseWide={notice.course ? () => {
        const wide = courseWideScope(notice);
        openEntry(wide, itemsForScope(wide, allItems), 'handoff');
      } : undefined}
      t={t}
    />
  ) : null;

  const offlineLine = online === false ? (
    <Text style={[typeScale.body, { color: colors.muted, marginBottom: 12 }]}>
      {t('Hors ligne : les questions déjà chargées restent disponibles.', 'San rezo : kesyon ki te deja chaje yo rete disponib.')}
    </Text>
  ) : null;

  const backArrow = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} hitSlop={8} className="p-1" accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')}>
      <ChevronRight color={colors.muted} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
    </TouchableOpacity>
  );

  // ── Level 3: chapters within the chosen grade level ────────────────────────
  if (activeLevel) {
    const tint = subjectColor(activeBase?.baseName ?? '');
    const headerTitle = activeBase
      ? `${activeBase.baseName}${activeLevel.levelLabel ? ` · ${readableCourseMeta(activeLevel.levelLabel, isCreole)}` : ''}`
      : activeLevel.name;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {reviewModal}
        <View className="flex-row items-center px-4 pt-6 pb-3" style={{ gap: 8 }}>
          {backArrow(() => { setNotice(null); backFromChapters(); })}
          <View className="flex-1">
            <Text accessibilityRole="header" style={[typeScale.h1, { color: colors.ink }]}>{headerTitle}</Text>
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>
              {countOf(levelChapters.length, 'chapitre', 'chapit')} · {questionsLabel(activeLevel.questionCount, t)}
            </Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
          {noticeView}
          {offlineLine}
          {levelChapters.map((ch) => (
            <TouchableOpacity
              key={ch.key}
              onPress={() => { tapLight(); openEntry(scopeForChapter(ch, courses, allItems), ch.items, 'browse'); }}
              activeOpacity={0.82}
              style={cardStyle}
              accessibilityRole="button"
              accessibilityLabel={`${ch.title}, ${questionsLabel(ch.items.length, t)}`}
            >
              <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen color={tint} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typeScale.bodyMd, { color: colors.ink, fontSize: 15 }]} numberOfLines={2}>{ch.title}</Text>
                <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>
                  {[ch.unitNo != null ? t(`Chapitre ${ch.unitNo}`, `Chapit ${ch.unitNo}`) : '', questionsLabel(ch.items.length, t)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <ChevronRight color={colors.faint} size={18} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Level 2: grade levels within the chosen subject ────────────────────────
  if (activeBase) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {reviewModal}
        <View className="flex-row items-center px-4 pt-6 pb-3" style={{ gap: 8 }}>
          {backArrow(() => { tapLight(); setNotice(null); setSelectedSubject(null); setSelectedLevel(null); })}
          <View className="flex-1">
            <Text accessibilityRole="header" style={[typeScale.h1, { color: colors.ink }]}>{activeBase.baseName}</Text>
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>{t('Choisis un niveau', 'Chwazi yon nivo')}</Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
          {noticeView}
          {activeBase.levels.map((lvl) => (
            <TouchableOpacity
              key={lvl.code}
              onPress={() => { tapLight(); setSelectedLevel(lvl.code); }}
              activeOpacity={0.82}
              style={cardStyle}
              accessibilityRole="button"
              accessibilityLabel={`${readableCourseMeta(lvl.levelLabel ?? lvl.name, isCreole)}, ${questionsLabel(lvl.questionCount, t)}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{readableCourseMeta(lvl.levelLabel ?? lvl.name, isCreole)}</Text>
                <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>{questionsLabel(lvl.questionCount, t)}</Text>
              </View>
              <ChevronRight color={colors.faint} size={18} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Level 1: subject picker ────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {reviewModal}
      {/* Gate the back arrow on THIS stack's depth, not canGoBack(): canGoBack()
          also counts the parent tab navigator's history, so it stays true when
          this screen is its stack's only route (the Quiz tab) and the arrow then
          threw Quiz-primary students out to Accueil. */}
      <View className="flex-row items-center px-5 pt-6 pb-3" style={{ gap: 8 }}>
        {stackDepth > 1 ? backArrow(() => navigation.goBack()) : null}
        <View className="flex-1">
          <Text accessibilityRole="header" style={[typeScale.display, { color: colors.ink }]}>{t('Banque de questions', 'Bank kesyon')}</Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>{t('Entraîne-toi par matière, niveau et chapitre', 'Antrene w pa matyè, nivo ak chapit')}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={quizzesQ.isFetching} onRefresh={quizzesQ.refetch} />}
        contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
      >
        {noticeView}
        {offlineLine}
        {subjectGroups.length === 0 ? (
          <EmptyState
            message={t('Aucune question disponible pour le moment.', 'Pa gen kesyon disponib pou kounye a.')}
            ctaLabel={t('Actualiser', 'Aktyalize')}
            onCta={() => quizzesQ.refetch()}
          />
        ) : (
          subjectGroups.map((b) => {
            const tint = subjectColor(b.baseName);
            const levelSummary = b.levels.length > 1 ? `${b.levels.length} ${t('niveaux', 'nivo')} · ` : '';
            return (
              <TouchableOpacity
                key={b.baseName}
                onPress={() => { setNotice(null); openBase(b); }}
                activeOpacity={0.82}
                style={cardStyle}
                accessibilityRole="button"
                accessibilityLabel={`${b.baseName}, ${levelSummary}${questionsLabel(b.questionCount, t)}`}
              >
                <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen color={tint} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{b.baseName}</Text>
                  <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>
                    {levelSummary}{questionsLabel(b.questionCount, t)}
                  </Text>
                </View>
                <ChevronRight color={colors.faint} size={18} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
