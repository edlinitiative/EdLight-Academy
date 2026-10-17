/**
 * The shareable result card (roadmap #19): a 1080×1350 PNG drawn on a canvas
 * from the round's REAL data, so a student can post the moment to WhatsApp or
 * a status. Identity is the public minimum — the student's leaderboard pseudo
 * and school, nothing else (no photo, no email, no opponent's name).
 *
 * There was no share-image code on the web to reuse (the mobile app's card is
 * react-native-view-shot), so this is the web's first. The school crest and
 * the level emblem are the Arène's own SVG components, serialised to images,
 * so the card and the screen show the same marks.
 */
import { createElement } from 'react';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import RankEmblem, { emblemForLevel } from '../../arena-art/emblems/RankEmblem';
import type { Tick } from './matchStats';

export interface ResultCardData {
  isCreole: boolean;
  /** "Maths éclair · Défi du jour" */
  eyebrow: string;
  /** Big line — "7/10" for a round, "2 – 1" for a duel. */
  score: string;
  /** Under the score: "bonnes réponses", "Toi – ton ami". */
  scoreCaption: string;
  headline: string;
  ticks?: Tick[];
  /** Up to two short facts, already worded ("Plus longue série : 4 de suite"). */
  facts?: string[];
  pseudo?: string | null;
  school?: string | null;
  level?: number | null;
}

export const CARD_W = 1080;
export const CARD_H = 1350;

const INK = '#F5F8FF';
const INK_2 = '#C1CFE4';
const MUTED = '#A7BAD5';
const GOLD = '#FFB92E';
const CORAL = '#FF6A45';
const FONT = '"Plus Jakarta Sans", "Source Sans 3", system-ui, sans-serif';

/** A leaderboard pseudo counts only with at least one letter (same rule as the board). */
export function publicPseudo(name: unknown): string | null {
  const s = String(name || '').trim();
  return /\p{L}/u.test(s) ? s.slice(0, 32) : null;
}

async function svgImage(el: ReturnType<typeof createElement>): Promise<HTMLImageElement | null> {
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    let markup = renderToStaticMarkup(el);
    if (!/xmlns=/.test(markup)) markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    img.decoding = 'async';
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = url; });
    return img;
  } catch {
    return null;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTick(ctx: CanvasRenderingContext2D, kind: Tick, cx: number, cy: number, r: number) {
  // Earned marks are solid gold; misses and timeouts are a quiet solid disc.
  // No rings, no translucent fills.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'correct' ? GOLD : '#1A2D4D';
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.17;
  ctx.strokeStyle = kind === 'correct' ? '#12213A' : '#7F95B8';
  ctx.beginPath();
  const s = r * 0.4;
  if (kind === 'correct') {
    ctx.moveTo(cx - s, cy + s * 0.05); ctx.lineTo(cx - s * 0.25, cy + s * 0.7); ctx.lineTo(cx + s, cy - s * 0.6);
  } else if (kind === 'wrong') {
    ctx.moveTo(cx - s * 0.7, cy - s * 0.7); ctx.lineTo(cx + s * 0.7, cy + s * 0.7);
    ctx.moveTo(cx + s * 0.7, cy - s * 0.7); ctx.lineTo(cx - s * 0.7, cy + s * 0.7);
  } else {
    ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.45, cy + s * 0.3);
  }
  ctx.stroke();
  ctx.restore();
}

