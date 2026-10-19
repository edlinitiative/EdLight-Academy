/** Audience-only presentation: never renders account, host, check-in or attendee controls. */
import React from 'react';
import { Link } from 'react-router-dom';
import type { LiveState, Standings } from '../../../shared/tournois/models';
import { POINTS } from '../../../shared/competition/labels';
import { identityText } from '../../../shared/competition/deletedAccount';
import Avatar from '../../arena-art/avatars/Avatar';
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
}

interface BoardLine {
  key: string;
  rank: number;
  name: string;
  points: number;
  face?: { seed: string; avatar?: string | null };
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
}: CompetitionProjectorViewProps) {
  const question = live?.question;
  const pts = POINTS[ht ? 1 : 0];
  const lang = ht ? 1 : 0;
  // Stored names may carry the bilingual deleted-account sentinel: show one language.
  const lines: BoardLine[] = board?.namedTeams?.length
    ? board.namedTeams.slice(0, 10).map((r) => ({
        key: r.id,
        rank: r.rank,
        name: identityText(r.label, lang),
        points: r.points,
      }))
    : board?.teams.length
      ? board.teams.slice(0, 10).map((r) => ({
          key: r.key,
          rank: r.rank,
          name: identityText(r.label, lang),
          points: r.score,
        }))
      : (board?.rows || []).slice(0, 10).map((r) => ({
          key: r.uid,
          rank: r.rank,
          name: identityText(r.displayName, lang),
          points: r.points,
          face: { seed: r.uid, avatar: r.avatar },
        }));
  const status =
    phase === 'finished'
      ? ht
        ? 'Rezilta final tounwa a'
        : 'Résultat final du tournoi'
      : phase === 'cancelled'
        ? ht
          ? 'Evènman an anile'
          : 'Événement annulé'
        : live?.phase === 'question'
          ? ht
            ? 'Kesyon an kou'
            : 'Question en cours'
          : live?.phase === 'reveal'
            ? ht
              ? 'Repons lan'
              : 'Révélation'
            : ht
              ? 'Ap tann pwochen etap la'
              : 'En attente de la prochaine phase';
  const seconds = Math.max(
    0,
    Math.ceil(((live?.closesAt ?? now) - now) / 1000),
  );
  return (
    <main className="competition-projector">
      <header className="cp-head">
        <p className="cp-eyebrow">
          EdLight · {ht ? 'Ekran piblik' : 'Écran public'}
        </p>
        <h1>{event?.title || (ht ? 'Konpetisyon' : 'Compétition')}</h1>
        <p
          role="status"
          className={`cp-phase${live?.phase === 'question' ? ' is-live' : ''}`}
        >
          {status}
        </p>
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
          className="cp-card"
          aria-label={ht ? 'Kesyon aktyèl' : 'Question actuelle'}
        >
          {question ? (
            <>
              <p className="cp-count">
                <span>
                  {ht ? 'Kesyon' : 'Question'} {(live?.index ?? 0) + 1}/
                  {live?.questionCount}
                </span>
                {live?.phase === 'question' ? (
                  <span className="cp-timer">{seconds} s</span>
                ) : null}
              </p>
              <h2>{ht ? question.qHt || question.q : question.q}</h2>
              <ol className="cp-options">
                {(ht && question.optionsHt
                  ? question.optionsHt
                  : question.options
                ).map((option, i) => {
                  const correct =
                    live?.phase === 'reveal' && live.reveal?.answer === i;
                  return (
                    <li key={i} className={correct ? 'is-correct' : ''}>
                      <span className="cp-letter" aria-hidden="true">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="cp-option">{option}</span>
                      {correct ? (
                        <span className="cp-sr">
                          {ht ? ' — bon repons' : ' — bonne réponse'}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="cp-wait">
              {event?.delivery === 'external'
                ? ht
                  ? 'Aktivite sa a fèt deyò kiz aplikasyon an.'
                  : 'Cette activité se déroule en dehors du quiz de l’application.'
                : ht
                  ? 'Kesyon an ap parèt isit lè li louvri.'
                  : 'La question apparaîtra ici à son ouverture.'}
            </p>
          )}
        </section>
        <aside className="cp-card cp-board">
          <h2>
            {board?.final
              ? ht
                ? 'Rezilta'
                : 'Résultats'
              : ht
                ? 'Klasman an kou'
                : 'Classement en cours'}
          </h2>
          {lines.length ? (
            <ol className="cp-rows">
              {lines.map((r) => (
                <li key={r.key} className={r.rank <= 3 ? `is-top is-${r.rank}` : ''}>
                  <span className="cp-rank">{r.rank}</span>
                  {r.face ? (
                    <span aria-hidden="true" className="competition-projector__face">
                      <Avatar seed={r.face.seed} config={r.face.avatar} size={44} still />
                    </span>
                  ) : null}
                  <span className="cp-name">{r.name}</span>
                  <span className="cp-points">
                    {r.points} <small>{pts}</small>
                  </span>
                </li>
              ))}
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
      </footer>
    </main>
  );
}
