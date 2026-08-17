import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GraduationCap, ChevronRight, BookOpen, Landmark, Check, PlayCircle, X,
  Calculator, Atom, FlaskConical, Leaf, PenLine, Globe, Brain, HeartPulse, Lightbulb,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { gradeProfile, TRACKS as ALL_TRACKS, TRACK_LEVEL } from '../config/trackConfig';
import { useColors, useTheme, radius, gradients } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { tapLight } from '../utils/haptics';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { normalizeSubject, normalizeLevel, normalizeYear, normalizeExamTitle } from '../utils/examUtils';
import { ExamsParamList } from '../navigation/ExamsNavigator';
import type { LastActivity } from '../contexts/store';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamLanding'>;

// The Bac séries, straight from the canonical cross-platform config. This
// screen used to declare its own list with codes 'LETT' and 'TEC', which exist
// nowhere else: setTrack('LETT') then silently broke every consumer
// (TRACK_COEFFICIENTS['LETT'] is undefined → unweighted readiness, StudyPlan's
// TRACKS.find returns undefined, parseTrackDirectives never matches).
// PREFAC is excluded — these chips sit under the Terminale (Bac) card.
const TRACKS = ALL_TRACKS.filter((tr) => TRACK_LEVEL[tr.code] === 'baccalaureat');

const LEVELS = [
  {
    id: 'terminale',
    label: 'Terminale (Bac)',
    labelHt: 'Tèminal (Bak)',
    sublabel: 'Examens officiels du Baccalauréat',
    sublabelHt: 'Egzamen ofisyèl Bakaloreya a',
    description: 'Révise les sujets des 5 dernières années.',
    descriptionHt: 'Revize sijè 5 dènye ane yo.',
    Icon: GraduationCap,
  },
  {
    id: '9e',
    label: '9ème Année',
    labelHt: '9yèm Ane',
    sublabel: 'Examens du cycle fondamental',
    sublabelHt: 'Egzamen sik fondamantal la',
    description: 'Prépare les épreuves nationales de 9ème.',
    descriptionHt: 'Prepare eprèv nasyonal 9yèm yo.',
    Icon: BookOpen,
  },
  {
    id: 'university',
    label: 'Université',
    labelHt: 'Inivèsite',
    sublabel: "Examens d'entrée et concours",
    sublabelHt: 'Egzamen antre ak konkou',
    description: 'Accès aux études supérieures.',
    descriptionHt: 'Aksè nan etid siperyè.',
    Icon: Landmark,
  },
];

