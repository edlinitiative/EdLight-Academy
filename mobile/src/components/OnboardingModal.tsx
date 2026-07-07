import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, Dimensions, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  GraduationCap, BookOpen, ClipboardList, Sparkles, Zap, ChevronRight,
} from 'lucide-react-native';
import useStore from '../contexts/store';

const { width: SCREEN_W } = Dimensions.get('window');
const PRIMARY = '#0857A6';

type Slide = {
  Icon: any;
  color: string;
  title: { fr: string; ht: string };
  body: { fr: string; ht: string };
};

// First-launch walkthrough: a quick tour of the four things the app does, plus
// the play/progress loop. Shown once (store.onboardingCompleted), after the
// language pick. Bilingual FR / Kreyòl.
const SLIDES: Slide[] = [
  {
    Icon: GraduationCap,
    color: '#0857A6',
    title: { fr: 'Bienvenue sur EdLight', ht: 'Byenveni sou EdLight' },
    body: {
      fr: 'Ta plateforme bilingue pour réussir le Bac — cours, examens et jeux, au même endroit.',
      ht: 'Platfòm bileng ou pou reyisi Bak la — kou, egzamen ak jwèt, nan menm kote a.',
    },
  },
  {
    Icon: BookOpen,
    color: '#0e7490',
    title: { fr: 'Cours en vidéo', ht: 'Kou an videyo' },
    body: {
      fr: 'Maths, Physique, Chimie et Économie — chapitre par chapitre, à ton rythme.',
      ht: 'Matematik, Fizik, Chimi ak Ekonomi — chapit pa chapit, sou vitès pa w.',
    },
  },
  {
    Icon: ClipboardList,
    color: '#b91c1c',
    title: { fr: 'Examens du Bac', ht: 'Egzamen Bak' },
    body: {
      fr: 'Entraîne-toi sur les vrais sujets officiels, avec correction et score.',
      ht: 'Antrene w sou vrè sijè ofisyèl yo, ak koreksyon ak nòt.',
    },
  },
  {
    Icon: Sparkles,
    color: '#7c3aed',
    title: { fr: 'Quiz & Flashcards', ht: 'Quiz & Flashcards' },
    body: {
      fr: "Teste tes connaissances et révise l'essentiel de chaque leçon.",
      ht: 'Teste konesans ou epi revize sa ki esansyèl nan chak leson.',
    },
  },
  {
    Icon: Zap,
    color: '#f59e0b',
    title: { fr: 'Joue et progresse', ht: 'Jwe epi pwogrese' },
    body: {
      fr: 'Gagne des XP au Trivia, garde ta série et grimpe au classement.',
      ht: 'Genyen XP nan Trivia, kenbe seri w epi monte nan klasman.',
    },
  },
];

export default function OnboardingModal() {
  const hydrated = useStore((s) => s.hydrated);
  const languageChosen = useStore((s) => s.languageChosen);
  const tourCompleted = useStore((s) => s.tourCompleted);
  const setTourCompleted = useStore((s) => s.setTourCompleted);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  // Only for a first-time user: after the language pick, before the app.
  const visible = hydrated && languageChosen && !tourCompleted;
  const isLast = index >= SLIDES.length - 1;

  const finish = () => setTourCompleted(true);
  const next = () => {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_W, animated: true });
  };
  const onScrollEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Skip */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skip}>{t('Passer', 'Sote')}</Text>
          </TouchableOpacity>
        </View>

        {/* Paged slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={{ flexGrow: 0 }}
        >
          {SLIDES.map((s, i) => {
            const Icon = s.Icon;
            return (
              <View key={i} style={[styles.slide, { width: SCREEN_W }]}>
                <View style={[styles.iconWrap, { backgroundColor: s.color + '15' }]}>
                  <Icon color={s.color} size={56} strokeWidth={1.8} />
                </View>
                <Text style={styles.title}>{isCreole ? s.title.ht : s.title.fr}</Text>
                <Text style={styles.body}>{isCreole ? s.body.ht : s.body.fr}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {/* CTA */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.85}>
            <Text style={styles.buttonText}>
              {isLast ? t('Commencer', 'Kòmanse') : t('Suivant', 'Swivan')}
            </Text>
            {!isLast && <ChevronRight color="#ffffff" size={18} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  skip: { fontSize: 15, fontWeight: '600', color: '#94a3b8' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconWrap: {
    width: 132, height: 132, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },
  title: {
    fontSize: 25, fontWeight: '800', color: '#0f172a',
    textAlign: 'center', letterSpacing: -0.4, marginBottom: 14,
  },
  body: { fontSize: 16, lineHeight: 24, color: '#64748b', textAlign: 'center', maxWidth: 320 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#e2e8f0' },
  dotActive: { width: 22, backgroundColor: PRIMARY },
  footer: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 4 },
  button: {
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
