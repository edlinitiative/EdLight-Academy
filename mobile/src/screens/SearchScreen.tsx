/**
 * SearchScreen — global search (Dashboard header icon), mobile mirror of the
 * web's SearchOverlay.
 *
 * Keystrokes stay LOCAL over the session index (courses, lessons, exams,
 * games, quick actions) — instant and free on slow networks. The AI layer is
 * the pinned "Mande Sandra" row, which hands the raw query to the Sandra
 * chat (RAG + study-plan tools) on an explicit tap.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X, Search, BookOpen, PlayCircle, ClipboardList, Gamepad2, Sparkles, MessageCircle, ChevronRight, AlertCircle,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, radius, typeScale } from '../theme/theme';
import { gradeProfile } from '../config/trackConfig';
import {
  getSearchIndex, rankResults, rowContext, typeTag, indexHealth, suggestFor, itemKey,
  type SearchItem, type SearchItemType, type RankedRow,
} from '../services/searchIndex';

const GUTTER = 20;

const TYPE_ICONS: Record<SearchItemType, any> = {
  course: BookOpen,
  lesson: PlayCircle,
  exam: ClipboardList,
  game: Gamepad2,
  action: Sparkles,
};

type Row =
  | { kind: 'eyebrow'; key: string; label: string }
  | { kind: 'item'; key: string; item: RankedRow; best: boolean };

type IndexStatus = 'loading' | 'ready' | 'failed';

export default function SearchScreen({ onClose, navigation }: { onClose?: () => void; navigation: any }) {
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<IndexStatus>('loading');
  const [round, setRound] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getSearchIndex(isCreole ? 'ht' : 'fr', { force: round > 0 })
      .then((items) => {
        if (!alive) return;
        setIndex(items);
        // Courses are the core of search: without them the index failed.
        setStatus(indexHealth(items).missingCourses ? 'failed' : 'ready');
      })
      .catch(() => { if (alive) setStatus('failed'); });
    return () => { alive = false; };
  }, [isCreole, round]);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(focusTimer);
  }, []);

  const retry = useCallback(() => setRound((r) => r + 1), []);
  const examsMissing = status === 'ready' && indexHealth(index).missingExams;

  const groupLabel = (key: 'best' | SearchItemType): string => ({
    best: t('Meilleurs résultats', 'Pi bon rezilta'),
    action: t('Actions', 'Aksyon'),
    course: t('Cours', 'Kou'),
    lesson: t('Leçons', 'Leson'),
    exam: t('Examens', 'Egzamen'),
    game: t('Jeux', 'Jwèt'),
  })[key];

  const rows = useMemo<Row[]>(() => {
    if (!query.trim()) return [];
    const out: Row[] = [];
    for (const g of rankResults(index, query)) {
      out.push({ kind: 'eyebrow', key: `eyebrow-${g.key}`, label: groupLabel(g.key) });
      g.rows.forEach((item) => out.push({ kind: 'item', key: `${g.key}-${item.key}`, item, best: g.key === 'best' }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, query, isCreole]);

  const noResultSuggestions = useMemo(
    () => (query.trim() && rows.length === 0 && status === 'ready' ? suggestFor(index, query) : []),
    [rows.length, query, index, status],
  );

  /** Close the modal, then run the navigation on the underlying stack. */
  const go = (item: SearchItem) => {
    Keyboard.dismiss();
    onClose?.();
    const nav = item.nav;
    switch (nav.kind) {
      case 'course':
        navigation.navigate('Main', {
          screen: 'Courses',
          params: { screen: 'CourseDetail', params: { courseId: nav.courseId, courseName: nav.courseName } },
        });
        break;
      case 'lesson':
        navigation.navigate('Main', {
          screen: 'Courses',
          params: {
            screen: 'CourseDetail',
            params: { courseId: nav.courseId, courseName: nav.courseName, lessonId: nav.lessonId },
          },
        });
        break;
      case 'exam': {
        // Younger grades' "Exams" tab hosts the QuizNavigator (no exam
        // routes) — send them to the tab root instead of a crashing deep link.
        if (gradeProfile(grade).primaryTab === 'Quiz') {
          navigation.navigate('Main', { screen: 'Exams' });
        } else {
          // The index stores the raw catalog level; the Exams stack routes on
          // slugs — map it so back-navigation lands on a working browser.
          const slug = ({ baccalaureat: 'terminale', universite: 'university', '9eme_af': '9e' } as Record<string, string>)[nav.level] || nav.level;
          navigation.navigate('Main', {
            screen: 'Exams',
            params: { screen: 'ExamOverview', params: { level: slug, examId: nav.examId } },
          });
        }
        break;
      }
      case 'games':
        navigation.navigate('Main', { screen: 'Trivia' });
        break;
      case 'studyPlan':
        navigation.navigate('StudyPlan');
        break;
      case 'leaderboard':
        navigation.navigate('Leaderboard');
        break;
      case 'exams':
        navigation.navigate('Main', { screen: 'Exams' });
        break;
    }
  };

  const askSandra = () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    onClose?.();
    navigation.navigate('Sandra', { ask: q });
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'eyebrow') {
      return (
        <Text accessibilityRole="header" style={[typeScale.overline, { color: colors.muted, marginTop: 16, marginBottom: 6, fontSize: 12 }]}>
          {row.label.toUpperCase()}
        </Text>
      );
    }
    return resultRow(row.item, row.best);
  };

  const resultRow = (item: SearchItem, best: boolean, key?: string) => {
    const Icon = TYPE_ICONS[item.type];
    const context = rowContext(item, isCreole);
    const tag = typeTag(item.type, isCreole);
    return (
      <TouchableOpacity
        key={key}
        onPress={() => go(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${tag} : ${item.title}${context ? `, ${context}` : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 52 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
          <Icon size={17} color={colors.azure} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink, fontSize: 15 }]} numberOfLines={2}>
            {item.title}
          </Text>
          {!!context || best ? (
            <Text style={[typeScale.body, { color: colors.muted }]} numberOfLines={1}>
              {best ? `${tag}${context ? ' · ' : ''}` : ''}{context}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </TouchableOpacity>
    );
  };

  const suggestions = [
    { label: t('Créer mon plan d’étude', 'Kreye plan etid mwen'), run: () => go({ type: 'action', title: '', nav: { kind: 'studyPlan' } }) },
    { label: t('Examens du Bac', 'Egzamen Bak'), run: () => go({ type: 'action', title: '', nav: { kind: 'exams' } }) },
    { label: t('Jeux', 'Jwèt'), run: () => go({ type: 'action', title: '', nav: { kind: 'games' } }) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Search bar header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 10 }}>
        <View
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
          }}
        >
          <Search size={17} color={colors.muted} />
          <TextInput
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, color: colors.ink, padding: 0 }}
            value={query}
            onChangeText={setQuery}
            placeholder={t('Cours, leçons, examens, jeux…', 'Kou, leson, egzamen, jwèt…')}
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={askSandra}
            accessibilityLabel={t('Rechercher', 'Chèche')}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Effacer', 'Efase')}>
              <X size={15} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={{
              width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer', 'Fèmen')}
          >
            <X size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {!query.trim() ? (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 10 }}>
          <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 10 }]}>
            {t('SUGGESTIONS', 'SIJESYON')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s.label}
                onPress={s.run}
                activeOpacity={0.75}
                accessibilityRole="button"
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                  borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
                }}
              >
                <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <MessageCircle size={14} color={colors.muted} />
            <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>
              {t(
                'Astuce : tapez une question et envoyez-la à Sandra. Elle peut aussi créer votre plan d’étude.',
                'Ti konsèy : ekri yon kesyon epi voye l bay Sandra. Li ka kreye plan etid ou tou.',
              )}
            </Text>
          </View>
        </View>
      ) : status === 'loading' && index.length === 0 ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, paddingTop: 20 }}>
          <ActivityIndicator color={colors.muted} />
          <Text style={[typeScale.body, { color: colors.muted }]}>{t('Préparation de la recherche…', 'N ap prepare rechèch la…')}</Text>
        </View>
      ) : status === 'failed' ? (
        <View accessibilityRole="alert" style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={18} color={colors.warn} style={{ marginTop: 1 }} />
            <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>
              {t('Les cours n’ont pas pu être chargés, la recherche est incomplète. Vérifie ta connexion.',
                'Kou yo pa t ka chaje, rechèch la pa konplè. Verifye koneksyon ou.')}
            </Text>
          </View>
          <TouchableOpacity onPress={retry} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }}>
            <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{t('Réessayer', 'Eseye ankò')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 90 }}
          ListHeaderComponent={examsMissing ? (
            <TouchableOpacity onPress={retry} accessibilityRole="button" style={{ paddingTop: 8 }}>
              <Text style={[typeScale.body, { color: colors.muted }]}>
                {t('Examens indisponibles pour l’instant. Toucher pour réessayer.', 'Egzamen yo pa disponib pou kounye a. Touche pou eseye ankò.')}
              </Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={{ marginTop: 16, gap: 8 }} accessibilityLiveRegion="polite">
              <Text style={[typeScale.body, { color: colors.ink }]}>
                {t('Aucun résultat pour', 'Pa gen rezilta pou')} « {query.trim()} »
              </Text>
              {noResultSuggestions.length > 0 ? (
                <>
                  <Text accessibilityRole="header" style={[typeScale.overline, { color: colors.muted, marginTop: 8, fontSize: 12 }]}>
                    {t('PEUT-ÊTRE', 'PETÈT')}
                  </Text>
                  {noResultSuggestions.map((it) => resultRow(it, false, itemKey(it)))}
                </>
              ) : null}
            </View>
          }
        />
      )}

      {/* Pinned AI handoff — Sandra */}
      {!!query.trim() && (
        <TouchableOpacity
          onPress={askSandra}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${t('Demander à Sandra', 'Mande Sandra')} : ${query.trim()}`}
          style={{
            position: 'absolute', left: GUTTER, right: GUTTER, bottom: 24,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            borderRadius: radius.tile, padding: 12,
            shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5C39' }}>
            <MessageCircle size={17} color="#ffffff" />
          </View>
          <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
            {t('Demander à Sandra :', 'Mande Sandra :')} <Text style={{ fontWeight: '800' }}>« {query.trim()} »</Text>
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
