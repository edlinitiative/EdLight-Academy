import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import useStore from '../../contexts/store';
import { competitionRequest } from '../../services/competitionService';
import {
  workspaceError,
  WorkspaceError,
} from '../../../shared/competition/client';
import {
  taskPayload,
  workspacePage,
  type Task,
  type WorkspaceTarget,
} from '../../../shared/competition/workspace';
import { CompetitionWorkspaceView } from './CompetitionWorkspaceView';

export { TaskForm } from './CompetitionWorkspaceView';

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
    <CompetitionWorkspaceView
      kind={kind}
      page={page}
      ht={ht}
      uid={uid}
      loading={loading}
      error={
        error ||
        mineError ||
        (data?.errors?.length
          ? ht
            ? 'Gen yon seksyon ki pa disponib.'
            : 'Une section est indisponible.'
          : '')
      }
      notice={notice}
      pageKey={location.pathname}
      filter={{
        school: params.get('school') || '',
        department: params.get('department') || '',
      }}
      onFilter={({ school, department }) => {
        const next = new URLSearchParams();
        if (school) next.set('school', school);
        if (department) next.set('department', department);
        setParams(next);
      }}
      onRetry={() => {
        void refresh();
      }}
      onSignIn={() => useStore.getState().toggleAuthModal()}
      onMore={
        data?.cursor
          ? async () => {
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
            }
          : undefined
      }
      execute={execute}
    />
  );
}
