/**
 * SearchScreen — global search (Dashboard header icon), mobile mirror of the
 * web's SearchOverlay. Layout from Stitch 12b.
 *
 * Keystrokes stay LOCAL over the session index (courses, lessons, exams,
 * games, quick actions) — instant and free on slow networks. Ranking is
 * services/searchIndex's (rankResults), untouched here: this screen only
 * presents its groups. The AI layer is the pinned "Demander à Sandra" row,
 * which hands the raw query to the Sandra chat on an explicit tap.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Keyboard,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BookOpen, PlayCircle, ClipboardList, Gamepad2, Sparkles, MessageCircle, ChevronRight, AlertCircle, Play,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, touch } from '../theme/theme';
import { EXAM_LEVEL_SLUG } from '../../../shared/studyPlanTasks';
import {
  getSearchIndex, rankResults, rowContext, typeTag, indexHealth, suggestFor, itemKey,
  type SearchItem, type SearchItemType, type RankedRow,
} from '../services/searchIndex';
import { getCachedCourses } from '../services/dataService';
import SearchField from '../components/ui/SearchField';
import PressableScale from '../components/ui/PressableScale';
import Button from '../components/ui/Button';
import { ListSkeleton } from '../components/StateViews';
import VideoCover from '../components/ui/VideoCover';
import SandraFace from '../components/sandra/SandraFace';
import { useThumbCandidates } from '../hooks/useCourseThumb';
import { lessonVideoThumbs, courseVideoThumbs } from '../utils/videoThumb';
import { courseCover } from '../utils/courseCovers';
import { displayCourseName, displayLevel } from '../utils/courseName';
import { SUBJECT_META, courseSubjectCode } from '../utils/subjectMeta';

const GUTTER = 20;

const TYPE_ICONS: Record<SearchItemType, any> = {
  course: BookOpen,
  lesson: PlayCircle,
  exam: ClipboardList,
  game: Gamepad2,
  action: Sparkles,
};

type Filter = 'all' | 'course' | 'lesson' | 'exam' | 'game';

type Row =
  | { kind: 'header'; key: string; label: string; count?: number }
  | { kind: 'feature'; key: string; item: RankedRow }
  | { kind: 'item'; key: string; item: RankedRow };

type IndexStatus = 'loading' | 'ready' | 'failed';

/** Per-lesson media, read from the cached catalogue (presentation only). */
type Media = { thumbs: string[]; duration: number | null; level: string | null };

/** A 96×72 lesson still that walks its candidates on load failure. */
function Thumb({ uris }: { uris: string[] }) {
  const { colors } = useTheme();
  const { uri, onError } = useThumbCandidates(uris);
  return (
    <View style={{ width: 96, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} onError={onError} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <PlayCircle color={colors.faint} size={24} />}
    </View>
  );
}

