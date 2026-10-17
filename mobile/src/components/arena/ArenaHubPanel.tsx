/**
 * The permanent Arena destination (audit #11), without a sixth tab.
 *
 * Rendered in two places from this one component:
 *  - the "Arène" segment of the Jeux tab (JeuxHub), so the Arena is always one
 *    tap from the tab bar, between national events too;
 *  - the ArenaHub root route (screens/arena/ArenaHubScreen), which is where the
 *    /arena deep link and the "back to the Arena" actions land.
 *
 * Order is by what the student can act on: who they compete for (school crest
 * and its real rank), then the ONE event action that applies right now —
 * rejoin, results, register, watch, or an honest "nothing scheduled" with what
 * to do meanwhile — then the secondary rows (watch, last results).
 *
 * Real data only. The school is the student's own leaderboard school; the rank
 * is the weekly school board's (1-based among qualified schools, and absent —
 * not "0e" — for a school that has not qualified); the emblem is the student's
 * own level. No invented events, schools, counts or ranks.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, Eye, School as SchoolIcon, Swords, Trophy, Zap, Clock } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useArenaHub, useNow } from '../../hooks/useArena';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives, useLeaderboard } from '../../hooks/useLeaderboard';
import { rankTeams, teamStandingFor } from '../../../../shared/leaderboardAgg';
import type { ArenaTournament } from '../../services/arenaService';
import { arenaColors as C, arenaType, arenaRadius } from '../../theme/arenaTheme';
import PressableScale from '../ui/PressableScale';
import { ArenaPanel, ArenaButton, StatusPill, StaleBanner, stateCopy } from './ArenaKit';
import SchoolCrest from './art/crest/SchoolCrest';
import RankEmblem from './art/emblems/RankEmblem';
import { emblemLabel } from './art/emblems/tiers';
import arenaHaptics from './arenaHaptics';
import { hubEventCopy, formatEventDate } from './arenaHubCopy';

export interface ArenaHubPanelProps {
  /** Start a practice round (Jeux). */
  onPractice: () => void;
  /** Start a round that ends in a duel invitation (Jeux). */
  onDuel: () => void;
}

