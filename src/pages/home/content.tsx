import React from 'react';
import { BookOpen, Target, PenLine, BarChart3 } from 'lucide-react';
import useStore from '../../contexts/store';

/** Bilingual translate helper: pick Haitian Creole when active, else French. */
export type TFn = (fr: string, ht: string) => string;

/** Hook exposing the bilingual `t` helper bound to the current language. */
export function useT(): TFn {
  const { language } = useStore();
  const isCreole = language === 'ht';
  return React.useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
}

/** Subject thumbnail assets keyed by subject code. */
export const subjectThumbs: Record<string, string> = {
  PHYS: '/assets/physics-thumb.png',
  CHEM: '/assets/chemistry-thumb.jpg',
  MATH: '/assets/math-thumb.png',
  ECON: '/assets/economy-thumb.png',
};

export interface FeaturedCourse {
  id: string;
  name: string;
  desc: string;
  subject: keyof typeof subjectThumbs | string;
  level: string;
  lessons: number;
}

export interface Pillar {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export const getFeatured = (t: TFn): FeaturedCourse[] => [
  { id: 'phys-ns1', name: t('Physique NS I', 'Fizik NS I'), desc: t('Mécanique · Forces · Énergie', 'Mekanik · Fòs · Enèji'), subject: 'PHYS', level: 'NS I', lessons: 24 },
  { id: 'math-ns1', name: t('Mathématiques NS I', 'Matematik NS I'), desc: t('Algèbre · Fonctions · Équations', 'Aljèb · Fonksyon · Ekwasyon'), subject: 'MATH', level: 'NS I', lessons: 30 },
  { id: 'chem-ns1', name: t('Chimie NS I', 'Chimi NS I'), desc: t('Atomes · Molécules · Réactions', 'Atòm · Molekil · Reyaksyon'), subject: 'CHEM', level: 'NS I', lessons: 20 },
  { id: 'econ-ns1', name: t('Économie NS I', 'Ekonomi NS I'), desc: t('Marché · Demande · PIB', 'Mache · Demann · PIB'), subject: 'ECON', level: 'NS I', lessons: 18 },
];

export const getPillars = (t: TFn): Pillar[] => [
  { eyebrow: '01', icon: <BookOpen size={22} strokeWidth={1.8} />, title: t('Cours structurés', 'Kou estriktire'), desc: t('Une progression claire du NS I au NS IV, alignée sur les programmes officiels.', 'Yon pwogresyon klè soti NS I rive NS IV, daprè pwogram ofisyèl yo.') },
  { eyebrow: '02', icon: <Target size={22} strokeWidth={1.8} />, title: t('Quiz adaptatifs', 'Quiz adaptatif'), desc: t('Des questions ciblées qui s’ajustent à votre niveau et renforcent vos lacunes.', 'Kesyon ki ajiste ak nivo ou epi ranfòse pwen fèb yo.') },
  { eyebrow: '03', icon: <PenLine size={22} strokeWidth={1.8} />, title: t('Examens blancs', 'Egzamen blan'), desc: t('Simulez le Bac dans des conditions réelles, avec correction détaillée.', 'Simile Bak la nan kondisyon reyèl ak koreksyon detaye.') },
  { eyebrow: '04', icon: <BarChart3 size={22} strokeWidth={1.8} />, title: t('Suivi premium', 'Swivi premye klas'), desc: t('Tableaux de bord, streaks et plans d’étude personnalisés.', 'Tablo de bò, seri jou ak plan etid pèsonalize.') },
];

export const getStats = (t: TFn): Stat[] => [
  { value: '4 000+', label: t('élèves accompagnés', 'elèv ki akonpaye') },
  { value: '600+', label: t('leçons vidéo', 'leson videyo') },
  { value: '120+', label: t('examens disponibles', 'egzamen ki disponib') },
  { value: '96%', label: t('de satisfaction', 'satisfaksyon') },
];

export const getTestimonials = (t: TFn): Testimonial[] => [
  { quote: t('« EdLight a transformé ma préparation au Bac. Les corrections détaillées ont fait toute la différence. »', '« EdLight chanje preparasyon Bak mwen. Koreksyon detaye yo fè yon gwo diferans. »'), name: 'Carline J.', role: t('Élève NS IV, Port-au-Prince', 'Elèv NS IV, Pòtoprens') },
  { quote: t('« Les quiz interactifs rendent l’apprentissage addictif. Je viens chaque jour. »', '« Quiz entèaktif yo rann aprantisaj la trè enteresan. Mwen vini chak jou. »'), name: 'Jean P.', role: t('Élève NS III, Cap-Haïtien', 'Elèv NS III, Okap') },
  { quote: t('« Une plateforme moderne, pensée pour les élèves haïtiens. Enfin ! »', '« Yon platfòm modèn, panse pou elèv ayisyen. Anfen ! »'), name: 'Mme Pierre', role: t('Enseignante, Les Cayes', 'Pwofesè, Okay') },
];

/** Inline arrow glyph reused across hero CTA and section links. */
export function ArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
