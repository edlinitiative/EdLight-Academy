/**
 * The Arène as an arcade, on the phone — the native port of the web /arena
 * (src/pages/arena/ArenaArcade.tsx; Ted, Oct 2026: "it should almost feel
 * like an arcade game", then "on the mobile phone - i don't get the arena
 * experience?").
 *
 * One continuous night, top to bottom, rendered in both Arène hosts (the
 * ArenaHub root route and the Jeux tab's Arène segment):
 *
 *   city      the night city: real schools as pixel buildings, tallest in the
 *             middle, yours lit; the real standings on a ticker (ArenaCity)
 *   lobby     you, your school's real place this week, your rival (the shared
 *             rule — never invented), or the one step that is missing
 *   champ     the championship cabinet: the one event action that applies
 *             now (ArenaHubPanel variant="arcade" — rejoin, results, register,
 *             watch, alerts), or the honest "nothing scheduled"
 *   cabinets  Mode Histoire · Défi d'un ami · Partie rapide · Tournoi privé ·
 *             Mini-jeux · Classement (arcadeCabinets.ts pins each destination)
 *   podium    the top qualified schools on podium steps, the rest listed,
 *             schools still forming their five apart and unnumbered
 *
 * Every number comes from the board or the student's own progress.
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { ChevronRight, Crown, LogIn, School as SchoolIcon, Star, Users } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useArenaHub } from '../../hooks/useArena';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives, useLeaderboard } from '../../hooks/useLeaderboard';
import { useMyAvatar } from '../../hooks/useMyAvatar';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { normalizeName, rankTeams, teamStandingFor, TEAM_SIZE, type TeamStanding } from '../../../../shared/leaderboardAgg';
import { cityLineup } from '../../../../shared/arena/arcadeCity';
import { splitPodium } from '../../../../shared/arena/podium';
import { pickRival, type WeeklyEntry } from '../../../../shared/arena/rival';
import { MAX_STARS, STORY_CHAPTERS, nextStage, totalStars } from '../../../../shared/arenaStory';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { groupDigits } from '../games/night';
import PressableScale from '../ui/PressableScale';
import { ArenaButton } from './ArenaKit';
import ArenaHubPanel from './ArenaHubPanel';
import arenaHaptics from './arenaHaptics';
import { cabinetAction, cabinetCopy, GRID_CABINETS, type CabinetAction, type CabinetKey } from './arcadeCabinets';
import Avatar from './art/avatars/Avatar';
import SchoolCrest from './art/crest/SchoolCrest';
import ArenaCity from './city/ArenaCity';
import CabinetArt from './city/CabinetArt';
import SchoolBuilding from './city/SchoolBuilding';

type T = (fr: string, ht: string) => string;

/** Weekly entries the lobby reads (the rival rule needs to know the page size). */
const BOARD_PAGE = 50;
const SIDE = 16;

export interface ArenaArcadeProps {
  onPractice: () => void;
  onDuel: () => void;
  /** Open the mini-games (the Jeux tab's Jouer segment). */
  onMiniGames: () => void;
}

