import React from 'react';

/**
 * CardCover — optimized, dependency-free "cover art" for cards.
 *
 * Instead of shipping heavy raster photos (or scattering emojis around the UI),
 * each cover is a pure CSS gradient + a subtle dot pattern + a single inline
 * SVG glyph. The whole thing is vector, weighs a few hundred bytes, makes zero
 * network requests, and stays razor-sharp at any resolution / device-pixel
 * ratio. Colour is driven by the card's subject/track colour so a grid of
 * covers reads as a cohesive, polished set rather than mismatched icons.
 */

type GlyphKey =
  | 'book'
  | 'cap'
  | 'campus'
  | 'leaf'
  | 'atom'
  | 'chart'
  | 'palette'
  | 'beaker'
  | 'function'
  | 'globe';

// Each entry is the inner content of an <svg viewBox="0 0 24 24"> drawn with
// strokes (fill: none) so it renders as clean line-art over the gradient.
const GLYPHS: Record<GlyphKey, React.ReactNode> = {
  // Open book — fundamental / lettres
  book: (
    <>
      <path d="M12 6.5V21" />
      <path d="M3 5.2A2.2 2.2 0 0 1 5.2 3H11a1 1 0 0 1 1 1v14.5a1 1 0 0 1-1 1H5.2A2.2 2.2 0 0 0 3 21z" />
      <path d="M21 5.2A2.2 2.2 0 0 0 18.8 3H13a1 1 0 0 0-1 1v14.5a1 1 0 0 0 1 1h5.8A2.2 2.2 0 0 1 21 21z" />
    </>
  ),
  // Graduation cap — baccalauréat / terminale
  cap: (
    <>
      <path d="M21.5 10.5 12 6 2.5 10.5 12 15z" />
      <path d="M6.5 12.4V17c0 1.5 2.5 2.7 5.5 2.7s5.5-1.2 5.5-2.7v-4.6" />
      <path d="M21.5 10.5V15.5" />
    </>
  ),
  // Columns / campus — université
  campus: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9.3 10v8M14.7 10v8M19 10v8" />
      <path d="M3.5 18.5h17M2.8 21h18.4" />
    </>
  ),
  // Leaf — Sciences de la Vie et de la Terre (SVT)
  leaf: (
    <>
      <path d="M11 20.5A7.5 7.5 0 0 1 3.5 13C3.5 6.6 9.8 3.5 20.5 3.5c0 10.7-3.1 17-9.5 17z" />
      <path d="M4 13c5.3-1 9.6-3.3 14-7.6" />
    </>
  ),
  // Atom — Sciences Mathématiques et Physiques (SMP)
  atom: (
    <>
      <circle cx="12" cy="12" r="1.7" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.7" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.7" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.7" transform="rotate(120 12 12)" />
    </>
  ),
  // Bar chart — Sciences Économiques et Sociales (SES)
  chart: (
    <>
      <path d="M4 4v16h16.5" />
      <rect x="7.4" y="11" width="2.7" height="6" rx="0.5" />
      <rect x="12" y="7.5" width="2.7" height="9.5" rx="0.5" />
      <rect x="16.6" y="13.5" width="2.7" height="3.5" rx="0.5" />
    </>
  ),
  // Palette — Arts
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 1.9 1.9 0 0 0 1.9-1.9c0-.5-.2-.9-.5-1.2a1.9 1.9 0 0 1 1.4-3.2h1.5A3.7 3.7 0 0 0 21 11a9 9 0 0 0-9-8z" />
      <circle cx="7.6" cy="11.4" r="1" />
      <circle cx="9.6" cy="7.2" r="1" />
      <circle cx="14.6" cy="7.2" r="1" />
    </>
  ),
  // Beaker — chemistry
  beaker: (
    <>
      <path d="M9 3h6M10 3v6.5L5.2 18a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 9.5V3" />
      <path d="M7.3 14.5h9.4" />
    </>
  ),
  // Function curve — mathematics
  function: (
    <>
      <path d="M4 20c3 0 4-16 7-16 2 0 2.5 7 4.5 7 1.6 0 2.5-4 4.5-4" />
      <path d="M3 12h6.5" />
    </>
  ),
  // Globe — economy / social
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.7 2.4 4.2 5.6 4.2 9s-1.5 6.6-4.2 9c-2.7-2.4-4.2-5.6-4.2-9S9.3 5.4 12 3z" />
    </>
  ),
};

export interface CardCoverProps {
  /** Which inline-SVG glyph to draw on the cover. */
  glyph?: GlyphKey | string;
  /** Subject / track colour the gradient is built from. */
  color?: string;
  /** Extra class (e.g. a size modifier from the consuming page). */
  className?: string;
}

export default function CardCover({ glyph = 'book', color = '#1B6FE0', className = '' }: CardCoverProps) {
  const inner = GLYPHS[(glyph as GlyphKey)] ?? GLYPHS.book;
  // Gradient is built entirely from the single accent colour so callers only
  // pass one value. color-mix keeps the light/dark stops on-brand.
  const background =
    `linear-gradient(135deg, ` +
    `color-mix(in srgb, ${color} 86%, #ffffff) 0%, ` +
    `${color} 46%, ` +
    `color-mix(in srgb, ${color} 64%, #0b1220) 100%)`;

  return (
    <div
      className={`card-cover ${className}`.trim()}
      style={{ background }}
      aria-hidden="true"
    >
      <span className="card-cover__pattern" />
      <svg
        className="card-cover__glyph"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {inner}
      </svg>
    </div>
  );
}
