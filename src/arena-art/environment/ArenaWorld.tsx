import React from 'react';
import { Defs, Occasion } from './parts';
import { WideScene, TallScene } from './scenes';
import './ArenaWorld.css';

export type { Occasion } from './parts';

export type ArenaWorldProps = {
  /** everyday (calm city) · match (school banners, lit stage) · championship (beams, trophy, bunting). */
  occasion?: Occasion;
  /** wide ≈ 16:7 desktop composition · tall ≈ 9:14 phone composition (its own layout, not a crop). */
  layout?: 'wide' | 'tall';
  /** The two school colours for match / championship dressing: [home (left), visitors (right)]. */
  banners?: [string, string];
  /** Freeze all ambient motion (also automatic under prefers-reduced-motion). */
  still?: boolean;
  className?: string;
  /** Accessible label — only when the image carries meaning. Otherwise the art is decorative. */
  title?: string;
};

const DEFAULT_BANNERS: [string, string] = ['#1F5FD1', '#D7263D'];

/**
 * The Arène world: an original Haitian night city around a school stadium.
 * Hand-authored vector art, three venue states, two compositions.
 * Ambient motion is CSS-only and pauses when the art is off-screen.
 */
export default function ArenaWorld({
  occasion = 'everyday',
  layout = 'wide',
  banners = DEFAULT_BANNERS,
  still = false,
  className,
  title,
}: ArenaWorldProps) {
  const ref = React.useRef<SVGSVGElement>(null);
  const [onScreen, setOnScreen] = React.useState(false);
  const p = 'aw' + React.useId().replace(/[^a-zA-Z0-9]/g, '') + '-';

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [a, b] = banners;
  const wide = layout === 'wide';
  const cls = [
    'aw',
    `aw--${layout}`,
    `aw--${occasion}`,
    still ? 'aw--still' : '',
    onScreen ? '' : 'aw--paused',
    className || '',
  ].filter(Boolean).join(' ');

  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: 'false' as const };

  return (
    <svg
      ref={ref}
      className={cls}
      viewBox={wide ? '0 0 1600 700' : '0 0 900 1400'}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
    >
      {title && <title>{title}</title>}
      <Defs p={p} />
      {wide ? <WideScene occ={occasion} a={a} b={b} p={p} /> : <TallScene occ={occasion} a={a} b={b} p={p} />}
    </svg>
  );
}
