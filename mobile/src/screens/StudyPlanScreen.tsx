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
  Alert,
  AppState,
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
  Bell,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { auth } from '../services/firebase';
import { TRACKS, currentPlanSeason, gradeProfile } from '../config/trackConfig';
import { resetTabToRoot } from '../navigation/navHelpers';
import { subjectColor } from '../utils/examUtils';
import { useColors, useTheme, radius, typeScale, touch, type Palette } from '../theme/theme';
import {
  getStudyReminderHour,
  setStudyReminder,
  getNotificationPermissionAction,
  openNotificationSettings,
  type NotificationAskResult,
} from '../services/notificationService';
import { STUDY_REMINDER_HOURS, formatHour } from '../settings/notificationPermission';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { ErrorState, Skeleton } from '../components/StateViews';
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
  const { cardSurface } = useTheme();
  return (
    <View style={[cardSurface, { padding: 16 }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{label}</Text>
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
  const colors = useColors();
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={String(opt)}
            onPress={() => onChange(opt)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            style={{
              paddingHorizontal: 14,
              minHeight: touch.min,
              justifyContent: 'center',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? colors.azureFill : colors.border,
              backgroundColor: active ? colors.azureFill : colors.surface,
            }}
          >
            <Text style={[typeScale.bodyMd, { color: active ? '#ffffff' : colors.muted }]}>
              {labelOf(opt)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingVertical: 12,
      }}
    >
      {icon}
      <Text maxFontSizeMultiplier={1.6} style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{value}</Text>
      <Text style={[typeScale.label, { color: colors.muted, textAlign: 'center' }]}>{label}</Text>
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
  const colors = useColors();
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
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      // Read the row as "subject, title, status" so VoiceOver conveys the whole
      // task without needing to focus each fragment.
      accessibilityLabel={`${task.subject}, ${taskDisplayTitle(task, isCreole)}, ${
        mastered ? (isCreole ? 'metrize' : 'maîtrisé') : isCreole ? 'pou fè' : 'à faire'
      }`}
      accessibilityState={{ selected: mastered, disabled: !onPress }}
      className={`flex-row items-center py-3 ${!last ? 'border-b border-gray-100 dark:border-slate-700' : ''}`}
      style={{ gap: 10, opacity: mastered ? 0.6 : 1 }}
    >
      {mastered ? (
        <CheckCircle2 size={20} color={colors.success} />
      ) : (
        <Circle size={20} color={colors.faint} />
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <TypeIcon size={13} color={meta.color} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: subjectColor(task.subject) }}>
            {task.subject}
          </Text>
          {typeof task.scheduledWeek === 'number' && (
            <View style={{ backgroundColor: colors.azureSoft, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.azure }}>
                {isCreole ? 'Semèn' : 'Sem.'} {task.scheduledWeek}
                {typeof task.scheduledDay === 'number'
                  ? ` · ${isCreole ? 'Jou' : 'Jour'} ${task.scheduledDay}`
                  : ''}
              </Text>
            </View>
          )}
        </View>

        <Text
          numberOfLines={3}
          style={[
            typeScale.titleSm,
            { color: colors.ink, textDecorationLine: mastered ? 'line-through' : 'none' },
          ]}
        >
          {taskDisplayTitle(task, isCreole)}
        </Text>

        {/* Status is essential (it changes what to do first), so it gets its own
            14pt line instead of a 10pt tag squeezed into the meta row. */}
        {overdue && (
          <Text style={[typeScale.status, { color: colors.danger }]}>
            {isCreole ? 'Anreta' : 'En retard'}
          </Text>
        )}

        {!!secondary && (
          <Text numberOfLines={2} style={[typeScale.label, { color: colors.muted }]}>
            {secondary}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {lastScore !== null && lastScore !== undefined && (
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{lastScore}%</Text>
        )}
        {task.type === 'exam' && (
          <Text
            style={{ fontSize: 11, color: difficultyColor(task.difficulty) }}
            accessibilityLabel={`${isCreole ? 'Difikilte' : 'Difficulté'} ${Math.max(1, Math.min(5, task.difficulty || 3))}/5`}
          >
            {'★'.repeat(Math.max(1, Math.min(5, task.difficulty || 3)))}
          </Text>
        )}
        <Text style={[typeScale.caption, { color: colors.faint }]}>{formatDate(task.nextReviewMs, isCreole)}</Text>
      </View>

      {onPress && !mastered && <ChevronRight size={16} color={colors.faint} />}
    </PressableScale>
  );
}

function MasteryRow({ subject, pct }: { subject: string; pct: number }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4, marginBottom: 10 }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ fontSize: 13, fontWeight: '700', color: subjectColor(subject) }}>{subject}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 6, borderRadius: 3, backgroundColor: colors.azure }} />
      </View>
    </View>
  );
}

