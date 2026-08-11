import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GraduationCap, Zap } from 'lucide-react-native';
import useStore from '../contexts/store';
import { GRADES } from '../config/trackConfig';
import { updateUserGrade } from '../services/firebase';
import { navigateToTab } from '../navigation/AppNavigator';
import { useColors, typeScale, radius } from '../theme/theme';
import { tapLight } from '../utils/haptics';

/**
 * One-time onboarding sheet, shown right after the language choice (and once
 * for existing users, who default to gradeChosen=false). Two steps:
 *
 *   1. "Quelle classe ?" — one tap picks a grade (drives adaptive content via
 *      gradeProfile / pickHomeSuggestion, persisted to the user doc so a
 *      reinstall keeps it and the server can segment by class).
 *   2. First win — brand-new students (no quiz, no course) are routed straight
 *      into the Défi du jour instead of being dropped on a home screen full of
 *      choices. The 2026-08 activation analysis found 53% of signups never take
 *      a single action in their first session; this step gives that session
 *      exactly one obvious thing to do.
 *
 * Never blocks — every path sets gradeChosen so it won't ask again.
 */
export default function WelcomeGradeModal() {
  const hydrated = useStore((s) => s.hydrated);
  const authConfirmed = useStore((s) => s.authConfirmed);
  const gradeChosen = useStore((s) => s.gradeChosen);
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const quizAttempts = useStore((s) => s.quizAttempts);
  const enrolledCourses = useStore((s) => s.enrolledCourses);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Holds the sheet open for the first-win step after gradeChosen flips true.
  const [showMission, setShowMission] = useState(false);

  // Brand-new student — nothing attempted yet. Returning users changing their
  // grade from Profile (setGradeChosen(false)) skip straight past the pitch.
  const isFirstRun =
    Object.values(quizAttempts as Record<string, any[]>).flat().length === 0 &&
    enrolledCourses.length === 0;

  // Wait for authConfirmed so the prompt appears over the real dashboard, not
  // the loading splash (whose logo otherwise bleeds faintly behind the sheet).
  const visible = (hydrated && authConfirmed && !gradeChosen) || showMission;

  const finish = (code: string) => {
    setGrade(code);
    setGradeChosen(true);
    // Fire-and-forget — grade selection never waits on the network. Guests
    // have no uid; their grade is backfilled at sign-in (see App.tsx AuthGate).
    if (user?.uid) updateUserGrade(user.uid, code);
    if (isFirstRun) setShowMission(true);
  };

  // Skip keeps any existing grade untouched (a returning user reopening the
  // picker from Profile and tapping "Passer" must not lose their class).
  const skip = () => {
    setGradeChosen(true);
    if (isFirstRun) setShowMission(true);
  };

  const startMission = () => {
    tapLight();
    setShowMission(false);
    navigateToTab('Trivia', { daily: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        {showMission ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <View style={[styles.iconWrap, { backgroundColor: colors.azureSoft }]}>
              <Zap color={colors.azure} size={30} />
            </View>

            <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.ink }]}>
              {t('Ton premier quiz t’attend', 'Premye quiz ou ap tann ou')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {t(
                '2 minutes · gagne 50 XP et lance ta série 🔥',
                '2 minit · genyen 50 XP epi kòmanse seri ou 🔥',
              )}
            </Text>

            <TouchableOpacity
              onPress={startMission}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('Commencer le quiz', 'Kòmanse quiz la')}
              style={[styles.cta, { backgroundColor: colors.azure }]}
            >
              <Text style={[styles.ctaText, { color: '#ffffff' }]}>{t('Commencer', 'Kòmanse')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowMission(false)}
              activeOpacity={0.7}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel={t('Plus tard', 'Pita')}
            >
              <Text style={[styles.skipText, { color: colors.faint }]}>{t('Plus tard', 'Pita')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <View style={[styles.iconWrap, { backgroundColor: colors.azureSoft }]}>
              <GraduationCap color={colors.azure} size={30} />
            </View>

            <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.ink }]}>
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
                  <Text style={[styles.chipText, { color: colors.ink }]} numberOfLines={2}>
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
              <Text style={[styles.skipText, { color: colors.faint }]}>{t('Passer', 'Sote')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.hero, padding: 24, alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...typeScale.h1, textAlign: 'center' },
  subtitle: { ...typeScale.body, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { width: '47%', minHeight: 52, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  chipText: { ...typeScale.titleSm, textAlign: 'center' },
  cta: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  ctaText: { ...typeScale.titleSm },
  skip: { marginTop: 18, paddingVertical: 6, paddingHorizontal: 16 },
  skipText: { ...typeScale.bodyMd },
});
