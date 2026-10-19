/**
 * Shared-answer and relay team play on the web room (/tournois/:id).
 *
 * Everything this panel offers comes from the server's `team-state` view
 * through the shared model (shared/teams/client): who holds the team answer,
 * whose relay turn it is, when a claim becomes possible. The panel polls that
 * view (it is also the starter's presence signal) and refreshes at once when
 * the tab becomes visible again, so a backgrounded or reloaded device resumes
 * where the server says — never with a local timer of its own.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRACTICE_QUESTION,
  TEAM_POLL_MS,
  modeRules,
  practiceScript,
  teamPanelModel,
  type Copy,
} from '../../../shared/teams/client';
import { identityText } from '../../../shared/competition/deletedAccount';
import {
  errorMessage,
  reviewAnswers,
  teamApi,
  type LiveState,
  type ReviewItem,
  type RosterEntry,
  type TeamState,
  type Tournament,
} from '../../services/tournoisService';
import { useLang } from './parts';

/** Errors after which the screen must re-read the server's view of the team. */
const RESYNC = new Set(['authority_stale', 'not_authority_holder', 'team_answer_exists', 'not_your_turn', 'turn_not_open', 'holder_present']);

function Practice({ mode, onClose }: { mode: 'shared' | 'relay'; onClose: () => void }) {
  const { t, isCreole } = useLang();
  const [picked, setPicked] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const script = practiceScript(mode);
  const q = PRACTICE_QUESTION;
  const options = isCreole ? q.optionsHt : q.options;
  return (
    <div className="tn-card" style={{ display: 'grid', gap: '0.75rem' }} aria-live="polite">
      <div className="tn-section__head">
        <h2>{t('Entraînement (rien n’est envoyé)', 'Antrennman (anyen pa voye)')}</h2>
        <button type="button" className="button button--ghost" onClick={onClose}>{t('Fermer', 'Fèmen')}</button>
      </div>
      <p className="tn-muted">{script[Math.min(step, script.length - 1)][isCreole ? 1 : 0]}</p>
      <p className="tn-q__text">{isCreole ? q.qHt : q.q}</p>
      <div className="tn-opts">
        {options.map((opt, i) => {
          const cls = ['tn-opt', picked === i ? 'is-picked' : '', step >= 2 && i === q.answer ? 'is-right' : '', step >= 2 && picked === i && i !== q.answer ? 'is-wrong' : '']
            .filter(Boolean).join(' ');
          return (
            <button key={opt} type="button" className={cls} disabled={step > 0} aria-pressed={picked === i}
              onClick={() => { setPicked(i); setStep(1); }}>
              <span className="tn-opt__key" aria-hidden="true">{i + 1}</span>
              <span className="tn-opt__label">{opt}</span>
            </button>
          );
        })}
      </div>
      {step === 1 && <button type="button" className="button button--primary" onClick={() => setStep(2)}>{t('Voir la révélation', 'Wè repons lan')}</button>}
      {step === 2 && <button type="button" className="button button--ghost" onClick={onClose}>{t('J’ai compris', 'Mwen konprann')}</button>}
    </div>
  );
}