/**
 * Plan-shaped loading skeleton — mirrors the real plan layout (progress card,
 * stat pills, task rows) so the generating / loading states don't fall back to a
 * bare spinner and the page doesn't jump when content arrives.
 */
function PlanSkeleton({ label }: { label?: string }) {
  const colors = useColors();
  const centerColumn = useContentContainerStyle('readable');
  return (
    <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 40 }, centerColumn]}>
      {label ? (
        <View
          className="flex-row items-center mb-4"
          style={{ gap: 8, backgroundColor: colors.azureSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Sparkles size={15} color={colors.azure} />
          <Text accessibilityLiveRegion="polite" style={[typeScale.status, { flex: 1, color: colors.ink }]}>{label}</Text>
        </View>
      ) : null}

      {/* Progress card */}
      <Card style={{ marginBottom: 14 }}>
        <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
          <Skeleton width={120} height={14} />
          <Skeleton width={44} height={18} />
        </View>
        <Skeleton width="100%" height={8} radius={4} />
      </Card>

      {/* Stat pills */}
      <View className="flex-row mb-4" style={{ gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{ flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14 }}
          >
            <Skeleton width={18} height={18} radius={6} />
            <Skeleton width={30} height={16} />
            <Skeleton width={44} height={10} />
          </View>
        ))}
      </View>

      {/* Task rows */}
      <Card style={{ marginBottom: 14 }}>
        <Skeleton width={150} height={15} style={{ marginBottom: 14 }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="flex-row items-center" style={{ gap: 10, paddingVertical: 10 }}>
            <Skeleton width={20} height={20} radius={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="45%" height={11} />
              <Skeleton width="80%" height={13} />
            </View>
            <Skeleton width={30} height={12} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

// ─── Study reminder ───────────────────────────────────────────────────────────

/**
 * "Rappel d'étude" — the student picks a time (or none). Picking a time is the
 * moment notification permission is requested (audit #9): askForNotifications
 * explains the benefit first, asks the OS at most once, and after a denial we
 * show "Ouvrir les réglages" instead of asking again.
 */
function StudyReminderCard({ isCreole }: { isCreole: boolean }) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  // undefined = never chosen, null = off
  const [hour, setHour] = useState<number | null | undefined>(undefined);
  const [result, setResult] = useState<NotificationAskResult | 'off' | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the saved choice + whether it can actually fire.
  const refresh = useCallback(async () => {
    const [h, action] = await Promise.all([getStudyReminderHour(), getNotificationPermissionAction()]);
    setHour(h);
    if (h === null) setResult('off');
    else if (typeof h === 'number') setResult(action === 'granted' ? 'granted' : action === 'settings' ? 'blocked' : 'declined');
    else setResult(null);
    return { h, action };
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  // Back from the system settings with permission now on → schedule the saved time.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh()
        .then(({ h, action }) => {
          if (typeof h === 'number' && action === 'granted') setStudyReminder(h).catch(() => {});
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  const choose = async (next: number | null) => {
    if (busy) return;
    setBusy(true);
    setHour(next);
    try {
      setResult(await setStudyReminder(next));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const options: (number | null)[] = [...STUDY_REMINDER_HOURS, null];

  let status: string | null = null;
  if (result === 'granted' && typeof hour === 'number') {
    status = t(`Rappel chaque jour à ${formatHour(hour, false)}.`, `Rapèl chak jou a ${formatHour(hour, true)}.`);
  } else if (result === 'off') {
    status = t('Pas de rappel d’étude.', 'Pa gen rapèl etid.');
  } else if (result === 'declined' || result === 'denied') {
    status = t(
      'Rappel enregistré, mais les notifications ne sont pas activées.',
      'Rapèl la anrejistre, men notifikasyon yo pa aktive.',
    );
  } else if (result === 'blocked') {
    status = t(
      'Les notifications sont coupées dans les réglages du téléphone.',
      'Notifikasyon yo fèmen nan paramèt telefòn nan.',
    );
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle icon={<Bell size={16} color={colors.azure} />} label={t("Rappel d'étude", 'Rapèl etid')} />
      <Text style={[typeScale.body, { color: colors.muted, marginBottom: 12 }]}>
        {t('À quelle heure veux-tu réviser ?', 'Ki lè ou vle revize ?')}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="radiogroup">
        {options.map((h) => {
          const active = hour === h;
          const label = h == null ? t('Aucun', 'Okenn') : formatHour(h, isCreole);
          return (
            <TouchableOpacity
              key={String(h)}
              onPress={() => choose(h)}
              disabled={busy}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active, disabled: busy }}
              accessibilityLabel={h == null ? t('Aucun rappel', 'Okenn rapèl') : t(`Rappel à ${label}`, `Rapèl a ${label}`)}
              style={{
                minHeight: touch.min,
                minWidth: touch.min + 12,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.azureFill : colors.border,
                backgroundColor: active ? colors.azureFill : colors.surface,
              }}
            >
              <Text style={[typeScale.bodyMd, { color: active ? '#ffffff' : colors.ink }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {status ? (
        <Text accessibilityLiveRegion="polite" style={[typeScale.status, { color: result === 'granted' || result === 'off' ? colors.muted : colors.danger, marginTop: 12 }]}>
          {status}
        </Text>
      ) : null}
      {result === 'blocked' ? (
        <TouchableOpacity
          onPress={openNotificationSettings}
          accessibilityRole="button"
          accessibilityLabel={t('Ouvrir les réglages', 'Louvri paramèt yo')}
          style={{ alignSelf: 'flex-start', minHeight: touch.min, justifyContent: 'center', marginTop: 4 }}
        >
          <Text style={[typeScale.action, { color: colors.azure }]}>{t('Ouvrir les réglages', 'Louvri paramèt yo')}</Text>
        </TouchableOpacity>
      ) : null}
      {result === 'declined' && typeof hour === 'number' ? (
        <TouchableOpacity
          onPress={() => choose(hour)}
          accessibilityRole="button"
          accessibilityLabel={t('Activer les notifications', 'Aktive notifikasyon yo')}
          style={{ alignSelf: 'flex-start', minHeight: touch.min, justifyContent: 'center', marginTop: 4 }}
        >
          <Text style={[typeScale.action, { color: colors.azure }]}>{t('Activer les notifications', 'Aktive notifikasyon yo')}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StudyPlanScreen({ onClose }: { onClose?: () => void }) {
  const { user, isAuthenticated, language, track, grade, setTrack, toggleAuthModal } = useStore();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const centerColumn = useContentContainerStyle('readable');
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const uid: string | undefined = user?.uid;

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<GenError | null>(null);

  // Setup-form state (mirrors the web's generation preferences). Default to the
  // in-season mode: the user's Bac track if set, else Préfac once the Bac is over.
  const [selTrack, setSelTrack] = useState<string | null>(
    track || (currentPlanSeason() === 'prefac' ? 'PREFAC' : null),
  );
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
    } catch (err) {
      console.warn('[StudyPlan] loadPlan error:', err);
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
      // This screen sits on the ROOT stack, so the tab navigator is one level
      // down under "Main"; this exposes that navigator to resetTabToRoot.
      const tabNav = {
        getState: () =>
          navigation.getState()?.routes?.find((r: any) => r.name === 'Main')?.state,
        dispatch: (action: any) => navigation.dispatch(action),
        // Re-wrap in the "Main" hop the helper doesn't know about. Deliberately
        // not `go` — that would fire onClose a second time and pop twice.
        navigate: (screen: string, params?: object) =>
          navigation.navigate('Main', { screen, params }),
      };
      // Going to a tab's ROOT is a reset, not a navigate: React Navigation 7's
      // `navigate` no longer pops back to a screen already in the stack, it
      // pushes a second copy over whatever the tab retained. See navHelpers.
      const goTabRoot = (tab: string, root: string) => {
        onClose?.();
        resetTabToRoot(tabNav, tab, root);
      };
      // `initial: false` keeps the nested stack's root underneath the pushed
      // screen — without it the target becomes the stack's ONLY route, so
      // leaving it exits the tab entirely instead of stepping back one level.
      if (task.type === 'exam' && task.examId && task.level) {
        // Land on the exam's overview page (stats, attempts, one clear CTA)
        // rather than dropping straight into the paper.
        go('Exams', { screen: 'ExamOverview', params: { level: task.level, examId: task.examId }, initial: false });
      } else if (task.type === 'exam') {
        // Quiz-primary grades mount QuizNavigator behind the "Exams" route,
        // which has no ExamLanding — reachable if a junior grade picked a Bac
        // filière.
        goTabRoot('Exams', gradeProfile(grade).primaryTab === 'Quiz' ? 'Quizzes' : 'ExamLanding');
      } else if (task.type === 'practice') {
        go('Courses', { screen: 'Quizzes', initial: false });
      } else {
        goTabRoot('Courses', 'CourseList');
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
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>
        {plan?.title || t("Plan d'Étude", 'Plan Etid')}
      </Text>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        {plan && !generating && (
          <TouchableOpacity
            onPress={handleRegenerate}
            activeOpacity={0.7}
            hitSlop={touch.slop36}
            accessibilityRole="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityLabel={t('Régénérer', 'Rejenere')}
          >
            <RefreshCw size={17} color={colors.azure} />
          </TouchableOpacity>
        )}
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={touch.slop36}
            accessibilityRole="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityLabel={t('Fermer', 'Fèmen')}
          >
            <X size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Not signed in ───────────────────────────────────────────────────
  if (!isAuthenticated || !uid) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 12 }}>
          <Lock size={40} color={colors.azure} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
            {t('Connectez-vous pour voir votre plan', 'Konekte pou wè plan ou')}
          </Text>
          <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center' }]}>
            {t(
              "Vous devez être connecté pour créer un plan d'étude personnalisé.",
              'Ou bezwen konekte pou kreye yon plan etid pèsonalize.',
            )}
          </Text>
          <TouchableOpacity
            onPress={toggleAuthModal}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={{ backgroundColor: colors.azureFill, borderRadius: 999, paddingHorizontal: 28, minHeight: touch.min + 4, justifyContent: 'center', marginTop: 6 }}
          >
            <Text style={[typeScale.action, { color: '#ffffff' }]}>
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <PlanSkeleton label={t('Sandra prépare votre plan…', 'Sandra ap prepare plan ou…')} />
      </SafeAreaView>
    );
  }

  // ── Loading the saved plan ──────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <PlanSkeleton />
      </SafeAreaView>
    );
  }

  // ── Plan failed to load (offline) ───────────────────────────────────
  if (loadError && !plan) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ErrorState
          message={t(
            'Impossible de charger votre plan. Vérifiez votre connexion internet.',
            'Nou pa t kapab chaje plan ou. Tcheke koneksyon entènèt ou.',
          )}
          onRetry={loadPlan}
        />
      </SafeAreaView>
    );
  }

  // ── Error banner (generation) — rendered inside form & plan views ──
  const errorBanner = genError && (
    <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerSoft, marginBottom: 14 }}>
      <View className="flex-row items-start" style={{ gap: 10 }}>
        {genError.kind === 'limit' ? (
          <Clock size={18} color={colors.danger} />
        ) : genError.kind === 'auth' ? (
          <Lock size={18} color={colors.danger} />
        ) : (
          <WifiOff size={18} color={colors.danger} />
        )}
        <View style={{ flex: 1, gap: 8 }}>
          <Text accessibilityRole="alert" style={[typeScale.status, { color: colors.danger }]}>
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
              accessibilityRole="button"
              style={{ alignSelf: 'flex-start', backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 18, minHeight: touch.min, justifyContent: 'center' }}
            >
              <Text style={[typeScale.action, { color: '#ffffff' }]}>
                {t('Réessayer', 'Eseye ankò')}
              </Text>
            </TouchableOpacity>
          )}
          {genError.kind === 'auth' && (
            <TouchableOpacity
              onPress={toggleAuthModal}
              activeOpacity={0.8}
              accessibilityRole="button"
              style={{ alignSelf: 'flex-start', backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 18, minHeight: touch.min, justifyContent: 'center' }}
            >
              <Text style={[typeScale.action, { color: '#ffffff' }]}>
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 40 }, centerColumn]}>
          {errorBanner}

          <View className="items-center mb-5" style={{ gap: 8 }}>
            <ClipboardList size={36} color={colors.azure} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
              {t("Pas encore de plan d'étude", 'Pa gen plan etid ankò')}
            </Text>
            <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center' }]}>
              {t(
                'Créez un plan personnalisé basé sur votre filière et vos performances.',
                'Kreye yon plan pèsonalize baze sou filiyè ou ak pèfòmans ou.',
              )}
            </Text>
          </View>

          <Card style={{ marginBottom: 14 }}>
            <Text style={[typeScale.titleSm, { color: colors.ink, marginBottom: 10 }]}>
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
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    accessibilityLabel={trk.shortLabel}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      minHeight: touch.min,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? trk.color : colors.border,
                      backgroundColor: active ? trk.color + '18' : colors.surface,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{trk.icon}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: active ? trk.color : colors.muted }}>
                      {trk.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Text style={[typeScale.titleSm, { color: colors.ink, marginBottom: 10 }]}>
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
            <Text style={[typeScale.titleSm, { color: colors.ink, marginBottom: 10 }]}>
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
              backgroundColor: selTrack ? colors.azure : colors.faint,
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
            <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 40 }, centerColumn]}>
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
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>
                {masteredCount}/{totalTasks} {t('maîtrisés', 'metrize')}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 18, fontWeight: '800', color: colors.azure }}>{progressPct}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ width: `${progressPct}%`, height: 8, borderRadius: 4, backgroundColor: colors.azure }} />
          </View>
          {!!plan.description && (
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 10 }]}>{plan.description}</Text>
          )}
        </Card>

        {/* Purpose hint */}
        <View
          className="flex-row items-center mb-4"
          style={{ gap: 8, backgroundColor: colors.azureSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Sparkles size={15} color={colors.azure} />
          <Text style={[typeScale.body, { flex: 1, color: colors.ink }]}>
            {t(
              'Touchez une tâche pour la commencer. Votre progression se met à jour automatiquement.',
              'Peze yon travay pou kòmanse l. Pwogrè ou ap mete ajou otomatikman.',
            )}
          </Text>
        </View>

        {/* Quick stats */}
        <View className="flex-row mb-4" style={{ gap: 10 }}>
          <StatPill
            icon={<Target size={16} color={colors.azure} />}
            value={todayTasks.length}
            label={t("aujourd'hui", 'jodi a')}
          />
          <StatPill
            icon={<CalendarRange size={16} color={colors.azure} />}
            value={upcomingTasks.length}
            label={t('7 jours', '7 jou')}
          />
          <StatPill
            icon={<Timer size={16} color={colors.azure} />}
            value={plan.dailyTargetMinutes || 90}
            label={`min/${t('jour', 'jou')}`}
          />
        </View>

        {/* Today's tasks */}
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle
            icon={<Target size={16} color={colors.azure} />}
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
              <CheckCircle2 size={16} color={colors.success} />
              <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>
                {t(
                  "Vous êtes à jour, rien de prévu aujourd'hui !",
                  'Ou ajou, pa gen anyen pou jodi a!',
                )}
              </Text>
            </View>
          )}
        </Card>

        {/* Study reminder — the ONLY place a study reminder (and therefore the
            notification permission) is offered from a choice the student makes. */}
        <StudyReminderCard isCreole={isCreole} />

        {/* Upcoming week */}
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle
            icon={<CalendarRange size={16} color={colors.azure} />}
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
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {t('Aucune tâche cette semaine.', 'Pa gen travay pou semèn kap vini an.')}
            </Text>
          )}
        </Card>

        {/* Subject mastery (3 weakest) */}
        {weakestSubjects.length > 0 && (
          <Card style={{ marginBottom: 14 }}>
            <SectionTitle
              icon={<BarChart3 size={16} color={colors.azure} />}
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
              icon={<Lightbulb size={16} color={colors.warn} />}
              label={t('Conseils de Sandra', 'Konsèy Sandra')}
            />
            {plan.tips.slice(0, 3).map((tip, i) => (
              <View key={i} className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
                <Text style={[typeScale.body, { color: colors.warn }]}>•</Text>
                <Text style={[typeScale.body, { flex: 1, color: colors.ink }]}>{tip}</Text>
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
            backgroundColor: colors.surface,
            borderWidth: 1.5,
            borderColor: colors.azure,
            borderRadius: 999,
            paddingVertical: 13,
          }}
        >
          <RefreshCw size={16} color={colors.azure} />
          <Text style={{ color: colors.azure, fontWeight: '800', fontSize: 14 }}>
            {t('Régénérer le plan', 'Rejenere plan an')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
