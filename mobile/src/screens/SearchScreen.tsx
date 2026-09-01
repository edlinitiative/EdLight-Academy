/**
 * SearchScreen — global search (Dashboard header icon), mobile mirror of the
 * web's SearchOverlay.
 *
 * Keystrokes stay LOCAL over the session index (courses, lessons, exams,
 * games, quick actions) — instant and free on slow networks. The AI layer is
 * the pinned "Mande Sandra" row, which hands the raw query to the Sandra
 * chat (RAG + study-plan tools) on an explicit tap.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X, Search, BookOpen, PlayCircle, ClipboardList, Gamepad2, Sparkles, MessageCircle, ChevronRight,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, radius, typeScale } from '../theme/theme';
import { gradeProfile } from '../config/trackConfig';
import {
  getSearchIndex, searchItems, type SearchItem, type SearchResult, type SearchItemType,
} from '../services/searchIndex';

const GUTTER = 20;

const TYPE_ICONS: Record<SearchItemType, any> = {
  course: BookOpen,
  lesson: PlayCircle,
  exam: ClipboardList,
  game: Gamepad2,
  action: Sparkles,
};

const GROUP_ORDER: SearchItemType[] = ['action', 'course', 'lesson', 'exam', 'game'];
const GROUP_LIMIT: Record<SearchItemType, number> = {
  action: 3, course: 4, lesson: 4, exam: 5, game: 3,
};

type Row =
  | { kind: 'eyebrow'; key: string; label: string }
  | { kind: 'item'; key: string; item: SearchResult };

export default function SearchScreen({ onClose, navigation }: { onClose?: () => void; navigation: any }) {
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchItem[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let alive = true;
    getSearchIndex(isCreole ? 'ht' : 'fr').then((items) => {
      if (alive) setIndex(items);
    });
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => { alive = false; clearTimeout(focusTimer); };
  }, [isCreole]);

  const groupLabel = (type: SearchItemType): string => ({
    action: t('Actions', 'Aksyon'),
    course: t('Cours', 'Kou'),
    lesson: t('Leçons', 'Leson'),
    exam: t('Examens', 'Egzamen'),
    game: t('Jeux', 'Jwèt'),
  })[type];

  const rows = useMemo<Row[]>(() => {
    if (!query.trim()) return [];
    const ranked = searchItems(index, query, 60);
    const grouped = new Map<SearchItemType, SearchResult[]>();
    for (const r of ranked) {
      const bucket = grouped.get(r.type) || [];
      if (bucket.length < GROUP_LIMIT[r.type]) bucket.push(r);
      grouped.set(r.type, bucket);
    }
    const out: Row[] = [];
    for (const type of GROUP_ORDER) {
      const bucket = grouped.get(type);
      if (!bucket?.length) continue;
      out.push({ kind: 'eyebrow', key: `eyebrow-${type}`, label: groupLabel(type) });
      bucket.forEach((item, i) => out.push({ kind: 'item', key: `${type}-${i}`, item }));
    }
    return out;
  }, [index, query, isCreole]);

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
        <Text style={[typeScale.overline, { color: colors.faint, marginTop: 16, marginBottom: 6 }]}>
          {row.label.toUpperCase()}
        </Text>
      );
    }
    const Icon = TYPE_ICONS[row.item.type];
    return (
      <TouchableOpacity
        onPress={() => go(row.item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
          <Icon size={16} color={colors.azure} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typeScale.body, { color: colors.ink, fontWeight: '600' }]} numberOfLines={1}>
            {row.item.title}
          </Text>
          {!!row.item.subtitle && (
            <Text style={[typeScale.micro, { color: colors.muted }]} numberOfLines={1}>
              {row.item.subtitle}
            </Text>
          )}
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
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('Effacer', 'Efase')}>
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
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                  borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <MessageCircle size={14} color={colors.muted} />
            <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>
              {t(
                'Astuce : tapez une question et envoyez-la à Sandra — elle peut aussi créer votre plan d’étude.',
                'Ti konsèy : ekri yon kesyon epi voye l bay Sandra — li ka kreye plan etid ou tou.',
              )}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 90 }}
          ListEmptyComponent={
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 16 }]}>
              {t('Aucun résultat local pour', 'Pa gen rezilta lokal pou')} « {query.trim()} »
            </Text>
          }
        />
      )}

      {/* Pinned AI handoff — Sandra */}
      {!!query.trim() && (
        <TouchableOpacity
          onPress={askSandra}
          activeOpacity={0.85}
          accessibilityRole="button"
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
