import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2, Circle, ClipboardList, Flag, ChevronRight } from 'lucide-react-native';
import PressableScale from '../../ui/PressableScale';
import { useTheme } from '../../../theme/theme';
import { lessonEvidence } from '../home/homeJourney';
import { evidenceLabel } from '../../../utils/learningJourney';
import { formatMinutes, lessonMinutes, rowState } from '../../courses/courseOutline';
import type { ProgressMap } from '../../../utils/mastery';

/**
 * The lesson rows of one chapter, shared by the course overview ("Plan du
 * cours", expanded chapter) and the lesson page ("Plan du chapitre").
 *
 * DIRECTION §4/§5: no dividers — rows breathe on a 4px gap; the current row is
 * a full-row azureSoft wash (radius 12) with an azure dot, azure title and a
 * white "En cours" pill; done = green check; to do = grey ring (a quiz/exercise
 * keeps its clipboard glyph: on metered data the TYPE and the duration are what
 * a student picks on). State is always said in words too (LJ-04).
 *
 * The chapter test closes the list as a unit-level action, never counted as a
 * lesson (chapter-test-coverage): flag glyph in ink, "Évaluation" tonal pill
 * once it is open, a plain reason when it is not yet.
 */
export default function ChapterOutline({
  lessons, currentId, progress, isCreole, onLessonPress, testReady, onChapterTest, rowHeight = 52,
}: {
  lessons: any[];
  currentId: string | null;
  progress: ProgressMap;
  isCreole: boolean;
  onLessonPress: (lesson: any) => void;
  testReady: boolean;
  onChapterTest: () => void;
  /** 52 on the overview, 56 on the lesson page. */
  rowHeight?: number;
}) {
  const { colors, typeScale, fonts, isDark } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <View style={{ gap: 4 }}>
      {lessons.map((lesson: any) => {
        const state = rowState(lesson.id, currentId, progress);
        const ev = lessonEvidence(lesson.id, progress);
        const current = state === 'current';
        const dur = formatMinutes(lessonMinutes(lesson));
        const words = [
          current ? t('Leçon actuelle', 'Leson kounye a') : null,
          ev ? evidenceLabel(ev, isCreole) : t('À faire', 'Pou fè'),
        ].filter(Boolean).join(', ');
        // A practised/mastered lesson says so under its title; "Terminée" is the check.
        const sub = !current && ev && ev !== 'completed' && ev !== 'opened' ? evidenceLabel(ev, isCreole) : null;
        return (
          <PressableScale
            key={lesson.id}
            onPress={() => onLessonPress(lesson)}
            pressedScale={0.985}
            haptic={false}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            accessibilityLabel={`${lesson.title}. ${words}${dur ? `, ${dur}` : ''}`}
            style={{
              minHeight: rowHeight,
              flexDirection: 'row', alignItems: 'center', gap: 14,
              paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: current ? colors.azureSoft : 'transparent',
            }}
          >
            <View style={{ width: 24, alignItems: 'center' }}>
              {state === 'done' ? (
                <CheckCircle2 color={isDark ? '#0b1220' : '#ffffff'} fill={colors.success} size={22} strokeWidth={2.2} />
              ) : current ? (
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.azure }} />
              ) : lesson.type && lesson.type !== 'video' ? (
                <ClipboardList color={colors.faint} size={20} strokeWidth={1.8} />
              ) : (
                <Circle color={colors.faint} size={22} strokeWidth={1.6} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={2}
                style={[current ? typeScale.titleSm : typeScale.body, { color: current ? colors.azureInk : colors.ink }]}
              >
                {lesson.title}
              </Text>
              {sub ? <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]}>{sub}</Text> : null}
            </View>
            {current ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}>
                <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.azureInk }}>
                  {t('En cours', 'An kou')}
                </Text>
              </View>
            ) : dur ? (
              <Text style={[typeScale.meta, { color: colors.muted }]}>{dur}</Text>
            ) : null}
          </PressableScale>
        );
      })}

      <PressableScale
        onPress={testReady ? onChapterTest : undefined}
        disabled={!testReady}
        // Not yet open is a state, not a broken control: keep its reason legible.
        disabledOpacity={1}
        pressedScale={0.985}
        accessibilityRole="button"
        accessibilityState={{ disabled: !testReady }}
        accessibilityLabel={testReady
          ? `${t('Test du chapitre', 'Tès chapit la')}. ${t('Évaluation', 'Evalyasyon')}`
          : `${t('Test du chapitre', 'Tès chapit la')}. ${t("Fais d'abord les exercices d'une leçon", 'Fè egzèsis yon leson anvan')}`}
        style={{
          minHeight: rowHeight, flexDirection: 'row', alignItems: 'center', gap: 14,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
        }}
      >
        <View style={{ width: 24, alignItems: 'center' }}>
          <Flag color={testReady ? colors.ink : colors.faint} size={20} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typeScale.body, { color: testReady ? colors.ink : colors.muted }]}>
            {t('Test du chapitre', 'Tès chapit la')}
          </Text>
          {!testReady ? (
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]}>
              {t("Fais d'abord les exercices d'une leçon", 'Fè egzèsis yon leson anvan')}
            </Text>
          ) : null}
        </View>
        {testReady ? (
          <>
            <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}>
              <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.azureInk }}>
                {t('Évaluation', 'Evalyasyon')}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={18} />
          </>
        ) : null}
      </PressableScale>
    </View>
  );
}
