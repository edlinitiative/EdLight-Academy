/**
 * StudyPlanScreen — mobile mirror of the web /study-plan page (Stitch 12c).
 *
 * • Loads the active plan from Firestore (users/{uid}/studyPlans, status
 *   'active') and shows a week strip, the selected day's tasks, the plan's
 *   progress, the study reminder, subject mastery and Sandra's tips. Tasks
 *   complete automatically via SRS when exams are practised — same as the web.
 * • With no plan: a small setup form (filière + weeks + minutes/day) then
 *   generation through the same /api/generate-plan endpoint as the web.
 * • Handles 401 (sign-in prompt), 429 (rate-limit message) and network
 *   failures (retry button). Every string is FR/HT.
 * • Accepts an optional `onClose` prop (back button) for modal presentation.
 *
 * Every number on the page is read from the plan; nothing is estimated.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Alert, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft, ChevronRight, Lock, Sparkles, Check, FileText, ClipboardList, PlayCircle, Bell, WifiOff, Clock,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { auth } from '../services/firebase';
import { TRACKS, currentPlanSeason } from '../config/trackConfig';
import { planTaskNavAction } from '../navigation/planTaskNav';
import { findCourse } from '../components/journey/practice/practiceScope';
import { useCourses } from '../hooks/useData';
import { dedupePlanTasks, planTaskKey, planTaskLabels, isTaskOverdue } from '../../../shared/studyPlanTasks';
import { displayStoredExamTitle } from '../utils/examUtils';
import { useTheme, touch } from '../theme/theme';
import {
  getStudyReminderHour,
  setStudyReminder,
  getNotificationPermissionAction,
  openNotificationSettings,
  type NotificationAskResult,
} from '../services/notificationService';
import { STUDY_REMINDER_HOURS, formatHour } from '../settings/notificationPermission';
import PressableScale from '../components/ui/PressableScale';
import Button from '../components/ui/Button';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { ErrorState, Skeleton } from '../components/StateViews';
import {
  loadActiveStudyPlan,
  generateStudyPlan,
  getTodayTasks,
  computeSubjectMastery,
  StudyPlan,
  PlanTask,
} from '../services/studyPlanService';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_OPTIONS = [4, 6, 8, 12];
const MINUTE_OPTIONS = [30, 60, 90, 120];
const DAY_MS = 24 * 60 * 60 * 1000;
const GUTTER = 20;

const TASK_TYPE_ICON: Record<string, any> = { exam: FileText, practice: ClipboardList, video: PlayCircle };

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_HT = ['Len', 'Mad', 'Mèk', 'Jed', 'Van', 'Sam', 'Dim'];
const DAYS_LONG_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_LONG_HT = ['Lendi', 'Madi', 'Mèkredi', 'Jedi', 'Vandredi', 'Samdi', 'Dimanch'];

type GenError =
  | { kind: 'limit'; message?: string }
  | { kind: 'network' }
  | { kind: 'auth' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing `ms`. */
function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** A task's own name, before same-named tasks are told apart (planTaskLabels). */
function taskBaseTitle(task: PlanTask, isCreole: boolean): string {
  if (task.type === 'practice') {
    return task.unitTitle || task.subjectCode || task.subject;
  }
  if (task.type === 'video') {
    return task.videoTitle || task.courseTitle || (isCreole ? 'Videyo' : 'Vidéo');
  }
  const fallback = [task.subject, task.year].filter(Boolean).join(' · ') || (isCreole ? 'Egzamen' : 'Examen');
  // Older plans stored the ministry letterhead as the title; re-derive those.
  return displayStoredExamTitle(task.examTitle, undefined, fallback);
}

/** Verb + object, like the design: "Regarder · …", "Pratiquer · …". */
function taskLine(task: PlanTask, title: string, isCreole: boolean): string {
  const verb = task.type === 'video'
    ? (isCreole ? 'Gade' : 'Regarder')
    : task.type === 'practice'
      ? (isCreole ? 'Pratike' : 'Pratiquer')
      : (isCreole ? 'Fè egzamen an' : 'Passer l’examen');
  return `${verb} · ${title}`;
}

function taskKey(task: PlanTask, i: number): string {
  return planTaskKey(task) || `#${i}`;
}

// ─── Small building blocks ────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { cardSurface } = useTheme();
  return <View style={[cardSurface, { borderRadius: 24, padding: 20, marginBottom: 16 }, style]}>{children}</View>;
}

