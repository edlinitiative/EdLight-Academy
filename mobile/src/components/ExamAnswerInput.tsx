import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MathText from './MathText';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';

/**
 * Answer inputs for open exam questions, mirroring the PWA (src/pages/ExamTake.tsx):
 *  - WordCountAnswer: essay / short_answer textarea + "X mots · minimum Y" helper
 *    (same word constants as the PWA).
 *  - ExamAnswerInput: fill_blank / calculation / open input with an optional
 *    math symbol-chip row and a live MathText preview when the value contains
 *    LaTeX markers.
 */

// ── Word-count constants (mirror the PWA's ExamTake.jsx) ─────────────────────
export const ESSAY_MIN_WORDS = 50;
export const ESSAY_TARGET_WORDS = 130;
export const SHORT_ANSWER_MIN_WORDS = 5;
export const SHORT_ANSWER_TARGET_WORDS = 25;

// ── Math detection helpers ───────────────────────────────────────────────────

/** Bare LaTeX / math markers in an authored string (mirrors the PWA). */
export const MATH_MARK_RE = /[\\${}^]/;

/** Digits combined with operators, e.g. "2x + 3 = 7". */
const DIGIT_OP_RE = /\d\s*[+\-*/×÷=<>≤≥^]/;

/** Whether any of the given strings looks like it contains math notation. */
export function looksMathy(...texts: (string | null | undefined)[]): boolean {
  return texts.some(
    (t) => typeof t === 'string' && (MATH_MARK_RE.test(t) || DIGIT_OP_RE.test(t)),
  );
}

/** The current answer contains LaTeX markers → worth showing a live preview. */
export function hasLatexMarkers(value: string): boolean {
  return /[$\\]/.test(String(value ?? ''));
}

/**
 * Display-only cleanup of a LaTeX-ish string for native Text (option chips):
 * strips $ delimiters and swaps the common commands for their unicode glyphs.
 */
export function prettifyMath(s: string): string {
  return String(s ?? '')
    .replace(/\$\$?/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\cup\b/g, '∪')
    .replace(/\\cap\b/g, '∩')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\ne\b/g, '≠')
    .replace(/\\leq\b/g, '≤')
    .replace(/\\le\b/g, '≤')
    .replace(/\\geq\b/g, '≥')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\pm\b/g, '±')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\sqrt\b/g, '√')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Math symbol chips ────────────────────────────────────────────────────────

const MATH_CHARS = ['²', '³', '√', 'π', '÷', '×', '±', '≤', '≥', '≠', '∞', '/', '(', ')'];

export function MathChips({ onInsert }: { onInsert: (char: string) => void }) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
    >
      {MATH_CHARS.map((c) => (
        <TouchableOpacity
          key={c}
          onPress={() => onInsert(c)}
          hitSlop={{ top: 6, bottom: 6 }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 15, color: colors.ink }}>{c}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Live LaTeX preview ───────────────────────────────────────────────────────

export function MathPreview({ value }: { value: string }) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  if (!hasLatexMarkers(value)) return null;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 4,
        }}
      >
        {t('Aperçu', 'Apèsi')}
      </Text>
      <MathText text={value} style={{ fontSize: 15, color: colors.ink }} />
    </View>
  );
}

// ── Essay / short answer with word-count helper ──────────────────────────────

export function countWords(value: string): number {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function WordCountAnswer({ value, onChangeText, type }: {
  value: string;
  onChangeText: (v: string) => void;
  type: 'essay' | 'short_answer';
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const isShort = type === 'short_answer';
  const minWords = isShort ? SHORT_ANSWER_MIN_WORDS : ESSAY_MIN_WORDS;
  const targetWords = isShort ? SHORT_ANSWER_TARGET_WORDS : ESSAY_TARGET_WORDS;
  const wc = countWords(value);
  const reachedMin = wc >= minWords;
  const inputStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  } as const;
  const cardShadow = {
    shadowColor: colors.azureDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  } as const;

  return (
    <View style={{ gap: 6 }}>
      <TextInput
        style={[inputStyle, cardShadow, { minHeight: isShort ? 100 : 140 }]}
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
        placeholder={t('Rédigez votre réponse…', 'Ekri repons ou…')}
        placeholderTextColor={colors.faint}
      />
      <Text style={{ fontSize: 12, color: reachedMin ? colors.success : colors.muted, paddingLeft: 4 }}>
        {wc} {t(wc !== 1 ? 'mots' : 'mot', 'mo')} · {t('minimum', 'minimòm')} {minWords}
        {reachedMin && wc < targetWords ? ` · ${t('visez', 'vize')} ~${targetWords}` : ''}
      </Text>
    </View>
  );
}

// ── Open / fill_blank / calculation input ────────────────────────────────────

export default function ExamAnswerInput({
  value,
  onChangeText,
  placeholder,
  minHeight = 100,
  mathy = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  mathy?: boolean;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const inputStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  } as const;
  const cardShadow = {
    shadowColor: colors.azureDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  } as const;
  return (
    <View style={{ gap: 8 }}>
      {mathy ? <MathChips onInsert={(c) => onChangeText(value + c)} /> : null}
      <TextInput
        style={[inputStyle, cardShadow, { minHeight }]}
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
        placeholder={placeholder ?? t('Votre réponse…', 'Repons ou…')}
        placeholderTextColor={colors.faint}
      />
      <MathPreview value={value} />
    </View>
  );
}
