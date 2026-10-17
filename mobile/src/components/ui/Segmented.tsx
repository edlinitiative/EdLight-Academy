/**
 * Segmented — the web's pill switch (Cours/Pratiquer, Bac/9e/Université, the
 * Jeux hub segments, NS I…IV). An opaque track with a sliding opaque thumb;
 * never outline chips, never a translucent fill.
 *
 *  - light: track `surfaceAlt` #EEF2F7, white thumb with a small shadow,
 *           active label ink, inactive muted.
 *  - dark:  track `surfaceAlt`, thumb `azureSoft` (one tonal step up).
 *  - tone="night" (Jeux/Arène): track #13243F, thumb #1F3456, white / #A3B5DC
 *           labels — the same in both OS themes, like the rest of the night.
 *
 * Segments share the width equally; with many/long labels pass `scroll` to let
 * the track scroll horizontally with intrinsic-width segments instead.
 * The thumb slides in 220ms, and snaps when the OS asks for reduced motion.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../../theme/theme';
import { arenaColors } from '../../theme/arenaTheme';
import { useReduceMotion } from '../../utils/motion';
import { tapLight } from '../../utils/haptics';

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: string;
  accessibilityLabel?: string;
}

export interface SegmentedProps<K extends string = string> {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 'auto' follows the app theme; 'night' is the fixed Jeux/Arène world. */
  tone?: 'auto' | 'night';
  /** Scrollable track with intrinsic-width segments (for 4+ long labels). */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 48;
const PAD = 4;

export default function Segmented<K extends string = string>({
  options,
  value,
  onChange,
  tone = 'auto',
  scroll = false,
  style,
}: SegmentedProps<K>) {
  const { colors, fonts, isDark, elevation } = useTheme();
  const reduce = useReduceMotion();
  const night = tone === 'night';

  const track = night ? arenaColors.surface : colors.surfaceAlt;
  const thumb = night ? arenaColors.secondary : isDark ? colors.azureSoft : colors.surface;
  const active = night ? arenaColors.ink : colors.ink;
  const inactive = night ? arenaColors.muted : colors.muted;

  // Measured segment frames, so the thumb can slide to any (variable) width.
  const [frames, setFrames] = useState<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const f = frames[value];

  useEffect(() => {
    if (!f) return;
    const first = w.value === 0;
    if (reduce || first) {
      x.value = f.x;
      w.value = f.w;
    } else {
      const cfg = { duration: 220, easing: Easing.out(Easing.cubic) };
      x.value = withTiming(f.x, cfg);
      w.value = withTiming(f.w, cfg);
    }
  }, [f?.x, f?.w, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));

  const onLayoutKey = (key: string) => (e: LayoutChangeEvent) => {
    const { x: lx, width } = e.nativeEvent.layout;
    setFrames((prev) => (prev[key]?.x === lx && prev[key]?.w === width ? prev : { ...prev, [key]: { x: lx, w: width } }));
  };

  const row = (
    <View style={{ flexDirection: 'row', flexGrow: 1 }}>
      {f ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute', top: 0, bottom: 0, left: 0,
              borderRadius: 999, backgroundColor: thumb,
            },
            night || isDark ? null : elevation.thumb,
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onLayout={onLayoutKey(o.key)}
            onPress={() => {
              if (selected) return;
              tapLight();
              onChange(o.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            style={{
              flex: scroll ? undefined : 1,
              minHeight: HEIGHT - PAD * 2,
              paddingHorizontal: scroll ? 18 : 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.5}
              style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: selected ? active : inactive }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      accessibilityRole="tablist"
      style={[{ backgroundColor: track, borderRadius: 999, padding: PAD, minHeight: HEIGHT }, style]}
    >
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          {row}
        </ScrollView>
      ) : (
        row
      )}
    </View>
  );
}
