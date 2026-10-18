import React from 'react';
import type { AvatarMood, AvatarTraitOverrides } from './traits';
import { defaultConfigFor, sanitizeConfig, type AvatarConfig } from './avatarConfig';
import { buildAvatarScene, type SceneNode } from './avatarScene';
import './avatars.css';

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
  className?: string;
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

/** Scene node → react-dom element. Keys are stable per position. */
function draw(n: SceneNode, key: React.Key): React.ReactNode {
  const props: Record<string, unknown> = { ...n.p, key: n.key ?? key };
  if (n.cls) props.className = n.cls;
  return React.createElement(n.k, props, n.c ? n.c.map(draw) : undefined);
}

const CONFETTI: Array<[number, number, number]> = [
  [-36, -14, 160], [32, -22, -120], [-20, -30, 200], [40, -4, 90],
  [-42, 6, -150], [12, -36, 240], [44, 16, -200], [-8, -40, 130], [24, 4, 180],
];
const CONFETTI_COLORS = ['#F2C230', '#FF7A59', '#5BC0EB', '#7BE0A0'];

function Avatar({
  seed, mood = 'idle', size = 96, colors, still = false, title, className, config, traits: overrides, framed = true,
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

  const cls = ['av', `av--${mood}`, still && 'av--still', small && 'av--small', className].filter(Boolean).join(' ');
  const a11y = title
    ? { role: 'img', 'aria-labelledby': `${rid}t` }
    : { 'aria-hidden': true as const, focusable: 'false' as const };

  return (
    <svg
      className={cls} width={size} height={size} viewBox="0 0 100 100"
      style={{ '--av-blink': `${scene.blinkDelay}s` } as React.CSSProperties}
      {...a11y}
    >
      {title && <title id={`${rid}t`}>{title}</title>}
      <defs>
        <clipPath id={`${rid}c`}><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      {framed && (
        <>
          <circle cx="50" cy="50" r="50" fill="#14254A" />
          <circle cx="50" cy="50" r="50" fill={c.primary} opacity=".32" />
          <circle cx="50" cy="38" r="34" fill="#fff" opacity=".07" />
        </>
      )}
      <g clipPath={`url(#${rid}c)`}>{scene.nodes.map(draw)}</g>
      {mood === 'celebrating' && !small && !still && (
        <g className="av-confetti">
          {CONFETTI.map(([dx, dy, rot], i) => {
            const fill = i % 4 === 3 ? c.secondary : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const st = { '--dx': `${dx}px`, '--dy': `${dy}px`, '--rot': `${rot}deg`, animationDelay: `${(i % 3) * 40}ms` } as React.CSSProperties;
            return i % 3 === 1
              ? <circle key={i} cx="50" cy="30" r="1.6" fill={fill} style={st} />
              : <rect key={i} x="48.4" y="29.2" width="3.4" height="1.7" rx=".4" fill={fill} style={st} />;
          })}
        </g>
      )}
    </svg>
  );
}

export default React.memo(Avatar);
