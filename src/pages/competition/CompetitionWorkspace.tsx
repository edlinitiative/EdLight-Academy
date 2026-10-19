import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import useStore from '../../contexts/store';
import ArenaPageHead from '../../components/arena/ArenaPageHead';
import { competitionRequest } from '../../services/competitionService';
import {
  operationId,
  workspaceError,
  WorkspaceError,
} from '../../../shared/competition/client';
import {
  copyFor,
  taskPayload,
  workspacePage,
  type Task,
  type WorkspaceTarget,
} from '../../../shared/competition/workspace';
import './CompetitionWorkspace.css';

function localDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
export function TaskForm({
  task,
  ht,
  uid,
  execute,
}: {
  task: Task;
  ht: boolean;
  uid?: string;
  execute: (
    task: Task,
    input: Record<string, string>,
    op: string,
  ) => Promise<void>;
}) {
  const key = `competition-draft:${uid || 'guest'}:${task.action}:${JSON.stringify(task.values || {})}`;
  const [saved] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  });
  const [input, setInput] = useState<Record<string, string>>(
    () =>
      saved?.input ||
      Object.fromEntries(
        (task.fields || []).map((f) => [
          f.key,
          f.type === 'date' ? localDate(f.value || '') : f.value || '',
        ]),
      ),
  );
  const op = useRef<string>(saved?.operationId || operationId()),
    locked = useRef(false);
  const pendingTask = useRef<Task | null>(saved?.pendingTask || null);
  const [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          input,
          operationId: op.current,
          pendingTask: pendingTask.current,
        }),
      );
    } catch {
      /* unavailable storage does not prevent participation */
    }
  }, [key, input]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    if (task.confirm && !confirmed) {
      setConfirmed(true);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      pendingTask.current ??= task;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            input,
            operationId: op.current,
            pendingTask: pendingTask.current,
          }),
        );
      } catch {
        /* storage is optional */
      }
      await execute(pendingTask.current, input, op.current);
      pendingTask.current = null;
      op.current = operationId();
      sessionStorage.removeItem(key);
      setConfirmed(false);
    } catch (e) {
      if (
        e instanceof WorkspaceError &&
        !['network', 'receipt_unknown'].includes(e.code)
      ) {
        pendingTask.current = null;
        op.current = operationId();
      }
      setError(
        workspaceError(
          e instanceof WorkspaceError
            ? e.code
            : e instanceof Error
              ? e.message
              : 'network',
          ht,
        ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <details className="cw-task">
      <summary>{copyFor(task.label, ht)}</summary>
      <form onSubmit={submit} aria-label={copyFor(task.label, ht)}>
        <h3>{copyFor(task.label, ht)}</h3>
        {task.fields?.map((f) => (
          <label key={f.key} htmlFor={`${task.id}-${f.key}`}>
            {copyFor(f.label, ht)}
            {f.required ? ' *' : ''}
            {f.type === 'select' ? (
              <select
                id={`${task.id}-${f.key}`}
                required={f.required}
                value={input[f.key] || ''}
                onChange={(e) => {
                  op.current = operationId();
                  pendingTask.current = null;
                  setConfirmed(false);
                  setInput({ ...input, [f.key]: e.target.value });
                }}
              >
                <option value="">{ht ? 'Chwazi…' : 'Choisir…'}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {copyFor(o.label, ht)}
                  </option>
                ))}
              </select>
            ) : f.type === 'long' ? (
              <textarea
                id={`${task.id}-${f.key}`}
                required={f.required}
                value={input[f.key] || ''}
                onChange={(e) => {
                  op.current = operationId();
                  pendingTask.current = null;
                  setConfirmed(false);
                  setInput({ ...input, [f.key]: e.target.value });
                }}
                maxLength={2000}
              />
            ) : (
              <input
                id={`${task.id}-${f.key}`}
                required={f.required}
                type={
                  f.type === 'date'
                    ? 'datetime-local'
                    : f.type === 'number'
                      ? 'number'
                      : 'text'
                }
                value={input[f.key] || ''}
                onChange={(e) => {
                  op.current = operationId();
                  pendingTask.current = null;
                  setConfirmed(false);
                  setInput({ ...input, [f.key]: e.target.value });
                }}
                maxLength={1000}
              />
            )}
          </label>
        ))}
        {confirmed && task.confirm ? (
          <p role="status">{copyFor(task.confirm, ht)}</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <button
          type="submit"
          className="cw-primary"
          disabled={busy}
          aria-busy={busy}
        >
          {busy
            ? ht
              ? 'Ap tann konfimasyon…'
              : 'Confirmation en cours…'
            : confirmed
              ? ht
                ? 'Konfime'
                : 'Confirmer'
              : copyFor(task.label, ht)}
        </button>
      </form>
    </details>
  );
}
export default function CompetitionWorkspace({
  kind = 'home',
}: {
  kind?: WorkspaceTarget['kind'];
}) {
  const { id = '' } = useParams(),
    location = useLocation(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const uid = useStore((s) => s.user?.uid),
    ht = useStore((s) => s.language) === 'ht';
  const [data, setData] = useState<any>(null),
    [mine, setMine] = useState<any>(null),
    [error, setError] = useState(''),
    [mineError, setMineError] = useState(''),
    [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const serial = useRef(0);
  const [dataUid, setDataUid] = useState<string | undefined>(uid);
  const visibleData = dataUid === uid ? data : null;
  const visibleMine = mine?.uid === uid ? mine : null;
  const target: WorkspaceTarget = kind === 'home' ? { kind } : { kind, id };
  const refresh = useCallback(async () => {
    const n = ++serial.current;
    setError('');
    const [main, personal] = await Promise.allSettled([
      competitionRequest(
        kind === 'home' ? 'directory' : kind,
        kind === 'home'
          ? {
              schoolKey: params.get('school') || undefined,
              department: params.get('department') || undefined,
            }
          : { [`${kind}Id`]: id },
      ),
      uid ? competitionRequest('mine') : Promise.resolve(null),
    ]);
    if (n !== serial.current) return;
    if (main.status === 'fulfilled') {
      setDataUid(uid);
      setData(main.value);
    } else setError(workspaceError(main.reason?.code || 'network', ht));
    if (personal.status === 'fulfilled') {
      setMine(personal.value);
      setMineError('');
    } else setMineError(workspaceError(personal.reason?.code || 'network', ht));
    setLoading(false);
  }, [kind, id, uid, params, ht]);
  useEffect(() => {
    setData(null);
    setMine(null);
    setLoading(true);
    setNotice('');
    void refresh();
    return () => {
      serial.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const listener = () => {
      void refresh();
    };
    window.addEventListener('online', listener);
    window.addEventListener('focus', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('focus', listener);
    };
  }, [refresh]);
  const execute = async (
    task: Task,
    input: Record<string, string>,
    op: string,
  ) => {
    if (!uid || useStore.getState().user?.uid !== uid) {
      useStore.getState().toggleAuthModal();
      throw new WorkspaceError('unauthorized');
    }
    const out = await competitionRequest(task.action, {
      ...taskPayload(task, input, Date.now()),
      operationId: op,
    });
    if (useStore.getState().user?.uid !== uid)
      throw new WorkspaceError('unauthorized');
    setNotice(ht ? 'Aksyon an konfime.' : 'Action confirmée.');
    if (out.eventId && kind === 'home')
      navigate(`/arena/evenements/${out.eventId}`);
    else if (out.teamId && task.action === 'team-create')
      navigate(`/arena/equipes/${out.teamId}`);
    else if (out.leagueId && task.action === 'league-create')
      navigate(`/arena/ligues/${out.leagueId}`);
    else await refresh();
  };
  const page = visibleData
    ? workspacePage(target, visibleData, visibleMine, Date.now())
    : null;
  return (
    <div className="cw">
      <ArenaPageHead
        title={
          page ? copyFor(page.title, ht) : ht ? 'Konpetisyon' : 'Compétitions'
        }
        back="/arena"
      />
      <nav
        className="cw-links"
        aria-label={ht ? 'Konpetisyon' : 'Compétitions'}
      >
        <Link to="/arena/competitions">
          {ht ? 'Aktivite ak dekouvèt' : 'Activité et découverte'}
        </Link>
        <Link to="/tournois">
          {ht ? 'Tounwa ant zanmi' : 'Tournois entre amis'}
        </Link>
        <Link to="/jeux">{ht ? 'Jwe yon pati' : 'Jouer une partie'}</Link>
        <Link to="/arena/championnat">
          {ht ? 'Chanpyona ofisyèl' : 'Championnat officiel'}
        </Link>
      </nav>
      {!uid ? (
        <button
          className="cw-primary"
          onClick={() => useStore.getState().toggleAuthModal()}
        >
          {ht ? 'Konekte pou patisipe' : 'Se connecter pour participer'}
        </button>
      ) : null}
      {kind === 'home' ? (
        <form
          className="cw-filter"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const next = new URLSearchParams();
            for (const key of ['school', 'department'])
              if (form.get(key)) next.set(key, String(form.get(key)));
            setParams(next);
          }}
        >
          <label>
            {ht ? 'Kòd lekòl' : 'Code école'}
            <input name="school" defaultValue={params.get('school') || ''} />
          </label>
          <label>
            {ht ? 'Depatman' : 'Département'}
            <input
              name="department"
              defaultValue={params.get('department') || ''}
            />
          </label>
          <button type="submit">{ht ? 'Aplike' : 'Parcourir'}</button>
        </form>
      ) : null}
      {loading ? <p role="status">{ht ? 'Ap chaje…' : 'Chargement…'}</p> : null}
      {error || mineError || data?.errors?.length ? (
        <div role="alert">
          <p>
            {error ||
              mineError ||
              (ht
                ? 'Gen yon seksyon ki pa disponib.'
                : 'Une section est indisponible.')}
          </p>
          <button
            onClick={() => {
              void refresh();
            }}
          >
            {ht ? 'Eseye ankò' : 'Réessayer'}
          </button>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {page?.panels.map((panel, index) => (
        <section className="cw-panel" key={`${location.pathname}-${index}`}>
          <h2>{copyFor(panel.title, ht)}</h2>
          {panel.paragraphs?.map((p, i) => <p key={i}>{copyFor(p, ht)}</p>)}
          {panel.rows?.length ? (
            <ul>
              {panel.rows.map((r, i) => (
                <li key={i}>{copyFor(r, ht)}</li>
              ))}
            </ul>
          ) : null}
          {panel.links?.length ? (
            <div className="cw-links">
              {panel.links.map((link, i) =>
                /^https:\/\//.test(link.path) ? (
                  <a
                    key={i}
                    href={link.path}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copyFor(link.label, ht)} ↗
                  </a>
                ) : (
                  <Link key={i} to={link.path}>
                    {copyFor(link.label, ht)}
                  </Link>
                ),
              )}
            </div>
          ) : null}
          {panel.tasks?.map((task) => (
            <TaskForm
              key={`${uid}:${task.id}`}
              task={task}
              ht={ht}
              uid={uid}
              execute={execute}
            />
          ))}
        </section>
      ))}
      {data?.cursor ? (
        <button
          onClick={async () => {
            try {
              const next = await competitionRequest('directory', {
                cursor: data.cursor,
                schoolKey: params.get('school') || undefined,
                department: params.get('department') || undefined,
              });
              setData({ ...next, events: [...data.events, ...next.events] });
            } catch {
              setError(workspaceError('network', ht));
            }
          }}
        >
          {ht ? 'Plis evènman' : 'Plus d’événements'}
        </button>
      ) : null}
    </div>
  );
}
