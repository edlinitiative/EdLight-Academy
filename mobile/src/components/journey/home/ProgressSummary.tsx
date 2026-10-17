import React from 'react';
import { View, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import PressableScale from '../../ui/PressableScale';
import { useTheme, typeScale } from '../../../theme/theme';
import { EVIDENCE, evidenceLabel, trackJourney } from '../../../utils/learningJourney';
import { tapLight } from '../../../utils/haptics';
import type { EvidenceSummary } from './homeJourney';

/**
 * Evidence-based progress (PRD LJ-10): per course, three independent facts
 * over the course's real lesson count — terminées, pratiquées, maîtrisées —
 * in the shared EVIDENCE words. No blended percentage, no global score.
 * Renders nothing until there is evidence (no wall of zeros).
 */
export default function ProgressSummary({
  rows, isCreole, onOpenCourse,
}: {
  rows: { course: any; summary: EvidenceSummary }[];
  isCreole: boolean;
  onOpenCourse: (course: any) => void;
}) {
  const { colors, cardSurface } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  if (rows.length === 0) return null;

  return (
    <View>
      <Text style={[typeScale.title, { color: colors.ink, marginBottom: 4 }]}>
        {t('Ta progression', 'Pwogrè ou')}
      </Text>
      <Text style={[typeScale.body, { color: colors.muted, marginBottom: 10 }]}>
        {t(
          `${EVIDENCE.completed.fr} : vidéo finie · ${EVIDENCE.practised.fr} : exercices faits · ${EVIDENCE.mastered.fr} : confirmée au test du chapitre.`,
          `${EVIDENCE.completed.ht} : videyo fini · ${EVIDENCE.practised.ht} : egzèsis fèt · ${EVIDENCE.mastered.ht} : konfime nan tès chapit la.`,
        )}
      </Text>
      <View style={{ ...cardSurface, paddingHorizontal: 14 }}>
        {rows.map(({ course, summary }, i) => {
          const facts = [
            { key: 'completed' as const, n: summary.completed },
            { key: 'practised' as const, n: summary.practised },
            { key: 'mastered' as const, n: summary.mastered },
          ];
          const a11y = `${course.name}. ${facts.map((f) => `${f.n} ${t('sur', 'sou')} ${summary.total} ${evidenceLabel(f.key, isCreole)}`).join(', ')}`;
          return (
            <PressableScale
              key={course.id}
              onPress={() => {
                tapLight();
                trackJourney('progress_summary_opened', { course_id: course.id, surface: 'home' });
                onOpenCourse(course);
              }}
              accessibilityRole="button"
              accessibilityLabel={a11y}
              style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={1}>{course.name}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 4 }}>
                    {facts.map((f) => (
                      <Text key={f.key} style={[typeScale.body, { color: f.n > 0 ? colors.ink : colors.faint }]}>
                        <Text style={{ fontFamily: typeScale.title.fontFamily }}>{f.n}</Text>
                        <Text style={{ color: colors.muted }}>/{summary.total} </Text>
                        {evidenceLabel(f.key, isCreole).toLowerCase()}
                      </Text>
                    ))}
                  </View>
                </View>
                <ChevronRight color={colors.faint} size={16} />
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
