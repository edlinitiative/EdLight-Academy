/**
 * Tournament room presentation on the phone (roadmap P2): the phase bar, the
 * standings (players, school/class squads, named teams) and the final podium.
 *
 * Readable at a glance without much scrolling: the phase bar says where the
 * room is in one line, the board shows the top five plus the student's own
 * row (expand for the rest), and the results open on a podium.
 *
 * Motion (arenaMotion): rows travel to their new place after the reveal, the
 * podium rises third → first, the phase label cross-fades. Everything is
 * static under Reduce Motion (useReduceMotion) — same rows, same order.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { ArenaPanel } from './ArenaKit';
import { PersonFace } from './WorkspaceKit';
import SchoolCrest from './art/crest/SchoolCrest';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { useReduceMotion } from '../../utils/motion';
import { arenaMotion, useBoardMoves } from './arenaMotion';
import {
  boardLines,
  presentationPhase,
  type BoardLine,
  type RowMove,
} from '../../../../shared/competition/presentation';
import { POINTS } from '../../../../shared/competition/labels';
import type { LiveState, Standings } from '../../../../shared/tournois/models';

type T = (fr: string, ht: string) => string;

/** Rows shown before "Voir tout": the top five, plus the student's own row. */
export const BOARD_COLLAPSED = 5;

export function MoveBadge({ move, t }: { move: RowMove | undefined; t: T }) {
  if (!move || move.delta === 0) return null;
  const up = move.delta > 0;
  const n = Math.abs(move.delta);
  return (
    <View
      accessible
      accessibilityLabel={up ? t(`gagne ${n} place${n > 1 ? 's' : ''}`, `monte ${n} plas`) : t(`perd ${n} place${n > 1 ? 's' : ''}`, `desann ${n} plas`)}
      style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: up ? C.successSoft : C.surfaceAlt }}
    >
      <Text maxFontSizeMultiplier={1.5} style={[arenaType.label, { color: up ? C.success : C.muted, fontVariant: ['tabular-nums'] }]}>
        {up ? '▲' : '▼'} {n}
      </Text>
    </View>
  );
}

/** One line: the phase (announced once), the question number and the clock (not announced). */
export function TournoisPhaseBar({ state, live, now, t }: { state: string | null | undefined; live: LiveState | null; now: number; t: T }) {
  const reduce = useReduceMotion();
  const motion = arenaMotion(reduce);
  const stage = presentationPhase(state, live);
  if (stage === 'cancelled') return null;
  const label = stage === 'question' ? t('En direct', 'An dirèk')
    : stage === 'reveal' ? t('Réponse', 'Repons')
      : stage === 'results' ? t('Podium final', 'Podyòm final')
        : stage === 'lobby' ? t('Avant le départ', 'Anvan depa a')
          : t('Entre deux questions', 'Ant de kesyon');
  const tone = stage === 'question' ? { bg: C.coral, ink: C.onCoral }
    : stage === 'results' ? { bg: C.gold, ink: C.onGold }
      : stage === 'reveal' ? { bg: C.successSoft, ink: C.ink }
        : { bg: C.secondary, ink: C.ink };
  const qNum = live && live.index >= 0 && (stage === 'question' || stage === 'reveal') ? live.index + 1 : null;
  const left = live && stage === 'question' ? Math.max(0, Math.ceil((live.closesAt - now) / 1000))
    : live && stage === 'reveal' ? Math.max(0, Math.ceil((live.revealUntil - now) / 1000)) : null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <Animated.View
        key={stage}
        entering={motion.phase}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
        style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: tone.bg }}
      >
        <Text maxFontSizeMultiplier={1.5} style={[arenaType.action, { fontSize: 15, color: tone.ink }]}>{label}</Text>
      </Animated.View>
      {qNum != null && live ? (
        <Text style={[arenaType.num, { color: C.inkSoft }]}>
          {t('Question', 'Kesyon')} {qNum}/{live.questionCount}
        </Text>
      ) : null}
      {left != null ? (
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[arenaType.num, { color: stage === 'question' && left <= 5 ? C.danger : C.muted }]}
        >
          {stage === 'reveal' ? t(`suite dans ${left} s`, `swit nan ${left} s`) : `${left} s`}
        </Text>
      ) : null}
    </View>
  );
}

