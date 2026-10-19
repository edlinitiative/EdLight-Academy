import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { updateUserGrade } from '../services/firebase';
import { navigateToTab } from '../navigation/AppNavigator';
import { areNotificationsEnabled, scheduleEngagementReminders } from '../services/notificationService';
import { useTheme, touch } from '../theme/theme';
import { tapLight, select } from '../utils/haptics';
import { useReduceMotion, modalAnimation } from '../utils/motion';
import {
  startOnboardingRuntime, useOnboardingSurface, completeWelcomeStep, setMissionStatus,
} from '../onboarding/onboardingState';
import NotificationPrePromptSheet from './ui/NotificationPrePromptSheet';
import PressableScale from './ui/PressableScale';
import Button from './ui/Button';
import { Avatar as Face } from './arena/art';
import { useMyAvatar } from '../hooks/useMyAvatar';

/**
 * The first-run welcome (Stitch 12d), driven by the onboarding coordinator
 * (src/onboarding/coordinator.ts) so it can never share the screen with the
 * navigation help, an invitation, or the sign-in sheet.
 *
 *   1. welcome — a full page: language tiles (Kreyòl first, the default), then
 *      the class tiles. Picking a class arms "Kòmanse"; the button commits it
 *      (drives adaptive content via gradeProfile / pickHomeSuggestion, persisted
 *      to the user doc so a reinstall keeps it). Also reopened from Profile
 *      (setGradeChosen(false)), where the current class is preselected.
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

/** NS I…IV stand alone: never mapped to the old class names. */
const NS_TILES = [
  { code: 'NS1', label: 'NS I' },
  { code: 'NS2', label: 'NS II' },
  { code: 'NS3', label: 'NS III' },
  { code: 'NS4', label: 'NS IV' },
] as const;
const FONDAMENTAL = [
  { code: '7e', label: '7e', ht: '7yèm' },
  { code: '8e', label: '8e', ht: '8yèm' },
  { code: '9e', label: '9e', ht: '9yèm' },
] as const;

