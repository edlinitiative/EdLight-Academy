#!/usr/bin/env node
/**
 * Seed the Mathématiques (Math) courses + videos into Firestore.
 * Mirrors scripts/seed-economics.mjs: thematic chapters (units) with lessons as
 * subchapters, video_url in youtube-nocookie.com/embed form (CSP-safe — see
 * seed-economics.mjs for why). Idempotent merge writes.
 *
 * Video IDs harvested from the EDLIGHT INITIATIVE channel after upload.
 * Titles/order from the "Mathematiques Videos" Google Doc.
 */
export const LEVELS = {
  ns1: {
    courseId: 'math-ns1', roman: 'NSI', label: 'Mathématiques NS1',
    description: "Cours complet de Mathématiques du Nouveau Secondaire 1 (NS1), enseigné en vidéo par EdLight. Vous y étudierez les nombres et le calcul (règles de calcul, puissances, fractions, proportionnalité), les applications et transformations du plan (applications affines et linéaires, symétrie, translation, rotation, homothéties, coordonnées de vecteurs), la géométrie des repères et du cercle, la trigonométrie (cercle trigonométrique, triangle rectangle) et la distance dans l'espace.",
    chapters: [
      { title: 'Nombres, Calcul et Proportionnalité', videos: [
        ['Règles de Calcul', '4IDBpPt0DMQ'],
        ["Puissance d'un Nombre", 'WYh0gGdcK5A'],
        ['Fractions et Nombres Fractionnaires (Partie 1)', 'qnhubhqhXWw'],
        ['Fractions et Nombres Fractionnaires (Partie 2)', '1RECQ788v4Q'],
        ['Proportionnalité', '21aACba4Mn8'],
      ]},
      { title: 'Applications et Vecteurs', videos: [
        ['Applications Affines', 'I40RDHMwH_Q'],
        ['Applications Linéaires', '9DFkRn1ha8w'],
        ['Symétrie, Translation et Rotation', 'OUYm1Iox5iw'],
        ['Coordonnées Vecteurs', 'AOSqnPS1XN0'],
      ]},
      { title: 'Homothéties', videos: [
        ['Homothéties', 'dQ0m5151QPc'],
        ['Homothéties Exercices', 'O7VPT4Gxupk'],
      ]},
      { title: 'Repères et Cercle', videos: [
        ['Repère et Projection', 'Cm5K2cUSZ5Q'],
        ['Repère Cartésien Dimension 3', 'DvHFTd0x8ng'],
        ['Cercle', 'f9gUorUqpmE'],
      ]},
      { title: 'Trigonométrie', videos: [
        ['Cercle Trigonométrique (Partie 1)', '_mX7_Qj0AW0'],
        ['Cercle Trigonométrique (Partie 2)', 'PiXxEMSbdv0'],
        ['Trigonométrie', 'eLmxna326QM'],
        ['Trigonométrie du Triangle Rectangle', 'CTq_Ovfe-cQ'],
      ]},
      { title: "Distance dans l'Espace", videos: [
        ['Distance Dimension 3', 'Azpzy1iFFNw'],
      ]},
    ],
  },
  ns2: {
    courseId: 'math-ns2', roman: 'NSII', label: 'Mathématiques NS2',
    description: "Cours complet de Mathématiques du Nouveau Secondaire 2 (NS2), enseigné en vidéo par EdLight. Au programme : la résolution d'équations et d'inéquations du second degré, l'étude des fonctions (fonctions et applications, fonctions polynomiales, composées et trigonométriques), les droites et les angles, ainsi que les formules et équations trigonométriques.",
    chapters: [
      { title: 'Équations et Inéquations', videos: [
        ["Résolution d'Équations et d'Inéquations du Second Degré", 'PW0DrdnMMuY'],
        ["Système d'Équations", 'Zi97HlCJEi8'],
        ["Système d'Équations à Trois Inconnus", '_9Siq5gyviM'],
        ["Relation d'Ordre dans R", 'UOoYFgAfIbA'],
        ['Valeur Absolue', 'ej5ztyQQnZ4'],
      ]},
      { title: 'Étude des Fonctions', videos: [
        ["Étude d'une Fonction (Partie 1)", 'bgWDLTQpFmU'],
        ['Fonctions et Applications (Partie 1)', '_CQfghkYPNA'],
        ['Fonctions et Applications (Partie 2)', 'L6ZboFcdxvo'],
        ['Fonctions Polynomiales et Extremums', 'qzlzP1TeyRU'],
        ['Fonctions Polynomiales : Exercices', '1mldy7OOKHY'],
        ['Fonctions Composées', 'Y6o_ma2iSWk'],
        ['Fonctions Trigonométriques', 'bT803bdvYkY'],
        ['Étude des Fonctions Trigonométriques', 'JiwhxpM2KU4'],
      ]},
      { title: 'Droites et Angles', videos: [
        ['Droites Parallèles et Perpendiculaires', 'GO6lvAwvJ4w'],
        ['Angles ou Arcs Associés (Partie 1)', 'lfeRLBMOW20'],
        ['Angles ou Arcs Associés (Partie 2)', '6TeqrMtKbDo'],
        ['Angles ou Arcs Associés (Partie 3)', 'XH5Cc0WXgxE'],
        ['Arcs Remarquables et Associés', 'bms0NxhaUDg'],
      ]},
      { title: 'Formules et Équations Trigonométriques', videos: [
        ["Formules d'Addition et de Soustraction", 'i3C_rmNaBic'],
        ['Identités Trigonométriques', 'GY_Vv7dvh0g'],
        ['Équations Trigonométriques', 'gB7ULFTzIBU'],
      ]},
    ],
  },
  ns3: {
    courseId: 'math-ns3', roman: 'NSIII', label: 'Mathématiques NS3',
    description: "Cours complet de Mathématiques du Nouveau Secondaire 3 (NS3), enseigné en vidéo par EdLight. Vous y aborderez les vecteurs et le produit scalaire dans l'espace, les inéquations et la bijection réciproque, les suites (arithmétiques, géométriques, récurrentes), la géométrie dans l'espace (sphère, distance, orthogonalité) et la statistique à une variable.",
    // NOTE: 22 of 24 uploaded. Pending (upload limit): "Vecteurs Dimension 3" (#21)
    // and "Position de l'Espace" (#23) — add to their chapters when uploaded.
    chapters: [
      { title: 'Vecteurs et Produit Scalaire', videos: [
        ['Produit de Vecteurs (Partie 1)', '1hNy43Qla1g'],
        ['Produit de Vecteurs (Partie 2)', 'BwTIulCJTgI'],
        ['Produit de Vecteurs (Partie 3)', 'SxPpT-L7KSQ'],
        ['Produit Scalaire de Dimension 3 (Partie 1)', 'TtsdEVQb33U'],
        ['Produit Scalaire de Dimension 3 (Partie 2)', 'd8zrnduv0Gc'],
      ]},
      { title: 'Inéquations et Bijection', videos: [
        ['Inéquation du Premier Degré', 'zE69XD4-ze8'],
        ['Inéquation à Deux Inconnus', 'AyDB5ugRhSg'],
        ['Interprétation Géométrique des Équations et Inéquations', 'mk38qI6G_bU'],
        ['Bijection Réciproque', 'UtNgdDDzwfY'],
      ]},
      { title: 'Les Suites', videos: [
        ['Suites (Partie 1)', 'LSnEnbM7Ryo'],
        ['Suites (Partie 2)', 'GJ3W0AKMH_g'],
        ['Suites Arithmétiques et Géométriques', '6WdTVzMOCFI'],
        ['Suites Majorées et Minorées', 'yZ5aoeO72TY'],
        ['Suites Récurrentes', 'TbuXpz0bCqM'],
        ['Suites Récurrentes et Méthodes Graphiques', 'VS8F72E6m8s'],
      ]},
      { title: "Géométrie dans l'Espace", videos: [
        ['Sphère et Plan', 'mn28Yjm4TVY'],
        ['Sphère et Boule', 'rLzEaf7vmiA'],
        ['Distance (Partie 1)', 'B44YHJW8_Fs'],
        ['Distance (Partie 2)', 'k3PgXLur2CU'],
        ['Orthogonalité et Parallélisme', 'wXx_Wonpuis'],
        ['Plan Médiateur', 'DLkqGgwDq_I'],
      ]},
      { title: 'Statistique', videos: [
        ['Statistique à une Variable', 'UREITHnolgo'],
      ]},
    ],
  },
  ns4: { courseId: 'math-ns4', roman: 'NSIV', label: 'Mathématiques NS4', description: 'Cours de Mathématiques NS4 — EdLight.', chapters: [] },
};

