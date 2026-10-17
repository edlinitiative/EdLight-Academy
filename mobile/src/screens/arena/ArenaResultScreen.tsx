import React, { useEffect, useRef } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share2, Trophy, Target, Timer, Users, Zap } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useArenaResult } from '../../hooks/useArena';
import StageEnter from '../../components/trivia/StageEnter';
import ScoreCounter from '../../components/trivia/ScoreCounter';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../../components/share/ShareCardCapture';
import { ArenaScreen, ArenaPanel, ArenaButton, ArenaStateView, StatusPill, StaleBanner } from '../../components/arena/ArenaKit';
import SchoolCrest from '../../components/arena/art/crest/SchoolCrest';
import { ParticipationBadge } from '../../components/arena/art/emblems/RankEmblem';
import arenaHaptics from '../../components/arena/arenaHaptics';
import { celebrationKey, type ResultSummary } from '../../utils/arenaResultTier';
import { arenaColors as C, arenaType, arenaRadius } from '../../theme/arenaTheme';
import type { RootParamList } from '../../navigation/AppNavigator';

/**
 * What a student sees when it is over (audit #14).
 *
 * ONE headline, picked by utils/arenaResultTier.ts from real data:
 * routine completion, personal best, team qualification, a prize, or the
 * championship — each worded for what it is, and the championship stated as
 * a title ONLY when the event is final. Everything before that is labelled
 * provisional, plainly: prizes are held until integrity review completes, and
 * a "you won" that is later taken back in public costs more than an honest
 * wait.
 *
 * Then the contribution, explained — including for the students outside their
 * school's counting five, who are most of the room. Then ONE next action. No
 * rematches, ratings or titles that do not exist for the championship.
 *
 * Celebration is proportional and happens once: a confirmed title or prize
 * gets the success haptic the first time this screen shows it (keyed per
 * event and tier, persisted), a calm tier gets nothing louder than its words,
 * and a routine completion gets no effect at all.
 */

type Nav = NativeStackNavigationProp<RootParamList, 'ArenaResult'>;
type Route = RouteProp<RootParamList, 'ArenaResult'>;
type T = (fr: string, ht: string) => string;

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{
        flex: 1, padding: 14, gap: 5, borderRadius: arenaRadius.card,
        backgroundColor: C.surface,
      }}
    >
      {icon}
      <Text style={[arenaType.num, { color: C.ink, fontSize: 18 }]}>{value}</Text>
      <Text style={[arenaType.status, { color: C.muted }]}>{label}</Text>
    </View>
  );
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** The headline for the tier. Pure copy; the tier itself is decided elsewhere. */
function headline(summary: ResultSummary, school: string, rank: number, prize: number, scoreGain: number | null, t: T) {
  switch (summary.tier) {
    case 'championConfirmed':
      return {
        title: t(`${school} remporte le championnat`, `${school} genyen chanpyona a`),
        sub: t('Résultat officiel, après vérification.', 'Rezilta ofisyèl, apre verifikasyon.'),
      };
    case 'championProvisional':
      return {
        title: t(`${school} termine en tête`, `${school} fini an tèt`),
        sub: t(
          'Résultat provisoire : le titre sera confirmé après la vérification.',
          'Rezilta pwovizwa : y ap konfime tit la apre verifikasyon an.',
        ),
      };
    case 'prizeConfirmed':
      return {
        title: t(`Tu as gagné ${money(prize)}`, `Ou genyen ${money(prize)}`),
        sub: t('Résultat officiel, après vérification.', 'Rezilta ofisyèl, apre verifikasyon.'),
      };
    case 'prizeProvisional':
      return {
        title: t(`Tu es dans les places payées : ${money(prize)}`, `Ou nan plas ki peye yo : ${money(prize)}`),
        sub: t('Provisoire, en attente de vérification.', 'Pwovizwa, n ap tann verifikasyon.'),
      };
    case 'teamQualified':
      return {
        title: rank > 0
          ? t(`${school} termine ${rank}${rank === 1 ? 're' : 'e'}`, `${school} fini ${rank}yèm`)
          : t(`${school} s’est qualifiée`, `${school} kalifye`),
        sub: t('Ton école avait ses cinq joueurs présents et a été classée.', 'Lekòl ou te gen senk jwè li prezan e yo klase l.'),
      };
    case 'personalBest':
      return {
        title: t('Ton meilleur score dans l’Arène', 'Pi bon nòt ou nan Arèn nan'),
        sub: scoreGain != null && scoreGain > 0
          ? t(`${scoreGain} points de plus qu’au championnat précédent.`, `${scoreGain} pwen plis pase chanpyona anvan an.`)
          : t('Mieux qu’au championnat précédent.', 'Pi bon pase chanpyona anvan an.'),
      };
    case 'completed':
      return {
        title: t('Championnat terminé', 'Chanpyona a fini'),
        sub: t('Tu as joué jusqu’au bout pour ton école.', 'Ou jwe jiska lafen pou lekòl ou.'),
      };
    case 'recorded':
    default:
      return {
        title: t('Tes réponses sont enregistrées', 'Repons ou yo anrejistre'),
        sub: t('Ton score apparaîtra ici dès qu’il sera publié.', 'Nòt ou ap parèt isit la le l pibliye.'),
      };
  }
}

