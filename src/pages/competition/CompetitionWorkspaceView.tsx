/**
 * The competition workspace as pure presentation: the page composed by
 * shared/competition/workspace.ts plus the request state, as props. The
 * route component (CompetitionWorkspace) owns fetching and mutations; the
 * Arène studio feeds this the same builder output from fixtures.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronRight } from '../../components/icons';
import ArenaPageHead from '../../components/arena/ArenaPageHead';
import {
  operationId,
  workspaceError,
  WorkspaceError,
} from '../../../shared/competition/client';
import {
  copyFor,
  rowCopy,
  rowPerson,
  type Destination,
  type Panel,
  type Person,
  type Task,
  type WorkspacePage,
  type WorkspaceTarget,
} from '../../../shared/competition/workspace';
import Avatar from '../../arena-art/avatars/Avatar';
import './CompetitionWorkspace.css';

/** A person's face (chosen avatar, else seeded) — decorative next to their name. */
function PersonFace({ person, size = 36 }: { person: Person; size?: number }) {
  return (
    <span className="cw-face" aria-hidden="true">
      <Avatar seed={person.uid} config={person.avatar} size={size} still />
    </span>
  );
}

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
      <summary>
        {task.person ? <PersonFace person={task.person} size={32} /> : null}
        {copyFor(task.label, ht)}
        <ChevronDown size={18} className="cw-task__chev" aria-hidden="true" />
      </summary>
      <form onSubmit={submit} aria-label={copyFor(task.label, ht)}>
        {task.fields?.map((f) => (
          <label key={f.key} htmlFor={`${task.id}-${f.key}`}>
            <span className="cw-field__label">
              {copyFor(f.label, ht)}
              {f.required ? (
                <span className="cw-field__req" aria-hidden="true">
                  {' '}
                  *
                </span>
              ) : null}
            </span>
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
          <p role="status" className="cw-note cw-note--warn">
            {copyFor(task.confirm, ht)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="cw-note cw-note--error">
            {error}
          </p>
        ) : null}
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
/** The builder marks an unread inbox row with a leading "● "; drawn as a dot. */
const UNREAD = '● ';

/** One destination as a full-width row: label, then a chevron (↗ when external). */
function DestinationRow({ link, ht }: { link: Destination; ht: boolean }) {
  const text = copyFor(link.label, ht);
  const unread = text.startsWith(UNREAD);
  const label = unread ? text.slice(UNREAD.length) : text;
  const external = /^https:\/\//.test(link.path);
  const body = (
    <>
      {unread ? (
        <span className="cw-dot">
          <span className="cw-sr">{ht ? 'Pa li' : 'Non lu'}</span>
        </span>
      ) : null}
      <span className="cw-link__text">{label}</span>
      {external ? (
        <ArrowRight size={18} className="cw-link__chev cw-link__chev--out" aria-hidden="true" />
      ) : (
        <ChevronRight size={18} className="cw-link__chev" aria-hidden="true" />
      )}
    </>
  );
  const className = `cw-link${unread ? ' is-unread' : ''}`;
  return external ? (
    <a className={className} href={link.path} target="_blank" rel="noopener noreferrer">
      {body}
      <span className="cw-sr">
        {ht ? ' (louvri nan yon lòt onglè)' : ' (s’ouvre dans un nouvel onglet)'}
      </span>
    </a>
  ) : (
    <Link className={className} to={link.path}>
      {body}
    </Link>
  );
}

const panelIsEmpty = (panel: Panel) =>
  !panel.paragraphs?.length &&
  !panel.rows?.length &&
  !panel.links?.length &&
  !panel.tasks?.length;

const SECTIONS: Array<[string, string, string]> = [
  ['/arena/competitions', 'Activité et découverte', 'Aktivite ak dekouvèt'],
  ['/tournois', 'Tournois entre amis', 'Tounwa ant zanmi'],
  ['/jeux', 'Jouer une partie', 'Jwe yon pati'],
  ['/arena/championnat', 'Championnat officiel', 'Chanpyona ofisyèl'],
];

export type ExecuteTask = (
  task: Task,
  input: Record<string, string>,
  op: string,
) => Promise<void>;

export interface CompetitionWorkspaceViewProps {
  kind: WorkspaceTarget['kind'];
  page: WorkspacePage | null;
  ht: boolean;
  uid?: string;
  loading: boolean;
  /** A blocking or partial error message, already localized. */
  error?: string;
  notice?: string;
  /** Key prefix for panels (the route path), so forms reset between pages. */
  pageKey?: string;
  filter?: { school: string; department: string };
  onFilter?: (next: { school: string; department: string }) => void;
  onRetry: () => void;
  onSignIn: () => void;
  onMore?: () => void;
  execute: ExecuteTask;
}

export function CompetitionWorkspaceView({
  kind,
  page,
  ht,
  uid,
  loading,
  error,
  notice,
  pageKey = '',
  filter,
  onFilter,
  onRetry,
  onSignIn,
  onMore,
  execute,
}: CompetitionWorkspaceViewProps) {
  const { pathname } = useLocation();
  return (
    <div className="cw">
      <ArenaPageHead
        title={
          page ? copyFor(page.title, ht) : ht ? 'Konpetisyon' : 'Compétitions'
        }
        back="/arena"
      />
      <nav className="cw-nav" aria-label={ht ? 'Konpetisyon' : 'Compétitions'}>
        {SECTIONS.map(([path, fr, kr]) => (
          <Link
            key={path}
            to={path}
            aria-current={pathname === path ? 'page' : undefined}
          >
            {ht ? kr : fr}
          </Link>
        ))}
      </nav>
      {!uid ? (
        <div className="cw-signin">
          <p>
            {ht
              ? 'Konekte pou kreye yon ekip, enskri oswa swiv yon evènman.'
              : 'Connectez-vous pour créer une équipe, vous inscrire ou suivre un événement.'}
          </p>
          <button type="button" className="cw-primary" onClick={onSignIn}>
            {ht ? 'Konekte pou patisipe' : 'Se connecter pour participer'}
          </button>
        </div>
      ) : null}
      {kind === 'home' ? (
        <form
          className="cw-filter"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            onFilter?.({
              school: String(form.get('school') || ''),
              department: String(form.get('department') || ''),
            });
          }}
        >
          <label>
            <span className="cw-field__label">
              {ht ? 'Kòd lekòl' : 'Code école'}
            </span>
            <input name="school" defaultValue={filter?.school || ''} />
          </label>
          <label>
            <span className="cw-field__label">
              {ht ? 'Depatman' : 'Département'}
            </span>
            <input name="department" defaultValue={filter?.department || ''} />
          </label>
          <button type="submit" className="cw-secondary">
            {ht ? 'Aplike' : 'Parcourir'}
          </button>
        </form>
      ) : null}
      {error ? (
        <div role="alert" className="cw-alert">
          <p>{error}</p>
          <button type="button" className="cw-secondary" onClick={onRetry}>
            {ht ? 'Eseye ankò' : 'Réessayer'}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="cw-note cw-note--ok">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <div role="status" className="cw-loading">
          <span className="cw-sr">{ht ? 'Ap chaje…' : 'Chargement…'}</span>
          {[0, 1].map((n) => (
            <div key={n} className="cw-panel cw-skeleton" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : null}
      {page?.panels.map((panel, index) => (
        <section className="cw-panel" key={`${pageKey}-${index}`}>
          <h2>{copyFor(panel.title, ht)}</h2>
          {panel.paragraphs?.map((p, i) => (
            <p key={i} className={i === 0 ? 'cw-lead' : 'cw-meta'}>
              {copyFor(p, ht)}
            </p>
          ))}
          {panel.rows?.length ? (
            <ul className="cw-rows">
              {panel.rows.map((r, i) => {
                const person = rowPerson(r);
                return (
                  <li key={i} className={person ? 'cw-person' : undefined}>
                    {person ? <PersonFace person={person} /> : null}
                    <span>{copyFor(rowCopy(r), ht)}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {panel.links?.length ? (
            <div className="cw-linklist">
              {panel.links.map((link, i) => (
                <DestinationRow key={i} link={link} ht={ht} />
              ))}
            </div>
          ) : null}
          {panel.tasks?.length ? (
            <div className="cw-tasks">
              {panel.tasks.map((task) => (
                <TaskForm
                  key={`${uid}:${task.id}`}
                  task={task}
                  ht={ht}
                  uid={uid}
                  execute={execute}
                />
              ))}
            </div>
          ) : null}
          {panelIsEmpty(panel) ? (
            <p className="cw-empty">
              {ht ? 'Anyen pou kounye a.' : 'Rien pour le moment.'}
            </p>
          ) : null}
        </section>
      ))}
      {onMore ? (
        <div className="cw-more">
          <button type="button" className="cw-secondary" onClick={onMore}>
            {ht ? 'Plis evènman' : 'Plus d’événements'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