/** Mornes and the sea along the foot of the card: flat, low contrast. */
function drawLandscape(ctx: CanvasRenderingContext2D) {
  // Low hills that stay below the identity panel; the sea is the last band.
  const base = CARD_H - 112;
  ctx.save();
  ctx.fillStyle = '#0E1D3A';
  ctx.beginPath();
  ctx.moveTo(0, base);
  [[0, base - 40], [150, base - 78], [300, base - 52], [450, base - 96], [600, base - 58], [760, base - 88], [920, base - 50], [1080, base - 70]]
    .forEach(([x, y], i) => (i === 0 ? ctx.lineTo(x, y) : ctx.quadraticCurveTo(x - 75, y - 18, x, y)));
  ctx.lineTo(CARD_W, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#122447';
  ctx.beginPath();
  ctx.moveTo(0, base);
  [[0, base - 18], [200, base - 44], [380, base - 24], [560, base - 52], [760, base - 26], [940, base - 46], [1080, base - 22]]
    .forEach(([x, y], i) => (i === 0 ? ctx.lineTo(x, y) : ctx.quadraticCurveTo(x - 90, y - 12, x, y)));
  ctx.lineTo(CARD_W, base); ctx.closePath(); ctx.fill();
  // The sea: a solid band with two calm swell lines.
  ctx.fillStyle = '#081430';
  ctx.fillRect(0, base, CARD_W, CARD_H - base);
  ctx.strokeStyle = '#10224A';
  ctx.lineWidth = 3;
  [base + 30, base + 62].forEach((y, k) => {
    ctx.beginPath();
    for (let x = -20; x <= CARD_W + 20; x += 120) {
      const o = k * 60;
      ctx.moveTo(x + o, y); ctx.quadraticCurveTo(x + o + 30, y - 7, x + o + 60, y);
    }
    ctx.stroke();
  });
  ctx.restore();
}

/** "Plus longue série : 4 de suite" → label + value; plain facts stay whole. */
function splitFact(f: string): { label: string; value: string } {
  const i = f.indexOf(' : ');
  return i > 0 ? { label: f.slice(0, i), value: f.slice(i + 3) } : { label: '', value: f };
}

/** Draw the card; resolves to a PNG blob (null where canvas is unavailable). */
export async function drawResultCard(d: ResultCardData): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    await Promise.all([
      (document as any).fonts?.load?.(`800 120px ${FONT}`),
      (document as any).fonts?.load?.(`700 40px ${FONT}`),
      (document as any).fonts?.load?.(`600 40px ${FONT}`),
    ]);
  } catch { /* system font is fine */ }

  // Layout follows the Stitch direction (project "EdLight Arène — result
  // share card", 2026-10-17): an editorial sports result — left-aligned,
  // one enormous score, solid tonal tiles, gold only for what was earned.
  // No outlines, no glass, no glows, no edge stripes.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#0B1A36');
  bg.addColorStop(1, '#060E22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  drawLandscape(ctx);

  const PAD = 80;
  const W = CARD_W - PAD * 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Masthead
  ctx.fillStyle = MUTED;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('EdLight Academy', PAD, 96);
  ctx.fillStyle = CORAL;
  ctx.textAlign = 'right';
  ctx.fillText(d.isCreole ? 'Arèn · Trivia' : 'Arène · Trivia', CARD_W - PAD, 96);
  ctx.textAlign = 'left';

  // Eyebrow chip (solid)
  ctx.font = `700 32px ${FONT}`;
  const eyebrow = wrap(ctx, d.eyebrow, W - 48, 1)[0] || '';
  const chipW = Math.min(W, ctx.measureText(eyebrow).width + 48);
  roundRect(ctx, PAD, 158, chipW, 60, 14);
  ctx.fillStyle = '#13264A';
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(eyebrow, PAD + 24, 199);

  // The score: the earned part white, the out-of part dim.
  const slash = d.score.indexOf('/');
  let size = 230;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(d.score).width > W && size > 120) { size -= 10; ctx.font = `800 ${size}px ${FONT}`; }
  const scoreY = 270 + size * 0.78;
  if (slash > 0) {
    const head = d.score.slice(0, slash);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(head, PAD - 6, scoreY);
    ctx.fillStyle = '#33476E';
    ctx.fillText(d.score.slice(slash), PAD - 6 + ctx.measureText(head).width, scoreY);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(d.score, PAD - 6, scoreY);
  }
  let y = scoreY + 96;
  ctx.fillStyle = INK_2;
  ctx.font = `700 42px ${FONT}`;
  ctx.fillText(d.scoreCaption, PAD, y);
  y += 84;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 72px ${FONT}`;
  wrap(ctx, d.headline, W, 2).forEach((l) => { ctx.fillText(l, PAD, y); y += 82; });

  // The round, one mark per question (at most 20 fit legibly).
  const ticks = (d.ticks || []).slice(0, 20);
  if (ticks.length) {
    y += 6;
    const perRow = Math.min(10, ticks.length);
    const gap = 20;
    const r = Math.min(32, Math.floor((W - (perRow - 1) * gap) / perRow / 2));
    ticks.forEach((k, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      drawTick(ctx, k, PAD + r + col * (r * 2 + gap), y + r + row * (r * 2 + gap), r);
    });
    y += Math.ceil(ticks.length / perRow) * (r * 2 + gap) + 26;
  }

  // Facts: solid tiles, side by side when there are two.
  const facts = (d.facts || []).slice(0, 2).map(splitFact);
  const footY = CARD_H - 112 - 110 - 150;
  if (facts.length && y + 130 <= footY - 24) {
    const gap = 24;
    const tileW = facts.length === 2 ? (W - gap) / 2 : W;
    facts.forEach((f, i) => {
      const x = PAD + i * (tileW + gap);
      roundRect(ctx, x, y, tileW, 130, 22);
      ctx.fillStyle = '#10213F';
      ctx.fill();
      if (f.label) {
        ctx.fillStyle = MUTED;
        ctx.font = `700 28px ${FONT}`;
        ctx.fillText(wrap(ctx, f.label, tileW - 64, 1)[0] || '', x + 32, y + 50);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 42px ${FONT}`;
        ctx.fillText(wrap(ctx, f.value, tileW - 64, 1)[0] || '', x + 32, y + 102);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 36px ${FONT}`;
        ctx.fillText(wrap(ctx, f.value, tileW - 64, 1)[0] || '', x + 32, y + 78);
      }
    });
  }

  // Identity: crest (or level emblem) + pseudo + school, on one solid panel.
  roundRect(ctx, PAD, footY, W, 150, 26);
  ctx.fillStyle = '#10213F';
  ctx.fill();
  let x = PAD + 32;
  if (d.school) {
    const crest = await svgImage(createElement(SchoolCrest, { name: d.school, size: 104 }));
    if (crest) { ctx.drawImage(crest, x, footY + 23, 104, 104); x += 132; }
  } else if (d.level) {
    const em = await svgImage(createElement(RankEmblem, { level: d.level, size: 104 }));
    if (em) { ctx.drawImage(em, x, footY + 23, 104, 104); x += 132; }
  }
  const maxW = PAD + W - 32 - x;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 46px ${FONT}`;
  const who = d.pseudo || (d.isCreole ? 'Yon elèv EdLight' : 'Un élève EdLight');
  const tier = d.level ? emblemForLevel(d.level) : null;
  const second = [d.school, tier ? `${d.isCreole ? 'Nivo' : 'Niveau'} ${d.level} · ${d.isCreole ? tier.nameHt : tier.nameFr}` : null].filter(Boolean).join(' · ');
  // One line sits on the panel's centre; two lines share it.
  ctx.fillText(wrap(ctx, who, maxW, 1)[0], x, footY + (second ? 68 : 91));
  if (second) {
    ctx.fillStyle = INK_2;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(wrap(ctx, second, maxW, 1)[0], x, footY + 114);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('academy.edlight.org/jeux', CARD_W / 2, CARD_H - 48);

  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
}
