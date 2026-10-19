import { useCallback, useState } from 'react';
import useStore from '../contexts/store';
import { useTrivia } from './useTrivia';
import { updateUserFullName } from '../services/firebase';
import { defaultAlias } from '../../../shared/alias';

/**
 * Save the account's FULL name — the one writer for it, shared by the Arène
 * lobby and the Profil (moved out of ArenaLobbyScreen unchanged).
 *
 * TWO NAMES, AND THEY ARE NOT THE SAME NAME. The full name lives on the
 * account (`user.name`, the auth displayName and `users/{uid}.full_name`)
 * because a prize winner has to prove their identity. The AUDIENCE name is the
 * first name alone, derived exactly as the server derives it, and it is the
 * only one that reaches a public board. Ted, 2026-09-21: "ask them to put
 * their full name, but we show them what the audience will see".
 *
 * The derived first name is also published as the board alias so the preview
 * the student approved is literally what the board shows. The rest of the
 * board identity is preserved: blanking a school or city as a side effect of
 * writing a name is its own bug.
 */
export function useSaveFullName() {
  const user = useStore((st) => st.user);
  const setUser = useStore((st) => st.setUser);
  const { profile, setLeaderboardOptIn } = useTrivia();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (next: string) => {
    setSaving(true);
    try {
      const uid = user?.uid || user?.id;
      if (uid) await updateUserFullName(uid, next);
      setUser({ ...(user || {}), name: next, displayName: next });

      const audience = defaultAlias(next);
      if (audience) {
        const lb: any = profile?.leaderboard || {};
        await setLeaderboardOptIn({
          optedIn: true,
          displayName: audience,
          school: lb.school ?? null,
          city: lb.city ?? null,
          department: lb.department ?? null,
        });
      }
    } finally {
      setSaving(false);
    }
  }, [user, setUser, profile, setLeaderboardOptIn]);

  return { save, saving };
}
