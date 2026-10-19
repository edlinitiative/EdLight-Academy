/** Native user-tournament journey, using the existing authoritative engine. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import useStore from '../../contexts/store';
import {
  ArenaScreen,
  ArenaPanel,
  ArenaButton,
} from '../../components/arena/ArenaKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import * as service from '../../services/tournoisService';
import type { Match } from '../../../../shared/tournois/bracket';
import TournoisCreateForm, {
  TournoisPinCard,
} from '../../components/arena/TournoisCreateForm';
import type { TournamentDraft } from '../../../../shared/tournois/creationInput';
import { useTrivia } from '../../hooks/useTrivia';
import {
  TOURNAMENT_STATE,
  enumLabel,
  haitiDate,
} from '../../../../shared/competition/labels';
import {
  PersonFace,
  arenaInputStyle,
} from '../../components/arena/WorkspaceKit';
import { identityText } from '../../../../shared/competition/deletedAccount';
import TeamModePanel from '../../components/arena/TeamModePanel';
import Animated from 'react-native-reanimated';
import TournoisBoard, { TournoisPhaseBar } from '../../components/arena/TournoisBoard';
import { arenaCue, arenaMotion } from '../../components/arena/arenaMotion';
import { useReduceMotion } from '../../utils/motion';
import { answerCue } from '../../../../shared/competition/presentation';

export default function TournoisScreen() {
  const navigation = useNavigation<any>(),
    route = useRoute<any>();
  const uid = useStore((s) => s.user?.uid);
  const user = useStore((s) => s.user);
  const ht = useStore((s) => s.language) === 'ht';
  const t = (fr: string, creole: string) => (ht ? creole : fr);
  const [tid, setTid] = useState<string | null>(
    route.params?.tournamentId ?? null,
  );
  const [pin, setPin] = useState(route.params?.pin ?? '');
  const [viewUid, setViewUid] = useState(uid);
  const [tournament, setTournament] = useState<service.Tournament | null>(null);
  const [live, setLive] = useState<service.LiveState | null>(null);
  const [board, setBoard] = useState<service.Standings | null>(null);
  const [roster, setRoster] = useState<service.RosterEntry[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [step, setStep] = useState<service.RoundStep | null>(null);
  const [review, setReview] = useState<service.ReviewItem[] | null>(null);
  const [roundReview, setRoundReview] = useState(0);
  const [events, setEvents] = useState<service.Tournament[]>([]);
  const [mine, setMine] = useState<service.MyTournament[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [choice, setChoice] = useState<number | null>(null),
    [accepted, setAccepted] = useState(false);
  const [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createFields, setCreateFields] = useState<string[]>([]);
  /** The room just created here: its PIN is shown once the room opens. */
  const [created, setCreated] = useState<{
    tid: string;
    pin: string;
    title: string;
    visibility: TournamentDraft['visibility'];
    joinError?: string;
  } | null>(null);
  const { profile } = useTrivia();
  const lock = useRef(false),
    generation = useRef(0);
  const reduceMotion = useReduceMotion();
  const motion = arenaMotion(reduceMotion);
  const shownAt = useRef(Date.now());
  const activeTarget = useRef({ uid, tid });
  activeTarget.current = { uid, tid };
  const load = useCallback(() => {
    const epoch = generation.current;
    service
      .listPublic('open')
      .then((rows) => {
        if (epoch === generation.current) setEvents(rows);
      })
      .catch(() => {
        if (epoch === generation.current) setError('network');
      });
    if (uid)
      service
        .listMine(uid)
        .then((rows) => {
          if (epoch === generation.current) setMine(rows);
        })
        .catch(() => {
          if (epoch === generation.current) setError('network');
        });
  }, [uid]);
  useEffect(() => {
    generation.current++;
    setMine([]);
    setBusy(false);
    setStep(null);
    setReview(null);
    setChoice(null);
    setAccepted(false);
    load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    setTid(route.params?.tournamentId ?? null);
    setPin(route.params?.pin ?? '');
  }, [route.params?.tournamentId, route.params?.pin]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(timer);
  }, [offset]);
  const synchronize = useCallback(async () => {
    if (!tid) return;
    const serverNow = await service.tick(tid);
    if (serverNow !== null) setOffset(serverNow - Date.now());
  }, [tid]);
  useEffect(() => {
    setViewUid(uid);
    setTournament(null);
    setLive(null);
    setBoard(null);
    setRoster([]);
    setMatches([]);
    setStep(null);
    setReview(null);
    setError('');
    if (!tid) return;
    const slow = setTimeout(() => setError('network'), 8000);
    const unsubs = [
      service.watchTournament(tid, (row, err) => {
        clearTimeout(slow);
        setViewUid(uid);
        setTournament(row);
        if (!row && !err) setError('not_found');
        if (err) setError(err === 'private' ? 'pin_required' : 'network');
      }),
      service.watchLive(tid, setLive),
      service.watchStandings(tid, setBoard),
      service.watchRoster(tid, setRoster),
      service.watchMatches(tid, setMatches),
    ];
    void synchronize();
    const timer = setInterval(() => {
      void synchronize();
    }, 30000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void synchronize();
        setStep(null);
      }
    });
    return () => {
      unsubs.forEach((unsub) => unsub());
      clearTimeout(slow);
      clearInterval(timer);
      app.remove();
    };
  }, [tid, uid, synchronize]);
  useEffect(() => {
    setChoice(null);
    setAccepted(false);
    shownAt.current = live?.opensAt ?? Date.now();
  }, [tid, live?.index, live?.opensAt, step?.pos, step?.round]);
  useEffect(() => {
    const deadline = tournament?.nextDeadlineAt;
    if (!deadline) return;
    const timer = setTimeout(
      () => {
        void synchronize();
      },
      Math.max(80, Math.min(30000, deadline - Date.now() - offset + 50)),
    );
    return () => clearTimeout(timer);
  }, [tournament?.nextDeadlineAt, offset, synchronize]);

  const cuedReveal = useRef(-1);
  useEffect(() => {
    if (!live || live.phase !== 'reveal' || !live.reveal || !accepted || cuedReveal.current === live.index) return;
    cuedReveal.current = live.index;
    arenaCue(answerCue(choice, live.reveal.answer));
  }, [live, accepted, choice]);
  useEffect(() => {
    if (!board?.final || !uid || !tid) return;
    const mine = board.rows.find((r) => r.uid === uid);
    if (mine && mine.rank > 0 && mine.rank <= 3) arenaCue('podium', { podiumKey: `tournois:${tid}` });
  }, [board, uid, tid]);

  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const epoch = generation.current;
    try {
      await task();
    } catch (err) {
      if (
        epoch === generation.current &&
        (!(err instanceof Error) || err.message !== 'request_failed')
      )
        setError('network');
    } finally {
      lock.current = false;
      if (epoch === generation.current) setBusy(false);
    }
  };
  const check = <T,>(result: service.ApiResult<T>): T => {
    if (
      uid !== useStore.getState().user?.uid ||
      tid !== activeTarget.current.tid
    )
      throw new Error('request_failed');
    if (!result.ok || !result.data) {
      setError(result.error || 'network');
      throw new Error('request_failed');
    }
    return result.data;
  };
  const signIn = () => useStore.getState().toggleAuthModal();
  const joined = !!uid && roster.some((r) => r.uid === uid);
  // Shared-answer / relay: the team panel owns play; the individual controls never show.
  const teamPlay =
    joined &&
    (tournament?.gameMode === 'shared' || tournament?.gameMode === 'relay');
  const question =
    tournament?.format === 'live' ? live?.question : step?.question;
  const active =
    tournament?.format === 'live'
      ? live?.phase === 'question' && now < (live?.closesAt ?? 0)
      : !!step && !step.done && now < (step.deadline ?? 0);
  const deadline =
    tournament?.format === 'live' ? live?.closesAt : step?.deadline;
  const label = (fr: string, creole: string) => (
    <Text style={[arenaType.body, { color: C.ink }]}>{t(fr, creole)}</Text>
  );
  const inputStyle = arenaInputStyle;
  /** A public name as printed: deleted accounts localized, blanks → "Participant". */
  const nameText = (value: string | null | undefined) =>
    identityText(value, ht ? 1 : 0).trim() || t('Participant', 'Patisipan');
  const join = () =>
    run(async () => {
      if (!uid) {
        signIn();
        return;
      }
      const out = check(
        await service.joinTournament(
          { ...(tid ? { tid } : {}), ...(pin ? { pin } : {}) },
          { displayName: user?.displayName, grade: useStore.getState().grade },
        ),
      );
      setTid(out.tid);
      navigation.setParams({ tournamentId: out.tid, pin: undefined });
      await synchronize();
    });
  const submitCreation = async (draft: TournamentDraft) => {
    let done = false;
    await run(async () => {
      const res = await service.createFromDraft(draft, {
        displayName:
          (profile as any)?.leaderboard?.displayName || user?.displayName,
        school: (profile as any)?.leaderboard?.school || null,
        grade: useStore.getState().grade,
      });
      setCreateFields(res.ok ? [] : res.fields || []);
      const out = check(res);
      done = true;
      setCreated({
        tid: out.tid,
        pin: out.pin,
        title: draft.title,
        visibility: draft.visibility,
        joinError: out.joinError,
      });
      setCreating(false);
      setTid(out.tid);
    });
    return done;
  };
  if (viewUid !== uid)
    return (
      <ArenaScreen world={false}>
        <Text style={[arenaType.status, { color: C.muted, padding: 24 }]}>
          {t('Chargement du compte…', 'Ap chaje kont lan…')}
        </Text>
      </ArenaScreen>
    );
  return (
    <ArenaScreen world={false}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }}
      >
        <ArenaButton
          variant="secondary"
          label={t('Retour', 'Retounen')}
          icon={<ChevronLeft color={C.ink} size={18} />}
          onPress={() => navigation.goBack()}
          style={{ alignSelf: 'flex-start' }}
        />
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.5}
          style={[arenaType.hero, { color: C.ink }]}
        >
          {tournament?.title || t('Tournois entre amis', 'Tounwa ant zanmi')}
        </Text>
        {error ? (
          <ArenaPanel tone="warn">
            <Text
              accessibilityRole="alert"
              style={[arenaType.status, { color: C.ink }]}
            >
              {service.errorMessage(error, ht)}
            </Text>
            <ArenaButton
              variant="secondary"
              label={t('Réessayer', 'Eseye ankò')}
              onPress={() => {
                setError('');
                if (tid) void synchronize();
                else load();
              }}
            />
          </ArenaPanel>
        ) : null}
        {tid && !tournament ? (
          <ArenaPanel>
            <TextInput
              accessibilityLabel="PIN"
              placeholder="PIN"
              placeholderTextColor={C.muted}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={6}
              style={inputStyle}
            />
            <ArenaButton
              label={t('Rejoindre avec le PIN', 'Antre ak PIN nan')}
              busy={busy}
              onPress={join}
            />
          </ArenaPanel>
        ) : null}
        {!uid ? (
          <ArenaButton
            label={t('Se connecter pour participer', 'Konekte pou patisipe')}
            onPress={signIn}
          />
        ) : null}
        {!tid ? (
          <>
            <ArenaPanel>
              {label('Rejoindre avec un PIN', 'Antre ak yon PIN')}
              <TextInput
                accessibilityLabel="PIN"
                placeholder="PIN"
                placeholderTextColor={C.muted}
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                maxLength={6}
                style={inputStyle}
              />
              <ArenaButton
                label={t('Rejoindre', 'Antre')}
                busy={busy}
                onPress={join}
              />
            </ArenaPanel>
            <ArenaButton
              variant="secondary"
              selected={creating}
              label={t(
                'Créer un tournoi ou une salle privée',
                'Kreye yon tounwa oswa yon sal prive',
              )}
              onPress={() => (uid ? setCreating(!creating) : signIn())}
            />
            {creating ? (
              <TournoisCreateForm
                ht={ht}
                busy={busy}
                serverFields={createFields}
                onSubmit={submitCreation}
              />
            ) : null}
            {mine.length ? (
              <Text
                accessibilityRole="header"
                style={[arenaType.name, { color: C.ink }]}
              >
                {t('Mes tournois et résultats', 'Tounwa ak rezilta mwen yo')}
              </Text>
            ) : null}
            {mine.map((row) => (
              <ArenaButton
                key={row.tid}
                variant="secondary"
                label={row.title}
                onPress={() => setTid(row.tid)}
              />
            ))}
            <Text
              accessibilityRole="header"
              style={[arenaType.name, { color: C.ink }]}
            >
              {t('Tournois publics', 'Tounwa piblik')}
            </Text>
            {!events.length
              ? label(
                  'Aucun tournoi disponible. Vous pouvez jouer une partie dans Jeux ou créer un tournoi.',
                  'Pa gen tounwa disponib. Ou ka jwe yon pati nan Jwèt oswa kreye yon tounwa.',
                )
              : null}
            {events.map((row) => (
              <ArenaButton
                key={row.id}
                variant="secondary"
                label={`${row.title} · ${service.formatLabel(row.format, ht)}`}
                onPress={() => setTid(row.id)}
              />
            ))}
          </>
        ) : (
          <>
            {!tournament && !error
              ? label('Chargement du tournoi…', 'Ap chaje tounwa a…')
              : null}
            {created && created.tid === tid && created.visibility !== 'public' ? (
              <TournoisPinCard
                tid={created.tid}
                pin={created.pin}
                title={created.title}
                visibility={created.visibility}
                ht={ht}
              />
            ) : null}
            {created && created.tid === tid && created.joinError ? (
              <ArenaPanel tone="warn">
                <Text
                  accessibilityRole="alert"
                  style={[arenaType.status, { color: C.ink }]}
                >
                  {t(
                    'Tournoi créé, mais votre inscription comme joueur a échoué :',
                    'Tounwa a kreye, men enskripsyon ou kòm jwè pa pase :',
                  )}{' '}
                  {service.errorMessage(created.joinError, ht)}
                </Text>
              </ArenaPanel>
            ) : null}
            {tournament ? (
              <ArenaPanel>
                {label(
                  service.formatLabel(tournament.format, ht),
                  service.formatLabel(tournament.format, ht),
                )}
                <Text style={[arenaType.status, { color: C.muted }]}>
                  {haitiDate(tournament.startsAt)[ht ? 1 : 0]} ·{' '}
                  {enumLabel(TOURNAMENT_STATE, tournament.state)[ht ? 1 : 0]} ·{' '}
                  {roster.length}/{tournament.maxPlayers}
                </Text>
                {tournament.teamRule === 'class'
                  ? label(
                      'Équipes : classes vérifiées par leur professeur. Seuls les meilleurs scores comptent.',
                      'Ekip yo : klas pwofesè yo verifye. Se sèlman pi bon nòt yo ki konte.',
                    )
                  : tournament.teamRule !== 'solo'
                  ? label(
                      'Groupes déclarés par les joueurs, non vérifiés. Seuls les meilleurs scores comptent.',
                      'Gwoup jwè yo deklare, ki pa verifye. Se sèlman pi bon nòt yo ki konte.',
                    )
                  : null}
                {!joined &&
                tournament.schemaVersion !== 2 &&
                tournament.state !== 'finished' &&
                tournament.state !== 'cancelled' ? (
                  <ArenaButton
                    label={t(
                      'Confirmer mon inscription',
                      'Konfime enskripsyon mwen',
                    )}
                    busy={busy}
                    onPress={join}
                  />
                ) : null}
                {tournament.competitionEventId ? (
                  <ArenaButton
                    variant="secondary"
                    label={t(
                      'Inscription et équipe de cet événement',
                      'Enskripsyon ak ekip evènman sa a',
                    )}
                    onPress={() =>
                      navigation.navigate('CompetitionWorkspace', {
                        kind: 'event',
                        id: tournament.competitionEventId,
                      })
                    }
                  />
                ) : null}
                {joined
                  ? label('Inscription confirmée', 'Enskripsyon konfime')
                  : null}
                {tournament.visibility === 'private' && !joined ? (
                  <TextInput
                    accessibilityLabel="PIN"
                    placeholder="PIN"
                    placeholderTextColor={C.muted}
                    value={pin}
                    onChangeText={setPin}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={inputStyle}
                  />
                ) : null}
                <ArenaButton
                  variant="secondary"
                  label={t('Partager l’invitation', 'Pataje envitasyon an')}
                  onPress={() => {
                    // A bare URL arrived with no context; one sentence + link.
                    void Share.share({
                      message: t(
                        `Rejoins le tournoi « ${tournament.title} » sur EdLight : ${service.shareUrl(tournament)}`,
                        `Vin jwe nan tounwa "${tournament.title}" sou EdLight : ${service.shareUrl(tournament)}`,
                      ),
                    });
                  }}
                />
                {joined &&
                !teamPlay &&
                tournament.format !== 'live' &&
                tournament.state === 'running' ? (
                  <ArenaButton
                    label={t(
                      step ? 'Reprendre ma manche' : 'Commencer / reprendre',
                      step ? 'Reprann manch mwen' : 'Kòmanse / reprann',
                    )}
                    busy={busy}
                    onPress={() =>
                      run(async () => {
                        const next = check(await service.startRound(tid));
                        setStep(next);
                        setOffset(next.serverNow - Date.now());
                      })
                    }
                  />
                ) : null}
              </ArenaPanel>
            ) : null}
            {teamPlay && tournament && uid ? (
              <TeamModePanel
                tournament={tournament}
                live={live}
                roster={roster}
                uid={uid}
                ht={ht}
                nameOf={(v) => nameText(v)}
              />
            ) : null}
            {tournament?.format === 'live' && tournament.state !== 'cancelled' && !teamPlay ? (
              <TournoisPhaseBar state={tournament.state} live={live} now={now} t={t} />
            ) : null}
            {question && !teamPlay ? (
              <Animated.View
                key={`q-${tournament?.format === 'live' ? live?.index : `${step?.round}-${step?.pos}`}`}
                entering={motion.enter}
              >
              <ArenaPanel>
                <Text
                  accessibilityRole="header"
                  style={[arenaType.name, { color: C.ink }]}
                >
                  {ht ? question.qHt || question.q : question.q}
                </Text>
                {/* No live region: a counter that changes every second would
                    talk over the question for a screen-reader user. */}
                <Text style={[arenaType.num, { color: C.muted }]}>
                  {Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000))} s
                </Text>
                {(ht
                  ? question.optionsHt?.length
                    ? question.optionsHt
                    : question.options
                  : question.options
                ).map((option, i) => (
                  <ArenaButton
                    key={`${i}-${option}`}
                    variant={choice === i ? 'primary' : 'secondary'}
                    selected={choice === i}
                    label={`${String.fromCharCode(65 + i)}. ${option}`}
                    disabled={!joined || !active || busy || accepted}
                    onPress={() => setChoice(i)}
                  />
                ))}
                {joined && !accepted ? (
                  <ArenaButton
                    label={t('Valider la réponse', 'Valide repons lan')}
                    disabled={choice === null || !active}
                    busy={busy}
                    onPress={() =>
                      run(async () => {
                        if (choice === null) return;
                        if (tournament?.format === 'live') {
                          check(
                            await service.liveAnswer(
                              tid,
                              live!.index,
                              choice,
                              shownAt.current,
                            ),
                          );
                          setAccepted(true);
                          arenaCue('locked');
                        } else if (step) {
                          const next = check(
                            await service.answerRound(
                              tid,
                              step.round,
                              step.pos,
                              choice,
                            ),
                          );
                          setStep(next);
                          setOffset(next.serverNow - Date.now());
                        }
                      })
                    }
                  />
                ) : null}
                {accepted
                  ? label(
                      'Réponse enregistrée. Révélation à la fin du temps.',
                      'Repons anrejistre. Repons kòrèk la ap parèt lè tan an fini.',
                    )
                  : null}
                {live?.phase === 'reveal' && live.reveal ? (
                  <>
                    {joined ? (
                      <Animated.View
                        entering={motion.reveal}
                        accessible
                        accessibilityLiveRegion="polite"
                        style={{
                          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                          backgroundColor: accepted && choice === live.reveal.answer ? C.successSoft
                            : accepted ? C.dangerSoft : C.surfaceRaised,
                        }}
                      >
                        <Text style={[arenaType.name, {
                          color: accepted && choice === live.reveal.answer ? C.success : accepted ? C.danger : C.inkSoft,
                        }]}>
                          {accepted && choice === live.reveal.answer
                            ? t('✓ Bonne réponse !', '✓ Bon repons !')
                            : accepted
                              ? t('✗ Raté', '✗ Rate')
                              : t('Pas de réponse', 'Pa gen repons')}
                        </Text>
                      </Animated.View>
                    ) : null}
                    <Text style={[arenaType.body, { color: C.ink }]}>
                      {t('Bonne réponse : ', 'Bon repons : ')}
                      {(ht && question.optionsHt?.length ? question.optionsHt : question.options)[live.reveal.answer]}
                      {'\n'}
                      {ht
                        ? live.reveal.explanationHt || live.reveal.explanation
                        : live.reveal.explanation}
                    </Text>
                  </>
                ) : null}
              </ArenaPanel>
              </Animated.View>
            ) : null}
            {step?.done
              ? label(
                  'Manche terminée. Les corrections seront disponibles après la fermeture de la manche.',
                  'Manch lan fini. Koreksyon yo ap disponib lè manch lan fèmen.',
                )
              : null}
            {board ? (
              <TournoisBoard
                board={board}
                uid={uid}
                ht={ht}
                teamRule={tournament?.teamRule ?? null}
                nameOf={nameText}
              />
            ) : null}
            {matches.length ? (
              <ArenaPanel>
                {matches.map((m) => {
                  const winner = [m.a, m.b].find(
                    (side) => side && side.uid === m.winnerUid,
                  );
                  return (
                    <View
                      key={m.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {[m.a, m.b].map((side, i) =>
                        side ? (
                          <PersonFace
                            key={i}
                            person={{
                              uid: side.uid,
                              name: side.displayName,
                              avatar: null,
                            }}
                            size={28}
                          />
                        ) : null,
                      )}
                      <Text
                        style={[arenaType.body, { color: C.ink, flexShrink: 1 }]}
                      >
                        {t('Manche', 'Manch')} {m.round + 1} :{' '}
                        {m.a ? nameText(m.a.displayName) : '—'} /{' '}
                        {m.b ? nameText(m.b.displayName) : '—'}
                        {winner
                          ? ` · ${t('Gagnant', 'Ganyan')} : ${nameText(winner.displayName)}`
                          : ''}
                      </Text>
                    </View>
                  );
                })}
              </ArenaPanel>
            ) : null}
            {joined && tournament ? (
              <ArenaPanel>
                {tournament.format !== 'live' ? (
                  <TextInput
                    accessibilityLabel={t(
                      'Numéro de manche pour les corrections',
                      'Nimewo manch pou koreksyon yo',
                    )}
                    keyboardType="number-pad"
                    value={String(roundReview + 1)}
                    onChangeText={(s) =>
                      setRoundReview(Math.max(0, (parseInt(s, 10) || 1) - 1))
                    }
                    style={inputStyle}
                  />
                ) : null}
                <ArenaButton
                  variant="secondary"
                  label={t(
                    'Voir les corrections disponibles',
                    'Gade koreksyon ki disponib yo',
                  )}
                  busy={busy}
                  onPress={() =>
                    run(async () => {
                      setReview(
                        check(
                          await service.reviewAnswers(
                            tid,
                            tournament.format === 'live'
                              ? undefined
                              : roundReview,
                          ),
                        ).items,
                      );
                    })
                  }
                />
                {review?.map((item, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <Text style={[arenaType.name, { color: C.ink }]}>
                      {ht ? item.qHt || item.q : item.q}
                    </Text>
                    <Text style={[arenaType.body, { color: C.inkSoft }]}>
                      {item.options[item.answer]} ·{' '}
                      {ht
                        ? item.explanationHt || item.explanation
                        : item.explanation}
                    </Text>
                  </View>
                ))}
              </ArenaPanel>
            ) : null}
            {tournament &&
            tournament.schemaVersion !== 2 &&
            tournament.creatorUid === uid &&
            tournament.state === 'scheduled' ? (
              <ArenaButton
                variant="secondary"
                label={t('Annuler le tournoi', 'Anile tounwa a')}
                busy={busy}
                onPress={() =>
                  run(async () => {
                    check(await service.cancelTournament(tid));
                  })
                }
              />
            ) : null}
            <ArenaButton
              variant="secondary"
              label={t('Trouver un autre tournoi', 'Chèche yon lòt tounwa')}
              onPress={() => {
                setTid(null);
                load();
              }}
            />
          </>
        )}
      </ScrollView>
    </ArenaScreen>
  );
}
