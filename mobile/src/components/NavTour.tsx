import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, typeScale, radius, touch, breakpoints } from '../theme/theme';
import { gradeProfile } from '../config/trackConfig';
import TabIcon, { type TabIconName } from '../navigation/TabIcon';
import { useReduceMotion, modalAnimation } from '../utils/motion';
import { tapLight } from '../utils/haptics';
import { useOnboardingSurface } from '../onboarding/onboardingState';
import { chooseTourMode, pointerLayout } from '../onboarding/tourGeometry';

type L = { fr: string; ht: string };
type Step = { tab: number; icon: TabIconName; title: L; body: L };

/**
 * Optional navigation help (audit #3 + #10).
 *
 * No longer a tour that fires the moment a grade is chosen: the onboarding
 * coordinator offers it only AFTER the student's first successful activity,
 * only on Home, and only when nothing else (welcome sheet, first mission, an
 * invitation, sign-in) owns the screen. The first card is an offer — "Non
 * merci" is a full answer and never asks again (tourCompleted).
 *
 * Placement is derived from the overlay's measured layout (onLayout) and live
 * window metrics, never module-init Dimensions. On iOS the system tab bar can't
 * be measured from JS (and moves to the top on iPad), so iOS — and any device
 * with very large text or a tablet width — gets a centred card with a
 * miniature bar instead of an arrow pointing at guessed coordinates.
 */