function contributionText(summary: ResultSummary, school: string, teamSize: number, t: T): string | null {
  switch (summary.contribution) {
    case 'inFive':
      return t(
        `Tu faisais partie des ${teamSize} qui comptent pour ${school} : ton score entre dans la moyenne de l’école.`,
        `Ou te nan ${teamSize} ki konte pou ${school} yo : nòt ou antre nan mwayèn lekòl la.`,
      );
    case 'outsideFive':
      return t(
        `La moyenne de ${school} est faite de ses ${teamSize} meilleurs scores présents. Tu n’en faisais pas partie cette fois : ton score compte au classement individuel, et pour entrer dans les ${teamSize}, il faut dépasser le ${teamSize}e de ton école.`,
        `Mwayèn ${school} fèt ak ${teamSize} pi bon nòt prezan li yo. Ou pa t ladan fwa sa a : nòt ou konte nan klasman endividyèl la, e pou w antre nan ${teamSize} yo, fòk ou depase ${teamSize}yèm lekòl ou a.`,
      );
    case 'schoolNotQualified':
      return t(
        `${school} n’avait pas ${teamSize} joueurs présents à l’ouverture des portes, donc l’école n’a pas été classée. Ton score compte au classement individuel.`,
        `${school} pa t gen ${teamSize} jwè prezan lè pòt yo louvri, kidonk yo pa t klase lekòl la. Nòt ou konte nan klasman endividyèl la.`,
      );
    default:
      return null;
  }
}

