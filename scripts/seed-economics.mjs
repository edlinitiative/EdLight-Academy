#!/usr/bin/env node
/**
 * Seed the Economics (Économie) courses + videos into Firestore.
 *
 * WHAT IT DOES
 *   For each level (NS1/NS3/NS4 — NS2 pending IDs) it writes:
 *     - one `courses/{econ-nsX}` doc with a single unit whose lessons are the
 *       videos in doc order (structure = "one lesson per video", French titles);
 *     - one `videos/{lessonId}` doc per video, with video_url set to the
 *       YouTube watch URL so CourseDetail.tsx / YouTubePlayer.tsx render it.
 *   Uses setDoc(..., {merge:true}) so re-running is safe/idempotent.
 *
 *   NS1 (econ-ns1) ALREADY EXISTS with a different 11-lesson outline; running
 *   NS1 REPLACES its `units` with the 18-video structure (approved). NS3/NS4
 *   courses don't exist yet, so seeding them is purely additive.
 *   Recommended rollout: run NS3+NS4 first (additive), verify on the site, then NS1.
 *
 * REQUIREMENTS (nothing secret is committed — you supply these at runtime):
 *   Firebase web config (same values as window.EDLIGHT_FIREBASE_CONFIG on the site)
 *   and an ADMIN account's email/password, via env vars:
 *     FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *     FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID,
 *     EDLIGHT_ADMIN_EMAIL, EDLIGHT_ADMIN_PASSWORD
 *
 * USAGE
 *   npm i firebase   # if not already installed
 *   FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... EDLIGHT_ADMIN_EMAIL=... \
 *   EDLIGHT_ADMIN_PASSWORD=... node scripts/seed-economics.mjs --levels ns3,ns4 --dry-run
 *   # drop --dry-run to write; --levels defaults to ns1,ns3,ns4
 *
 * NOTE: written but NOT executed/tested here (no Firebase credentials in this
 * environment). Review the data below before running against production.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// ── Video data (title in doc order → YouTube ID). Source: docs/youtube-migration/ALL-VIDEO-IDS.md
export const LEVELS = {
  ns1: {
    courseId: 'econ-ns1', roman: 'NSI', label: 'Économie NS1',
    description: "Cours d'Économie NS1 (Nouveau Secondaire 1) — EdLight.",
    chapters: [
      { title: 'Notions Fondamentales', videos: [
        ['Notion de Demande', 'BAHyx_5dqyI'],
        ["Notion d'Offre", 's8V74XR5BcY'],
        ['Notion de Budget', 'HNOuKpOp1AE'],
        ["Notion d'Équilibre", '9288p-uq3bQ'],
        ['Notion de Biens', 'nSjSOnL-BGA'],
        ['Notion de Besoins', 'lg7iHRvNBvM'],
        ["Notion d'Élasticité", 'Ru6mK7Bwf7o'],
        ['Chômage', 'oO9lz70LmMg'],
      ]},
      { title: "L'Intérêt Simple", videos: [
        ['Intérêt Simple', '2GFAwLHfCU4'],
        ['Intérêt Simple : Exercices 1', 'YhvDoP6lXv4'],
        ['Intérêt Simple : Exercices 2', 'Uclw0D-6QlQ'],
      ]},
      { title: "Fondements et Investissement", videos: [
        ["Fondements de l'Économie", 'XQdsqomjkOc'],
        ['Investissement', 'InrXiIA0-qU'],
        ["Formes d'Investissement", '1KzRkUq-Dl4'],
      ]},
      { title: 'Macroéconomie et Économie Internationale', videos: [
        ['Indicateurs Macroéconomiques', '5j7CHytEjg8'],
        ['Économie Internationale', '8u9FMK8e7kg'],
        ['Actes Économiques', 'sX7zA3nKt6o'],
        ['Avantage Absolu', '2QFZutgiakE'],
      ]},
    ],
  },
  ns2: {
    courseId: 'econ-ns2', roman: 'NSII', label: 'Économie NS2',
    description: "Cours d'Économie NS2 (Nouveau Secondaire 2) — EdLight.",
    // Harvested from the Economie-NS2 playlist (cleaned/reordered to doc order) 2026-07-06.
    chapters: [
      { title: 'Consommation et Épargne', videos: [
        ['Propension à Épargner', 'ew24do9vKf8'],
        ['Relation entre Épargne et Investissement', '3WBlKZgga9w'],
        ['Consommation et Épargne', 'xmLTel0GA38'],
        ['La Fonction de Consommation', 'gav4rdZAnqw'],
        ["Représentation Graphique de l'Épargne", 'gzgCO2y7WyQ'],
        ['Représentation Graphique de la Fonction de Consommation', 'pONbpl-iSzw'],
        ['Les Trois Équilibres', 'BePNgqPtwl0'],
      ]},
      { title: "L'Entreprise", videos: [
        ["Notion d'Entreprise", 'wj9zF60kr7Q'],
        ["Formes d'Entreprise", 'Qvq4366TYxk'],
        ["Types d'Entreprises", 'rpGV9-tT-O8'],
        ['Société par Actions', 'atLhkGa8VKA'],
        ['Avantages Accordés par les Entreprises', 'RACmBN6O-2k'],
        ["Formes d'Intégration", '7Ajmf9jnYIs'],
      ]},
      { title: "Frontière des Possibilités et Méthodes", videos: [
        ['Frontière des Possibilités', 'q2-ciauzO5E'],
        ["Méthodes de l'Économie", 'dwO_0MXDimg'],
      ]},
      { title: 'La Monnaie et le Système Bancaire', videos: [
        ['La Monnaie', '7Y9lGPpmQq0'],
        ['Offre de Monnaie', 'yOf4LEJ6XkA'],
        ['Fonctions de la Monnaie', 'orSiA_0YbiI'],
        ['Motif de Détention de la Monnaie', 'dCdsDtgZlEc'],
        ['Masse Monétaire Partie 1', 'kaIF9vzIkGM'],
        ['Masse Monétaire Partie 2', 'XruWjh-STHk'],
        ['Système Bancaire', '3VZ4JMClLTY'],
        ['Instruments de la Politique Monétaire', 'K8l7SAjK6rg'],
      ]},
      { title: 'Politiques Budgétaire et Fiscale', videos: [
        ['Politique Fiscale', 'yVTfy9wY7Eg'],
        ['Budget et Politique Budgétaire', 'MiqI6WgsAs4'],
      ]},
      { title: 'Production, Demande et Offre', videos: [
        ['Chômage Volontaire et Involontaire', 'E9r3YBArpfg'],
        ['Circuit Économique', 'zy68zhmLVS0'],
        ['Équilibre de Production et de Prix QA et DA', '18akutlFr-s'],
        ['Facteurs Affectant la Demande', '3urtcnCIhTk'],
        ['Notion de Demande', '2b8ipdVhXfY'],
        ["Notion de l'Offre", 'I9V-oz492dY'],
      ]},
      { title: 'Croissance et Indicateurs Économiques', videos: [
        ['Obstacles à la Croissance Économique', 'mcOU4qWdCUs'],
        ['PIB Nominal et Réel', 'aDJZWqdDJCo'],
        ['PMS en Fonction du PIB Réel', '2EYev6UQShk'],
        ['Prix Plafond et Prix Plancher', 'ZQ2CdhN7lgg'],
        ['La Dette', 'khQKjuH0giU'],
        ['Développement', 'CKBsBt1MlI4'],
      ]},
      { title: 'Économie Rurale et Internationale', videos: [
        ['Économie Rurale', '1oinZ_7ezoQ'],
        ['Économie Internationale Partie 1', 'I3J0FvtXp0M'],
        ['Économie Internationale Partie 2', '7vC6MoIGwr4'],
        ['Économie Internationale Partie 3', 'GjYomfSclRM'],
        ['MERCOSUR', 'yYjoNiyHEgQ'],
      ]},
    ],
  },
  ns3: {
    courseId: 'econ-ns3', roman: 'NSIII', label: 'Économie NS3',
    description: "Cours d'Économie NS3 (Nouveau Secondaire 3) — EdLight.",
    chapters: [
      { title: 'Outils Mathématiques', videos: [
        ['Notion de Base en Math', 'U8Ndprsy8gU'],
        ['Inéquation', '9D-G9Lp1nDk'],
        ['Fonction Polynomiale', 'Qidzeo_KusQ'],
        ["Représentation Graphique d'une Pente", 'Mh4Q7nft8RU'],
        ['Représentation Graphique de Polynôme du Second Degré', 're3ePbmEbZ4'],
        ["Système d'Équations", 'jAWajjcOjVY'],
      ]},
      { title: 'La Demande', videos: [
        ['Fonction de la Demande', '2YO8TklPcQk'],
        ['Déplacement de la Courbe de Demande', 'AqIcMfBkjzA'],
        ['Courbe de la Demande Agrégée', 'c_NLf-ghwpk'],
        ['Déplacement de la Demande Agrégée', 'jQPKaAG-CGg'],
        ['Demande Agrégée des Acteurs Économiques', '3LrgjDcjMr4'],
      ]},
      { title: "L'Offre Agrégée et la Courbe de Laffer", videos: [
        ['Offre Agrégée', '7CoBZ5MFN6E'],
        ["Déplacement de l'Offre Agrégée", 'gEc5tfmnYas'],
        ['Courbe de Laffer', 'NSqABCxs7l8'],
      ]},
      { title: "La Théorie de l'Utilité", videos: [
        ['Utilité Totale et Marginale', 'kIj3dkw4T7g'],
        ["Fonction d'Utilité", 'MdB4DBpKCMM'],
        ["Maximisation de la Fonction d'Utilité", 'tRzQ0h--Hds'],
        ["Maximisation d'Utilité", 'p426PKT0qUQ'],
      ]},
      { title: 'Projet et Planification', videos: [
        ['Notion de Projet', 'Fg-9zDyfJRQ'],
        ['La Planification', '_hGewmaRrhA'],
      ]},
      { title: 'Notions Complémentaires', videos: [
        ['Taux Marginal de Substitution', 't6xDuk6G05k'],
        ['Élasticité', 'fQjfPyOYK48'],
        ['Profit', '-doTXLOHpBY'],
      ]},
    ],
  },
  ns4: {
    courseId: 'econ-ns4', roman: 'NSIV', label: 'Économie NS4',
    description: "Cours d'Économie NS4 (Nouveau Secondaire 4) — EdLight.",
    // Subdivided into thematic chapters (units) with lessons as subchapters,
    // preserving the canonical teaching order within each chapter.
    chapters: [
      { title: 'Le Mercantilisme', videos: [
        ['Le Mercantilisme', 'pS4tQwm7jmg'],
        ['Le Mercantilisme (Partie 2)', '7ntWvvypBZE'],
        ['Mercantilisme Français', 'Gp6dMriKzs4'],
        ['Mercantilisme Anglais', 'wF1--v1lrYQ'],
        ['Mercantilisme Espagnol', 'y9JCJ6QhtrQ'],
      ]},
      { title: 'Le Produit Intérieur Brut (PIB)', videos: [
        ['Produit Intérieur Brut (PIB)', 'bh8l5kXnXkU'],
        ['PIB (Exercices)', 'id9_D_f-kqI'],
      ]},
      { title: 'Écoles et Théories Économiques', videos: [
        ['Les Nouvelles Économies Classiques', 'DgQLO2je2nA'],
        ['Théorie Quantitative de la Monnaie', '_IIg22sux_k'],
        ['Marxisme et Caractéristiques', 'JnTwk41ofPM'],
        ['Le Monétarisme', 'X0qdKiI6Hks'],
        ['Théorie Classique', '8x1KhTPWffk'],
        ['Théorie Keynésienne', 'lEpkylojNHw'],
        ['Théories Traditionnelles', 'Q31u4-HyoYc'],
      ]},
      { title: 'Les Structures de Marché', videos: [
        ['Structure de Marché', 'MSZEx0CDO7E'],
        ['Marché de Concurrence Pure et Parfaite', 'u0H-mexyiA0'],
        ['Cartel et Trust', 'yrPGANAryy4'],
      ]},
      { title: 'La Croissance Économique', videos: [
        ['Croissance Économique', 'd8uqpAqLWmQ'],
      ]},
    ],
  },
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const levelsArg = (() => {
  const i = args.indexOf('--levels');
  return i >= 0 && args[i + 1] ? args[i + 1].split(',').map(s => s.trim().toLowerCase()) : ['ns1', 'ns3', 'ns4'];
})();

const cfg = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

export function buildCourseAndVideos(level) {
  const L = LEVELS[level];
  if (!L) return null;
  // A level is either subdivided into `chapters` (each a unit with its own
  // videos) or a flat `videos` list (treated as one chapter titled `L.label`).
  const chapters = Array.isArray(L.chapters) && L.chapters.length
    ? L.chapters
    : (Array.isArray(L.videos) && L.videos.length ? [{ title: L.label, videos: L.videos }] : []);
  if (!chapters.length) return null;

  const units = [];
  const videos = [];
  let totalLessons = 0;

  chapters.forEach((ch, ci) => {
    const unitNo = ci + 1;
    const unitId = `ECON-${L.roman}-U${unitNo}`;
    const lessons = ch.videos.map(([title], li) => ({
      lessonId: `${unitId}-L${li + 1}`, title, type: 'video', order: li + 1,
    }));
    units.push({ unitId, title: ch.title, order: unitNo, lessons });
    ch.videos.forEach(([title, ytId], li) => {
      videos.push({
        id: `${unitId}-L${li + 1}`,
        data: {
          video_title: title, subject_code: `ECON-${L.roman}`,
          unit_no: unitNo, unit_title: ch.title, lesson_no: li + 1,
          language: 'French', duration_min: 15,
          // Use the privacy-enhanced nocookie EMBED form (same as chem/phys/math).
          // The app renders this as a plain <iframe> (allowed by CSP frame-src);
          // a plain youtube.com/watch URL would instead trigger the YouTube JS API
          // (youtube.com/iframe_api), which the site's CSP script-src blocks.
          video_url: `https://www.youtube-nocookie.com/embed/${ytId}`,
          thumbnail_url: '', learning_objectives: '', tags: 'economie',
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

async function main() {
  console.log(`Seeding levels: ${levelsArg.join(', ')}${DRY ? ' (DRY RUN — no writes)' : ''}`);
  const plans = levelsArg.map(buildCourseAndVideos).filter(Boolean);
  if (!plans.length) { console.error('Nothing to seed (NS2 has no IDs yet, or bad --levels).'); process.exit(1); }

  if (DRY) {
    for (const p of plans) {
      console.log(`\n== ${p.courseId}: ${p.course.number_of_lessons} lessons ==`);
      p.videos.forEach(v => console.log(`  ${v.id}  ${v.data.video_title}  ${v.data.video_url}`));
    }
    console.log('\nDRY RUN complete. Re-run without --dry-run to write.');
    return;
  }

  if (!cfg.apiKey || !cfg.projectId) { console.error('Missing FIREBASE_* env config.'); process.exit(1); }
  if (!process.env.EDLIGHT_ADMIN_EMAIL || !process.env.EDLIGHT_ADMIN_PASSWORD) { console.error('Missing EDLIGHT_ADMIN_EMAIL / EDLIGHT_ADMIN_PASSWORD.'); process.exit(1); }

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, process.env.EDLIGHT_ADMIN_EMAIL, process.env.EDLIGHT_ADMIN_PASSWORD);
  console.log(`Signed in as ${process.env.EDLIGHT_ADMIN_EMAIL}`);

  for (const p of plans) {
    for (const v of p.videos) {
      await setDoc(doc(db, 'videos', v.id), { ...v.data, updated_at: serverTimestamp() }, { merge: true });
    }
    await setDoc(doc(db, 'courses', p.courseId), { ...p.course, updated_at: serverTimestamp() }, { merge: true });
    console.log(`✅ ${p.courseId}: wrote ${p.videos.length} videos + course structure`);
  }
  console.log('\nDone. Verify on academy.edlight.org, then run remaining levels.');
  process.exit(0);
}

// Only run when executed directly (allows importing LEVELS/buildCourseAndVideos).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
