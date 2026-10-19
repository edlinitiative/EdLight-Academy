import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect, Line } from 'react-native-svg';
import type { CabinetKey } from '../arcadeCabinets';
import type { StoryProgress } from '../../../../../shared/arenaStory';
import StoryMapArt from './StoryMapArt';
import { fonts } from '../../../theme/theme';

/**
 * The little "screen" inside each arcade cabinet — one illustration per mode,
 * echoing the web bento's art (Haiti map, stadium, VS, PIN board, five mini
 * screens, podium). Static, decorative (hidden from screen readers: the
 * cabinet's label carries the meaning), a few SVG nodes each.
 */
function CabinetArt({ kind, accent, width, progress }: { kind: CabinetKey; accent: string; width: number; progress?: StoryProgress }) {
  const h = 76;
  if (kind === 'story') {
    return (
      <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
        <StoryMapArt progress={progress || {}} width={Math.min(width, Math.round(h / 0.78))} />
      </View>
    );
  }
  if (kind === 'mini') {
    const tiles = ['V/F', 'MO', '+ −', '1 2 3', '★'];
    return (
      <View style={{ height: h, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 }}>
        {tiles.map((s, i) => (
          <View key={s} style={{ minWidth: 40, paddingHorizontal: 6, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: i % 2 ? '#13243F' : '#18304F' }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.bold, fontSize: 12, color: i === 4 ? accent : '#DCE6FF' }}>{s}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (kind === 'room') {
    return (
      <View style={{ height: h, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, color: accent }}>PIN</Text>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: 16, height: 22, borderRadius: 5, backgroundColor: i < 4 ? '#1F3456' : '#13243F', alignItems: 'center', justifyContent: 'center' }}>
              {i < 4 ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#DCE6FF' }} /> : null}
            </View>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={120} height={h} viewBox="0 0 120 76">
        {kind === 'champ' ? (
          <>
            <Path d="M14 70 Q60 18 106 70 Z" fill="#1C3254" />
            <Path d="M24 70 Q60 32 96 70 Z" fill="#13243F" />
            <Path d="M30 8 L46 62 L38 62 Z" fill={accent} opacity={0.35} />
            <Path d="M90 8 L74 62 L82 62 Z" fill={accent} opacity={0.35} />
            <Rect x="52" y="40" width="16" height="16" rx="3" fill={accent} />
            <Rect x="56" y="56" width="8" height="8" fill={accent} opacity={0.7} />
            <Line x1="10" y1="70" x2="110" y2="70" stroke="#2A3A5E" strokeWidth={3} />
          </>
        ) : kind === 'duel' ? (
          <>
            <Circle cx="30" cy="34" r="16" fill="#5EA2FF" />
            <Rect x="16" y="52" width="28" height="16" rx="8" fill="#5EA2FF" opacity={0.6} />
            <Circle cx="90" cy="34" r="16" fill="#FF6A45" />
            <Rect x="76" y="52" width="28" height="16" rx="8" fill="#FF6A45" opacity={0.6} />
            <Path d="M54 22 L66 22 L58 38 L68 38 L52 60 L56 42 L48 42 Z" fill="#F1F5FF" />
          </>
        ) : kind === 'quick' ? (
          <>
            <Circle cx="60" cy="38" r="30" fill="#1C3254" />
            <Path d="M64 10 L40 42 L56 42 L50 68 L80 32 L63 32 Z" fill={accent} />
          </>
        ) : kind === 'board' ? (
          <>
            <Rect x="44" y="26" width="32" height="44" rx="4" fill={accent} />
            <Rect x="10" y="40" width="32" height="30" rx="4" fill="#1F3456" />
            <Rect x="78" y="50" width="32" height="20" rx="4" fill="#1F3456" />
            <Circle cx="60" cy="16" r="7" fill={accent} opacity={0.7} />
          </>
        ) : (
          <>
            <Rect x="20" y="22" width="80" height="40" rx="8" fill="#1C3254" />
            <Circle cx="44" cy="42" r="8" fill={accent} />
            <Circle cx="76" cy="42" r="8" fill={accent} opacity={0.6} />
          </>
        )}
      </Svg>
    </View>
  );
}

export default React.memo(CabinetArt);
