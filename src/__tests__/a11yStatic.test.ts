/**
 * Static accessibility guards for the web app — cheap, whole-codebase rules
 * that a render test cannot see (it only renders one screen at a time).
 * Each rule encodes a defect we actually found and fixed; see
 * docs/design/ui-foundations.md (a11y checklist).
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC = path.join(__dirname, '..');

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(__tests__|node_modules|dataconnect-generated)$/.test(e.name)) walk(p, ext, out);
    } else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(SRC, p);
const tsxFiles = walk(SRC, /\.tsx$/);
const cssFiles = walk(SRC, /\.css$/);

type Jsx = { file: string; line: number; tag: string; attrs: Map<string, string> };

/** Every JSX opening element with its attribute names (spreads recorded as '...'). */
function jsxElements(): Jsx[] {
  const out: Jsx[] = [];
  for (const file of tsxFiles) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = new Map<string, string>();
        for (const p of n.attributes.properties) {
          if (ts.isJsxAttribute(p)) attrs.set(p.name.getText(sf), p.initializer ? p.initializer.getText(sf) : 'true');
          else attrs.set('...', '');
        }
        out.push({ file: rel(file), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, tag: n.tagName.getText(sf), attrs });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const elements = jsxElements();

describe('web a11y static guards', () => {
  it('custom role="button" elements are keyboard-operable (tabIndex + onKeyDown)', () => {
    const bad = elements
      .filter((e) => /^["']button["']$/.test(e.attrs.get('role') || '') && !e.attrs.has('...'))
      .filter((e) => !(e.attrs.has('tabIndex') && (e.attrs.has('onKeyDown') || e.attrs.has('onKeyUp'))))
      .map((e) => `${e.file}:${e.line}`);
    expect(bad).toEqual([]);
  });

  it('pages rendered inside Layout do not add a second <main> landmark', () => {
    // Standalone routes (no Layout) may own their <main>.
    const STANDALONE = new Set([
      'components/Layout.tsx',
      'components/AdminLayout.tsx',
      'pages/ArenaClaim.tsx',
      'pages/competition/CompetitionProjector.tsx',
      'pages/competition/CompetitionProjectorView.tsx',
      'pages/suivi/Suivi.tsx',
    ]);
    const bad = elements.filter((e) => e.tag === 'main' && !STANDALONE.has(e.file)).map((e) => `${e.file}:${e.line}`);
    expect(bad).toEqual([]);
  });

  it('toggle chips / segmented buttons expose their state', () => {
    // A button styled as a chip/segment/tab that changes an "is-on"/"--active"
    // class must also say so to assistive tech.
    const bad = elements
      .filter((e) => e.tag === 'button' && !e.attrs.has('...'))
      .filter((e) => /(is-on|--active|--selected)/.test(e.attrs.get('className') || ''))
      .filter((e) => !['aria-pressed', 'aria-selected', 'aria-checked', 'aria-current', 'aria-expanded'].some((a) => e.attrs.has(a)))
      .map((e) => `${e.file}:${e.line}`);
    expect(bad).toEqual([]);
  });

  it('no CSS rule removes the focus outline without a visible replacement', () => {
    const bad: string[] = [];
    for (const file of cssFiles) {
      const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const sel = m[1].trim();
        const body = m[2];
        if (!/:focus(?!-within)/.test(sel) || !/outline\s*:\s*(none|0)\b/.test(body)) continue;
        // A replacement indicator in the same rule.
        if (/box-shadow\s*:\s*(?!none)|border-color|background|text-decoration|outline-color|border\s*:/.test(body)) continue;
        // Programmatic focus targets (headings, dialogs, tabindex=-1 regions) are not tab stops.
        if (/h[1-6]\b|tabindex="-1"|heading|title|question|headline|sheet|review|__panel|dialog|modal/i.test(sel)) continue;
        // Inputs whose wrapper draws the ring via :focus-within.
        const wrapper = sel.replace(/\s+(input|textarea|select)(:focus)?$|__input:focus$/, '');
        if (wrapper !== sel || /input:focus$/.test(sel)) {
          const base = sel.split(/\s+/)[0].replace(/__input:focus$/, '').replace(/:focus$/, '');
          if (new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*:focus-within`).test(css)) continue;
        }
        bad.push(`${rel(file)}:${css.slice(0, m.index).split('\n').length} ${sel.replace(/\s+/g, ' ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('honours prefers-reduced-motion globally', () => {
    const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/animation-duration:\s*0\.0+1ms\s*!important/);
    expect(block![1]).toMatch(/transition-duration:\s*0\.0+1ms\s*!important/);
  });

  it('keeps a skip link and the single main landmark in Layout', () => {
    const layout = fs.readFileSync(path.join(SRC, 'components/Layout.tsx'), 'utf8');
    expect(layout).toMatch(/href="#main-content"/);
    expect(layout).toMatch(/<main id="main-content"/);
  });

  it('no thick colored left-border accent stripes (design rule)', () => {
    const bad: string[] = [];
    for (const file of cssFiles) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/border-left\s*:\s*[2-9]px\s+solid/.test(line)) bad.push(`${rel(file)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
