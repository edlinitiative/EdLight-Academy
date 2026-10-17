import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Pattern } from 'react-native-svg';
import Avatar from '../avatars/Avatar';
import SchoolCrest, { schoolColors } from '../crest/SchoolCrest';
import RankEmblem, { emblemForLevel } from '../emblems/RankEmblem';
import useStore from '../../../../contexts/store';
import { fonts } from '../../../../theme/theme';

/**
 * One reusable player card — avatar, pseudo, school crest and name, rank
 * emblem with tier and level, optional weekly place and earned title. RN port
 * of the web's src/arena-art/cards/PlayerCard.tsx (same props).
 *
 * Public identity only: it renders the pseudo it is given and never an email,
 * real name or account detail.
 *
 *   lg — a vertical collectible, the school's colours as a matte band
 *   md — horizontal, for match introductions and profiles
 *   sm — a compact row, for lists and boards
 *
 * Every visual (crest, emblem) is repeated in text, so nothing depends on
 * reading a colour or a silhouette. The card lives in the Arène's night world,
 * so it carries its own night palette in both app themes.
 */
export interface PlayerCardProps {
  uid: string;
  name: string;
  school?: string | null;
  level?: number;
  xp?: number;
  /** Weekly national place, when real. */
  rank?: number | null;
  /** An earned title, when real. */
  title?: string | null;
  size?: 'sm' | 'md' | 'lg';
  mood?: 'idle' | 'ready' | 'focused' | 'celebrating' | 'recovering';
  style?: StyleProp<ViewStyle>;
}

/** Night palette, from cards.css. */
const PC = {
  surface: '#12223B',
  raised: '#172B48',
  border: '#365171',
  text: '#F5F8FF',
  text2: '#C1CFE4',
  text3: '#A7BAD5',
  gold: '#F2C14E',
};

function borderFor(tier: string): string {
  if (tier === 'gold' || tier === 'legend') return 'rgba(242, 193, 78, 0.55)';
  if (tier === 'diamond') return 'rgba(127, 211, 255, 0.55)';
  return PC.border;
}

