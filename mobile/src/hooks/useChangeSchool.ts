import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { setMySchool } from '../services/triviaService';
import { fetchMyArenaSchoolBinding } from '../services/arenaService';
import { schoolChangePlan } from '../utils/schoolChange';
import { queryKeys } from '../lifecycle/queryKeys';
import { success } from '../utils/haptics';

/**
 * Change school from the Profil: explain → save → refresh what shows it.
 *
 * `choose(name)` is called with the school the student picked in SchoolPicker.
 * The picker is a Modal that is still sliding away at that moment, and an iOS
 * alert raised during a modal's dismissal is silently dropped — hence the
 * short wait before the confirmation.
 */
export function useChangeSchool(currentSchool: string | null) {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (name: string) => {
    if (!uid) return;
    setSaving(true);
    try {
      const updated = await setMySchool(uid, name);
      if (!updated) {
        Alert.alert(t('Erreur', 'Erè'), t('École non enregistrée. Réessaie.', 'Lekòl la pa anrejistre. Eseye ankò.'));
        return;
      }
      // The card reads the profile from this cache key: update it in place so
      // "Ton classement" shows the new school on the very next frame.
      qc.setQueryData(queryKeys.triviaProfile(uid), updated);
      qc.invalidateQueries({ queryKey: ['leaderboard-weekly'] });
      qc.invalidateQueries({ queryKey: ['leaderboard-collectives'] });
      success();
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, qc, isCreole]);

  const choose = useCallback((name: string) => {
    if (!uid) return;
    setTimeout(async () => {
      const arena = await fetchMyArenaSchoolBinding(uid);
      const plan = schoolChangePlan({ from: currentSchool, to: name, arena, isCreole });
      if (plan.kind === 'noop') return;
      if (plan.kind === 'save') { await save(name); return; }
      Alert.alert(plan.title, plan.message, [
        { text: plan.cancel, style: 'cancel' },
        { text: plan.confirm, onPress: () => { save(name); } },
      ]);
    }, 450);
  }, [uid, currentSchool, isCreole, save]);

  return { choose, saving };
}
