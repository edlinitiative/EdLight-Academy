/** Audience-only presentation: never renders account, host, check-in or attendee controls. */
import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { LiveState, Standings } from '../../../shared/tournois/models';
import { POINTS } from '../../../shared/competition/labels';
import {
  boardLines,
  phaseCue,
  presentationPhase,
  secondsLeft,
  type BoardLine,
  type PresentationPhase,
} from '../../../shared/competition/presentation';
import Avatar from '../../arena-art/avatars/Avatar';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import SoundToggle from '../../arena-art/sound/SoundToggle';
import { playCompetitionCue } from '../../arena-art/sound/competitionCues';
import { useReducedMotion } from '../../arena-art/motion/tokens';
import { useFlipList } from '../../arena-art/motion/useFlipList';
import { useBoardMoves } from '../../arena-art/motion/useBoardMoves';
import '../../arena-art/motion/competition.css';
import './CompetitionProjector.css';

export interface CompetitionProjectorViewProps {
  eventId: string;
  event: { title?: string; delivery?: string } | null;
  live: LiveState | null;
  board: Standings | null;
  phase: string;
  error: string;
  now: number;
  ht: boolean;
  onRetry: () => void;
  /** 'school' turns squad labels into schools (crests). */
  teamRule?: string | null;
  /** Rendered inside the app layout (the studio): no second <main>. */
  embedded?: boolean;
}

/** Rows the rail shows: enough to read from the back of a room, never a scroll. */
export const PROJECTOR_BOARD_ROWS = 8;

function phaseText(p: PresentationPhase, ht: boolean): string {
  switch (p) {
    case 'results': return ht ? 'Rezilta final tounwa a' : 'Résultat final du tournoi';
    case 'cancelled': return ht ? 'Evènman an anile' : 'Événement annulé';
    case 'question': return ht ? 'Kesyon an kou' : 'Question en cours';
    case 'reveal': return ht ? 'Repons lan' : 'Révélation';
    case 'lobby': return ht ? 'Ap tann kòmansman an' : 'Avant le coup d’envoi';
    default: return ht ? 'Ap tann pwochen etap la' : 'En attente de la prochaine phase';
  }
}

function Face({ line, size }: { line: BoardLine; size: number }) {
  if (line.face) {
    return (
      <span aria-hidden="true" className="competition-projector__face">
        <Avatar seed={line.face.seed} config={line.face.avatar} size={size} still />
      </span>
    );
  }
  if (line.school) {
    return (
      <span aria-hidden="true" className="competition-projector__face">
        <SchoolCrest name={line.school} size={size} />
      </span>
    );
  }
  return null;
}

