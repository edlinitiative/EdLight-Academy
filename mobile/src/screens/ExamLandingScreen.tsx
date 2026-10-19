import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, ArrowRight, X, History } from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile, TRACKS as ALL_TRACKS, TRACK_LEVEL } from '../config/trackConfig';
import { useTheme, fonts } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import PageTitle from '../components/ui/PageTitle';
import Segmented from '../components/ui/Segmented';
import StatNumeral from '../components/ui/StatNumeral';
import Button from '../components/ui/Button';
import { Skeleton, InlineError } from '../components/StateViews';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { tapLight } from '../utils/haptics';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { normalizeSubject, normalizeLevel, normalizeYear, normalizeExamTitle, subjectDisplayName } from '../utils/examUtils';
import { ExamsParamList } from '../navigation/ExamsNavigator';
import type { LastActivity } from '../contexts/store';
import { isOtherAccountDraft } from '../../../shared/examDraft';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamLanding'>;

// The Bac séries, straight from the canonical cross-platform config. This
// screen used to declare its own list with codes 'LETT' and 'TEC', which exist
// nowhere else: setTrack('LETT') then silently broke every consumer
// (TRACK_COEFFICIENTS['LETT'] is undefined → unweighted readiness, StudyPlan's
// TRACKS.find returns undefined, parseTrackDirectives never matches).
// PREFAC is excluded — these chips sit under the Terminale (Bac) card.
const TRACKS = ALL_TRACKS.filter((tr) => TRACK_LEVEL[tr.code] === 'baccalaureat');

// The three exam worlds, as the web's switch: Bac | 9ᵉ AF | Université.
const LEVELS = [
  { id: 'terminale', label: 'Bac', labelHt: 'Bak', long: 'Baccalauréat', longHt: 'Bakaloreya' },
  { id: '9e', label: '9ᵉ AF', labelHt: '9yèm AF', long: '9ᵉ année fondamentale', longHt: '9yèm ane fondamantal' },
  { id: 'university', label: 'Université', labelHt: 'Inivèsite', long: 'Université', longHt: 'Inivèsite' },
] as const;
type LevelId = typeof LEVELS[number]['id'];

// ─── "Continuer" (unfinished exam) ──────────────────────────────────────────
//
// WHICH SIGNAL, AND WHY — three candidates exist for "started but not
// submitted"; we use the local AsyncStorage draft mirror that ExamTakeScreen
// writes:
//
//   1. `edlight-exam-draft-<examId>` (AsyncStorage)  ← CHOSEN
//      ExamTakeScreen's `flushDraft()` writes this on a 10s timer, on blur /
//      unmount, and on AppState background — but ONLY while `phase ===
//      'questions'`, so its mere existence means the student actually started
//      answering, not just opened the overview. `doSubmit()` removes the key,
//      so it is also self-clearing on submit. It carries `updated_at_ms`,
//      which is what makes "the most recent one" answerable, and it is local:
//      no network, no auth, no flicker, works offline and for guests.
//
//   2. `users/{uid}/examAttempts/{examId}.status === 'in_progress'` (Firestore)
//      Authoritative and cross-device, but finding "the most recent" needs a
//      whole collection query (no helper exists in services/examAttempts.ts,
//      which only reads one doc by id), costs a network round-trip on every
//      tab visit, and is unavailable to signed-out students. ExamTakeScreen
//      itself already treats the local mirror as the newer/truer copy when the
//      two disagree (an app kill can lose the debounced Firestore write).
//
//   3. `lastActivity` in contexts/store.ts
//      Wrong shape for this feature: it is a single slot for ANY activity
//      type, so opening one lesson overwrites the exam — exactly the loss the
//      feedback is about. It IS a good metadata cache though, so we use it as
//      the title/level fallback when the catalog lookup can't resolve the id.
const EXAM_DRAFT_PREFIX = 'edlight-exam-draft-';
const CONTINUE_DISMISS_KEY = 'edlight-exam-continue-dismissed';

