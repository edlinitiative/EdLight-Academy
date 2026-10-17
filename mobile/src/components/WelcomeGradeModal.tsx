import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { GraduationCap, Zap } from 'lucide-react-native';
import useStore from '../contexts/store';
import { GRADES } from '../config/trackConfig';
import { updateUserGrade } from '../services/firebase';
import { navigateToTab } from '../navigation/AppNavigator';
import { areNotificationsEnabled, scheduleEngagementReminders } from '../services/notificationService';
import { useColors, typeScale, radius, touch } from '../theme/theme';
import { tapLight, select } from '../utils/haptics';
import { useReduceMotion, modalAnimation } from '../utils/motion';
import {
  startOnboardingRuntime, useOnboardingSurface, completeWelcomeStep, setMissionStatus,
} from '../onboarding/onboardingState';
import NotificationPrePromptSheet from './ui/NotificationPrePromptSheet';

/**
 * The first-run sheet, driven by the onboarding coordinator
 * (src/onboarding/coordinator.ts) so it can never share the screen with the
 * navigation help, an invitation, or the sign-in sheet.
 *
 *   1. welcome — a Kreyòl / Français switch on top of "Quelle classe ?". One
 *      tap picks a grade (drives adaptive content via gradeProfile /
 *      pickHomeSuggestion, persisted to the user doc so a reinstall keeps it).
 *      Also reopened from Profile (setGradeChosen(false)).
 *   2. mission — brand-new students (no activity yet, not arriving through an
 *      invitation) are offered today's challenge as their first useful action.
 *      The 2026-08 activation analysis found 53% of signups never took a single
 *      action in their first session; this step gives that session one obvious
 *      thing to do.
 *
 * Never blocks — every path sets gradeChosen so it won't ask again.
 *
 * Also hosts the onboarding runtime (link + navigation listeners) and the
 * notification pre-prompt sheet, because this component is always mounted
 * inside the NavigationContainer. Both are singletons, so mounting them again
 * elsewhere later is harmless.
 */
