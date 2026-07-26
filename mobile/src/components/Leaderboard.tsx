import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Medal, Trophy, Pencil, ShieldCheck, ChevronDown } from 'lucide-react-native';
import { useLeaderboard, useCollectives } from '../hooks/useLeaderboard';
import { useTrivia } from '../hooks/useTrivia';
import { isValidAlias } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import { aggregateBy, normalizeName, type GroupField, type GroupRanking } from '../../../shared/leaderboardAgg';
import { useReduceMotion } from '../utils/motion';
import Avatar from './ui/Avatar';
import PressableScale from './ui/PressableScale';
import Stagger from './ui/Stagger';
import { Skeleton } from './StateViews';
import LeaderboardJoinModal from './LeaderboardJoinModal';

/**
 * Medal tones per scheme. The light values are the classic gold/silver/bronze;
 * on a dark navy ground the ink + metal tones are lifted so they still read.
 */
function medalPalette(isDark: boolean) {
  return {
    gold:   { metal: isDark ? '#FFD966' : '#FFD700', ring: isDark ? '#FFE083' : '#F5C518', ink: isDark ? '#FBD24E' : '#B8860B' },
    silver: { metal: isDark ? '#D9DEE6' : '#A0A0A0', ring: isDark ? '#D9DEE6' : '#C0C0C0', ink: isDark ? '#CBD3DE' : '#7A7A7A' },
    bronze: { metal: isDark ? '#E39A5C' : '#CD7F32', ring: isDark ? '#E39A5C' : '#CD7F32', ink: isDark ? '#E0A46A' : '#A15A1E' },
  };
}

function rankBadge(rank: number, isDark: boolean) {
  const m = medalPalette(isDark);
  if (rank === 1) return { icon: <Crown size={16} color={m.gold.metal} />, bg: m.gold.ring + '20', text: m.gold.ink };
  if (rank === 2) return { icon: <Medal size={16} color={m.silver.metal} />, bg: m.silver.ring + '20', text: m.silver.ink };
  if (rank === 3) return { icon: <Medal size={16} color={m.bronze.metal} />, bg: m.bronze.ring + '20', text: m.bronze.ink };
  return { icon: null, bg: 'transparent', text: isDark ? '#9aa8c0' : '#6b7280' };
}

