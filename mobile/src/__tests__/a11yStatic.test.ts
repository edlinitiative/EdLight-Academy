/**
 * Static accessibility guards over mobile/src, using the TypeScript compiler
 * API (no regex over JSX — `onPress={() => …}` contains a `>`).
 *
 *  1. Every touchable with an onPress declares an accessibilityRole, so
 *     VoiceOver/TalkBack announce it as a control. Spread props are exempt
 *     (the role is forwarded from the caller, e.g. ui/Button → PressableScale).
 *  2. Every file that animates (Reanimated timing/spring/repeat, entering
 *     layout animations, RN Animated loops/sequences) references Reduce Motion.
 *
 * If this fails, fix the component — see docs/design/ui-foundations.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const SRC = path.resolve(__dirname, '..');
const TOUCHABLES = new Set(['TouchableOpacity', 'Pressable', 'PressableScale', 'TouchableHighlight', 'TouchableWithoutFeedback']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out);
    } else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);

function touchablesMissingRole(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const misses: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (TOUCHABLES.has(tag)) {
        const props = n.attributes.properties;
        const names = new Set(props.map((p) => (ts.isJsxAttribute(p) ? p.name.getText(sf) : '...')));
        if (names.has('onPress') && !names.has('...') && !names.has('accessibilityRole') && !names.has('role')) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          misses.push(`${path.relative(SRC, file)}:${line} <${tag}>`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return misses;
}

const ANIMATES = /\b(withRepeat|withSpring|withTiming|withSequence|withDelay)\s*\(|\bentering=\{|\bAnimated\.(loop|timing|spring|sequence)\s*\(/;
const REDUCE = /useReduceMotion|useReducedMotion|isReduceMotionEnabled|isReduceMotionOn|ReduceMotion|reduceMotion/;

describe('mobile accessibility guards', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every touchable with onPress has an accessibilityRole', () => {
    const misses = files.flatMap(touchablesMissingRole);
    expect(misses).toEqual([]);
  });

  it('every animating file honours Reduce Motion', () => {
    const misses = files.filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return ANIMATES.test(s) && !REDUCE.test(s);
    }).map((f) => path.relative(SRC, f));
    expect(misses).toEqual([]);
  });
});
