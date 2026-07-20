import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Dimensions, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard, BookOpen, ClipboardList, Zap, User,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';

// Must mirror TabNavigator's floating-pill geometry so the spotlights line up
// exactly over the real tabs.
const BAR_HEIGHT = 62;
const BAR_MARGIN = 16;
const TAB_COUNT = 5;
const PRIMARY = '#1B6FE0';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Step = {
  tab: number | null; // index into the 5 tabs, or null for a centered intro
  Icon: any;
  title: { fr: string; ht: string };
  body: { fr: string; ht: string };
};

// A quick coached tour that points at the real bottom-nav tabs and says what
// each does. Shown once for a first-time user (store.tourCompleted).
const STEPS: Step[] = [
  {
    tab: null,
    Icon: LayoutDashboard,
    title: { fr: 'Bienvenue 👋', ht: 'Byenveni 👋' },
    body: {
      fr: 'Voici un tour rapide de l\'application, en 4 étapes.',
      ht: 'Men yon ti vizit rapid nan aplikasyon an, an 4 etap.',
    },
  },
  {
    tab: 1,
    Icon: BookOpen,
    title: { fr: 'Cours', ht: 'Kou' },
    body: {
      fr: 'Tes cours en vidéo, par matière et chapitre.',
      ht: 'Kou videyo w yo, pa matyè ak chapit.',
    },
  },
  {
    tab: 2,
    Icon: ClipboardList,
    title: { fr: 'Examens', ht: 'Egzamen' },
    body: {
      fr: 'Entraîne-toi sur les vrais sujets du Bac.',
      ht: 'Antrene w sou vrè sijè Bak yo.',
    },
  },
  {
    tab: 3,
    Icon: Zap,
    title: { fr: 'Trivia', ht: 'Trivia' },
    body: {
      fr: 'Joue, gagne des XP et garde ta série.',
      ht: 'Jwe, genyen XP epi kenbe seri w.',
    },
  },
  {
    tab: 4,
    Icon: User,
    title: { fr: 'Profil', ht: 'Pwofil' },
    body: {
      fr: 'Ta progression, ta série et tes réglages.',
      ht: 'Pwogrè w, seri w ak paramèt yo.',
    },
  },
];

export default function NavTour() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const hydrated = useStore((s) => s.hydrated);
  const languageChosen = useStore((s) => s.languageChosen);
  const tourCompleted = useStore((s) => s.tourCompleted);
  const setTourCompleted = useStore((s) => s.setTourCompleted);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const [index, setIndex] = useState(0);

  const visible = hydrated && languageChosen && !tourCompleted;
  const step = STEPS[index];
  const isLast = index >= STEPS.length - 1;

  const finish = () => setTourCompleted(true);
  const next = () => (isLast ? finish() : setIndex((i) => i + 1));

  // Floating-pill geometry (matches TabNavigator).
  const bottomOffset = Math.max(insets.bottom, 12);
  const barTop = SCREEN_H - bottomOffset - BAR_HEIGHT;
  const slotW = (SCREEN_W - BAR_MARGIN * 2) / TAB_COUNT;

  // Spotlight rect over the highlighted tab.
  const hasTab = step.tab != null;
  const spotW = slotW - 4;
  const spotLeft = hasTab ? BAR_MARGIN + step.tab! * slotW + 2 : 0;
  const spotTop = barTop + 3;
  const spotH = BAR_HEIGHT - 6;
  const tabCenterX = hasTab ? BAR_MARGIN + (step.tab! + 0.5) * slotW : SCREEN_W / 2;

  // Tooltip: above the bar for a tab step, centered for the intro.
  const TIP_W = Math.min(SCREEN_W - 40, 300);
  const tipLeft = Math.max(16, Math.min(tabCenterX - TIP_W / 2, SCREEN_W - 16 - TIP_W));
  const arrowLeft = tabCenterX - tipLeft - 8; // triangle offset within the tooltip

  const Icon = step.Icon;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      {/* Dim backdrop (tap anywhere = next) */}
      <TouchableOpacity activeOpacity={1} style={styles.backdrop} onPress={next}>
        {/* Skip */}
        <TouchableOpacity
          onPress={finish}
          style={[styles.skip, { top: insets.top + 8 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>{isCreole ? 'Sote' : 'Passer'}</Text>
        </TouchableOpacity>

        {/* Spotlight over the target tab (re-draws the tab, lit, above the dim) */}
        {hasTab && (
          <View
            pointerEvents="none"
            style={[
              styles.spotlight,
              { backgroundColor: colors.surface, left: spotLeft, top: spotTop, width: spotW, height: spotH },
            ]}
          >
            <Icon color={colors.azure} size={22} />
            <Text style={[styles.spotLabel, { color: colors.azure }]} numberOfLines={1}>
              {isCreole ? step.title.ht : step.title.fr}
            </Text>
          </View>
        )}

        {/* Tooltip */}
        <View
          style={[
            styles.tip,
            { backgroundColor: colors.surface, width: TIP_W },
            hasTab
              ? { left: tipLeft, bottom: SCREEN_H - barTop + 16 }
              : { left: (SCREEN_W - TIP_W) / 2, top: SCREEN_H * 0.4 },
          ]}
        >
          {!hasTab && (
            <View style={[styles.tipIcon, { backgroundColor: colors.azureSoft }]}>
              <Icon color={colors.azure} size={26} />
            </View>
          )}
          <Text style={[styles.tipTitle, { color: colors.ink }]}>{isCreole ? step.title.ht : step.title.fr}</Text>
          <Text style={[styles.tipBody, { color: colors.muted }]}>{isCreole ? step.body.ht : step.body.fr}</Text>

          {/* Dots + Next */}
          <View style={styles.tipFooter}>
            <View style={styles.dots}>
              {STEPS.map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: colors.border }, i === index && { width: 18, backgroundColor: colors.azure }]} />
              ))}
            </View>
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.azure }]} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>
                {isLast ? (isCreole ? 'Fini' : 'Terminer') : (isCreole ? 'Swivan' : 'Suivant')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Downward arrow toward the tab */}
          {hasTab && <View style={[styles.arrow, { borderTopColor: colors.surface, left: arrowLeft }]} />}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.72)' },
  skip: { position: 'absolute', right: 18, zIndex: 10 },
  skipText: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  spotlight: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  spotLabel: { fontSize: 10, fontWeight: '700', color: PRIMARY },
  tip: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
  },
  tipIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#eaf2fb',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  tipTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  tipBody: { fontSize: 14.5, lineHeight: 21, color: '#475569' },
  tipFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 16,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#e2e8f0' },
  dotActive: { width: 18, backgroundColor: PRIMARY },
  nextBtn: {
    backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
  },
  nextText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  arrow: {
    position: 'absolute', bottom: -9, width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#ffffff',
  },
});
