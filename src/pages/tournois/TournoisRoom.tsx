/**
 * /tournois/:id — the room.
 *
 * One page for everyone: the players, the creator, and the spectators who
 * "loop in to see the game" (Ted). It reads only what the rules let a client
 * read — the tournament, the roster, the ONE live document, the rebuilt
 * standings, the bracket — and keeps the tournament on time by ticking the
 * server when its own countdown runs out (useLazyTicker).
 *
 * The answer key reaches this page only through live/state's `reveal` (live)
 * or through `review` after a round has closed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, Play, RotateCcw, Users, X } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { GRADES } from '../../../shared/trackConfig';
import { formatPin } from '../../../shared/tournois/config';
import { roundAt } from '../../../shared/tournois/schedule';
import type { PublicQuestion } from '../../../shared/tournois/questions';
import type { Match } from '../../../shared/tournois/bracket';
import {
  answerRound,
  cancelTournament,
  errorMessage,
  formatLabel,
  joinTournament,
  liveAnswer,
  reviewAnswers,
  shareUrl,
  startRound,
  watchLive,
  watchMatches,
  watchProgress,
  watchRoster,
  watchStandings,
  watchTournament,
  type LiveState,
  type ReviewItem,
  type RosterEntry,
  type RoundStep,
  type Standings,
  type Tournament,
} from '../../services/tournoisService';
import {
  Board,
  BracketView,
  CopyButton,
  InviteButton,
  MeStrip,
  Podium,
  SquadBars,
  formatCountdown,
  formatWhen,
  initials,
  nf,
  useLang,
  useLazyTicker,
  useServerNow,
} from './parts';
import './Tournois.css';

// ── Question card (live and rounds share it) ───────────────────────────────

function QuestionCard({
  q, index, count, deadline, questionMs, now, picked, onPick, disabled, reveal, footer,
}: {
  q: PublicQuestion;
  index: number;
  count: number;
  deadline: number;
  questionMs: number;
  now: number;
  picked: number | null;
  onPick?: (i: number) => void;
  disabled: boolean;
  reveal?: { answer: number; counts?: number[]; explanation?: string } | null;
  footer?: React.ReactNode;
}) {
  const { t, isCreole } = useLang();
  const left = Math.max(0, deadline - now);
  const share = reveal ? 0 : Math.min(1, left / questionMs);
  const text = isCreole && q.qHt ? q.qHt : q.q;
  const options = isCreole && q.optionsHt ? q.optionsHt : q.options;
  const total = reveal?.counts ? Math.max(1, reveal.counts.reduce((s, n) => s + n, 0)) : 1;

  // 1–4 on the keyboard, like the mockup's keycaps.
  useEffect(() => {
    if (!onPick || disabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) onPick(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick, disabled, options.length]);

  return (
    <div className="tn-card tn-q">
      <div className="tn-q__head">
        <span>{t('Question', 'Kesyon')} {index + 1}/{count}</span>
        <span aria-live="off">{reveal ? t('Réponse', 'Repons') : `${Math.ceil(left / 1000)} s`}</span>
      </div>
      <div className={`tn-timer${share < 0.3 ? ' is-low' : ''}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${share})` }} />
      </div>
      {q.flagIso && (
        <img className="tn-q__flag" src={`https://flagcdn.com/w320/${q.flagIso}.png`} srcSet={`https://flagcdn.com/w640/${q.flagIso}.png 2x`} alt={t('Drapeau', 'Drapo')} />
      )}
      <p className="tn-q__text">{text}</p>
      <div className="tn-opts">
        {options.map((opt, i) => {
          const isRight = reveal && reveal.answer === i;
          const isWrong = reveal && picked === i && reveal.answer !== i;
          const cls = ['tn-opt', picked === i ? 'is-picked' : '', isRight ? 'is-right' : '', isWrong ? 'is-wrong' : ''].filter(Boolean).join(' ');
          const c = reveal?.counts?.[i];
          return (
            <button key={i} type="button" className={cls} disabled={disabled} onClick={() => onPick?.(i)} aria-pressed={picked === i}>
              {c != null && <span className="tn-opt__bar" style={{ width: `${(c / total) * 100}%` }} aria-hidden="true" />}
              <span className="tn-opt__key" aria-hidden="true">{i + 1}</span>
              <span className="tn-opt__label">{opt}</span>
              {c != null && <span className="tn-opt__count">{c}</span>}
            </button>
          );
        })}
      </div>
      {reveal?.explanation && <div className="tn-explain">{reveal.explanation}</div>}
      {footer && <div className="tn-q__foot">{footer}</div>}
    </div>
  );
}

function ReviewList({ items }: { items: ReviewItem[] }) {
  const { t, isCreole } = useLang();
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {items.map((it, i) => {
        const opts = isCreole && it.optionsHt ? it.optionsHt : it.options;
        const ok = it.choice === it.answer;
        return (
          <div key={i} className="tn-card" style={{ display: 'grid', gap: '0.4rem' }}>
            <div className="tn-q__head">
              <span>{i + 1}. {isCreole && it.qHt ? it.qHt : it.q}</span>
              <span className={`tn-pill ${ok ? 'tn-pill--done' : 'tn-pill--warn'}`}>{nf(it.points)} pts</span>
            </div>
            <span>✓ {opts[it.answer]}</span>
            {!ok && <span className="tn-muted">{it.choice == null ? t('Pas de réponse', 'Pa gen repons') : `${t('Ta réponse', 'Repons ou')} : ${opts[it.choice]}`}</span>}
            {(isCreole ? it.explanationHt : it.explanation) && <div className="tn-explain">{isCreole ? it.explanationHt : it.explanation}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Live ───────────────────────────────────────────────────────────────────

function LiveStage({ tour, live, progress, standings, roster, me, canPlay, now }: {
  tour: Tournament; live: LiveState | null; progress: { index: number; answered: number } | null;
  standings: Standings | null; roster: RosterEntry[]; me: string | null; canPlay: boolean; now: number;
}) {
  const { t, isCreole } = useLang();
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const shownAt = useRef<Record<number, number>>({});
  const rows = standings?.rows || [];

  const phase = live?.phase || 'lobby';
  const index = live?.index ?? -1;
  if (phase === 'question' && index >= 0 && shownAt.current[index] == null) shownAt.current[index] = now;

  const pick = useCallback(async (choice: number) => {
    if (!live || live.phase !== 'question' || picks[live.index] != null) return;
    const i = live.index;
    setPicks((p) => ({ ...p, [i]: choice }));
    setError(null);
    const r = await liveAnswer(tour.id, i, choice, shownAt.current[i] ?? now);
    if (!r.ok) {
      setError(errorMessage(r.error, isCreole));
      if (r.error !== 'answers_closed') setPicks((p) => { const n = { ...p }; delete n[i]; return n; });
    }
  }, [live, picks, tour.id, now, isCreole]);

  if (phase === 'lobby' || tour.state === 'scheduled') {
    return (
      <div className="tn-split">
        <div className="tn-card tn-count">
          <span className="tn-muted">{t('Le direct commence dans', 'An dirèk la kòmanse nan')}</span>
          <span className="tn-count__num">{formatCountdown(tour.startsAt - now)}</span>
          <span className="tn-muted">{formatWhen(tour.startsAt, isCreole)} · {tour.questionCount} {t('questions', 'kesyon')} · {tour.secondsPerQuestion} s</span>
        </div>
        <div className="tn-card">
          <div className="tn-section__head"><h2><Users size={17} aria-hidden="true" /> {t('Joueurs connectés', 'Jwè ki la')}</h2><span>{roster.length}</span></div>
          {roster.length ? (
            <ul className="tn-players">
              {roster.map((r) => (
                <li key={r.uid} className={`tn-player${r.uid === me ? ' is-me' : ''}`}>
                  <span className="tn-avatar" aria-hidden="true">{initials(r.displayName)}</span>{r.displayName}
                </li>
              ))}
            </ul>
          ) : <p className="tn-muted">{t('Personne pour l’instant. Partage le PIN !', 'Pa gen moun pou kounye a. Pataje PIN nan !')}</p>}
        </div>
      </div>
    );
  }

  if (phase === 'done' || tour.state === 'finished') {
    return (
      <div className="tn-split">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="tn-card">
            <div className="tn-section__head"><h2>{t('Podium final', 'Podyòm final')}</h2></div>
            <Podium rows={rows} />
          </div>
          {canPlay && (
            review ? <ReviewList items={review} /> : (
              <button type="button" className="button button--ghost" onClick={async () => {
                const r = await reviewAnswers(tour.id);
                if (r.ok) setReview(r.data.items); else setError(errorMessage(r.error, isCreole));
              }}>
                <RotateCcw size={16} aria-hidden="true" /> {t('Voir la correction', 'Wè koreksyon an')}
              </button>
            )
          )}
          {error && <p className="tn-error">{error}</p>}
        </div>
        <StandingsCard tour={tour} standings={standings} me={me} />
      </div>
    );
  }

  const q = live?.question;
  const isReveal = phase === 'reveal';
  const answered = isReveal ? live?.reveal?.answered ?? 0 : progress?.index === index ? progress.answered : 0;
  return (
    <div className="tn-split">
      <div style={{ display: 'grid', gap: '1rem' }}>
        {q && (
          <QuestionCard
            q={q}
            index={index}
            count={live.questionCount}
            deadline={live.closesAt}
            questionMs={live.questionMs}
            now={now}
            picked={picks[index] ?? null}
            onPick={canPlay ? pick : undefined}
            disabled={!canPlay || isReveal || picks[index] != null || now >= live.closesAt}
            reveal={isReveal && live.reveal ? {
              answer: live.reveal.answer,
              counts: live.reveal.counts,
              explanation: isCreole ? live.reveal.explanationHt : live.reveal.explanation,
            } : null}
            footer={(
              <>
                <span>{t(`${answered}/${tour.playerCount} ont validé`, `${answered}/${tour.playerCount} valide`)}</span>
                {isReveal
                  ? <span>{t('Question suivante dans', 'Pwochen kesyon nan')} {Math.max(0, Math.ceil((live.revealUntil - now) / 1000))} s</span>
                  : !canPlay ? <span><Eye size={13} aria-hidden="true" /> {t('Mode spectateur', 'Mòd espektatè')}</span>
                    : picks[index] != null ? <span>{t('Réponse envoyée — verdict à la fin du temps', 'Repons voye — rezilta a lè tan an fini')}</span> : null}
              </>
            )}
          />
        )}
        {error && <p className="tn-error" role="alert">{error}</p>}
        {isReveal && live.reveal && (
          <div className="tn-card">
            <div className="tn-section__head">
              <h2>{t('Statistiques', 'Estatistik')}</h2>
              <span>{t(`${live.reveal.correct}/${live.reveal.answered} bonnes réponses`, `${live.reveal.correct}/${live.reveal.answered} bon repons`)}</span>
            </div>
            <Podium rows={rows} />
          </div>
        )}
      </div>
      <StandingsCard tour={tour} standings={standings} me={me} />
    </div>
  );
}

function StandingsCard({ tour, standings, me }: { tour: Tournament; standings: Standings | null; me: string | null }) {
  const { t } = useLang();
  const rows = standings?.rows || [];
  return (
    <aside style={{ display: 'grid', gap: '1rem' }}>
      {tour.teamRule !== 'solo' && (
        <div className="tn-card">
          <div className="tn-section__head">
            <h2>{tour.teamRule === 'school' ? t('École contre école', 'Lekòl kont lekòl') : t('Classe contre classe', 'Klas kont klas')}</h2>
          </div>
          <SquadBars teams={standings?.teams || []} teamSize={tour.teamSize} />
        </div>
      )}
      <div className="tn-card">
        <div className="tn-section__head">
          <h2>{standings?.final ? t('Classement final', 'Klasman final') : t('Classement en direct', 'Klasman an dirèk')}</h2>
          <span>{standings?.total || 0} {t('joueurs', 'jwè')}</span>
        </div>
        <Board rows={rows} me={me} limit={10} />
      </div>
      <MeStrip rows={rows} me={me} />
    </aside>
  );
}

// ── Rounds (window / manches / bracket) ────────────────────────────────────

function RoundPlayer({ tour, now, offset, onDone }: { tour: Tournament; now: number; offset: number; onDone: () => void }) {
  const { t, isCreole } = useLang();
  const [step, setStep] = useState<RoundStep | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionMs = tour.schedule.questionMs;

  useEffect(() => {
    let alive = true;
    startRound(tour.id).then((r) => {
      if (!alive) return;
      if (r.ok) setStep(r.data);
      else setError(errorMessage(r.error, isCreole));
    });
    return () => { alive = false; };
  }, [tour.id, isCreole]);

  const send = useCallback(async (choice: number) => {
    if (!step || busy || step.done) return;
    setBusy(true);
    setPicked(choice >= 0 ? choice : null);
    const r = await answerRound(tour.id, step.round, step.pos, choice);
    setBusy(false);
    setPicked(null);
    if (r.ok) setStep(r.data);
    else setError(errorMessage(r.error, isCreole));
  }, [step, busy, tour.id, isCreole]);

  // Time ran out: close the question as unanswered so the next one is served.
  useEffect(() => {
    if (!step || step.done || !step.deadline || busy) return undefined;
    const wait = step.deadline - (Date.now() + offset) + 400;
    const id = window.setTimeout(() => send(-1), Math.max(0, wait));
    return () => window.clearTimeout(id);
  }, [step, busy, offset, send]);

  if (error) return <div className="tn-card"><p className="tn-error">{error}</p><button type="button" className="button button--ghost" onClick={onDone}>{t('Fermer', 'Fèmen')}</button></div>;
  if (!step) return <div className="tn-card"><p className="tn-muted">{t('Préparation de ta manche…', 'Ap prepare manch ou…')}</p></div>;
  if (step.done || !step.question) {
    return (
      <div className="tn-card" style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>{t('Manche terminée !', 'Manch lan fini !')}</h2>
        <p className="tn-muted">{t('Tes réponses sont enregistrées. La correction et ton score s’ouvrent à la clôture de la manche — pour que personne ne puisse souffler les réponses.', 'Repons ou yo anrejistre. Koreksyon an ak nòt ou ap louvri lè manch lan fèmen — konsa pèsonn pa ka bay repons yo.')}</p>
        <button type="button" className="button button--primary" onClick={onDone}>{t('Retour au tournoi', 'Retounen nan tounwa a')}</button>
      </div>
    );
  }
  return (
    <QuestionCard
      q={step.question}
      index={step.pos}
      count={step.count}
      deadline={step.deadline || now}
      questionMs={questionMs}
      now={now}
      picked={picked}
      onPick={send}
      disabled={busy}
      footer={<span>{t('Réponds avant la fin de la barre. Pas de correction avant la clôture.', 'Reponn anvan ba a fini. Pa gen koreksyon anvan manch lan fèmen.')}</span>}
    />
  );
}

function RoundsStage({ tour, standings, matches, me, canPlay, now, offset }: {
  tour: Tournament; standings: Standings | null; matches: Match[]; me: string | null; canPlay: boolean; now: number; offset: number;
}) {
  const { t, isCreole } = useLang();
  const [playing, setPlaying] = useState(false);
  const [review, setReview] = useState<{ round: number; items: ReviewItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rounds = tour.schedule.rounds;
  const open = tour.state === 'running' ? roundAt(rounds, now) : null;
  const inBracketRound = tour.format !== 'bracket' || (open && matches.some((m) => m.round === open.index && m.status === 'pending' && (m.a?.uid === me || m.b?.uid === me)));
  const roundName = (i: number) => (tour.format === 'window' ? t('Fenêtre', 'Fenèt') : tour.format === 'bracket' ? t(`Tour ${i + 1}`, `Tou ${i + 1}`) : t(`Manche ${i + 1}`, `Manch ${i + 1}`));

  if (playing) return <RoundPlayer tour={tour} now={now} offset={offset} onDone={() => setPlaying(false)} />;

  return (
    <div className="tn-split">
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div className="tn-card">
          <div className="tn-section__head">
            <h2>{t('Calendrier', 'Orè')}</h2>
            {tour.state === 'scheduled' && <span>{t('Ouverture dans', 'Ouvèti nan')} {formatCountdown(tour.startsAt - now)}</span>}
            {open && <span>{t('Clôture dans', 'Fèmen nan')} {formatCountdown(open.closesAt - now)}</span>}
          </div>
          <ul className="tn-timeline">
            {rounds.map((r) => {
              const cls = now >= r.closesAt ? 'is-past' : open?.index === r.index ? 'is-now' : '';
              return (
                <li key={r.index} className={cls}>
                  <span>{roundName(r.index)}</span>
                  <span>
                    {formatWhen(r.opensAt, isCreole)} → {formatWhen(r.closesAt, isCreole)}
                    {canPlay && now >= r.closesAt && (tour.format !== 'bracket' || matches.some((m) => m.round === r.index && (m.a?.uid === me || m.b?.uid === me) && m.status !== 'bye')) && (
                      <>
                        {' · '}
                        <button type="button" className="button button--ghost" style={{ minHeight: 0, padding: '0 .4rem' }} onClick={async () => {
                          setError(null);
                          const res = await reviewAnswers(tour.id, r.index);
                          if (res.ok) setReview({ round: r.index, items: res.data.items });
                          else setError(errorMessage(res.error === 'no_attempt' ? 'no_open_round' : res.error, isCreole));
                        }}>{t('Correction', 'Koreksyon')}</button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {canPlay && open && inBracketRound && (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="button button--primary" onClick={() => setPlaying(true)}>
                <Play size={16} aria-hidden="true" /> {t(`Jouer — ${roundName(open.index)}`, `Jwe — ${roundName(open.index)}`)}
              </button>
              <p className="tn-muted" style={{ marginTop: '0.5rem' }}>
                {t(`${tour.questionCount} questions, ${tour.secondsPerQuestion} s chacune. Une seule tentative : une question laissée ouverte compte comme sans réponse.`, `${tour.questionCount} kesyon, ${tour.secondsPerQuestion} s chak. Yon sèl chans : yon kesyon ou kite louvri konte kòm san repons.`)}
              </p>
            </div>
          )}
          {canPlay && open && !inBracketRound && (
            <p className="tn-muted" style={{ marginTop: '1rem' }}>{t('Tu ne joues pas ce tour (exempté ou éliminé). Suis le tableau !', 'Ou pa jwe tou sa a (egzante oswa elimine). Swiv tablo a !')}</p>
          )}
          {error && <p className="tn-error">{error}</p>}
        </div>

        {tour.format === 'bracket' && (
          <div className="tn-card">
            <div className="tn-section__head"><h2>{t('Tableau', 'Tablo')}</h2></div>
            <BracketView matches={matches} rounds={tour.bracketRounds || rounds.length} me={me} />
          </div>
        )}

        {tour.state === 'finished' && (
          <div className="tn-card">
            <div className="tn-section__head">
              <h2>{t('Podium', 'Podyòm')}</h2>
              {tour.winner && <span>🏆 {tour.winner.displayName}</span>}
            </div>
            <Podium rows={standings?.rows || []} />
          </div>
        )}

        {review && (
          <div>
            <div className="tn-section__head"><h2>{t('Correction', 'Koreksyon')} — {roundName(review.round)}</h2>
              <button type="button" className="button button--ghost" onClick={() => setReview(null)}><X size={15} aria-hidden="true" /></button>
            </div>
            <ReviewList items={review.items} />
          </div>
        )}
      </div>
      <StandingsCard tour={tour} standings={standings} me={me} />
    </div>
  );
}

// ── Join panel ─────────────────────────────────────────────────────────────

function JoinPanel({ tour, pin }: { tour: Tournament; pin?: string }) {
  const { t, isCreole } = useLang();
  const user = useStore((s) => s.user);
  const storedGrade = useStore((s) => s.grade);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const { profile } = useTrivia();
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState(storedGrade && storedGrade !== 'POSTBAC' ? storedGrade : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileSchool = profile?.leaderboard?.school || '';

  const open = tour.state === 'scheduled' || (tour.state === 'running' && tour.format !== 'bracket');
  if (!open) return null;

  if (!user?.uid) {
    return (
      <div className="tn-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t('Connecte-toi pour jouer. Tu peux regarder sans compte.', 'Konekte pou w jwe. Ou ka gade san kont.')}</span>
        <button type="button" className="button button--primary" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
      </div>
    );
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    const r = await joinTournament(pin ? { pin } : { tid: tour.id }, {
      displayName: profile?.leaderboard?.displayName || undefined,
      school: (school || profileSchool) || undefined,
      grade: grade || undefined,
    });
    setBusy(false);
    if (!r.ok) setError(errorMessage(r.error, isCreole));
  };

  return (
    <div className="tn-card" style={{ display: 'grid', gap: '0.75rem' }}>
      <div className="tn-section__head" style={{ marginBottom: 0 }}>
        <h2>{t('Rejoindre ce tournoi', 'Antre nan tounwa sa a')}</h2>
        <span>{tour.playerCount}/{tour.maxPlayers}</span>
      </div>
      {tour.teamRule === 'school' && !profileSchool && (
        <div className="tn-field" style={{ marginBottom: 0 }}>
          <label htmlFor="tn-school">{t('Ton école', 'Lekòl ou')}</label>
          <input id="tn-school" type="text" maxLength={80} value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
      )}
      {tour.teamRule === 'grade' && (
        <div className="tn-field" style={{ marginBottom: 0 }}>
          <label htmlFor="tn-grade">{t('Ta classe', 'Klas ou')}</label>
          <select id="tn-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">{t('Choisis ta classe…', 'Chwazi klas ou…')}</option>
            {GRADES.map((g) => <option key={g.code} value={g.code}>{isCreole ? g.labelHt : g.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <button type="button" className="button button--primary" disabled={busy} onClick={join}>
          {busy ? t('Inscription…', 'Ap enskri…') : t('Rejoindre', 'Antre')}
        </button>
        {tour.teamRule === 'school' && profileSchool && <span className="tn-muted"> · {t('pour', 'pou')} {profileSchool}</span>}
      </div>
      {error && <p className="tn-error" role="alert">{error}</p>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TournoisRoom() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, isCreole } = useLang();
  const user = useStore((s) => s.user);
  const me: string | null = user?.uid || null;

  const [tour, setTour] = useState<Tournament | null | undefined>(undefined);
  const [readError, setReadError] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [progress, setProgress] = useState<{ index: number; answered: number } | null>(null);
  const [standings, setStandings] = useState<Standings | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [offset, setOffset] = useState(0);
  const now = useServerNow(offset);

  useEffect(() => {
    if (!id) return undefined;
    setTour(undefined);
    return watchTournament(id, (tt, err) => { setTour(tt); setReadError(err || null); });
  }, [id, me]);

  // Subscriptions start once the tournament itself is readable (rules).
  const readable = !!tour;
  const format = tour?.format;
  useEffect(() => {
    if (!id || !readable) return undefined;
    const subs = [watchRoster(id, setRoster), watchStandings(id, setStandings)];
    if (format === 'live') subs.push(watchLive(id, setLive), watchProgress(id, setProgress));
    if (format === 'bracket') subs.push(watchMatches(id, setMatches));
    return () => subs.forEach((u) => u());
  }, [id, readable, format]);

  const deadlines = useMemo(() => {
    const ds = [tour?.nextDeadlineAt];
    if (live && live.phase !== 'done') ds.push(live.phase === 'lobby' ? live.opensAt : live.phase === 'question' ? live.closesAt : live.revealUntil);
    return ds.map((d) => (typeof d === 'number' ? d - offset : d));
  }, [tour?.nextDeadlineAt, live, offset]);
  useLazyTicker(tour && tour.state !== 'cancelled' && tour.state !== 'finished' ? id : undefined, deadlines, setOffset);

  if (tour === undefined && !readError) {
    return <section className="tn"><div className="tn__wrap"><p className="tn-muted">{t('Chargement…', 'Ap chaje…')}</p></div></section>;
  }
  if (!tour) {
    return (
      <section className="tn">
        <div className="tn__narrow tn-card" style={{ textAlign: 'center' }}>
          <h1 style={{ marginTop: 0 }}>{readError === 'private' ? t('Tournoi privé', 'Tounwa prive') : t('Tournoi introuvable', 'Nou pa jwenn tounwa a')}</h1>
          <p className="tn-muted">
            {readError === 'private'
              ? t('Seuls les joueurs entrés avec le PIN peuvent le voir.', 'Se sèlman jwè ki antre ak PIN nan ki ka wè l.')
              : t('Le lien est peut-être incomplet.', 'Petèt lyen an pa konplè.')}
          </p>
          <Link to="/tournois/rejoindre" className="button button--primary">{t('Entrer un PIN', 'Antre yon PIN')}</Link>
        </div>
      </section>
    );
  }

  return (
    <RoomView
      tour={tour} roster={roster} live={live} progress={progress} standings={standings} matches={matches}
      me={me} now={now} offset={offset} pinFromLink={params.get('pin') || undefined} justCreated={params.get('nouveau') === '1'}
    />
  );
}

/**
 * The room, from data alone — no listeners, no ticking. TournoisRoom wires it
 * to Firestore; a preview can hand it fixtures.
 */