export default function WelcomeGradeModal() {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const { avatar: myAvatar } = useMyAvatar();
  const grade = useStore((s) => s.grade);
  const quizAttempts = useStore((s) => s.quizAttempts);
  const enrolledCourses = useStore((s) => s.enrolledCourses);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const setLanguage = useStore((s) => s.setLanguage);
  const { colors, fonts, typeScale, cardSurface, featureSurface, radius } = useTheme();
  const reduce = useReduceMotion();
  // Insets come from the app-root provider (context crosses the Modal portal).
  // A native <SafeAreaView> INSIDE this statusBarTranslucent Modal measured 0
  // on device, so the wordmark and "Passer" drew under the status bar (build 63).
  const insets = useSafeAreaInsets();
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

  // The pending pick. Seeded with the stored class each time the page opens,
  // so a student reopening it from Profile sees their own class selected.
  const [picked, setPicked] = useState<string | null>(grade);
  useEffect(() => {
    if (surface === 'welcome') setPicked(grade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  const chooseLanguage = (next: 'fr' | 'ht') => {
    if (next === language) return;
    select();
    setLanguage(next);
    // Scheduled reminders carry copy in the old language — refresh them.
    areNotificationsEnabled()
      .then((on) => { if (on) return scheduleEngagementReminders(); })
      .catch(() => {});
  };

  const pick = (code: string) => {
    if (code === picked) return;
    select();
    setPicked(code);
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

  // ── pieces ────────────────────────────────────────────────────────────────

  /**
   * One tile for every choice on this page (TestFlight build 63, "size
   * formatting and all look weird"): the same height, the same title size per
   * row, no 26–44pt display numerals in tall cards. Selection is the filled
   * azure ground (white label) instead of a 28pt disc, so a 4-up row of ~80pt
   * tiles keeps its whole width for the label. Titles are one line and shrink
   * rather than wrap, so large text never breaks a word ("Fondamenta / l").
   */
  const Tile = ({
    selected, onPress, title, meta, a11y, titleSize = 19,
  }: {
    selected: boolean; onPress: () => void; title: string; meta?: string;
    a11y: string; titleSize?: number;
  }) => (
    <PressableScale
      onPress={onPress}
      haptic={false}
      pressedScale={0.97}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={a11y}
      style={[
        cardSurface,
        styles.tile,
        selected ? { backgroundColor: colors.azureFill, shadowOpacity: 0, elevation: 0 } : null,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.3}
        style={{ fontFamily: fonts.heading, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.25), letterSpacing: -0.4, textAlign: 'center', color: selected ? '#ffffff' : colors.ink }}
      >
        {title}
      </Text>
      {meta ? (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          style={[typeScale.caption, { textAlign: 'center', marginTop: 2, color: selected ? '#ffffff' : colors.muted }]}
        >
          {meta}
        </Text>
      ) : null}
    </PressableScale>
  );

  const SectionLabel = ({ ht, fr }: { ht: string; fr: string }) => (
    <Text accessibilityRole="header" style={[typeScale.meta, { color: colors.muted, marginTop: 24, marginBottom: 10 }]}>
      <Text style={{ fontFamily: fonts.bold, color: colors.ink }}>{ht}</Text>
      {' · '}
      {fr}
    </Text>
  );

  /** "Nouveau secondaire" / "Fondamental" — once per row, never per tile. */
  const GroupLabel = ({ children }: { children: string }) => (
    <Text style={[typeScale.caption, { color: colors.muted, marginBottom: -2 }]}>{children}</Text>
  );

  const nsMeta = t('Nouveau secondaire', 'Nouvo segondè');

  return (
    <>
      {/* ONE modal for both steps (two would race on iOS: presenting the second
          while the first is still dismissing fails). The welcome fills it with
          an opaque page; the mission is a short sheet over a scrim. */}
      <Modal
        visible={visible}
        transparent
        animationType={modalAnimation(reduce)}
        statusBarTranslucent
        onRequestClose={showMission ? () => setMissionStatus('done') : skip}
      >
        {!showMission ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={styles.header}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, letterSpacing: -0.6, color: colors.azureInk }}>EdLight</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {isFirstRun ? (
                <View
                  accessible
                  accessibilityLabel={t('Étape 1 sur 2', 'Etap 1 sou 2')}
                  style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}
                >
                  <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.muted }}>1 / 2</Text>
                </View>
              ) : null}
              <PressableScale
                onPress={skip}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={t('Passer', 'Sote')}
                style={{ minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={[typeScale.action, { color: colors.muted }]}>{t('Passer', 'Sote')}</Text>
              </PressableScale>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[typeScale.pageTitle, { fontSize: 28, lineHeight: 33, color: colors.ink, marginTop: 4 }]}>
                {isFirstRun ? t('Bienvenue sur EdLight', 'Byenvini sou EdLight') : t('Ta classe', 'Klas ou')}
              </Text>
              <Text style={[typeScale.body, { color: colors.muted, marginTop: 8 }]}>
                {isFirstRun
                  ? t('Prépare ton programme en deux petits pas.', 'Prepare pwogram ou an de ti pa senp.')
                  : t('Ton contenu s’adapte à ta classe.', 'Kontni ou adapte ak klas ou.')}
              </Text>

              {/* Language first — the rest of the page re-renders in it. */}
              <SectionLabel ht="Chwazi lang ou" fr="Choisis ta langue" />
              <View accessibilityRole="radiogroup" style={styles.row}>
                <Tile selected={isCreole} onPress={() => chooseLanguage('ht')} title="Kreyòl" meta="Tout an kreyòl" a11y="Kreyòl ayisyen" />
                <Tile selected={!isCreole} onPress={() => chooseLanguage('fr')} title="Français" meta="Tout en français" a11y="Français" />
              </View>

              <SectionLabel ht="Ki klas ou ye ?" fr="Quelle classe ?" />
              <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
                <GroupLabel>{nsMeta}</GroupLabel>
                <View style={styles.row}>
                  {NS_TILES.map((g) => (
                    <Tile key={g.code} selected={picked === g.code} onPress={() => pick(g.code)} title={g.label} a11y={`${g.label}, ${nsMeta}`} />
                  ))}
                </View>
                <GroupLabel>{t('Fondamental', 'Fondamantal')}</GroupLabel>
                <View style={styles.row}>
                  {FONDAMENTAL.map((g) => {
                    const label = isCreole ? g.ht : g.label;
                    return (
                      <Tile key={g.code} selected={picked === g.code} onPress={() => pick(g.code)} title={label} a11y={`${t(`${g.label} année`, `${g.ht} ane`)}, ${t('Fondamental', 'Fondamantal')}`} />
                    );
                  })}
                </View>
                <View style={[styles.row, { marginTop: 6 }]}>
                  <Tile
                    selected={picked === 'POSTBAC'}
                    onPress={() => pick('POSTBAC')}
                    title={t('Après le Bac', 'Apre Bak')}
                    meta={t('Préfac et concours', 'Prefak ak konkou')}
                    a11y={t('Après le Bac, préfac et concours', 'Apre Bak, prefak ak konkou')}
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Pinned commit. Disabled until a class is picked. */}
          <View style={[styles.footer, { backgroundColor: colors.bg }]}>
            <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
              <Button
                size="lg"
                fullWidth
                disabled={!picked}
                label={t('Commencer', 'Kòmanse')}
                trailingIcon={<ArrowRight color="#ffffff" size={20} strokeWidth={2.4} />}
                onPress={() => picked && finish(picked)}
              />
              <Text style={[typeScale.caption, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
                {t('Tu pourras changer ça plus tard dans Profil.', 'Ou ka chanje sa pita nan Pwofil.')}
              </Text>
            </View>
          </View>
        </View>
        ) : (
        <View style={styles.overlay}>
          <View style={[featureSurface, styles.card]} accessibilityViewIsModal>
            <Face seed={user?.uid || 'edlight-welcome'} config={myAvatar} mood="ready" size={84} />
            {isFirstRun ? (
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.muted, marginTop: 14 }}>2 / 2</Text>
            ) : null}
            <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, textAlign: 'center', marginTop: 8 }]}>
              {t('Ton premier quiz t’attend', 'Premye quiz ou ap tann ou')}
            </Text>
            <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 22 }]}>
              {t(
                '2 minutes pour gagner 50 XP et lancer ta série.',
                '2 minit pou genyen 50 XP epi kòmanse seri ou.',
              )}
            </Text>
            <Button
              size="lg"
              fullWidth
              label={t('Commencer le quiz', 'Kòmanse quiz la')}
              onPress={startMission}
            />
            <Button
              variant="ghost"
              fullWidth
              label={t('Plus tard', 'Pita')}
              onPress={() => setMissionStatus('done')}
              style={{ marginTop: 6 }}
            />
          </View>
        </View>
        )}
      </Modal>
      <NotificationPrePromptSheet />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 20, paddingRight: 10, minHeight: 56,
  },
  row: { flexDirection: 'row', gap: 10 },
  // Same height everywhere on the page; grows (never clips) with large text.
  tile: { flex: 1, minHeight: 60, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  // Opaque scrim (a solid colour at fixed alpha, no blur): the app behind stays
  // legible as context while the sheet is the one thing in focus.
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, padding: 24, alignItems: 'center' },
});
