import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing } from 'react-native-reanimated';
import { Crown, Trophy, Pencil, ShieldCheck, ChevronDown, Sparkles, Timer, Share2 } from 'lucide-react-native';
import ShareCardCapture, { type ShareCardCaptureHandle } from './share/ShareCardCapture';
import { useLeaderboard, useCollectives } from '../hooks/useLeaderboard';
import { useTrivia } from '../hooks/useTrivia';
import { isValidAlias, weekId, weekNumber, timeToWeekEnd } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useTheme, typeScale, fonts } from '../theme/theme';
import { arenaColors as NC, arenaPalette } from '../theme/arenaTheme';
import { Avatar as FaceAvatar, SchoolCrest } from './arena/art';
import Segmented from './ui/Segmented';
import { aggregateBy, normalizeName, type GroupField, type GroupRanking } from '../../../shared/leaderboardAgg';
import { useReduceMotion } from '../utils/motion';
import { tapLight } from '../utils/haptics';
import { logInviteSent } from '../services/referralService';
import ChampionMedallion from './celebration/ChampionMedallion';
import Avatar from './ui/Avatar';
import { useMyAvatar } from '../hooks/useMyAvatar';
import Stagger from './ui/Stagger';
import LeaderboardJoinModal from './LeaderboardJoinModal';

/**
 * Two worlds share this board: the Jeux tab / full Classement page draw it on
 * the Arène's night (`tone="night"`), Home keeps the day look. One context so
 * every row, podium and footer reads the same palette without prop-drilling.
 */
type BoardTone = 'day' | 'night';
const BoardToneContext = createContext<BoardTone>('day');

function useBoard() {
  const theme = useTheme();
  const tone = useContext(BoardToneContext);
  if (tone === 'night') {
    return {
      ...theme,
      colors: arenaPalette,
      isDark: true,
      night: true as const,
      cardSurface: { backgroundColor: NC.surface, borderRadius: 20, borderWidth: 0 },
    };
  }
  return { ...theme, night: false as const };
}

/** A student's face: the generated arena face on the night, the app avatar by day. */
function BoardAvatar({ entry, size }: { entry: any; size: number }) {
  const { night } = useBoard();
  const myUid = useStore((s) => s.user?.uid);
  const mine = useMyAvatar();
  const seed = entry.id || entry.uid || entry.displayName || '';
  // The chosen avatar travels on the public entry; the student's own row reads
  // their fresh copy (the entry can lag a save by one propagation).
  const own = !!myUid && seed === myUid && !mine.loading;
  const config: string | null = own ? mine.avatar : (typeof entry.avatar === 'string' ? entry.avatar : null);
  if (night) return <FaceAvatar seed={seed} config={config} size={size} />;
  return <Avatar name={entry.displayName || ''} uri={entry.photoURL || entry.picture || null} seed={seed} config={config} size={size} />;
}

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

/**
 * The rank chip: a 36 square, radius 10, with the numeral always written out
 * (never colour alone). 1-3 wear their metal as an OPAQUE fill with a marine
 * numeral; every other rank sits on the quiet secondary step.
 */
function rankBadge(rank: number, isDark: boolean) {
  const m = medalPalette(isDark);
  if (rank === 1) return { bg: isDark ? NC.gold : m.gold.ring, text: '#12213A' };
  if (rank === 2) return { bg: isDark ? '#C9D3E3' : '#D9DEE6', text: '#12213A' };
  if (rank === 3) return { bg: isDark ? '#E8B48A' : '#E8B48A', text: '#12213A' };
  return { bg: isDark ? NC.secondary : '#EEF2F7', text: isDark ? NC.inkSoft : '#46587A' };
}

function RankChip({ rank }: { rank: number }) {
  const { isDark } = useBoard();
  const b = rankBadge(rank, isDark);
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: b.bg, marginRight: 12 }}>
      <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, color: b.text }} maxFontSizeMultiplier={1.3}>{rank}</Text>
    </View>
  );
}

