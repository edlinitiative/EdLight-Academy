/** Audience-only composition: never renders account, host, check-in or attendee controls. */
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useStore from '../../contexts/store';
import { competitionRequest } from '../../services/competitionService';
import {
  watchLive,
  watchStandings,
  watchTournament,
  tick,
  type LiveState,
  type Standings,
} from '../../services/tournoisService';
import { workspaceError } from '../../../shared/competition/client';
import './CompetitionProjector.css';
export default function CompetitionProjector() {
  const { id = '' } = useParams();
  const uid = useStore((s) => s.user?.uid),
    ht = useStore((s) => s.language) === 'ht';
  const [eventUid, setEventUid] = useState(uid);
  const [event, setEvent] = useState<any>(null),
    [live, setLive] = useState<LiveState | null>(null),
    [board, setBoard] = useState<Standings | null>(null),
    [phase, setPhase] = useState(''),
    [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0),
    [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    let alive = true;
    setEvent(null);
    setLive(null);
    setBoard(null);
    competitionRequest('event', { eventId: id })
      .then((data) => {
        if (alive) {
          setEventUid(uid);
          setEvent(data.event);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(workspaceError(e.code || 'network', ht));
      });
    return () => {
      alive = false;
    };
  }, [id, uid, ht, epoch]);
  const tid = event?.tournamentId;
  useEffect(() => {
    if (!tid) return;
    let alive = true;
    const sync = () => {
      void tick(tid).then((serverNow) => {
        if (alive && serverNow !== null) setOffset(serverNow - Date.now());
      });
    };
    const subscriptions = [
      watchLive(tid, setLive),
      watchStandings(tid, setBoard),
      watchTournament(tid, (row, err) => {
        if (err) setError(workspaceError('network', ht));
        else if (row) setPhase(row.state);
      }),
    ];
    sync();
    const timer = setInterval(sync, 3000);
    return () => {
      alive = false;
      subscriptions.forEach((s) => s());
      clearInterval(timer);
    };
  }, [tid, ht]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(timer);
  }, [offset]);
  const question = live?.question;
  if (eventUid !== uid)
    return (
      <main className="competition-projector">
        <p>{ht ? 'Ap chaje kont lan…' : 'Chargement du compte…'}</p>
      </main>
    );
  return (
    <main className="competition-projector">
      <header>
        <p>EdLight · {ht ? 'Ekran piblik' : 'Écran public'}</p>
        <h1>{event?.title || (ht ? 'Konpetisyon' : 'Compétition')}</h1>
        <p role="status">
          {phase === 'finished'
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
                    : 'En attente de la prochaine phase'}
        </p>
      </header>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button onClick={() => setEpoch(epoch + 1)}>
            {ht ? 'Eseye ankò' : 'Réessayer'}
          </button>
        </p>
      ) : null}
      <div className="competition-projector__stage">
        <section aria-label={ht ? 'Kesyon aktyèl' : 'Question actuelle'}>
          {question ? (
            <>
              <p>
                {(live?.index ?? 0) + 1}/{live?.questionCount} ·{' '}
                {Math.max(0, Math.ceil(((live?.closesAt ?? now) - now) / 1000))}{' '}
                s
              </p>
              <h2>{ht ? question.qHt || question.q : question.q}</h2>
              <ol>
                {(ht && question.optionsHt
                  ? question.optionsHt
                  : question.options
                ).map((option, i) => (
                  <li
                    key={i}
                    className={
                      live?.phase === 'reveal' && live.reveal?.answer === i
                        ? 'is-correct'
                        : ''
                    }
                  >
                    {option}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
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
        <aside>
          <h2>
            {board?.final
              ? ht
                ? 'Rezilta'
                : 'Résultats'
              : ht
                ? 'Klasman an kou'
                : 'Classement en cours'}
          </h2>
          {board?.namedTeams?.length
            ? board.namedTeams.slice(0, 10).map((r) => (
                <p key={r.id}>
                  {r.rank}. {r.label} · {r.points} pts
                </p>
              ))
            : board?.teams.length
              ? board.teams.slice(0, 10).map((r) => (
                  <p key={r.key}>
                    {r.rank}. {r.label} · {r.score} pts
                  </p>
                ))
              : board?.rows.slice(0, 10).map((r) => (
                  <p key={r.uid}>
                    {r.rank}. {r.displayName} · {r.points} pts
                  </p>
                ))}
        </aside>
      </div>
      <footer>
        <Link to={`/arena/evenements/${id}`}>
          {ht
            ? 'Retounen nan paj evènman an'
            : 'Retour à la page de l’événement'}
        </Link>
      </footer>
    </main>
  );
}
