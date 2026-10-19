/**
 * Mode Histoire — « Le tour d'Ayiti ».
 *
 * The Arène's single-player campaign: ten chapters, one per département, each
 * three stages and a boss. The student is their school's new recruit; crossing
 * the country earns the right to carry its flag to the national final. It is
 * a story wrapper around the trivia banks that already exist — no new
 * questions, so the campaign is exactly as accurate as the banks are.
 *
 * Facts in the copy are kept to what is not in dispute (each chef-lieu, the
 * Citadelle in the Nord, the 1804 proclamation in Gonaïves, Jacmel's carnival,
 * Jérémie's poets). Bosses are fictional characters, named as such.
 *
 * PURE: no React, no storage, no network. Both apps import it unchanged: the
 * web page (src/pages/arena/ArenaStory) and the phone screen
 * (mobile/src/screens/arena/ArenaStoryScreen) each persist progress on the
 * device, per account, under the same key shape.
 */

export type StageKind = 'stage' | 'boss';

export interface StoryStage {
  /** Trivia category ids drawn from (see src/data/triviaData). */
  themes: string[];
  count: number;
  timed: boolean;
  /** Minimum correct answers to clear it. */
  pass: number;
}

export interface StoryChapter {
  id: string;
  dept: string;
  capital: string;
  /** Map position on a 0–100 grid (x west→east, y north→south). */
  pos: { x: number; y: number };
  intro: { fr: string; ht: string };
  boss: { name: string; fr: string; ht: string };
  stages: StoryStage[]; // three regular stages
  bossStage: StoryStage;
}

