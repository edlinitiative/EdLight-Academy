import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, typeScale } from '../theme/theme';
import {
  MASTERY_ORDER, masteryColor, masteryLabel, type MasteryLevel,
} from '../utils/mastery';

/**
 * The mastery ladder: four segments, one per earned level.
 *
 * Deliberately NOT a percentage bar. A bar fills as you consume and reads as a
 * loading indicator; four discrete steps read as rungs you climbed. Same pixel
 * budget, completely different message — which was the whole problem with
 * "9% · 3 sur 33 leçons".
 */
export function MasteryMeter({
  level,
  size = 'md',
  accessibilityLabel,
}: {
  level: MasteryLevel;
  size?: 'sm' | 'md';
  /**
   * Only pass this when the meter stands alone. By default it is DECORATIVE:
   * every row that shows one already carries the level in its own label, and an
   * extra "0 of 4" VoiceOver stop per row turns a course list into noise.
   */
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const filled = MASTERY_ORDER.indexOf(level); // none = 0 filled, mastered = 4
  const tint = masteryColor(level, colors);
  const h = size === 'sm' ? 3 : 4;
  const seg = size === 'sm' ? 9 : 14;
  const labelled = !!accessibilityLabel;

  return (
    <View
      style={{ flexDirection: 'row', gap: 3 }}
      accessible={labelled}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={labelled ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={labelled ? { min: 0, max: 4, now: filled } : undefined}
    >
      {[0, 1, 2, 3].map((i) => {
        const on = i < filled;
        return (
          <View
            key={i}
            style={{
              width: seg,
              height: h,
              borderRadius: h,
              // The empty track sat on `border`, which is nearly the page ground
              // — four faint dashes that read as a skeleton loader rather than
              // as rungs left to climb. `surfaceAlt` over a hairline outline
              // gives the track a body of its own.
              backgroundColor: on ? tint : colors.surfaceAlt,
              borderWidth: on ? 0 : StyleSheet.hairlineWidth,
              borderColor: colors.border,
              // Only the top rung glows. A completed ladder should not look like
              // a slightly longer incomplete one.
              ...(on && level === 'mastered'
                ? {
                  shadowColor: tint,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 3,
                }
                : null),
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * Level name + ladder, for a lesson row. `mastered` is the only state that gets
 * a filled chip — the top of the ladder should look different from the rungs,
 * not just further along.
 */
export function MasteryBadge({
  level,
  isCreole,
  showLabel = true,
}: {
  level: MasteryLevel;
  isCreole?: boolean;
  showLabel?: boolean;
}) {
  const colors = useColors();
  const tint = masteryColor(level, colors);

  if (level === 'mastered') {
    return (
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: colors.successSoft, borderRadius: 999,
          paddingHorizontal: 9, paddingVertical: 4,
        }}
      >
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tint }} />
        <Text style={[typeScale.micro, { color: colors.success }]}>
          {masteryLabel(level, isCreole)}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'flex-end', gap: 4 }}>
      {showLabel && (
        <Text style={[typeScale.micro, { color: level === 'none' ? colors.faint : tint }]}>
          {masteryLabel(level, isCreole)}
        </Text>
      )}
      <MasteryMeter level={level} size="sm" />
    </View>
  );
}

export default MasteryMeter;