export default function ArenaArcade({ onPractice, onDuel, onMiniGames }: ArenaArcadeProps) {
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const signedIn = !!user?.uid;

  const hub = useArenaHub();
  const { profile, level } = useTrivia();
  const { avatar: myAvatar } = useMyAvatar();
  const { progress } = useStoryProgress();

  // The city and the podium stand on the all-time board (as on the web);
  // the lobby's "this week" lines on the weekly one.
  const { groups: allGroups } = useCollectives('school', 'all');
  const { groups: weekGroups } = useCollectives('school', 'week');
  const { entries, myEntry, myRank } = useLeaderboard(BOARD_PAGE, 'week');

  const mySchool: string | null = signedIn
    ? (((profile?.leaderboard as any)?.school || (myEntry as any)?.school || null) as string | null)
    : null;
  const myKey = mySchool ? normalizeName(mySchool) : null;

  const standings = useMemo(() => rankTeams(allGroups ?? []), [allGroups]);
  const myTeamAll = useMemo(() => (mySchool ? teamStandingFor(standings, mySchool) : null), [standings, mySchool]);
  const towers = useMemo(() => cityLineup(standings, myTeamAll), [standings, myTeamAll]);
  const board = useMemo(() => splitPodium(standings), [standings]);

  const weekStandings = useMemo(() => rankTeams(weekGroups ?? []), [weekGroups]);
  const myWeek = useMemo(() => (mySchool ? teamStandingFor(weekStandings, mySchool) : null), [weekStandings, mySchool]);
  const qualifiedWeek = useMemo(() => weekStandings.filter((s) => s.qualified).length, [weekStandings]);
  const rival = useMemo(() => pickRival({
    entries: entries as WeeklyEntry[], uid: user?.uid || null, myXp: Number((myEntry as any)?.xp) || 0,
    myRank: myRank ?? null, school: mySchool, pageSize: BOARD_PAGE,
  }), [entries, user?.uid, myEntry, myRank, mySchool]);
  const pseudo = (((profile?.leaderboard as any)?.displayName || (myEntry as any)?.displayName || '') as string).trim() || null;

  const storyNext = nextStage(progress);
  const stars = totalStars(progress);

  const run = (action: CabinetAction) => {
    arenaHaptics.choose();
    if (action.kind === 'practice') onPractice();
    else if (action.kind === 'duel') onDuel();
    else if (action.kind === 'mini') onMiniGames();
    else navigation.navigate(action.screen, action.params);
  };
  const open = (key: CabinetKey) => run(cabinetAction(key, hub.primary));

  const eventOpen = hub.primary.kind !== 'none';

  return (
    <View testID="arena-arcade">
      <ArenaCity towers={towers} myKey={myKey} standings={standings} animate={focused} t={t} />

      <View style={{ paddingHorizontal: SIDE, paddingTop: 18, gap: 16 }}>
        {/* ═══ The lobby ═══════════════════════════════════════════════ */}
        <View style={{ padding: 18, gap: 14, borderRadius: 24, backgroundColor: C.surfaceRaised }}>
          {signedIn ? (
            <View
              accessible
              accessibilityLabel={[
                pseudo || t('Toi', 'Ou'),
                t(`niveau ${level?.level || 1}`, `nivo ${level?.level || 1}`),
                myRank ? t(`${myRank}e cette semaine`, `${myRank}yèm semèn sa a`) : null,
              ].filter(Boolean).join(', ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <Avatar seed={user?.uid || 'toi'} config={myAvatar} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, color: C.ink }}>
                  {pseudo || t('Toi', 'Ou')}
                </Text>
                <Text style={[arenaType.status, { color: C.muted }]}>
                  {t(`Niveau ${level?.level || 1}`, `Nivo ${level?.level || 1}`)}
                  {myRank ? t(` · ${myRank}e cette semaine`, ` · ${myRank}yèm semèn sa a`) : ''}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={[arenaType.title, { color: C.ink }]}>{t('Ton école. Ton rival. Ta prochaine victoire.', 'Lekòl ou. Rival ou. Pwochen viktwa ou.')}</Text>
              <Text style={[arenaType.body, { color: C.muted }]}>
                {t('Tu peux jouer sans compte. Connecte-toi pour que tes points comptent pour ton école.', 'Ou ka jwe san kont. Konekte pou pwen ou konte pou lekòl ou.')}
              </Text>
              <ArenaButton variant="secondary" label={t('Se connecter', 'Konekte')} onPress={toggleAuthModal} icon={<LogIn color={C.ink} size={16} />} style={{ backgroundColor: C.surface }} />
            </View>
          )}

          {signedIn && mySchool ? (
            <View
              accessible
              accessibilityLabel={[
                t(`Tu joues pour ${mySchool}`, `W ap jwe pou ${mySchool}`),
                schoolPlaceLine(myWeek, qualifiedWeek, t),
              ].join(', ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: C.surface }}
            >
              <SchoolCrest name={mySchool} size={40} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text numberOfLines={2} style={[arenaType.name, { color: C.ink }]}>{mySchool}</Text>
                <Text style={[arenaType.status, { color: myWeek?.qualified ? C.inkSoft : C.warn }]}>{schoolPlaceLine(myWeek, qualifiedWeek, t)}</Text>
              </View>
            </View>
          ) : signedIn ? (
            <ArenaButton
              variant="secondary"
              label={t('Choisir mon école', 'Chwazi lekòl mwen')}
              accessibilityHint={t('Son bâtiment apparaîtra dans la ville', 'Batiman l ap parèt nan vil la')}
              onPress={() => run({ kind: 'navigate', screen: 'Leaderboard' })}
              icon={<SchoolIcon color={C.ink} size={16} />}
              style={{ backgroundColor: C.surface }}
            />
          ) : null}

          {signedIn && rival.status === 'rival' ? (
            <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar seed={rival.entry.id} size={36} />
              <Text style={[arenaType.status, { flex: 1, color: C.inkSoft }]}>
                {rival.scope === 'school'
                  ? t(`Ton rival dans ton école : ${rival.entry.displayName || 'un joueur'}, ${groupDigits(rival.gap)} XP devant toi.`, `Rival ou nan lekòl ou : ${rival.entry.displayName || 'yon jwè'}, ${groupDigits(rival.gap)} XP devan w.`)
                  : t(`Ton rival : ${rival.entry.displayName || 'un joueur'}, ${groupDigits(rival.gap)} XP devant toi.`, `Rival ou : ${rival.entry.displayName || 'yon jwè'}, ${groupDigits(rival.gap)} XP devan w.`)}
              </Text>
            </View>
          ) : signedIn && rival.status === 'leader' ? (
            <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Crown color={C.gold} size={20} />
              <Text style={[arenaType.status, { flex: 1, color: C.inkSoft }]}>{t('Tu es en tête cette semaine. Garde ta place.', 'Ou an tèt semèn sa a. Kenbe plas ou.')}</Text>
            </View>
          ) : null}
        </View>

        {/* ═══ The championship cabinet ════════════════════════════════ */}
        <View style={{ padding: 16, gap: 14, borderRadius: 24, backgroundColor: C.surfaceAlt }}>
          <Marquee title={cabinetCopy('champ', t).title} accent={C.coral} live={eventOpen} t={t} />
          <View style={{ borderRadius: 16, backgroundColor: '#081226', overflow: 'hidden' }}>
            <CabinetArt kind="champ" accent={C.coral} width={300} />
          </View>
          <ArenaHubPanel variant="arcade" onPractice={onPractice} onDuel={onDuel} />
          {!eventOpen ? (
            <ArenaButton
              variant="secondary"
              label={t('Comment ça marche', 'Kijan sa mache')}
              onPress={() => open('champ')}
              style={{ backgroundColor: C.surface }}
            />
          ) : null}
        </View>

        {/* ═══ The cabinets ═══════════════════════════════════════════ */}
        <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink, marginTop: 4 }]}>{t('Choisis ta borne', 'Chwazi bòn ou')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {GRID_CABINETS.map((key) => {
            const copy = cabinetCopy(key, t, {
              storyNextDept: storyNext ? STORY_CHAPTERS[storyNext.chapter].dept : null,
              storyStarted: stars > 0,
            });
            return (
              <Cabinet
                key={key}
                kind={key}
                copy={copy}
                onPress={() => open(key)}
                badge={key === 'story' ? `${stars}/${MAX_STARS}` : null}
                progress={key === 'story' ? progress : undefined}
                t={t}
              />
            );
          })}
        </View>

        <Row
          icon={<Users color={C.signal} size={20} />}
          title={t('Mon activité', 'Aktivite mwen')}
          sub={t('Équipes, invitations et compétitions', 'Ekip, envitasyon ak konpetisyon')}
          onPress={() => open('activity')}
        />

        {/* ═══ The podium ═════════════════════════════════════════════ */}
        {board.ranked.length > 0 || board.forming.length > 0 ? (
          <Podium board={board} myKey={myKey} onAll={() => open('board')} t={t} />
        ) : null}
      </View>
    </View>
  );
}

function schoolPlaceLine(s: TeamStanding | null, qualified: number, t: T): string {
  if (!s) return t('Pas encore classée cette semaine', 'Poko klase semèn sa a');
  if (s.qualified && s.rank > 0) return t(`${s.rank}e sur ${qualified} écoles cette semaine`, `${s.rank}yèm sou ${qualified} lekòl semèn sa a`);
  return t(
    `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} joueurs · il en manque ${s.needed}`,
    `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} jwè · manke ${s.needed}`,
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

/** An arcade marquee: a row of bulbs in the mode's colour, then its name. */
function Marquee({ title, accent, live = false, t }: { title: string; accent: string; live?: boolean; t: T }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 5 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent, opacity: i % 2 ? 0.55 : 1 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>{title}</Text>
        {live ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#3A2530' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.live }} />
            <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.coral }]}>{t('Ouvert', 'Louvri')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Cabinet({
  kind, copy, onPress, badge, progress, t,
}: {
  kind: CabinetKey;
  copy: ReturnType<typeof cabinetCopy>;
  onPress: () => void;
  badge?: string | null;
  progress?: any;
  t: T;
}) {
  return (
    <PressableScale
      testID={`cabinet-${kind}`}
      onPress={onPress}
      pressedScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={[copy.title, copy.sub, badge ? t(`${badge} étoiles`, `${badge} zetwal`) : null].filter(Boolean).join('. ')}
      accessibilityHint={copy.cta}
      style={{ flexGrow: 1, flexBasis: '46%', minHeight: 44, padding: 14, gap: 10, borderRadius: 22, backgroundColor: C.surface }}
    >
      <Marquee title={copy.title} accent={copy.accent} t={t} />
      <View style={{ borderRadius: 14, backgroundColor: '#081226', overflow: 'hidden' }}>
        <CabinetArt kind={kind} accent={copy.accent} width={150} progress={progress} />
      </View>
      <Text style={[arenaType.status, { color: C.muted }]}>{copy.sub}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
        {badge ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 'auto' }}>
            <Star color={C.gold} fill={C.gold} size={14} />
            <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.inkSoft, fontVariant: ['tabular-nums'] }]}>{badge}</Text>
          </View>
        ) : null}
        <Text style={[arenaType.action, { fontSize: 15, color: copy.accent, marginLeft: badge ? 0 : 'auto' }]}>{copy.cta}</Text>
        <ChevronRight color={copy.accent} size={16} />
      </View>
    </PressableScale>
  );
}

