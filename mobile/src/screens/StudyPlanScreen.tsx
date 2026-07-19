/**
 * StudyPlanScreen — mobile mirror of the web /study-plan page.
 *
 * • Loads the active plan from Firestore (users/{uid}/studyPlans, status
 *   'active') and shows today's tasks, the upcoming week, subject mastery and
 *   Sandra's tips, with per-task checkmarks for mastered items (completion is
 *   tracked automatically via SRS when exams are practised — same as the web).
 * • With no plan: a small setup form (filière + weeks + minutes/day) then
 *   generation through the same /api/generate-plan endpoint as the web.
 * • Handles 401 (sign-in prompt), 429 (rate-limit message) and network
 *   failures (retry button). Every string is FR/HT.
 * • Accepts an optional `onClose` prop (X button) for modal presentation.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  X,
  Lock,
  Sparkles,
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  Circle,
  Target,
  CalendarRange,
  Timer,
  Lightbulb,
  FileText,
  Pencil,
  Video,
  WifiOff,
  Clock,
  BarChart3,
  ChevronRight,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { auth } from '../services/firebase';
import { TRACKS } from '../config/trackConfig';
import { subjectColor } from '../utils/examUtils';
import {
  loadActiveStudyPlan,
  generateStudyPlan,
  getTodayTasks,
  getUpcomingTasks,
  computeSubjectMastery,
  StudyPlan,
  PlanTask,
} from '../services/studyPlanService';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#1B6FE0';
const CARD_BORDER = '#e8edf5';

const WEEK_OPTIONS = [4, 6, 8, 12];
const MINUTE_OPTIONS = [30, 60, 90, 120];

const TASK_TYPE_META: Record<string, { Icon: any; fr: string; ht: string; color: string }> = {
  exam: { Icon: FileText, fr: 'Examen', ht: 'Egzamen', color: '#ef4444' },
  practice: { Icon: Pencil, fr: 'Exercice', ht: 'Egzèsis', color: '#3b82f6' },
  video: { Icon: Video, fr: 'Vidéo', ht: 'Videyo', color: '#8b5cf6' },
};

type GenError =
  | { kind: 'limit'; message?: string }
  | { kind: 'network' }
  | { kind: 'auth' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ms: number | undefined, isCreole: boolean): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (isCreole) {
    const months = ['jan', 'fev', 'mas', 'avr', 'me', 'jen', 'jiy', 'out', 'sep', 'okt', 'nov', 'des'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function taskDisplayTitle(task: PlanTask, isCreole: boolean): string {
  if (task.type === 'practice') {
    return task.unitTitle || task.subjectCode || task.subject;
  }
  if (task.type === 'video') {
    return task.videoTitle || task.courseTitle || (isCreole ? 'Videyo' : 'Vidéo');
  }
  if (task.examTitle) return task.examTitle;
  return [task.subject, task.year].filter(Boolean).join(' · ') || (isCreole ? 'Egzamen' : 'Examen');
}

function difficultyColor(d: number): string {
  const colors: Record<number, string> = { 1: '#10b981', 2: '#34d399', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444' };
  return colors[d] || '#f59e0b';
}

// ─── Small building blocks ────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[{
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        padding: 16,
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
      }, style]}
    >
      {children}
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>{label}</Text>
    </View>
  );
}

function OptionChips<T extends string | number>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={String(opt)}
            onPress={() => onChange(opt)}
            activeOpacity={0.75}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? PRIMARY : CARD_BORDER,
              backgroundColor: active ? PRIMARY : '#ffffff',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#ffffff' : '#475569' }}>
              {labelOf(opt)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 14,
        paddingVertical: 12,
      }}
    >
      {icon}
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#64748b' }}>{label}</Text>
    </View>
  );
}

function TaskRow({
  task,
  isCreole,
  last,
  onPress,
}: {
  task: PlanTask;
  isCreole: boolean;
  last: boolean;
  onPress?: () => void;
}) {
  const meta = TASK_TYPE_META[task.type || 'exam'] || TASK_TYPE_META.exam;
  const TypeIcon = meta.Icon;
  const mastered = task.status === 'mastered';
  const overdue = !mastered && !!task.nextReviewMs && task.nextReviewMs < Date.now();
  const lastScore =
    task.history && task.history.length > 0 ? task.history[task.history.length - 1].scorePct : null;

  let secondary = '';
  if (task.type === 'practice' && task.questionCount) {
    secondary = `${task.questionCount} ${isCreole ? 'kesyon' : 'questions'}`;
  } else if (task.type === 'video' && task.duration) {
    secondary = `${task.duration} min`;
  }
  if (task.aiFocusArea) secondary = task.aiFocusArea;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={taskDisplayTitle(task, isCreole)}
      className={`flex-row items-center py-3 ${!last ? 'border-b border-gray-100' : ''}`}
      style={{ gap: 10, opacity: mastered ? 0.6 : 1 }}
    >
      {mastered ? (
        <CheckCircle2 size={20} color="#10b981" />
      ) : (
        <Circle size={20} color="#cbd5e1" />
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <TypeIcon size={13} color={meta.color} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: subjectColor(task.subject) }}>
            {task.subject}
          </Text>
          {typeof task.scheduledWeek === 'number' && (
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: PRIMARY }}>
                {isCreole ? 'Semèn' : 'Sem.'} {task.scheduledWeek}
                {typeof task.scheduledDay === 'number'
                  ? ` · ${isCreole ? 'Jou' : 'Jour'} ${task.scheduledDay}`
                  : ''}
              </Text>
            </View>
          )}
          {overdue && (
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#ef4444' }}>
              {isCreole ? 'Anreta' : 'En retard'}
            </Text>
          )}
        </View>

        <Text
          numberOfLines={2}
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: '#0f172a',
            textDecorationLine: mastered ? 'line-through' : 'none',
          }}
        >
          {taskDisplayTitle(task, isCreole)}
        </Text>

        {!!secondary && (
          <Text numberOfLines={1} style={{ fontSize: 11, color: '#64748b' }}>
            {secondary}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {lastScore !== null && lastScore !== undefined && (
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a' }}>{lastScore}%</Text>
        )}
        {task.type === 'exam' && (
          <Text style={{ fontSize: 10, color: difficultyColor(task.difficulty) }}>
            {'★'.repeat(Math.max(1, Math.min(5, task.difficulty || 3)))}
          </Text>
        )}
        <Text style={{ fontSize: 10, color: '#94a3b8' }}>{formatDate(task.nextReviewMs, isCreole)}</Text>
      </View>

      {onPress && !mastered && <ChevronRight size={16} color="#cbd5e1" />}
    </TouchableOpacity>
  );
}

function MasteryRow({ subject, pct }: { subject: string; pct: number }) {
  return (
    <View style={{ gap: 4, marginBottom: 10 }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ fontSize: 12, fontWeight: '700', color: subjectColor(subject) }}>{subject}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 6, borderRadius: 3, backgroundColor: PRIMARY }} />
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StudyPlanScreen({ onClose }: { onClose?: () => void }) {
  const { user, isAuthenticated, language, track, setTrack, toggleAuthModal } = useStore();
  const navigation = useNavigation<any>();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const uid: string | undefined = user?.uid;

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<GenError | null>(null);

  // Setup-form state (mirrors the web's generation preferences)
  const [selTrack, setSelTrack] = useState<string | null>(track);
  const [weeks, setWeeks] = useState(8);
  const [dailyMinutes, setDailyMinutes] = useState(90);

  useEffect(() => {
    if (track && !selTrack) setSelTrack(track);
  }, [track, selTrack]);

  // ── Load the active plan ────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    if (!uid || !auth.currentUser) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      setPlan(await loadActiveStudyPlan(uid));
    } catch {
      setPlan(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // ── Generate / regenerate ───────────────────────────────────────────
  const runGenerate = useCallback(
    async (opts: { track: string; weeks: number; dailyMinutes: number }) => {
      if (!uid) {
        toggleAuthModal();
        return;
      }
      setGenerating(true);
      setGenError(null);
      const result = await generateStudyPlan({ uid, ...opts });
      setGenerating(false);

      if (result.kind === 'ok') {
        if (opts.track !== track) setTrack(opts.track);
        setPlan(result.plan);
      } else if (result.kind === 'auth') {
        setGenError({ kind: 'auth' });
      } else if (result.kind === 'limit') {
        setGenError({ kind: 'limit', message: result.message });
      } else {
        setGenError({ kind: 'network' });
      }
    },
    [uid, track, setTrack, toggleAuthModal],
  );

  const handleGenerateFromForm = useCallback(() => {
    if (!selTrack) return;
    runGenerate({ track: selTrack, weeks, dailyMinutes });
  }, [selTrack, weeks, dailyMinutes, runGenerate]);

  const handleRegenerate = useCallback(() => {
    if (!plan) return;
    Alert.alert(
      t('Régénérer le plan ?', 'Rejenere plan an?'),
      t(
        'Un nouveau plan remplacera le plan actuel.',
        'Yon nouvo plan pral ranplase plan aktyèl la.',
      ),
      [
        { text: t('Annuler', 'Anile'), style: 'cancel' },
        {
          text: t('Régénérer', 'Rejenere'),
          onPress: () =>
            runGenerate({
              track: plan.track || track || 'SVT',
              weeks: plan.weeklyGoals || 8,
              dailyMinutes: plan.dailyTargetMinutes || 90,
            }),
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, track, runGenerate, isCreole]);

  // ── Open a task ─────────────────────────────────────────────────────
  // Tapping a task dismisses this modal and routes to where the work happens
  // (the plan itself only tracks progress — practice/exams live elsewhere).
  const openTask = useCallback(
    (task: PlanTask) => {
      const go = (screen: string, params?: object) => {
        onClose?.();
        navigation.navigate('Main', { screen, params });
      };
      if (task.type === 'exam' && task.examId && task.level) {
        go('Exams', { screen: 'ExamTake', params: { level: task.level, examId: task.examId } });
      } else if (task.type === 'exam') {
        go('Exams');
      } else if (task.type === 'practice') {
        go('Courses', { screen: 'Quizzes' });
      } else {
        go('Courses');
      }
    },
    [navigation, onClose],
  );

  // ── Derived plan data ───────────────────────────────────────────────
  const todayTasks = useMemo(() => getTodayTasks(plan), [plan]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(plan, 7), [plan]);
  const mastery = useMemo(() => computeSubjectMastery(plan), [plan]);

  const totalTasks = plan?.tasks?.length || 0;
  const masteredCount = plan?.tasks?.filter((tk) => tk.status === 'mastered').length || 0;
  const progressPct = totalTasks > 0 ? Math.round((masteredCount / totalTasks) * 100) : 0;

  const weakestSubjects = useMemo(
    () =>
      Object.entries(mastery)
        .sort((a, b) => (a[1].masteredPct || 0) - (b[1].masteredPct || 0))
        .slice(0, 3),
    [mastery],
  );

  // ── Shared header ───────────────────────────────────────────────────
  const header = (
    <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>
        {plan?.title || t("Plan d'Étude", 'Plan Etid')}
      </Text>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        {plan && !generating && (
          <TouchableOpacity
            onPress={handleRegenerate}
            activeOpacity={0.7}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: CARD_BORDER,
            }}
            accessibilityLabel={t('Régénérer', 'Rejenere')}
          >
            <RefreshCw size={17} color={PRIMARY} />
          </TouchableOpacity>
        )}
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: CARD_BORDER,
            }}
            accessibilityLabel={t('Fermer', 'Fèmen')}
          >
            <X size={18} color="#475569" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Not signed in ───────────────────────────────────────────────────
  if (!isAuthenticated || !uid) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 12 }}>
          <Lock size={40} color={PRIMARY} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
            {t('Connectez-vous pour voir votre plan', 'Konekte pou wè plan ou')}
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            {t(
              "Vous devez être connecté pour créer un plan d'étude personnalisé.",
              'Ou bezwen konekte pou kreye yon plan etid pèsonalize.',
            )}
          </Text>
          <TouchableOpacity
            onPress={toggleAuthModal}
            activeOpacity={0.8}
            style={{ backgroundColor: PRIMARY, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12, marginTop: 6 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
              {t('Se connecter', 'Konekte')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Generating (Sandra at work) ─────────────────────────────────────
  if (generating) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 14 }}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Sparkles size={18} color={PRIMARY} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
              {t('Sandra prépare votre plan…', 'Sandra ap prepare plan ou…')}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            {t('Cela prendra quelques secondes.', 'Sa ap pran kèk segonn.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading the saved plan ──────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Plan failed to load (offline) ───────────────────────────────────
  if (loadError && !plan) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 12 }}>
          <WifiOff size={38} color="#94a3b8" />
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
            {t('Erreur de connexion', 'Pwoblèm koneksyon')}
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            {t(
              'Impossible de charger votre plan. Vérifiez votre connexion internet.',
              'Nou pa t kapab chaje plan ou. Tcheke koneksyon entènèt ou.',
            )}
          </Text>
          <TouchableOpacity
            onPress={loadPlan}
            activeOpacity={0.8}
            style={{ backgroundColor: PRIMARY, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12, marginTop: 6 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
              {t('Réessayer', 'Eseye ankò')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error banner (generation) — rendered inside form & plan views ──
  const errorBanner = genError && (
    <Card style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2', marginBottom: 14 }}>
      <View className="flex-row items-start" style={{ gap: 10 }}>
        {genError.kind === 'limit' ? (
          <Clock size={18} color="#dc2626" />
        ) : genError.kind === 'auth' ? (
          <Lock size={18} color="#dc2626" />
        ) : (
          <WifiOff size={18} color="#dc2626" />
        )}
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ fontSize: 13, color: '#991b1b', fontWeight: '600' }}>
            {genError.kind === 'limit'
              ? genError.message ||
                t(
                  'Trop de demandes. Réessayez dans une heure.',
                  'Twòp demann. Eseye ankò nan yon èdtan.',
                )
              : genError.kind === 'auth'
                ? t(
                    'Session expirée. Reconnectez-vous pour continuer.',
                    'Sesyon an ekspire. Rekonekte pou kontinye.',
                  )
                : t(
                    'Erreur de connexion. Vérifiez votre internet et réessayez.',
                    'Pwoblèm koneksyon. Tcheke entènèt ou epi eseye ankò.',
                  )}
          </Text>
          {genError.kind === 'network' && (
            <TouchableOpacity
              onPress={
                plan
                  ? handleRegenerate
                  : handleGenerateFromForm
              }
              activeOpacity={0.8}
              style={{ alignSelf: 'flex-start', backgroundColor: '#dc2626', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                {t('Réessayer', 'Eseye ankò')}
              </Text>
            </TouchableOpacity>
          )}
          {genError.kind === 'auth' && (
            <TouchableOpacity
              onPress={toggleAuthModal}
              activeOpacity={0.8}
              style={{ alignSelf: 'flex-start', backgroundColor: '#dc2626', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                {t('Se connecter', 'Konekte')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  );

  // ── No plan yet → setup form ────────────────────────────────────────
  if (!plan) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
        {header}
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
          {errorBanner}

          <View className="items-center mb-5" style={{ gap: 8 }}>
            <ClipboardList size={36} color={PRIMARY} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
              {t("Pas encore de plan d'étude", 'Pa gen plan etid ankò')}
            </Text>
            <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
              {t(
                'Créez un plan personnalisé basé sur votre filière et vos performances.',
                'Kreye yon plan pèsonalize baze sou filiyè ou ak pèfòmans ou.',
              )}
            </Text>
          </View>

          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 10 }}>
              {t('Votre filière', 'Filiyè ou')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TRACKS.map((trk: any) => {
                const active = selTrack === trk.code;
                return (
                  <TouchableOpacity
                    key={trk.code}
                    onPress={() => setSelTrack(trk.code)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? trk.color : CARD_BORDER,
                      backgroundColor: active ? trk.color + '18' : '#ffffff',
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{trk.icon}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: active ? trk.color : '#475569' }}>
                      {trk.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 10 }}>
              {t('Durée du plan', 'Dire plan an')}
            </Text>
            <OptionChips
              options={WEEK_OPTIONS}
              value={weeks}
              onChange={setWeeks}
              labelOf={(w) => `${w} ${t('semaines', 'semèn')}`}
            />
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 10 }}>
              {t("Temps d'étude par jour", 'Tan etid pa jou')}
            </Text>
            <OptionChips
              options={MINUTE_OPTIONS}
              value={dailyMinutes}
              onChange={setDailyMinutes}
              labelOf={(m) => `${m} min`}
            />
          </Card>

          <TouchableOpacity
            onPress={handleGenerateFromForm}
            disabled={!selTrack}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: selTrack ? PRIMARY : '#cbd5e1',
              borderRadius: 999,
              paddingVertical: 15,
            }}
          >
            <Sparkles size={18} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 15 }}>
              {t('Créer mon plan', 'Kreye plan mwen')}
            </Text>
          </TouchableOpacity>

          {!selTrack && (
            <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>
              {t("Choisissez votre filière d'abord.", 'Chwazi filiyè ou anvan.')}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Plan view ───────────────────────────────────────────────────────
  const trackInfo = TRACKS.find((trk: any) => trk.code === plan.track);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }} edges={['top']}>
      {header}
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {errorBanner}

        {/* Progress card */}
        <Card style={{ marginBottom: 14 }}>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              {trackInfo && (
                <View style={{ backgroundColor: trackInfo.color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#ffffff' }}>
                    {trackInfo.shortLabel}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                {masteredCount}/{totalTasks} {t('maîtrisés', 'metrize')}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: PRIMARY }}>{progressPct}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
            <View style={{ width: `${progressPct}%`, height: 8, borderRadius: 4, backgroundColor: PRIMARY }} />
          </View>
          {!!plan.description && (
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>{plan.description}</Text>
          )}
        </Card>

        {/* Purpose hint */}
        <View
          className="flex-row items-center mb-4"
          style={{ gap: 8, backgroundColor: '#eef4fb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Sparkles size={15} color={PRIMARY} />
          <Text style={{ flex: 1, fontSize: 12, color: '#475569', lineHeight: 17 }}>
            {t(
              'Touchez une tâche pour la commencer. Votre progression se met à jour automatiquement.',
              'Peze yon travay pou kòmanse l. Pwogrè ou ap mete ajou otomatikman.',
            )}
          </Text>
        </View>

        {/* Quick stats */}
        <View className="flex-row mb-4" style={{ gap: 10 }}>
          <StatPill
            icon={<Target size={16} color={PRIMARY} />}
            value={todayTasks.length}
            label={t("aujourd'hui", 'jodi a')}
          />
          <StatPill
            icon={<CalendarRange size={16} color={PRIMARY} />}
            value={upcomingTasks.length}
            label={t('7 jours', '7 jou')}
          />
          <StatPill
            icon={<Timer size={16} color={PRIMARY} />}
            value={plan.dailyTargetMinutes || 90}
            label={`min/${t('jour', 'jou')}`}
          />
        </View>

        {/* Today's tasks */}
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle
            icon={<Target size={16} color={PRIMARY} />}
            label={t("Aujourd'hui", 'Jodi a')}
          />
          {todayTasks.length > 0 ? (
            todayTasks.map((task, i) => (
              <TaskRow
                key={task.examId || task.taskId || i}
                task={task}
                isCreole={isCreole}
                last={i === todayTasks.length - 1}
                onPress={() => openTask(task)}
              />
            ))
          ) : (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <CheckCircle2 size={16} color="#10b981" />
              <Text style={{ fontSize: 13, color: '#64748b' }}>
                {t(
                  "Vous êtes à jour, rien de prévu aujourd'hui !",
                  'Ou ajou, pa gen anyen pou jodi a!',
                )}
              </Text>
            </View>
          )}
        </Card>

        {/* Upcoming week */}
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle
            icon={<CalendarRange size={16} color={PRIMARY} />}
            label={t('Cette semaine', 'Semèn sa a')}
          />
          {upcomingTasks.length > 0 ? (
            upcomingTasks.map((task, i) => (
              <TaskRow
                key={task.examId || task.taskId || i}
                task={task}
                isCreole={isCreole}
                last={i === upcomingTasks.length - 1}
                onPress={() => openTask(task)}
              />
            ))
          ) : (
            <Text style={{ fontSize: 13, color: '#64748b' }}>
              {t('Aucune tâche cette semaine.', 'Pa gen travay pou semèn kap vini an.')}
            </Text>
          )}
        </Card>

        {/* Subject mastery (3 weakest) */}
        {weakestSubjects.length > 0 && (
          <Card style={{ marginBottom: 14 }}>
            <SectionTitle
              icon={<BarChart3 size={16} color={PRIMARY} />}
              label={t('Maîtrise par matière', 'Metriz pa matyè')}
            />
            {weakestSubjects.map(([subject, data]) => (
              <MasteryRow key={subject} subject={subject} pct={data.masteredPct || 0} />
            ))}
          </Card>
        )}

        {/* Sandra's tips */}
        {!!plan.tips?.length && (
          <Card style={{ marginBottom: 14 }}>
            <SectionTitle
              icon={<Lightbulb size={16} color="#f59e0b" />}
              label={t('Conseils de Sandra', 'Konsèy Sandra')}
            />
            {plan.tips.slice(0, 3).map((tip, i) => (
              <View key={i} className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: '#f59e0b' }}>•</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#475569', lineHeight: 19 }}>{tip}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Regenerate */}
        <TouchableOpacity
          onPress={handleRegenerate}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#ffffff',
            borderWidth: 1.5,
            borderColor: PRIMARY,
            borderRadius: 999,
            paddingVertical: 13,
          }}
        >
          <RefreshCw size={16} color={PRIMARY} />
          <Text style={{ color: PRIMARY, fontWeight: '800', fontSize: 14 }}>
            {t('Régénérer le plan', 'Rejenere plan an')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