function EntryRow({ entry, isMe, compact = false, delta = 0 }: { entry: any; isMe: boolean; compact?: boolean; delta?: number }) {
  const { colors, night } = useBoard();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const name = entry.displayName || t('Élève', 'Elèv');
  // One grouped label so VoiceOver reads "Rang 3, Sandra, 215 XP" as a single
  // unit rather than three disjoint bits (rank chip · name · number · "XP").
  const deltaLabel = delta > 0
    ? t(`, en hausse de ${delta}`, `, monte ${delta}`)
    : delta < 0
      ? t(`, en baisse de ${-delta}`, `, desann ${-delta}`)
      : '';
  const rowLabel = `${t('Rang', 'Ran')} ${entry.rank}, ${name}${isMe ? t(' (vous)', ' (ou)') : ''}, ${entry.xp ?? 0} XP${deltaLabel}`;
  // Only the leader's numeral is gold — the one place on the board that is won.
  const xpColor = night ? (Number(entry.rank) === 1 ? NC.gold : NC.ink) : colors.azure;

  return (
    <View
      accessible
      accessibilityLabel={rowLabel}
      // Rows are plain inside the card; YOUR row is a tonal wash, never an
      // outline (no rings, no hairlines).
      style={{
        flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10,
        borderRadius: 14, marginBottom: 4,
        backgroundColor: isMe ? (night ? NC.surfaceRaised : colors.azureSoft) : 'transparent',
      }}
    >
      <RankChip rank={Number(entry.rank) || 0} />

      {/* Face — the generated arena face on the night, never bare initials. */}
      <View style={{ marginRight: 12 }}>
        <BoardAvatar entry={entry} size={40} />
      </View>

      {/* Name + city · school (parity with the web leaderboard) */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }} numberOfLines={1}>
          {name}
          {isMe ? t(' (toi)', ' (ou)') : ''}
        </Text>
        {!compact && (entry.city || entry.school) && (
          <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1}>
            {[entry.school, entry.city].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* Day-over-day movement — colour plus direction glyph, never colour alone. */}
      {delta !== 0 && (
        <Text
          style={{ fontFamily: fonts.bold, fontSize: 14, marginRight: 10, color: delta > 0 ? colors.success : colors.danger }}
          maxFontSizeMultiplier={1.3}
        >
          {delta > 0 ? `▲${delta}` : `▼${-delta}`}
        </Text>
      )}

      {/* XP */}
      <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, color: xpColor, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.3}>
        {entry.xp ?? 0} <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>XP</Text>
      </Text>
    </View>
  );
}

/** A ranked collective (school/city) with tap-to-expand member drill-down. */
function GroupRow({
  group, isMine, open, onToggle, myUid, field,
}: {
  group: GroupRanking;
  isMine: boolean;
  open: boolean;
  onToggle: () => void;
  myUid?: string;
  field: GroupField;
}) {
  const { colors, night } = useBoard();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const memberWord = group.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv');
  const wash = isMine ? (night ? NC.surfaceRaised : colors.azureSoft) : (night ? NC.surfaceAlt : colors.surfaceAlt);

  return (
    <View style={{ borderRadius: 16, marginBottom: 8, backgroundColor: wash }}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Rang', 'Ran')} ${group.rank}, ${group.label}, ${group.totalXp} XP, ${group.members} ${memberWord}`}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, minHeight: 60 }}
      >
        <RankChip rank={group.rank} />
        {/* Schools wear their crest; cities and departments have none. */}
        {field === 'school' ? (
          <View style={{ marginRight: 10 }}><SchoolCrest name={group.label} size={32} /></View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }} numberOfLines={1}>
            {group.label}{isMine ? t(' (toi)', ' (ou)') : ''}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1}>
            {group.members} {memberWord} · {t('moy.', 'mwayèn')} {group.avgXp} XP
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, color: night ? (group.rank === 1 ? NC.gold : NC.ink) : colors.azure, marginRight: 8, fontVariant: ['tabular-nums'] }}>
          {group.totalXp}
        </Text>
        <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 4 }}>
          {group.topMembers.map((m, i) => {
            const isMe = m.uid === myUid;
            return (
              <View
                key={m.uid || i}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
                  backgroundColor: isMe ? (night ? NC.secondary : colors.azureSoft) : (night ? NC.surface : colors.surface),
                }}
              >
                <Text style={[typeScale.caption, { color: colors.muted, width: 20, textAlign: 'center' }]}>{i + 1}</Text>
                <BoardAvatar entry={{ id: m.uid, displayName: m.displayName, avatar: m.avatar }} size={28} />
                <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]} numberOfLines={1}>
                  {m.displayName || t('Élève', 'Elèv')}{isMe ? t(' (toi)', ' (ou)') : ''}
                </Text>
                <Text style={[typeScale.bodyMd, { color: night ? NC.ink : colors.azure }]}>{m.xp}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Geometry per podium place — pedestal height + avatar size. The medal tones