/** The projector as pure presentation (the studio renders it from fixtures). */
export function CompetitionProjectorView({
  eventId,
  event,
  live,
  board,
  phase,
  error,
  now,
  ht,
  onRetry,
  teamRule,
  embedded = false,
}: CompetitionProjectorViewProps) {
  const reduced = useReducedMotion();
  const pts = POINTS[ht ? 1 : 0];
  const lang = ht ? 1 : 0;
  const stage = presentationPhase(phase || null, live);
  const question = stage === 'question' || stage === 'reveal' ? live?.question ?? null : null;
  const lines = boardLines(board, lang, PROJECTOR_BOARD_ROWS, teamRule);
  const keys = lines.map((l) => l.key);
  const moves = useBoardMoves(keys);
  // Answer first, then points, then the rows travel (brief, sequential reveal).
  const flip = useFlipList(keys, { reduced, delay: stage === 'reveal' ? 600 : 0 });
  const seconds = secondsLeft(live, now);
  const low = seconds != null && seconds <= 5;
  const share = live && stage === 'question' && live.questionMs > 0
    ? Math.max(0, Math.min(1, (live.closesAt - now) / live.questionMs))
    : 0;

  // Room cues: a question opening, the podium. Silent unless "Sons" is on.
  const lastPhase = useRef<PresentationPhase | null>(null);
  useEffect(() => {
    playCompetitionCue(phaseCue(lastPhase.current, stage));
    lastPhase.current = stage;
  }, [stage]);

  const reveal = stage === 'reveal' ? live?.reveal ?? null : null;
  const options = question ? (ht && question.optionsHt ? question.optionsHt : question.options) : [];
  const podium = stage === 'results' ? lines.slice(0, 3) : [];
  const Root = embedded ? 'div' : 'main';

  return (
    <Root className="competition-projector" data-phase={stage}>
      <header className="cp-head">
        <div className="cp-head__id">
          <p className="cp-eyebrow">
            EdLight · {ht ? 'Ekran piblik' : 'Écran public'}
          </p>
          <h1>{event?.title || (ht ? 'Konpetisyon' : 'Compétition')}</h1>
        </div>
        <div className="cp-head__now">
          <p
            key={stage}
            role="status"
            className={`cp-phase mo-phase${stage === 'question' ? ' is-live' : ''}${stage === 'results' ? ' is-final' : ''}`}
          >
            {phaseText(stage, ht)}
          </p>
          {question && live ? (
            <p className="cp-count">
              {ht ? 'Kesyon' : 'Question'} <strong>{(live.index ?? 0) + 1}</strong>/{live.questionCount}
            </p>
          ) : null}
          {seconds != null ? (
            // Not a live region: a ticking clock must not talk over the room.
            <p className={`cp-timer${low ? ' is-low' : ''}`} aria-label={ht ? `${seconds} segonn ki rete` : `${seconds} secondes restantes`}>
              <span className="cp-timer__num">{seconds}</span>
              <span className="cp-timer__unit" aria-hidden="true">s</span>
            </p>
          ) : null}
        </div>
        {seconds != null ? (
          <div className={`cp-bar${low ? ' is-low' : ''}`} aria-hidden="true">
            <span style={{ transform: `scaleX(${share})` }} />
          </div>
        ) : null}
      </header>

      {error ? (
        <div role="alert" className="cp-alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            {ht ? 'Eseye ankò' : 'Réessayer'}
          </button>
        </div>
      ) : null}

      <div className="competition-projector__stage">
        <section
          className="cp-card cp-main"
          aria-label={stage === 'results' ? (ht ? 'Podyòm' : 'Podium') : ht ? 'Kesyon aktyèl' : 'Question actuelle'}
        >
          {question ? (
            <div key={`q${live?.index}`} className="cp-q mo-enter">
              <h2>{ht ? question.qHt || question.q : question.q}</h2>
              <ol className={`cp-options${options.length > 2 ? ' is-grid' : ''}`}>
                {options.map((option, i) => {
                  const correct = !!reveal && reveal.answer === i;
                  const count = reveal?.counts?.[i];
                  return (
                    <li key={i} className={correct ? 'is-correct mo-right' : reveal ? 'is-dim' : ''}>
                      <span className="cp-letter" aria-hidden="true">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="cp-option">{option}</span>
                      {correct ? (
                        <span className="cp-verdict">
                          <span aria-hidden="true">✓</span> {ht ? 'Bon repons' : 'Bonne réponse'}
                        </span>
                      ) : null}
                      {count != null ? (
                        <span className="cp-votes">
                          {count} <small>{ht ? 'repons' : count > 1 ? 'réponses' : 'réponse'}</small>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {reveal ? (
                <p className="cp-tally">
                  {ht
                    ? `${reveal.correct ?? 0} bon repons sou ${reveal.answered}`
                    : `${reveal.correct ?? 0} bonnes réponses sur ${reveal.answered}`}
                </p>
              ) : null}
            </div>
          ) : podium.length ? (
            <div className="cp-podium mo-podium" role="list">
              {[podium[1], podium[0], podium[2]].map((line, i) => {
                const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                return (
                  <div key={place} role="listitem" className={`cp-step cp-step--${place}`}>
                    {line ? (
                      <>
                        <Face line={line} size={place === 1 ? 96 : 72} />
                        <span className="cp-step__name">{line.name}</span>
                        {line.school && line.kind === 'player' ? <span className="cp-step__school">{line.school}</span> : null}
                        <span className="cp-step__pts">{line.points} <small>{pts}</small></span>
                      </>
                    ) : <span className="cp-step__name" aria-hidden="true">—</span>}
                    <span className="cp-step__block">
                      <span className="cp-sr">{ht ? 'Plas' : 'Place'} </span>{place}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p key={stage} className="cp-wait mo-enter">
              {stage === 'results'
                ? ht ? 'Rezilta yo ap parèt isit la.' : 'Les résultats apparaîtront ici.'
                : event?.delivery === 'external'
                  ? ht
                    ? 'Aktivite sa a fèt deyò kiz aplikasyon an.'
                    : 'Cette activité se déroule en dehors du quiz de l’application.'
                  : ht
                    ? 'Kesyon an ap parèt isit lè li louvri.'
                    : 'La question apparaîtra ici à son ouverture.'}
            </p>
          )}
        </section>

        <aside className="cp-card cp-board" aria-label={ht ? 'Klasman' : 'Classement'}>
          <h2>
            {board?.final
              ? ht ? 'Rezilta' : 'Résultats'
              : ht ? 'Klasman an kou' : 'Classement en cours'}
            {board ? (
              <small className="cp-board__total">
                {board.total} {lines[0]?.kind === 'player' ? (ht ? 'jwè' : 'joueurs') : ht ? 'ekip' : 'équipes'}
              </small>
            ) : null}
          </h2>
          {lines.length ? (
            <ol className="cp-rows">
              {lines.map((r) => {
                const move = moves[r.key];
                return (
                  <li key={r.key} ref={flip(r.key)} className={r.rank <= 3 ? `is-top is-${r.rank}` : ''}>
                    <span className="cp-rank">{r.rank}</span>
                    <Face line={r} size={40} />
                    <span className="cp-who">
                      <span className="cp-name">{r.name}</span>
                      {r.school && r.kind === 'player' ? <span className="cp-school">{r.school}</span> : null}
                    </span>
                    {move && move.delta !== 0 ? (
                      <span key={`${r.key}${move.delta}`} className={`cp-delta mo-delta ${move.delta > 0 ? 'is-up' : 'is-down'}`}>
                        <span aria-hidden="true">{move.delta > 0 ? '▲' : '▼'} {Math.abs(move.delta)}</span>
                        <span className="cp-sr">
                          {move.delta > 0
                            ? ht ? `monte ${move.delta} plas` : `gagne ${move.delta} place${move.delta > 1 ? 's' : ''}`
                            : ht ? `desann ${-move.delta} plas` : `perd ${-move.delta} place${move.delta < -1 ? 's' : ''}`}
                        </span>
                      </span>
                    ) : null}
                    <span className="cp-points">
                      {r.points} <small>{pts}</small>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="cp-wait">
              {ht
                ? 'Klasman an ap parèt isit lè premye pwen yo rive.'
                : 'Le classement apparaîtra ici dès les premiers points.'}
            </p>
          )}
        </aside>
      </div>

      <footer className="cp-foot">
        <Link to={`/arena/evenements/${eventId}`}>
          {ht
            ? 'Retounen nan paj evènman an'
            : 'Retour à la page de l’événement'}
        </Link>
        <SoundToggle compact className="cp-sound" />
      </footer>
    </Root>
  );
}
