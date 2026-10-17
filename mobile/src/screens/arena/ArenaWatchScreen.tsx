import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, Eye } from 'lucide-react-native';
import useStore from '../../contexts/store';
import MathText from '../../components/MathText';
import PressableScale from '../../components/ui/PressableScale';
import { ArenaScreen, ArenaPanel, ArenaButton, ArenaStateView, StatusPill, StaleBanner, type StatusLabel } from '../../components/arena/ArenaKit';
import SchoolCrest from '../../components/arena/art/crest/SchoolCrest';
import { phaseLine } from '../../components/arena/arenaPhaseCopy';
import arenaHaptics from '../../components/arena/arenaHaptics';
import { useArenaWatch } from '../../hooks/useArena';
import { boardRows, recordPlayAlong, tallyPlayAlong, type PlayAlongAnswers } from '../../utils/arenaWatch';
import { arenaColors as C, arenaType, arenaRadius } from '../../theme/arenaTheme';
import { useColors } from '../../theme/theme';

const LETTERS = ['A', 'B', 'C', 'D'];
const FOLLOW_KEY = 'arena.watch.follow';

/**
 * Watching the championship, portrait (audit #13).
 *
 * The brief's four questions, always answered on screen: who is competing
 * (the board), what phase we are in (the persistent header), what changed (the
 * reveal and the board after each close), and why the next question matters
 * (the followed school's position).
 *
 * Every label is explicit and true:
 *  - "En direct"     the tournament document is current
 *  - "Reconnexion…"  a listener failed or we are on cache — data is last-known
 *  - "En différé"    the board: it only moves when a question closes
 *  - "Provisoire" / "Officiel"   after the last question
 *  - "Pour toi seulement — ne compte pas"   the answer-along
 *
 * A spectator never posts anything: no presence (they are not in the room for
 * qualification), no answers. The answer-along lives in component state.
 */
