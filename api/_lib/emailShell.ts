/**
 * api/_lib/emailShell.ts — the one frame every EdLight email is built in.
 * ---------------------------------------------------------------------------
 * Design source: the "EdLight Emails — Premium" Claude Design canvas
 * (https://claude.ai/artifact/BhmRYu9QL7UwTAVoDSg9Fo, 2026-10-17). Before it,
 * the four emails had three unrelated looks — a rounded card, a blue header
 * bar with bullet lists, an unbranded box — plus emoji headlines and faint
 * footer text. Now they share:
 *
 *   • the website's tokens: marine ink #12213A, action blue #1558B8,
 *     Plus Jakarta Sans headings over Source Sans 3 body (Helvetica/Arial
 *     when a client will not load web fonts — Gmail never does);
 *   • one masthead (the hosted PWA icon + wordmark; no SVG — Gmail strips it)
 *     and one footer (why you got this, a preferences link, the org line);
 *   • a single 54px, 12px-radius button that spans the card on a phone;
 *   • a declared dark palette, so Apple Mail and Outlook do not invert it.
 *
 * Email HTML rules this file holds to: tables for layout, inline styles for
 * everything that matters, <style> only for the media queries clients that
 * support them will apply, no images beyond the logo.
 */

export const APP_URL = 'https://academy.edlight.org';
export const SETTINGS_URL = `${APP_URL}/profile`;
const LOGO_URL = `${APP_URL}/icon-192.png`;

export const C = {
  ink: '#12213A',
  body: '#465873',
  muted: '#5A6B85',
  faint: '#6B7A90',
  action: '#1558B8',
  border: '#DCE5F0',
  page: '#EEF2F7',
  well: '#F3F6FA',
  success: '#0F7A42',
  warnBg: '#FFF6E2',
  warnInk: '#805000',
  warnText: '#4A3A10',
  alert: '#B04A12',
  gold: '#FFD27A',
} as const;