export default function WelcomeGradeModal() {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const quizAttempts = useStore((s) => s.quizAttempts);
  const enrolledCourses = useStore((s) => s.enrolledCourses);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const setLanguage = useStore((s) => s.setLanguage);
  const colors = useColors();
  const reduce = useReduceMotion();
  const surface = useOnboardingSurface();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  useEffect(() => { startOnboardingRuntime(); }, []);

  // Brand-new student — nothing attempted yet. Returning users changing their
  // grade from Profile skip straight past the pitch.
  const isFirstRun =
    Object.values(quizAttempts as Record<string, any[]>).flat().length === 0 &&
    enrolledCourses.length === 0;

  const visible = surface === 'welcome' || surface === 'mission';
  const showMission = surface === 'mission';

  const chooseLanguage = (next: 'fr' | 'ht') => {
    if (next === language) return;
    select();
    setLanguage(next);
    // Scheduled reminders carry copy in the old language — refresh them.
    areNotificationsEnabled()
      .then((on) => { if (on) return scheduleEngagementReminders(); })
      .catch(() => {});
  };

  const finish = (code: string) => {
    tapLight();
    setGrade(code);
    completeWelcomeStep(isFirstRun);
    setGradeChosen(true);
    // Fire-and-forget — grade selection never waits on the network. Guests
    // have no uid; their grade is backfilled at sign-in (see App.tsx AuthGate).
    if (user?.uid) updateUserGrade(user.uid, code);
  };

  // Skip keeps any existing grade untouched (a returning user reopening the
  // picker from Profile and tapping "Passer" must not lose their class).
  const skip = () => {
    completeWelcomeStep(isFirstRun);
    setGradeChosen(true);
  };

  const startMission = () => {
    tapLight();
    setMissionStatus('done');
    navigateToTab('Trivia', { daily: true });
  };

  const LangOption = ({ code, label }: { code: 'fr' | 'ht'; label: string }) => {
    const on = language === code;
    return (
      <TouchableOpacity
        onPress={() => chooseLanguage(code)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on, checked: on }}
        accessibilityLabel={label}
        style={[styles.langOption, on && { backgroundColor: colors.surface, borderColor: colors.azureBorder }]}
      >
        <Text style={[typeScale.action, { color: on ? colors.azure : colors.muted }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType={modalAnimation(reduce)}
        statusBarTranslucent
        onRequestClose={showMission ? () => setMissionStatus('done') : skip}
      >
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.scroll} bounces={false} style={{ width: '100%' }}>
            {showMission ? (
              <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
                <View style={[styles.iconWrap, { backgroundColor: colors.azureSoft }]}>
                  <Zap color={colors.azure} size={30} />
                </View>

                <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
                  {t('Ton premier quiz t’attend', 'Premye quiz ou ap tann ou')}
                </Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  {t(
                    '2 minutes pour gagner 50 XP et lancer ta série.',
                    '2 minit pou genyen 50 XP epi kòmanse seri ou.',
                  )}
                </Text>

                <TouchableOpacity
                  onPress={startMission}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('Commencer le quiz', 'Kòmanse quiz la')}
                  style={[styles.cta, { backgroundColor: colors.azureFill }]}
                >
                  <Text style={[typeScale.action, { color: '#ffffff' }]}>{t('Commencer', 'Kòmanse')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMissionStatus('done')}
                  activeOpacity={0.7}
                  style={styles.skip}
                  accessibilityRole="button"
                  accessibilityLabel={t('Plus tard', 'Pita')}
                >
                  <Text style={[typeScale.action, { color: colors.muted }]}>{t('Plus tard', 'Pita')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
                {/* Language first — the rest of the sheet re-renders in it. */}
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('Langue', 'Lang')}
                  style={[styles.langSwitch, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                >
                  <LangOption code="ht" label="Kreyòl" />
                  <LangOption code="fr" label="Français" />
                </View>

                <View style={[styles.iconWrap, { backgroundColor: colors.azureSoft }]}>
                  <GraduationCap color={colors.azure} size={30} />
                </View>

                <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
                  {t('Tu es en quelle classe ?', 'Ki klas ou ye ?')}
                </Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  {t('Pour te proposer le bon contenu.', 'Pou n ba w bon kontni an.')}
                </Text>

                <View style={styles.grid}>
                  {GRADES.map((g) => (
                    <TouchableOpacity
                      key={g.code}
                      onPress={() => finish(g.code)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={isCreole ? g.labelHt : g.label}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    >
                      <Text style={[styles.chipText, { color: colors.ink }]}>
                        {isCreole ? g.labelHt : g.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={skip}
                  activeOpacity={0.7}
                  style={styles.skip}
                  accessibilityRole="button"
                  accessibilityLabel={t('Passer', 'Sote')}
                >
                  <Text style={[typeScale.action, { color: colors.muted }]}>{t('Passer', 'Sote')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
      <NotificationPrePromptSheet />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' },
  // Scrolls instead of clipping when Dynamic Type is large or the phone is small.
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.hero, padding: 24, alignItems: 'center' },
  langSwitch: {
    flexDirection: 'row', alignSelf: 'stretch', borderRadius: radius.pill, borderWidth: 1,
    padding: 3, marginBottom: 18,
  },
  langOption: {
    flex: 1, minHeight: touch.min, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrap: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...typeScale.h1, textAlign: 'center' },
  subtitle: { ...typeScale.instruction, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', alignSelf: 'stretch' },
  chip: {
    flexGrow: 1, flexBasis: '45%', minHeight: 52, borderRadius: radius.control, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10,
  },
  chipText: { ...typeScale.titleSm, textAlign: 'center' },
  cta: {
    alignSelf: 'stretch', borderRadius: radius.pill, minHeight: touch.min + 4,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  skip: { marginTop: 12, minHeight: touch.min, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
