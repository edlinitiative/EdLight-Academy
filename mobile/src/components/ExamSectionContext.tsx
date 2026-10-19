import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import MathText from './MathText';

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
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Instructions longer than this hold an embedded reading text — render them in
// the capped scrollable card instead of inline, so the question stays on screen.
const LONG_INSTRUCTIONS = 280;

function PassageCard({ passage, label = 'Texte à lire' }: { passage: string; label?: string }) {
  const colors = useColors();
  const { shadow, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          maxHeight: 240,
          overflow: 'hidden',
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12 }}>
        <BookOpen color={colors.azureInk} size={14} />
        <Text style={[typeScale.overline, { color: colors.muted }]}>
          {label}
        </Text>
      </View>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={{ maxHeight: 200 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14 }}
      >
        <MathText text={passage} style={[typeScale.body, { lineHeight: 22, color: colors.muted }]} />
      </ScrollView>
    </View>
  );
}

/**
 * Section context shown above each question — the web's SectionHeader +
 * ReadingPassage (src/pages/ExamTake.tsx), on every question of the section:
 *
 * - a slim title row, with the SHORT instructions (≤ 200 chars) open under it
 *   by default and a chevron to fold them away;
 * - long instructions (an embedded reading text) or the section's passage in
 *   an always-visible, height-capped card.
 *
 * It used to hide the instructions behind a collapsed "Consignes" chip even on
 * the section's first question, so the actual task ("Recopier et compléter
 * judicieusement les phrases suivantes") was invisible, and it announced each
 * section with a heavy "NOUVELLE SECTION" card the web never had.
 */
const SHORT_INSTRUCTIONS = 200;

export default function ExamSectionContext({
  title,
  instructions,
  passage,
}: {
  title: string;
  instructions?: string | null;
  passage?: string | null;
  /** Kept for callers; the header now reads the same on every question. */
  isSectionStart?: boolean;
}) {
  const colors = useColors();
  const [collapsed, setCollapsed] = useState(false);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const safeTitle = cleanExamText(title);
  const safeInstructions = cleanExamText(instructions);
  const safePassage = cleanExamText(passage);
  const shortInstructions = safeInstructions && safeInstructions.length <= SHORT_INSTRUCTIONS ? safeInstructions : '';
  const panelText = safePassage || (safeInstructions.length > SHORT_INSTRUCTIONS ? safeInstructions : '');

  if (!safeTitle && !safeInstructions && !safePassage) return null;

  const { numeral, name } = parseSectionTitle(safeTitle);
  const displayTitle = numeral ? t(`Section ${numeral} · ${name}`, `Seksyon ${numeral} · ${name}`) : safeTitle;

  return (
    <View style={{ marginBottom: 16, gap: 10 }}>
      {safeTitle ? (
        <TouchableOpacity
          activeOpacity={shortInstructions ? 0.6 : 1}
          disabled={!shortInstructions}
          onPress={() => setCollapsed((c) => !c)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}
          accessibilityRole={shortInstructions ? 'button' : 'header'}
          accessibilityState={shortInstructions ? { expanded: !collapsed } : undefined}
          accessibilityLabel={shortInstructions
            ? `${displayTitle}. ${collapsed ? t('Afficher les instructions', 'Montre konsiy yo') : t('Masquer les instructions', 'Kache konsiy yo')}`
            : displayTitle}
        >
          <Text style={[typeScale.titleSm, { flex: 1, color: colors.ink, fontFamily: fonts.headingBold }]}>{displayTitle}</Text>
          {shortInstructions
            ? (collapsed ? <ChevronDown color={colors.muted} size={18} /> : <ChevronUp color={colors.muted} size={18} />)
            : null}
        </TouchableOpacity>
      ) : null}

      {shortInstructions && !collapsed ? (
        <MathText text={shortInstructions} style={[typeScale.bodyMd, { lineHeight: 22, color: colors.muted }]} />
      ) : null}

      {panelText ? (
        <PassageCard
          passage={panelText}
          label={safePassage ? t('Texte à lire', 'Tèks pou li') : t('Consignes et texte', 'Konsiy ak tèks')}
        />
      ) : null}
    </View>
  );
}