export const FONT_BODY = "'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif";
export const FONT_DISPLAY = "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Emoji out of a subject line: a premium inbox row is words, not stickers. */
export function plainSubject(s: string): string {
  return String(s || '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** One table row of the card, padded like every other. */
export const row = (inner: string, pad = '24px 28px 0') =>
  `<tr><td class="edl-pad" style="padding:${pad};">${inner}</td></tr>`;

export const hello = (text: string) =>
  `<div class="edl-link" style="font-family:${FONT_BODY};font-size:15px;font-weight:700;line-height:1.4;color:${C.action};">${text}</div>`;

export const h1 = (text: string) =>
  `<h1 class="edl-ink edl-h1" style="margin:8px 0 0;font-family:${FONT_DISPLAY};font-weight:800;font-size:28px;line-height:1.18;letter-spacing:-0.5px;color:${C.ink};">${text}</h1>`;

export const para = (html: string, top = 12) =>
  `<p class="edl-body" style="margin:${top}px 0 0;font-family:${FONT_BODY};font-size:17px;line-height:1.55;color:${C.body};">${html}</p>`;

export const small = (html: string, top = 0, align = 'left') =>
  `<div class="edl-muted" style="margin-top:${top}px;text-align:${align};font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${C.muted};">${html}</div>`;

export const eyebrow = (text: string) =>
  `<div class="edl-muted" style="font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${C.muted};">${text}</div>`;

/** The one primary action: full card width, so it is a thumb target on a phone. */
export const button = (href: string, label: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="center" style="border-radius:12px;background:${C.action};">
      <a href="${esc(href)}" style="display:block;padding:16px 20px;font-family:${FONT_DISPLAY};font-size:17px;font-weight:700;line-height:22px;color:#FFFFFF;text-decoration:none;border-radius:12px;">${label}</a>
    </td></tr></table>`;

/** A secondary action drawn as an outline, for the rare email with two. */
export const buttonOutline = (href: string, label: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="center" class="edl-outline" style="border-radius:12px;border:1px solid ${C.border};background:#FFFFFF;">
      <a href="${esc(href)}" class="edl-link" style="display:block;padding:15px 20px;font-family:${FONT_DISPLAY};font-size:16px;font-weight:700;line-height:22px;color:${C.action};text-decoration:none;border-radius:12px;">${label}</a>
    </td></tr></table>`;

export const textLink = (href: string, label: string) =>
  `<div style="margin-top:14px;text-align:center;"><a href="${esc(href)}" class="edl-link" style="font-family:${FONT_BODY};font-size:16px;font-weight:600;color:${C.action};text-decoration:none;">${label}</a></div>`;

/** A soft panel: next lesson, a list group. */
export const well = (inner: string, pad = '18px 20px') =>
  `<div class="edl-well" style="background:${C.well};border-radius:16px;padding:${pad};">${inner}</div>`;

/**
 * Up to three figures side by side — the student's real numbers, each with
 * its label. Callers pass only non-zero ones (absence, never a bad grade).
 */
export function scorecard(cells: { value: string | number; label: string; color?: string }[]): string {
  if (cells.length === 0) return '';
  const w = Math.floor(100 / cells.length);
  const tds = cells
    .map((c, i) => `<td width="${w}%" align="center" valign="top" class="edl-rule" style="padding:14px 8px;${i > 0 ? `border-left:1px solid ${C.border};` : ''}">
        <div class="edl-ink" style="font-family:${FONT_DISPLAY};font-weight:800;font-size:26px;line-height:1;color:${c.color || C.ink};">${esc(c.value)}</div>
        <div class="edl-muted" style="margin-top:6px;font-family:${FONT_BODY};font-size:13px;line-height:1.3;color:${C.muted};">${c.label}</div>
      </td>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-rule" style="border:1px solid ${C.border};border-radius:16px;border-collapse:separate;"><tr>${tds}</tr></table>`;
}

export interface ShellArgs {
  lang: 'fr' | 'ht';
  title: string;
  /** Inbox preview line; without it clients scrape the first words of the body. */
  preheader: string;
  /** Small label at the right of the masthead (date, "Ton rappel"…). */
  context?: string;
  /** Table rows (`row(...)`) between masthead and footer. */
  rows: string;
  /** Why the reader received this. */
  footerNote: string;
  /** Preferences link label; omit for transactional mail with no setting. */
  prefsLabel?: string;
  /** Extra footer lines (sign-off, reply prompt), already escaped. */
  footerExtra?: string;
}

const ORG_LINE = {
  fr: 'EdLight Initiative · organisme à but non lucratif',
  ht: 'EdLight Initiative · òganizasyon san bi likratif',
};

export function emailDocument(a: ShellArgs): string {
  const preheader = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(a.preheader)}${'&#8204;&nbsp;'.repeat(60)}</div>`;
  const context = a.context
    ? `<td align="right" valign="middle" class="edl-muted" style="font-family:${FONT_BODY};font-size:13px;font-weight:600;color:${C.muted};">${esc(a.context)}</td>`
    : '';
  return `<!doctype html>
<html lang="${a.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${esc(a.title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&amp;family=Source+Sans+3:wght@400;600;700&amp;display=swap">
  <style>
    @media (prefers-color-scheme: dark) {
      .edl-page { background:#0B1524 !important; }
      .edl-card { background:#142239 !important; }
      .edl-ink  { color:#F2F6FC !important; }
      .edl-body { color:#C1CFE4 !important; }
      .edl-muted{ color:#9DAFC7 !important; }
      .edl-well { background:#1B2C46 !important; }
      .edl-rule { border-color:#344762 !important; }
      .edl-outline { background:#142239 !important; border-color:#344762 !important; }
      .edl-link { color:#9DC4FF !important; }
      .edl-warn { background:#47371E !important; }
      .edl-warn div, .edl-warn p { color:#FFDA91 !important; }
    }
    @media only screen and (max-width:600px) {
      .edl-outer { padding:12px 8px 24px !important; }
      .edl-pad { padding-left:20px !important; padding-right:20px !important; }
      .edl-h1  { font-size:26px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-page" style="background:${C.page};">
    <tr><td align="center" class="edl-outer" style="padding:32px 16px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="edl-card" style="max-width:560px;background:#FFFFFF;border-radius:20px;border-collapse:separate;">
        <tr><td class="edl-pad" style="padding:22px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle"><img src="${LOGO_URL}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
                <td valign="middle" class="edl-ink" style="padding-left:10px;font-family:${FONT_DISPLAY};font-weight:800;font-size:16px;letter-spacing:-0.2px;color:${C.ink};">EdLight Academy</td>
              </tr></table>
            </td>
            ${context}
          </tr></table>
        </td></tr>
        ${a.rows}
        <tr><td class="edl-pad" style="padding:28px 28px 0;"><div class="edl-rule" style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td class="edl-pad" style="padding:18px 28px 26px;">
          ${small(a.footerNote)}
          ${a.footerExtra || ''}
          ${a.prefsLabel ? `<div style="margin-top:10px;"><a href="${esc(SETTINGS_URL)}" class="edl-link" style="font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${C.action};text-decoration:none;">${a.prefsLabel}</a></div>` : ''}
        </td></tr>
      </table>
      <div class="edl-muted" style="max-width:560px;padding:18px 12px 0;text-align:center;font-family:${FONT_BODY};font-size:13px;line-height:1.5;color:${C.faint};">${ORG_LINE[a.lang] || ORG_LINE.fr}</div>
    </td></tr>
  </table>
</body>
</html>`;
}
