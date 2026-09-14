#!/usr/bin/env node
/**
 * Seed the Chimie (Chemistry) courses + videos into Firestore.
 * Same pattern as seed-math.mjs: thematic chapters (units) with lessons as
 * subchapters, youtube-nocookie.com/embed URLs (CSP-safe). Idempotent merge.
 *
 * NS1 video IDs harvested from the "La Chimie - NSI" YouTube playlist
 * (PLD8IqnfQOT4W3GybnsqTpdoYnWlMDvci7), in playlist order.
 */
export const LEVELS = {
  ns1: {
    courseId: 'chem-ns1', roman: 'NSI', label: 'Chimie NS1',
    description: "Cours de Chimie du Nouveau Secondaire 1 (NS1), enseigné en vidéo par EdLight. Vous y étudierez les grandeurs et mesures (masse, volume, mole, masse volumique, densité, pression), la structure de l'atome et le tableau périodique, ainsi que les molécules, la nomenclature et les réactions chimiques.",
    chapters: [
      { title: 'Grandeurs et Mesures', videos: [
        ['Masse et Poids', 'SHDKD0JbYM8'],
        ['Volume et Mole (Quantité de matière)', 'vF1FWumqYaE'],
        ['Masse Volumique et Molaire', '6oKYUnJMdOw'],
        ['Densité, Température, Pression', 'v00Te_YA0t8'],
        ['Pression et Gaz (Exercices)', '3fRsbT8g6Os'],
        ['Différentes Expressions de la Pression', '30mCdT37Cjk'],
        ['Exercices Significatifs', 'FNrikFcFAMg'],
      ]},
      { title: "L'Atome", videos: [
        ["L'Atome (Partie 1)", 'zRagWxcWpJM'],
        ["L'Atome (Partie 2)", 'Q0HCvtmlSiI'],
        ['Les Unités de Base', 'P5xoNvOUWbs'],
        ['Masse Atomique', 'uOHlOxRGD8I'],
      ]},
      { title: 'Mesures et Grandeurs Physiques', videos: [
        ['Introduction à la Chimie : Mesures', 'ucYteKGDm2k'],
        ['Volume et Masse', '9Cbr0NuDSEI'],
        ['Grandeurs Physiques : Masse Volumique et Molaire', 'Xe0jGLMZoXg'],
        ['Grandeurs Physiques : Densité, Température et Pression', 'zTg8bwq5Sm0'],
        ['Unité de Pression (Pascal)', 'ou_bK_Wjmvg'],
        ["Pression d'un Gaz et Exercices", 'nto19MersP8'],
        ['Densité : Preuve et Exercices', 'MYVNbhSsbfg'],
      ]},
      { title: 'Structure Atomique et Tableau Périodique', videos: [
        ['Matière et Atome', 'risxMf3moCo'],
        ['Électrons et Représentation Symbolique', 'hyu1-Ni5Re0'],
        ['Tableau Périodique : Électrons et Protons', 'nJ8geRJ_whY'],
        ['Nombre Atomique : Exercices', 'P7mgnA4Kgtw'],
        ["Calculer la Charge d'un Atome", 'v34EQYSplKI'],
        ["Structure Électronique d'un Atome", 'FoILoav0CX0'],
        ["Règle de l'Octet (Duet)", 'FMKX3ntvX5w'],
        ['Ionisation', 'xLmpDTFfCmU'],
        ['Symbole des Atomes', 'Dmcef18KO1k'],
      ]},
      { title: 'Molécules, Nomenclature et Réactions Chimiques', videos: [
        ['Molécules et Atomes', 'a68wHp6E8bc'],
        ['Nomenclature : Composés Binaires', 'SbLMxOuo_n4'],
        ['Nomenclature des Halogènes et Sulfures', 'zMkPWjapoj4'],
        ['Mole : Quantité de Matière', '1MvFGSiILgs'],
        ['Les Réactions Chimiques', 'SCqSMxGGlrE'],
        ['Les Réactions Chimiques : Équations', 'rIlShYAmkVA'],
      ]},
    ],
  },
};

export function buildCourseAndVideos(level) {
  const L = LEVELS[level];
  if (!L || !Array.isArray(L.chapters) || !L.chapters.length) return null;
  const units = [], videos = [];
  let total = 0;
  L.chapters.forEach((ch, ci) => {
    const unitNo = ci + 1;
    const unitId = `CHEM-${L.roman}-U${unitNo}`;
    const lessons = ch.videos.map(([title], li) => ({
      lessonId: `${unitId}-L${li + 1}`, title, type: 'video', order: li + 1,
    }));
    units.push({ unitId, title: ch.title, order: unitNo, lessons });
    ch.videos.forEach(([title, ytId], li) => {
      videos.push({
        id: `${unitId}-L${li + 1}`,
        data: {
          video_title: title, subject_code: `CHEM-${L.roman}`,
          unit_no: unitNo, unit_title: ch.title, lesson_no: li + 1,
          language: 'French', duration_min: 15,
          video_url: `https://www.youtube-nocookie.com/embed/${ytId}`,
          thumbnail_url: '',
          learning_objectives: `Leçon « ${title} » du cours de ${L.label} (EdLight) — chapitre : ${ch.title}.`,
          tags: 'chimie',
        },
      });
    });
    total += lessons.length;
  });
  const course = {
    name: L.label, display_name: L.label, description: L.description,
    number_of_units: units.length, number_of_lessons: total, length: total * 15,
    units,
  };
  return { courseId: L.courseId, course, videos };
}
