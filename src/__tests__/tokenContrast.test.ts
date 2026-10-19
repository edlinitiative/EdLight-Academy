/**
 * Token contrast — every text-on-ground pairing the web design tokens offer
 * must clear WCAG AA (4.5:1 for text, 3:1 for non-text such as focus rings),
 * in BOTH themes.
 *
 * Tokens are read from the real stylesheets (index.css top-level `:root` and
 * `[data-theme="dark"]` blocks, in source order — last declaration wins, as in
 * the browser), so this guards against a later block quietly redefining a
 * token below AA. The pf-* tones are read from styles/pf.css (`.pf` scope).
 */
import fs from 'fs';
import path from 'path';
import { AA_NON_TEXT, AA_TEXT, contrastRatio, parseColor } from '../utils/contrast';

type Decls = Record<string, string>;

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Collect custom-property declarations from top-level rules whose selector matches exactly. */
function collect(css: string, selector: string, into: Decls) {
  const re = /(^|})\s*([^{}@]+?)\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const sel = m[2].trim().replace(/\s+/g, ' ');
    if (sel !== selector) continue;
    for (const d of m[3].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const name = d.slice(0, i).trim();
      if (name.startsWith('--')) into[name] = d.slice(i + 1).trim();
    }
  }
}

function resolve(value: string, decls: Decls, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle at ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fallback) => {
    const v = decls[name] ?? fallback;
    if (v == null) throw new Error(`Unresolved token ${name}`);
    return resolve(v, decls, depth + 1);
  });
}

const index = read('index.css');
const pf = read('styles/pf.css');

const light: Decls = {};
collect(index, ':root', light);
const dark: Decls = { ...light };
collect(index, '[data-theme="dark"]', dark);
// pf tones live on the `.pf` scope.
const pfLight: Decls = { ...light };
collect(pf, '.pf', pfLight);
const pfDark: Decls = { ...dark, ...pfLight };
collect(pf, '[data-theme="dark"] .pf', pfDark);

const themes = { light, dark } as const;
const tok = (decls: Decls, name: string) => resolve(`var(${name})`, decls);
const ratio = (decls: Decls, fg: string, bg: string, ground = '--surface') =>
  contrastRatio(tok(decls, fg), tok(decls, bg), tok(decls, ground));

describe('design tokens parse', () => {
  it('finds the core tokens in both themes', () => {
    for (const decls of Object.values(themes)) {
      for (const name of ['--background', '--surface', '--surface-muted', '--text-900', '--text-600', '--text-500', '--primary-500', '--primary-600']) {
        expect(() => parseColor(tok(decls, name))).not.toThrow();
      }
    }
    // Sanity: the dark theme really is dark.
    expect(tok(dark, '--background').toLowerCase()).not.toBe(tok(light, '--background').toLowerCase());
  });
});

describe.each(Object.entries(themes))('%s theme', (_theme, decls) => {
  // Body text, secondary text and muted metadata: all carry real content.
  // (--text-300 is decorative only — rules, disabled glyphs — and excluded.)
  const TEXT = [
    '--text-900', '--text-800', '--text-700', '--text-600', '--text-500', '--text-400', '--text-muted',
    // Status text (the -500 hues are fills/icons; text uses the -ink step).
    '--danger-ink', '--success-ink', '--warning-ink',
  ];
  const GROUNDS = ['--background', '--surface', '--surface-muted'];

  it.each(TEXT.flatMap((fg) => GROUNDS.map((bg) => [fg, bg] as const)))('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(ratio(decls, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['danger', 'success', 'warning'])('%s ink reads on its own soft wash', (status) => {
    expect(ratio(decls, `--${status}-ink`, `--${status}-50`)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the focus ring (primary-500 outline) is ≥ 3:1 against the page and cards', () => {
    for (const bg of ['--background', '--surface']) {
      expect(ratio(decls, '--primary-500', bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe('links and filled actions', () => {
  it('light: link ink (primary-600) reads on page and cards', () => {
    for (const bg of ['--background', '--surface', '--surface-muted']) {
      expect(ratio(light, '--primary-600', bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('dark: link ink (primary-500 / primary-700 lighter end) reads on page and cards', () => {
    for (const fg of ['--primary-500', '--primary-700']) {
      for (const bg of ['--background', '--surface']) {
        expect(ratio(dark, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it('white labels on the filled azure button ground (light primary-500, dark pf fill primary-600)', () => {
    expect(contrastRatio('#ffffff', tok(light, '--primary-500'))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio('#ffffff', tok(light, '--primary-600'))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio('#ffffff', tok(pfDark, '--pf-fill'))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('pf-* tones (ink on its own fill, composited over the card surface)', () => {
  const TONES = ['azure', 'amber', 'emerald', 'rose', 'violet', 'slate'];
  it.each(TONES)('light %s', (tone) => {
    expect(ratio(pfLight, `--t-${tone}-ink`, `--t-${tone}-fill`)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it.each(TONES)('dark %s', (tone) => {
    expect(ratio(pfDark, `--t-${tone}-ink`, `--t-${tone}-fill`)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it('pf eyebrow + accent ink read on the card in both themes', () => {
    for (const decls of [pfLight, pfDark]) {
      expect(ratio(decls, '--text-600', '--surface')).toBeGreaterThanOrEqual(AA_TEXT);
      expect(ratio(decls, '--pf-accent-ink', '--surface')).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('Arène night (body.arena-night remaps the tokens)', () => {
  const night: Decls = { ...light };
  collect(read('styles/arenaNight.css'), 'body.arena-night', night);
  it.each(['--text-900', '--text-700', '--text-600', '--text-500', '--text-400', '--danger-ink', '--success-ink', '--warning-ink'])(
    '%s reads on the night surface and ground',
    (fg) => {
      for (const bg of ['--surface', '--background']) {
        expect(ratio(night, fg, bg, '--background')).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );
});

describe('contrast helper', () => {
  it('matches known WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
    // A translucent fill is composited over its ground before measuring.
    expect(contrastRatio('#ffffff', 'rgba(0,0,0,0.5)', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#808080'), 1);
    expect(contrastRatio('#000', 'color-mix(in srgb, #000000 50%, #ffffff)')).toBeCloseTo(contrastRatio('#000', '#808080'), 1);
  });
});
