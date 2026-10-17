import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, ChevronDown, ChevronUp, Crown, Eye, X, Check, Smile, TrendingUp, Users } from 'lucide-react-native';
import useStore from '../../contexts/store';
import MathText, { HAS_MATH } from '../../components/MathText';
import PressableScale from '../../components/ui/PressableScale';
import { ArenaScreen, ArenaPanel, ArenaButton, ArenaStateView, StaleBanner, statusLabelText, statusTone, watchStatus } from '../../components/arena/ArenaKit';
import PopIn from '../../components/ui/PopIn';
import Avatar from '../../components/arena/art/avatars/Avatar';
import { NightLink } from '../../components/games/night';
import SchoolCrest from '../../components/arena/art/crest/SchoolCrest';
import { phaseLine } from '../../components/arena/arenaPhaseCopy';
import arenaHaptics from '../../components/arena/arenaHaptics';
import { useArenaWatch } from '../../hooks/useArena';
import {
  boardRows, recordPlayAlong, tallyPlayAlong, type PlayAlongAnswers,
  FOLLOW_STORAGE_KEY, parseFollowPref, serializeFollowPref, resolveFollowKey, toggleFollowPref, type FollowPref,
} from '../../utils/arenaWatch';
import { deriveStories, pickStory, storyText, type StorySnapshot, type WatchStory } from '../../utils/arenaStory';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { useColors, fonts } from '../../theme/theme';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Watching the championship, portrait (audit #13; layout per the Oct-17
 * Arène audit M2/X3 and Stitch 10-arena-watch).
 *
 * Layout: a compact context header PINNED outside the scroll (status badge,
 * event, phase line, the followed school's position, exit), then the story
 * strip (the latest match moment, in one designated region), then the current
 * question / answer-along FIRST, then the board — collapsed to the top three
 * plus the followed school behind "Voir le classement".
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

  // ── Follow a school (device preference, M4) ───────────────────────────
  // default (own school) / explicitly nobody / a chosen school are three
  // different stored answers — see utils/arenaWatch FollowPref.
  const [pref, setPref] = useState<FollowPref>({ kind: 'default' });
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FOLLOW_STORAGE_KEY).then((v) => { if (alive) setPref(parseFollowPref(v)); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const followKey = resolveFollowKey(pref, w.ownSchoolKey);
  const toggleFollow = (key: string) => {
    arenaHaptics.choose();
    const next = toggleFollowPref(pref, w.ownSchoolKey, key);
    setPref(next);
    const stored = serializeFollowPref(next);
    (stored == null ? AsyncStorage.removeItem(FOLLOW_STORAGE_KEY) : AsyncStorage.setItem(FOLLOW_STORAGE_KEY, stored)).catch(() => undefined);
  };

  // ── Story strip (X3): the latest moment between two standings snapshots ─
  const followRef = useRef<string | null>(followKey);
  followRef.current = followKey;
  const qRef = useRef<number | null>(null);
  qRef.current = tournament?.currentQuestion ? tournament.currentQuestion.index + 1 : null;
  const prevSnap = useRef<StorySnapshot | null>(null);
  const [story, setStory] = useState<{ s: WatchStory; afterQ: number | null } | null>(null);
  useEffect(() => {
    if (!standings) return;
    const prev = prevSnap.current;
    if (prev && !(standings.seq > prev.seq)) return;
    const picked = pickStory(deriveStories(prev, standings, followRef.current));
    prevSnap.current = standings;
    if (picked) setStory({ s: picked, afterQ: qRef.current });
  }, [standings]);

  const [boardOpen, setBoardOpen] = useState(false);

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

  const rows = useMemo(() => boardRows(standings?.schools ?? [], followKey, boardOpen ? 8 : 3), [standings, followKey, boardOpen]);
  const followed = useMemo(
    () => (followKey ? (standings?.schools ?? []).find((sc) => sc.key === followKey) ?? null : null),
    [standings, followKey],
  );
  const rankedCount = useMemo(() => (standings?.schools ?? []).filter((sc) => sc.qualified && sc.rank > 0).length, [standings]);

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

  // Explicit badge for every state (M5): never "En direct" before the start.
  const livePill = watchStatus({ state, stale: !!stale, reconnecting: phase === 'reconnecting' });

  const options = question ? (isCreole && question.optionsHt.length ? question.optionsHt : question.options) : [];
  const prompt = question ? (isCreole && question.promptHt ? question.promptHt : question.prompt) : '';
  const myPick = question ? answers[question.index] : undefined;

  const liveTone = livePill === 'live' ? C.coral : statusTone(livePill);
  const showMath = HAS_MATH.test(prompt);

  const qCount = tournament?.questionCount ?? 0;
  const roundMeta = qNum != null && qCount > 0 ? t(`Question ${qNum} / ${qCount}`, `Kesyon ${qNum} / ${qCount}`) : null;
  const ordinal = (n: number) => (n === 1 ? t('1re', '1ye') : t(`${n}e`, `${n}yèm`));
  const storyCopy = story ? storyText(story.s, t) : null;

  return (
    <ArenaScreen occasion={state === 'final' ? 'championship' : 'match'}>
      {/* ── Pinned context: status, event, phase, followed school, exit ──
          Outside the scroll so the phase and the exit never scroll away. */}
      <View
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8, backgroundColor: C.bg }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View accessible accessibilityLabel={statusLabelText(livePill, t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: liveTone }} />
              <Text style={[arenaType.name, { fontSize: 15, color: liveTone }]}>{statusLabelText(livePill, t)}</Text>
              {roundMeta ? <Text style={[arenaType.status, { color: C.muted }]}>· {roundMeta}</Text> : null}
            </View>
            <Text accessibilityRole="header" numberOfLines={1} style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, letterSpacing: -0.3, color: C.ink }}>
              {tournament?.title || t('Championnat EdLight', 'Chanpyona EdLight')}
            </Text>
          </View>
          <PressableScale
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={t('Quitter le direct', 'Kite dirèk la')}
            pressedScale={0.92}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}
          >
            <X color={C.ink} size={20} />
          </PressableScale>
        </View>
        <Text style={[arenaType.status, { fontSize: 15, color: C.inkSoft }]}>
          {phaseLine({
            phase, state, questionNumber: qNum, questionCount: qCount,
            secondsLeft, revealed: revealIdx != null, t,
          })}
        </Text>
        {followed ? (
          <View
            accessible
            accessibilityLabel={[
              t('Tu suis', 'W ap swiv'),
              followed.label || followed.shortName,
              followed.rank > 0 && followed.qualified ? ordinal(followed.rank) : t('non classée', 'pa klase'),
              `${t('moyenne', 'mwayèn')} ${Math.round(followed.teamAvg)}`,
            ].join(', ')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.surfaceRaised }}
          >
            <SchoolCrest name={followed.label || followed.shortName} size={28} />
            <Text numberOfLines={1} style={[arenaType.name, { fontSize: 15, color: C.ink, flex: 1 }]}>{followed.shortName || followed.label}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: C.surface }}>
              <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.ink }]}>
                {followed.rank > 0 && followed.qualified ? ordinal(followed.rank) : t('non classée', 'pa klase')}
              </Text>
            </View>
            <Text style={[arenaType.num, { color: C.ink }]}>
              {Math.round(followed.teamAvg)}<Text style={[arenaType.status, { color: C.muted }]}> {t('moy.', 'mwa.')}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {stale ? <StaleBanner t={t} onRetry={w.retry} /> : null}

        {/* ── Story strip: the latest moment, in one designated region ── */}
        <View accessibilityLiveRegion="polite">
          {story && storyCopy ? (
            <PopIn key={story.s.seq} from={0.96}>
              <View
                accessible
                accessibilityLabel={`${storyCopy.title}. ${storyCopy.line}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, backgroundColor: C.surfaceRaised }}
              >
                {story.s.kind === 'PLAYER_ENTERS_TOP_5' && story.s.player ? (
                  <Avatar seed={story.s.player.uid} size={36} />
                ) : (
                  <SchoolCrest name={story.s.school.name} size={36} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {story.s.kind === 'LEAD_CHANGE' ? <Crown color={C.coral} size={16} /> : <TrendingUp color={C.signal} size={16} />}
                    <Text style={[arenaType.status, { color: C.muted, flex: 1 }]} numberOfLines={1}>
                      {story.afterQ != null
                        ? t(`${storyCopy.title} · après la question ${story.afterQ}`, `${storyCopy.title} · apre kesyon ${story.afterQ}`)
                        : storyCopy.title}
                    </Text>
                  </View>
                  <Text style={[arenaType.name, { color: C.ink }]}>{storyCopy.line}</Text>
                </View>
              </View>
            </PopIn>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, backgroundColor: C.surface }}>
              <TrendingUp color={C.muted} size={18} />
              <Text style={[arenaType.status, { color: C.muted, flex: 1 }]}>
                {t('Les moments du match apparaîtront ici après chaque question.', 'Gwo moman match la ap parèt isit la apre chak kesyon.')}
              </Text>
            </View>
          )}
        </View>

        {/* ── The question first, with the answer-along (local only) ── */}
        {!w.signedIn && (phase === 'question' || phase === 'interval' || phase === 'questionLoading') ? (
          <ArenaPanel>
            <Text style={[arenaType.status, { color: C.inkSoft }]}>
              {t('Connecte-toi pour voir les questions et répondre en même temps.', 'Konekte pou w wè kesyon yo epi reponn ansanm.')}
            </Text>
          </ArenaPanel>
        ) : question && (phase === 'question' || phase === 'interval') ? (
          <View style={{ padding: 20, gap: 14, borderRadius: 24, backgroundColor: C.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[arenaType.status, { color: C.muted, flex: 1 }]}>{t('Question en cours', 'Kesyon k ap jwe a')}</Text>
              {secondsLeft != null ? (
                <Text accessibilityRole="timer" style={[arenaType.status, { color: secondsLeft <= 5 ? C.danger : C.muted }]}>
                  {t(`Temps restant : ${secondsLeft} s`, `Tan ki rete : ${secondsLeft} s`)}
                </Text>
              ) : null}
            </View>
            {showMath ? (
              // KaTeX reads on the calm reading surface, like in a lesson.
              <View style={{ padding: 14, borderRadius: 14, backgroundColor: calm.surface }}>
                <MathText text={prompt} style={{ fontSize: 16, lineHeight: 23 }} />
              </View>
            ) : (
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 27, color: C.ink }}>{prompt}</Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {options.map((opt, i) => {
                const mine = myPick === i;
                const right = revealIdx === i;
                const wrongPick = revealIdx != null && mine && !right;
                // Before the reveal your pick is the coral chip; after it the
                // truth takes over (success / danger washes).
                const bg = right ? C.successSoft : wrongPick ? C.dangerSoft : mine ? C.coral : C.surfaceRaised;
                const ink = mine && revealIdx == null ? C.onCoral : right ? C.success : wrongPick ? C.danger : C.ink;
                return (
                  <PressableScale
                    key={i}
                    onPress={() => pick(i)}
                    disabled={!open || myPick != null}
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mine, disabled: !open || myPick != null }}
                    accessibilityLabel={`${LETTERS[i] ?? i + 1}. ${opt}${right ? t(', bonne réponse', ', bon repons') : ''}${mine ? t(', ton choix', ', chwa ou') : ''}`}
                    style={{
                      flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: bg,
                    }}
                  >
                    <Text style={[arenaType.body, { fontFamily: fonts.bold, color: ink, flex: 1 }]}>{opt}</Text>
                    {right ? <Check color={C.success} size={18} /> : mine ? <Check color={revealIdx == null ? C.onCoral : C.danger} size={18} /> : null}
                  </PressableScale>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Smile color={C.muted} size={18} />
              <Text style={[arenaType.status, { color: C.muted, flex: 1 }]}>
                {tally.answered > 0
                  ? t(
                    `Pour le plaisir : ${tally.correct} sur ${tally.answered}. Ça ne compte pour aucun classement.`,
                    `Pou plezi : ${tally.correct} sou ${tally.answered}. Sa pa konte nan okenn klasman.`,
                  )
                  : t(
                    'Réponds aussi, pour le plaisir. Ton choix reste sur ton téléphone et ne compte pas.',
                    'Reponn tou, pou plezi. Chwa ou rete sou telefòn ou e li pa konte.',
                  )}
              </Text>
            </View>
          </View>
        ) : phase === 'waitingStart' || phase === 'questionLoading' ? (
          <ArenaPanel>
            <Text style={[arenaType.status, { color: C.inkSoft }]}>
              {t('La prochaine question s’affichera ici. Tu pourras y répondre pour le plaisir.', 'Pwochen kesyon an ap parèt isit la. W ap ka reponn li pou plezi.')}
            </Text>
          </ArenaPanel>
        ) : null}

        {phase === 'ended' && tournament ? (
          <ArenaButton
            label={t('Voir les résultats', 'Wè rezilta yo')}
            onPress={() => navigation.navigate('ArenaResult', { tournamentId: tournament.id })}
          />
        ) : null}

        {/* ── The board, collapsed: top three + the followed school ── */}
        <View style={{ padding: 8, gap: 4, borderRadius: 20, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>
            <Text style={[arenaType.name, { fontSize: 15, color: C.ink, flex: 1 }]}>{t('Classement des écoles', 'Klasman lekòl yo')}</Text>
            {state === 'live' ? <Text style={[arenaType.status, { color: C.muted }]}>{t('après chaque question', 'apre chak kesyon')}</Text> : null}
          </View>
          {rows.length === 0 ? (
            <Text style={[arenaType.status, { color: C.muted, padding: 10 }]}>
              {t('Aucune école classée pour l’instant.', 'Poko gen lekòl ki klase.')}
            </Text>
          ) : rows.map(({ school, followed: isFollowed, pinned }) => (
            <PressableScale
              key={school.key}
              onPress={() => toggleFollow(school.key)}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityState={{ selected: isFollowed }}
              accessibilityLabel={[
                school.rank > 0 ? `${school.rank}` : t('non classée', 'pa klase'),
                school.label || school.shortName,
                `${t('moyenne', 'mwayèn')} ${Math.round(school.teamAvg)}`,
                isFollowed ? t('suivie, toucher pour ne plus suivre', 'w ap swiv li, touche pou w sispann') : t('toucher pour suivre', 'touche pou swiv'),
              ].filter(Boolean).join(', ')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48,
                paddingHorizontal: 10, borderRadius: 14,
                backgroundColor: isFollowed ? C.surfaceRaised : 'transparent',
                marginTop: pinned ? 6 : 0,
              }}
            >
              <Text style={[arenaType.num, { color: isFollowed ? C.coral : C.muted, width: 22 }]}>{school.rank > 0 ? school.rank : '–'}</Text>
              <SchoolCrest name={school.label || school.shortName} size={24} />
              <Text numberOfLines={1} style={[arenaType.name, { fontSize: 15, color: C.ink, flex: 1 }]}>{school.shortName || school.label}</Text>
              <Text style={[arenaType.num, { color: C.ink }]}>{Math.round(school.teamAvg)}</Text>
            </PressableScale>
          ))}
          {!followKey && rows.length > 0 ? (
            <Text style={[arenaType.status, { color: C.muted, paddingHorizontal: 10, paddingVertical: 6 }]}>
              {t('Touche une école pour la suivre.', 'Touche yon lekòl pou w swiv li.')}
            </Text>
          ) : null}
          {rankedCount > 3 ? (
            <PressableScale
              onPress={() => { arenaHaptics.choose(); setBoardOpen((o) => !o); }}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityState={{ expanded: boardOpen }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, marginTop: 4, borderRadius: 14, backgroundColor: C.surfaceRaised }}
            >
              <Text style={[arenaType.action, { fontSize: 15, color: C.ink }]}>
                {boardOpen ? t('Réduire le classement', 'Redwi klasman an') : t(`Voir le classement (${rankedCount} écoles)`, `Wè klasman an (${rankedCount} lekòl)`)}
              </Text>
              {boardOpen ? <ChevronUp color={C.ink} size={18} /> : <ChevronDown color={C.ink} size={18} />}
            </PressableScale>
          ) : null}
        </View>

        {/* ── Who is playing for the followed school (the real five) ── */}
        {followed && followed.top5.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, backgroundColor: C.surface }}>
            <Users color={C.muted} size={18} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[arenaType.name, { fontSize: 15, color: C.ink }]}>{t('Ceux qui comptent pour l’école', 'Sa yo ki konte pou lekòl la')}</Text>
              <Text style={[arenaType.status, { color: C.success }]}>
                {t(`${followed.counted} sur ${followed.members} joueurs`, `${followed.counted} sou ${followed.members} jwè`)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {followed.top5.slice(0, 5).map((uid, i) => (
                <View key={uid} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 18, backgroundColor: C.surface, padding: 2 }}>
                  <Avatar seed={uid} size={32} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <NightLink label={t('Quitter le direct', 'Kite dirèk la')} onPress={back} />
      </ScrollView>
    </ArenaScreen>
  );
}
