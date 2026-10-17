/**
 * The Cours tab's cards (DIRECTION §3, Stitch 03-cours):
 *
 *  - LevelPill        the class filter: 44 tall, solid azure when selected,
 *                     white with elevation otherwise. No outline.
 *  - ChapterCard      one chapter of the selected class's course, in a subject
 *                     shelf: 260 wide, the chapter's own first lesson still,
 *                     an opaque "Chapitre n" pill, chapter-level progress.
 *  - CourseShelfCard  a course of ANOTHER class ("Autres niveaux"): 240 wide,
 *                     the course cover with its level badge.
 *  - CourseResultRow  a search result: still + name + level.
 *  - PracticeTile     the two "S'entraîner" entries, side by side.
 *
 * Opaque cards, no rings, real stills only; zero-progress meters are hidden
 * (a grey 0 bar reads as a failed render — mastery-model).
 */
import React from 'react';
import { View, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import VideoCover from '../ui/VideoCover';
import { useTheme } from '../../theme/theme';
import { useCourseThumb } from '../../hooks/useCourseThumb';
import { courseVideoThumbs } from '../../utils/videoThumb';
import { displayCourseName } from '../../utils/courseName';
import { chapterMeta, type ChapterCard as ChapterFacts } from './courseOutline';

/** Opaque night pill on stills (white 14 = 15.4:1). */
const STILL_PILL = '#12213A';

export const CHAPTER_CARD_WIDTH = 260;
export const COURSE_CARD_WIDTH = 240;

export function LevelPill({ label, active, onPress, accessibilityLabel }: {
  label: string; active: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const { colors, fonts, elevation } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.96}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          minHeight: 44, paddingHorizontal: 18, borderRadius: 999,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? colors.azureFill : colors.surface,
        },
        active ? null : elevation.thumb,
      ]}
    >
      <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: active ? '#ffffff' : colors.ink }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The progress row: "2/5 leçons" in azure, the percent right, a 6px bar. */
function ProgressRow({ done, total, isCreole }: { done: number; total: number; isCreole: boolean }) {
  const { colors, fonts, typeScale } = useTheme();
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>
          {done}/{total} {isCreole ? 'leson' : 'leçons'}
        </Text>
        <Text style={[typeScale.caption, { color: colors.muted }]}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: 6, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(pct, 4)}%`, height: 6, borderRadius: 3, backgroundColor: colors.azure }} />
      </View>
    </View>
  );
}

export function ChapterCard({ card, isCreole, onPress }: { card: ChapterFacts; isCreole: boolean; onPress: () => void }) {
  const { colors, typeScale, cardSurface, fonts } = useTheme();
  const n = card.index + 1;
  const chapter = isCreole ? `Chapit ${n}` : `Chapitre ${n}`;
  const meta = chapterMeta(card, isCreole);
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${chapter}, ${card.title}. ${meta}${card.started ? `. ${card.done}/${card.lessonCount}` : ''}`}
      style={[cardSurface, { width: CHAPTER_CARD_WIDTH }]}
    >
      <VideoCover uris={card.thumbs} play={false}>
        <View style={{ position: 'absolute', left: 10, top: 10, backgroundColor: STILL_PILL, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: '#ffffff' }}>{chapter}</Text>
        </View>
      </VideoCover>
      <View style={{ padding: 16 }}>
        <Text numberOfLines={2} style={[typeScale.cardTitle, { color: colors.ink, fontSize: 18, lineHeight: 23, minHeight: 46 }]}>{card.title}</Text>
        <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]}>{meta}</Text>
        {card.started ? <ProgressRow done={card.done} total={card.lessonCount} isCreole={isCreole} /> : null}
      </View>
    </PressableScale>
  );
}

export function CourseShelfCard({ course, levelLabel, mine, lessons, isCreole, onPress }: {
  course: any; levelLabel: string; mine: boolean; lessons: number; isCreole: boolean; onPress: () => void;
}) {
  const { colors, typeScale, cardSurface, fonts } = useTheme();
  const { uri, onError } = useCourseThumb(course);
  const name = displayCourseName(course.name);
  const meta = mine
    ? (isCreole ? 'Klas mwen' : 'Ma classe')
    : `${lessons} ${isCreole ? 'leson' : 'leçons'}`;
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${levelLabel}, ${meta}`}
      style={[cardSurface, { width: COURSE_CARD_WIDTH }]}
    >
      <VideoCover uri={uri} onError={onError} levelLabel={levelLabel} play={false} />
      <View style={{ padding: 16 }}>
        <Text numberOfLines={2} style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink }}>{name}</Text>
        <Text style={[typeScale.caption, { color: mine ? colors.azureInk : colors.muted, marginTop: 4 }]}>{meta}</Text>
      </View>
    </PressableScale>
  );
}

export function CourseResultRow({ course, levelLabel, lessons, isCreole, onPress }: {
  course: any; levelLabel: string; lessons: number; isCreole: boolean; onPress: () => void;
}) {
  const { colors, typeScale, cardSurface, fonts } = useTheme();
  const name = displayCourseName(course.name);
  const thumbs = React.useMemo(() => courseVideoThumbs(course), [course]);
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${levelLabel}, ${lessons} ${isCreole ? 'leson' : 'leçons'}`}
      style={[cardSurface, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 }]}
    >
      <View style={{ width: 112 }}>
        <VideoCover uris={thumbs} play={false} radiusTop={12} radiusBottom={12} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink }}>{name}</Text>
        <Text style={[typeScale.caption, { color: colors.muted, marginTop: 3 }]}>
          {levelLabel} · {lessons} {isCreole ? 'leson' : 'leçons'}
        </Text>
      </View>
      <ChevronRight color={colors.faint} size={18} />
    </PressableScale>
  );
}

export function PracticeTile({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  const { colors, typeScale, cardSurface } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[cardSurface, { flex: 1, minHeight: 112, padding: 18, justifyContent: 'space-between' }]}
    >
      <Text style={[typeScale.cardTitle, { color: colors.ink, fontSize: 17, lineHeight: 22 }]}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 10 }}>
        <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>{subtitle}</Text>
        <ChevronRight color={colors.azureInk} size={18} />
      </View>
    </PressableScale>
  );
}