export default function NavTour() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const window = useWindowDimensions();
  const reduce = useReduceMotion();
  const surface = useOnboardingSurface();
  const setTourCompleted = useStore((s) => s.setTourCompleted);
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const pick = (l: L) => (isCreole ? l.ht : l.fr);
  const quizPrimary = gradeProfile(grade).primaryTab === 'Quiz';

  const steps: Step[] = [
    {
      tab: 0, icon: 'dashboard',
      title: { fr: 'Accueil', ht: 'Akèy' },
      body: { fr: 'Ta prochaine étape t’attend ici, chaque jour.', ht: 'Pwochen etap ou ap tann ou la a, chak jou.' },
    },
    {
      tab: 1, icon: 'courses',
      title: { fr: 'Cours', ht: 'Kou' },
      body: { fr: 'Tes cours en vidéo, par matière et chapitre.', ht: 'Kou videyo w yo, pa matyè ak chapit.' },
    },
    quizPrimary
      ? {
        tab: 2, icon: 'quiz',
        title: { fr: 'Quiz', ht: 'Quiz' },
        body: { fr: 'Des quiz par matière pour t’entraîner.', ht: 'Quiz pa matyè pou w antrene.' },
      }
      : {
        tab: 2, icon: 'exams',
        title: { fr: 'Examens', ht: 'Egzamen' },
        body: { fr: 'Entraîne-toi sur les vrais sujets du Bac.', ht: 'Antrene w sou vrè sijè Bak yo.' },
      },
    {
      tab: 3, icon: 'games',
      title: { fr: 'Jeux', ht: 'Jwèt' },
      body: { fr: 'Le défi du jour, les duels et des jeux pour gagner des XP.', ht: 'Defi jodi a, defi ak zanmi ak jwèt pou genyen XP.' },
    },
    {
      tab: 4, icon: 'profile',
      title: { fr: 'Profil', ht: 'Pwofil' },
      body: { fr: 'Ta progression, ta série et tes réglages.', ht: 'Pwogrè w, seri w ak paramèt yo.' },
    },
  ];

  // -1 = the offer card; 0..4 = tab steps.
  const [index, setIndex] = useState(-1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const visible = surface === 'navHelp';
  const offering = index < 0;
  const step = offering ? null : steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const finish = () => {
    setTourCompleted(true);
    setIndex(-1);
  };
  const next = () => {
    tapLight();
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };

  const W = size?.w ?? window.width;
  const H = size?.h ?? window.height;
  const mode = chooseTourMode({
    platform: Platform.OS,
    width: W,
    fontScale: window.fontScale,
    tabletWidth: breakpoints.tablet,
  });
  const pointer = !offering && mode === 'pointer' && step
    ? pointerLayout({ width: W, height: H, insetBottom: insets.bottom, index: step.tab })
    : null;

  const stepLabel = step ? t(`Étape ${step.tab + 1} sur ${steps.length}`, `Etap ${step.tab + 1} sou ${steps.length}`) : '';

  const footer = (
    <View style={styles.footer}>
      {offering ? (
        <>
          <TouchableOpacity
            onPress={finish}
            style={styles.ghostBtn}
            accessibilityRole="button"
            accessibilityLabel={t('Non merci', 'Non mèsi')}
          >
            <Text style={[typeScale.action, { color: colors.muted }]}>{t('Non merci', 'Non mèsi')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={next}
            style={[styles.primaryBtn, { backgroundColor: colors.azureFill }]}
            accessibilityRole="button"
            accessibilityLabel={t('Montre-moi', 'Montre m')}
          >
            <Text style={[typeScale.action, { color: '#ffffff' }]}>{t('Montre-moi', 'Montre m')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {steps.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: colors.border }, i === index && { width: 18, backgroundColor: colors.azure }]}
              />
            ))}
          </View>
          <TouchableOpacity
            onPress={next}
            style={[styles.primaryBtn, { backgroundColor: colors.azureFill }]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('Terminer', 'Fini') : t('Suivant', 'Swivan')}
          >
            <Text style={[typeScale.action, { color: '#ffffff' }]}>
              {isLast ? t('Terminer', 'Fini') : t('Suivant', 'Swivan')}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  /** Miniature tab bar — highlights the slot by position, not by coordinates. */
  const miniBar = step ? (
    <View
      style={[styles.miniBar, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {steps.map((s) => {
        const on = s.tab === step.tab;
        return (
          <View key={s.tab} style={[styles.miniSlot, on && { backgroundColor: colors.azureSoft }]}>
            <TabIcon name={s.icon} color={on ? colors.azure : colors.faint} size={22} focused={on} />
          </View>
        );
      })}
    </View>
  ) : null;

  const body = (
    <>
      {offering ? (
        <View style={[styles.tipIcon, { backgroundColor: colors.azureSoft }]}>
          <Compass color={colors.azure} size={26} />
        </View>
      ) : null}
      {!offering ? (
        <Text style={[typeScale.label, { color: colors.muted, marginBottom: 4 }]}>{stepLabel}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[typeScale.h2, { color: colors.ink, marginBottom: 6 }]}>
        {offering ? t('Un tour rapide de l’app ?', 'Yon ti vizit rapid nan app la ?') : pick(step!.title)}
      </Text>
      <Text style={[typeScale.instruction, { color: colors.muted }]}>
        {offering
          ? t(
            'Bravo pour ta première activité. Veux-tu voir où se trouve chaque chose ? Moins d’une minute.',
            'Bravo pou premye aktivite w. Ou vle wè kote chak bagay ye ? Mwens pase yon minit.',
          )
          : pick(step!.body)}
      </Text>
      {!offering && mode === 'map' ? miniBar : null}
      {footer}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={modalAnimation(reduce)}
      statusBarTranslucent
      onRequestClose={finish}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View
        style={[styles.backdrop]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
        }}
      >
        {!offering ? (
          <TouchableOpacity
            onPress={finish}
            style={[styles.skip, { top: insets.top + 6 }]}
            accessibilityRole="button"
            accessibilityLabel={t('Passer le tour', 'Sote vizit la')}
          >
            <Text style={[typeScale.action, { color: '#e2e8f0' }]}>{t('Passer', 'Sote')}</Text>
          </TouchableOpacity>
        ) : null}

        {pointer && step ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.spotlight,
              { backgroundColor: colors.surface, ...pointer.spot },
            ]}
          >
            <TabIcon name={step.icon} color={colors.azure} size={23} focused />
          </View>
        ) : null}

        {pointer ? (
          <View
            accessibilityViewIsModal
            style={[styles.card, { backgroundColor: colors.surface, position: 'absolute', ...pointer.tip }]}
          >
            {body}
            <View style={[styles.arrow, { borderTopColor: colors.surface, left: pointer.arrowLeft }]} />
          </View>
        ) : (
          <View style={styles.center} pointerEvents="box-none">
            <ScrollView
              contentContainerStyle={styles.centerScroll}
              style={{ width: '100%' }}
              bounces={false}
            >
              <View accessibilityViewIsModal style={[styles.card, styles.centerCard, { backgroundColor: colors.surface }]}>
                {body}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' },
  skip: {
    position: 'absolute', right: 12, zIndex: 10,
    minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  spotlight: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  card: { borderRadius: radius.hero, padding: 18 },
  center: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  centerScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  centerCard: { width: '100%', maxWidth: 420 },
  tipIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12, flexWrap: 'wrap' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  primaryBtn: {
    borderRadius: radius.pill, paddingHorizontal: 20, minHeight: touch.min,
    alignItems: 'center', justifyContent: 'center', marginLeft: 'auto',
  },
  ghostBtn: { minHeight: touch.min, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  miniBar: {
    flexDirection: 'row', marginTop: 16, borderRadius: radius.pill, borderWidth: 1,
    padding: 4, justifyContent: 'space-between',
  },
  miniSlot: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  arrow: {
    position: 'absolute', bottom: -9, width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
});