export default function TeamPlay({ tour, live, roster, me, now, onOffset }: {
  tour: Tournament;
  live: LiveState | null;
  roster: RosterEntry[];
  me: string;
  now: number;
  onOffset?: (offset: number) => void;
}) {
  const { t, isCreole } = useLang();
  const [team, setTeam] = useState<TeamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(false);
  const [to, setTo] = useState('');
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const shownAt = useRef<Record<number, number>>({});
  const mode = tour.gameMode === 'relay' ? 'relay' : 'shared';
  const format = tour.format === 'live' ? 'live' : 'window';
  const cp = (c: Copy) => c[isCreole ? 1 : 0];
  const names = useMemo(() => new Map(roster.map((r) => [r.uid, r.displayName])), [roster]);
  const name = useCallback((uid: string) => identityText(names.get(uid) ?? '', isCreole ? 1 : 0).trim() || t('Coéquipier', 'Manm ekip'), [names, isCreole, t]);
  const over = tour.state === 'finished' || tour.state === 'cancelled';

  const refresh = useCallback(async () => {
    const r = await teamApi.state(tour.id);
    if (r.ok && r.data) {
      setTeam(r.data);
      onOffset?.(r.data.serverNow - Date.now());
    } else if (r.error) setError(errorMessage(r.error, isCreole));
  }, [tour.id, isCreole, onOffset]);

  useEffect(() => {
    void refresh();
    if (over) return undefined;
    const timer = window.setInterval(() => { void refresh(); }, TEAM_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, over]);

  const act = useCallback(async (run: () => Promise<{ ok: boolean; error?: string; data?: any }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await run();
    setBusy(false);
    if (r.ok && r.data && 'entryId' in r.data) setTeam(r.data as TeamState);
    if (!r.ok) setError(errorMessage(r.error, isCreole));
    if (!r.ok && r.error && RESYNC.has(r.error)) void refresh();
    else if (r.ok && !(r.data && 'entryId' in r.data)) void refresh();
  }, [busy, isCreole, refresh]);

  if (live?.phase === 'question' && live.index >= 0 && shownAt.current[live.index] == null) shownAt.current[live.index] = now;

  if (!team) return <div className="tn-card"><p className="tn-muted">{error || t('Chargement de votre équipe…', 'Ap chaje ekip ou…')}</p></div>;
  const model = teamPanelModel(team, me, now, name, tour.questionCount);
  const question = format === 'live' ? (model.showQuestion ? live?.question : null) : team.window?.question;
  const qIndex = format === 'live' ? live?.index ?? -1 : team.window?.pos ?? -1;
  const reveal = format === 'live' && live?.phase === 'reveal' && live.reveal ? live.reveal : null;
  const options = question ? (isCreole && question.optionsHt ? question.optionsHt : question.options) : [];

  const answer = (choice: number) => act(() => (format === 'live'
    ? teamApi.liveAnswer(tour.id, qIndex, choice, team.authorityVersion, shownAt.current[qIndex] ?? now)
    : teamApi.answer(tour.id, team.window!.pos, choice, team.authorityVersion)));

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="tn-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <div className="tn-section__head">
          <h2>{mode === 'shared' ? t('Réponse commune', 'Repons komen') : t('Relais', 'Relè')} · {team.label}</h2>
          {model.deadline && model.deadline > now && <span aria-live="off">{Math.ceil((model.deadline - now) / 1000)} s</span>}
        </div>
        <p role="status" style={{ margin: 0, fontWeight: 600 }}>{cp(model.status)}</p>
        {model.notes.length > 0 && <ul className="tn-muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>{model.notes.map((n) => <li key={n[0]}>{cp(n)}</li>)}</ul>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {model.canStart && <button type="button" className="button button--primary" disabled={busy} onClick={() => act(() => teamApi.start(tour.id, team.authorityVersion))}>{cp(model.startLabel)}</button>}
          {model.canClaim && <button type="button" className="button button--primary" disabled={busy} onClick={() => act(() => teamApi.claim(tour.id, team.authorityVersion))}>{t('Reprendre la réponse de l’équipe', 'Pran repons ekip la')}</button>}
          {model.claimIn !== null && !over && <span className="tn-muted">{t(`Si le porte-parole ne répond plus, vous pourrez reprendre la main dans ${Math.ceil(model.claimIn / 1000)} s.`, `Si pòtpawòl la pa reponn ankò, ou ka pran men an nan ${Math.ceil(model.claimIn / 1000)} s.`)}</span>}
          {!team.started && <button type="button" className="button button--ghost" onClick={() => setPractice(true)}>{t('S’entraîner (1 question)', 'Antrene (1 kesyon)')}</button>}
        </div>
        {model.canTransfer && model.transferTo.length > 0 && !over && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor="tn-transfer" className="tn-muted">{t('Passer la main à', 'Pase men bay')}</label>
            <select id="tn-transfer" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{t('Choisir…', 'Chwazi…')}</option>
              {model.transferTo.map((u) => <option key={u} value={u}>{name(u)}</option>)}
            </select>
            <button type="button" className="button button--ghost" disabled={!to || busy} onClick={() => act(() => teamApi.transfer(tour.id, to, team.authorityVersion))}>{t('Transférer', 'Transfere')}</button>
          </div>
        )}
        <details>
          <summary>{t('Règles du mode', 'Règ mòd la')}</summary>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>{modeRules(mode, format).map((r) => <li key={r[0]}>{cp(r)}</li>)}</ul>
        </details>
        {error && <p className="tn-error" role="alert">{error}</p>}
      </div>

      {practice && <Practice mode={mode} onClose={() => setPractice(false)} />}

      {question && (
        <div className="tn-card tn-q">
          <div className="tn-q__head"><span>{t('Question', 'Kesyon')} {qIndex + 1}/{tour.questionCount}</span></div>
          <p className="tn-q__text">{isCreole && question.qHt ? question.qHt : question.q}</p>
          <div className="tn-opts">
            {options.map((opt, i) => {
              const cls = ['tn-opt', model.teamChoice === i ? 'is-picked' : '', reveal?.answer === i ? 'is-right' : '', reveal && model.teamChoice === i && reveal.answer !== i ? 'is-wrong' : '']
                .filter(Boolean).join(' ');
              return (
                <button key={`${i}-${opt}`} type="button" className={cls} disabled={!model.canAnswer || busy} aria-pressed={model.teamChoice === i} onClick={() => answer(i)}>
                  <span className="tn-opt__key" aria-hidden="true">{i + 1}</span>
                  <span className="tn-opt__label">{opt}</span>
                </button>
              );
            })}
          </div>
          {reveal && (isCreole ? reveal.explanationHt : reveal.explanation) && <div className="tn-explain">{isCreole ? reveal.explanationHt : reveal.explanation}</div>}
        </div>
      )}

      {(over || team.window?.done) && (
        review ? (
          <div className="tn-card" style={{ display: 'grid', gap: '0.5rem' }}>
            <h2>{t('Correction de l’équipe', 'Koreksyon ekip la')}</h2>
            {review.map((it, i) => {
              const opts = isCreole && it.optionsHt ? it.optionsHt : it.options;
              return <p key={i} style={{ margin: 0 }}>{i + 1}. {isCreole && it.qHt ? it.qHt : it.q} — ✓ {opts[it.answer]}{it.choice == null ? ` · ${t('pas de réponse', 'pa gen repons')}` : it.choice !== it.answer ? ` · ${t('équipe', 'ekip')} : ${opts[it.choice]}` : ''}</p>;
            })}
          </div>
        ) : (
          <button type="button" className="button button--ghost" onClick={async () => {
            const r = await reviewAnswers(tour.id, format === 'live' ? undefined : 0);
            if (r.ok && r.data) setReview(r.data.items); else setError(errorMessage(r.error, isCreole));
          }}>{t('Voir la correction de l’équipe', 'Wè koreksyon ekip la')}</button>
        )
      )}
    </div>
  );
}
