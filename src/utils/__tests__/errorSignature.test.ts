import {
  classifyError,
  createErrorGate,
  describeError,
  normalizeErrorMessage,
  topFrameOf,
  SIGNATURE_PATTERN,
} from '../../../shared/errorSignature';
import { sanitizeDiagnostic } from '../../../shared/telemetry';

const PII = [
  'jean.pierre@example.com',
  'https://academy.edlight.org/defi/ABC123?token=secret',
  'aB3dE5fG7hI9jK1lM3nO5pQ7', // uid-like
  '0f8fad5b-d9cb-469f-a165-70867728950e',
  '50934567890', // phone-like
];

describe('normalizeErrorMessage', () => {
  it('strips urls, emails, ids, numbers and quoted text', () => {
    const raw = `Failed for ${PII[0]} at ${PII[1]} uid=${PII[2]} req ${PII[3]} tel ${PII[4]} answer "Port-au-Prince"`;
    const out = normalizeErrorMessage(raw);
    for (const secret of [...PII, 'Port-au-Prince', 'secret', 'jean']) expect(out).not.toContain(secret.toLowerCase());
    expect(out).toContain('<email>');
    expect(out).toContain('<url>');
    expect(out).toContain('<str>');
  });

  it('maps the same failure with different data to the same template', () => {
    expect(normalizeErrorMessage("Cannot read property 'x' of undefined (user 123)"))
      .toBe(normalizeErrorMessage("Cannot read property 'y' of undefined (user 98765)"));
  });
});

describe('describeError', () => {
  const stack = [
    'TypeError: Cannot read property of undefined for jean.pierre@example.com',
    '    at render (https://academy.edlight.org/js/main.abc123.js:2:34567)',
    '    at foo (https://academy.edlight.org/js/vendor.js:1:2)',
  ].join('\n');

  it('produces a stable 8-hex signature, a kind and the top frame only', () => {
    const e = Object.assign(new TypeError('Cannot read property of undefined for jean.pierre@example.com'), { stack });
    const d = describeError(e);
    expect(d.signature).toMatch(SIGNATURE_PATTERN);
    expect(d.errorKind).toBe('undefined_access');
    expect(d.topFrame).toBe('main.abc123.js:2:34567');
    expect(d.name).toBe('TypeError');
    expect(JSON.stringify(d)).not.toMatch(/jean|example|academy\.edlight/);
    // Same failure for another student → same signature.
    const other = Object.assign(new TypeError('Cannot read property of undefined for marie@example.org'), { stack });
    expect(describeError(other).signature).toBe(d.signature);
    // A different location → a different signature.
    const elsewhere = Object.assign(new TypeError(e.message), { stack: stack.replace('2:34567', '9:1') });
    expect(describeError(elsewhere).signature).not.toBe(d.signature);
  });

  it('never throws on exotic values', () => {
    for (const v of [null, undefined, 42, 'boom', {}, { name: 5 }, Object.create(null)]) {
      expect(describeError(v).signature).toMatch(SIGNATURE_PATTERN);
    }
  });

  it('reads Hermes and iOS bundle frames, and hides hashed OTA file names', () => {
    expect(topFrameOf('Error: x\n    at f (address at index.android.bundle:1:9876)')).toBe('index.android.bundle:1:9876');
    expect(topFrameOf('Error: x\n    at f (main.jsbundle:1:42)')).toBe('main.jsbundle:1:42');
    expect(topFrameOf('Error: x\n    at f (/data/user/0/app/files/.expo-internal/7f3a9c:1:5)')).toBe('bundle:1:5');
    expect(topFrameOf(undefined)).toBeNull();
  });

  it('classifies from a fixed vocabulary', () => {
    expect(classifyError('ChunkLoadError', 'Loading chunk 12 failed')).toBe('chunk_load');
    expect(classifyError('TypeError', 'Failed to fetch dynamically imported module: https://x/y.js')).toBe('chunk_load');
    expect(classifyError('TypeError', 'Network request failed')).toBe('network');
    expect(classifyError('Error', 'something private happened')).toBe('unknown');
  });
});

describe('createErrorGate', () => {
  it('admits each signature at most 3 times and 30 errors per session', () => {
    const gate = createErrorGate();
    expect([1, 2, 3, 4].map(() => gate.admit('aaaaaaaa'))).toEqual([1, 2, 3, null]);
    let admitted = 3;
    for (let i = 0; i < 100; i++) if (gate.admit(`s${i}`) != null) admitted += 1;
    expect(admitted).toBe(30);
    gate.reset();
    expect(gate.admit('aaaaaaaa')).toBe(1);
  });
});

describe('wire allowlist (client and server sanitizer)', () => {
  it('keeps the crash keys deliberately added, and still drops messages and unknown keys', () => {
    const clean = sanitizeDiagnostic({
      type: 'error', name: 'js_fatal_crash', timestamp: 1,
      error: { name: 'TypeError', message: 'secret answer', stack: 'TypeError: secret\n    at a (main.jsbundle:1:42)' },
      detail: {
        signature: 'deadbeef', errorKind: 'undefined_access', topFrame: 'main.jsbundle:1:42', screen: 'LessonDetail',
        boundary: 'Courses', occurrence: 2, previousSession: true, fatal: true,
        message: 'secret answer', email: 'a@b.co', screenPath: '/courses/abc',
      },
      context: { platform: 'ios', updateGroup: 'grp-1', osVersion: '17.4.1', deviceName: 'Jean iPhone' },
    });
    expect(clean?.detail).toEqual({
      signature: 'deadbeef', errorKind: 'undefined_access', topFrame: 'main.jsbundle:1:42', screen: 'LessonDetail',
      boundary: 'Courses', occurrence: 2, previousSession: true, fatal: true,
    });
    expect(clean?.context).toEqual({ platform: 'ios', updateGroup: 'grp-1', osVersion: '17.4.1' });
    expect(clean?.error).toEqual({ name: 'TypeError', frames: ['main.jsbundle:1:42'] });
    expect(JSON.stringify(clean)).not.toMatch(/secret|a@b|Jean/);
  });
});
