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
import { ChevronRight, Eye, School as SchoolIcon, Swords, Trophy, Zap, Clock, CalendarDays, Play } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useArenaHub, useNow } from '../../hooks/useArena';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives, useLeaderboard } from '../../hooks/useLeaderboard';
import { rankTeams, teamStandingFor, normalizeName } from '../../../../shared/leaderboardAgg';
import { fonts } from '../../theme/theme';
import { displayLevel } from '../../utils/courseName';
import { groupDigits } from '../games/night';
import Avatar from './art/avatars/Avatar';
import type { ArenaTournament } from '../../services/arenaService';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import PressableScale from '../ui/PressableScale';
import { ArenaPanel, ArenaButton, StatusPill, StaleBanner, stateCopy } from './ArenaKit';
import SchoolCrest from './art/crest/SchoolCrest';
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
  const { profile } = useTrivia();
  const { groups } = useCollectives('school', 'week');
  const { myEntry, entries } = useLeaderboard(50, 'week');
  const grade = useStore((s) => s.grade);
  const schoolName: string | null = ((profile?.leaderboard as any)?.school || (myEntry as any)?.school || null) as string | null;
  const standing = useMemo(
    () => teamStandingFor(rankTeams(groups ?? []), schoolName),
    [groups, schoolName],
  );

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

  // Real teammates on this week's board (generated faces from their uid).
  const mates = useMemo(() => {
    if (!schoolName) return [] as any[];
    const key = normalizeName(schoolName);
    return (entries as any[]).filter((e) => e?.school && normalizeName(e.school) === key).slice(0, 4);
  }, [entries, schoolName]);
  const qualifiedCount = useMemo(() => rankTeams(groups ?? []).filter((g) => g.qualified).length, [groups]);
  const levelLabel = grade && /^ns/i.test(grade) ? displayLevel(grade) : null;

  return (
    <View style={{ gap: 14 }}>
      {/* ── Who you compete for ───────────────────────────────────────── */}
      <View
        accessible
        accessibilityLabel={[
          schoolName || t('Aucune école choisie', 'Ou poko chwazi lekòl'),
          standing && standing.rank > 0 ? t(`${standing.rank}e sur ${qualifiedCount} écoles cette semaine`, `${standing.rank}yèm sou ${qualifiedCount} lekòl semèn sa a`) : null,
          standing ? `${standing.teamXp} XP` : null,
        ].filter(Boolean).join(' · ')}
        style={{ padding: 22, gap: 18, borderRadius: 24, backgroundColor: C.surfaceRaised }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {schoolName ? (
            <SchoolCrest name={schoolName} size={64} />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}>
              <SchoolIcon color={C.muted} size={26} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[arenaType.label, { fontSize: 15, color: C.muted }]}>
              {levelLabel ? t(`${levelLabel} · tu joues pour`, `${levelLabel} · w ap jwe pou`) : t('Tu joues pour', 'W ap jwe pou')}
            </Text>
            <Text numberOfLines={2} style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: C.ink }}>
              {schoolName || t('Aucune école pour l’instant', 'Poko gen lekòl')}
            </Text>
          </View>
        </View>

        {schoolName ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, padding: 14, gap: 2, borderRadius: 16, backgroundColor: C.surface }}>
              <Text style={[arenaType.status, { color: C.muted }]}>{t('Position', 'Pozisyon')}</Text>
              {standing && standing.rank > 0 ? (
                <Text style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, color: C.ink }}>
                  {standing.rank}{t('e', 'yèm')}
                  <Text style={[arenaType.status, { color: C.inkSoft }]}>{t(` sur ${qualifiedCount}`, ` sou ${qualifiedCount}`)}</Text>
                </Text>
              ) : (
                <Text style={[arenaType.status, { color: C.warn }]}>
                  {standing
                    ? t(`Encore ${standing.needed} joueur${standing.needed > 1 ? 's' : ''} pour classer l’école`, `${standing.needed} jwè ankò pou lekòl la klase`)
                    : t('Pas encore classée cette semaine', 'Poko klase semèn sa a')}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, padding: 14, gap: 2, borderRadius: 16, backgroundColor: C.surface }}>
              <Text style={[arenaType.status, { color: C.muted }]}>{t('Score d’équipe', 'Nòt ekip la')}</Text>
              <Text style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, color: C.ink, fontVariant: ['tabular-nums'] }}>
                {standing ? groupDigits(standing.teamXp) : '0'}
                <Text style={[arenaType.status, { color: C.inkSoft }]}> XP</Text>
              </Text>
            </View>
          </View>
        ) : (
          <ArenaButton
            variant="secondary"
            label={t('Choisir mon école', 'Chwazi lekòl mwen')}
            onPress={() => go('Leaderboard')}
            icon={<SchoolIcon color={C.ink} size={16} />}
            // On the raised card the secondary step must go DOWN to read.
            style={{ backgroundColor: C.surface }}
          />
        )}

        {schoolName && standing && standing.members > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {mates.length > 0 ? (
              <View style={{ flexDirection: 'row' }}>
                {mates.map((m, i) => (
                  <View key={m.id || i} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 20, padding: 2, backgroundColor: C.surfaceRaised }}>
                    <Avatar seed={m.id || m.uid || m.displayName || String(i)} size={36} />
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={[arenaType.status, { fontSize: 15, color: C.inkSoft, flex: 1 }]}>
              {t(
                `${standing.members} joueur${standing.members > 1 ? 's' : ''} cette semaine`,
                `${standing.members} jwè semèn sa a`,
              )}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── The one event action ──────────────────────────────────────── */}
      {hub.status === 'loading' ? (
        <ArenaPanel style={{ padding: 20, borderRadius: 24 }}>
          <Text style={[arenaType.status, { color: C.muted }]}>{t('Recherche des championnats…', 'N ap chèche chanpyona yo…')}</Text>
        </ArenaPanel>
      ) : fault ? (
        // A failed query is NEVER "nothing scheduled".
        <ArenaPanel tone="warn" style={{ padding: 20, borderRadius: 24 }}>
          <Text style={[arenaType.name, { color: C.ink }]}>{fault.title}</Text>
          <Text style={[arenaType.status, { color: C.inkSoft }]}>{fault.body}</Text>
          <ArenaButton label={t('Réessayer', 'Eseye ankò')} onPress={hub.retry} />
        </ArenaPanel>
      ) : tour && copy ? (
        <View style={{ padding: 22, gap: 12, borderRadius: 24, backgroundColor: C.surface }}>
          {hub.stale ? <StaleBanner t={t} onRetry={hub.retry} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[arenaType.name, { fontSize: 14, color: C.coral, flex: 1 }]}>{t('Tournoi inter-écoles', 'Tounwa ant lekòl')}</Text>
            {copy.pill ? <StatusPill kind={copy.pill} t={t} /> : null}
          </View>
          <Text style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, color: C.ink }} numberOfLines={2}>{tour.title || t('Championnat EdLight', 'Chanpyona EdLight')}</Text>
          {tour.startsAt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarDays color={C.muted} size={18} />
              <Text style={[arenaType.body, { color: C.inkSoft, flex: 1 }]}>{formatEventDate(tour.startsAt, isCreole)}</Text>
            </View>
          ) : null}
          <Text style={[arenaType.body, { color: C.muted }]}>{copy.line}</Text>
          {copy.countdown ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock color={C.muted} size={16} />
              <Text style={[arenaType.num, { color: C.ink }]}>{copy.countdown}</Text>
            </View>
          ) : null}
          <ArenaButton label={copy.action} onPress={primaryAction} icon={primaryIcon(p.kind)} style={{ marginTop: 4, minHeight: 52 }} />
        </View>
      ) : (
        // Honest empty state: no invented date, and no coral on the page.
        <View style={{ padding: 22, gap: 10, borderRadius: 24, backgroundColor: C.surface }}>
          <Text style={[arenaType.name, { fontSize: 14, color: C.muted }]}>{t('Prochain championnat', 'Pwochen chanpyona')}</Text>
          <Text style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, color: C.ink }}>
            {t('Aucun championnat prévu pour l’instant', 'Pa gen chanpyona pwograme pou kounye a')}
          </Text>
          <Text style={[arenaType.body, { color: C.muted }]}>
            {t(
              'On te prévient dès qu’un championnat est annoncé. En attendant, chaque partie fait monter ton école au classement de la semaine.',
              'N ap fè w konnen depi yo anonse yon chanpyona. Pandan w ap tann, chak pati fè lekòl ou monte nan klasman semèn nan.',
            )}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <ArenaButton variant="secondary" label={t('S’entraîner', 'Antrene w')} onPress={() => { arenaHaptics.choose(); onPractice(); }} icon={<Zap color={C.ink} size={16} />} style={{ flex: 1 }} />
            <ArenaButton variant="secondary" label={t('Défier un ami', 'Defye yon zanmi')} onPress={() => { arenaHaptics.choose(); onDuel(); }} icon={<Swords color={C.ink} size={16} />} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {/* ── Secondary rows ────────────────────────────────────────────── */}
      {hub.watchable && p.kind !== 'watch' ? (
        <HubRow
          icon={<Play color={C.coral} size={20} />}
          title={t('Regarder en direct', 'Gade an dirèk')}
          sub={hub.watchable.title}
          badge={t('En direct', 'An dirèk')}
          onPress={() => go('ArenaWatch', { tournamentId: hub.watchable!.id })}
        />
      ) : null}
      {hub.lastFinished && !(p.kind === 'results' && p.tournament.id === hub.lastFinished.id) ? (
        <HubRow
          icon={<Trophy color={hub.lastFinished.state === 'final' ? C.gold : C.ink} size={20} />}
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

function HubRow({ icon, title, sub, badge, onPress }: { icon: React.ReactNode; title: string; sub?: string; badge?: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={[title, badge, sub].filter(Boolean).join(' — ')}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76,
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20,
        backgroundColor: C.surface,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised }}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[arenaType.name, { fontSize: 17, color: C.ink }]}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#3A2530' }}>
          <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.coral }]}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight color={C.muted} size={18} />
    </PressableScale>
  );
}