export default function PlayerCard({
  uid, name, school, level = 1, xp, rank, title, size = 'md', mood = 'idle', style,
}: PlayerCardProps) {
  const isCreole = useStore((s: any) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lvl = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(lvl);
  const tierName = isCreole ? tier.nameHt : tier.nameFr;
  const schoolName = (school || '').trim();
  const colors = schoolColors(schoolName);
  const pseudo = (name || '').trim() || t('Joueur', 'Jwè');
  const place = typeof rank === 'number' && rank > 0 ? Math.floor(rank) : null;
  const earned = (title || '').trim() || null;
  const levelText = `${t('Niv.', 'Nivo')} ${lvl}`;
  const xpText = typeof xp === 'number' && xp > 0 ? `${Math.round(xp).toLocaleString('fr-FR')} XP` : null;
  const placeText = t('cette semaine', 'semèn sa a');
  const gid = 'pc' + React.useId().replace(/[^a-zA-Z0-9]/g, '');

  const summary = [
    pseudo,
    schoolName || null,
    `${tierName}, ${t('niveau', 'nivo')} ${lvl}`,
    place ? `${place}${t('e', 'yèm')} ${placeText}` : null,
    earned,
  ].filter(Boolean).join(' · ');

  const frame = { backgroundColor: PC.surface, borderColor: borderFor(tier.id) };

  if (size === 'sm') {
    return (
      <View style={[s.card, s.sm, frame, style]} accessible accessibilityLabel={summary}>
        <Avatar seed={uid || pseudo} mood={mood} size={36} colors={colors} still />
        <View style={s.main}>
          <Text style={[s.name, { fontSize: 15 }]} numberOfLines={1}>{pseudo}</Text>
          {schoolName ? (
            <View style={s.school}>
              <SchoolCrest name={schoolName} size={16} />
              <Text style={[s.schoolName, { fontSize: 13 }]} numberOfLines={1}>{schoolName}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.rankchip}>
          <RankEmblem level={lvl} size={22} />
          <Text style={s.rankchipText}>{lvl}</Text>
        </View>
        {place ? <Text style={s.placeSm}>#{place}</Text> : null}
      </View>
    );
  }

  if (size === 'md') {
    return (
      <View style={[s.card, s.md, frame, style]} accessible accessibilityLabel={summary}>
        {/* Corner wash in the school's colour (web: radial-gradient at 0 0). */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id={`${gid}w`} cx="0" cy="0" rx="1.2" ry="1.4" fx="0" fy="0" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.26" />
              <Stop offset="0.55" stopColor={colors.primary} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid}w)`} />
        </Svg>
        <View style={s.portrait}>
          <Avatar seed={uid || pseudo} mood={mood} size={72} colors={colors} />
          {schoolName ? (
            <View style={s.portraitCrest}><SchoolCrest name={schoolName} size={30} /></View>
          ) : null}
        </View>
        <View style={s.main}>
          <Text style={[s.name, { fontSize: 18 }]} numberOfLines={1}>{pseudo}</Text>
          {earned ? <Text style={s.title} numberOfLines={1}>{earned}</Text> : null}
          {schoolName ? (
            <Text style={[s.schoolName, { fontSize: 14 }]} numberOfLines={1}>{schoolName}</Text>
          ) : null}
          <View style={s.tier}>
            <RankEmblem level={lvl} size={24} />
            <Text style={s.tierText} numberOfLines={1}>{tierName} · {levelText}</Text>
          </View>
        </View>
        {place ? (
          <View style={s.place}>
            <Text style={s.placeN}>#{place}</Text>
            <Text style={s.placeL}>{placeText}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[s.card, s.lg, frame, style]} accessible accessibilityLabel={summary}>
      <View style={s.band}>
        {/* The band: school colour, soft top light, a diagonal weave in the
            charge colour fading out, and a shallow pennant point. */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 248 150" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`${gid}s`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.4" stopColor="#060C18" stopOpacity="0" />
              <Stop offset="1" stopColor="#060C18" stopOpacity="0.28" />
            </LinearGradient>
            <RadialGradient id={`${gid}l`} cx="0.25" cy="0" rx="0.9" ry="1.2" fx="0.25" fy="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.secondary} stopOpacity="0.16" />
              <Stop offset="0.85" stopColor={colors.secondary} stopOpacity="0" />
            </LinearGradient>
            <Pattern id={`${gid}p`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width="2" height="14" fill={`url(#${gid}f)`} />
            </Pattern>
          </Defs>
          <Path d="M0 0H248V117L124 150L0 117Z" fill={colors.primary} />
          <Path d="M0 0H248V117L124 150L0 117Z" fill={`url(#${gid}l)`} />
          <Path d="M0 0H248V117L124 150L0 117Z" fill={`url(#${gid}s)`} />
          <Path d="M0 0H248V117L124 150L0 117Z" fill={colors.secondary} opacity={0.08} />
        </Svg>
        {schoolName ? <View style={s.bandCrest}><SchoolCrest name={schoolName} size={44} /></View> : null}
        {place ? (
          <View style={s.bandPlace}>
            <Text style={s.bandPlaceN}>#{place}</Text>
            <Text style={s.bandPlaceL}>{placeText}</Text>
          </View>
        ) : null}
        <View style={[s.avatarRing, { borderColor: colors.secondary }]}>
          <Avatar seed={uid || pseudo} mood={mood} size={104} colors={colors} />
        </View>
      </View>
      <View style={s.body}>
        <Text style={[s.name, { fontSize: 22, textAlign: 'center' }]} numberOfLines={1}>{pseudo}</Text>
        {earned ? <Text style={[s.title, { alignSelf: 'center' }]} numberOfLines={1}>{earned}</Text> : null}
        {schoolName ? (
          <View style={[s.school, { justifyContent: 'center', maxWidth: '100%' }]}>
            <SchoolCrest name={schoolName} size={20} />
            <Text style={[s.schoolName, { fontSize: 14, flexShrink: 1 }]} numberOfLines={2}>{schoolName}</Text>
          </View>
        ) : null}
        <View style={s.foot}>
          <View style={s.tier}>
            <RankEmblem level={lvl} size={44} />
            <View>
              <Text style={s.tierName}>{tierName}</Text>
              <Text style={s.tierLevel}>{levelText}</Text>
            </View>
          </View>
          {xpText ? <Text style={s.xp}>{xpText}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, minWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: fonts.bold, fontWeight: '800', color: PC.text, lineHeight: undefined },
  school: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  schoolName: { fontFamily: fonts.regular, color: PC.text2, flexShrink: 1 },
  title: {
    alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 2,
    borderRadius: 999, backgroundColor: 'rgba(242, 193, 78, 0.14)', color: '#FFD978',
    fontFamily: fonts.bold, fontSize: 12, fontWeight: '700', overflow: 'hidden',
  },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  tierText: { fontFamily: fonts.medium, color: PC.text3, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  place: { alignItems: 'flex-end' },
  placeN: { fontFamily: fonts.bold, fontWeight: '800', fontSize: 22, color: PC.text, fontVariant: ['tabular-nums'] },
  placeL: { fontFamily: fonts.regular, color: PC.text3, fontSize: 12, marginTop: 3, maxWidth: 80, textAlign: 'right' },

  sm: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, width: '100%' },
  rankchip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankchipText: { fontFamily: fonts.bold, color: PC.text2, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  placeSm: { fontFamily: fonts.bold, fontWeight: '800', color: PC.text, fontSize: 14, minWidth: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },

  md: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, width: '100%', maxWidth: 440, overflow: 'hidden' },
  portrait: { width: 72, height: 72 },
  portraitCrest: { position: 'absolute', right: -8, bottom: -6 },

  lg: {
    width: 248, maxWidth: '100%', borderRadius: 22, overflow: 'hidden',
    shadowColor: '#030812', shadowOpacity: 0.8, shadowRadius: 20, shadowOffset: { width: 0, height: 18 }, elevation: 8,
  },
  band: { height: 150, position: 'relative' },
  bandCrest: { position: 'absolute', top: 12, right: 12 },
  bandPlace: {
    position: 'absolute', top: 12, left: 12, maxWidth: 80,
    paddingHorizontal: 9, paddingTop: 5, paddingBottom: 6, borderRadius: 12,
    backgroundColor: 'rgba(10, 18, 32, 0.62)',
  },
  bandPlaceN: { fontFamily: fonts.bold, color: '#F5F8FF', fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] },
  bandPlaceL: { fontFamily: fonts.medium, color: '#C1CFE4', fontSize: 12, fontWeight: '600' },
  avatarRing: {
    position: 'absolute', alignSelf: 'center', bottom: 4,
    borderRadius: 999, borderWidth: 2, padding: 4, backgroundColor: PC.surface,
  },
  body: { alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(54, 81, 113, 0.7)',
  },
  tierName: { fontFamily: fonts.bold, color: PC.text, fontWeight: '800', fontSize: 15 },
  tierLevel: { fontFamily: fonts.medium, color: PC.text3, fontSize: 12, fontWeight: '600' },
  xp: { fontFamily: fonts.bold, color: PC.text2, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
