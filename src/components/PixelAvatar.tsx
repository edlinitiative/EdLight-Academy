/**
 * PixelAvatar — deterministic 8-bit face
 * ──────────────────────────────────────
 * Renders a little pixel-art portrait seeded from the user's uid (or name), so
 * every learner gets a stable, unique face with zero network requests — the
 * strict CSP blocks third-party avatar services. Pure SVG rects on a 10×10
 * grid with crisp edges; scales to any size.
 */

import React, { useMemo } from 'react';

// FNV-1a → stable 32-bit seed from any string
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny deterministic PRNG
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Limyè-friendly backdrop + shirt colors
const BACKDROPS = ['#1B6FE0', '#FF7A5C', '#FFC756', '#14B8A6', '#8B5CF6', '#EC4899', '#0EA5E9'];
const SHIRTS = ['#1B6FE0', '#E0532F', '#0F766E', '#7C3AED', '#B45309', '#166534', '#BE185D'];
const SKINS = ['#4A2C17', '#5C3A21', '#6B4423', '#8D5524', '#A0682F', '#C68642', '#E0AC69'];
const HAIRS = ['#0F0F0F', '#1A1110', '#2D1B12', '#3D2314', '#4E3620'];

/** Build the pixel list for one face. Grid is 10×10; (0,0) top-left. */
function buildFace(seed) {
  const rand = mulberry32(hashSeed(String(seed || 'edlight')));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const bg = pick(BACKDROPS);
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  let shirt = pick(SHIRTS);
  if (shirt === bg) shirt = SHIRTS[(SHIRTS.indexOf(shirt) + 1) % SHIRTS.length];

  const px = [];
  const put = (x, y, color) => px.push({ x, y, color });

  // Face block
  for (let y = 2; y <= 7; y++) {
    for (let x = 1; x <= 8; x++) put(x, y, skin);
  }

  // Hair — a few silhouettes
  const hairStyle = Math.floor(rand() * 4);
  if (hairStyle === 0) {
    // rounded afro
    for (let x = 1; x <= 8; x++) { put(x, 1, hair); }
    for (let x = 2; x <= 7; x++) { put(x, 0, hair); }
    put(0, 2, hair); put(9, 2, hair);
    put(1, 2, hair); put(8, 2, hair);
  } else if (hairStyle === 1) {
    // short crop
    for (let x = 1; x <= 8; x++) put(x, 1, hair);
    for (let x = 3; x <= 6; x++) put(x, 0, hair);
  } else if (hairStyle === 2) {
    // buzz cut
    for (let x = 1; x <= 8; x++) put(x, 1, hair);
    put(1, 2, hair); put(8, 2, hair);
  } else {
    // longer hair framing the face
    for (let x = 1; x <= 8; x++) { put(x, 0, hair); put(x, 1, hair); }
    for (let y = 2; y <= 5; y++) { put(0, y, hair); put(9, y, hair); }
    put(1, 2, hair); put(8, 2, hair);
  }

  // Eyes
  const eye = '#14202E';
  put(3, 4, eye);
  put(6, 4, eye);

  // Mouth — smile variants
  const mouth = '#7A3B2E';
  const mouthStyle = Math.floor(rand() * 3);
  if (mouthStyle === 0) {
    put(4, 6, mouth); put(5, 6, mouth);
  } else if (mouthStyle === 1) {
    put(3, 6, mouth); put(4, 6, mouth); put(5, 6, mouth); put(6, 6, mouth);
  } else {
    put(3, 6, mouth); put(6, 6, mouth); put(4, 7, mouth); put(5, 7, mouth);
  }

  // Shoulders / shirt
  for (let x = 2; x <= 7; x++) put(x, 8, shirt);
  for (let x = 1; x <= 8; x++) put(x, 9, shirt);

  return { bg, px };
}

export function PixelAvatar({ seed, size = 32, className = '' }) {
  const { bg, px } = useMemo(() => buildFace(seed), [seed]);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 10 10"
      role="img"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width="10" height="10" fill={bg} />
      {px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width="1" height="1" fill={p.color} />
      ))}
    </svg>
  );
}

export default PixelAvatar;
