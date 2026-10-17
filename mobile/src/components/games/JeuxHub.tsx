/**
 * JeuxHub — the games tab landing, "Ligue + Console" (chosen Aug 2026) on the
 * Arène's night (Stitch 08 / 08b, DIRECTION §8). One world for the whole tab:
 * Jouer, Arène, Records and Classement all sit on #050B1A with opaque tonal
 * cards, so switching segments never switches palettes.
 *
 *  - Header: page title + two opaque total chips (XP, série) — white, not
 *    gold: they are totals, not something just earned.
 *  - Segmented tone="night".
 *  - Jouer: Défi du jour feature card (the screen's one coral), the six games
 *    as 64px round console buttons in 3 columns (Ted's chosen shape; the
 *    rainbow fills are gone — every button is the same night tone), then the
 *    duel / invite / rank rows.
 *  - Arène: ArenaHubPanel (real school, real rank, real events only).
 *  - Records: community best per game + your own best.
 *  - Classement: the school race + the shared board in tone="night".
 */

import React, { useEffect, useState, useRef } from 'react';
import type { TriviaIntent } from '../../utils/triviaIntent';
import { View, Text, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Flame, Share2, Snowflake, Star, UserPlus, Swords, ChevronRight } from 'lucide-react-native';
import { GAMES, GAME_ICONS } from '../../data/games';
import { getGameRecords } from '../../services/leaderboardService';
import { weeklyGameId, WEEKLY_GAME_XP_MULTIPLIER } from '../../utils/weeklyGame';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import DailyChallengeBanner from './DailyChallengeBanner';
import DuelResults from './DuelResults';
import SchoolRace from '../trivia/SchoolRace';
import Leaderboard from '../Leaderboard';
import PressableScale from '../ui/PressableScale';
import { tapLight } from '../../utils/haptics';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../share/ShareCardCapture';
import InviteSheet from '../InviteSheet';
import { shareScore } from '../../services/scoreShare';
import ArenaHubPanel from '../arena/ArenaHubPanel';
import { ArenaButton } from '../arena/ArenaKit';
import { Avatar } from '../arena/art';
import ArenaWorld from '../arena/art/environment/ArenaWorld';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { NightRow, NightSection, StatChip, groupDigits, nightType } from './night';

const SIDE = 20;
// Cap so the 3-col console grid doesn't balloon on iPad (portrait +
// requireFullScreen → stable width). Phones fall under the cap unchanged.
const GRID_W = Math.min(Dimensions.get('window').width, 560);
const COL_W = Math.floor((GRID_W - SIDE * 2) / 3);
const BTN = 64; // round console button (jeux-ligue-console: 56–64, 3 columns)
const BTN_ICON = 26;

type HubTab = 'jouer' | 'arene' | 'records' | 'classement';

interface GameRecord {
  score: number;
  displayName: string;
  uid?: string;
}

interface JeuxHubProps {
  onSelectGame: (id: string) => void;
  /** Open Trivia for practice, or for a friend challenge (the duel path). */
  onStartTrivia: (intent?: TriviaIntent) => void;
  onStartDaily: () => void;
  /** Replay a duel's category — the rematch, straight from the result. */
  onRematch: (categoryId: string) => void;
}

