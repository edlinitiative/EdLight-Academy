import React, { useMemo } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import MathText from './MathText';
import {
  MathChips,
  MathPreview,
  hasLatexMarkers,
  looksMathy,
  prettifyMath,
} from './ExamAnswerInput';

/**
 * Simplified native port of the PWA's ScaffoldedAnswer (src/pages/ExamTake.tsx):
 * shows the authored solution text with each `{{n}}` blank marker rendered as a
 * circled number (①②③…), then one labeled row per blank — option chips when
 * the blank ships `options` (answer_parts kind: "dropdown"), otherwise a text
 * input with math symbol chips + live LaTeX preview when the blank looks mathy.
 *
 * Answers are persisted as JSON.stringify({ scaffold: [...values] }) — the
 * exact payload the existing grader (utils/examUtils.gradeScaffoldAnswer)
 * and the PWA already understand, so autosave/submit shapes stay intact.
 */

const PRIMARY = '#0857A6';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e8edf5';

const cardShadow = {
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
} as const;

const card = {
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 16,
} as const;

// ── Scaffold routing logic (faithful port of the PWA) ────────────────────────

/** Subjects that benefit from math input (formulas, equations, symbols). */
export const MATH_SUBJECTS = new Set([
  'Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique',
]);

/** Native-widget types that keep their own input even when scaffold data exists. */
const NATIVE_INPUT_TYPES = new Set(['multiple_choice', 'multiple_select', 'true_false', 'matching']);

/** A scaffold_blanks array we can actually render (guards odd data). */
function scaffoldDataOk(q: any): boolean {
  if (typeof q?.scaffold_text !== 'string' || !q.scaffold_text.trim()) return false;
  if (!Array.isArray(q?.scaffold_blanks) || q.scaffold_blanks.length === 0) return false;
  return q.scaffold_blanks.every((b: any) => b == null || typeof b === 'object' || typeof b === 'string');
}

/**
 * Should this question render the step-by-step ScaffoldAnswer?
 * Port of the PWA's usesScaffold, including the `scaffold_ready` authoritative
 * override and the NATIVE_INPUT_TYPES / essay exclusions, plus a data-shape
 * guard so odd scaffold payloads fall back to the plain input.
 */
export function usesScaffold(q: any, subject: string): boolean {
  if (!q) return false;
  if (q.type === 'essay') return false;
  if (NATIVE_INPUT_TYPES.has(q.type)) return false;
  if (!q.scaffold_text || !q.scaffold_blanks) return false;
  if (!scaffoldDataOk(q)) return false;
  if (typeof q.scaffold_ready === 'boolean') return q.scaffold_ready;
  if (q.type === 'short_answer') return false;
  return !q.correct || MATH_SUBJECTS.has(subject);
}

/** Bare LaTeX / math markers in an authored answer string. */
const MATH_MARK_RE = /[\\${}^]/;

/**
 * Whether a scaffold question's blanks should get math input. Port of the
 * PWA's scaffoldNeedsMath: subject alone is too coarse (a biology definition
 * doesn't need a math keyboard), so we require actual math notation in the
 * authored answer data.
 */
export function scaffoldNeedsMath(q: any, subject: string): boolean {
  if (!q || !subject || !MATH_SUBJECTS.has(subject)) return false;
  const parts = (q.answer_parts && q.answer_parts.length)
    ? q.answer_parts
    : (q.scaffold_blanks || []);
  for (const p of parts) {
    if (!p) continue;
    if (p.kind === 'number') return true;
    if (Array.isArray(p.slots) && p.slots.length > 0) return true; // inline math template
    if (p.matrix) return true;
    if (typeof p.answer === 'string' && MATH_MARK_RE.test(p.answer)) return true;
    if (Array.isArray(p.alternatives) && p.alternatives.some((a: any) => MATH_MARK_RE.test(String(a)))) return true;
  }
  // Authored solution text with LaTeX delimiters / commands.
  if (typeof q.scaffold_text === 'string' && /\$[^$]*\$|\\[a-zA-Z]+/.test(q.scaffold_text)) return true;
  return false;
}

// ── Marker rendering ─────────────────────────────────────────────────────────