// Raw catalog `level` / `niveau` strings → this stack's ExamTake route level.
// Mirrors ExamBrowserScreen's LEVEL_FILTER_MAP (module-local there, so it can't
// be imported); keep the two in sync.
const LEVEL_FILTER_MAP: Record<string, string[]> = {
  terminale: ['baccalaureat', 'bac', 'terminale'],
  '9e': ['9eme', '9ème', '9e', 'neuvieme', 'neuvième'],
  university: ['universite', 'université', 'university'],
};

type ResumableExam = {
  examId: string;
  /** ExamTake requires a level param, so this is always resolved to something. */
  level: string;
  title: string;
  /** "Bac · Juillet 2022" — enough to recognise which exam this is. */
  context: string;
  answered: number;
  /** Questions in the paper, from the catalog index (0 = unknown). */
  total: number;
  updatedAt: number;
};

function relativeWhen(ms: number, isCreole: boolean): string {
  const diff = Date.now() - ms;
  if (!ms || diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isCreole ? 'kounye a' : "à l'instant";
  if (mins < 60) return isCreole ? `${mins} min pase` : `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isCreole ? `${hrs} è pase` : `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return isCreole ? `${days} jou pase` : `il y a ${days} j`;
}

/**
 * Newest unfinished exam, or null. Resolves entirely from cached local data in
 * the common case (draft mirror + AsyncStorage-cached catalog index).
 */
async function findResumableExam(
  fallbackLevel: string,
  lastActivity: LastActivity | null,
  uid?: string | null,
): Promise<ResumableExam | null> {
  let keys: readonly string[] = [];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return null;
  }
  const draftKeys = keys.filter((k) => k.startsWith(EXAM_DRAFT_PREFIX));
  if (draftKeys.length === 0) return null;

  let best: { examId: string; answered: number; updatedAt: number } | null = null;
  try {
    for (const [key, raw] of await AsyncStorage.multiGet(draftKeys)) {
      if (!raw) continue;
      let draft: any;
      try { draft = JSON.parse(raw); } catch { continue; }
      // Only `in_progress` counts; a submitted exam belongs on the results screen.
      if (!draft || draft.status !== 'in_progress') continue;
      // Another account's paper on this shared phone is not this student's.
      if (isOtherAccountDraft(draft, uid)) continue;
      const examId = key.slice(EXAM_DRAFT_PREFIX.length);
      if (!examId) continue;
      const updatedAt = Number(draft.updated_at_ms) || 0;
      if (best && updatedAt <= best.updatedAt) continue;
      best = {
        examId,
        answered: draft.answers && typeof draft.answers === 'object' ? Object.keys(draft.answers).length : 0,
        updatedAt,
      };
    }
  } catch {
    return null;
  }
  if (!best) return null;

  // Dismissed? Only stays hidden while the draft is unchanged — answering more
  // questions bumps `updated_at_ms` and brings the card back.
  try {
    const raw = await AsyncStorage.getItem(CONTINUE_DISMISS_KEY);
    if (raw) {
      const dismissed = JSON.parse(raw);
      if (dismissed?.examId === best.examId && Number(dismissed.ts) >= best.updatedAt) return null;
    }
  } catch { /* ignore corrupt value */ }

  // Metadata. The draft mirror stores answers only, so titles come from the
  // slim catalog index (AsyncStorage-cached, so usually no network).
  let title = '';
  let context = '';
  let level = fallbackLevel;
  let total = 0;
  try {
    const entry = (await fetchCatalogIndex()).find(
      (e: any) => String(e?.exam_id ?? e?.id ?? '') === best!.examId,
    );
    if (entry) {
      total = Number(entry._questionCount) || 0;
      title = normalizeSubject(entry.subject ?? '') || normalizeExamTitle(entry) || '';
      const rawLevel = String(entry.level ?? entry.niveau ?? '');
      const { session, year } = normalizeYear(entry.year);
      context = [normalizeLevel(rawLevel), session || (year ? String(year) : '')].filter(Boolean).join(' · ');
      const lvl = rawLevel.toLowerCase();
      const match = Object.entries(LEVEL_FILTER_MAP).find(([, needles]) => needles.some((n) => lvl.includes(n)));
      if (match) level = match[0];
    }
  } catch { /* offline / cold cache — fall through to lastActivity */ }

  // Fallback metadata: `lastActivity` still holds this exam's title when it was
  // the most recent thing the student touched.
  if (lastActivity?.type === 'exam' && lastActivity.path === best.examId) {
    if (!title) title = lastActivity.title;
    if (!context && lastActivity.subtitle) context = lastActivity.subtitle;
    if (lastActivity.level) level = lastActivity.level;
  }

  return { ...best, level, total, title: title || 'Examen', context };
}