export function buildCourseAndVideos(level) {
  const L = LEVELS[level];
  if (!L) return null;
  const chapters = Array.isArray(L.chapters) && L.chapters.length ? L.chapters : [];
  if (!chapters.length) return null;
  const units = [];
  const videos = [];
  let totalLessons = 0;
  chapters.forEach((ch, ci) => {
    const unitNo = ci + 1;
    const unitId = `MATH-${L.roman}-U${unitNo}`;
    const lessons = ch.videos.map(([title], li) => ({
      lessonId: `${unitId}-L${li + 1}`, title, type: 'video', order: li + 1,
    }));
    units.push({ unitId, title: ch.title, order: unitNo, lessons });
    ch.videos.forEach(([title, ytId], li) => {
      videos.push({
        id: `${unitId}-L${li + 1}`,
        data: {
          video_title: title, subject_code: `MATH-${L.roman}`,
          unit_no: unitNo, unit_title: ch.title, lesson_no: li + 1,
          language: 'French', duration_min: 15,
          video_url: `https://www.youtube-nocookie.com/embed/${ytId}`,
          thumbnail_url: '',
          learning_objectives: `Leçon « ${title} » du cours de ${L.label} (EdLight) — chapitre : ${ch.title}.`,
          tags: 'mathematiques',
        },
      });
    });
    totalLessons += lessons.length;
  });
  const course = {
    name: L.label, display_name: L.label, description: L.description,
    number_of_units: units.length, number_of_lessons: totalLessons, length: totalLessons * 15,
    units,
  };
  return { courseId: L.courseId, course, videos };
}