function CardTitle({ title, right }: { title: string; right?: string | null }) {
  const { colors, typeScale } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink, flexShrink: 1 }]}>{title}</Text>
      {right ? <Text style={[typeScale.meta, { color: colors.muted }]}>{right}</Text> : null}
    </View>
  );
}

/** Pill choices for the setup form + reminder: opaque, the active one azure. */
function ChoicePills<T extends string | number | null>({
  options,
  value,
  onChange,
  labelOf,
  a11yOf,
  disabled,
}: {
  options: T[];
  value: T | undefined;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  a11yOf?: (v: T) => string;
  disabled?: boolean;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <PressableScale
            key={String(opt)}
            onPress={() => onChange(opt)}
            disabled={disabled}
            pressedScale={0.96}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active, disabled }}
            accessibilityLabel={a11yOf ? a11yOf(opt) : labelOf(opt)}
            style={{
              minHeight: touch.min, minWidth: touch.min + 12, paddingHorizontal: 16,
              alignItems: 'center', justifyContent: 'center', borderRadius: 999,
              backgroundColor: active ? colors.azureFill : isDark ? colors.surfaceAlt : colors.surfaceAlt,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: active ? '#ffffff' : colors.ink }}>{labelOf(opt)}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function TaskRow({
  task,
  title,
  isCreole,
  done,
  onPress,
}: {
  task: PlanTask;
  title: string;
  isCreole: boolean;
  done: boolean;
  onPress?: () => void;
}) {
  const { colors, typeScale, fonts } = useTheme();
  const TypeIcon = TASK_TYPE_ICON[task.type || 'exam'] || FileText;
  // Late = due on a day that has passed, never "earlier today".
  const overdue = !done && isTaskOverdue(task);
  const lastScore = task.history && task.history.length > 0 ? task.history[task.history.length - 1].scorePct : null;

  let secondary = '';
  if (task.type === 'practice' && task.questionCount) {
    secondary = `${task.questionCount} ${isCreole ? 'kesyon' : 'questions'}`;
  } else if (task.type === 'video' && task.duration) {
    secondary = `${task.duration} min`;
  }
  if (task.aiFocusArea) secondary = task.aiFocusArea;
  const line = taskLine(task, title, isCreole);

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      pressedScale={0.985}
      haptic={!!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.subject}, ${line}, ${done ? (isCreole ? 'fini' : 'terminée') : isCreole ? 'pou fè' : 'à faire'}`}
      accessibilityState={{ selected: done, disabled: !onPress }}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10 }}
    >
      {done ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Check size={16} color="#ffffff" strokeWidth={3} />
        </View>
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.surfaceAlt, backgroundColor: colors.surface, marginTop: 2 }} />
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TypeIcon size={16} color={colors.muted} strokeWidth={2} />
          <Text style={[typeScale.meta, { color: colors.muted }]}>{task.subject}</Text>
        </View>
        <Text
          numberOfLines={3}
          style={{
            fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 23,
            color: done ? colors.muted : colors.ink,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
        >
          {line}
        </Text>
        {overdue ? (
          <Text style={[typeScale.status, { color: colors.dangerInk }]}>{isCreole ? 'Pou ratrape' : 'À rattraper'}</Text>
        ) : null}
        {!!secondary && !done ? (
          <Text numberOfLines={2} style={[typeScale.caption, { color: colors.muted }]}>{secondary}</Text>
        ) : null}
      </View>

      {lastScore !== null && lastScore !== undefined ? (
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink, marginTop: 4 }}>{lastScore}%</Text>
      ) : null}
      {onPress && !done ? <ChevronRight size={18} color={colors.faint} style={{ marginTop: 5 }} /> : null}
    </PressableScale>
  );
}

/**
 * Plan-shaped loading skeleton — mirrors the real plan layout (week strip,
 * today card, progress card) so the page doesn't jump when content arrives.
 */
function PlanSkeleton({ label }: { label?: string }) {
  const { colors, typeScale } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  return (
    <ScrollView contentContainerStyle={[{ paddingHorizontal: GUTTER, paddingBottom: 40 }, centerColumn]}>
      {label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.azureSoft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 }}>
          <Sparkles size={18} color={colors.azureInk} />
          <Text accessibilityLiveRegion="polite" style={[typeScale.status, { flex: 1, color: colors.ink }]}>{label}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} height={88} radius={16} style={{ flex: 1 }} />
        ))}
      </View>
      <Card>
        <Skeleton width={180} height={20} style={{ marginBottom: 18 }} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 10 }}>
            <Skeleton width={28} height={28} radius={14} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="35%" height={14} />
              <Skeleton width="85%" height={17} />
            </View>
          </View>
        ))}
        <Skeleton height={52} radius={12} style={{ marginTop: 12 }} />
      </Card>
      <Card>
        <Skeleton width={150} height={20} style={{ marginBottom: 14 }} />
        <Skeleton height={8} radius={4} />
      </Card>
    </ScrollView>
  );
}

// ─── Study reminder ───────────────────────────────────────────────────────────

/**
 * "Rappel" — the student picks a time (or none). Picking a time is the moment
 * notification permission is requested (audit #9): askForNotifications
 * explains the benefit first, asks the OS at most once, and after a denial we
 * show "Ouvrir les réglages" instead of asking again.
 *
 * Collapsed it is one row (bell, current choice, chevron); tapping it opens
 * the hour choices in place.
 */
function StudyReminderCard({ isCreole }: { isCreole: boolean }) {
  const { colors, typeScale, fonts, cardSurface } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  // undefined = never chosen, null = off
  const [hour, setHour] = useState<number | null | undefined>(undefined);
  const [result, setResult] = useState<NotificationAskResult | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

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

  const value =
    typeof hour === 'number'
      ? t(`Tous les jours à ${formatHour(hour, false)}`, `Chak jou a ${formatHour(hour, true)}`)
      : hour === null
        ? t('Aucun rappel', 'Okenn rapèl')
        : t('Choisir une heure', 'Chwazi yon lè');

  let problem: string | null = null;
  if (result === 'declined' || result === 'denied') {
    problem = t(
      'Rappel enregistré, mais les notifications ne sont pas activées.',
      'Rapèl la anrejistre, men notifikasyon yo pa aktive.',
    );
  } else if (result === 'blocked') {
    problem = t(
      'Les notifications sont coupées dans les réglages du téléphone.',
      'Notifikasyon yo fèmen nan paramèt telefòn nan.',
    );
  }

  return (
    <View style={[cardSurface, { borderRadius: 24, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 8 }]}>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Rappel', 'Rapèl')}, ${value}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={20} color={colors.ink} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Rappel', 'Rapèl')}</Text>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>{value}</Text>
        </View>
        <ChevronRight size={20} color={colors.faint} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
      </PressableScale>

      {problem ? (
        <Text accessibilityLiveRegion="polite" style={[typeScale.status, { color: colors.dangerInk, marginTop: 4, marginBottom: 6 }]}>{problem}</Text>
      ) : null}
      {result === 'blocked' ? (
        <Button size="sm" variant="secondary" label={t('Ouvrir les réglages', 'Louvri paramèt yo')} onPress={openNotificationSettings} style={{ alignSelf: 'flex-start', marginBottom: 10 }} />
      ) : null}
      {result === 'declined' && typeof hour === 'number' ? (
        <Button size="sm" variant="secondary" label={t('Activer les notifications', 'Aktive notifikasyon yo')} onPress={() => choose(hour)} style={{ alignSelf: 'flex-start', marginBottom: 10 }} />
      ) : null}

      {open ? (
        <View style={{ paddingBottom: 12, paddingTop: 4 }}>
          <Text style={[typeScale.body, { color: colors.muted, marginBottom: 12 }]}>
            {t('À quelle heure veux-tu réviser ?', 'Ki lè ou vle revize ?')}
          </Text>
          <ChoicePills
            options={options}
            value={hour ?? (hour === null ? null : undefined)}
            onChange={choose}
            disabled={busy}
            labelOf={(h) => (h == null ? t('Aucun', 'Okenn') : formatHour(h, isCreole))}
            a11yOf={(h) => (h == null ? t('Aucun rappel', 'Okenn rapèl') : t(`Rappel à ${formatHour(h, false)}`, `Rapèl a ${formatHour(h, true)}`))}
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StudyPlanScreen({ onClose }: { onClose?: () => void }) {
  const { user, isAuthenticated, language, track, setTrack, toggleAuthModal } = useStore();
  const { colors, typeScale, fonts, cardSurface, featureSurface, radius } = useTheme();
  const navigation = useNavigation<any>();
  const centerColumn = useContentContainerStyle('readable');
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const uid: string | undefined = user?.uid;

  // From a modal sheet, dismiss it BEFORE asking for sign-in: the auth Modal
  // cannot present over a native modal screen, and when it tries, every later
  // touch is swallowed (reproduced in the sim 2026-10-17).
  const openSignIn = () => {
    if (onClose) {
      onClose();
      setTimeout(toggleAuthModal, 450);
    } else {
      toggleAuthModal();
    }
  };

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

  // The day shown in the tasks card (week strip selection). Today by default.
  const todayStart = startOfDay(Date.now());
  const [dayStart, setDayStart] = useState(todayStart);

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
    async (opts: { track: string; weeks: number; dailyMinutes: number; replacePlanId?: string }) => {
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
      t('Refaire ton plan ?', 'Refè plan ou ?'),
      t(
        'Un nouveau plan remplacera le plan actuel.',
        'Yon nouvo plan pral ranplase plan aktyèl la.',
      ),
      [
        { text: t('Annuler', 'Anile'), style: 'cancel' },
        {
          text: t('Refaire', 'Refè'),
          onPress: () =>
            runGenerate({
              track: plan.track || track || 'SVT',
              weeks: plan.weeklyGoals || 8,
              dailyMinutes: plan.dailyTargetMinutes || 90,
              replacePlanId: plan.id,
            }),
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, track, runGenerate, isCreole]);

  // ── Open a task ─────────────────────────────────────────────────────
  // Tapping a task dismisses this modal and opens THAT task: the exam's
  // overview, the practice chapter, the lesson. Never a tab root or a subject
  // picker (TestFlight build 61: an SVT exam task landed on "Chimie, Choisis
  // un niveau"). A task missing its id is shown but not tappable.
  const { data: courses } = useCourses();
  const resolveCourseId = useCallback(
    (codeOrId: string) => findCourse(courses || [], codeOrId)?.id as string | undefined,
    [courses],
  );
  const actionFor = useCallback(
    (task: PlanTask) => planTaskNavAction(task, resolveCourseId),
    [resolveCourseId],
  );
  const openTask = useCallback(
    (task: PlanTask) => {
      const action = actionFor(task);
      if (!action) return;
      onClose?.();
      // This screen sits on the ROOT stack; the tabs live one level down under
      // "Main". `initial: false` (inside action.params) keeps the tab's root
      // under the pushed screen so back steps into the tab, not out of it.
      navigation.navigate('Main', { screen: action.tab, params: action.params });
    },
    [navigation, onClose, actionFor],
  );

  // ── Derived plan data ───────────────────────────────────────────────
  // Older plans can hold the same exam twice; one row each.
  const tasks = useMemo(() => dedupePlanTasks(plan?.tasks || []), [plan]);
  // Same-titled papers ("SVT · 2021" ×3) get a topic or "Sujet n" tail.
  const labels = useMemo(
    () => planTaskLabels(tasks, (tk) => taskBaseTitle(tk, isCreole), { subjectWord: isCreole ? 'Sijè' : 'Sujet' }),
    [tasks, isCreole],
  );
  const totalTasks = tasks.length;
  const masteredCount = tasks.filter((tk) => tk.status === 'mastered').length;
  const progressPct = totalTasks > 0 ? Math.round((masteredCount / totalTasks) * 100) : 0;
  const mastery = useMemo(() => computeSubjectMastery(plan), [plan]);
  const weakestSubjects = useMemo(
    () =>
      Object.entries(mastery)
        .sort((a, b) => (a[1].masteredPct || 0) - (b[1].masteredPct || 0))
        .slice(0, 3),
    [mastery],
  );

  const isToday = dayStart === todayStart;
  // Practised on a given day (done) vs due that day (to do). Today also carries
  // everything overdue, exactly as getTodayTasks defines it.
  const practisedOn = useCallback(
    (start: number) => tasks.filter((tk) => !!tk.lastPracticedMs && tk.lastPracticedMs >= start && tk.lastPracticedMs < start + DAY_MS),
    [tasks],
  );
  const dueOn = useCallback(
    (start: number) =>
      start === todayStart
        ? getTodayTasks({ ...(plan as StudyPlan), tasks })
        : tasks
            .filter((tk) => tk.status !== 'mastered' && (tk.nextReviewMs || 0) >= start && (tk.nextReviewMs || 0) < start + DAY_MS)
            .sort((a, b) => (a.nextReviewMs || 0) - (b.nextReviewMs || 0)),
    [tasks, plan, todayStart],
  );

  const dayDue = dueOn(dayStart);
  // Same object refs (both filter plan.tasks), so identity de-duplicates.
  const dueSet = new Set(dayDue);
  const dayDone = (dayStart <= todayStart ? practisedOn(dayStart) : []).filter((tk) => !dueSet.has(tk));
  const dayRows: { task: PlanTask; done: boolean }[] = [
    ...dayDone.map((task) => ({ task, done: true })),
    ...dayDue.map((task) => ({ task, done: false })),
  ];
  const nextTask = isToday ? dayDue.find((tk) => !!actionFor(tk)) : undefined;

  const weekStart = startOfWeek(Date.now());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const start = weekStart + i * DAY_MS;
    // DST-safe: re-anchor each day to its own midnight.
    const s = startOfDay(start + 2 * 60 * 60 * 1000);
    const hasTasks = s >= todayStart ? dueOn(s).length > 0 : practisedOn(s).length > 0;
    return { start: s, i, date: new Date(s).getDate(), hasTasks };
  });

  // ── Shared header ───────────────────────────────────────────────────
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: onClose ? 8 : GUTTER, paddingRight: 12, paddingTop: 8, paddingBottom: 12 }}>
      {onClose ? (
        <PressableScale
          onPress={onClose}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
          style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={26} color={colors.ink} strokeWidth={2.2} />
        </PressableScale>
      ) : null}
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={[typeScale.pageTitle, { color: colors.ink, flex: 1 }]}>
        {t('Mon plan', 'Plan mwen')}
      </Text>
      {plan && !generating ? (
        <PressableScale
          onPress={handleRegenerate}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel={t('Modifier mon plan', 'Modifye plan mwen')}
          style={{ minHeight: touch.min, paddingHorizontal: 8, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.azureInk }}>{t('Modifier', 'Modifye')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );

  // ── Not signed in ───────────────────────────────────────────────────
  if (!isAuthenticated || !uid) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER }}>
          <View style={[featureSurface, { padding: 24, alignItems: 'center' }]}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Lock size={26} color="#ffffff" strokeWidth={2.2} />
            </View>
            <Text style={[typeScale.section, { color: colors.ink, textAlign: 'center' }]}>
              {t('Connecte-toi pour voir ton plan', 'Konekte pou wè plan ou')}
            </Text>
            <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 20 }]}>
              {t(
                "Un compte garde ton plan d'étude personnalisé et ta progression.",
                'Yon kont kenbe plan etid pèsonalize ou ak pwogrè ou.',
              )}
            </Text>
            <Button label={t('Se connecter', 'Konekte')} onPress={openSignIn} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Generating (Sandra at work) ─────────────────────────────────────
  if (generating) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <PlanSkeleton label={t('Sandra prépare ton plan…', 'Sandra ap prepare plan ou…')} />
      </SafeAreaView>
    );
  }

  // ── Loading the saved plan ──────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <PlanSkeleton />
      </SafeAreaView>
    );
  }

  // ── Plan failed to load (offline) ───────────────────────────────────
  if (loadError && !plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ErrorState
          message={t(
            'Impossible de charger ton plan. Vérifie ta connexion internet.',
            'Nou pa t kapab chaje plan ou. Tcheke koneksyon entènèt ou.',
          )}
          onRetry={loadPlan}
        />
      </SafeAreaView>
    );
  }

  // ── Error banner (generation) — an opaque wash, no outline ─────────
  const errorBanner = genError && (
    <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 18, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      {genError.kind === 'limit' ? (
        <Clock size={20} color={colors.danger} />
      ) : genError.kind === 'auth' ? (
        <Lock size={20} color={colors.danger} />
      ) : (
        <WifiOff size={20} color={colors.danger} />
      )}
      <View style={{ flex: 1, gap: 10 }}>
        <Text accessibilityRole="alert" style={[typeScale.status, { color: colors.ink }]}>
          {genError.kind === 'limit'
            ? genError.message ||
              t('Trop de demandes. Réessaie dans une heure.', 'Twòp demann. Eseye ankò nan yon èdtan.')
            : genError.kind === 'auth'
              ? t('Session expirée. Reconnecte-toi pour continuer.', 'Sesyon an ekspire. Rekonekte pou kontinye.')
              : t('Erreur de connexion. Vérifie ton internet et réessaie.', 'Pwoblèm koneksyon. Tcheke entènèt ou epi eseye ankò.')}
        </Text>
        {genError.kind === 'network' ? (
          <Button
            size="sm"
            variant="outline"
            label={t('Réessayer', 'Eseye ankò')}
            onPress={plan ? handleRegenerate : handleGenerateFromForm}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
        {genError.kind === 'auth' ? (
          <Button size="sm" variant="outline" label={t('Se connecter', 'Konekte')} onPress={openSignIn} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </View>
  );

  // ── No plan yet → setup form ────────────────────────────────────────
  if (!plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ScrollView contentContainerStyle={[{ paddingHorizontal: GUTTER, paddingBottom: 40 }, centerColumn]}>
          {errorBanner}

          <Text style={[typeScale.body, { color: colors.muted, marginBottom: 20 }]}>
            {t(
              'Pas encore de plan. Sandra en crée un pour toi selon ta filière et tes résultats.',
              'Ou poko gen plan. Sandra ap kreye youn pou ou selon filyè ou ak rezilta ou.',
            )}
          </Text>

          <Card>
            <CardTitle title={t('Ta filière', 'Filyè ou')} />
            <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
              {TRACKS.map((trk: any) => {
                const active = selTrack === trk.code;
                return (
                  <PressableScale
                    key={trk.code}
                    onPress={() => setSelTrack(trk.code)}
                    pressedScale={0.985}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    accessibilityLabel={`${trk.shortLabel}, ${trk.label}`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56,
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.tile,
                      backgroundColor: active ? colors.azureSoft : colors.surfaceAlt,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.heading, fontSize: 17, color: active ? colors.azureInk : colors.ink, minWidth: 54 }}>
                      {trk.shortLabel}
                    </Text>
                    <Text numberOfLines={2} style={[typeScale.caption, { color: active ? colors.ink : colors.muted, flex: 1 }]}>
                      {trk.label}
                    </Text>
                    {active ? (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={14} color="#ffffff" strokeWidth={3} />
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
          </Card>

          <Card>
            <CardTitle title={t('Durée du plan', 'Dire plan an')} />
            <ChoicePills options={WEEK_OPTIONS} value={weeks} onChange={setWeeks} labelOf={(w) => `${w} ${t('semaines', 'semèn')}`} />
          </Card>

          <Card>
            <CardTitle title={t("Temps d'étude par jour", 'Tan etid pa jou')} />
            <ChoicePills options={MINUTE_OPTIONS} value={dailyMinutes} onChange={setDailyMinutes} labelOf={(m) => `${m} min`} />
          </Card>

          <Button
            size="lg"
            fullWidth
            disabled={!selTrack}
            label={t('Créer mon plan', 'Kreye plan mwen')}
            icon={<Sparkles size={18} color="#ffffff" />}
            onPress={handleGenerateFromForm}
          />
          {!selTrack ? (
            <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
              {t("Choisis ta filière d'abord.", 'Chwazi filyè ou anvan.')}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Plan view ───────────────────────────────────────────────────────
  const dayIndex = (new Date(dayStart).getDay() + 6) % 7;
  const dayName = isToday
    ? t("Aujourd'hui", 'Jodi a')
    : `${(isCreole ? DAYS_LONG_HT : DAYS_LONG_FR)[dayIndex]} ${new Date(dayStart).getDate()}`;
  const nRows = dayRows.length;
  const doneCount = dayDone.length;
  const cardHead = nRows > 0
    ? `${dayName} · ${nRows} ${nRows > 1 ? t('tâches', 'travay') : t('tâche', 'travay')}`
    : dayName;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[{ paddingHorizontal: GUTTER, paddingBottom: 40 }, centerColumn]}>
        {errorBanner}

        {/* Week strip — Monday to Sunday. A dot = something to do (or done) that day. */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }} accessibilityRole="tablist">
          {weekDays.map((d) => {
            const selected = d.start === dayStart;
            const today = d.start === todayStart;
            const fg = selected ? '#ffffff' : colors.ink;
            return (
              <PressableScale
                key={d.i}
                onPress={() => setDayStart(d.start)}
                pressedScale={0.95}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${(isCreole ? DAYS_LONG_HT : DAYS_LONG_FR)[d.i]} ${d.date}${today ? `, ${t("aujourd'hui", 'jodi a')}` : ''}${d.hasTasks ? `, ${t('tâches prévues', 'gen travay')}` : ''}`}
                style={[
                  cardSurface,
                  {
                    flex: 1, borderRadius: 16, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10,
                    backgroundColor: selected ? colors.azureFill : colors.surface,
                  },
                  selected ? { shadowOpacity: 0, elevation: 0 } : null,
                ]}
              >
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.medium, fontSize: 14, color: selected ? '#ffffff' : colors.muted }}>
                  {(isCreole ? DAYS_HT : DAYS_FR)[d.i]}
                </Text>
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.heading, fontSize: 18, lineHeight: 22, color: fg }}>{d.date}</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: d.hasTasks ? (selected ? '#ffffff' : colors.faint) : 'transparent' }} />
              </PressableScale>
            );
          })}
        </View>

        {/* The selected day's tasks. */}
        <Card>
          <CardTitle
            title={cardHead}
            right={nRows > 0 && dayStart <= todayStart ? t(`${doneCount}/${nRows} ${doneCount > 1 ? 'terminées' : 'terminée'}`, `${doneCount}/${nRows} fini`) : null}
          />
          {nRows > 0 ? (
            dayRows.map(({ task, done }, i) => (
              <TaskRow
                key={`${done ? 'd' : 'a'}-${taskKey(task, i)}`}
                task={task}
                title={labels.get(planTaskKey(task)) || taskBaseTitle(task, isCreole)}
                isCreole={isCreole}
                done={done}
                onPress={done || !actionFor(task) ? undefined : () => openTask(task)}
              />
            ))
          ) : (
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {isToday
                ? t("Tu es à jour, rien de prévu aujourd'hui.", 'Ou ajou, pa gen anyen pou jodi a.')
                : t('Rien de prévu ce jour-là.', 'Pa gen anyen pou jou sa a.')}
            </Text>
          )}
          {nextTask ? (
            <Button
              size="lg"
              fullWidth
              label={t('Commencer la prochaine tâche', 'Kòmanse pwochen travay la')}
              onPress={() => openTask(nextTask)}
              style={{ marginTop: 14 }}
            />
          ) : null}
        </Card>

        {/* Plan progress. */}
        <Card>
          <CardTitle
            title={t('Ton plan', 'Plan ou')}
            right={totalTasks > 0 ? t(`${masteredCount} tâches sur ${totalTasks}`, `${masteredCount} travay sou ${totalTasks}`) : null}
          />
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${progressPct}%`, height: 8, borderRadius: 4, backgroundColor: colors.azure }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 12 }}>
            <Text style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>
              {[
                plan.weeklyGoals ? t(`${plan.weeklyGoals} semaines`, `${plan.weeklyGoals} semèn`) : null,
                plan.dailyTargetMinutes ? t(`${plan.dailyTargetMinutes} min par jour`, `${plan.dailyTargetMinutes} min pa jou`) : null,
              ].filter(Boolean).join(' · ') || t('Tâches maîtrisées', 'Travay metrize')}
            </Text>
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink }}>{progressPct}%</Text>
          </View>
          {!!plan.description && (
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 12 }]}>{plan.description}</Text>
          )}
        </Card>

        {/* Study reminder — the ONLY place a study reminder (and therefore the
            notification permission) is offered from a choice the student makes. */}
        <StudyReminderCard isCreole={isCreole} />

        {/* Subject mastery (3 weakest). */}
        {weakestSubjects.length > 0 && (
          <Card>
            <CardTitle title={t('Maîtrise par matière', 'Metriz pa matyè')} />
            <View style={{ gap: 14 }}>
              {weakestSubjects.map(([subject, data]) => {
                const pct = Math.min(100, Math.max(0, data.masteredPct || 0));
                return (
                  <View key={subject} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{subject}</Text>
                      <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink }}>{pct}%</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: colors.azure }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Sandra's tips. */}
        {!!plan.tips?.length && (
          <Card>
            <CardTitle title={t('Conseils de Sandra', 'Konsèy Sandra')} />
            <View style={{ gap: 10 }}>
              {plan.tips.slice(0, 3).map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={[typeScale.body, { color: colors.azureInk }]}>•</Text>
                  <Text style={[typeScale.body, { flex: 1, color: colors.ink }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
