import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react-native';

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

  const safeTitle = cleanExamText(title);
  const safeInstructions = cleanExamText(instructions);
  const safePassage = cleanExamText(passage);
  const longInstructions = safeInstructions.length > LONG_INSTRUCTIONS;

  if (!safeTitle && !safeInstructions && !safePassage) return null;

  const { numeral, name } = parseSectionTitle(safeTitle);
  const displayTitle = numeral ? `Section ${numeral} — ${name}` : safeTitle;

  // ── Prominent intro (first question of the section) ────────────────────────
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
            Nouvelle section
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT, lineHeight: 23 }}>
            {displayTitle}
          </Text>
          {safeInstructions && !longInstructions ? (
            <Text style={{ fontSize: 14, lineHeight: 21, color: '#334155', marginTop: 8 }}>
              {safeInstructions}
            </Text>
          ) : null}
        </View>
        {safeInstructions && longInstructions ? (
          <PassageCard passage={safeInstructions} label="Consignes et texte" />
        ) : null}
        {safePassage ? <PassageCard passage={safePassage} /> : null}
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
            <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>Consignes</Text>
            {expanded ? <ChevronUp color={MUTED} size={13} /> : <ChevronDown color={MUTED} size={13} />}
          </TouchableOpacity>
        ) : null}
      </View>

      {expanded ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          {safeInstructions && longInstructions ? (
            <PassageCard passage={safeInstructions} label="Consignes et texte" />
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
          {safePassage ? <PassageCard passage={safePassage} /> : null}
        </View>
      ) : null}
    </View>
  );
}
