/**
 * The Jeux tab's night kit — the small pieces every Jeux screen (hub segments,
 * trivia, duels, arcade games, results) is built from, on the Arène's night
 * (theme/arenaTheme.ts). Same world in light and dark OS mode.
 *
 * Rules carried here so screens cannot drift (DIRECTION §0, §8–9):
 *  - opaque tonal surfaces only (#13243F card, #1C3254 raised) — no borders,
 *    rings, hairlines, glass, glow or gradient;
 *  - ONE coral primary per screen (ArenaButton), marine label;
 *  - gold only for an EARNED result (a score, XP just won, a record);
 *  - sentence case, 14pt floor, no emoji.
 */

import React from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';

export { C as night };

/** "1240" → "1 240" (French thin grouping, never a comma). */
export function groupDigits(n: number | string): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Night type ramp additions (arenaType covers body/status/num). */
export const nightType: Record<'page' | 'section' | 'cardTitle' | 'feature' | 'meta' | 'big', TextStyle> = {
  page: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 37, letterSpacing: -1.2 },
  section: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  feature: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  meta: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  big: { fontFamily: fonts.heading, fontSize: 56, lineHeight: 60, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
};

/** 40h opaque pill with a leading icon — header totals (XP, série). */
export function StatChip({ icon, label, accessibilityLabel }: { icon: React.ReactNode; label: string; accessibilityLabel?: string }) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, height: 40,
        paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.surface,
      }}
    >
      {icon}
      <Text style={[arenaType.name, { fontSize: 15, color: C.ink }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

/** A small opaque pill (status, category, "En direct"). */
export function NightPill({
  label, tone = 'plain', icon, style,
}: { label: string; tone?: 'plain' | 'coral' | 'gold' | 'success' | 'deep'; icon?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const bg = tone === 'coral' ? '#3A2530' : tone === 'gold' ? C.goldSoft : tone === 'success' ? C.successSoft : tone === 'deep' ? C.bg : C.surface;
  const fg = tone === 'coral' ? C.coral : tone === 'gold' ? C.gold : tone === 'success' ? C.success : C.ink;
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: bg,
    }, style]}>
      {icon}
      <Text style={[arenaType.status, { fontFamily: fonts.bold, color: fg }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

/** Section title with an optional right-hand meta ("6 disponibles"). */
export function NightSection({ title, meta, style }: { title: string; meta?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 2, marginTop: 28, marginBottom: 14 }, style]}>
      <Text accessibilityRole="header" style={[nightType.section, { color: C.ink, flexShrink: 1 }]}>{title}</Text>
      {meta ? <Text style={[nightType.meta, { color: C.muted }]}>{meta}</Text> : null}
    </View>
  );
}

/** A tappable row card: leading slot, title, meta, chevron. */
export function NightRow({
  leading, title, meta, trailing, onPress, accessibilityLabel, style, tone = 'plain',
}: {
  leading?: React.ReactNode;
  title: string;
  meta?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  tone?: 'plain' | 'raised';
}) {
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={[nightType.cardTitle, { color: C.ink }]}>{title}</Text>
        {meta ? <Text numberOfLines={2} style={[arenaType.status, { fontSize: 15, lineHeight: 20, color: C.muted }]}>{meta}</Text> : null}
      </View>
      {trailing}
      {onPress ? <ChevronRight color={C.muted} size={20} /> : null}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [{
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72,
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 20,
    backgroundColor: tone === 'raised' ? C.surfaceRaised : C.surface,
  }, style];
  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, meta].filter(Boolean).join('. ')}
      style={rowStyle}
    >
      {body}
    </PressableScale>
  );
}

/** 44px round close / back control on the night. */
export function NightIconButton({
  onPress, label, icon,
}: { onPress: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}
    >
      {icon ?? <X color={C.ink} size={20} />}
    </PressableScale>
  );
}

/** A quiet text link (underlined), for the tertiary action on a screen. */
export function NightLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.97}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
    >
      <Text style={[arenaType.body, { fontFamily: fonts.medium, color: C.inkSoft, textDecorationLine: 'underline' }]}>{label}</Text>
    </PressableScale>
  );
}
