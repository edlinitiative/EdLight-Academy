import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg from 'react-native-svg';
import { Defs } from './parts';
import { TallScene } from './scenes';

export type { Occasion } from './parts';
import type { Occasion } from './parts';

export type ArenaWorldProps = {
  /** everyday (calm city) · match (school banners, lit stage) · championship (beams, trophy, bunting). */
  occasion?: Occasion;
  /** The two school colours for match / championship dressing: [home (left), visitors (right)]. */
  banners?: [string, string];
  /**
   * Accepted for parity with the web contract. The phone port is always
   * still — a complete, designed frame with no ambient motion — so this is
   * a no-op today and reduced-motion is honoured by construction.
   */
  still?: boolean;
  /** Accessible label — only when the image carries meaning. Otherwise the art is decorative. */
  title?: string;
  width?: number | string;
  height?: number | string;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_BANNERS: [string, string] = ['#1F5FD1', '#D7263D'];

/**
 * The Arène world, phone composition (the web's `layout="tall"`, 900 x 1400).
 * Original Haitian night city around a school stadium. Rendered with
 * preserveAspectRatio "xMidYMid slice" so it works as a full-bleed
 * background: give it `style={StyleSheet.absoluteFill}` (default 100% x 100%).
 */
function ArenaWorld({
  occasion = 'everyday',
  banners = DEFAULT_BANNERS,
  title,
  width = '100%',
  height = '100%',
  style,
}: ArenaWorldProps) {
  const p = 'aw' + React.useId().replace(/[^a-zA-Z0-9]/g, '') + '-';
  const [a, b] = banners;
  return (
    <Svg
      width={width}
      height={height}
      style={[{ backgroundColor: '#060E22' }, style]}
      viewBox="0 0 900 1400"
      preserveAspectRatio="xMidYMid slice"
      accessible={!!title}
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
    >
      <Defs p={p} />
      <TallScene occ={occasion} a={a} b={b} p={p} />
    </Svg>
  );
}

// The scene is a few thousand path segments; never re-render it for nothing.
export default React.memo(ArenaWorld);
