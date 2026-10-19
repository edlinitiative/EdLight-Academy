/**
 * Native shared-answer / relay team play. Draws the same model as the web
 * room (shared/teams/client) from the server's `team-state` view; polls it
 * (the starter's presence signal) and re-reads it the moment the app returns
 * to the foreground, so a backgrounded or replaced phone resumes on the
 * server's turn and timer. No control here exists without server support.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { ArenaButton, ArenaPanel } from './ArenaKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import {
  PRACTICE_QUESTION,
  TEAM_POLL_MS,
  modeRules,
  practiceScript,
  teamPanelModel,
  type Copy,
} from '../../../../shared/teams/client';
import type { LiveState, RosterEntry, Tournament } from '../../../../shared/tournois/models';
import * as service from '../../services/tournoisService';
import Animated from 'react-native-reanimated';
import { arenaCue, arenaMotion } from './arenaMotion';
import { useReduceMotion } from '../../utils/motion';
import { answerCue } from '../../../../shared/competition/presentation';

const RESYNC = new Set(['authority_stale', 'not_authority_holder', 'team_answer_exists', 'not_your_turn', 'turn_not_open', 'holder_present']);

export default function TeamModePanel({
  tournament, live, roster, uid, ht, nameOf,
}: {
  tournament: Tournament;
  live: LiveState | null;
  roster: RosterEntry[];
  uid: string;
  ht: boolean;
  nameOf: (displayName: string | null | undefined) => string;
}) {
  const [team, setTeam] = useState<service.TeamState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [practice, setPractice] = useState<number | null>(null);
  const [rules, setRules] = useState(false);
  const shownAt = useRef<Record<number, number>>({});
  const lock = useRef(false);
  const reduceMotion = useReduceMotion();
  const motion = arenaMotion(reduceMotion);
  const cuedReveal = useRef(-1);
  const t = (fr: string, creole: string) => (ht ? creole : fr);
  const cp = (c: Copy) => c[ht ? 1 : 0];
  const mode = tournament.gameMode === 'relay' ? 'relay' : 'shared';
  const format = tournament.format === 'live' ? 'live' : 'window';
  const over = tournament.state === 'finished' || tournament.state === 'cancelled';
  const name = (u: string) => nameOf(roster.find((r) => r.uid === u)?.displayName);

  const refresh = useCallback(async () => {
    const r = await service.teamApi.state(tournament.id);
    if (r.ok && r.data) {
      setTeam(r.data);
      setOffset(r.data.serverNow - Date.now());
    } else if (r.error) setError(r.error);
  }, [tournament.id]);

  useEffect(() => {
    void refresh();
    if (over) return undefined;
    const poll = setInterval(() => void refresh(), TEAM_POLL_MS);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => {
      clearInterval(poll);
      app.remove();
    };
  }, [refresh, over]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(tick);
  }, [offset]);

  const act = async (run: () => Promise<service.ApiResult<any>>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await run();
      if (r.ok && r.data && 'entryId' in r.data) setTeam(r.data);
      else if (r.ok) void refresh();
      if (!r.ok) {
        setError(r.error || 'network');
        if (r.error && RESYNC.has(r.error)) void refresh();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const sentChoice = team ? teamPanelModel(team, uid, now, (u) => u, tournament.questionCount).teamChoice : null;
  useEffect(() => {
    if (!live || live.phase !== 'reveal' || !live.reveal || cuedReveal.current === live.index) return;
    cuedReveal.current = live.index;
    arenaCue(answerCue(sentChoice, live.reveal.answer));
  }, [live, sentChoice]);

  if (live?.phase === 'question' && live.index >= 0 && shownAt.current[live.index] == null)
    shownAt.current[live.index] = now;
  const body = (text: string, muted = false) => (
    <Text style={[arenaType.body, { color: muted ? C.muted : C.ink }]}>{text}</Text>
  );

  if (!team)
    return (
      <ArenaPanel>
        {body(error ? service.errorMessage(error, ht) : t('Chargement de votre équipe…', 'Ap chaje ekip ou…'), true)}
      </ArenaPanel>
    );
  const model = teamPanelModel(team, uid, now, name, tournament.questionCount);
  const question = format === 'live' ? (model.showQuestion ? live?.question : null) : team.window?.question;
  const index = format === 'live' ? live?.index ?? -1 : team.window?.pos ?? -1;
  const reveal = format === 'live' && live?.phase === 'reveal' ? live.reveal : null;
  const options = question ? (ht && question.optionsHt?.length ? question.optionsHt : question.options) : [];
  const script = practiceScript(mode);
  const pq = PRACTICE_QUESTION;

  return (
    <View style={{ gap: 16 }}>
      <ArenaPanel tone="raised">
        <Text accessibilityRole="header" style={[arenaType.name, { color: C.ink }]}>
          {mode === 'shared' ? t('Réponse commune', 'Repons komen') : t('Relais', 'Relè')} · {team.label}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[arenaType.status, { color: C.ink }]}>
          {cp(model.status)}
        </Text>
        {model.deadline && model.deadline > now
          ? body(`${Math.ceil((model.deadline - now) / 1000)} s`, true)
          : null}
        {model.notes.map((n) => <View key={n[0]}>{body(cp(n), true)}</View>)}
        {model.canStart ? (
          <ArenaButton label={cp(model.startLabel)} busy={busy}
            onPress={() => act(() => service.teamApi.start(tournament.id, team.authorityVersion))} />
        ) : null}
        {model.canClaim ? (
          <ArenaButton label={t('Reprendre la réponse de l’équipe', 'Pran repons ekip la')} busy={busy}
            onPress={() => act(() => service.teamApi.claim(tournament.id, team.authorityVersion))} />
        ) : null}
        {model.claimIn !== null && !over
          ? body(t(
              `Si le porte-parole ne répond plus, vous pourrez reprendre la main dans ${Math.ceil(model.claimIn / 1000)} s.`,
              `Si pòtpawòl la pa reponn ankò, ou ka pran men an nan ${Math.ceil(model.claimIn / 1000)} s.`,
            ), true)
          : null}
        {model.canTransfer && !over
          ? model.transferTo.map((u) => (
              <ArenaButton key={u} variant="secondary" busy={busy}
                label={t(`Passer la main à ${name(u)}`, `Pase men bay ${name(u)}`)}
                onPress={() => act(() => service.teamApi.transfer(tournament.id, u, team.authorityVersion))} />
            ))
          : null}
        {!team.started ? (
          <ArenaButton variant="secondary" label={t('S’entraîner (1 question)', 'Antrene (1 kesyon)')}
            onPress={() => setPractice(0)} />
        ) : null}
        <ArenaButton variant="secondary" selected={rules} label={t('Règles du mode', 'Règ mòd la')}
          onPress={() => setRules(!rules)} />
        {rules ? modeRules(mode, format).map((r) => <View key={r[0]}>{body(cp(r))}</View>) : null}
        {error ? (
          <Text accessibilityRole="alert" style={[arenaType.status, { color: C.ink }]}>
            {service.errorMessage(error, ht)}
          </Text>
        ) : null}
      </ArenaPanel>

      {practice !== null ? (
        <ArenaPanel>
          {body(t('Entraînement (rien n’est envoyé)', 'Antrennman (anyen pa voye)'), true)}
          {body(cp(script[Math.min(practice, script.length - 1)]))}
          <Text accessibilityRole="header" style={[arenaType.name, { color: C.ink }]}>{ht ? pq.qHt : pq.q}</Text>
          {(ht ? pq.optionsHt : pq.options).map((o, i) => (
            <ArenaButton key={o} variant={practice >= 2 && i === pq.answer ? 'primary' : 'secondary'}
              label={`${String.fromCharCode(65 + i)}. ${o}`} disabled={practice > 0} onPress={() => setPractice(1)} />
          ))}
          {practice === 1 ? <ArenaButton label={t('Voir la révélation', 'Wè repons lan')} onPress={() => setPractice(2)} /> : null}
          {practice >= 2 ? <ArenaButton variant="secondary" label={t('J’ai compris', 'Mwen konprann')} onPress={() => setPractice(null)} /> : null}
        </ArenaPanel>
      ) : null}

      {question ? (
        <Animated.View key={`q-${index}`} entering={motion.enter}>
        <ArenaPanel>
          {body(`${t('Question', 'Kesyon')} ${index + 1}/${tournament.questionCount}`, true)}
          <Text accessibilityRole="header" style={[arenaType.name, { color: C.ink }]}>
            {ht ? question.qHt || question.q : question.q}
          </Text>
          {options.map((option, i) => (
            <ArenaButton key={`${i}-${option}`}
              variant={model.teamChoice === i || reveal?.answer === i ? 'primary' : 'secondary'}
              selected={model.teamChoice === i}
              label={`${String.fromCharCode(65 + i)}. ${option}`}
              disabled={!model.canAnswer || busy}
              onPress={() => act(() => (format === 'live'
                ? service.teamApi.liveAnswer(tournament.id, index, i, team.authorityVersion, shownAt.current[index] ?? now)
                : service.teamApi.answer(tournament.id, team.window!.pos, i, team.authorityVersion)))} />
          ))}
          {reveal ? (
            <Animated.View entering={motion.reveal} accessible accessibilityLiveRegion="polite">
              {body(model.teamChoice == null
                ? t('L’équipe n’a pas répondu.', 'Ekip la pa t reponn.')
                : model.teamChoice === reveal.answer
                  ? t('✓ Bonne réponse pour l’équipe !', '✓ Bon repons pou ekip la !')
                  : t('✗ Raté pour l’équipe.', '✗ Ekip la rate.'))}
            </Animated.View>
          ) : null}
          {reveal ? body(ht ? reveal.explanationHt || reveal.explanation : reveal.explanation) : null}
        </ArenaPanel>
        </Animated.View>
      ) : null}
    </View>
  );
}
