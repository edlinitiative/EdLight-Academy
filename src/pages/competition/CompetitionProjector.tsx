/** Audience-only composition: never renders account, host, check-in or attendee controls. */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { CompetitionProjectorView } from './CompetitionProjectorView';
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
    [teamRule, setTeamRule] = useState<string | null>(null),
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
        else if (row) {
          setPhase(row.state);
          setTeamRule(row.teamRule ?? null);
        }
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
  if (eventUid !== uid)
    return (
      <main className="competition-projector">
        <p>{ht ? 'Ap chaje kont lan…' : 'Chargement du compte…'}</p>
      </main>
    );
  return (
    <CompetitionProjectorView
      eventId={id}
      event={event}
      live={live}
      board={board}
      phase={phase}
      teamRule={teamRule}
      error={error}
      now={now}
      ht={ht}
      onRetry={() => setEpoch(epoch + 1)}
    />
  );
}
