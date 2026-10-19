import type { ClassDetail, ClassHome } from './classes';
type Request = <T = any>(action: string, values?: Record<string, unknown>) => Promise<T>;
type Hooks = {
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((previous: T) => T)) => void];
  useRef: <T>(initial: T) => { current: T };
  useCallback: <T extends (...args: any[]) => any>(callback: T, dependencies: readonly unknown[]) => T;
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void;
};
/** One account-scoped controller for both surfaces. Stale responses never enter the next student's screen. */
// Inject the platform's React runtime: native and web use different React versions.
export function createUseClasses({ useCallback, useEffect, useRef, useState }: Hooks) {
return function useClasses(uid: string | undefined, request: Request) {
  const [state, setState] = useState<{ uid?: string; home?: ClassHome; detail?: ClassDetail; error?: unknown; loading: boolean }>({ loading: true });
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), owner = useRef(uid), locked = useRef(false), accountEpoch = useRef(0);
  if (owner.current !== uid) { owner.current = uid; accountEpoch.current++; }
  const selected = useRef<string | undefined>(undefined);
  const load = useCallback(async (id?: string) => {
    const version = ++epoch.current;
    selected.current = id;
    if (!uid) { setState({ uid, loading: false }); return; }
    setState((s) => ({ ...(s.uid === uid ? s : {}), uid, loading: true, error: undefined, detail: id ? s.uid === uid && s.detail?.classroom.id === id ? s.detail : undefined : undefined }));
    try {
      const [home, detail] = await Promise.all([request<ClassHome>('home'), id ? request<ClassDetail>('read', { id }) : undefined]);
      if (version === epoch.current && owner.current === uid) setState({ uid, home, detail, loading: false });
    } catch (error) {
      if (version === epoch.current && owner.current === uid) setState((s) => ({ uid, home: s.home, error, loading: false }));
    }
  }, [uid, request]);
  useEffect(() => {
    selected.current = undefined; locked.current = false; setBusy(false); void load();
    const generation = epoch;
    return () => { generation.current++; };
  }, [load]);
  const act = async (action: string, values: Record<string, unknown> = {}) => {
    if (locked.current || !uid) return false;
    locked.current = true; setBusy(true);
    const account = uid, identity = accountEpoch.current;
    try {
      await request(action, values);
      if (owner.current !== account || accountEpoch.current !== identity) return false;
      await load(action === 'leave' ? undefined : selected.current);
      return true;
    } catch (error) {
      if (owner.current === account && accountEpoch.current === identity) setState((s) => ({ ...s, error }));
      return false;
    } finally { if (owner.current === account && accountEpoch.current === identity) { locked.current = false; setBusy(false); } }
  };
  return { ...(state.uid === uid ? state : { loading: !!uid }), selectedId: state.uid === uid ? selected.current : undefined, busy, load, act };
};
}