export default function ArenaResultScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const tournamentId = route.params?.tournamentId ?? '';
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const shareRef = useRef<ShareCardCaptureHandle>(null);

  const result = useArenaResult(tournamentId);
  const {
    tournament, me, mySchool, schoolName, accuracyPct, avgMs, calculating, provisional,
    prizeCents, summary, nextTournamentId, status, stale, previousScore,
  } = result;

  /*
   * Celebrate once. The key is persisted so a revisit (or a re-render when the
   * standings tick) never replays it; only the 'big' tiers fire at all.
   */
  useEffect(() => {
    if (!tournamentId || summary.celebration !== 'big') return;
    const key = celebrationKey(tournamentId, summary.tier);
    let alive = true;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (!alive || seen) return;
        if (arenaHaptics.celebrate(key)) AsyncStorage.setItem(key, '1').catch(() => undefined);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tournamentId, summary.celebration, summary.tier]);

  const toHub = () => navigation.navigate('ArenaHub');

  if (!tournamentId || status === 'loading' || status === 'unavailable' || status === 'denied' || (status === 'reconnecting' && !tournament)) {
    return (
      <ArenaScreen>
        <ArenaStateView status={!tournamentId ? 'unavailable' : status} t={t} onRetry={result.retry} onReturn={toHub} />
      </ArenaScreen>
    );
  }

  /*
   * The scores are still settling. Withholding here is deliberate: showing a
   * rank that then moves is worse than a short wait, and the broadcast is
   * running its own "calcul des scores" sequence at the same moment — the phone
   * should not contradict the big screen. A calm reading phase: no effects.
   */
  if (calculating) {
    return (
      <ArenaScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }} accessibilityLiveRegion="polite">
          <Text style={[arenaType.title, { color: C.ink, textAlign: 'center' }]}>
            {t('Calcul des scores…', 'N ap kalkile nòt yo…')}
          </Text>
          <Text style={[arenaType.status, { color: C.muted, textAlign: 'center' }]}>
            {t('Reste ici, les résultats arrivent.', 'Rete la, rezilta yo ap vini.')}
          </Text>
        </View>
      </ArenaScreen>
    );
  }

  const school = schoolName || t('Ton école', 'Lekòl ou');
  const teamSize = tournament?.teamSize ?? 5;
  const scoreGain = me && previousScore != null ? me.score - previousScore : null;
  const head = headline(summary, school, mySchool?.rank ?? 0, prizeCents, scoreGain, t);
  const contribution = contributionText(summary, school, teamSize, t);
  const earned = summary.tier === 'championConfirmed' || summary.tier === 'prizeConfirmed';
  const occasion = summary.tier === 'championConfirmed' ? 'championship' : 'everyday';

  const share = () => {
    arenaHaptics.choose();
    if (earned) {
      void shareRef.current?.share({
        mode: 'champion',
        name: summary.tier === 'championConfirmed' ? school : (me?.displayName || school),
        scope: summary.tier === 'championConfirmed' ? t('École championne', 'Lekòl chanpyon') : t('Classement individuel', 'Klasman endividyèl'),
        period: tournament?.title,
      });
    } else if (me && tournament) {
      void shareRef.current?.share({ mode: 'score', subject: tournament.title || t('Championnat EdLight', 'Chanpyona EdLight'), score: me.correct, total: tournament.questionCount });
    }
  };

  const nextAction = (() => {
    switch (summary.next) {
      case 'claim':
        return (
          <ArenaButton
            label={t('Réclamer mon prix', 'Reklame pri mwen')}
            accessibilityHint={t('Ouvre le formulaire sur le site EdLight', 'Louvri fòmilè a sou sit EdLight la')}
            onPress={() => {
              arenaHaptics.commit();
              Linking.openURL(`https://academy.edlight.org/arena/reclamation?tid=${encodeURIComponent(tournamentId)}`).catch(() => undefined);
            }}
          />
        );
      case 'nextEvent':
        return (
          <ArenaButton
            label={t('S’inscrire au prochain championnat', 'Enskri nan pwochen chanpyona a')}
            icon={<Users color={C.onCoral} size={16} />}
            onPress={() => { arenaHaptics.choose(); if (nextTournamentId) navigation.navigate('ArenaLobby', { tournamentId: nextTournamentId }); }}
          />
        );
      case 'practice':
        return (
          <ArenaButton
            label={t('S’entraîner pour le prochain', 'Antrene w pou pwochen an')}
            icon={<Zap color={C.onCoral} size={16} />}
            onPress={() => { arenaHaptics.choose(); navigation.navigate('Main', { screen: 'Trivia' } as any); }}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <ArenaScreen occasion={occasion}>
      <ShareCardCapture ref={shareRef} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
        {stale ? <StaleBanner t={t} onRetry={result.retry} /> : null}

        {/* ── The one headline ─────────────────────────────────────────── */}
        <StageEnter playKey="result" index={0} springy={summary.celebration !== 'none'}>
          <ArenaPanel tone={earned ? 'earned' : 'raised'} accessibilityLabel={`${head.title}. ${head.sub}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusPill kind={provisional ? 'provisional' : 'final'} t={t} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {mySchool ? <SchoolCrest name={mySchool.label || school} size={58} /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[arenaType.hero, { color: earned ? C.gold : C.ink }]}>{head.title}</Text>
                <Text style={[arenaType.status, { color: C.inkSoft }]}>{head.sub}</Text>
              </View>
              {earned ? <Trophy color={C.gold} size={30} /> : null}
            </View>
          </ArenaPanel>
        </StageEnter>

        {/* ── The contribution, explained ─────────────────────────────── */}
        {contribution ? (
          <StageEnter playKey="result" index={1}>
            <ArenaPanel>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <ParticipationBadge school={mySchool?.label || school} size={34} />
                <Text style={[arenaType.body, { color: C.ink, flex: 1 }]}>{contribution}</Text>
              </View>
            </ArenaPanel>
          </StageEnter>
        ) : null}

        {/* ── The student's own numbers ───────────────────────────────── */}
        {me ? (
          <>
            <StageEnter playKey="result" index={2}>
              <ArenaPanel style={{ alignItems: 'center', gap: 2 }}>
                <Text style={[arenaType.label, { color: C.muted }]}>{t('Ton score', 'Nòt ou')}</Text>
                <ScoreCounter value={me.score} style={{ ...(arenaType.score as object), color: C.ink }} />
                {me.rank > 0 ? (
                  <Text style={[arenaType.status, { color: C.muted }]}>
                    {t(`${me.rank}e au classement individuel`, `${me.rank}yèm nan klasman endividyèl la`)}
                  </Text>
                ) : null}
              </ArenaPanel>
            </StageEnter>
            <StageEnter playKey="result" index={3}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat icon={<Target color={C.muted} size={16} />} value={accuracyPct != null ? `${accuracyPct}%` : '–'} label={t('de bonnes réponses', 'bon repons')} />
                <Stat icon={<Timer color={C.muted} size={16} />} value={avgMs ? `${(avgMs / 1000).toFixed(1)} s` : '–'} label={t('temps moyen', 'tan mwayèn')} />
                <Stat icon={<Trophy color={C.muted} size={16} />} value={String(me.correct)} label={t('réponses justes', 'repons kòrèk')} />
              </View>
            </StageEnter>
          </>
        ) : null}

        {/* ── Provisional / final, said plainly ───────────────────────── */}
        <StageEnter playKey="result" index={4}>
          <ArenaPanel tone={provisional ? 'signal' : 'plain'}>
            <Text style={[arenaType.name, { color: C.ink }]}>
              {provisional ? t('Résultats provisoires', 'Rezilta pwovizwa') : t('Résultats officiels', 'Rezilta ofisyèl')}
            </Text>
            <Text style={[arenaType.status, { color: C.inkSoft }]}>
              {provisional
                ? t(
                  'Les classements et les prix sont confirmés après vérification. Un résultat peut encore changer si une règle n’a pas été respectée.',
                  'Klasman ak pri yo konfime apre verifikasyon. Yon rezilta ka chanje toujou si yon règ pa t respekte.',
                )
                : t('La vérification est terminée.', 'Verifikasyon an fini.')}
            </Text>
            {summary.next === 'claim' ? (
              <Text style={[arenaType.status, { color: C.warn }]}>
                {t(
                  'Tu as 72 heures pour réclamer. Passé ce délai, le prix passe au suivant.',
                  'Ou gen 72 èdtan pou reklame. Apre delè sa a, pri a pase bay moun ki vin apre a.',
                )}
              </Text>
            ) : null}
          </ArenaPanel>
        </StageEnter>

        {/* ── ONE next action, then the quiet ones ────────────────────── */}
        <StageEnter playKey="result" index={5}>
          <View style={{ gap: 10 }}>
            {nextAction}
            {me ? (
              <ArenaButton variant="secondary" label={t('Partager mon résultat', 'Pataje rezilta mwen')} icon={<Share2 color={C.ink} size={16} />} onPress={share} />
            ) : null}
            <ArenaButton variant="secondary" label={t('Retour à l’Arène', 'Retounen nan Arèn nan')} onPress={toHub} />
          </View>
        </StageEnter>
      </ScrollView>
    </ArenaScreen>
  );
}