type SubjectStat = { subject: string; count: number; minYear: number; maxYear: number };
type RecentPaper = { examId: string; subject: string; year: number; session: string; minutes: number; questions: number };

function levelOf(entry: any): LevelId | null {
  const lvl = String(entry?.level ?? entry?.niveau ?? '').toLowerCase();
  const match = Object.entries(LEVEL_FILTER_MAP).find(([, needles]) => needles.some((n) => lvl.includes(n)));
  return (match?.[0] as LevelId) ?? null;
}

function durationLabel(min: number, t: (fr: string, ht: string) => string): string {
  if (!min) return '';
  if (min % 60 === 0) return `${min / 60} h`;
  if (min > 60) return `${Math.floor(min / 60)} h ${min % 60}`;
  return t(`${min} min`, `${min} min`);
}

export default function ExamLandingScreen() {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface, typeScale } = useTheme();
  const { width } = useWindowDimensions();
  const centerColumn = useContentContainerStyle('readable');
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, track, grade, lastActivity, setTrack, setOnboardingCompleted } = useStore();
  const uid = useStore((s) => s.user?.uid ?? null);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // The student's own exam level is preselected on the switch.
  const EXAM_LEVEL_TO_ID: Record<string, LevelId> = { baccalaureat: 'terminale', universite: 'university', '9eme_af': '9e' };
  // gradeProfile(null) falls through to Bac — only trust it when a grade is set.
  const myLevelId: LevelId | null = grade ? (EXAM_LEVEL_TO_ID[gradeProfile(grade).examLevel ?? ''] ?? null) : null;
  const [level, setLevel] = React.useState<LevelId>(myLevelId ?? 'terminale');
  const levelTouched = React.useRef(false);
  React.useEffect(() => {
    if (!levelTouched.current && myLevelId) setLevel(myLevelId);
  }, [myLevelId]);

  // ── The catalog: counts and newest papers come from the real index ────────
  const [catalog, setCatalog] = React.useState<any[] | null>(null);
  // A failed fetch is NOT "no subjects": keep it distinct so the tile grid
  // offers a retry instead of telling the student the level is empty.
  const [catalogFailed, setCatalogFailed] = React.useState(false);
  const [catalogAttempt, setCatalogAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setCatalogFailed(false);
    fetchCatalogIndex()
      .then((c) => { if (active) setCatalog(Array.isArray(c) ? c : []); })
      .catch(() => { if (active) { setCatalog([]); setCatalogFailed(true); } });
    return () => { active = false; };
  }, [catalogAttempt]);

  const { subjects, total, recent } = React.useMemo(() => {
    const bySubject = new Map<string, SubjectStat>();
    const newest = new Map<string, RecentPaper>();
    let n = 0;
    for (const e of catalog ?? []) {
      if (levelOf(e) !== level) continue;
      const subject = normalizeSubject(e?.subject ?? '');
      if (!subject || subject === 'Autre') continue;
      n += 1;
      const { year, session } = normalizeYear(e?.year);
      const cur = bySubject.get(subject) ?? { subject, count: 0, minYear: 0, maxYear: 0 };
      cur.count += 1;
      if (year) {
        cur.minYear = cur.minYear ? Math.min(cur.minYear, year) : year;
        cur.maxYear = Math.max(cur.maxYear, year);
      }
      bySubject.set(subject, cur);
      const examId = String(e?.exam_id ?? e?.id ?? '');
      const prev = newest.get(subject);
      if (examId && year && (!prev || year > prev.year)) {
        newest.set(subject, {
          examId, subject, year, session,
          minutes: Number(e?.duration_minutes) || 0,
          questions: Number(e?._questionCount) || 0,
        });
      }
    }
    const list = Array.from(bySubject.values()).sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'fr'));
    const papers = Array.from(newest.values()).sort((a, b) => b.year - a.year || a.subject.localeCompare(b.subject, 'fr'));
    return { subjects: list, total: n, recent: papers.slice(0, 6) };
  }, [catalog, level]);

  function pickTrack(code: string) {
    tapLight();
    setTrack(code);
    setOnboardingCompleted(true);
  }

  // Unfinished exam → the "Continuer" card. `null` covers both "still looking"
  // and "nothing to resume", so the card only ever appears once we KNOW there
  // is something (never a placeholder, never a flicker in and out).
  const [resume, setResume] = React.useState<ResumableExam | null>(null);

  // Re-checked on every focus, so submitting or restarting an exam and coming
  // back here updates (or clears) the card. Never clears optimistically before
  // the async read resolves.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      findResumableExam(myLevelId ?? 'terminale', lastActivity, uid)
        .then((r) => { if (active) setResume(r); })
        .catch(() => { /* keep whatever is on screen */ });
      return () => { active = false; };
    }, [myLevelId, lastActivity, uid]),
  );

  function continueExam(target: ResumableExam) {
    tapLight();
    // Plain in-stack push: ExamLanding IS the root of ExamsNavigator, so back
    // pops to this screen. autostart: the student is resuming — no need to
    // re-read the intro page.
    navigation.navigate('ExamTake', { level: target.level, examId: target.examId, autostart: true });
  }

  // "3 réponses · il y a 2 h" — recognisable at a glance.
  const resumeMeta = React.useMemo(() => {
    if (!resume) return '';
    const answered = resume.answered > 0
      ? (resume.total > 0
        ? t(`${resume.answered} réponse${resume.answered > 1 ? 's' : ''} sur ${resume.total}`, `${resume.answered} repons sou ${resume.total}`)
        : t(`${resume.answered} réponse${resume.answered > 1 ? 's' : ''}`, `${resume.answered} repons`))
      : '';
    return [answered, relativeWhen(resume.updatedAt, isCreole)].filter(Boolean).join(' · ');
  }, [resume, isCreole]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismissResume(target: ResumableExam) {
    tapLight();
    AsyncStorage.setItem(
      CONTINUE_DISMISS_KEY,
      JSON.stringify({ examId: target.examId, ts: target.updatedAt }),
    ).catch(() => {});
    setResume(null);
  }

  const openSubject = (subject: string) => {
    tapLight();
    navigation.navigate('ExamBrowser', { level, subject, explicit: true });
  };
  const openAll = () => {
    tapLight();
    navigation.navigate('ExamBrowser', { level, explicit: true });
  };

  // Two tiles per row on a phone, three on a wide iPad column.
  const cols = width >= 700 ? 3 : 2;
  const tileBasis = `${(100 / cols) - 2}%` as const;
  const resumePct = resume && resume.total > 0 ? Math.min(100, Math.round((resume.answered / resume.total) * 100)) : null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={[{ paddingBottom: 110 }, centerColumn]} showsVerticalScrollIndicator={false}>
        <PageTitle
          title={t('Examens', 'Egzamen yo')}
          subtitle={t('Les vrais sujets d’examen, en conditions réelles.', 'Vrè sijè egzamen yo, nan kondisyon reyèl.')}
          right={(
            <PressableScale
              onPress={() => { tapLight(); navigation.navigate('ExamHistory'); }}
              haptic={false}
              pressedScale={0.96}
              accessibilityRole="link"
              accessibilityLabel={t('Mes résultats', 'Rezilta mwen yo')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
            >
              <History color={colors.azureInk} size={18} strokeWidth={2.2} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
                {t('Mes résultats', 'Rezilta mwen yo')}
              </Text>
            </PressableScale>
          )}
        />

        <View style={{ paddingHorizontal: 20 }}>
          {/* Examen en cours — the one thing the student already committed to.
              The page's only solid button. Renders nothing without a draft. */}
          {resume && (
            <View style={{ ...cardSurface, borderRadius: 24, padding: 20, marginTop: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 32 }}>
                <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>
                    {t('En cours', 'An kou')}
                  </Text>
                </View>
                {resume.context ? (
                  <Text numberOfLines={1} style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>{resume.context}</Text>
                ) : null}
              </View>
              <View style={{ gap: 2 }}>
                <Text numberOfLines={2} style={[typeScale.cardTitle, { fontSize: 20, lineHeight: 25, color: colors.ink }]}>{resume.title}</Text>
                {resumeMeta ? <Text style={[typeScale.meta, { color: colors.muted }]}>{resumeMeta}</Text> : null}
              </View>
              {resumePct != null ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Progression', 'Pwogresyon')}</Text>
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, lineHeight: 20, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                      {`${resumePct} %`}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                    <View style={{ width: `${resumePct}%`, height: 6, borderRadius: 999, backgroundColor: colors.azureFill }} />
                  </View>
                </View>
              ) : null}
              <Button
                label={t('Continuer', 'Kontinye')}
                accessibilityLabel={t(`Continuer l'examen en cours : ${resume.title}`, `Kontinye egzamen an kou a: ${resume.title}`)}
                onPress={() => continueExam(resume)}
                size="lg"
                fullWidth
                trailingIcon={<ArrowRight color="#ffffff" size={18} strokeWidth={2.4} />}
                style={{ marginTop: 4 }}
              />
              {/* Dismiss — its own 44×44 corner. */}
              <TouchableOpacity
                onPress={() => dismissResume(resume)}
                accessibilityRole="button"
                accessibilityLabel={t('Ignorer cet examen en cours', 'Inyore egzamen an kou a')}
                style={{ position: 'absolute', top: 8, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <X color={colors.muted} size={18} />
              </TouchableOpacity>
            </View>
          )}

          {/* Level switch — the student's own level preselected. */}
          <Segmented<LevelId>
            options={LEVELS.map((l) => ({ key: l.id, label: t(l.label, l.labelHt), accessibilityLabel: t(l.long, l.longHt) }))}
            value={level}
            onChange={(k) => { levelTouched.current = true; setLevel(k); }}
            style={{ marginTop: 20 }}
          />

          {/* Filière (Bac only) — the web's subject-chip style. */}
          {level === 'terminale' ? (
            <View style={{ marginTop: 16, gap: 8 }}>
              <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Ma filière', 'Seri mwen')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TRACKS.map((tr) => {
                  const on = track === tr.code;
                  return (
                    <TouchableOpacity
                      key={tr.code}
                      onPress={() => pickTrack(tr.code)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={tr.shortLabel}
                      style={{
                        minHeight: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center',
                        backgroundColor: on ? colors.ink : colors.surfaceAlt,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: on ? colors.bg : colors.ink }}>{tr.shortLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Choisis une matière — numbers lead every tile, no icons. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 32, marginBottom: 14 }}>
            <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, flexShrink: 1 }]}>
              {t('Choisis une matière', 'Chwazi yon matyè')}
            </Text>
            {total > 0 ? (
              <Text style={[typeScale.meta, { color: colors.muted }]}>
                {t(`${total} sujet${total > 1 ? 's' : ''}`, `${total} sijè`)}
              </Text>
            ) : null}
          </View>

          {catalog == null ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={{ ...cardSurface, flexBasis: tileBasis, flexGrow: 1, minHeight: 156, padding: 16, gap: 10 }}>
                  <Skeleton width={56} height={30} radius={8} />
                  <Skeleton width="70%" height={18} />
                  <Skeleton width="50%" height={14} />
                </View>
              ))}
            </View>
          ) : catalogFailed && subjects.length === 0 ? (
            <InlineError
              message={t('La liste des sujets n’a pas pu être chargée.', 'Lis sijè yo pa t ka chaje.')}
              onRetry={() => { setCatalog(null); setCatalogAttempt((n) => n + 1); }}
            />
          ) : subjects.length === 0 ? (
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {t('Aucun sujet disponible pour ce niveau pour le moment.', 'Pa gen sijè pou nivo sa a pou kounye a.')}
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {subjects.map((s) => {
                const name = subjectDisplayName(s.subject);
                const years = s.minYear && s.maxYear
                  ? (s.minYear === s.maxYear ? String(s.maxYear) : `${s.minYear} – ${s.maxYear}`)
                  : '';
                return (
                  <PressableScale
                    key={s.subject}
                    onPress={() => openSubject(s.subject)}
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, ${t(`${s.count} sujets`, `${s.count} sijè`)}${years ? `, ${years}` : ''}`}
                    style={{ ...cardSurface, flexBasis: tileBasis, flexGrow: 1, minHeight: 156, padding: 16, justifyContent: 'space-between' }}
                  >
                    <View style={{ gap: 6 }}>
                      <StatNumeral value={s.count} unit={t(s.count > 1 ? 'sujets' : 'sujet', 'sijè')} size={30} />
                      <Text numberOfLines={2} style={[typeScale.cardTitle, { fontSize: 18, lineHeight: 23, color: colors.ink }]}>{name}</Text>
                      {years ? <Text style={[typeScale.meta, { color: colors.muted }]}>{years}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 12 }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>{t('Commencer', 'Kòmanse')}</Text>
                      <ChevronRight color={colors.azureInk} size={16} strokeWidth={2.4} />
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          )}

          {/* Sujets récents — the newest paper per subject. */}
          {recent.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 32, marginBottom: 14 }}>
                <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, flexShrink: 1 }]}>
                  {t('Sujets récents', 'Sijè resan yo')}
                </Text>
                <TouchableOpacity onPress={openAll} accessibilityRole="link" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}>
                  <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>{t('Tout voir', 'Wè tout')}</Text>
                  <ChevronRight color={colors.azureInk} size={16} strokeWidth={2.4} />
                </TouchableOpacity>
              </View>
              <View style={{ gap: 12 }}>
                {recent.map((p) => {
                  const name = subjectDisplayName(p.subject);
                  const meta = [
                    p.session && p.session !== String(p.year) ? p.session : '',
                    p.minutes ? durationLabel(p.minutes, t) : '',
                    p.questions ? t(`${p.questions} questions`, `${p.questions} kesyon`) : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <PressableScale
                      key={p.examId}
                      onPress={() => { tapLight(); navigation.navigate('ExamOverview', { level, examId: p.examId }); }}
                      pressedScale={0.98}
                      accessibilityRole="button"
                      accessibilityLabel={`${name} ${p.year}${meta ? `, ${meta}` : ''}`}
                      style={{ ...cardSurface, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 84 }}
                    >
                      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: fonts.heading, fontSize: 16, lineHeight: 20, color: colors.azureInk, fontVariant: ['tabular-nums'] }}>{p.year}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>
                          {level === 'terminale' ? `${t('Bac', 'Bak')} ${name} ${p.year}` : `${name} ${p.year}`}
                        </Text>
                        {meta ? <Text numberOfLines={1} style={[typeScale.meta, { color: colors.muted }]}>{meta}</Text> : null}
                      </View>
                      <ChevronRight color={colors.faint} size={20} />
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
