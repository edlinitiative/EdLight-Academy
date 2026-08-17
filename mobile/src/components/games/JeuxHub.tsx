/**
 * JeuxHub — the games arcade landing, "Ligue + Console" layout (chosen from the
 * 5-direction design pass, Aug 2026): a segmented hub (Jouer · Records ·
 * Classement) so the leaderboard lives INSIDE the tab, with the 6 games as
 * compact round console-style buttons (56px, small icons) instead of the old
 * 170px tiles. Défi du jour and Jeu de la semaine (×2 XP) stay first-class.
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Zap, Flame, Trophy, Crown, Sparkles, Share2, Snowflake, ChevronRight, Gift, UserPlus } from 'lucide-react-native';
import { GAMES, GAME_ICONS } from '../../data/games';
import { getGameRecords } from '../../services/leaderboardService';
import { weeklyGameId, WEEKLY_GAME_XP_MULTIPLIER } from '../../utils/weeklyGame';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import DailyChallengeBanner from './DailyChallengeBanner';
import Leaderboard from '../Leaderboard';
import { Skeleton } from '../StateViews';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../share/ShareCardCapture';
import InviteSheet from '../InviteSheet';
import { shareScore } from '../../services/scoreShare';

const GRID_PAD = 16;
// Cap so the 3-col console grid doesn't balloon on iPad (portrait +
// requireFullScreen → stable width). Phones fall under the cap unchanged.
const GRID_W = Math.min(Dimensions.get('window').width, 560);
const COL_W = Math.floor((GRID_W - GRID_PAD * 2) / 3);
const BTN = 56; // round console button — the whole "smaller tiles" ask
const BTN_ICON = 24;

type HubTab = 'jouer' | 'records' | 'classement';

interface GameRecord {
  score: number;
  displayName: string;
  uid?: string;
}

interface JeuxHubProps {
  onSelectGame: (id: string) => void;
  onStartTrivia: () => void;
  onStartDaily: () => void;
}

/* ─── Records: best-ever score per arcade game + holder ─── */
function GameRecords({
  isCreole, records, loading,
}: { isCreole: boolean; records: Record<string, GameRecord>; loading: boolean }) {
  const colors = useColors();
  const { shadow } = useTheme();
  const user = useStore((s) => s.user);
  const shareRef = useRef<ShareCardCaptureHandle>(null);

  const arcade = GAMES.filter((g) => g.id !== 'trivia');

  // Fetch in flight → show a layout-matched skeleton instead of a silent gap.
  if (loading) {
    return (
      <View
        className="px-4 py-4 mx-4 mt-4"
        style={{ backgroundColor: colors.surface, borderRadius: radius.hero, ...shadow.md }}
        accessible
        accessibilityLabel={isCreole ? 'Ap chaje' : 'Chargement…'}
        accessibilityLiveRegion="polite"
      >
        <View className="flex-row items-center gap-1.5 mb-3">
          <Crown color={colors.warn} size={15} />
          <Skeleton width={90} height={16} radius={6} />
        </View>
        {arcade.map((g, i) => (
          <View
            key={g.id}
            className="flex-row items-center justify-between py-2"
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
          >
            <Skeleton width={110} height={13} radius={6} />
            <Skeleton width={64} height={13} radius={6} />
          </View>
        ))}
      </View>
    );
  }

  // Even with zero records set, the strip stays visible — five "À prendre !"
  // rows are an invitation; a vanished section invites nothing.
  return (
    <>
    <ShareCardCapture ref={shareRef} />
    <View
      className="px-4 py-4 mx-4 mt-4"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.hero,
        ...shadow.md,
      }}
    >
      <View className="flex-row items-center gap-1.5 mb-0.5">
        <Crown color={colors.warn} size={15} />
        <Text style={[typeScale.title, { color: colors.ink }]}>
          {isCreole ? 'Rekò yo' : 'Records'}
        </Text>
      </View>
      <Text style={[typeScale.caption, { color: colors.muted, marginBottom: 10 }]}>
        {isCreole ? 'Meyè nòt kominote a' : 'Meilleurs scores de la communauté'}
      </Text>
      {arcade.map((g, i) => {
        const rec = records[g.id];
        const Icon = GAME_ICONS[g.id];
        // The signed-in student holds this record → offer to share the N°1 card.
        const isHolder = !!rec?.uid && !!user?.uid && rec.uid === user.uid;
        return (
          <View
            key={g.id}
            className="flex-row items-center justify-between py-2"
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
          >
            <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1 }}>
              <Icon color={g.color} size={14} />
              <Text style={[typeScale.label, { color: g.color }]}>
                {isCreole ? g.nameHt : g.name}
              </Text>
            </View>
            {rec ? (
              <View className="flex-row items-center" style={{ gap: 10 }}>
                {isHolder ? (
                  <TouchableOpacity
                    onPress={() => shareRef.current?.share({ mode: 'rank', subject: g.name, scoreLabel: `${rec.score}`, holder: rec.displayName })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={isCreole ? 'Pataje rang mwen' : 'Partager mon rang'}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Share2 color={colors.azure} size={15} />
                  </TouchableOpacity>
                ) : null}
                {/* Score is the hero (gold chip); the holder is a clear caption so
                    a bare "L · 12" no longer reads as a mystery — it's "🏆 12, par L". */}
                <View style={{ alignItems: 'flex-end' }}>
                  <View
                    className="flex-row items-center gap-1 rounded-full"
                    style={{ backgroundColor: colors.warnSoft, paddingHorizontal: 9, paddingVertical: 3 }}
                  >
                    <Trophy color={colors.warn} size={12} />
                    <Text style={[typeScale.label, { color: colors.ink }]}>{rec.score}</Text>
                  </View>
                  <Text style={[typeScale.micro, { color: colors.faint, marginTop: 2 }]} numberOfLines={1}>
                    {isCreole ? 'pa' : 'par'} {rec.displayName}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: colors.surfaceAlt }}>
                <Text style={[typeScale.micro, { color: colors.muted }]}>
                  {isCreole ? 'Poko gen rekò !' : 'À prendre !'}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
    </>
  );
}

/* ─── Segmented control: Jouer · Records · Classement ─── */
function HubSegments({
  tab, onChange, isCreole,
}: { tab: HubTab; onChange: (t: HubTab) => void; isCreole: boolean }) {
  const colors = useColors();
  const { shadow } = useTheme();
  const segs: { id: HubTab; fr: string; ht: string }[] = [
    { id: 'jouer', fr: 'Jouer', ht: 'Jwe' },
    { id: 'records', fr: 'Records', ht: 'Rekò' },
    { id: 'classement', fr: 'Classement', ht: 'Klasman' },
  ];
  return (
    <View
      className="flex-row mx-4 mb-1"
      style={{ backgroundColor: colors.surfaceAlt, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: colors.border }}
      accessibilityRole="tablist"
    >
      {segs.map((s) => {
        const on = tab === s.id;
        return (
          <TouchableOpacity
            key={s.id}
            onPress={() => onChange(s.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={isCreole ? s.ht : s.fr}
            className="flex-1 items-center rounded-full"
            style={{
              paddingVertical: 7,
              backgroundColor: on ? colors.surface : 'transparent',
              ...(on ? shadow.sm : null),
            }}
          >
            <Text style={[typeScale.label, { color: on ? colors.azure : colors.muted }]}>
              {isCreole ? s.ht : s.fr}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ─── Hub ─── */
export default function JeuxHub({ onSelectGame, onStartTrivia, onStartDaily }: JeuxHubProps) {
  const { profile, level, isAuthed, daily } = useTrivia();
  const { streak } = useStreak();
  const { myRank } = useLeaderboard(25);
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { shadow } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const [tab, setTab] = useState<HubTab>('jouer');
  // Invite/referral sheet — the SAME component ProfileScreen opens (it fetches
  // the referral code itself, so there's nothing to wire here beyond visibility).
  const [inviteOpen, setInviteOpen] = useState(false);

  const highScores: Record<string, number> = profile?.games?.highScores || {};
  const gamesPlayed: number = profile?.games?.gamesPlayed || 0;
  const freezes: number = streak?.streakFreezes || 0;

  // Best personal record across the games — the one number worth bragging about
  // from the hub (XP/streak aren't a "score" a friend can beat). Null for a
  // brand-new player, which turns the block into invite-only (never share a 0).
  const bestPersonal = (() => {
    let bestId: string | null = null;
    let bestScore = 0;
    for (const g of GAMES) {
      const s = highScores[g.id];
      if (typeof s === 'number' && s > bestScore) { bestScore = s; bestId = g.id; }
    }
    const game = bestId ? GAMES.find((g) => g.id === bestId) : null;
    return game ? { game, score: bestScore } : null;
  })();

  // One records fetch feeds the weekly strip target and the Records segment.
  const [records, setRecords] = useState<Record<string, GameRecord>>({});
  const [recordsLoading, setRecordsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getGameRecords()
      .then((r: Record<string, GameRecord>) => { if (alive) setRecords(r || {}); })
      .finally(() => { if (alive) setRecordsLoading(false); });
    return () => { alive = false; };
  }, []);

  // Jeu de la semaine — rotates on the leaderboard's ISO week (Monday reset).
  const featuredId = weeklyGameId();
  const featured = GAMES.find((g) => g.id === featuredId) || null;
  const featuredRec = records[featuredId];

  const statChips = (
    <View className="flex-row" style={{ gap: 6 }}>
      <View
        className="flex-row items-center rounded-full border"
        style={{ gap: 4, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.surface, borderColor: colors.border }}
        accessible
        accessibilityLabel={`${level.xp} XP, ${isCreole ? 'nivo' : 'niveau'} ${level.level}`}
      >
        <Zap color={colors.azure} size={12} />
        <Text style={[typeScale.label, { color: colors.ink }]}>{level.xp}</Text>
      </View>
      <View
        className="flex-row items-center rounded-full border"
        style={{ gap: 4, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.surface, borderColor: colors.border }}
        accessible
        accessibilityLabel={`${isCreole ? 'Seri' : 'Série'} ${streak?.currentStreak || 0}${freezes > 0 ? `, ${freezes} ${isCreole ? 'jèl' : 'gel'}` : ''}`}
      >
        <Flame color={colors.danger} size={12} />
        <Text style={[typeScale.label, { color: colors.ink }]}>{streak?.currentStreak || 0}</Text>
        {freezes > 0 && (
          <>
            <Snowflake color={colors.azure} size={10} />
            <Text style={[typeScale.micro, { color: colors.azure }]}>{freezes}</Text>
          </>
        )}
      </View>
      <View
        className="flex-row items-center rounded-full border"
        style={{ gap: 4, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.surface, borderColor: colors.border }}
        accessible
        accessibilityLabel={`${gamesPlayed} ${isCreole ? 'pati' : 'parties'}`}
      >
        <Trophy color={colors.warn} size={12} />
        <Text style={[typeScale.label, { color: colors.ink }]}>{gamesPlayed}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: title + compact stat chips (replaces the old 3-card stats band) */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Text style={[typeScale.h1, { color: colors.ink }]}>{isCreole ? 'Jwèt' : 'Jeux'}</Text>
        {isAuthed ? statChips : null}
      </View>

      <HubSegments tab={tab} onChange={setTab} isCreole={isCreole} />

      {/* ── Jouer ── */}
      {tab === 'jouer' && (
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Défi du jour — stays first: it's the daily XP + streak protector. */}
          <View className="px-4 pb-2">
            <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={onStartDaily} />
          </View>

          {/* Jeu de la semaine — thin strip (was a tall hero card). */}
          {featured && (
            <View className="px-4 pb-3">
              <PressableScale
                onPress={() => (featured.id === 'trivia' ? onStartTrivia() : onSelectGame(featured.id))}
                accessibilityRole="button"
                accessibilityLabel={
                  isCreole
                    ? `Jwèt semèn nan: ${featured.nameHt}, XP fwa ${WEEKLY_GAME_XP_MULTIPLIER}`
                    : `Jeu de la semaine : ${featured.name}, XP fois ${WEEKLY_GAME_XP_MULTIPLIER}`
                }
                pressedScale={0.97}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: radius.control,
                  backgroundColor: featured.color,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  ...shadow.sm,
                  shadowColor: featured.color,
                }}
              >
                <Zap color="#fde68a" size={14} />
                <Text style={[typeScale.label, { color: '#ffffff', flexShrink: 1 }]} numberOfLines={1}>
                  {isCreole ? `Jwèt semèn nan : ${featured.nameHt}` : `Jeu de la semaine : ${featured.name}`}
                </Text>
                <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.85)', flex: 1 }]} numberOfLines={1}>
                  {featuredRec
                    ? (isCreole ? `· rekò ${featuredRec.score}` : `· record ${featuredRec.score}`)
                    : ''}
                </Text>
                <View
                  className="rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 8, paddingVertical: 2 }}
                >
                  <Text style={[typeScale.micro, { color: '#fff' }]}>XP ×{WEEKLY_GAME_XP_MULTIPLIER}</Text>
                </View>
              </PressableScale>
            </View>
          )}

          {/* Guest nudge — replaces the stat chips the un-signed-in can't have. */}
          {!isAuthed && (
            <View
              className="flex-row items-center mx-4 mb-3 px-4 py-3 rounded-2xl border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, gap: 12 }}
              accessible
              accessibilityLabel={isCreole
                ? 'Konekte pou swiv XP, seri ak pati ou yo'
                : 'Connecte-toi pour suivre tes XP, ta série et tes parties'}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.control,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.azureSoft,
                }}
              >
                <Sparkles color={colors.azure} size={18} />
              </View>
              <View className="flex-1">
                <Text style={[typeScale.titleSm, { color: colors.ink }]}>
                  {isCreole ? 'Konekte pou kenbe pwogrè w' : 'Connecte-toi pour suivre tes XP'}
                </Text>
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
                  {isCreole
                    ? 'XP, seri ak pati ap parèt isit la.'
                    : 'Tes XP, ta série et tes parties s\'afficheront ici.'}
                </Text>
              </View>
            </View>
          )}

          {/* Console grid — 6 round game buttons, 3 per row. The weekly game
              wears a gold ring + ×2 chip; personal bests sit under the name. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: GRID_PAD,
              rowGap: 14,
            }}
          >
            {GAMES.map((g) => {
              const Icon = GAME_ICONS[g.id];
              const hs = highScores[g.id];
              const isWeekly = g.id === featuredId;
              return (
                <PressableScale
                  key={g.id}
                  onPress={() => (g.id === 'trivia' ? onStartTrivia() : onSelectGame(g.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`${isCreole ? g.nameHt : g.name} — ${isCreole ? g.descriptionHt : g.description}${isWeekly ? (isCreole ? `, XP fwa ${WEEKLY_GAME_XP_MULTIPLIER}` : `, XP fois ${WEEKLY_GAME_XP_MULTIPLIER}`) : ''}`}
                  pressedScale={0.93}
                  style={{ width: COL_W, alignItems: 'center' }}
                >
                  <View
                    style={{
                      width: BTN,
                      height: BTN,
                      borderRadius: 19,
                      backgroundColor: g.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: g.color,
                      shadowOffset: { width: 0, height: 5 },
                      shadowOpacity: 0.32,
                      shadowRadius: 9,
                      elevation: 5,
                      ...(isWeekly
                        ? { borderWidth: 2.5, borderColor: '#fde68a' }
                        : null),
                    }}
                  >
                    <Icon color="#fff" size={BTN_ICON} />
                    {isWeekly && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -7,
                          right: -10,
                          backgroundColor: colors.warn,
                          borderRadius: 999,
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                        }}
                      >
                        <Text style={[typeScale.micro, { color: '#ffffff', fontSize: 9 }]}>×{WEEKLY_GAME_XP_MULTIPLIER}</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[typeScale.label, { color: colors.ink, marginTop: 6, textAlign: 'center' }]}
                    numberOfLines={1}
                  >
                    {isCreole ? g.nameHt : g.name}
                  </Text>
                  <Text style={[typeScale.micro, { color: colors.faint, marginTop: 1 }]} numberOfLines={1}>
                    {hs != null ? `🏆 ${hs}` : `~${g.minutes} min`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* My rank — the tab's built-in door to the Classement. */}
          <TouchableOpacity
            onPress={() => setTab('classement')}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Wè klasman an' : 'Voir le classement'}
            className="flex-row items-center mx-4 mt-5 px-4 py-3 rounded-2xl border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, gap: 10 }}
            activeOpacity={0.85}
          >
            <Crown color={colors.warn} size={18} />
            <View className="flex-1">
              <Text style={[typeScale.label, { color: colors.ink }]}>
                {myRank
                  ? (isCreole ? `Ou se ${myRank}ᵉ semèn sa a` : `Tu es ${myRank}ᵉ cette semaine`)
                  : (isCreole ? 'Klasman semèn nan' : 'Classement de la semaine')}
              </Text>
              <Text style={[typeScale.micro, { color: colors.muted, marginTop: 1 }]}>
                {myRank
                  ? (isCreole ? 'Wè klasman konplè a' : 'Voir le classement complet')
                  : (isCreole ? 'Jwe pou parèt nan klasman an !' : 'Joue pour apparaître au classement !')}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={16} />
          </TouchableOpacity>

          {/* Amis — fills the old dead space under the rank row: brag about the
              best record (text share w/ referral code baked in by scoreShare) and
              open the existing referral sheet. Signed-in only: the referral code
              endpoint needs an ID token, and guests already get the sign-in nudge
              above. New players see invite alone — no 0 to share. */}
          {isAuthed && (
            <View
              className="mx-4 mt-3 px-4 py-4 rounded-2xl border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.azureSoft,
                  }}
                >
                  <Gift color={colors.azure} size={18} />
                </View>
                <View className="flex-1">
                  <Text style={[typeScale.titleSm, { color: colors.ink }]}>
                    {isCreole ? 'Jwe ak zanmi w' : 'Joue avec tes amis'}
                  </Text>
                  <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
                    {bestPersonal
                      ? (isCreole
                          ? 'Pataje rekò w oswa envite yo — nou chak ap genyen yon bonus.'
                          : 'Partage ton record ou invite-les — vous gagnez chacun un bonus.')
                      : (isCreole
                          ? 'Envite yo jwe : nou chak ap genyen +1 jèl seri ak XP.'
                          : 'Invite-les à jouer : vous gagnez chacun +1 gel de série et des XP.')}
                  </Text>
                </View>
              </View>

              <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
                {bestPersonal && (
                  <PressableScale
                    onPress={() => {
                      void shareScore({
                        title: isCreole ? bestPersonal.game.nameHt : bestPersonal.game.name,
                        score: bestPersonal.score,
                        lang: isCreole ? 'ht' : 'fr',
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isCreole
                        ? `Pataje nòt mwen : ${bestPersonal.score} nan ${bestPersonal.game.nameHt}`
                        : `Partager mon score : ${bestPersonal.score} à ${bestPersonal.game.name}`
                    }
                    pressedScale={0.96}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingHorizontal: 10,
                      borderRadius: radius.control,
                      backgroundColor: colors.azureSoft,
                      borderWidth: 1,
                      borderColor: colors.azureBorder,
                    }}
                  >
                    <Share2 color={colors.azure} size={15} />
                    <Text style={[typeScale.label, { color: colors.azure, flexShrink: 1 }]} numberOfLines={1}>
                      {isCreole ? 'Pataje nòt mwen' : 'Partager mon score'}
                    </Text>
                  </PressableScale>
                )}
                <PressableScale
                  onPress={() => setInviteOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={isCreole ? 'Envite zanmi w yo vin jwe' : 'Inviter des amis à jouer'}
                  pressedScale={0.96}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingHorizontal: 10,
                    borderRadius: radius.control,
                    backgroundColor: colors.azure,
                    ...shadow.sm,
                  }}
                >
                  <UserPlus color="#ffffff" size={15} />
                  <Text style={[typeScale.label, { color: '#ffffff', flexShrink: 1 }]} numberOfLines={1}>
                    {isCreole ? 'Envite zanmi' : 'Inviter des amis'}
                  </Text>
                </PressableScale>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Records ── */}
      {tab === 'records' && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <GameRecords isCreole={isCreole} records={records} loading={recordsLoading} />
        </ScrollView>
      )}

      {/* ── Classement — the shared board, full mode, embedded in the tab ── */}
      {tab === 'classement' && (
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Leaderboard compact={false} maxRows={25} />
          <TouchableOpacity
            onPress={() => navigation.navigate('Leaderboard')}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Ouvri paj klasman konplè a' : 'Ouvrir la page classement complète'}
            className="items-center mt-3 py-2.5 rounded-full"
            style={{ backgroundColor: colors.azureSoft }}
            activeOpacity={0.85}
          >
            <Text style={[typeScale.label, { color: colors.azure }]}>
              {isCreole ? 'Paj konplè (lekòl, vil…)' : 'Page complète (écoles, villes…)'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Referral sheet (Modal) — mounted once at the root, driven by the Amis block. */}
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} lang={isCreole ? 'ht' : 'fr'} />
    </View>
  );
}