/* ─── Records: best-ever score per arcade game + holder ─── */
function GameRecords({
  isCreole, records, loading, highScores,
}: { isCreole: boolean; records: Record<string, GameRecord>; loading: boolean; highScores: Record<string, number> }) {
  const user = useStore((s) => s.user);
  const shareRef = useRef<ShareCardCaptureHandle>(null);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const arcade = GAMES.filter((g) => g.id !== 'trivia');

  return (
    <>
      <ShareCardCapture ref={shareRef} />
      <NightSection
        title={t('Records de la communauté', 'Rekò kominote a')}
        meta={t('meilleur score par jeu', 'meyè nòt pa jwèt')}
        style={{ marginTop: 20 }}
      />
      <View style={{ gap: 10 }} accessibilityLiveRegion={loading ? 'polite' : 'none'}>
        {arcade.map((g) => {
          const rec = records[g.id];
          const Icon = GAME_ICONS[g.id];
          const mine = highScores[g.id];
          // The signed-in student holds this record → offer to share the N°1 card.
          const isHolder = !!rec?.uid && !!user?.uid && rec.uid === user.uid;
          const name = isCreole ? g.nameHt : g.name;
          return (
            <View
              key={g.id}
              accessible
              accessibilityLabel={[
                name,
                loading ? t('chargement', 'ap chaje') : rec ? t(`record ${rec.score} par ${rec.displayName}`, `rekò ${rec.score} pa ${rec.displayName}`) : t('record à prendre', 'rekò pou pran'),
                mine != null ? t(`ton record ${mine}`, `rekò pa w ${mine}`) : null,
              ].filter(Boolean).join(', ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: C.surface }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised }}>
                <Icon color={C.ink} size={20} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={[nightType.cardTitle, { color: C.ink }]}>{name}</Text>
                <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>
                  {loading
                    ? t('Chargement…', 'N ap chaje…')
                    : rec
                      ? t(`par ${rec.displayName}`, `pa ${rec.displayName}`)
                      : t('Personne encore : à prendre', 'Poko gen pèsonn : pou pran')}
                  {mine != null ? t(` · toi ${mine}`, ` · ou ${mine}`) : ''}
                </Text>
              </View>
              {isHolder ? (
                <PressableScale
                  onPress={() => shareRef.current?.share({ mode: 'rank', subject: g.name, scoreLabel: `${rec!.score}`, holder: rec!.displayName })}
                  hitSlop={8}
                  pressedScale={0.92}
                  accessibilityRole="button"
                  accessibilityLabel={t('Partager mon record', 'Pataje rekò mwen')}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Share2 color={C.ink} size={18} />
                </PressableScale>
              ) : null}
              {/* A record is an earned result → gold numeral. */}
              <Text style={[arenaType.num, { fontSize: 20, lineHeight: 24, color: rec ? C.gold : C.faint }]}>
                {rec ? rec.score : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

/* ─── One round console button ─── */
function ConsoleButton({
  id, isCreole, weekly, record, onPress,
}: { id: string; isCreole: boolean; weekly: boolean; record: number | undefined; onPress: () => void }) {
  const g = GAMES.find((x) => x.id === id)!;
  const Icon = GAME_ICONS[g.id];
  const name = isCreole ? g.nameHt : g.name;
  const sub = weekly
    ? (isCreole ? 'Jwèt semèn nan' : 'Jeu de la semaine')
    : record != null
      ? (isCreole ? `rekò ${record}` : `record ${record}`)
      : `~${g.minutes} min`;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${isCreole ? g.descriptionHt : g.description}${weekly ? (isCreole ? ` Jwèt semèn nan, XP fwa ${WEEKLY_GAME_XP_MULTIPLIER}.` : ` Jeu de la semaine, XP fois ${WEEKLY_GAME_XP_MULTIPLIER}.`) : ''}`}
      pressedScale={0.93}
      style={{ width: COL_W, alignItems: 'center' }}
    >
      <View style={{ width: BTN, height: BTN, borderRadius: BTN / 2, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={C.ink} size={BTN_ICON} strokeWidth={2.2} />
        {weekly ? (
          <View style={{ position: 'absolute', top: -6, right: -14, backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: C.onGold }} maxFontSizeMultiplier={1.2}>×{WEEKLY_GAME_XP_MULTIPLIER}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[arenaType.name, { fontSize: 15, color: C.ink, marginTop: 10, textAlign: 'center' }]}>{name}</Text>
      <Text numberOfLines={1} style={[arenaType.status, { color: weekly ? C.gold : C.muted, marginTop: 1, textAlign: 'center' }]}>{sub}</Text>
    </PressableScale>
  );
}

/**
 * The hub's four segments on the night. Same look as ui/Segmented tone="night"
 * (track #13243F, raised thumb, 48h, 15 bold white / muted), but each segment
 * takes the width its label needs: four equal quarters truncate "Classement"
 * on a 402pt phone. (Needs a `distribute="content"` option on ui/Segmented.)
 */
function HubSegments({ options, value, onChange }: { options: { key: HubTab; label: string }[]; value: HubTab; onChange: (k: HubTab) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', marginHorizontal: SIDE, padding: 4, minHeight: 48, borderRadius: 999, backgroundColor: C.surface }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={o.key}
            onPress={() => { if (!on) { tapLight(); onChange(o.key); } }}
            pressedScale={0.97}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{ flexGrow: 1, minHeight: 40, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.secondary : 'transparent' }}
          >
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: on ? C.ink : C.muted }}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ─── Hub ─── */
export default function JeuxHub({ onSelectGame, onStartTrivia, onStartDaily, onRematch }: JeuxHubProps) {
  const { profile, level, isAuthed, daily } = useTrivia();
  const { streak } = useStreak();
  const { myRank, myEntry } = useLeaderboard(25);
  const navigation = useNavigation<any>();
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [tab, setTab] = useState<HubTab>('jouer');
  // Invite/referral sheet — the SAME component ProfileScreen opens.
  const [inviteOpen, setInviteOpen] = useState(false);

  const highScores: Record<string, number> = profile?.games?.highScores || {};
  const freezes: number = streak?.streakFreezes || 0;
  const days = streak?.currentStreak || 0;

  // Best personal record across the games — the one number worth bragging
  // about. Null for a brand-new player (never share a 0).
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

  // One records fetch feeds the Records segment.
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
  const open = (id: string) => (id === 'trivia' ? onStartTrivia('practice') : onSelectGame(id));

  const segs: { key: HubTab; label: string }[] = [
    { key: 'jouer', label: t('Jouer', 'Jwe') },
    // The Arena's permanent home (audit #11): always one tap from the tab bar.
    { key: 'arene', label: t('Arène', 'Arèn') },
    { key: 'records', label: t('Records', 'Rekò') },
    { key: 'classement', label: t('Classement', 'Klasman') },
  ];

  const scrollPad = { paddingHorizontal: SIDE, paddingTop: 20, paddingBottom: 120 };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* The mornes and sea, still and barely there, along the bottom. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: '55%', opacity: 0.16 }]}>
        <ArenaWorld still />
      </View>

      {/* Header: title + total chips. No band. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: 16 }}>
        <Text accessibilityRole="header" style={[nightType.page, { color: C.ink }]}>{t('Jeux', 'Jwèt')}</Text>
        {isAuthed ? (
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 1 }}>
            <StatChip
              icon={<Star color={C.ink} size={16} />}
              label={`${groupDigits(level.xp)} XP`}
              accessibilityLabel={t(`${level.xp} XP, niveau ${level.level}`, `${level.xp} XP, nivo ${level.level}`)}
            />
            <StatChip
              icon={freezes > 0 ? <Snowflake color={C.signal} size={16} /> : <Flame color={C.coral} size={16} />}
              label={t(`Série ${days} j`, `Seri ${days} j`)}
              accessibilityLabel={t(`Série de ${days} jours${freezes > 0 ? `, ${freezes} gel` : ''}`, `Seri ${days} jou${freezes > 0 ? `, ${freezes} jèl` : ''}`)}
            />
          </View>
        ) : null}
      </View>

      <HubSegments options={segs} value={tab} onChange={setTab} />

      {/* ── Jouer ── */}
      {tab === 'jouer' && (
        <ScrollView contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          {/* Défi du jour — first: the daily XP + streak protector. */}
          <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={onStartDaily} />

          {/* What came back from the duels you sent — nothing until an
              opponent has actually played one. */}
          <DuelResults isCreole={isCreole} onRematch={onRematch} />

          <NightSection title={t('Tous les jeux', 'Tout jwèt yo')} meta={t(`${GAMES.length} disponibles`, `${GAMES.length} disponib`)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 22 }}>
            {GAMES.map((g) => (
              <ConsoleButton
                key={g.id}
                id={g.id}
                isCreole={isCreole}
                weekly={g.id === featuredId}
                record={highScores[g.id]}
                onPress={() => open(g.id)}
              />
            ))}
          </View>

          <View style={{ gap: 10, marginTop: 28 }}>
            {/* A duel starts from a round: play, then send the same questions. */}
            <NightRow
              leading={(
                <View style={{ width: 64, height: 40 }}>
                  <View style={{ position: 'absolute', left: 0 }}>
                    <Avatar seed={user?.uid || 'toi'} size={40} />
                  </View>
                  <View style={{ position: 'absolute', left: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}>
                    <Swords color={C.onCoral} size={18} />
                  </View>
                </View>
              )}
              title={t('Défier un ami', 'Defye yon zanmi')}
              meta={t('Joue une manche, puis envoie-lui les mêmes questions', 'Jwe yon manch, epi voye menm kesyon yo ba li')}
              onPress={() => onStartTrivia('challenge')}
            />

            {isAuthed ? (
              <NightRow
                leading={(
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <UserPlus color={C.ink} size={18} />
                  </View>
                )}
                title={t('Inviter des amis', 'Envite zanmi')}
                meta={t('Vous gagnez chacun +1 gel de série et des XP', 'Nou chak genyen +1 jèl seri ak XP')}
                onPress={() => setInviteOpen(true)}
              />
            ) : null}

            {isAuthed && bestPersonal ? (
              <NightRow
                leading={(
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Share2 color={C.ink} size={18} />
                  </View>
                )}
                title={t('Partager mon meilleur score', 'Pataje pi bon nòt mwen')}
                meta={`${isCreole ? bestPersonal.game.nameHt : bestPersonal.game.name} · ${bestPersonal.score}`}
                onPress={() => {
                  void shareScore({
                    title: isCreole ? bestPersonal.game.nameHt : bestPersonal.game.name,
                    score: bestPersonal.score,
                    lang: isCreole ? 'ht' : 'fr',
                  });
                }}
              />
            ) : null}

            {/* My rank — the tab's built-in door to the Classement. */}
            <PressableScale
              onPress={() => setTab('classement')}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={myRank
                ? t(`Tu es ${myRank}e cette semaine. Voir le classement`, `Ou se ${myRank}yèm semèn sa a. Wè klasman an`)
                : t('Voir le classement de la semaine', 'Wè klasman semèn nan')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.surface }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[nightType.cardTitle, { color: C.ink }]}>
                  {myRank ? t(`Tu es ${myRank}ᵉ cette semaine`, `Ou se ${myRank}yèm semèn sa a`) : t('Classement de la semaine', 'Klasman semèn nan')}
                </Text>
                <Text style={[arenaType.status, { color: C.muted }]}>
                  {myRank ? t('Voir le classement complet', 'Wè tout klasman an') : t('Joue pour y apparaître', 'Jwe pou w parèt ladan l')}
                </Text>
              </View>
              {myRank && myEntry ? (
                <Text style={[arenaType.num, { fontSize: 18, color: C.ink }]}>{groupDigits((myEntry as any).xp ?? 0)} XP</Text>
              ) : null}
              <ChevronRight color={C.muted} size={20} />
            </PressableScale>

            {!isAuthed ? (
              <View style={{ padding: 20, gap: 12, borderRadius: 20, backgroundColor: C.surface }}>
                <Text style={[nightType.cardTitle, { color: C.ink }]}>{t('Connecte-toi pour garder tes XP', 'Konekte pou kenbe XP ou')}</Text>
                <Text style={[arenaType.body, { color: C.muted }]}>
                  {t('Tes XP, ta série et tes records s’afficheront ici, et ton école pourra compter sur toi.', 'XP ou, seri ou ak rekò ou ap parèt isit la, epi lekòl ou ka konte sou ou.')}
                </Text>
                <ArenaButton variant="secondary" label={t('Se connecter', 'Konekte')} onPress={toggleAuthModal} />
              </View>
            ) : null}
          </View>
        </ScrollView>
      )}

      {/* ── Arène — the competition world ── */}
      {tab === 'arene' && (
        <ScrollView contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          <ArenaHubPanel onPractice={() => onStartTrivia('practice')} onDuel={() => onStartTrivia('challenge')} />
        </ScrollView>
      )}

      {/* ── Records ── */}
      {tab === 'records' && (
        <ScrollView contentContainerStyle={{ ...scrollPad, paddingTop: 0 }} showsVerticalScrollIndicator={false}>
          <GameRecords isCreole={isCreole} records={records} loading={recordsLoading} highScores={highScores} />
        </ScrollView>
      )}

      {/* ── Classement — the race, then the shared board, embedded ── */}
      {tab === 'classement' && (
        <ScrollView contentContainerStyle={scrollPad} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            <SchoolRace isCreole={isCreole} />
            <Leaderboard compact={false} maxRows={25} tone="night" />
            <ArenaButton
              variant="secondary"
              label={t('Page complète : écoles, villes…', 'Paj konplè : lekòl, vil…')}
              onPress={() => navigation.navigate('Leaderboard')}
            />
          </View>
        </ScrollView>
      )}

      {/* Referral sheet (Modal) — mounted once at the root. */}
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} lang={isCreole ? 'ht' : 'fr'} />
    </View>
  );
}