export default function ArenaHubPanel({ onPractice, onDuel }: ArenaHubPanelProps) {
  const navigation = useNavigation<any>();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const hub = useArenaHub();
  const now = useNow(1000);

  // ── Identity ────────────────────────────────────────────────────────────
  const { profile, level, isAuthed } = useTrivia();
  const { groups } = useCollectives('school', 'week');
  const { myEntry } = useLeaderboard(50, 'week');
  const schoolName: string | null = ((profile?.leaderboard as any)?.school || (myEntry as any)?.school || null) as string | null;
  const standing = useMemo(
    () => teamStandingFor(rankTeams(groups ?? []), schoolName),
    [groups, schoolName],
  );
  const lvl = Math.max(1, Number(level?.level) || 1);

  const go = (screen: string, params?: object) => {
    arenaHaptics.choose();
    navigation.navigate(screen, params);
  };

  const p = hub.primary;
  const tour: ArenaTournament | null = p.kind === 'none' ? null : p.tournament;
  const copy = tour && p.kind !== 'none' ? hubEventCopy(p.kind, tour, now, t) : null;

  const primaryAction = () => {
    if (!tour) return;
    if (p.kind === 'rejoin') go(tour.state === 'live' ? 'ArenaLive' : 'ArenaDoors', { tournamentId: tour.id });
    else if (p.kind === 'results') go('ArenaResult', { tournamentId: tour.id });
    else if (p.kind === 'watch') go('ArenaWatch', { tournamentId: tour.id });
    else go('ArenaLobby', { tournamentId: tour.id });
  };

  const fault = hub.status === 'reconnecting' || hub.status === 'denied' ? stateCopy(hub.status, t) : null;

  return (
    <View style={{ gap: 12 }}>
      {/* ── Who you compete for ───────────────────────────────────────── */}
      <ArenaPanel
        accessibilityLabel={[
          schoolName || t('Aucune école choisie', 'Ou poko chwazi lekòl'),
          standing && standing.rank > 0 ? t(`${standing.rank}e cette semaine`, `${standing.rank}yèm semèn sa a`) : null,
          isAuthed ? emblemLabel(lvl, isCreole) : null,
        ].filter(Boolean).join(' · ')}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {schoolName ? (
            <SchoolCrest name={schoolName} size={56} />
          ) : (
            <View style={{
              width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.surfaceAlt,
            }}>
              <SchoolIcon color={C.muted} size={24} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[arenaType.label, { color: C.muted }]}>{t('Tu joues pour', 'W ap jwe pou')}</Text>
            <Text numberOfLines={2} style={[arenaType.name, { color: C.ink }]}>
              {schoolName || t('Aucune école pour l’instant', 'Poko gen lekòl')}
            </Text>
            {standing ? (
              <Text style={[arenaType.status, { color: standing.rank > 0 ? C.inkSoft : C.warn }]}>
                {standing.rank > 0
                  ? t(`${standing.rank}e au classement des écoles cette semaine`, `${standing.rank}yèm nan klasman lekòl semèn sa a`)
                  : t(
                    `Encore ${standing.needed} joueur${standing.needed > 1 ? 's' : ''} pour classer ton école`,
                    `${standing.needed} jwè ankò pou lekòl ou klase`,
                  )}
              </Text>
            ) : schoolName ? (
              <Text style={[arenaType.status, { color: C.muted }]}>
                {t('Pas encore classée cette semaine', 'Poko klase semèn sa a')}
              </Text>
            ) : null}
          </View>
          {isAuthed ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <RankEmblem level={lvl} size={40} />
              <Text style={[arenaType.label, { color: C.muted }]}>{t(`Niv. ${lvl}`, `Nivo ${lvl}`)}</Text>
            </View>
          ) : null}
        </View>
        {!schoolName ? (
          <ArenaButton
            variant="secondary"
            label={t('Choisir mon école', 'Chwazi lekòl mwen')}
            onPress={() => go('Leaderboard')}
            icon={<SchoolIcon color={C.ink} size={16} />}
          />
        ) : null}
      </ArenaPanel>

      {/* ── The one event action ──────────────────────────────────────── */}
      {hub.status === 'loading' ? (
        <ArenaPanel>
          <Text style={[arenaType.status, { color: C.muted }]}>{t('Recherche des événements…', 'N ap chèche evènman yo…')}</Text>
        </ArenaPanel>
      ) : fault ? (
        // A failed query is NEVER "nothing scheduled".
        <ArenaPanel tone="warn">
          <Text style={[arenaType.name, { color: C.ink }]}>{fault.title}</Text>
          <Text style={[arenaType.status, { color: C.inkSoft }]}>{fault.body}</Text>
          <ArenaButton label={t('Réessayer', 'Eseye ankò')} onPress={hub.retry} />
        </ArenaPanel>
      ) : tour && copy ? (
        <ArenaPanel tone="raised">
          {hub.stale ? <StaleBanner t={t} onRetry={hub.retry} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {copy.pill ? <StatusPill kind={copy.pill} t={t} /> : null}
          </View>
          <Text style={[arenaType.title, { color: C.ink }]} numberOfLines={2}>{tour.title || t('Championnat EdLight', 'Chanpyona EdLight')}</Text>
          <Text style={[arenaType.body, { color: C.inkSoft }]}>{copy.line}</Text>
          {copy.countdown ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock color={C.muted} size={16} />
              <Text style={[arenaType.num, { color: C.ink }]}>{copy.countdown}</Text>
            </View>
          ) : null}
          <ArenaButton label={copy.action} onPress={primaryAction} icon={primaryIcon(p.kind)} />
        </ArenaPanel>
      ) : (
        <ArenaPanel>
          <Text style={[arenaType.title, { color: C.ink }]}>
            {t('Aucun championnat programmé pour l’instant', 'Pa gen chanpyona pwograme pou kounye a')}
          </Text>
          <Text style={[arenaType.body, { color: C.inkSoft }]}>
            {t(
              'Le prochain sera annoncé ici et dans l’application. En attendant, défie un ami ou entraîne-toi : chaque partie fait monter ton école au classement de la semaine.',
              'Y ap anonse pwochen an isit la ak nan aplikasyon an. Pandan w ap tann, lanse yon defi bay yon zanmi oswa antrene w : chak pati fè lekòl ou monte nan klasman semèn nan.',
            )}
          </Text>
          <View style={{ gap: 10 }}>
            <ArenaButton label={t('Défier un ami', 'Defye yon zanmi')} onPress={() => { arenaHaptics.choose(); onDuel(); }} icon={<Swords color={C.onCoral} size={16} />} />
            <ArenaButton variant="secondary" label={t('S’entraîner', 'Antrene w')} onPress={() => { arenaHaptics.choose(); onPractice(); }} icon={<Zap color={C.ink} size={16} />} />
          </View>
        </ArenaPanel>
      )}

      {/* ── Secondary rows ────────────────────────────────────────────── */}
      {hub.watchable && p.kind !== 'watch' ? (
        <HubRow
          icon={<Eye color={C.signal} size={18} />}
          title={t('Regarder en direct', 'Gade an dirèk')}
          sub={hub.watchable.title}
          onPress={() => go('ArenaWatch', { tournamentId: hub.watchable!.id })}
        />
      ) : null}
      {hub.lastFinished && !(p.kind === 'results' && p.tournament.id === hub.lastFinished.id) ? (
        <HubRow
          icon={<Trophy color={hub.lastFinished.state === 'final' ? C.gold : C.muted} size={18} />}
          title={hub.lastFinished.state === 'final'
            ? t('Derniers résultats officiels', 'Dènye rezilta ofisyèl')
            : t('Derniers résultats (provisoires)', 'Dènye rezilta (pwovizwa)')}
          sub={[hub.lastFinished.title, formatEventDate(hub.lastFinished.startsAt, isCreole)].filter(Boolean).join(' · ')}
          onPress={() => go('ArenaResult', { tournamentId: hub.lastFinished!.id })}
        />
      ) : null}
    </View>
  );
}

function primaryIcon(kind: string) {
  if (kind === 'watch') return <Eye color={C.onCoral} size={16} />;
  if (kind === 'results') return <Trophy color={C.onCoral} size={16} />;
  return <Swords color={C.onCoral} size={16} />;
}

function HubRow({ icon, title, sub, onPress }: { icon: React.ReactNode; title: string; sub?: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={[title, sub].filter(Boolean).join(' — ')}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56,
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: arenaRadius.card,
        backgroundColor: C.surface,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[arenaType.name, { color: C.ink }]}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>{sub}</Text> : null}
      </View>
      <ChevronRight color={C.muted} size={18} />
    </PressableScale>
  );
}

