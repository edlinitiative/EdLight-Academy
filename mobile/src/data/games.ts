/**
 * Games registry — the arcade hub's catalog (ported from the web app,
 * src/data/games.ts). Every game is bilingual (FR/HT), reuses existing
 * content (trivia bank) or generates its own (mental math, sequences), and
 * reports a score/maxScore pair to the shared XP engine in
 * triviaService.recordGameResult.
 */

import {
  Lightbulb,
  Scale,
  Layers,
  Keyboard,
  Calculator,
  TrendingUp,
  LucideIcon,
} from 'lucide-react-native';

export const GAME_ICONS: Record<string, LucideIcon> = {
  trivia: Lightbulb,
  'vrai-faux': Scale,
  memoire: Layers,
  'mo-kache': Keyboard,
  calcul: Calculator,
  suites: TrendingUp,
};

export interface GameDef {
  id: string;
  name: string;
  nameHt: string;
  description: string;
  descriptionHt: string;
  color: string;
  minutes: number;
}

export const GAMES: GameDef[] = [
  {
    id: 'trivia',
    name: 'Trivia',
    nameHt: 'Trivia',
    description: 'Questions à choix multiples sur 15 catégories du programme.',
    descriptionHt: 'Kesyon chwa miltip sou 15 kategori pwogram nan.',
    color: '#1B6FE0',
    minutes: 5,
  },
  {
    id: 'vrai-faux',
    name: 'Vrai ou Faux',
    nameHt: 'Vre oswa Fo',
    description: 'Une affirmation, 60 secondes — décidez vite si elle est vraie !',
    descriptionHt: 'Yon afimasyon, 60 segonn — deside vit si li vre !',
    color: '#e0532f',
    minutes: 2,
  },
  {
    id: 'memoire',
    name: 'Mémoire',
    nameHt: 'Memwa',
    description: 'Retrouvez les paires question-réponse en un minimum de coups.',
    descriptionHt: 'Jwenn pè kesyon-repons yo ak mwens mouvman posib.',
    color: '#7c3aed',
    minutes: 3,
  },
  {
    id: 'mo-kache',
    name: 'Mo Kaché',
    nameHt: 'Mo Kache',
    description: 'Devinez le mot du jour en 6 essais — un nouveau mot chaque jour !',
    descriptionHt: 'Devine mo jou a nan 6 esè — yon nouvo mo chak jou !',
    color: '#059669',
    minutes: 3,
  },
  {
    id: 'calcul',
    name: 'Calcul éclair',
    nameHt: 'Kalkil Rapid',
    description: "Résolvez un maximum d'opérations en 60 secondes chrono.",
    descriptionHt: 'Rezoud maksimòm operasyon nan 60 segonn.',
    color: '#d97706',
    minutes: 2,
  },
  {
    id: 'suites',
    name: 'Suites logiques',
    nameHt: 'Sekans Lojik',
    description: 'Trouvez le nombre qui continue la suite. 10 défis progressifs.',
    descriptionHt: 'Jwenn nimewo ki kontinye sekans lan. 10 defi pwogresif.',
    color: '#0e7490',
    minutes: 4,
  },
];

export function getGameById(id: string): GameDef | null {
  return GAMES.find((g) => g.id === id) || null;
}
