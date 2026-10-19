/**
 * ExamHistoryScreen — "Mes résultats": every submitted exam, newest first.
 *
 * Rows resolve their title/subject/level from the slim catalog index and tap
 * through to the full ExamResults review. Reached from the ExamLanding hub.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, BarChart3, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, typeScale, fonts } from '../theme/theme';
import { ListSkeleton, EmptyState, ErrorState } from '../components/StateViews';
import { loadAllExamResultSummaries } from '../services/examResults';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { normalizeSubject, normalizeLevel, normalizeExamTitle, subjectDisplayName } from '../utils/examUtils';
import type { ExamsParamList } from '../navigation/ExamsNavigator';
import { examStackRoot } from '../navigation/navHelpers';
import { tapLight } from '../utils/haptics';

type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamHistory'>;

const GUTTER = 20;

// Catalog levels → the route slugs the rest of the Exams stack uses
// (same map as ExamLandingScreen's EXAM_LEVEL_TO_ID).
const RAW_LEVEL_TO_SLUG: Record<string, string> = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
};

interface HistoryRow {
  examId: string;
  title: string;
  meta: string;
  levelSlug: string;
  percentage: number | null;
  submittedAtMs: number | null;
}

export default function ExamHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { user, language, toggleAuthModal } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors, cardSurface, isDark } = useTheme();

  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user?.uid) { setRows([]); return; }
      (async () => {
        try {
          const [summaries, idx] = await Promise.all([
            loadAllExamResultSummaries(user.uid),
            fetchCatalogIndex().catch(() => []),
          ]);
          if (!active) return;
          const byId = new Map((idx || []).map((e: any) => [String(e?.exam_id), e]));
          const list: HistoryRow[] = Object.entries(summaries || {}).map(([examId, s]: [string, any]) => {
            const entry = byId.get(examId);
            const subject = entry?.subject ? normalizeSubject(entry.subject) : '';
            const lvl = entry?.level ? normalizeLevel(entry.level) : '';
            return {
              examId,
              // Raw catalog titles are the ministry's PDF header: compose a readable one.
              title: (entry ? normalizeExamTitle(entry) : '') || subjectDisplayName(subject) || t('Examen', 'Egzamen'),
              meta: [lvl, entry?.year].filter(Boolean).join(' · '),
              levelSlug: RAW_LEVEL_TO_SLUG[entry?.level ?? ''] || 'terminale',
              percentage: typeof s?.percentage === 'number' ? s.percentage : null,
              submittedAtMs: s?.submittedAtMs ?? null,
            };
          });
          list.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));
          setRows(list);
          setError(false);
        } catch {
          if (active) setError(true);
        }
      })();
      return () => { active = false; };
    }, [user?.uid, retryCount]),
  );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12 }}>
      <TouchableOpacity
        onPress={() => { tapLight(); navigation.goBack(); }}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('Retour', 'Retounen')}
      >
        <ChevronLeft color={colors.ink} size={26} />
      </TouchableOpacity>
      <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
        {t('Mes résultats', 'Rezilta mwen yo')}
      </Text>
    </View>
  );

  const body = () => {
    if (!user?.uid) {
      return (
        <EmptyState
          icon={<BarChart3 color={colors.azure} size={34} strokeWidth={1.75} />}
          title={t('Connectez-vous pour voir vos résultats', 'Konekte pou wè rezilta ou yo')}
          description={t('Vos scores d’examens sont enregistrés sur votre compte.', 'Nòt egzamen ou yo anrejistre sou kont ou.')}
          ctaLabel={t('Se connecter', 'Konekte')}
          onCta={() => toggleAuthModal()}
        />
      );
    }
    if (error) {
      return (
        <ErrorState
          title={t('Impossible de charger vos résultats.', 'Nou pa ka chaje rezilta ou yo.')}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      );
    }
    if (rows === null) return <ListSkeleton rows={6} />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<BarChart3 color={colors.azure} size={34} strokeWidth={1.75} />}
          title={t('Aucun examen terminé pour l’instant', 'Ou poko fini okenn egzamen')}
          description={t('Passez un examen blanc. Votre score apparaîtra ici.', 'Fè yon egzamen blan. Nòt ou ap parèt la.')}
          ctaLabel={t('Voir les examens', 'Gade egzamen yo')}
          onCta={() => navigation.navigate(examStackRoot(navigation) as 'ExamLanding')}
        />
      );
    }
    return (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.examId}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 110, gap: 12 }}
        renderItem={({ item }) => {
          const pct = item.percentage == null ? null : Math.round(item.percentage);
          const tone = pct == null ? { bg: colors.surfaceAlt, fg: colors.muted }
            : pct >= 60 ? { bg: colors.successSoft, fg: isDark ? colors.success : colors.successFill }
            : pct >= 40 ? { bg: colors.warnSoft, fg: isDark ? colors.warn : '#9A5B00' }
            : { bg: colors.dangerSoft, fg: colors.danger };
          const when = item.submittedAtMs
            ? new Date(item.submittedAtMs).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
          return (
            <TouchableOpacity
              onPress={() => {
                tapLight();
                navigation.navigate('ExamResults', { level: item.levelSlug, examId: item.examId });
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={[item.title, pct != null ? `${pct}%` : '', when].filter(Boolean).join(', ')}
              style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84 }}
            >
              {/* The score leads the row — the number is the reason to come back. */}
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.heading, fontSize: pct != null && pct >= 100 ? 15 : 17, lineHeight: 21, color: tone.fg, fontVariant: ['tabular-nums'] }}>
                  {pct != null ? `${pct}%` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }} numberOfLines={1}>{item.title}</Text>
                <Text style={[typeScale.meta, { color: colors.muted }]} numberOfLines={1}>
                  {[item.meta, when].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.faint} />
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      {body()}
    </SafeAreaView>
  );
}