export default function SearchScreen({ onClose, navigation }: { onClose?: () => void; navigation: any }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors, typeScale, fonts, cardSurface, featureSurface, elevation, isDark, radius } = useTheme();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<IndexStatus>('loading');
  const [round, setRound] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [media, setMedia] = useState<Map<string, Media>>(new Map());
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

  // Real stills for course + lesson rows, from the same cached catalogue the
  // index is built from. Missing data just means no image — never a stock one.
  useEffect(() => {
    let alive = true;
    getCachedCourses()
      .then((cached) => {
        if (!alive || !cached?.data) return;
        const m = new Map<string, Media>();
        for (const c of cached.data) {
          if (!c?.id) continue;
          const level = c.level ? String(c.level) : null;
          m.set(`course:${c.id}`, { thumbs: courseVideoThumbs(c), duration: null, level });
          const cover = courseCover(c.id);
          for (const mod of c.modules || []) {
            for (const l of mod.lessons || []) {
              const lid = l?.id || l?.lessonId;
              if (!lid) continue;
              m.set(`lesson:${c.id}:${lid}`, {
                thumbs: lessonVideoThumbs(l.videoUrl, cover),
                duration: typeof l.duration === 'number' && l.duration > 0 ? l.duration : null,
                level,
              });
            }
          }
        }
        setMedia(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [round]);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(focusTimer);
  }, []);

  const retry = useCallback(() => setRound((r) => r + 1), []);
  const examsMissing = status === 'ready' && indexHealth(index).missingExams;

  const groupLabel = (key: 'best' | SearchItemType): string => ({
    best: t('Meilleur résultat', 'Pi bon rezilta'),
    action: t('Actions', 'Aksyon'),
    course: t('Cours', 'Kou'),
    lesson: t('Leçons', 'Leson'),
    exam: t('Examens', 'Egzamen'),
    game: t('Jeux', 'Jwèt'),
  })[key];

  const mediaFor = (item: SearchItem): Media | undefined => {
    const n = item.nav;
    if (n.kind === 'lesson') return media.get(`lesson:${n.courseId}:${n.lessonId}`);
    if (n.kind === 'course') return media.get(`course:${n.courseId}`);
    return undefined;
  };

  const ranked = useMemo(() => (query.trim() ? rankResults(index, query) : []), [index, query]);

  const presentTypes = useMemo(() => {
    const s = new Set<SearchItemType>();
    ranked.forEach((g) => g.rows.forEach((r) => s.add(r.type)));
    return s;
  }, [ranked]);

  // The filter only narrows what is SHOWN; the ranking itself is untouched.
  // A filter whose type vanished with the new query falls back to "Tout".
  const activeFilter: Filter = filter !== 'all' && !presentTypes.has(filter) ? 'all' : filter;
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const keep = (r: RankedRow) => activeFilter === 'all' || r.type === activeFilter;
    for (const g of ranked) {
      const shown = g.rows.filter(keep);
      if (!shown.length) continue;
      if (g.key === 'best') {
        // The top hit leads as a feature card; the rest of "best" follow as rows.
        out.push({ kind: 'header', key: 'h-best', label: groupLabel('best') });
        const [top, ...more] = shown;
        const visual = top.type === 'lesson' || top.type === 'course';
        out.push(visual ? { kind: 'feature', key: `f-${top.key}`, item: top } : { kind: 'item', key: `b-${top.key}`, item: top });
        more.forEach((item) => out.push({ kind: 'item', key: `b-${item.key}`, item }));
      } else {
        out.push({ kind: 'header', key: `h-${g.key}`, label: groupLabel(g.key), count: shown.length });
        shown.forEach((item) => out.push({ kind: 'item', key: `${g.key}-${item.key}`, item }));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, activeFilter, isCreole]);

  const noResultSuggestions = useMemo(
    () => (query.trim() && ranked.length === 0 && status === 'ready' ? suggestFor(index, query) : []),
    [ranked.length, query, index, status],
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
          params: { screen: 'CourseDetail', params: { courseId: nav.courseId, courseName: nav.courseName }, initial: false },
        });
        break;
      case 'lesson':
        navigation.navigate('Main', {
          screen: 'Courses',
          params: {
            screen: 'CourseDetail',
            params: { courseId: nav.courseId, courseName: nav.courseName, lessonId: nav.lessonId },
            initial: false,
          },
        });
        break;
      case 'exam': {
        // Every grade's "Exams" tab is ExamsNavigator, so the result opens
        // THAT paper with the exam landing underneath. The index
        // stores the raw catalog level; the stacks route on slugs.
        const slug = EXAM_LEVEL_SLUG[nav.level] || nav.level;
        navigation.navigate('Main', {
          screen: 'Exams',
          params: { screen: 'ExamOverview', params: { level: slug, examId: nav.examId }, initial: false },
        });
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

  const metaFor = (item: SearchItem): string => {
    const context = displayCourseName(rowContext(item, isCreole));
    const d = mediaFor(item)?.duration;
    return [context, d ? `${d} min` : null].filter(Boolean).join(' · ');
  };

  // ── rows ─────────────────────────────────────────────────────────────────

  const featureCard = (item: RankedRow) => {
    const m = mediaFor(item);
    const isLesson = item.type === 'lesson';
    return (
      <PressableScale
        onPress={() => go(item)}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={`${typeTag(item.type, isCreole)} : ${displayCourseName(item.title)}, ${metaFor(item)}`}
        style={[featureSurface, { padding: 16, marginBottom: 8 }]}
      >
        <VideoCover
          uris={m?.thumbs ?? []}
          levelLabel={m?.level ? displayLevel(m.level) : null}
          radiusTop={18}
          radiusBottom={18}
        />
        <Text numberOfLines={2} style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: colors.ink, marginTop: 14 }}>
          {displayCourseName(item.title)}
        </Text>
        {metaFor(item) ? (
          <Text numberOfLines={2} style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]}>{metaFor(item)}</Text>
        ) : null}
        <Button
          variant="secondary"
          fullWidth
          label={isLesson ? t('Regarder', 'Gade') : t('Ouvrir le cours', 'Louvri kou a')}
          icon={isLesson ? <Play color={isDark ? colors.ink : colors.azureInk} size={18} strokeWidth={2.4} /> : null}
          onPress={() => go(item)}
          style={{ marginTop: 14 }}
        />
      </PressableScale>
    );
  };

  const resultRow = (item: SearchItem, key?: string) => {
    // Courses and exams carry their subject in the title ("Chimie NS1",
    // "Physique · NS IV 2024"): show that subject's glyph, not one generic
    // book/clipboard for every row. The type glyph stays the fallback.
    const subjectCode = item.type === 'course' || item.type === 'exam' ? courseSubjectCode({ name: item.title }) : null;
    const Icon = subjectCode ? SUBJECT_META[subjectCode].Icon : TYPE_ICONS[item.type];
    const m = mediaFor(item);
    const meta = metaFor(item);
    const tag = typeTag(item.type, isCreole);
    const visual = (item.type === 'lesson' || item.type === 'course') && !!m?.thumbs.length;
    return (
      <PressableScale
        key={key}
        onPress={() => go(item)}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={`${tag} : ${displayCourseName(item.title)}${meta ? `, ${meta}` : ''}`}
        style={[cardSurface, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, paddingRight: 14, marginBottom: 12, minHeight: 72 }]}
      >
        {visual ? (
          <Thumb uris={m!.thumbs} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
            <Icon size={24} color={isDark ? colors.ink : colors.azureInk} strokeWidth={2} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }} numberOfLines={2}>
            {displayCourseName(item.title)}
          </Text>
          {meta ? (
            <Text style={[typeScale.meta, { color: colors.muted, marginTop: 2 }]} numberOfLines={2}>{meta}</Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.faint} strokeWidth={2.2} />
      </PressableScale>
    );
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'header') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, letterSpacing: -0.4, color: colors.ink }}>
            {row.label}
          </Text>
          {row.count ? (
            <Text style={[typeScale.caption, { color: colors.muted }]}>
              {row.count} {row.count > 1 ? t('résultats', 'rezilta') : t('résultat', 'rezilta')}
            </Text>
          ) : null}
        </View>
      );
    }
    if (row.kind === 'feature') return featureCard(row.item);
    return resultRow(row.item);
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('Tout', 'Tout') },
    { key: 'lesson', label: t('Leçons', 'Leson') },
    { key: 'course', label: t('Cours', 'Kou') },
    { key: 'exam', label: t('Examens', 'Egzamen') },
    { key: 'game', label: t('Jeux', 'Jwèt') },
  ];
  const visibleFilters = filters.filter((f) => f.key === 'all' || presentTypes.has(f.key as SearchItemType));

  const pill = (active: boolean) => [
    {
      minHeight: touch.min, paddingHorizontal: 18, borderRadius: radius.pill, justifyContent: 'center' as const,
      backgroundColor: active ? colors.azureFill : isDark ? colors.surfaceAlt : colors.surface,
    },
    active || isDark ? null : elevation.thumb,
  ];

  const suggestions = [
    { label: t('Créer mon plan d’étude', 'Kreye plan etid mwen'), run: () => go({ type: 'action', title: '', nav: { kind: 'studyPlan' } }) },
    { label: t('Examens du Bac', 'Egzamen Bak'), run: () => go({ type: 'action', title: '', nav: { kind: 'exams' } }) },
    { label: t('Jeux', 'Jwèt'), run: () => go({ type: 'action', title: '', nav: { kind: 'games' } }) },
  ];

  const hasQuery = !!query.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Search bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 12 }}>
        <SearchField
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder={t('Cours, leçons, examens, jeux…', 'Kou, leson, egzamen, jwèt…')}
          clearLabel={t('Effacer', 'Efase')}
          autoCapitalize="none"
          onSubmitEditing={askSandra}
          style={{ flex: 1, borderWidth: 0, ...(isDark ? {} : elevation.thumb) }}
        />
        {onClose ? (
          <PressableScale
            onPress={onClose}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel={t('Annuler', 'Anile')}
            style={{ minHeight: touch.min, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.azureInk }}>{t('Annuler', 'Anile')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {hasQuery && ranked.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 10, paddingHorizontal: GUTTER, paddingBottom: 6, paddingTop: 2 }}
          >
            {visibleFilters.map((f) => {
              const active = activeFilter === f.key;
              return (
                <PressableScale
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  pressedScale={0.97}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={f.label}
                  style={pill(active)}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: active ? '#ffffff' : colors.ink }}>{f.label}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!hasQuery ? (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 12 }}>
          <Text accessibilityRole="header" style={[typeScale.meta, { color: colors.muted, marginBottom: 12 }]}>
            {t('Suggestions', 'Sijesyon')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {suggestions.map((s) => (
              <PressableScale key={s.label} onPress={s.run} pressedScale={0.97} accessibilityRole="button" accessibilityLabel={s.label} style={pill(false)}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.ink }}>{s.label}</Text>
              </PressableScale>
            ))}
          </View>
          <View style={[cardSurface, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginTop: 24 }]}>
            <SandraFace size={44} />
            <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>
              {t(
                'Astuce : tape une question et envoie-la à Sandra. Elle peut aussi créer ton plan d’étude.',
                'Ti konsèy : ekri yon kesyon epi voye l bay Sandra. Li ka kreye plan etid ou tou.',
              )}
            </Text>
          </View>
        </View>
      ) : status === 'loading' && index.length === 0 ? (
        // Result-row skeleton (tile + two lines), not a lone spinner, so the
        // list doesn't jump when the index is ready.
        <ListSkeleton rows={4} showHeader={false} label={t('Préparation de la recherche…', 'N ap prepare rechèch la…')} />
      ) : status === 'failed' ? (
        <View accessibilityRole="alert" style={{ paddingHorizontal: GUTTER, paddingTop: 16 }}>
          <View style={[cardSurface, { padding: 18, gap: 14 }]}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={20} color={colors.warnInk} style={{ marginTop: 1 }} />
              <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>
                {t('Les cours n’ont pas pu être chargés, la recherche est incomplète. Vérifie ta connexion.',
                  'Kou yo pa t ka chaje, rechèch la pa konplè. Verifye koneksyon ou.')}
              </Text>
            </View>
            <Button size="sm" variant="secondary" label={t('Réessayer', 'Eseye ankò')} onPress={retry} style={{ alignSelf: 'flex-start' }} />
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 140 }}
          ListHeaderComponent={examsMissing ? (
            <PressableScale onPress={retry} haptic={false} accessibilityRole="button" style={{ paddingTop: 8, minHeight: touch.min, justifyContent: 'center' }}>
              <Text style={[typeScale.meta, { color: colors.muted }]}>
                {t('Examens indisponibles pour l’instant. Touche pour réessayer.', 'Egzamen yo pa disponib pou kounye a. Touche pou eseye ankò.')}
              </Text>
            </PressableScale>
          ) : null}
          ListEmptyComponent={
            <View style={{ marginTop: 16, gap: 8 }} accessibilityLiveRegion="polite">
              <Text style={[typeScale.body, { color: colors.ink }]}>
                {t('Aucun résultat pour', 'Pa gen rezilta pou')} « {query.trim()} »
              </Text>
              {noResultSuggestions.length > 0 ? (
                <>
                  <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.ink, marginTop: 14, marginBottom: 6 }}>
                    {t('Peut-être', 'Petèt')}
                  </Text>
                  {noResultSuggestions.map((it) => resultRow(it, itemKey(it)))}
                </>
              ) : null}
            </View>
          }
        />
      )}

      {/* Pinned AI handoff — Sandra. */}
      {hasQuery ? (
        <View style={{ position: 'absolute', left: GUTTER, right: GUTTER, bottom: 24 }}>
          <PressableScale
            onPress={askSandra}
            pressedScale={0.985}
            accessibilityRole="button"
            accessibilityLabel={`${t('Demander à Sandra', 'Mande Sandra')} : ${query.trim()}`}
            style={[cardSurface, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...(isDark ? {} : { shadowOpacity: 0.16 }) }]}
          >
            <SandraFace size={48} online />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>{t('Demander à Sandra', 'Mande Sandra')}</Text>
              <Text style={[typeScale.meta, { color: colors.muted }]} numberOfLines={1}>« {query.trim()} »</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.azureSoft, borderRadius: radius.control, paddingHorizontal: 14, minHeight: 40 }}>
              <MessageCircle size={18} color={isDark ? colors.ink : colors.azureInk} strokeWidth={2.2} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: isDark ? colors.ink : colors.azureInk }}>{t('Discuter', 'Diskite')}</Text>
            </View>
          </PressableScale>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
