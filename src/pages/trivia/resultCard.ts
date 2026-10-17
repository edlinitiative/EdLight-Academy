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
const GREEN = '#3DDC97';
const ROSE = '#FF6B81';
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
  ctx.save();
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (kind === 'correct') { ctx.fillStyle = 'rgba(61, 220, 151, 0.2)'; ctx.strokeStyle = GREEN; }
  else if (kind === 'wrong') { ctx.fillStyle = 'rgba(255, 107, 129, 0.18)'; ctx.strokeStyle = ROSE; }
  else { ctx.fillStyle = 'rgba(167, 186, 213, 0.14)'; ctx.strokeStyle = MUTED; }
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  const s = r * 0.42;
  if (kind === 'correct') {
    ctx.moveTo(cx - s, cy + s * 0.05); ctx.lineTo(cx - s * 0.25, cy + s * 0.7); ctx.lineTo(cx + s, cy - s * 0.6);
  } else if (kind === 'wrong') {
    ctx.moveTo(cx - s * 0.75, cy - s * 0.75); ctx.lineTo(cx + s * 0.75, cy + s * 0.75);
    ctx.moveTo(cx + s * 0.75, cy - s * 0.75); ctx.lineTo(cx - s * 0.75, cy + s * 0.75);
  } else {
    ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.45, cy + s * 0.3);
  }
  ctx.stroke();
  ctx.restore();
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
      (document as any).fonts?.load?.(`600 40px ${FONT}`),
    ]);
  } catch { /* system font is fine */ }

  // Night sky, flat and calm: the result is the subject, not the backdrop.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#0B1A36');
  bg.addColorStop(1, '#060E22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, 420, 40, CARD_W / 2, 420, 620);
  glow.addColorStop(0, 'rgba(61, 139, 255, 0.22)');
  glow.addColorStop(1, 'rgba(61, 139, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const PAD = 88;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Masthead
  ctx.fillStyle = INK;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('EdLight Academy', PAD, PAD + 30);
  ctx.fillStyle = GOLD;
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(d.isCreole ? 'Arèn · Trivia' : 'Arène · Trivia', CARD_W - PAD, PAD + 30);

  // Eyebrow + score + headline
  ctx.textAlign = 'center';
  ctx.fillStyle = INK_2;
  ctx.font = `700 38px ${FONT}`;
  wrap(ctx, d.eyebrow, CARD_W - PAD * 2, 1).forEach((l) => ctx.fillText(l, CARD_W / 2, 270));
  ctx.fillStyle = INK;
  ctx.font = `800 190px ${FONT}`;
  ctx.fillText(d.score, CARD_W / 2, 465);
  ctx.fillStyle = MUTED;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(d.scoreCaption, CARD_W / 2, 548);
  ctx.fillStyle = INK;
  ctx.font = `800 56px ${FONT}`;
  let y = 640;
  wrap(ctx, d.headline, CARD_W - PAD * 2, 2).forEach((l) => { ctx.fillText(l, CARD_W / 2, y); y += 66; });

  // The round, one mark per question (at most 20 fit legibly).
  const ticks = (d.ticks || []).slice(0, 20);
  if (ticks.length) {
    const perRow = Math.min(10, ticks.length);
    const r = 26;
    const gap = 22;
    const rowW = perRow * r * 2 + (perRow - 1) * gap;
    ticks.forEach((k, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      drawTick(ctx, k, (CARD_W - rowW) / 2 + r + col * (r * 2 + gap), y + 10 + r + row * (r * 2 + gap), r);
    });
    y += 10 + Math.ceil(ticks.length / perRow) * (r * 2 + gap) + 20;
  }

  // Facts
  const facts = (d.facts || []).slice(0, 2);
  if (facts.length) {
    const boxH = 80;
    const limit = CARD_H - PAD - 120 - 50;
    facts.forEach((f) => {
      if (y + boxH > limit) return;
      roundRect(ctx, PAD, y, CARD_W - PAD * 2, boxH, 26);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = `700 36px ${FONT}`;
      ctx.fillText(wrap(ctx, f, CARD_W - PAD * 2 - 60, 1)[0] || '', CARD_W / 2, y + 52);
      y += boxH + 16;
    });
  }

  // Identity footer: emblem + pseudo + school (public fields only).
  const footY = CARD_H - PAD - 120;
  ctx.strokeStyle = 'rgba(160, 190, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD, footY - 30); ctx.lineTo(CARD_W - PAD, footY - 30); ctx.stroke();
  let x = PAD;
  ctx.textAlign = 'left';
  if (d.school) {
    const crest = await svgImage(createElement(SchoolCrest, { name: d.school, size: 112 }));
    if (crest) { ctx.drawImage(crest, x, footY, 112, 112); x += 136; }
  } else if (d.level) {
    const em = await svgImage(createElement(RankEmblem, { level: d.level, size: 112 }));
    if (em) { ctx.drawImage(em, x, footY, 112, 112); x += 136; }
  }
  const maxW = CARD_W - PAD - x;
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${FONT}`;
  const who = d.pseudo || (d.isCreole ? 'Yon elèv EdLight' : 'Un élève EdLight');
  ctx.fillText(wrap(ctx, who, maxW, 1)[0], x, footY + 46);
  ctx.fillStyle = INK_2;
  ctx.font = `600 34px ${FONT}`;
  const tier = d.level ? emblemForLevel(d.level) : null;
  const second = [d.school, tier ? `${d.isCreole ? 'Nivo' : 'Niveau'} ${d.level} · ${d.isCreole ? tier.nameHt : tier.nameFr}` : null].filter(Boolean).join(' · ');
  if (second) ctx.fillText(wrap(ctx, second, maxW, 1)[0], x, footY + 96);
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('academy.edlight.org/jeux', CARD_W / 2, CARD_H - 44);

  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
}
