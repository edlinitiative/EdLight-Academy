import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import PressableScale from '../ui/PressableScale';
import VideoCover from '../ui/VideoCover';
import SkeletonCover from '../ui/SkeletonCover';
import { useTheme } from '../../theme/theme';
import { courseVideoThumbs } from '../../utils/videoThumb';
import { displayCourseName } from '../../utils/courseName';
import { evidenceLine } from '../journey/home/homeJourney';
import { railMeta, type RailCourse } from './homeLayout';

const CARD_W = 208;

/**
 * "Mes cours" (Stitch 01 §5): a horizontal rail of course cards, each the
 * course's hand-picked real still (utils/courseCovers) over its name and a
 * real lesson count. Bleeds to the screen edge; the first card aligns with
 * the 20pt gutter.
 */
export default function CourseRail({
  rows, isCreole, onOpenCourse,
}: {
  rows: RailCourse[];
  isCreole: boolean;
  onOpenCourse: (course: any) => void;
}) {
  const { colors, cardSurface, typeScale } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Room for the card shadow, which a horizontal ScrollView would clip.
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 24, gap: 14 }}
      style={{ marginBottom: -20 }}
    >
      {rows.map(({ course, summary }) => {
        const name = displayCourseName(course.name);
        const meta = railMeta(summary, t);
        return (
          <PressableScale
            key={course.id}
            onPress={() => onOpenCourse(course)}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={summary.completed > 0 ? `${name}. ${evidenceLine(summary, isCreole)}` : `${name}${meta ? `. ${meta}` : ''}`}
            style={{ ...cardSurface, width: CARD_W, overflow: 'hidden' }}
          >
            <VideoCover uris={courseVideoThumbs(course)} play={false} />
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
              <Text style={[typeScale.cardTitle, { color: colors.ink, fontSize: 17, lineHeight: 22 }]} numberOfLines={2}>
                {name}
              </Text>
              {meta ? (
                <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]} numberOfLines={1}>{meta}</Text>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** Loading twin: two skeleton cards at rail width. */
export function CourseRailSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 20 }}>
      <SkeletonCover width={CARD_W} />
      <SkeletonCover width={CARD_W} />
    </View>
  );
}
