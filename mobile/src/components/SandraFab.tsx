/**
 * SandraFab — floating button that opens the Sandra AI-tutor chat, pinned
 * bottom-right just above the tab bar.
 *
 * An opaque 52pt disc carrying Sandra's face (the same face as the chat
 * header), lifted by the card elevation. No label pill (it covered card text
 * on Accueil — the name lives in accessibilityLabel), no gradient, no glow,
 * no ring.
 *
 * It must never sit on top of content the student is reading, so it gets out
 * of the way while the page scrolls and comes back once the scroll rests:
 *
 *   const fab = useSandraFabScroll();
 *   <ScrollView onScroll={fab.onScroll} scrollEventThrottle={16}
 *               onMomentumScrollEnd={fab.onRest} onScrollEndDrag={fab.onRest}
 *               contentContainerStyle={{ paddingBottom: SANDRA_FAB_CLEARANCE }} />
 *   <SandraFab onPress={…} hidden={fab.hidden} />
 *
 * Screens should also reserve SANDRA_FAB_CLEARANCE of bottom padding so the
 * last card can scroll clear of the disc.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableScale from './ui/PressableScale';
import SandraFace from './sandra/SandraFace';
import { tapMedium } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { useTheme } from '../theme/theme';

const DISC = 52;
/** Native tab bar content height (iOS 49) plus breathing room above it. */
const TAB_BAR = 49;
const GAP = 16;

/** Bottom padding a screen should reserve so its last card clears the button. */
export const SANDRA_FAB_CLEARANCE = DISC + GAP * 2;

/** Hide-while-scrolling state for SandraFab. Reappears ~600ms after the scroll rests. */
export function useSandraFabScroll(): {
  hidden: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onRest: () => void;
} {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRest = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHidden(false), 600);
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (Math.abs(y - lastY.current) > 4) {
      if (timer.current) clearTimeout(timer.current);
      setHidden(true);
    }
    lastY.current = y;
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { hidden, onScroll, onRest };
}

export default function SandraFab({
  onPress,
  hidden = false,
  bottomOffset,
}: {
  onPress: () => void;
  /** True while the page scrolls (see useSandraFabScroll). */
  hidden?: boolean;
  /** Override the distance from the screen bottom (e.g. a JS tab bar). */
  bottomOffset?: number;
}) {
  const { colors, elevation, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const shown = useSharedValue(hidden ? 0 : 1);

  useEffect(() => {
    const to = hidden ? 0 : 1;
    shown.value = reduce ? to : withTiming(to, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [hidden, reduce, shown]);

  const anim = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 24 }, { scale: 0.85 + shown.value * 0.15 }],
  }));

  const bottom = bottomOffset ?? insets.bottom + TAB_BAR + GAP;

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[{ position: 'absolute', right: 16, bottom }, anim]}
    >
      <PressableScale
        onPress={() => { tapMedium(); onPress(); }}
        haptic={false}
        pressedScale={0.92}
        accessibilityRole="button"
        accessibilityLabel="Sandra"
        accessibilityHint="Ta tutrice IA · Titris IA ou"
        style={[
          {
            width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center',
            // Dark: one tonal step above the cards (surfaceAlt vanished on them).
            backgroundColor: isDark ? colors.azureSoft : colors.surface,
          },
          elevation.card,
          { shadowOpacity: isDark ? 0.45 : 0.16 },
        ]}
      >
        <SandraFace size={DISC - 6} />
      </PressableScale>
    </Animated.View>
  );
}