// come from `medalPalette(isDark)` (same source as the row badges) so the rank
// numeral stays readable on a dark card instead of sitting at ~2:1.
const PODIUM_META: Record<number, { h: number; av: number }> = {
  1: { h: 62, av: 62 },
  2: { h: 46, av: 52 },
  3: { h: 34, av: 52 },
};

/** Pedestal tint / numeral ink / avatar ring for a podium place, per scheme. */
function podiumMedal(rank: number, isDark: boolean) {
  const m = medalPalette(isDark);
  const tone = rank === 1 ? m.gold : rank === 2 ? m.silver : m.bronze;
  return { tint: tone.ring + '22', ink: tone.ink, ring: tone.ring };
}

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
  const { colors, isDark, night } = useBoard();
  const reduce = useReduceMotion();
  const rank = Number(e.rank) || 3;
  const m = PODIUM_META[rank] ?? PODIUM_META[3];
  const medal = podiumMedal(rank, isDark);
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
          <Crown size={20} color={night ? NC.gold : '#F5C518'} style={{ marginBottom: 2 }} />
        </Animated.View>
      ) : (
        <View style={{ height: 20 }} />
      )}
      <BoardAvatar entry={e} size={m.av} />
      <Text numberOfLines={1} style={{ marginTop: 8, fontFamily: fonts.bold, fontSize: 15, color: colors.ink, maxWidth: 104 }}>
        {e.displayName || t('Élève', 'Elèv')}{isMe ? t(' (toi)', ' (ou)') : ''}
      </Text>
      <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, color: night ? (rank === 1 ? NC.gold : NC.inkSoft) : colors.azure }} maxFontSizeMultiplier={1.3}>{e.xp ?? 0} XP</Text>
      {/* Opaque pedestal, no outline; the place is written, not just tinted. */}
      <View
        style={{
          width: '100%', height: m.h, marginTop: 8,
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          backgroundColor: night ? NC.surfaceRaised : colors.surfaceAlt,
          alignItems: 'center', paddingTop: 6,
        }}
      >
        <Text style={{ fontFamily: fonts.heading, fontSize: 20, color: medal.ink }} maxFontSizeMultiplier={1.3}>{rank}</Text>
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

export type BoardPeriod = 'week' | 'all';
export type BoardScope = 'national' | 'school' | 'city' | 'department';

interface LeaderboardProps {
  compact?: boolean;
  maxRows?: number;
  /** Notifies the host screen of tab changes (e.g. to show/hide its sticky "you" bar). */
  onViewChange?: (view: { period: BoardPeriod; scope: BoardScope }) => void;
  /** 'night' on the Jeux tab / Classement page; 'day' (default) on Home. */
  tone?: BoardTone;
}

export default function Leaderboard({ tone = 'day', ...rest }: LeaderboardProps) {
  return (
    <BoardToneContext.Provider value={tone}>
      <BoardBody {...rest} />
    </BoardToneContext.Provider>
  );
}

