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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, FileText, Layers, Award, CheckCircle2, Play, RotateCcw, BarChart3,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, typeScale } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { ListSkeleton, ErrorState } from '../components/StateViews';
import { fetchCatalogIndex, fetchSingleExam } from '../utils/examCatalog';
import { subjectColor, QUESTION_TYPE_META, normalizeExamTitle, normalizeSubject } from '../utils/examUtils';
import { loadExamResult } from '../services/examResults';
import { loadExamAttemptDraft } from '../services/examAttempts';
import type { ExamsParamList } from '../navigation/ExamsNavigator';
import { tapLight, tapMedium } from '../utils/haptics';

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
  const { colors, cardSurface } = useTheme();

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
  const accent = subjectColor(slim?.subject || full?.subject || '');

  const sections: any[] = full?.sections || [];
  const sectionRows = sections.map((s, i) => ({
    title: s.section_title || `${t('Section', 'Seksyon')} ${i + 1}`,
    count: (s.questions || []).length,
  }));

  const qCount = slim?._questionCount
    || sections.reduce((n, s) => n + (s.questions || []).length, 0)
    || 0;
  const duration = slim?.duration_minutes || full?.duration_minutes || 0;
  const points = slim?.total_points || full?.total_points || 0;
  const autoGradable = slim?._autoGradable || 0;
  const diff = slim?.difficulty ? DIFFICULTY_META[slim.difficulty] : null;
  const langLabel = slim?.language ? (LANG_LABEL[slim.language] || String(slim.language).toUpperCase()) : null;
  const topics: string[] = Array.isArray(slim?.topics) ? slim.topics.slice(0, 6) : [];
  const tracks: string[] = (slim?.tracks || []).filter((x: string) => x && x !== 'ALL');
  const typeEntries = Object.entries(slim?._typeCounts || {})
    .sort((a: any, b: any) => Number(b[1]) - Number(a[1]));

  const pct = best?.percentage ?? null;
  const bestTone = pct == null ? colors.muted : pct >= 60 ? colors.success : pct >= 40 ? colors.warn : colors.danger;
  const bestDate = best?.submittedAtMs
    ? new Date(best.submittedAtMs).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const hasDraft = draftAnswered != null;
  const ctaLabel = hasDraft
    ? t("Reprendre l'examen", 'Kontinye egzamen an')
    : best
      ? t("Refaire l'examen", 'Refè egzamen an')
      : t("Commencer l'examen", 'Kòmanse egzamen an');
  const CtaIcon = hasDraft ? Play : best ? RotateCcw : Play;

  const start = () => {
    tapMedium();
    navigation.navigate('ExamTake', { level, examId, autostart: true });
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <TouchableOpacity
        onPress={() => { tapLight(); navigation.goBack(); }}
        style={{ padding: 4 }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('Retour', 'Retounen')}
      >
        <ArrowLeft color={colors.ink} size={22} />
      </TouchableOpacity>
      <Text style={[typeScale.titleSm, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
        {subject || t('Examen', 'Egzamen')}
      </Text>
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
        />
      </SafeAreaView>
    );
  }

  const Chip = ({ label }: { label: string }) => (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surfaceAlt ?? colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[typeScale.micro, { color: colors.muted, fontWeight: '700' }]}>{label}</Text>
    </View>
  );

  const Stat = ({ value, label }: { value: string | number; label: string }) => (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text style={[typeScale.num, { color: colors.ink }]} maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={[typeScale.micro, { color: colors.muted, marginTop: 2 }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 120 }}>
        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
          <Text style={[typeScale.overline, { color: colors.faint }]}>
            {[slim?.year, langLabel].filter(Boolean).join(' · ') || t('EXAMEN OFFICIEL', 'EGZAMEN OFISYÈL')}
          </Text>
        </View>
        <Text style={[typeScale.display, { color: colors.ink }]}>{title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {diff ? <Chip label={t(diff.fr, diff.ht)} /> : null}
          {tracks.map((code) => <Chip key={code} label={code} />)}
        </View>

        {/* Best score banner */}
        {best && (
          <View style={{ ...cardSurface, marginTop: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Award size={18} color={bestTone} />
            <Text style={[typeScale.caption, { color: colors.ink, flex: 1 }]}>
              {pct != null
                ? t(`Meilleur score : ${pct}%`, `Pi bon nòt : ${pct}%`)
                : t('Déjà tenté', 'Ou deja eseye l')}
              {bestDate ? `  ·  ${bestDate}` : ''}
            </Text>
          </View>
        )}

        {/* In-progress banner */}
        {hasDraft && (
          <View style={{ ...cardSurface, marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: colors.azureBorder }}>
            <Play size={16} color={colors.azure} />
            <Text style={[typeScale.caption, { color: colors.ink, flex: 1 }]}>
              {t(
                `Examen en cours — ${draftAnswered} réponse${(draftAnswered || 0) > 1 ? 's' : ''} enregistrée${(draftAnswered || 0) > 1 ? 's' : ''}.`,
                `Egzamen an ap kontinye — ${draftAnswered} repons anrejistre.`,
              )}
            </Text>
          </View>
        )}

        {/* Stat tiles */}
        <View style={{ ...cardSurface, marginTop: 16, flexDirection: 'row', paddingHorizontal: 4 }}>
          <Stat value={qCount} label={t('questions', 'kesyon')} />
          {duration > 0 ? <Stat value={duration} label={t('minutes', 'minit')} /> : null}
          {points > 0 ? <Stat value={points} label={t('points', 'pwen')} /> : null}
          <Stat value={sectionRows.length || '—'} label={t('sections', 'seksyon')} />
        </View>

        {autoGradable > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text style={[typeScale.micro, { color: colors.muted }]}>
              {isCreole
                ? `${autoGradable} kesyon korije otomatikman`
                : `${autoGradable} question${autoGradable > 1 ? 's' : ''} corrigée${autoGradable > 1 ? 's' : ''} automatiquement`}
            </Text>
          </View>
        )}

        {/* Structure */}
        {sectionRows.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Layers size={14} color={colors.faint} />
              <Text style={[typeScale.overline, { color: colors.faint }]}>{t('STRUCTURE', 'ESTRIKTI')}</Text>
            </View>
            <View style={{ ...cardSurface, paddingVertical: 4 }}>
              {sectionRows.map((s, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline ?? colors.border,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                  <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]} numberOfLines={2}>{s.title}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted }]}>{s.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Question types */}
        {typeEntries.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <FileText size={14} color={colors.faint} />
              <Text style={[typeScale.overline, { color: colors.faint }]}>{t('TYPES DE QUESTIONS', 'KALITE KESYON')}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {typeEntries.map(([type, count]) => {
                const meta = (QUESTION_TYPE_META as Record<string, any>)[type] || (QUESTION_TYPE_META as any).unknown;
                return <Chip key={type} label={`${meta.label} ${count}`} />;
              })}
            </View>
          </View>
        )}

        {/* Topics */}
        {topics.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <BarChart3 size={14} color={colors.faint} />
              <Text style={[typeScale.overline, { color: colors.faint }]}>{t('AU PROGRAMME', 'SA K LADAN L')}</Text>
            </View>
            <View style={{ gap: 6 }}>
              {topics.map((topic, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 7 }} />
                  <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]} numberOfLines={2}>{topic}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Duration hint when the catalog has none */}
        {duration === 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20 }}>
            <Clock size={13} color={colors.faint} />
            <Text style={[typeScale.micro, { color: colors.faint }]}>
              {t('Sans limite de temps — à votre rythme.', 'San limit tan — nan ritm pa ou.')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 28,
          backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.hairline ?? colors.border,
          gap: 10,
        }}
      >
        <PressableScale
          onPress={start}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.azureFill, borderRadius: 999, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <CtaIcon size={17} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 15 }}>{ctaLabel}</Text>
        </PressableScale>
        {best && (
          <TouchableOpacity
            onPress={() => { tapLight(); navigation.navigate('ExamResults', { level, examId }); }}
            activeOpacity={0.75}
            accessibilityRole="button"
            style={{ alignItems: 'center', paddingVertical: 6 }}
          >
            <Text style={{ color: colors.azure, fontWeight: '700', fontSize: 14 }}>
              {t('Revoir mes résultats', 'Gade rezilta mwen yo')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
