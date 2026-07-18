import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react-native';
import useStore from '../contexts/store';

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

/**
 * "I- Compétence Linguistique" → { numeral: 'I', name: 'Compétence Linguistique' }
 * Falls back to the raw title when no numeral prefix is found.
 */
function parseSectionTitle(raw: string): { numeral: string; name: string } {
  const m = /^\s*(?:section\s+)?([IVXLC]+|\d+)\s*[-–—.:)]\s*(.+)$/i.exec(raw);
  if (m && m[2]) return { numeral: m[1].toUpperCase(), name: m[2].trim() };
  return { numeral: '', name: raw.trim() };
}

/**
 * Exam text arrives with light markup (<br> tags, **bold** markers) that RN
 * Text renders literally — strip it to plain readable text.
 */
function cleanExamText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Instructions longer than this hold an embedded reading text — render them in
// the capped scrollable card instead of inline, so the question stays on screen.
const LONG_INSTRUCTIONS = 280;

function PassageCard({ passage, label = 'Texte à lire' }: { passage: string; label?: string }) {
  return (
    <View
      style={[
        {
          backgroundColor: '#ffffff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: BORDER,
          maxHeight: 240,
          overflow: 'hidden',
        },
        cardShadow,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12 }}>
        <BookOpen color={PRIMARY} size={14} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {label}
        </Text>
      </View>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={{ maxHeight: 200 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14 }}
      >
        <Text style={{ fontSize: 15, lineHeight: 22, color: '#334155' }}>{passage}</Text>
      </ScrollView>
    </View>
  );
}

/**
 * Section context shown above each question.
 *
 * - First question of a section → prominent intro block: title + instructions
 *   + (if present) the reading passage in a height-capped scrollable card.
 * - Following questions of the same section → compact one-line chip with a
 *   "Consignes" toggle that re-expands instructions + passage on demand.
 */
export default function ExamSectionContext({
  title,
  instructions,
  passage,
  isSectionStart,
}: {
  title: string;
  instructions?: string | null;
  passage?: string | null;
  isSectionStart: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const safeTitle = cleanExamText(title);
  const safeInstructions = cleanExamText(instructions);
  const safePassage = cleanExamText(passage);
  const longInstructions = safeInstructions.length > LONG_INSTRUCTIONS;

  if (!safeTitle && !safeInstructions && !safePassage) return null;

  const { numeral, name } = parseSectionTitle(safeTitle);
  const displayTitle = numeral ? t(`Section ${numeral} — ${name}`, `Seksyon ${numeral} — ${name}`) : safeTitle;

  // ── Section intro (first question of the section) ──────────────────────────
  // Title stays prominent; the consignes (often long, generic exam-wide rules)
  // are behind a collapsed "Consignes" toggle so they never push the question
  // off-screen. Any reading passage stays visible (students need to read it).
  if (isSectionStart) {
    return (
      <View style={{ marginBottom: 16, gap: 10 }}>
        <View
          style={[
            {
              backgroundColor: '#ffffff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BORDER,
              padding: 16,
            },
            cardShadow,
          ]}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            {t('Nouvelle section', 'Nouvo seksyon')}
          </Text>
          {safeTitle ? (
            <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT, lineHeight: 23 }}>
              {displayTitle}
            </Text>
          ) : null}

          {safeInstructions ? (
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 12,
                alignSelf: 'flex-start',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: '#f8fafc',
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>{t('Consignes', 'Konsiy')}</Text>
              {expanded ? <ChevronUp color={PRIMARY} size={14} /> : <ChevronDown color={PRIMARY} size={14} />}
            </TouchableOpacity>
          ) : null}

          {expanded && safeInstructions && !longInstructions ? (
            <Text style={{ fontSize: 14, lineHeight: 21, color: '#334155', marginTop: 12 }}>
              {safeInstructions}
            </Text>
          ) : null}
        </View>

        {expanded && safeInstructions && longInstructions ? (
          <PassageCard passage={safeInstructions} label={t('Consignes et texte', 'Konsiy ak tèks')} />
        ) : null}
        {safePassage ? <PassageCard passage={safePassage} label={t('Texte à lire', 'Tèks pou li')} /> : null}
      </View>
    );
  }

  // ── Compact version (subsequent questions of the same section) ─────────────
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: '#e6f0f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: PRIMARY }} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        {safeInstructions || safePassage ? (
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: BORDER,
              backgroundColor: '#ffffff',
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>{t('Consignes', 'Konsiy')}</Text>
            {expanded ? <ChevronUp color={MUTED} size={13} /> : <ChevronDown color={MUTED} size={13} />}
          </TouchableOpacity>
        ) : null}
      </View>

      {expanded ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          {safeInstructions && longInstructions ? (
            <PassageCard passage={safeInstructions} label={t('Consignes et texte', 'Konsiy ak tèks')} />
          ) : safeInstructions ? (
            <View
              style={[
                {
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: BORDER,
                  padding: 14,
                },
                cardShadow,
              ]}
            >
              <Text style={{ fontSize: 14, lineHeight: 21, color: '#334155' }}>{safeInstructions}</Text>
            </View>
          ) : null}
          {safePassage ? <PassageCard passage={safePassage} label={t('Texte à lire', 'Tèks pou li')} /> : null}
        </View>
      ) : null}
    </View>
  );
}