/** ① ② ③ … (falls back to (n) past ⑳). */
function circled(i: number): string {
  return i >= 0 && i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`;
}

const MARKER_RE = /(\{\{\d+\}\}|\[\[\d+\]\])/;

/** Circled number for a single marker token, or null if not a marker. */
function markerToCircle(token: string): string | null {
  let m = /^\{\{(\d+)\}\}$/.exec(token);
  if (m) return circled(Number(m[1])); // {{n}} is 0-indexed in real data
  m = /^\[\[(\d+)\]\]$/.exec(token);
  if (m) return circled(Number(m[1]) - 1); // [[n]] is 1-indexed
  return null;
}

/**
 * Replace blank markers in the authored scaffold text with circled numbers.
 * Real data uses `{{n}}` (0-indexed), sometimes *inside* `$…$` segments — a
 * circled digit would make KaTeX choke, so markers are lifted out of the math
 * and the remaining fragments re-wrapped in delimiters. `[[n]]` (1-indexed)
 * and `___` runs are handled defensively.
 */
function markScaffoldText(text: string): string {
  const src = String(text ?? '');
  const hasMarkers = MARKER_RE.test(src);
  let seq = 0; // sequential counter for bare ___ blanks

  const out = src
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((seg) => {
      const isMath = /^\$[\s\S]*\$$/.test(seg);
      if (isMath) {
        if (!MARKER_RE.test(seg)) return seg;
        const delim = seg.startsWith('$$') ? '$$' : '$';
        const inner = seg.slice(delim.length, seg.length - delim.length);
        return inner
          .split(new RegExp(MARKER_RE.source, 'g'))
          .map((piece) => {
            const circle = markerToCircle(piece);
            if (circle) return ` ${circle} `;
            return piece.trim() ? `${delim}${piece}${delim}` : '';
          })
          .join('');
      }
      // Plain prose: swap markers in place; treat ___ runs as sequential
      // blanks only when the text has no explicit markers.
      let plain = seg
        .replace(/\{\{(\d+)\}\}/g, (_, n) => circled(Number(n)))
        .replace(/\[\[(\d+)\]\]/g, (_, n) => circled(Number(n) - 1));
      if (!hasMarkers) plain = plain.replace(/_{3,}/g, () => circled(seq++));
      return plain;
    })
    .join('');

  return out;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScaffoldAnswer({ question, value, onChange, mathMode = false }: {
  question: any;
  value: string;
  onChange: (v: string) => void;
  mathMode?: boolean;
}) {
  const blanks: any[] = Array.isArray(question?.scaffold_blanks) ? question.scaffold_blanks : [];
  const parts: any[] = Array.isArray(question?.answer_parts) ? question.answer_parts : [];

  // Stored JSON → array of blank values (robust to any non-scaffold payload).
  const values = useMemo<string[]>(() => {
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && Array.isArray(parsed.scaffold)) {
          return blanks.map((_, i) => String(parsed.scaffold[i] ?? ''));
        }
      } catch { /* not scaffold JSON yet */ }
    }
    return blanks.map(() => '');
  }, [value, blanks]);

  const setBlank = (idx: number, val: string) => {
    const next = [...values];
    next[idx] = val;
    // Keep the "unanswered" semantics of the nav dots: all-empty → ''.
    onChange(next.some((v) => v.trim()) ? JSON.stringify({ scaffold: next }) : '');
  };

  const displayText = useMemo(
    () => markScaffoldText(String(question?.scaffold_text ?? '')),
    [question?.scaffold_text],
  );

  if (blanks.length === 0) return null; // usesScaffold() guards this upstream

  return (
    <View style={{ gap: 12 }}>
      {/* Authored solution text with ①②③ markers */}
      <View style={[card, cardShadow, { padding: 16 }]}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: MUTED,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 8,
          }}
        >
          Complète la démarche
        </Text>
        <MathText text={displayText} style={{ fontSize: 15, lineHeight: 23, color: TEXT }} />
      </View>

      {/* One row per blank */}
      {blanks.map((blank, i) => {
        const part = parts[i] && typeof parts[i] === 'object' ? parts[i] : {};
        const rawOptions = Array.isArray(part.options) && part.options.length > 0
          ? part.options
          : Array.isArray(blank?.options) && blank.options.length > 0
            ? blank.options
            : null;
        const label = String(blank?.label ?? part?.label ?? '').trim() || `Étape ${i + 1}`;
        const mathy = mathMode || looksMathy(
          typeof part?.answer === 'string' ? part.answer : undefined,
          typeof blank?.answer === 'string' ? blank.answer : undefined,
        );
        const current = values[i] ?? '';

        return (
          <View key={i} style={[card, cardShadow, { padding: 14, gap: 10 }]}>
            {/* Label row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16, color: PRIMARY }}>{circled(i)}</Text>
              <MathText
                text={label}
                style={{ flex: 1, fontSize: 13, fontWeight: '600', color: TEXT }}
              />
            </View>

            {rawOptions ? (
              // Option chips (answer_parts kind: "dropdown")
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {rawOptions.map((opt: any, oi: number) => {
                  const optValue = String(opt ?? '');
                  const selected = current === optValue;
                  return (
                    <TouchableOpacity
                      key={oi}
                      onPress={() => setBlank(i, selected ? '' : optValue)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: selected ? PRIMARY : BORDER,
                        backgroundColor: selected ? '#eef4fb' : '#ffffff',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: selected ? PRIMARY : TEXT,
                          fontWeight: selected ? '700' : '400',
                        }}
                      >
                        {prettifyMath(optValue) || optValue}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              // Free input, with math chips + live preview when mathy
              <View style={{ gap: 8 }}>
                {mathy ? <MathChips onInsert={(c) => setBlank(i, current + c)} /> : null}
                <TextInput
                  style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 15,
                    color: TEXT,
                  }}
                  value={current}
                  onChangeText={(v) => setBlank(i, v)}
                  placeholder="Votre réponse…"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {hasLatexMarkers(current) ? <MathPreview value={current} /> : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