export default function ArenaWatchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tid: string | null = route?.params?.tournamentId ?? null;
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const calm = useColors();
  const w = useArenaWatch(tid);
  const { tournament, question, standings, phase, stale, now } = w;

  // ── Follow a school (device preference) ───────────────────────────────
  const [follow, setFollow] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FOLLOW_KEY).then((v) => { if (alive && v) setFollow(v); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const followKey = follow ?? w.ownSchoolKey;
  const toggleFollow = (key: string) => {
    arenaHaptics.choose();
    const next = followKey === key ? null : key;
    setFollow(next);
    (next ? AsyncStorage.setItem(FOLLOW_KEY, next) : AsyncStorage.removeItem(FOLLOW_KEY)).catch(() => undefined);
  };

  // ── Answer along (local only) ─────────────────────────────────────────
  const [answers, setAnswers] = useState<PlayAlongAnswers>({});
  const [revealed, setRevealed] = useState<Record<number, number>>({});
  useEffect(() => {
    if (question && question.state === 'closed' && question.answerIndex != null) {
      setRevealed((r) => (r[question.index] === question.answerIndex ? r : { ...r, [question.index]: question.answerIndex as number }));
    }
  }, [question]);
  const tally = tallyPlayAlong(answers, revealed);
  const open = phase === 'question' && !!question && question.state === 'open';
  const pick = (i: number) => {
    if (!question) return;
    const next = recordPlayAlong(answers, question.index, i, open);
    if (next !== answers) { arenaHaptics.choose(); setAnswers(next); }
  };

  const rows = useMemo(() => boardRows(standings?.schools ?? [], followKey, 8), [standings, followKey]);
  const followed = rows.find((r) => r.followed)?.school ?? null;

  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ArenaHub'));

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
      <PressableScale
        onPress={back}
        accessibilityRole="button"
        accessibilityLabel={t('Retour', 'Retounen')}
        pressedScale={0.94}
        style={{
          width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
          backgroundColor: C.surfaceRaised,
        }}
      >
        <ChevronLeft color={C.inkSoft} size={22} />
      </PressableScale>
      <Eye color={C.signal} size={18} />
      <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink, flex: 1 }]} numberOfLines={1}>
        {t('Regarder', 'Gade')}
      </Text>
    </View>
  );

  if (w.nothingLive) {
    return (
      <ArenaScreen>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={[arenaType.title, { color: C.ink, textAlign: 'center' }]}>
            {t('Aucun championnat en direct', 'Pa gen chanpyona an dirèk')}
          </Text>
          <Text style={[arenaType.body, { color: C.muted, textAlign: 'center' }]}>
            {t('Quand une partie commence, tu pourras la suivre ici.', 'Lè yon pati kòmanse, w ap ka swiv li isit la.')}
          </Text>
          <ArenaButton label={t('Retour à l’Arène', 'Retounen nan Arèn nan')} onPress={() => navigation.navigate('ArenaHub')} />
        </View>
      </ArenaScreen>
    );
  }

  if (phase === 'loading' || phase === 'unavailable' || phase === 'denied' || (phase === 'reconnecting' && !tournament)) {
    return (
      <ArenaScreen>
        {header}
        <ArenaStateView status={phase} t={t} onRetry={w.retry} onReturn={() => navigation.navigate('ArenaHub')} />
      </ArenaScreen>
    );
  }

  const state = tournament?.state ?? null;
  const qNum = tournament?.currentQuestion ? tournament.currentQuestion.index + 1 : null;
  const secondsLeft = open && question ? Math.max(0, Math.ceil((question.closesAt - now) / 1000)) : null;
  const revealIdx = question?.state === 'closed' ? question.answerIndex : null;

  const livePill: StatusLabel = stale || phase === 'reconnecting'
    ? 'reconnecting'
    : state === 'final' ? 'final'
      : state === 'provisional' || state === 'grading' ? 'provisional' : 'live';

  const options = question ? (isCreole && question.optionsHt.length ? question.optionsHt : question.options) : [];
  const prompt = question ? (isCreole && question.promptHt ? question.promptHt : question.prompt) : '';
  const myPick = question ? answers[question.index] : undefined;

  return (
    <ArenaScreen occasion={state === 'final' ? 'championship' : 'match'}>
      {header}

      {/* ── Persistent header: event, phase, followed school's score ── */}
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={{
          marginHorizontal: 16, padding: 14, gap: 8, borderRadius: arenaRadius.card,
          backgroundColor: C.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StatusPill kind={livePill} t={t} />
          <Text numberOfLines={1} style={[arenaType.name, { color: C.ink, flex: 1 }]}>
            {tournament?.title || t('Championnat EdLight', 'Chanpyona EdLight')}
          </Text>
        </View>
        <Text style={[arenaType.status, { color: C.inkSoft }]}>
          {phaseLine({
            phase, state, questionNumber: qNum, questionCount: tournament?.questionCount ?? 0,
            secondsLeft, revealed: revealIdx != null, t,
          })}
        </Text>
        {followed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SchoolCrest name={followed.label || followed.shortName} size={28} />
            <Text numberOfLines={1} style={[arenaType.name, { color: C.ink, flex: 1 }]}>{followed.shortName || followed.label}</Text>
            <Text style={[arenaType.num, { color: C.ink }]}>
              {followed.rank > 0 ? `${followed.rank}${followed.rank === 1 ? t('er', 'yèm') : t('e', 'yèm')}` : t('non classée', 'pa klase')}
            </Text>
            <Text style={[arenaType.num, { color: C.muted }]}>{Math.round(followed.teamAvg)}</Text>
          </View>
        ) : (
          <Text style={[arenaType.status, { color: C.muted }]}>
            {t('Suis une école dans le classement ci-dessous.', 'Swiv yon lekòl nan klasman ki anba a.')}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {stale ? <StaleBanner t={t} onRetry={w.retry} /> : null}

        {/* ── The question, and the answer-along ─────────────────────── */}
        {!w.signedIn && (phase === 'question' || phase === 'interval' || phase === 'questionLoading') ? (
          <ArenaPanel>
            <Text style={[arenaType.status, { color: C.inkSoft }]}>
              {t('Connecte-toi pour voir les questions et répondre en même temps.', 'Konekte pou w wè kesyon yo epi reponn ansanm.')}
            </Text>
          </ArenaPanel>
        ) : question && (phase === 'question' || phase === 'interval') ? (
          <ArenaPanel>
            <StatusPill kind="local" t={t} />
            {/* The question sits on the calm reading surface (theme tokens),
                so math and long text stay as legible as in a lesson. */}
            <View style={{ padding: 14, borderRadius: arenaRadius.tile, backgroundColor: calm.surface }}>
              <MathText text={prompt} style={{ fontSize: 16, lineHeight: 23 }} />
            </View>
            <View style={{ gap: 8 }}>
              {options.map((opt, i) => {
                const mine = myPick === i;
                const right = revealIdx === i;
                const wrongPick = revealIdx != null && mine && !right;
                return (
                  <PressableScale
                    key={i}
                    onPress={() => pick(i)}
                    disabled={!open || myPick != null}
                    pressedScale={0.98}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mine, disabled: !open || myPick != null }}
                    accessibilityLabel={`${LETTERS[i] ?? i + 1}. ${opt}${right ? t(', bonne réponse', ', bon repons') : ''}${mine ? t(', ton choix', ', chwa ou') : ''}`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 12,
                      borderRadius: arenaRadius.tile, borderWidth: 1.5,
                      borderColor: right ? C.success : wrongPick ? C.danger : mine ? C.coral : C.border,
                      backgroundColor: right ? C.successSoft : wrongPick ? C.dangerSoft : C.surfaceAlt,
                    }}
                  >
                    <Text style={[arenaType.num, { color: C.muted, width: 20 }]}>{LETTERS[i] ?? i + 1}</Text>
                    <Text style={[arenaType.body, { color: C.ink, flex: 1, paddingVertical: 10 }]}>{opt}</Text>
                    {right ? <Text style={[arenaType.status, { color: C.success }]}>{t('Bonne réponse', 'Bon repons')}</Text> : null}
                    {mine && !right ? <Text style={[arenaType.status, { color: wrongPick ? C.danger : C.coral }]}>{t('Ton choix', 'Chwa ou')}</Text> : null}
                  </PressableScale>
                );
              })}
            </View>
            <Text style={[arenaType.status, { color: C.muted }]}>
              {tally.answered > 0
                ? t(
                  `Toi en tribune : ${tally.correct} sur ${tally.answered}. Ça ne compte pour aucun classement.`,
                  `Ou nan tribin nan : ${tally.correct} sou ${tally.answered}. Sa pa konte nan okenn klasman.`,
                )
                : t(
                  'Réponds en même temps que les joueurs. Ton choix reste sur ton téléphone et ne compte pas.',
                  'Reponn an menm tan ak jwè yo. Chwa ou rete sou telefòn ou e li pa konte.',
                )}
            </Text>
          </ArenaPanel>
        ) : null}

        {/* ── The board ──────────────────────────────────────────────── */}
        <ArenaPanel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[arenaType.name, { color: C.ink, flex: 1 }]}>{t('Classement des écoles', 'Klasman lekòl yo')}</Text>
            {state === 'live' ? <StatusPill kind="delayed" t={t} /> : null}
          </View>
          {state === 'live' ? (
            <Text style={[arenaType.status, { color: C.muted }]}>
              {t('Mis à jour à la fin de chaque question.', 'Li mete ajou nan fen chak kesyon.')}
            </Text>
          ) : null}
          {rows.length === 0 ? (
            <Text style={[arenaType.status, { color: C.muted }]}>
              {t('Aucune école classée pour l’instant.', 'Poko gen lekòl ki klase.')}
            </Text>
          ) : rows.map(({ school, followed: isFollowed, pinned }) => (
            <View
              key={school.key}
              accessible
              accessibilityLabel={[
                school.rank > 0 ? `${school.rank}` : t('non classée', 'pa klase'),
                school.label || school.shortName,
                `${t('moyenne', 'mwayèn')} ${Math.round(school.teamAvg)}`,
                isFollowed ? t('suivie', 'w ap swiv li') : null,
              ].filter(Boolean).join(', ')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48,
                paddingHorizontal: 10, borderRadius: arenaRadius.tile,
                backgroundColor: isFollowed ? C.signalSoft : 'transparent',
                marginTop: pinned ? 6 : 0,
              }}
            >
              <Text style={[arenaType.num, { color: C.muted, width: 26 }]}>{school.rank > 0 ? school.rank : '–'}</Text>
              <SchoolCrest name={school.label || school.shortName} size={26} />
              <Text numberOfLines={1} style={[arenaType.name, { color: C.ink, flex: 1 }]}>{school.shortName || school.label}</Text>
              <Text style={[arenaType.num, { color: C.inkSoft }]}>{Math.round(school.teamAvg)}</Text>
              <PressableScale
                onPress={() => toggleFollow(school.key)}
                accessibilityRole="button"
                accessibilityLabel={isFollowed ? t('Ne plus suivre', 'Pa swiv ankò') : t('Suivre cette école', 'Swiv lekòl sa a')}
                pressedScale={0.95}
                hitSlop={6}
                style={{
                  paddingHorizontal: 10, minHeight: 34, justifyContent: 'center', borderRadius: 999,
                  borderWidth: 1, borderColor: isFollowed ? C.signal : C.border,
                }}
              >
                <Text style={[arenaType.status, { color: isFollowed ? C.signal : C.muted }]}>
                  {isFollowed ? t('Suivie', 'Swiv') : t('Suivre', 'Swiv')}
                </Text>
              </PressableScale>
            </View>
          ))}
        </ArenaPanel>

        {phase === 'ended' && tournament ? (
          <ArenaButton
            label={t('Voir les résultats', 'Wè rezilta yo')}
            onPress={() => navigation.navigate('ArenaResult', { tournamentId: tournament.id })}
          />
        ) : null}
      </ScrollView>
    </ArenaScreen>
  );
}