function Row({ icon, title, sub, onPress }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${sub}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: C.surface }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised }}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[arenaType.name, { color: C.ink }]}>{title}</Text>
        <Text style={[arenaType.status, { color: C.muted }]}>{sub}</Text>
      </View>
      <ChevronRight color={C.muted} size={18} />
    </PressableScale>
  );
}

function Podium({ board, myKey, onAll, t }: { board: ReturnType<typeof splitPodium>; myKey: string | null; onAll: () => void; t: T }) {
  const steps = board.podium.length === 3 ? [board.podium[1], board.podium[0], board.podium[2]] : [];
  return (
    <View style={{ gap: 14, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[arenaType.label, { color: C.muted }]}>{t('Toutes saisons', 'Tout sezon')}</Text>
          <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>{t('Les écoles en tête', 'Lekòl ki an tèt yo')}</Text>
        </View>
      </View>

      {steps.length ? (
        <View
          accessibilityRole="list"
          accessibilityLabel={t('Les trois premières écoles qualifiées', 'Twa premye lekòl ki kalifye yo')}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
        >
          {steps.map((s, i) => {
            const place = [2, 1, 3][i];
            return (
              <View
                key={s.key}
                accessible
                accessibilityLabel={t(`${place}e : ${s.label}, ${groupDigits(s.teamXp)} XP`, `${place}yèm : ${s.label}, ${groupDigits(s.teamXp)} XP`)}
                style={{ flex: 1, alignItems: 'center', gap: 6 }}
              >
                <SchoolBuilding name={s.label} floors={[5, 7, 4][i]} night cell={place === 1 ? 4 : 3} />
                <View
                  style={{
                    alignSelf: 'stretch', alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 6,
                    minHeight: [86, 112, 70][i], borderRadius: 14,
                    backgroundColor: myKey === s.key ? C.signalSoft : C.surfaceRaised,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {place === 1 ? <Crown color={C.gold} size={18} /> : null}
                    <Text style={[arenaType.title, { color: place === 1 ? C.gold : C.ink }]}>{place}</Text>
                  </View>
                  <Text numberOfLines={2} style={[arenaType.status, { fontFamily: fonts.bold, color: C.ink, textAlign: 'center' }]}>{s.label}</Text>
                  <Text style={[arenaType.status, { color: C.muted, fontVariant: ['tabular-nums'] }]}>{groupDigits(s.teamXp)} XP</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {board.rest.length ? (
        <View style={{ gap: 8 }}>
          {board.rest.map((s) => (
            <View
              key={s.key}
              accessible
              accessibilityLabel={`${s.rank}. ${s.label}, ${groupDigits(s.teamXp)} XP`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: myKey === s.key ? C.signalSoft : C.surface }}
            >
              <Text style={[arenaType.num, { color: C.muted, minWidth: 24 }]}>{s.rank}</Text>
              <SchoolBuilding name={s.label} floors={3} night cell={2} />
              <Text numberOfLines={1} style={[arenaType.name, { flex: 1, color: C.ink }]}>{s.label}</Text>
              <Text style={[arenaType.num, { color: C.inkSoft }]}>{groupDigits(s.teamXp)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {board.ranked.length === 0 ? (
        <Text style={[arenaType.body, { color: C.muted }]}>
          {t(`Aucune école n’a encore ses ${TEAM_SIZE} joueurs : la première place est à prendre.`, `Poko gen lekòl ki gen ${TEAM_SIZE} jwè li : premye plas la lib.`)}
        </Text>
      ) : null}

      {board.forming.length ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={[arenaType.name, { color: C.ink }]}>{t('En formation', 'Ap fòme')}</Text>
          <Text style={[arenaType.status, { color: C.muted }]}>
            {t(`Pas encore classées : une école compte à partir de ${TEAM_SIZE} joueurs.`, `Poko klase : yon lekòl konte apati ${TEAM_SIZE} jwè.`)}
          </Text>
          {board.forming.map((s) => (
            <View
              key={s.key}
              accessible
              accessibilityLabel={t(`${s.label}, ${Math.min(s.members, TEAM_SIZE)} joueurs sur ${TEAM_SIZE}, il en manque ${s.needed}`, `${s.label}, ${Math.min(s.members, TEAM_SIZE)} jwè sou ${TEAM_SIZE}, manke ${s.needed}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: myKey === s.key ? C.signalSoft : C.surface }}
            >
              <SchoolCrest name={s.label} size={32} />
              <Text numberOfLines={1} style={[arenaType.name, { flex: 1, color: C.ink }]}>{s.label}</Text>
              <Text style={[arenaType.status, { color: C.inkSoft, fontVariant: ['tabular-nums'] }]}>{`${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <ArenaButton variant="secondary" label={t('Classement complet', 'Tout klasman an')} onPress={onAll} />
    </View>
  );
}