export function RoomView({ tour, roster, live, progress, standings, matches, me, now, offset, pinFromLink, justCreated }: {
  tour: Tournament; roster: RosterEntry[]; live: LiveState | null; progress: { index: number; answered: number } | null;
  standings: Standings | null; matches: Match[]; me: string | null; now: number; offset: number;
  pinFromLink?: string; justCreated?: boolean;
}) {
  const { t, isCreole } = useLang();
  const [spectate, setSpectate] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const onRoster = !!me && roster.some((r) => r.uid === me);
  const canPlay = onRoster && !spectate;
  const isCreator = me === tour.creatorUid;
  const liveNow = tour.state === 'running';

  return (
    <section className="tn">
      <div className="tn__wrap" style={{ display: 'grid', gap: '1rem' }}>
        <Link to="/tournois" className="tn-muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('Tournois', 'Tounwa')}
        </Link>

        <header className="tn-hero">
          <div className="tn-hero__top">
            {liveNow && <span className="tn-chip tn-chip--live">{tour.format === 'live' ? t('EN DIRECT', 'AN DIRÈK') : t('EN COURS', 'AP JWE')}</span>}
            {tour.state === 'finished' && <span className="tn-chip">{t('Terminé', 'Fini')}</span>}
            {tour.state === 'cancelled' && <span className="tn-chip">{t('Annulé', 'Anile')}</span>}
            {!(liveNow && tour.format === 'live') && <span className="tn-chip">{formatLabel(tour.format, isCreole)}</span>}
            {tour.teamRule === 'school' && <span className="tn-chip">{t('École vs école', 'Lekòl vs lekòl')}</span>}
            {tour.teamRule === 'grade' && <span className="tn-chip">{t('Classe vs classe', 'Klas vs klas')}</span>}
            <span className="tn-chip">{tour.visibility === 'public' ? t('Public', 'Piblik') : tour.visibility === 'unlisted' ? t('Non listé', 'Pa nan lis') : t('Privé', 'Prive')}</span>
          </div>
          <h1>{tour.title}</h1>
          {tour.description && <p>{tour.description}</p>}
          <p>{t('Organisé par', 'Òganize pa')} {tour.creatorName} · {tour.playerCount} {t('joueurs', 'jwè')}</p>
          <div className="tn-hero__row">
            <div className="tn-pin">
              <div>
                <div className="tn-pin__label">{t('PIN de la salle', 'PIN sal la')}</div>
                <div className="tn-pin__value">{formatPin(tour.pin)}</div>
              </div>
              <CopyButton text={tour.pin} label={t('Copier', 'Kopye')} done={t('Copié', 'Kopye')} />
            </div>
            <div className="tn-hero__actions">
              <InviteButton t={tour} label={t('Inviter la classe', 'Envite klas la')} />
              <CopyButton text={shareUrl(tour)} label={t('Lien', 'Lyen')} done={t('Lien copié', 'Lyen kopye')} ghost />
              {onRoster && tour.format === 'live' && (
                <button type="button" role="switch" aria-checked={spectate} className="tn-switch" onClick={() => setSpectate((s) => !s)}>
                  <span className="tn-switch__track" aria-hidden="true" /> {t('Mode spectateur', 'Mòd espektatè')}
                </button>
              )}
            </div>
          </div>
        </header>

        {justCreated && isCreator && tour.state === 'scheduled' && (
          <div className="tn-card">
            <strong>{t('Ton tournoi est prêt.', 'Tounwa ou pare.')}</strong>{' '}
            <span className="tn-muted">{t(`Partage le PIN ${formatPin(tour.pin)} ou le lien. Les questions ont été tirées par le serveur — même toi, tu ne les vois pas avant de jouer.`, `Pataje PIN ${formatPin(tour.pin)} an oswa lyen an. Sèvè a tire kesyon yo — menm ou menm pa wè yo anvan w jwe.`)}</span>
          </div>
        )}

        {!onRoster && tour.state !== 'cancelled' && <JoinPanel tour={tour} pin={pinFromLink} />}

        {tour.state === 'cancelled' ? (
          <div className="tn-empty">{t('Ce tournoi a été annulé par son organisateur.', 'Òganizatè a anile tounwa sa a.')}</div>
        ) : tour.format === 'live' ? (
          <LiveStage tour={tour} live={live} progress={progress} standings={standings} roster={roster} me={me} canPlay={canPlay} now={now} />
        ) : (
          <RoundsStage tour={tour} standings={standings} matches={matches} me={me} canPlay={canPlay} now={now} offset={offset} />
        )}

        {isCreator && tour.state === 'scheduled' && (
          <div>
            {!confirmCancel ? (
              <button type="button" className="button button--ghost" onClick={() => setConfirmCancel(true)}>
                <X size={15} aria-hidden="true" /> {t('Annuler le tournoi', 'Anile tounwa a')}
              </button>
            ) : (
              <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="tn-muted">{t('Annuler pour tout le monde ?', 'Anile pou tout moun ?')}</span>
                <button type="button" className="button button--primary" onClick={async () => {
                  setCancelError(null);
                  const r = await cancelTournament(tour.id);
                  if (!r.ok) setCancelError(errorMessage(r.error, isCreole));
                  setConfirmCancel(false);
                }}>{t('Oui, annuler', 'Wi, anile')}</button>
                <button type="button" className="button button--ghost" onClick={() => setConfirmCancel(false)}>{t('Non', 'Non')}</button>
              </span>
            )}
            {cancelError && <p className="tn-error">{cancelError}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