function Face({ line, size }: { line: BoardLine; size: number }) {
  if (line.face) return <PersonFace person={{ uid: line.face.seed, name: line.name, avatar: line.face.avatar ?? null }} size={size} />;
  if (line.school) return <SchoolCrest name={line.school} size={size} />;
  return null;
}

function Podium({ lines, t, pts }: { lines: BoardLine[]; t: T; pts: string }) {
  const reduce = useReduceMotion();
  const motion = arenaMotion(reduce);
  const order: Array<[BoardLine | undefined, 1 | 2 | 3]> = [[lines[1], 2], [lines[0], 1], [lines[2], 3]];
  return (
    <View accessibilityRole="list" accessibilityLabel={t('Podium', 'Podyòm')} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      {order.map(([line, place]) => (
        <Animated.View
          key={place}
          entering={motion.podium(place)}
          accessible
          accessibilityLabel={line ? `${t('Place', 'Plas')} ${place}, ${line.name}, ${line.points} ${pts}` : `${t('Place', 'Plas')} ${place}`}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
        >
          {line ? <Face line={line} size={place === 1 ? 52 : 40} /> : null}
          <Text numberOfLines={2} style={[arenaType.name, { fontSize: 14, color: C.ink, textAlign: 'center' }]}>{line?.name ?? '—'}</Text>
          {line ? <Text style={[arenaType.num, { fontSize: 14, color: C.inkSoft }]}>{line.points} {pts}</Text> : null}
          <View
            style={{
              alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
              height: place === 1 ? 84 : place === 2 ? 60 : 44,
              borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
              backgroundColor: place === 1 ? C.gold : C.surfaceRaised,
            }}
          >
            <Text style={[arenaType.title, { color: place === 1 ? C.onGold : C.inkSoft }]}>{place}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

function Rows({ lines, mine, t, pts, open, detail }: { lines: BoardLine[]; mine: string | null; t: T; pts: string; open: boolean; detail?: Record<string, string> }) {
  const reduce = useReduceMotion();
  const motion = arenaMotion(reduce);
  const keys = lines.map((l) => l.key);
  const moves = useBoardMoves(keys);
  const myLine = mine ? lines.find((l) => l.key === mine) : undefined;
  const shown = open ? lines : lines.slice(0, BOARD_COLLAPSED);
  const pinned = myLine && !shown.includes(myLine) ? myLine : null;
  const row = (line: BoardLine, isPinned = false) => {
    const isMe = line.key === mine;
    return (
      <Animated.View
        key={line.key}
        layout={motion.reorder}
        accessible
        accessibilityLabel={[
          `${line.rank}`, line.name, line.school && line.kind === 'player' ? line.school : null, detail?.[line.key] ?? null, `${line.points} ${pts}`,
          isMe ? t('toi', 'ou') : null,
        ].filter(Boolean).join(', ')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48,
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
          backgroundColor: isMe ? C.surfaceRaised : 'transparent',
          marginTop: isPinned ? 6 : 0,
        }}
      >
        <Text style={[arenaType.num, { width: 26, color: isMe ? C.coral : line.rank === 1 ? C.gold : C.muted }]}>{line.rank}</Text>
        <Face line={line} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[arenaType.name, { fontSize: 15, color: C.ink }]}>{line.name}</Text>
          {(line.school && line.kind === 'player') || detail?.[line.key] ? (
            <Text numberOfLines={1} style={[arenaType.status, { fontSize: 13, color: C.muted }]}>
              {line.kind === 'player' ? line.school : detail?.[line.key]}
            </Text>
          ) : null}
        </View>
        <MoveBadge move={moves[line.key]} t={t} />
        <Text style={[arenaType.num, { color: C.ink }]}>{line.points}</Text>
      </Animated.View>
    );
  };
  return (
    <View style={{ gap: 2 }}>
      {shown.map((l) => row(l))}
      {pinned ? row(pinned, true) : null}
    </View>
  );
}

/**
 * The standings panel. `board.namedTeams` → teams; `board.teams` → school or
 * class squads (crests when teamRule is 'school'); always the players.
 */
export default function TournoisBoard({
  board, uid, ht, teamRule, nameOf,
}: {
  board: Standings;
  uid: string | null | undefined;
  ht: boolean;
  teamRule?: string | null;
  nameOf: (v: string | null | undefined) => string;
}) {
  const t: T = (fr, creole) => (ht ? creole : fr);
  const pts = POINTS[ht ? 1 : 0];
  const lang = ht ? 1 : 0;
  const [open, setOpen] = useState(false);
  const named = boardLines({ ...board, teams: [] }, lang, 30).filter((l) => l.kind === 'team');
  const squads = boardLines({ ...board, namedTeams: [] }, lang, 8, teamRule).filter((l) => l.kind === 'squad');
  const players = boardLines({ ...board, namedTeams: [], teams: [] }, lang, 30)
    .map((l) => ({ ...l, name: nameOf(l.name) }));
  const contest = named.length ? named : squads.length ? squads : players;
  const mine = uid ? `p:${uid}` : null;
  // What each team's score is made of — the same facts the old list printed.
  const detail: Record<string, string> = {};
  for (const r of board.namedTeams || []) {
    detail[`t:${r.id}`] = r.gameMode
      ? `${r.missed ?? 0} ${t('question(s) sans réponse', 'kesyon san repons')}`
      : `${r.missing} ${t('absent(s), comptés à zéro', 'absan, konte zewo')}`;
  }
  for (const r of board.teams || []) detail[`s:${r.key}`] = `${r.counted} ${t('comptés', 'konte')}`;

  return (
    <ArenaPanel>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink, flex: 1 }]}>
          {board.final ? t('Résultats du tournoi', 'Rezilta tounwa a') : t('Classement en cours', 'Klasman an kou')}
        </Text>
        <Text style={[arenaType.status, { color: C.muted }]}>
          {board.total} {t('joueurs', 'jwè')}
        </Text>
      </View>
      {board.final && contest.length ? <Podium lines={contest} t={t} pts={pts} /> : null}
      {named.length ? (
        <>
          <Text accessibilityRole="header" style={[arenaType.name, { color: C.inkSoft }]}>{t('Équipes', 'Ekip yo')}</Text>
          <Rows lines={named} mine={null} t={t} pts={pts} open detail={detail} />
        </>
      ) : null}
      {squads.length ? (
        <>
          <Text accessibilityRole="header" style={[arenaType.name, { color: C.inkSoft }]}>
            {teamRule === 'school' ? t('École contre école', 'Lekòl kont lekòl') : t('Classe contre classe', 'Klas kont klas')}
          </Text>
          <Rows lines={squads} mine={null} t={t} pts={pts} open detail={detail} />
        </>
      ) : null}
      {players.length ? (
        <>
          {named.length || squads.length ? (
            <Text accessibilityRole="header" style={[arenaType.name, { color: C.inkSoft }]}>{t('Joueurs', 'Jwè yo')}</Text>
          ) : null}
          <Rows lines={players} mine={mine} t={t} pts={pts} open={open} />
          {players.length > BOARD_COLLAPSED ? (
            <PressableScale
              onPress={() => setOpen((o) => !o)}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 14, backgroundColor: C.surfaceRaised }}
            >
              <Text style={[arenaType.action, { fontSize: 15, color: C.ink }]}>
                {open ? t('Réduire le classement', 'Redwi klasman an') : t(`Voir tout (${players.length})`, `Wè tout (${players.length})`)}
              </Text>
              {open ? <ChevronUp color={C.ink} size={18} /> : <ChevronDown color={C.ink} size={18} />}
            </PressableScale>
          ) : null}
        </>
      ) : (
        <Text style={[arenaType.body, { color: C.muted }]}>
          {t('Les scores apparaîtront après les réponses.', 'Nòt yo ap parèt apre repons yo.')}
        </Text>
      )}
    </ArenaPanel>
  );
}