function BoardBody({ compact = false, maxRows = 10, onViewChange }: Omit<LeaderboardProps, 'tone'>) {
  const { language, toggleAuthModal } = useStore();
  const { colors, cardSurface, night } = useBoard();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const shareRef = useRef<ShareCardCaptureHandle>(null);
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [scope, setScope] = useState<BoardScope>('national');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { entries, myEntry, myRank, isLoading, showingLastWeek, deltas } = useLeaderboard(maxRows, compact ? 'week' : period);
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

  const changePeriod = (next: BoardPeriod) => {
    setPeriod(next);
    onViewChange?.({ period: next, scope });
  };

  const changeScope = (next: BoardScope) => {
    setScope(next);
    setExpandedKey(null);
    onViewChange?.({ period, scope: next });
  };

  const cardStyle = { ...cardSurface, padding: 16 };

  const joinFooter = isAuthed && !compact && (
    <>
      {needsAlias ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colors.warnSoft }}
        >
          <Pencil size={16} color={colors.warn} />
          <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.warn }}>
            {t(
              'Il vous manque un pseudo. Choisissez-en un pour apparaître.',
              'Ou manke yon ti non. Chwazi youn pou parèt.',
            )}
          </Text>
        </TouchableOpacity>
      ) : optedIn ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'center' }}
        >
          <Pencil size={14} color={colors.muted} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>
            {t('Modifier mon pseudo, mon école ou ma ville', 'Chanje ti non, lekòl oswa vil mwen')}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, minHeight: 50, borderRadius: 999, backgroundColor: night ? NC.coral : colors.azure }}
        >
          <ShieldCheck size={16} color={night ? NC.onCoral : '#fff'} />
          <Text style={{ color: night ? NC.onCoral : '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
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
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, minHeight: 50, borderRadius: 999, backgroundColor: night ? NC.coral : colors.azure }}
    >
      <ShieldCheck size={16} color={night ? NC.onCoral : '#fff'} />
      <Text style={{ color: night ? NC.onCoral : '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
        {t('Se connecter pour jouer', 'Konekte pou jwe')}
      </Text>
    </TouchableOpacity>
  );

  // Being №1 is the peak moment on this screen, and until now it produced no
  // artifact — the student had nothing to post. The champion card is a
  // ready-to-share 1080×1920 PNG with the referral code and @edlightacademy
  // baked in, so a victory post is also an invite.
  const scopeLabel = scope === 'school'
    ? t('Champion de mon école', 'Chanpyon lekòl mwen')
    : scope === 'city'
      ? t('Champion de ma ville', 'Chanpyon vil mwen')
      : scope === 'department'
        ? t('Champion de mon département', 'Chanpyon depatman mwen')
        : t('Champion national', 'Chanpyon nasyonal');

  const championBanner = !compact && myRank === 1 && myEntry && (
    <TouchableOpacity
      onPress={() => {
        tapLight();
        logInviteSent('champion');
        shareRef.current?.share({
          mode: 'champion',
          name: (myEntry as any).displayName || t('Élève', 'Elèv'),
          scope: scopeLabel,
          scoreLabel: `${(myEntry as any).xp ?? 0} XP`,
          period: period === 'all' ? t('Tous les temps', 'Tout tan') : t('Cette semaine', 'Semèn sa a'),
        });
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('Partager ma victoire', 'Pataje viktwa mwen')}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: night ? NC.goldSoft : colors.azureSoft, borderRadius: 16,
        paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
      }}
    >
      {/* Animated here, unlike on the share card: this is the moment the
          student LEARNS they are champion, so the medallion assembles. */}
      <ChampionMedallion size={40} animate playKey={`${scope}-${period}-${myRank}`} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: night ? NC.gold : colors.ink }}>
          {t('Tu es N°1 !', 'Ou se N°1 !')}
        </Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted }}>
          {t('Partage ta victoire en story', 'Pataje viktwa w nan istwa')}
        </Text>
      </View>
      <Share2 color={night ? NC.ink : colors.azure} size={18} />
    </TouchableOpacity>
  );

  const header = !compact && (
    <>
      <ShareCardCapture ref={shareRef} />
      {championBanner}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.ink, flex: 1 }}>
          {period === 'all' ? t('Classement général', 'Klasman jeneral') : t('Classement de la semaine', 'Klasman semèn nan')}
        </Text>
        {myRank && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: night ? NC.surfaceRaised : colors.azureSoft }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: night ? NC.ink : colors.azure }}>{t(`Toi : ${myRank}e`, `Ou : ${myRank}yèm`)}</Text>
          </View>
        )}
      </View>
      <Segmented
        tone={night ? 'night' : 'auto'}
        options={[
          { key: 'week', label: t('Cette semaine', 'Semèn sa a') },
          { key: 'all', label: t('Tous les temps', 'Tout tan') },
        ]}
        value={period}
        onChange={changePeriod}
        style={{ marginBottom: 10 }}
      />
      {/* Scope: National (individuals) · École · Ville · Département (collectives) */}
      <Segmented
        tone={night ? 'night' : 'auto'}
        scroll
        options={[
          { key: 'national', label: t('National', 'Nasyonal') },
          { key: 'school', label: t('École', 'Lekòl') },
          { key: 'city', label: t('Ville', 'Vil') },
          { key: 'department', label: t('Département', 'Depatman') },
        ]}
        value={scope}
        onChange={changeScope}
        style={{ marginBottom: 14 }}
      />
      {/* Week chip + reset countdown — makes the Monday reset legible before it
          happens instead of surprising everyone with a blank board. */}
      {period === 'week' && !showingLastWeek && (() => {
        const { days, hours } = timeToWeekEnd();
        const countdown = days > 0
          ? t(`Fin dans ${days} j ${hours} h`, `Fini nan ${days} j ${hours} è`)
          : t(`Fin dans ${hours} h`, `Fini nan ${hours} è`);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ backgroundColor: night ? NC.surfaceRaised : colors.azureSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: night ? NC.ink : colors.azure }} maxFontSizeMultiplier={1.3}>
                {t('Semaine', 'Semèn')} {weekNumber(weekId())}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Timer size={16} color={colors.muted} />
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.muted }} maxFontSizeMultiplier={1.3}>
                {countdown}
              </Text>
            </View>
          </View>
        );
      })()}
      {/* Monday-reset fallback — the fresh week has no scores yet, so the board
          below is LAST week's; say so instead of showing a blank card. */}
      {period === 'week' && showingLastWeek && (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            padding: 12, borderRadius: 14, backgroundColor: night ? NC.surfaceRaised : colors.azureSoft, marginBottom: 12,
          }}
        >
          <Sparkles size={16} color={night ? NC.inkSoft : colors.azure} />
          <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: night ? NC.inkSoft : colors.azure }}>
            {t(
              'Semaine dernière : joue pour prendre la tête.',
              'Semèn pase a : jwe pou pran devan.',
            )}
          </Text>
        </View>
      )}
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
      {/* The compact widget has no header row, so flag the fallback inline. */}
      {compact && showingLastWeek && (
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.muted, marginBottom: 6 }}>
          {t('Semaine dernière', 'Semèn pase a')}
        </Text>
      )}
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
                field={collectiveField}
              />
            ))}
            {!myGroupKey && isAuthed && (
              <TouchableOpacity
                onPress={() => setShowJoin(true)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'center' }}
              >
                <Pencil size={14} color={night ? NC.inkSoft : colors.azure} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: night ? NC.inkSoft : colors.azure }}>
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
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center' }}>
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
                  <EntryRow key={entry.id} entry={entry} isMe={entry.id === myUid} compact={compact} delta={deltas[entry.id] || 0} />
                ))}
              </Stagger>
            </>
          ) : (
            displayList.map((entry: any) => (
              <EntryRow key={entry.id} entry={entry} isMe={entry.id === myUid} compact={compact} delta={deltas[entry.id] || 0} />
            ))
          )}
          {myEntry && !displayList.find((e: any) => e.id === myUid) && (
            <View style={{ marginTop: 8 }}>
              <EntryRow entry={myEntry} isMe compact={compact} delta={deltas[(myEntry as any).id] || 0} />
            </View>
          )}
        </>
      )}
      {joinFooter}
      {guestFooter}
    </View>
  );
}
