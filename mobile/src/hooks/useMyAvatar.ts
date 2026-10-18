import { useEffect, useSyncExternalStore } from 'react';
import useStore from '../contexts/store';
import { loadAvatar } from '../services/avatarService';

/*
 * The signed-in student's chosen avatar (wire string) or null (→ seeded face).
 * Mirrors the web's src/hooks/useMyAvatar.ts.
 *
 * A tiny module-level store rather than react-query, so any component can call
 * it without a provider: one read of users/{uid} per session, and the editor's
 * save writes the new value here so every face on screen updates at once.
 */
type Entry = { value: string | null; status: 'loading' | 'ready' };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

function ensure(uid: string) {
  if (cache.has(uid)) return;
  cache.set(uid, { value: null, status: 'loading' });
  loadAvatar(uid)
    .then((value) => cache.set(uid, { value, status: 'ready' }))
    .catch(() => cache.set(uid, { value: null, status: 'ready' }))
    .finally(emit);
}

/** Write-through after a save (or a reset with null). */
export function setMyAvatarCache(uid: string, value: string | null) {
  cache.set(uid, { value, status: 'ready' });
  emit();
}

export function useMyAvatar(): { avatar: string | null; loading: boolean } {
  const uid: string | null = useStore((s) => s.user?.uid) || null;
  useEffect(() => { if (uid) ensure(uid); }, [uid]);
  const entry = useSyncExternalStore(subscribe, () => (uid ? cache.get(uid) : undefined), () => undefined);
  return { avatar: entry?.value ?? null, loading: !!uid && (!entry || entry.status === 'loading') };
}
