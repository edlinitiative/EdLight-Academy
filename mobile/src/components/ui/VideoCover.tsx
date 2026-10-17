/**
 * VideoCover — a real lesson still at 16:9 with the web's two overlays: a navy
 * level badge bottom-left ("NS I") and a white play disc bottom-right.
 *
 * Rules it encodes (founder): real lesson stills only, never stock; no
 * gradient scrims, no translucent pills; the box is sized by aspectRatio,
 * never a fixed height. `resizeMode="cover"` on a 16:9 box also crops the
 * letterbox bars baked into YouTube's 4:3 `sd*` stills (utils/courseCovers).
 *
 * Image source: pass `uri` (+ your own `onError`, e.g. from useCourseThumb),
 * or `uris` — an ordered candidate list the cover walks itself on failure.
 * When nothing loads it shows the opaque `surfaceAlt` placeholder.
 *
 * As the lesson player FACADE: pass `onPress` and `playPosition="center"`;
 * the parent mounts the WebView only after the tap.
 */

import React, { useState } from 'react';
import { View, Text, Image, StyleProp, ViewStyle } from 'react-native';
import { Play } from 'lucide-react-native';
import PressableScale from './PressableScale';
import { useTheme } from '../../theme/theme';
import { useThumbCandidates } from '../../hooks/useCourseThumb';

/** The badge ground: deep navy in both themes (white label = 15.5:1). */
export const COVER_BADGE_BG = '#1B2437';

export interface VideoCoverProps {
  /** A single image URL (pair with `onError` to walk your own candidates). */
  uri?: string | null;
  onError?: () => void;
  /** Ordered candidates, walked internally on load failure. Ignored when `uri` is given. */
  uris?: readonly string[];
  /** Badge text, e.g. displayLevel('NS1') → "NS I". Omit for no badge. */
  levelLabel?: string | null;
  /** Show the play disc. Default true. */
  play?: boolean;
  /** Where the play disc sits: bottom-right on cards, center on the player facade. */
  playPosition?: 'corner' | 'center';
  /** Width / height. Default 16/9. */
  ratio?: number;
  /** Top corner radius (cards clip the bottom). Default radius.card (18). */
  radiusTop?: number;
  /** Bottom corner radius. Default 0 (sits on a card body). */
  radiusBottom?: number;
  /** Makes the whole cover a button (the player facade). */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Extra content layered over the image (e.g. a duration chip). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** YouTube's sd and hq stills are 4:3 with the 16:9 picture letterboxed; a 16:9
 *  cover crop lands on the bar edge and leaves a 1px dark line. Overscan. */
const LETTERBOXED = /\/(sd|hq)(default|\d)\.jpg/;

export default function VideoCover({
  uri,
  onError,
  uris,
  levelLabel,
  play = true,
  playPosition = 'corner',
  ratio = 16 / 9,
  radiusTop,
  radiusBottom = 0,
  onPress,
  accessibilityLabel,
  children,
  style,
}: VideoCoverProps) {
  const { colors, radius, fonts, elevation } = useTheme();
  const walk = useThumbCandidates(uri !== undefined ? [] : uris ?? []);
  const src = uri !== undefined ? uri : walk.uri;
  const handleError = uri !== undefined ? onError : walk.onError;
  const [loaded, setLoaded] = useState(false);

  const rt = radiusTop ?? radius.card;
  const center = playPosition === 'center';
  const disc = center ? 64 : 56;

  const body = (
    <View
      style={[
        {
          width: '100%',
          aspectRatio: ratio,
          backgroundColor: colors.surfaceAlt,
          borderTopLeftRadius: rt,
          borderTopRightRadius: rt,
          borderBottomLeftRadius: radiusBottom,
          borderBottomRightRadius: radiusBottom,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(false); handleError?.(); }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: loaded ? 1 : 0, transform: LETTERBOXED.test(src) ? [{ scale: 1.04 }] : undefined }}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      {levelLabel ? (
        <View
          style={{
            position: 'absolute', left: 12, bottom: 12,
            backgroundColor: COVER_BADGE_BG, borderRadius: radius.pill,
            paddingVertical: 6, paddingHorizontal: 14,
          }}
        >
          <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.heading, fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: '#ffffff' }}>
            {levelLabel}
          </Text>
        </View>
      ) : null}

      {play ? (
        <View
          pointerEvents="none"
          style={[
            center
              ? { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }
              : { position: 'absolute', right: 12, bottom: 12 },
          ]}
        >
          <View
            style={{
              width: disc, height: disc, borderRadius: disc / 2, backgroundColor: '#ffffff',
              alignItems: 'center', justifyContent: 'center', ...elevation.card,
            }}
          >
            {/* Nudged right: a play triangle's optical centre sits left of its box. */}
            <Play color="#1B6FE0" size={center ? 28 : 24} strokeWidth={2.4} fill="none" style={{ marginLeft: 3 }} />
          </View>
        </View>
      ) : null}

      {children}
    </View>
  );

  if (!onPress) return body;
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </PressableScale>
  );
}