const S = (themes: string[]): StoryStage => ({ themes, count: 6, timed: true, pass: 4 });
const B = (themes: string[]): StoryStage => ({ themes, count: 10, timed: true, pass: 7 });

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 'ouest', dept: 'Ouest', capital: 'Port-au-Prince', pos: { x: 52, y: 62 },
    intro: {
      fr: 'Ton école t’a choisi·e. Pour porter son drapeau à la finale, il faut traverser les dix départements. Tout commence ici, à Port-au-Prince.',
      ht: 'Lekòl ou chwazi w. Pou w pote drapo l nan final la, fòk ou travèse dis depatman yo. Tout bagay kòmanse isit la, Pòtoprens.',
    },
    boss: { name: 'Mèt Lakou', fr: 'Le gardien de la cour de récré. Il ne laisse passer que ceux qui calculent vite.', ht: 'Gadyen lakou rekreyasyon an. Li kite sèlman moun ki kalkile vit pase.' },
    stages: [S(['geo_haiti']), S(['maths_eclair']), S(['culture_haiti'])],
    bossStage: B(['geo_haiti', 'maths_eclair', 'culture_haiti']),
  },
  {
    id: 'sud-est', dept: 'Sud-Est', capital: 'Jacmel', pos: { x: 54, y: 78 },
    intro: { fr: 'Jacmel, ville du carnaval. Ici, on apprend en s’amusant — et on ne s’amuse pas sans réfléchir.', ht: 'Jakmèl, vil kanaval la. Isit la, nou aprann pandan n ap amize n — men nou pa amize n san n pa reflechi.' },
    boss: { name: 'Madan Mask', fr: 'Reine des masques du carnaval. Elle cache la bonne réponse derrière trois fausses.', ht: 'Rèn mask kanaval la. Li kache bon repons lan dèyè twa fo.' },
    stages: [S(['culture_haiti']), S(['proverbes_haiti']), S(['anglais_vocab'])],
    bossStage: B(['culture_haiti', 'proverbes_haiti', 'anglais_vocab']),
  },
  {
    id: 'sud', dept: 'Sud', capital: 'Les Cayes', pos: { x: 22, y: 76 },
    intro: { fr: 'Direction Les Cayes. La route est longue : garde ta série et ton calme.', ht: 'Nou pral Okay. Wout la long : kenbe seri ou ak kalm ou.' },
    boss: { name: 'Kapitèn Lanmè', fr: 'Une capitaine qui connaît toutes les mers — et tous les drapeaux.', ht: 'Yon kapitèn ki konnen tout lanmè — ak tout drapo.' },
    stages: [S(['flags']), S(['capitals']), S(['sciences'])],
    bossStage: B(['flags', 'capitals', 'sciences']),
  },
  {
    id: 'grand-anse', dept: 'Grand’Anse', capital: 'Jérémie', pos: { x: 8, y: 66 },
    intro: { fr: 'Jérémie, la ville des poètes. Les mots ont du poids ici.', ht: 'Jeremi, vil powèt yo. Mo yo gen pwa isit la.' },
    boss: { name: 'Powèt la', fr: 'Un poète qui répond en proverbes. Comprends-le pour passer.', ht: 'Yon powèt ki reponn an pwovèb. Konprann li pou w pase.' },
    stages: [S(['proverbes_haiti']), S(['personnalites_haiti']), S(['histoire_haiti'])],
    bossStage: B(['proverbes_haiti', 'personnalites_haiti', 'histoire_haiti']),
  },
  {
    id: 'nippes', dept: 'Nippes', capital: 'Miragoâne', pos: { x: 32, y: 66 },
    intro: { fr: 'Miragoâne, entre la mer et le lac. Mi-parcours : les sciences t’attendent.', ht: 'Miragwàn, ant lanmè ak lak la. Mwatye wout : syans yo ap tann ou.' },
    boss: { name: 'Doktè Labo', fr: 'Une chimiste qui n’oublie aucun symbole.', ht: 'Yon chimis ki pa janm bliye yon senbòl.' },
    stages: [S(['chimie_symboles']), S(['bio_corps']), S(['sciences'])],
    bossStage: B(['chimie_symboles', 'bio_corps', 'sciences']),
  },
  {
    id: 'centre', dept: 'Centre', capital: 'Hinche', pos: { x: 66, y: 40 },
    intro: { fr: 'Le Plateau central. Au cœur du pays, il faut connaître le pays.', ht: 'Platosantral. Nan kè peyi a, fòk ou konnen peyi a.' },
    boss: { name: 'Gadyen Plato a', fr: 'Il a parcouru chaque commune. Il te pose ses questions de géographie.', ht: 'Li pase nan chak komin. L ap poze w kesyon jewografi.' },
    stages: [S(['geo_haiti']), S(['symboles_haiti']), S(['sport_haiti'])],
    bossStage: B(['geo_haiti', 'symboles_haiti', 'sport_haiti']),
  },
  {
    id: 'artibonite', dept: 'Artibonite', capital: 'Gonaïves', pos: { x: 50, y: 34 },
    intro: { fr: 'Gonaïves, la Cité de l’Indépendance : c’est ici qu’elle fut proclamée, le 1er janvier 1804.', ht: 'Gonayiv, Vil Endepandans lan : se isit la yo te pwoklame l, 1ye janvye 1804.' },
    boss: { name: 'Sekretè 1804', fr: 'Le gardien de l’Acte. Il ne pardonne aucune date.', ht: 'Gadyen Ak la. Li pa padone okenn dat.' },
    stages: [S(['histoire_haiti']), S(['personnalites_haiti']), S(['symboles_haiti'])],
    bossStage: B(['histoire_haiti', 'personnalites_haiti', 'symboles_haiti']),
  },
  {
    id: 'nord-ouest', dept: 'Nord-Ouest', capital: 'Port-de-Paix', pos: { x: 30, y: 14 },
    intro: { fr: 'Port-de-Paix, face à la Tortue. Le monde est juste en face — connais-le.', ht: 'Pòdepè, anfas Latòti. Mond lan la anfas — konnen l.' },
    boss: { name: 'Navigatè a', fr: 'Il a vu toutes les capitales. Toi ?', ht: 'Li wè tout kapital yo. E ou menm ?' },
    stages: [S(['capitals']), S(['currencies']), S(['anglais_vocab'])],
    bossStage: B(['capitals', 'currencies', 'anglais_vocab']),
  },
  {
    id: 'nord-est', dept: 'Nord-Est', capital: 'Fort-Liberté', pos: { x: 82, y: 20 },
    intro: { fr: 'Fort-Liberté. Plus qu’un chapitre avant la Citadelle.', ht: 'Fòlibète. Yon sèl chapit ki rete anvan Sitadèl la.' },
    boss: { name: 'Kòmandan Fò a', fr: 'Il garde la baie. Il mélange calcul et sciences.', ht: 'Li veye bè a. Li melanje kalkil ak syans.' },
    stages: [S(['maths_eclair']), S(['bio_corps']), S(['chimie_symboles'])],
    bossStage: B(['maths_eclair', 'bio_corps', 'chimie_symboles']),
  },
  {
    id: 'nord', dept: 'Nord', capital: 'Cap-Haïtien', pos: { x: 62, y: 14 },
    intro: { fr: 'Le Cap et la Citadelle. Dernier chapitre : tout ce que tu as appris, en même temps.', ht: 'Okap ak Sitadèl la. Dènye chapit : tout sa w aprann, an menm tan.' },
    boss: { name: 'Gadyen Sitadèl la', fr: 'Le boss final. Toutes les matières, aucun répit.', ht: 'Dènye bòs la. Tout matyè, san repo.' },
    stages: [S(['histoire_haiti', 'geo_haiti']), S(['maths_eclair', 'sciences']), S(['culture_haiti', 'proverbes_haiti'])],
    bossStage: { themes: ['histoire_haiti', 'geo_haiti', 'maths_eclair', 'sciences', 'culture_haiti', 'chimie_symboles'], count: 12, timed: true, pass: 9 },
  },
];

/** stars[chapterId] = [s1, s2, s3, boss], each 0–3 (0 = not cleared). */
export type StoryProgress = Record<string, number[]>;

export const STAGES_PER_CHAPTER = 4; // 3 + boss

