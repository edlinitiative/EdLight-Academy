import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, withSpring } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import { duration, easing, spring, stagger } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';
import type { QualificationState } from '../../services/arenaService';

/**
 * `CODOSA · 3/5` — the one number a student can act on tonight.
 *
 * Five segments, not a percentage bar. A bar at 60% is a statistic; five boxes
 * with two of them empty is a countable, and the student can see the two people
 * they have to go and find. That is the entire mechanic of the school
 * tournament: your school cannot win if only you play, and this is where that
 * stops being a slogan and becomes an errand.
 *
 * Two states the design is emphatic about:
 *
 *  - Qualifying changes the card ONCE and permanently. `CODOSA EST QUALIFIÉ`
 *    is an event, and a card that oscillates between qualified and short as
 *    counts settle turns the biggest moment in the lobby into a flicker.
 *  - From doors open, BOTH numbers show — `5 inscrits · 3 présents` — with the
 *    present count as the one that fills the segments. Qualification is judged
 *    at doors close on who actually turned up, so a school can be qualified on
 *    paper and short on the night, and finding that out at kick-off is a bad
 *    surprise and a bad story.
 */
export default function QualificationBar({
  schoolName,
  qualification,
  registered,
  present,
  minPlayers,
  isCreole,
}: {
  /** CODOSA, or the full name when the school has never been given a short one. */
  schoolName: string;
  qualification: QualificationState;
  registered: number;
  present: number;
  minPlayers: number;
  isCreole: boolean;
}) {
  const colors = useColors();
  const { radius } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { counted, needed, qualified, showBoth, shortOnTheNight } = qualification;

  const segments = Math.max(1, minPlayers);
  const accent = qualified ? colors.success : shortOnTheNight ? colors.warn : colors.azure;

  return (
    <View style={{
      gap: 10,
      padding: 14,
      borderRadius: radius.card,
      backgroundColor: qualified ? colors.successSoft : colors.surface,
      borderWidth: 1,
      borderColor: qualified ? colors.success : colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {qualified ? <Check color={colors.successFill} size={15} /> : null}
        <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink, flexShrink: 1 }]}>
          {schoolName}
        </Text>
        <Text style={[typeScale.label, { color: colors.faint }]}>·</Text>
        <Text
          style={[typeScale.label, { color: accent, fontVariant: ['tabular-nums'] }]}
          // Read out as a fraction rather than as two stray numbers.
          accessibilityLabel={t(
            `${counted} joueurs sur ${segments}`,
            `${counted} jwè sou ${segments}`,
          )}
        >
          {counted}/{segments}
        </Text>
      </View>

      {/* The five. Empty boxes are the point — they are countable. */}
      <View
        style={{ flexDirection: 'row', gap: 5 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: segments }, (_, i) => (
          <Segment key={i} index={i} filled={i < counted} color={accent} />
        ))}
      </View>

      {qualified ? (
        <Text style={[typeScale.label, { color: colors.successFill }]}>
          {t(`${schoolName} EST QUALIFIÉ`, `${schoolName} KALIFYE`)}
        </Text>
      ) : (
        <Text style={[typeScale.label, { color: shortOnTheNight ? colors.warn : colors.muted }]}>
          {showBoth
            ? t(
              `Il manque ${needed} joueur${needed > 1 ? 's' : ''} présent${needed > 1 ? 's' : ''} — la salle est ouverte.`,
              `Li manke ${needed} jwè prezan — sal la louvri.`,
            )
            : t(
              `Il manque ${needed} joueur${needed > 1 ? 's' : ''} à ${schoolName} pour se qualifier.`,
              `Li manke ${needed} jwè nan ${schoolName} pou l kalifye.`,
            )}
        </Text>
      )}

      {/* Both numbers, from doors open. A school qualified on paper and short on
          the night must see the gap here, not discover it at kick-off. */}
      {showBoth ? (
        <Text style={[typeScale.caption, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>
          {t(
            `${registered} inscrit${registered > 1 ? 's' : ''} · ${present} présent${present > 1 ? 's' : ''}`,
            `${registered} enskri · ${present} prezan`,
          )}
          {'  '}
          <Text style={[typeScale.caption, { color: colors.faint }]}>
            {t('les présents comptent', 'se prezan yo ki konte')}
          </Text>
        </Text>
      ) : null}
    </View>
  );
}

/** One of the five. Fills with a short spring, staggered along the row. */
function Segment({ index, filled, color }: { index: number; filled: boolean; color: string }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const fill = useSharedValue(reduceMotion ? (filled ? 1 : 0) : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    if (reduceMotion) { fill.value = target; return; }
    fill.value = withDelay(
      stagger(index),
      target === 1
        ? withSpring(1, spring.settle)
        : withTiming(0, { duration: duration.quick, easing: easing.exit }),
    );
  }, [filled, index, reduceMotion, fill]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.25 + fill.value * 0.75,
    transform: [{ scaleY: 0.72 + fill.value * 0.28 }],
  }));

  return (
    <View style={{ flex: 1, height: 10, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1, borderRadius: 999, backgroundColor: filled ? color : colors.border }, animated]} />
    </View>
  );
}
