import React from 'react';
import Svg, {
  Path, G, Ellipse, Circle, Rect, Defs, ClipPath,
} from 'react-native-svg';
import type { AvatarMood, AvatarTraitOverrides } from './traits';
import { defaultConfigFor, sanitizeConfig, type AvatarConfig } from './avatarConfig';
import { buildAvatarScene, type SceneNode } from './avatarScene';

export type { AvatarMood } from './traits';
export { avatarTraits } from './traits';
export type { AvatarConfig } from './avatarConfig';

export interface AvatarProps {
  seed: string;
  mood?: AvatarMood;
  size?: number;
  colors?: { primary: string; secondary: string };
  still?: boolean;
  title?: string;
  /**
   * The student's chosen avatar (object or the stored wire string). It wins
   * over the seeded traits; invalid / absent → the seeded face.
   */
  config?: AvatarConfig | string | null;
  /** Explicit trait overrides (hair, skin, glasses…) on top of the seed. Ignored when `config` is valid. */
  traits?: AvatarTraitOverrides;
  /** Draw the round backdrop disc (default true). */
  framed?: boolean;
}

/*
 * The drawing itself lives in avatarScene.ts (byte-identical to the web copy),
 * so the phone and the website always draw the same student. This file only
 * maps scene primitives onto react-native-svg. The web's CSS animations
 * (blink, breathe, confetti burst) have no equivalent here: the phone shows
 * the resting pose.
 */
const TAGS: Record<SceneNode['k'], React.ComponentType<any>> = {
  path: Path, circle: Circle, ellipse: Ellipse, rect: Rect, g: G,
};

function draw(n: SceneNode, key: React.Key): React.ReactNode {
  return React.createElement(TAGS[n.k], { ...n.p, key: n.key ?? key }, n.c ? n.c.map(draw) : undefined);
}

const CONFETTI: Array<[number, number, number]> = [
  [-36, -14, 160], [32, -22, -120], [-20, -30, 200], [40, -4, 90],
  [-42, 6, -150], [12, -36, 240], [44, 16, -200], [-8, -40, 130], [24, 4, 180],
];
const CONFETTI_COLORS = ['#F2C230', '#FF7A59', '#5BC0EB', '#7BE0A0'];

function Avatar({
  seed, mood = 'idle', size = 96, colors, still = false, title, config, traits: overrides, framed = true,
}: AvatarProps) {
  const rid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const small = size < 56;
  const cfg = React.useMemo(
    () => sanitizeConfig(config) ?? defaultConfigFor(seed, overrides),
    [config, seed, overrides],
  );
  const scene = React.useMemo(
    () => buildAvatarScene({ seed, config: cfg, mood, colors, small }),
    [seed, cfg, mood, colors, small],
  );
  const c = scene.colors;

  return (
    <Svg
      width={size} height={size} viewBox="0 0 100 100"
      accessible={!!title}
      accessibilityRole={title ? 'image' : undefined}
      accessibilityLabel={title}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
    >
      <Defs>
        <ClipPath id={`${rid}c`}><Circle cx="50" cy="50" r="50" /></ClipPath>
      </Defs>
      {framed && (
        <>
          <Circle cx="50" cy="50" r="50" fill="#14254A" />
          <Circle cx="50" cy="50" r="50" fill={c.primary} opacity=".32" />
          <Circle cx="50" cy="38" r="34" fill="#fff" opacity=".07" />
        </>
      )}
      <G clipPath={`url(#${rid}c)`}>{scene.nodes.map(draw)}</G>
      {mood === 'celebrating' && !small && !still && (
        <G>
          {CONFETTI.map(([dx, dy, rot], i) => {
            const fill = i % 4 === 3 ? c.secondary : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            // Static scatter: the web flies these out with CSS; here they rest
            // where the burst would have left them (no ambient motion on phone).
            const x = 50 + dx * 0.55;
            const y = 30 + dy * 0.55;
            return i % 3 === 1
              ? <Circle key={i} cx={x} cy={y} r="1.6" fill={fill} />
              : <Rect key={i} x={x - 1.7} y={y - 0.85} width="3.4" height="1.7" rx=".4" fill={fill} rotation={rot} origin={`${x}, ${y}`} />;
          })}
        </G>
      )}
    </Svg>
  );
}

export default React.memo(Avatar);