// Subject quick-links per level — a Préfac student gets the concours pool
// (Culture Générale, Philo, Santé…), not the Bac subject list.
const SUBJECTS_BY_LEVEL: Record<string, Array<{ code: string; Icon: any }>> = {
  terminale: [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Physique', Icon: Atom },
    { code: 'Chimie', Icon: FlaskConical },
    { code: 'SVT', Icon: Leaf },
    { code: 'Français', Icon: PenLine },
    { code: 'Anglais', Icon: Globe },
  ],
  '9e': [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Physique', Icon: Atom },
    { code: 'Chimie', Icon: FlaskConical },
    { code: 'SVT', Icon: Leaf },
    { code: 'Français', Icon: PenLine },
    { code: 'Anglais', Icon: Globe },
  ],
  university: [
    { code: 'Mathématiques', Icon: Calculator },
    { code: 'Culture Générale', Icon: Lightbulb },
    { code: 'Français', Icon: PenLine },
    { code: 'Philosophie', Icon: Brain },
    { code: 'Santé', Icon: HeartPulse },
    { code: 'Anglais', Icon: Globe },
  ],
};

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
  try {
    const entry = (await fetchCatalogIndex()).find(
      (e: any) => String(e?.exam_id ?? e?.id ?? '') === best!.examId,
    );
    if (entry) {
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

  return { ...best, level, title: title || 'Examen', context };
}

export default function ExamLandingScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const { cardSurface, typeScale, shadow } = useTheme();
  const centerColumn = useContentContainerStyle('readable', { fill: true }); // iPad: center short hub content vertically
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, track, grade, lastActivity, setTrack, setOnboardingCompleted } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // The student's own exam level leads the page as a hero ("surround them with
  // THEIR content", per TestFlight feedback) — the other levels drop to a
  // compact secondary list instead of an undifferentiated stack of three.
  const EXAM_LEVEL_TO_ID: Record<string, string> = { baccalaureat: 'terminale', universite: 'university', '9eme_af': '9e' };
  const myLevelId = EXAM_LEVEL_TO_ID[gradeProfile(grade).examLevel ?? ''] ?? null;
  const myLevel = LEVELS.find((l) => l.id === myLevelId) ?? null;
  const otherLevels = myLevel ? LEVELS.filter((l) => l.id !== myLevel.id) : LEVELS;
  const subjectLevelId = myLevelId ?? 'terminale';
  const subjects = SUBJECTS_BY_LEVEL[subjectLevelId] ?? SUBJECTS_BY_LEVEL.terminale;

  function pickTrack(code: string) {
    setTrack(code);
    setOnboardingCompleted(true);
    navigation.navigate('ExamBrowser', { level: 'terminale' });
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
      findResumableExam(subjectLevelId, lastActivity)
        .then((r) => { if (active) setResume(r); })
        .catch(() => { /* keep whatever is on screen */ });
      return () => { active = false; };
    }, [subjectLevelId, lastActivity]),
  );

  function continueExam(target: ResumableExam) {
    tapLight();
    // Plain in-stack push: ExamLanding IS the root of ExamsNavigator, so back
    // pops to this screen. (`initial: false` is only needed when entering the
    // Exams stack from ANOTHER tab — see DashboardScreen / ResumeBanner — where
    // it keeps the stack root mounted underneath instead of exiting the tab.)
    navigation.navigate('ExamTake', { level: target.level, examId: target.examId });
  }

  // "Bac · Juillet 2022 · 3 réponses · il y a 2 h" — recognisable at a glance.
  const resumeMeta = React.useMemo(() => {
    if (!resume) return '';
    const answered = resume.answered > 0
      ? t(
        `${resume.answered} réponse${resume.answered > 1 ? 's' : ''}`,
        `${resume.answered} repons`,
      )
      : '';
    return [resume.context, answered, relativeWhen(resume.updatedAt, isCreole)].filter(Boolean).join(' · ');
  }, [resume, isCreole]);

  function dismissResume(target: ResumableExam) {
    tapLight();
    AsyncStorage.setItem(
      CONTINUE_DISMISS_KEY,
      JSON.stringify({ examId: target.examId, ts: target.updatedAt }),
    ).catch(() => {});
    setResume(null);
  }

  // Track (filière) chips — under the Terminale card/hero only.
  const trackChips = (onHero: boolean) => (
    <View style={{ paddingTop: onHero ? 14 : 2, paddingBottom: onHero ? 0 : 14, paddingHorizontal: onHero ? 0 : 16 }}>
      <Text style={[typeScale.overline, { color: onHero ? 'rgba(255,255,255,0.75)' : colors.faint, marginBottom: 8 }]}>
        {t('Ma filière', 'Seri mwen')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TRACKS.map((tr) => {
          const active = track === tr.code;
          return (
            <TouchableOpacity
              key={tr.code}
              onPress={() => pickTrack(tr.code)}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 99,
                borderWidth: 1,
                borderColor: onHero
                  ? (active ? '#ffffff' : 'rgba(255,255,255,0.35)')
                  : (active ? colors.azure : colors.border),
                backgroundColor: onHero
                  ? (active ? '#ffffff' : 'rgba(255,255,255,0.14)')
                  : (active ? colors.azureSoft : colors.surfaceAlt),
              }}
            >
              {active && <Check color={colors.azure} size={12} />}
              <Text style={[typeScale.label, {
                color: onHero ? (active ? colors.azure : '#ffffff') : (active ? colors.azure : colors.muted),
              }]}>
                {tr.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View className="px-5 pt-6 pb-5">
          <Text style={[typeScale.display, { color: colors.ink }]}>
            {t('Examens', 'Egzamen yo')}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>
            {t('Entraîne-toi avec des sujets officiels réels.', 'Pratike ak vrè sijè ofisyèl.')}
          </Text>
        </View>

        {/* Continuer — an exam started but never submitted. Sits ABOVE the
            "Ma préparation" hero: it's the one thing on this page the student
            already committed to, and burying it under a full-bleed gradient is
            how it got lost in the first place. Coral (not azure) so it reads as
            "unfinished" instead of competing with the hero. Renders nothing at
            all when there's no draft. */}
        {resume && (
          <View className="px-5 pb-4">
            <View style={[cardSurface, { overflow: 'hidden' }]}>
              <PressableScale
                onPress={() => continueExam(resume)}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={t(
                  `Continuer l'examen en cours : ${resume.title}`,
                  `Kontinye egzamen an kou a: ${resume.title}`,
                )}
                accessibilityHint={t('Reprend là où tu t\'es arrêté.', 'Repran kote ou te rete.')}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, minHeight: 72 }}
              >
                <View
                  style={{
                    width: 44, height: 44, borderRadius: radius.tile,
                    backgroundColor: colors.coralSoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <PlayCircle color={colors.coral} size={22} />
                </View>
                <View style={{ flex: 1, paddingRight: 28 }}>
                  <Text style={[typeScale.overline, { color: colors.coral }]}>
                    {t('Examen en cours', 'Egzamen an kou')}
                  </Text>
                  <Text style={[typeScale.title, { color: colors.ink, marginTop: 3 }]} numberOfLines={1}>
                    {resume.title}
                  </Text>
                  {!!resumeMeta && (
                    <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                      {resumeMeta}
                    </Text>
                  )}
                  <View
                    style={{
                      marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: colors.azureSoft, borderRadius: radius.pill,
                      paddingHorizontal: 14, paddingVertical: 7,
                    }}
                  >
                    <Text style={[typeScale.label, { color: colors.azure }]}>
                      {t('Continuer', 'Kontinye')}
                    </Text>
                    <ChevronRight color={colors.azure} size={14} />
                  </View>
                </View>
              </PressableScale>

              {/* Dismiss — rendered after the card body so it wins the touch in
                  its own corner. 44×44 target, clear of the Continuer pill. */}
              <PressableScale
                onPress={() => dismissResume(resume)}
                pressedScale={0.9}
                accessibilityRole="button"
                accessibilityLabel={t('Ignorer cet examen en cours', 'Inyore egzamen an kou a')}
                style={{
                  position: 'absolute', top: 0, right: 0, width: 44, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X color={colors.faint} size={16} />
              </PressableScale>
            </View>
          </View>
        )}

        {/* My level — the hero, when we know who the student is */}
        {myLevel && (
          <View className="px-5">
            <PressableScale
              onPress={() => { tapLight(); navigation.navigate('ExamBrowser', { level: myLevel.id }); }}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={t(myLevel.label, myLevel.labelHt)}
            >
              <LinearGradient
                colors={gradients.hero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.hero, padding: 18 }}
              >
                <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.75)' }]}>
                  {t('Ma préparation', 'Preparasyon mwen')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <View
                    style={{
                      width: 52, height: 52, borderRadius: 14,
                      backgroundColor: 'rgba(255,255,255,0.16)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <myLevel.Icon color="#ffffff" size={26} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[typeScale.h2, { color: '#ffffff' }]}>{t(myLevel.label, myLevel.labelHt)}</Text>
                    <Text style={[typeScale.caption, { color: '#bfdbfe', marginTop: 2 }]} numberOfLines={2}>
                      {t(myLevel.description, myLevel.descriptionHt)}
                    </Text>
                  </View>
                </View>

                {myLevel.id === 'terminale' && trackChips(true)}

                <View
                  style={{
                    marginTop: 16, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9,
                  }}
                >
                  <Text style={[typeScale.titleSm, { color: colors.azure }]}>
                    {t('Explorer mes sujets', 'Gade sijè mwen yo')}
                  </Text>
                  <ChevronRight color={colors.azure} size={16} />
                </View>
              </LinearGradient>
            </PressableScale>
          </View>
        )}

        {/* Subject quick-links — scoped to the student's level */}
        <View className="px-5 mt-6">
          <Text style={[typeScale.title, { color: colors.ink, marginBottom: 12 }]}>
            {t('Par matière', 'Pa matyè')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {subjects.map((subj) => (
              <PressableScale
                key={subj.code}
                onPress={() => navigation.navigate('ExamBrowser', { level: subjectLevelId, subject: subj.code })}
                accessibilityRole="button"
                accessibilityLabel={subj.code}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 99,
                  ...shadow.sm,
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <subj.Icon color={colors.azure} size={13} />
                </View>
                <Text style={[typeScale.label, { color: colors.muted }]}>{subj.code}</Text>
              </PressableScale>
            ))}
          </View>
        </View>

        {/* Other levels — compact secondary rows (the full stack when no grade) */}
        <View className="px-5 mt-6 gap-3">
          {myLevel && (
            <Text style={[typeScale.overline, { color: colors.faint }]}>
              {t('Autres niveaux', 'Lòt nivo yo')}
            </Text>
          )}
          {otherLevels.map((level) => (
            <View
              key={level.id}
              style={[cardSurface, { overflow: 'hidden' }]}
            >
              <PressableScale
                onPress={() => navigation.navigate('ExamBrowser', { level: level.id })}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={t(level.label, level.labelHt)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.azureSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <level.Icon color={colors.azure} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.title, { color: colors.ink }]}>{t(level.label, level.labelHt)}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                    {t(level.sublabel, level.sublabelHt)}
                  </Text>
                </View>
                <ChevronRight color={colors.faint} size={20} />
              </PressableScale>

              {/* Track (filière) chips — only when Terminale renders as a plain card (no grade chosen) */}
              {!myLevel && level.id === 'terminale' && trackChips(false)}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