export function starsFor(score: number, stage: StoryStage): number {
  if (score < stage.pass) return 0;
  if (score >= stage.count) return 3;
  const ratio = score / stage.count;
  return ratio >= 0.85 ? 2 : 1;
}

function row(progress: StoryProgress, chapterId: string): number[] {
  const r = progress?.[chapterId];
  return Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => Math.max(0, Math.min(3, Number(r?.[i]) || 0)));
}

export function chapterCleared(progress: StoryProgress, chapterIdx: number): boolean {
  const ch = STORY_CHAPTERS[chapterIdx];
  return !!ch && row(progress, ch.id)[STAGES_PER_CHAPTER - 1] > 0;
}

/** A stage opens when the one before it (or the previous chapter's boss) is cleared. */
export function isUnlocked(progress: StoryProgress, chapterIdx: number, stageIdx: number): boolean {
  if (chapterIdx < 0 || chapterIdx >= STORY_CHAPTERS.length) return false;
  if (stageIdx < 0 || stageIdx >= STAGES_PER_CHAPTER) return false;
  if (stageIdx === 0) return chapterIdx === 0 || chapterCleared(progress, chapterIdx - 1);
  return row(progress, STORY_CHAPTERS[chapterIdx].id)[stageIdx - 1] > 0;
}

/** Best-of: replaying a stage never lowers its stars. */
export function recordStage(progress: StoryProgress, chapterIdx: number, stageIdx: number, stars: number): StoryProgress {
  const ch = STORY_CHAPTERS[chapterIdx];
  if (!ch || !isUnlocked(progress, chapterIdx, stageIdx)) return progress;
  const r = row(progress, ch.id);
  r[stageIdx] = Math.max(r[stageIdx], Math.max(0, Math.min(3, stars)));
  return { ...progress, [ch.id]: r };
}

export function totalStars(progress: StoryProgress): number {
  return STORY_CHAPTERS.reduce((n, ch) => n + row(progress, ch.id).reduce((a, b) => a + b, 0), 0);
}

export const MAX_STARS = STORY_CHAPTERS.length * STAGES_PER_CHAPTER * 3;

/** Where "Continuer" goes: the first unlocked, uncleared stage; null when the campaign is done. */
export function nextStage(progress: StoryProgress): { chapter: number; stage: number } | null {
  for (let c = 0; c < STORY_CHAPTERS.length; c += 1) {
    const r = row(progress, STORY_CHAPTERS[c].id);
    for (let s = 0; s < STAGES_PER_CHAPTER; s += 1) {
      if (r[s] === 0) return isUnlocked(progress, c, s) ? { chapter: c, stage: s } : null;
    }
  }
  return null;
}

/** Defensive parse of whatever storage held. */
export function parseProgress(raw: unknown): StoryProgress {
  if (!raw || typeof raw !== 'object') return {};
  const out: StoryProgress = {};
  for (const ch of STORY_CHAPTERS) {
    const r = (raw as any)[ch.id];
    if (Array.isArray(r)) out[ch.id] = row({ [ch.id]: r }, ch.id);
  }
  return out;
}

/** One question of a stage draw: which bank, and the index in that bank. */
export interface StoryPick {
  theme: string;
  idx: number;
}

/**
 * A stage's round: `stage.count` questions spread evenly over its themes
 * (ceil(count / themes) from each, never repeating an index), shuffled.
 * The web draws through its rotation bag instead; the phone uses this. A
 * theme missing from `banks` contributes nothing — the round is then shorter,
 * never padded with another theme's questions.
 */
export function storyDraw(
  stage: StoryStage,
  banks: Record<string, readonly unknown[] | undefined>,
  rand: () => number = Math.random,
): StoryPick[] {
  const per = Math.ceil(stage.count / Math.max(1, stage.themes.length));
  const shuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const pool: StoryPick[] = [];
  for (const theme of stage.themes) {
    const n = banks[theme]?.length || 0;
    const idxs = shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, per);
    for (const idx of idxs) pool.push({ theme, idx });
  }
  return shuffle(pool).slice(0, stage.count);
}

/** The first open stage of a chapter without stars — what its big button plays. */
export function chapterGoStage(progress: StoryProgress, chapterIdx: number): number | null {
  const ch = STORY_CHAPTERS[chapterIdx];
  if (!ch) return null;
  const r = row(progress, ch.id);
  for (let i = 0; i < STAGES_PER_CHAPTER; i += 1) if (isUnlocked(progress, chapterIdx, i) && !r[i]) return i;
  return null;
}

/** Stars per stage of one chapter (always four entries, each 0–3). */
export function chapterRow(progress: StoryProgress, chapterIdx: number): number[] {
  const ch = STORY_CHAPTERS[chapterIdx];
  return ch ? row(progress, ch.id) : [0, 0, 0, 0];
}

export function stageOf(chapterIdx: number, stageIdx: number): StoryStage | null {
  const ch = STORY_CHAPTERS[chapterIdx];
  if (!ch) return null;
  return stageIdx === STAGES_PER_CHAPTER - 1 ? ch.bossStage : ch.stages[stageIdx] || null;
}