function EntryRow({ entry, isMe, compact = false }: { entry: any; isMe: boolean; compact?: boolean }) {
  const { colors, isDark } = useTheme();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const badge = rankBadge(entry.rank, isDark);
  const name = entry.displayName || t('Élève', 'Elèv');
  // One grouped label so VoiceOver reads "Rang 3, Sandra, 215 XP" as a single
  // unit rather than three disjoint bits (rank chip · name · number · "XP").
  const rowLabel = `${t('Rang', 'Ran')} ${entry.rank}, ${name}${isMe ? t(' (vous)', ' (ou)') : ''}, ${entry.xp ?? 0} XP`;

  return (
    <View
      accessible
      accessibilityLabel={rowLabel}
      className="flex-row items-center py-2.5 px-3 rounded-xl mb-1.5"
      style={isMe
        ? { backgroundColor: colors.azureSoft, borderWidth: 1, borderColor: colors.azure }
        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      {/* Rank badge */}
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: badge.bg }}
      >
        {badge.icon ?? (
          <Text style={[typeScale.caption, { color: colors.muted }]}>{entry.rank}</Text>
        )}
      </View>

      {/* Avatar — the user's real profile photo when we have one, else the same
          seeded robot used across the app (never bare initials). */}
      <View className="mr-2.5">
        <Avatar
          name={entry.displayName || ''}
          uri={entry.photoURL || entry.picture || null}
          seed={entry.id || entry.uid || entry.displayName || ''}
          size={32}
        />
      </View>

      {/* Name + city · school (parity with the web leaderboard) */}
      <View className="flex-1">
        <Text style={[typeScale.bodyMd, { color: isMe ? colors.azure : colors.ink }]} numberOfLines={1}>
          {entry.displayName || t('Élève', 'Elèv')}
          {isMe ? t(' (vous)', ' (ou)') : ''}
        </Text>
        {!compact && (entry.city || entry.school) && (
          <Text style={[typeScale.caption, { color: colors.faint }]} numberOfLines={1}>
            {[entry.city, entry.school].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* XP */}
      <View className="items-end">
        <Text style={[typeScale.bodyMd, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>{entry.xp ?? 0}</Text>
        <Text style={[typeScale.caption, { color: colors.faint }]}>XP</Text>
      </View>
    </View>
  );
}

/** A ranked collective (school/city) with tap-to-expand member drill-down. */
function GroupRow({
  group, isMine, open, onToggle, myUid,
}: {
  group: GroupRanking;
  isMine: boolean;
  open: boolean;
  onToggle: () => void;
  myUid?: string;
}) {
  const { colors, isDark } = useTheme();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const badge = rankBadge(group.rank, isDark);
  const memberWord = group.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv');

  return (
    <View
      className="rounded-xl mb-1.5"
      style={isMine
        ? { backgroundColor: colors.azureSoft, borderWidth: 1, borderColor: colors.azure }
        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} className="flex-row items-center py-2.5 px-3">
        <View className="w-7 h-7 rounded-full items-center justify-center mr-3" style={{ backgroundColor: badge.bg }}>
          {badge.icon ?? <Text style={[typeScale.caption, { color: colors.muted }]}>{group.rank}</Text>}
        </View>
        <View className="flex-1">
          <Text
            style={[typeScale.bodyMd, { color: isMine ? colors.azure : colors.ink }]}
            numberOfLines={1}
          >
            {group.label}{isMine ? t(' (vous)', ' (ou)') : ''}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1}>
            {group.members} {memberWord} · {t('moy.', 'mwayèn')} {group.avgXp} XP
          </Text>
        </View>
        <View className="items-end mr-2">
          <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{group.totalXp}</Text>
          <Text style={[typeScale.caption, { color: colors.muted }]}>XP</Text>
        </View>
        <ChevronDown size={16} color={colors.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      {open && (
        <View className="px-3 pb-2.5" style={{ gap: 4 }}>
          {group.topMembers.map((m, i) => {
            const isMe = m.uid === myUid;
            return (
              <View
                key={m.uid || i}
                className="flex-row items-center py-1.5 px-2 rounded-lg"
                style={{ backgroundColor: isMe ? colors.azureSoft : colors.surfaceAlt }}
              >
                <Text className="w-5 text-center mr-2" style={[typeScale.caption, { color: colors.muted }]}>{i + 1}</Text>
                <Text
                  className="flex-1"
                  style={[typeScale.bodyMd, { color: isMe ? colors.azure : colors.ink }]}
                  numberOfLines={1}
                >
                  {m.displayName || t('Élève', 'Elèv')}{isMe ? t(' (vous)', ' (ou)') : ''}
                </Text>
                <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{m.xp}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Medal treatment per podium place: pedestal tint + a darker readable number.
const PODIUM_META: Record<number, { tint: string; ink: string; ring: string; h: number; av: number }> = {
  1: { tint: '#FFD70022', ink: '#B8860B', ring: '#F5C518', h: 62, av: 62 },
  2: { tint: '#C0C0C022', ink: '#7A7A7A', ring: '#C0C0C0', h: 46, av: 52 },
  3: { tint: '#CD7F3222', ink: '#A15A1E', ring: '#CD7F32', h: 34, av: 52 },
};

/** Ordinal place wording for the podium, so the medal state is never conveyed
 *  by colour alone — VoiceOver hears "1re place / 2e place / 3e place". */
function placeLabel(rank: number, t: (fr: string, ht: string) => string): string {
  if (rank === 1) return t('1re place', '1ye plas');
  if (rank === 2) return t('2e place', '2yèm plas');
  if (rank === 3) return t('3e place', '3yèm plas');
  return `${t('Rang', 'Ran')} ${rank}`;
}

/** A single animated podium column that rises + fades + scales in on mount. */
function PodiumColumn({
  e, delay, isWinner, myUid, t,
}: {
  e: any;
  delay: number;
  isWinner: boolean;
  myUid?: string;
  t: (fr: string, ht: string) => string;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const rank = Number(e.rank) || 3;
  const m = PODIUM_META[rank] ?? PODIUM_META[3];
  const isMe = e.id === myUid;

  // Winner (centre) lands last and strongest — a springier settle + a Crown pop.
  const opacity = useSharedValue(reduce ? 1 : 0);
  const translateY = useSharedValue(reduce ? 0 : 28);
  const scale = useSharedValue(reduce ? 1 : 0.9);
  const crownOpacity = useSharedValue(reduce ? 1 : 0);
  const crownScale = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withSpring(0, { damping: isWinner ? 9 : 13, stiffness: isWinner ? 150 : 130, mass: 0.9 }));
    scale.value = withDelay(delay, withSpring(1, { damping: isWinner ? 7 : 12, stiffness: isWinner ? 165 : 140, mass: 0.9 }));
    if (isWinner) {
      crownOpacity.value = withDelay(delay + 260, withTiming(1, { duration: 200 }));
      crownScale.value = withDelay(delay + 260, withSpring(1, { damping: 6, stiffness: 190 }));
    }
    // Play once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const colStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));
  const crownStyle = useAnimatedStyle(() => ({
    opacity: crownOpacity.value,
    transform: [{ scale: crownScale.value }],
  }));

  const podiumName = e.displayName || t('Élève', 'Elèv');
  const podiumLabel = `${placeLabel(rank, t)}, ${podiumName}${isMe ? t(' (vous)', ' (ou)') : ''}, ${e.xp ?? 0} XP`;

  return (
    <Animated.View
      style={[{ flex: 1, maxWidth: 110, alignItems: 'center' }, colStyle]}
      accessible
      accessibilityLabel={podiumLabel}
    >
      {rank === 1 ? (
        <Animated.View style={crownStyle}>
          <Crown size={18} color="#F5C518" style={{ marginBottom: 2 }} />
        </Animated.View>
      ) : (
        <View style={{ height: 20 }} />
      )}
      <View style={{ borderWidth: 2.5, borderColor: m.ring, borderRadius: 999, padding: 2 }}>
        <Avatar
          name={e.displayName || ''}
          uri={e.photoURL || e.picture || null}
          seed={e.id || e.uid || e.displayName || ''}
          size={m.av}
        />
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 12.5, fontWeight: '800', color: isMe ? colors.azure : colors.ink, maxWidth: 104 }}>
        {e.displayName || t('Élève', 'Elèv')}{isMe ? t(' (vous)', ' (ou)') : ''}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.azure }} maxFontSizeMultiplier={1.3}>{e.xp ?? 0} XP</Text>
      <View
        style={{
          width: '100%', height: m.h, marginTop: 8,
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          backgroundColor: m.tint, borderWidth: 1, borderColor: m.ring + '66',
          alignItems: 'center', paddingTop: 6,
        }}
      >
        <Text style={{ fontSize: 19, fontWeight: '900', color: m.ink }} maxFontSizeMultiplier={1.3}>{rank}</Text>
      </View>
    </Animated.View>
  );
}

/** Top-3 podium for the full board — 2nd · 1st · 3rd, tallest in the middle. */
function Podium({
  top3, myUid, t,
}: {
  top3: any[];
  myUid?: string;
  t: (fr: string, ht: string) => string;
}) {
  // Visual order places the winner in the centre. It assembles left → right,
  // but the centre winner is delayed most so it lands last and strongest.
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  // Per-slot entrance delays keyed to the visual order [2nd (left), 1st (centre), 3rd (right)].
  const DELAYS = [60, 300, 170];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, paddingTop: 4, paddingBottom: 16 }}>
      {order.map((e, i) => (
        <PodiumColumn
          key={e.id || e.displayName}
          e={e}
          delay={DELAYS[i] ?? 60}
          isWinner={Number(e.rank) === 1}
          myUid={myUid}
          t={t}
        />
      ))}
    </View>
  );
}

interface LeaderboardProps {
  compact?: boolean;
  maxRows?: number;
}

export default function Leaderboard({ compact = false, maxRows = 10 }: LeaderboardProps) {
  const { language, toggleAuthModal } = useStore();
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [scope, setScope] = useState<'national' | 'school' | 'city' | 'department'>('national');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { entries, myEntry, myRank, isLoading } = useLeaderboard(maxRows, compact ? 'week' : period);
  const { profile, isAuthed } = useTrivia();
  const [showJoin, setShowJoin] = useState(false);
  const myUid = myEntry?.id;

  const optedIn = !!profile?.leaderboard?.optedIn;
  // Opted in but no usable pseudo → hidden from the board; prompt to fix.
  const needsAlias = optedIn && !isValidAlias(profile?.leaderboard?.displayName);
  const mySchool = profile?.leaderboard?.school || null;
  const myCity = profile?.leaderboard?.city || null;
  const myDepartment = profile?.leaderboard?.department || null;

  const displayList = entries.slice(0, maxRows);

  // École / Ville are collective boards (schools/cities ranked by total member
  // XP); National stays individual. Compact widget is always the national board.
  const collectiveField: GroupField | null =
    !compact && scope === 'school' ? 'school' : !compact && scope === 'city' ? 'city' : !compact && scope === 'department' ? 'department' : null;

  // Exhaustive ranking from the server (counts every learner, not just the
  // fetched top-N). Only queried when a collective tab is open; falls back to a
  // local aggregate over the fetched entries if the endpoint is unreachable.
  const { groups: serverGroups, isLoading: collLoading } = useCollectives(
    collectiveField || 'school',
    compact ? 'week' : period,
    !!collectiveField,
  );
  const groups = useMemo(() => {
    if (!collectiveField) return [];
    return serverGroups.length ? serverGroups : aggregateBy(entries, collectiveField, 50);
  }, [collectiveField, serverGroups, entries]);
  const myGroupKey = useMemo(() => {
    if (!collectiveField) return null;
    const mine = collectiveField === 'school' ? mySchool : collectiveField === 'city' ? myCity : myDepartment;
    return mine ? normalizeName(mine) : null;
  }, [collectiveField, mySchool, myCity, myDepartment]);

  const changeScope = (next: 'national' | 'school' | 'city' | 'department') => {
    setScope(next);
    setExpandedKey(null);
  };

  const cardStyle = { ...cardSurface, padding: 16 };

  const joinFooter = isAuthed && !compact && (
    <>
      {needsAlias ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.warn + '1A' }}
        >
          <Pencil size={14} color={colors.warn} />
          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.warn }}>
            {t(
              'Il vous manque un pseudo — choisissez-en un pour apparaître.',
              'Ou manke yon ti non — chwazi youn pou parèt.',
            )}
          </Text>
        </TouchableOpacity>
      ) : optedIn ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'center' }}
        >
          <Pencil size={12} color={colors.muted} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>
            {t('Modifier mon pseudo, mon école ou ma ville', 'Chanje ti non, lekòl oswa vil mwen')}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.azure }}
        >
          <ShieldCheck size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>
            {t('Rejoindre le classement', 'Antre nan klasman')}
          </Text>
        </TouchableOpacity>
      )}
      <LeaderboardJoinModal visible={showJoin} onClose={() => setShowJoin(false)} />
    </>
  );

  // Signed-out students see the board but can't join → give them a way in.
  const guestFooter = !isAuthed && !compact && (
    <TouchableOpacity
      onPress={toggleAuthModal}
      activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.azure }}
    >
      <ShieldCheck size={15} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>
        {t('Se connecter pour jouer', 'Konekte pou jwe')}
      </Text>
    </TouchableOpacity>
  );

  const header = !compact && (
    <>
      <View className="flex-row items-center gap-2 mb-3">
        <Trophy color={colors.azure} size={18} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>
          {period === 'all' ? t('Classement général', 'Klasman jeneral') : t('Classement de la semaine', 'Klasman semèn nan')}
        </Text>
        {myRank && (
          <View className="ml-auto px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.azureSoft }}>
            <Text className="text-xs font-bold" style={{ color: colors.azure }}>#{myRank}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {(['week', 'all'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
            accessibilityLabel={p === 'week' ? t('Cette semaine', 'Semèn sa a') : t('Tous les temps', 'Tout tan')}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: period === p ? colors.surface : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: period === p ? colors.azure : colors.muted }}>
              {p === 'week' ? t('Cette semaine', 'Semèn sa a') : t('Tous les temps', 'Tout tan')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Scope: National (individuals) · École · Ville (collectives) */}
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {([
          ['national', t('National', 'Nasyonal')],
          ['school', t('École', 'Lekòl')],
          ['city', t('Ville', 'Vil')],
          ['department', t('Département', 'Depatman')],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => changeScope(key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === key }}
            accessibilityLabel={label}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 2, borderRadius: 8, backgroundColor: scope === key ? colors.surface : 'transparent' }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ fontSize: 12, fontWeight: '700', color: scope === key ? colors.azure : colors.muted }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  if (isLoading) {
    return (
      <View style={{ ...cardStyle, alignItems: 'center', paddingVertical: 32 }}>
        <Text style={{ color: colors.faint, fontSize: 14 }}>{t('Chargement…', 'Ap chaje…')}</Text>
      </View>
    );
  }

  if (displayList.length === 0) {
    return (
      <View style={{ ...cardStyle, alignItems: 'center', paddingVertical: 24 }}>
        {header}
        <Trophy color={colors.faint} size={32} />
        <Text style={{ color: colors.faint, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {period === 'all'
            ? t('Aucune entrée pour le moment.', 'Poko gen antre.')
            : t('Aucune entrée cette semaine.\nJoue pour apparaître !', 'Poko gen antre semèn sa a.\nJwe pou ou parèt !')}
        </Text>
        {joinFooter}
        {guestFooter}
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      {header}
      {collectiveField ? (
        groups.length > 0 ? (
          <>
            {groups.map((g) => (
              <GroupRow
                key={g.key}
                group={g}
                isMine={myGroupKey != null && g.key === myGroupKey}
                open={expandedKey === g.key}
                onToggle={() => setExpandedKey(expandedKey === g.key ? null : g.key)}
                myUid={myUid}
              />
            ))}
            {!myGroupKey && isAuthed && (
              <TouchableOpacity
                onPress={() => setShowJoin(true)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'center' }}
              >
                <Pencil size={12} color={colors.azure} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.azure }}>
                  {scope === 'school'
                    ? t('Ajoutez votre école pour y figurer', 'Ajoute lekòl ou pou parèt ladan l')
                    : scope === 'city'
                    ? t('Ajoutez votre ville pour y figurer', 'Ajoute vil ou pou parèt ladan l')
                    : t('Ajoutez votre département pour y figurer', 'Ajoute depatman ou pou parèt ladan l')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ color: colors.faint, fontSize: 13, textAlign: 'center' }}>
              {collLoading
                ? t('Chargement…', 'Ap chaje…')
                : scope === 'school'
                  ? t('Aucune école classée pour le moment.', 'Poko gen lekòl klase.')
                  : scope === 'city'
                    ? t('Aucune ville classée pour le moment.', 'Poko gen vil klase.')
                    : t('Aucun département classé pour le moment.', 'Poko gen depatman klase.')}
            </Text>
          </View>
        )
      ) : (
        <>
          {/* Full board leads with a top-3 podium; the compact widget stays a
              plain list. Falls back to a plain list when fewer than 3 ranked. */}
          {!compact && displayList.length >= 3 ? (
            <>
              <Podium top3={displayList.slice(0, 3)} myUid={myUid} t={t} />
              <Stagger initialDelay={220} step={55}>
                {displayList.slice(3).map((entry: any) => (
                  <EntryRow key={entry.id} entry={entry} isMe={entry.id === myUid} compact={compact} />
                ))}
              </Stagger>
            </>
          ) : (
            displayList.map((entry: any) => (
              <EntryRow key={entry.id} entry={entry} isMe={entry.id === myUid} compact={compact} />
            ))
          )}
          {myEntry && !displayList.find((e: any) => e.id === myUid) && (
            <View className="border-t border-dashed border-gray-200 dark:border-slate-700 mt-1 pt-2">
              <EntryRow entry={myEntry} isMe compact={compact} />
            </View>
          )}
        </>
      )}
      {joinFooter}
      {guestFooter}
    </View>
  );
}
