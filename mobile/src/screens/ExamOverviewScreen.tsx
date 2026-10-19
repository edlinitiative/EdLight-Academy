/**
 * ExamOverviewScreen — the Coursera-style landing page for ONE exam.
 *
 * Sits between the browser and the take flow: what the paper covers
 * (stats, structure, question types, topics, filières), what YOU did with it
 * (best score, in-progress draft), and one clear CTA. Starting from here
 * passes `autostart` so ExamTake skips its own intro phase.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChevronLeft, ChevronRight, Clock, FileText, Award, CheckCircle2, ArrowRight, RotateCcw, Lightbulb, Play,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, typeScale, fonts } from '../theme/theme';
import Button from '../components/ui/Button';
import { ListSkeleton, ErrorState } from '../components/StateViews';
import { fetchCatalogIndex, fetchSingleExam } from '../utils/examCatalog';
import { QUESTION_TYPE_META, normalizeExamTitle, normalizeSubject, normalizeLevel, normalizeYear, subjectDisplayName, autoGradableCount, isEssayExam } from '../utils/examUtils';
import { loadExamResult } from '../services/examResults';
import { loadExamAttemptDraft } from '../services/examAttempts';
import type { ExamsParamList } from '../navigation/ExamsNavigator';
import { tapLight, tapMedium } from '../utils/haptics';
import { tabBarSpace } from '../navigation/tabBarSpace';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamOverview'>;
type Route = RouteProp<ExamsParamList, 'ExamOverview'>;

const GUTTER = 20;

const DIFFICULTY_META: Record<number, { fr: string; ht: string }> = {
  1: { fr: 'Facile', ht: 'Fasil' },
  2: { fr: 'Facile', ht: 'Fasil' },
  3: { fr: 'Moyen', ht: 'Mwayen' },
  4: { fr: 'Difficile', ht: 'Difisil' },
  5: { fr: 'Difficile', ht: 'Difisil' },
};

const LANG_LABEL: Record<string, string> = { fr: 'Français', ht: 'Kreyòl', en: 'English', es: 'Español' };

export default function ExamOverviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors, cardSurface, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [slim, setSlim] = useState<any | null>(null);
  const [full, setFull] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [best, setBest] = useState<{ percentage: number | null; submittedAtMs: number | null } | null>(null);
  const [draftAnswered, setDraftAnswered] = useState<number | null>(null);

  // Catalog entry (stats) + full paper (structure) — both cached layers.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([
      fetchCatalogIndex().catch(() => []),
      fetchSingleExam(examId),
    ])
      .then(([idx, fullExam]) => {
        if (!active) return;
        const entry = (idx || []).find((e: any) => String(e?.exam_id) === String(examId)) || null;
        setSlim(entry);
        setFull(fullExam);
        setLoading(false);
        if (!entry && !fullExam) setError(true);
      })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [examId, retryCount]);

  // Best score + in-progress draft — re-checked on focus so submitting and
  // coming back updates the banner/CTA without a reload.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!user?.uid) { setBest(null); setDraftAnswered(null); return; }
        try {
          const r = await loadExamResult(user.uid, String(examId));
          if (active && r) {
            const pct = typeof r?.summary?.percentage === 'number' ? r.summary.percentage
              : typeof r?.percentage === 'number' ? r.percentage : null;
            setBest({ percentage: pct, submittedAtMs: r?.submitted_at_ms ?? r?.created_at_ms ?? null });
          } else if (active) setBest(null);
        } catch { if (active) setBest(null); }

        // Draft: newer of Firestore doc vs AsyncStorage mirror (same rule as ExamTake).
        try {
          let draft: any = null;
          try { draft = await loadExamAttemptDraft(user.uid, String(examId)); } catch { /* ignore */ }
          try {
            const raw = await AsyncStorage.getItem(`edlight-exam-draft-${examId}`);
            if (raw) {
              const local = JSON.parse(raw);
              if (local && local.status === 'in_progress' &&
                  (!draft || (local.updated_at_ms || 0) > (draft.updated_at_ms || 0))) {
                draft = local;
              }
            }
          } catch { /* corrupt mirror */ }
          if (!active) return;
          if (draft && draft.status !== 'submitted') {
            const n = draft.answers ? Object.keys(draft.answers).length : 0;
            setDraftAnswered(n > 0 || (Number.isFinite(draft.currentIdx) && draft.currentIdx > 0) ? n : null);
          } else {
            setDraftAnswered(null);
          }
        } catch { if (active) setDraftAnswered(null); }
      })();
      return () => { active = false; };
    }, [user?.uid, examId]),
  );

  const title = useMemo(
    () => (full ? normalizeExamTitle(full) : slim?.exam_title || t('Examen', 'Egzamen')),
    [full, slim, isCreole],
  );
  const subject = slim?.subject ? normalizeSubject(slim.subject) : (full?.subject ? normalizeSubject(full.subject) : '');

  const sections: any[] = full?.sections || [];
  // Section titles arrive SHOUTED from the PDFs ("PREMIÈRE PARTIE"): sentence-case them.
  const sentence = (x: string) => {
    const str = String(x || '').trim();
    if (!str || str !== str.toUpperCase()) return str;
    const low = str.toLocaleLowerCase('fr');
    return low.charAt(0).toLocaleUpperCase('fr') + low.slice(1);
  };
  // "PARTIE A.- Recopier et compléter…" → name "Partie A", detail "Recopier…".
  const splitSection = (raw: string, i: number) => {
    const str = sentence(raw);
    const m = str.match(/^(partie|section|exercice|probl[eè]me)\s+([a-z0-9]{1,4})\s*[.:)\-–—]*\s*(.*)$/i);
    if (m) {
      const word = m[1].charAt(0).toLocaleUpperCase('fr') + m[1].slice(1).toLocaleLowerCase('fr');
      return { name: `${word} ${m[2].toUpperCase()}`, detail: m[3].trim() };
    }
    return { name: str || `${t('Partie', 'Pati')} ${i + 1}`, detail: '' };
  };
  const rawRows = sections.map((s, i) => ({
    ...splitSection(s.section_title, i),
    count: (s.questions || []).length,
    points: (s.questions || []).reduce((n: number, q: any) => n + (Number(q?.points) || 0), 0),
  }));
  // Optional exercises ("traiter trois des cinq") make the per-part sums
  // exceed the paper's total: then the per-part points would mislead — hide them.
  const totalPts = Number(slim?.total_points || full?.total_points) || 0;
  const sumPts = rawRows.reduce((n, r) => n + r.points, 0);
  const pointsHonest = totalPts > 0 && sumPts > 0 && sumPts <= totalPts;
  const sectionRows = rawRows.map((r) => ({ ...r, points: pointsHonest ? r.points : 0 }));

  const qCount = slim?._questionCount
    || sections.reduce((n, s) => n + (s.questions || []).length, 0)
    || 0;
  const duration = slim?.duration_minutes || full?.duration_minutes || 0;
  const points = slim?.total_points || full?.total_points || 0;
  // Counted from the type breakdown: the published counter credits essays.
  const autoGradable = autoGradableCount(slim);
  const essayExam = isEssayExam(slim);
  const diff = slim?.difficulty ? DIFFICULTY_META[slim.difficulty] : null;
  const langLabel = slim?.language ? (LANG_LABEL[slim.language] || String(slim.language).toUpperCase()) : null;
  // Catalog topics are noisy (section headers mixed in): keep real theme names.
  const topics: string[] = Array.isArray(slim?.topics)
    ? slim.topics.filter((x: any) => typeof x === 'string' && x.length >= 2 && x.length <= 40 && !/^[A-Z0-9IVX]+\s*[-–.)]/.test(x) && !/\d\s*$/.test(x)).slice(0, 8)
    : [];
  const tracks: string[] = (slim?.tracks || []).filter((x: string) => x && x !== 'ALL');
  const typeEntries = Object.entries(slim?._typeCounts || {})
    .sort((a: any, b: any) => Number(b[1]) - Number(a[1]));

  const pct = best?.percentage != null ? Math.round(best.percentage) : null;
  const bestDate = best?.submittedAtMs
    ? new Date(best.submittedAtMs).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const hasDraft = draftAnswered != null;
  const ctaLabel = hasDraft
    ? t("Reprendre l'examen", 'Kontinye egzamen an')
    : best
      ? t("Refaire l'examen", 'Refè egzamen an')
      : t("Commencer l'examen", 'Kòmanse egzamen an');

  const start = () => {
    tapMedium();
    navigation.navigate('ExamTake', { level, examId, autostart: true });
  };

  const levelLabel = normalizeLevel(String(slim?.level ?? full?.level ?? ''));
  const { year: yearNum, session } = normalizeYear(slim?.year ?? full?.year);
  const identity = [
    levelLabel,
    subjectDisplayName(subject),
    session || (yearNum ? String(yearNum) : ''),
    langLabel && slim?.language !== 'fr' ? langLabel : '',
  ].filter(Boolean).join(' · ');

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 }}>
      <TouchableOpacity
        onPress={() => { tapLight(); navigation.goBack(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('Retour', 'Retounen')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingRight: 12 }}
      >
        <ChevronLeft color={colors.azureInk} size={26} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.azureInk }}>{t('Examens', 'Egzamen yo')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }

  if (error || (!slim && !full)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <ErrorState
          title={t("Impossible de charger l'examen.", 'Nou pa ka chaje egzamen an.')}
          onRetry={() => setRetryCount((n) => n + 1)}
          secondaryLabel={t('Retour', 'Retounen')}
          onSecondary={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  const Chip = ({ label, tone = 'grey' }: { label: string; tone?: 'grey' | 'warn' | 'white' }) => {
    const bg = tone === 'warn' ? colors.warnSoft : tone === 'white' ? colors.surface : colors.surfaceAlt;
    const fg = tone === 'warn' ? (isDark ? colors.warn : '#9A5B00') : colors.ink;
    return (
      <View style={[{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: bg, justifyContent: 'center' }, tone === 'white' && !isDark ? { shadowColor: '#0B296B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 } : null]}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: fg }}>{label}</Text>
      </View>
    );
  };

  const durationValue = duration > 0
    ? (duration % 60 === 0 ? `${duration / 60} h` : duration > 60 ? `${Math.floor(duration / 60)} h ${duration % 60}` : `${duration} min`)
    : t('Libre', 'Lib');
  const facts: { Icon: any; value: string; label: string }[] = [
    { Icon: Clock, value: durationValue, label: t('Durée', 'Dire') },
    { Icon: FileText, value: String(qCount || '—'), label: t(qCount > 1 ? 'questions' : 'question', 'kesyon') },
    points > 0
      ? { Icon: Award, value: String(points), label: t('points', 'pwen') }
      : { Icon: Award, value: String(sectionRows.length || '—'), label: t('parties', 'pati') },
  ];

  const Section = ({ title: st }: { title: string }) => (
    <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink, marginBottom: 12 }]}>{st}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 120 + tabBarSpace(insets.bottom) }}>
        {/* Identity */}
        <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 30, lineHeight: 35, letterSpacing: -1, color: colors.ink }}>{title}</Text>
        {identity ? <Text style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]}>{identity}</Text> : null}
        {diff || tracks.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {diff ? <Chip label={t(diff.fr, diff.ht)} tone="warn" /> : null}
            {tracks.map((code) => <Chip key={code} label={code} />)}
          </View>
        ) : null}

        {/* In-progress — say what is saved before the button says "Reprendre". */}
        {hasDraft && (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: colors.azureSoft, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Play size={16} color={colors.azureInk} />
            <Text style={[typeScale.bodyMd, { color: colors.ink, flex: 1 }]}>
              {t(
                `Examen en cours : ${draftAnswered} réponse${(draftAnswered || 0) > 1 ? 's' : ''} enregistrée${(draftAnswered || 0) > 1 ? 's' : ''}.`,
                `Egzamen an ap kontinye : ${draftAnswered} repons anrejistre.`,
              )}
            </Text>
          </View>
        )}

        {/* Three fact tiles — numbers first. */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          {facts.map((f) => (
            <View
              key={f.label}
              accessible
              accessibilityLabel={`${f.value} ${f.label}`}
              style={{ ...cardSurface, flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 6 }}
            >
              <f.Icon color={colors.azureInk} size={20} strokeWidth={2.2} />
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, letterSpacing: -0.6, color: colors.ink, fontVariant: ['tabular-nums'] }}>{f.value}</Text>
              <Text numberOfLines={1} style={[typeScale.label, { color: colors.muted }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        {autoGradable > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <CheckCircle2 size={16} color={isDark ? colors.success : colors.successFill} />
            <Text style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>
              {isCreole
                ? `${autoGradable} kesyon korije otomatikman`
                : `${autoGradable} question${autoGradable > 1 ? 's' : ''} corrigée${autoGradable > 1 ? 's' : ''} automatiquement`}
            </Text>
          </View>
        )}

        {/* Essay papers grade nothing by themselves: say plainly what the
            paper does carry — a guided plan, hints, and a model answer. */}
        {essayExam && (
          <View style={{ marginTop: 16, padding: 16, gap: 8, borderRadius: 18, backgroundColor: colors.azureSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={17} color={colors.azureInk} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
                {t('Épreuve de rédaction', 'Egzamen redaksyon')}
              </Text>
            </View>
            <Text style={[typeScale.body, { color: colors.ink }]}>
              {t(
                "Pas de correction automatique ici : tu écris, puis tu compares. Chaque sujet vient avec un plan guidé, des indices si tu bloques, et un corrigé modèle.",
                "Pa gen koreksyon otomatik la a : ou ekri, apre ou konpare. Chak sijè gen yon plan gide, endis si ou bloke, ak yon modèl repons.",
              )}
            </Text>
          </View>
        )}

        {/* Thèmes abordés */}
        {topics.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Section title={t('Thèmes abordés', 'Tèm yo')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {topics.map((topic) => <Chip key={topic} label={topic} tone="white" />)}
            </View>
          </View>
        )}

        {/* Structure — a letter per part, its size, its weight. */}
        {sectionRows.length > 0 && (
          <View style={{ ...cardSurface, borderRadius: 24, padding: 18, marginTop: 28 }}>
            <Section title={t('Structure', 'Estrikti')} />
            <View style={{ gap: 10 }}>
              {sectionRows.map((row, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
                    backgroundColor: isDark ? colors.surfaceAlt : colors.bg,
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 20, color: colors.azureInk }}>{/^(Partie|Section) ([A-Z])$/.test(row.name) ? row.name.slice(-1) : String.fromCharCode(65 + (i % 26))}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink }}>{row.name}</Text>
                    {row.detail ? <Text numberOfLines={2} style={[typeScale.meta, { color: colors.muted }]}>{row.detail}</Text> : null}
                    <Text style={[typeScale.meta, { color: colors.muted }]}>
                      {t(`${row.count} question${row.count > 1 ? 's' : ''}`, `${row.count} kesyon`)}
                    </Text>
                  </View>
                  {row.points > 0 ? (
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, lineHeight: 20, color: colors.muted, fontVariant: ['tabular-nums'] }}>
                      {`${row.points} ${t('pts', 'pwen')}`}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Question types */}
        {typeEntries.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Section title={t('Types de questions', 'Kalite kesyon')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {typeEntries.map(([type, count]) => {
                const meta = (QUESTION_TYPE_META as Record<string, any>)[type] || (QUESTION_TYPE_META as any).unknown;
                return <Chip key={type} label={`${meta.label} · ${count}`} />;
              })}
            </View>
          </View>
        )}

        {/* Ta dernière tentative */}
        {best && (
          <View style={{ ...cardSurface, borderRadius: 24, padding: 18, marginTop: 28, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[typeScale.cardTitle, { color: colors.ink, flexShrink: 1 }]}>{t('Ta dernière tentative', 'Dènye tantativ ou')}</Text>
              {bestDate ? <Text style={[typeScale.meta, { color: colors.muted }]}>{bestDate}</Text> : null}
            </View>
            {pct != null ? (
              <Text accessibilityLabel={t(`${pct} sur 100`, `${pct} sou 100`)} style={{ fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, letterSpacing: -1.4, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                {pct}
                <Text style={{ fontFamily: fonts.headingBold, fontSize: 20, letterSpacing: 0, color: colors.muted }}>/100</Text>
              </Text>
            ) : (
              <Text style={[typeScale.body, { color: colors.muted }]}>{t('Déjà tenté', 'Ou deja eseye l')}</Text>
            )}
            <TouchableOpacity
              onPress={() => { tapLight(); navigation.navigate('ExamResults', { level, examId }); }}
              accessibilityRole="link"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 }}
            >
              <Text style={[typeScale.bodyMd, { fontFamily: fonts.bold, color: colors.azureInk }]}>{t('Voir la correction', 'Wè koreksyon an')}</Text>
              <ChevronRight color={colors.azureInk} size={18} />
            </TouchableOpacity>
          </View>
        )}

        {/* Duration hint when the catalog has none */}
        {duration === 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <Clock size={16} color={colors.muted} />
            <Text style={[typeScale.meta, { color: colors.muted }]}>
              {t('Sans limite de temps, à votre rythme.', 'San limit tan, nan ritm pa ou.')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Pinned CTA — clears the floating tab bar (TestFlight 2026-09-04). */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: GUTTER, paddingTop: 12,
          paddingBottom: tabBarSpace(insets.bottom),
          backgroundColor: colors.bg,
        }}
      >
        <Button
          label={ctaLabel}
          onPress={start}
          size="lg"
          fullWidth
          icon={best && !hasDraft ? <RotateCcw size={18} color="#ffffff" /> : undefined}
          trailingIcon={!best || hasDraft ? <ArrowRight size={18} color="#ffffff" strokeWidth={2.4} /> : undefined}
        />
      </View>
    </SafeAreaView>
  );
}
