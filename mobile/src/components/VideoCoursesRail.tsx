import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Image } from 'react-native';
import { Play, ChevronRight } from 'lucide-react-native';
import PressableScale from './ui/PressableScale';
import useStore from '../contexts/store';
import { useTheme, courseTint, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';
import { courseVideoThumbs } from '../utils/videoThumb';
import { courseSubjectIcon } from '../utils/subjectMeta';

const CARD_W = 200;
const THUMB_H = 112;

function VideoCourseCard({ course, onPress }: { course: any; onPress: () => void }) {
  const { colors, cardSurface } = useTheme();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const tint = courseTint(course.color);
  const SubjectIcon = courseSubjectIcon(course);
  // Ordered candidates, sharpest first (hq720 → mqdefault). This card is the one
  // place the resolution matters: 200×112pt is ~600×336px at 3x, where a 320px
  // still would visibly soften handwritten whiteboard text. hq720 isn't served
  // for every upload, so we walk down the list on error and only fall through to
  // the subject icon once nothing is left.
  const thumbs = courseVideoThumbs(course);
  const [attempt, setAttempt] = useState(0);
  const thumb = thumbs[attempt];

  return (
    <PressableScale
      onPress={() => { tapLight(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${course.name}, ${t('cours en vidéo', 'kou an videyo')}`}
      style={{ ...cardSurface, width: CARD_W, padding: 0, overflow: 'hidden' }}
    >
      {/* Video still with a play chip — the "this is video" signal. */}
      <View style={{ width: '100%', height: THUMB_H, backgroundColor: tint + '22' }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            resizeMode="cover"
            // Step to the next candidate; once the list runs out `thumb` is
            // undefined and the subject icon below takes over.
            onError={() => setAttempt((a) => a + 1)}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <SubjectIcon color={tint} size={30} />
          </View>
        )}
        <View
          style={{
            position: 'absolute', left: 8, bottom: 8,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(15,23,42,0.72)', borderRadius: 999,
            paddingHorizontal: 8, paddingVertical: 4,
          }}
        >
          <Play color="#fff" size={10} fill="#fff" />
          <Text style={[typeScale.micro, { color: '#fff' }]} maxFontSizeMultiplier={1.2}>
            {course.videoCount > 0
              ? `${course.videoCount} ${t('leçons', 'leson')}`
              : t('Vidéo', 'Videyo')}
          </Text>
        </View>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={2}>
          {course.name}
        </Text>
        {course.description ? (
          <Text style={[typeScale.caption, { color: colors.faint, marginTop: 2 }]} numberOfLines={1}>
            {course.description}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * Horizontal video-course discovery rail for the Home screen. Courses are the
 * platform's deepest content but nothing on the old Home said "there are video
 * lessons here" — plain text rows don't read as video. Real video stills with
 * a play chip do. Shows non-enrolled, available courses; hides itself when
 * there's nothing to discover.
 */
export default function VideoCoursesRail({
  courses,
  enrolledIds,
  onOpenCourse,
  onSeeAll,
  title,
  max = 8,
}: {
  courses: any[] | undefined;
  enrolledIds: string[];
  onOpenCourse: (course: any) => void;
  onSeeAll: () => void;
  title: string;
  max?: number;
}) {
  const { colors } = useTheme();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const discover = useMemo(() => {
    const enrolled = new Set(enrolledIds);
    return (courses ?? [])
      .filter((c: any) => !c.comingSoon && !enrolled.has(c.id))
      .slice(0, max);
  }, [courses, enrolledIds, max]);

  if (discover.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
        <Text style={[typeScale.title, { color: colors.ink }]}>{title}</Text>
        <PressableScale
          onPress={() => { tapLight(); onSeeAll(); }}
          accessibilityRole="button"
          accessibilityLabel={t('Voir tous les cours', 'Wè tout kou yo')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{t('Voir tout', 'Wè tout')}</Text>
          <ChevronRight color={colors.azure} size={14} />
        </PressableScale>
      </View>
      <FlatList
        horizontal
        data={discover}
        keyExtractor={(c: any) => c.id}
        renderItem={({ item }) => <VideoCourseCard course={item} onPress={() => onOpenCourse(item)} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        // Card + gap so momentum scrolling settles on card boundaries.
        snapToInterval={CARD_W + 12}
        decelerationRate="fast"
      />
    </View>
  );
}
