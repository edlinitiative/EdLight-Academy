import { useQuery } from '@tanstack/react-query';
import { collection, doc, getCountFromServer, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { TRACKS } from '../config/trackConfig';

const clampNumber = (v) => (Number.isFinite(v) ? v : null);

/** Below this, a student count reads as "nobody is here" and is better hidden. */
const MIN_STUDENTS_SHOWN = 50;

const formatCompact = (n) => {
  if (!Number.isFinite(n)) return '';
  // Keep simple and predictable (no i18n surprises): 1,234
  return new Intl.NumberFormat('en-US').format(Math.round(n));
};

async function loadSiteStats() {
  const [coursesCountSnap, videosCountSnap, quizzesCountSnap, statsDocSnap] = await Promise.all([
    getCountFromServer(collection(db, 'courses')),
    getCountFromServer(collection(db, 'videos')),
    getCountFromServer(collection(db, 'quizzes')),
    getDoc(doc(db, 'siteStats', 'public')),
  ]);

  const publicStats = statsDocSnap.exists() ? statsDocSnap.data() : {};

  const courses = coursesCountSnap.data().count;
  const videos = videosCountSnap.data().count;
  const quizzes = quizzesCountSnap.data().count;

  // Optional values controlled server-side/admin-side
  const activeStudentsThisTerm = clampNumber(publicStats.active_students_term);
  const exams = clampNumber(publicStats.exams);
  const masteryRatePercent = clampNumber(publicStats.mastery_rate_percent);

  const tracks = Array.isArray(TRACKS) ? TRACKS.length : null;

  return {
    counts: {
      courses,
      videos,
      quizzes,
      tracks,
      exams,
      activeStudentsThisTerm,
    },
    masteryRatePercent,
    _raw: publicStats,
  };
}

function buildCards({ counts }) {
  const cards = [];

  // Labels are French (default UI language) with a Creole variant; the app
  // never renders English UI, so no English labels here.
  //
  // Students: the floor used to be 1000, which meant the count never appeared
  // at all and the site showed a warehouse of content with no sign that anyone
  // was in it. A real, modest number of people is more persuasive to a student
  // choosing where to revise than any inventory figure — EdLight Code leads
  // with "200+ learners" on a comparable base. The floor now only guards
  // against a number so small it reads as empty.
  if (Number.isFinite(counts.activeStudentsThisTerm) && counts.activeStudentsThisTerm >= MIN_STUDENTS_SHOWN) {
    cards.push({
      key: 'students',
      label: 'Élèves actifs',
      labelHt: 'Elèv aktif',
      value: `${formatCompact(counts.activeStudentsThisTerm)}+`,
      numeric: counts.activeStudentsThisTerm,
    });
  }

  // Content metrics with thresholds you approved
  if (Number.isFinite(counts.videos) && counts.videos >= 40) {
    cards.push({ key: 'videos', label: 'Leçons vidéo', labelHt: 'Leson videyo', value: `${formatCompact(counts.videos)}+`, numeric: counts.videos });
  }

  if (Number.isFinite(counts.quizzes) && counts.quizzes >= 200) {
    cards.push({ key: 'quizzes', label: 'Micro-quiz', labelHt: 'Micro-quiz', value: `${formatCompact(counts.quizzes)}+`, numeric: counts.quizzes });
  }

  // Always ok to show
  if (Number.isFinite(counts.courses)) {
    cards.push({ key: 'courses', label: 'Cours', labelHt: 'Kou', value: formatCompact(counts.courses), numeric: counts.courses });
  }

  if (Number.isFinite(counts.tracks)) {
    cards.push({ key: 'tracks', label: 'Filières', labelHt: 'Filyè', value: formatCompact(counts.tracks), numeric: counts.tracks });
  }

  // Exams can be huge; keep it controlled by siteStats doc
  if (Number.isFinite(counts.exams) && counts.exams >= 10) {
    cards.push({ key: 'exams', label: 'Examens officiels', labelHt: 'Egzamen ofisyèl', value: `${formatCompact(counts.exams)}+`, numeric: counts.exams });
  }

  return cards;
}

export function useSiteStats() {
  return useQuery({
    queryKey: ['siteStats'],
    queryFn: loadSiteStats,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useSiteStatCards() {
  const q = useSiteStats();
  const cards = q.data ? buildCards(q.data) : [];

  return {
    ...q,
    cards,
    counts: q.data?.counts,
    masteryRatePercent: q.data?.masteryRatePercent,
  };
}


/**
 * Just the headline student count, from a single document read.
 *
 * `useSiteStatCards` costs three `getCountFromServer` aggregations plus a doc
 * read — fine on /about, wasteful on the landing page, which is the first thing
 * a student loads on a slow Haitian connection and the page whose job is to
 * convert. This is one `getDoc` for the one number the hero actually needs.
 *
 * Returns `{ activeStudentsThisTerm: null }` on failure so callers fall back to
 * their static copy rather than showing a gap.
 */
export function useSiteHeadlineStats() {
  const q = useQuery({
    queryKey: ['siteStats', 'headline'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'siteStats', 'public'));
      const data = snap.exists() ? snap.data() : {};
      const students = clampNumber(data.active_students_term);
      return {
        activeStudentsThisTerm:
          Number.isFinite(students) && (students as number) >= MIN_STUDENTS_SHOWN ? students : null,
        // The same document already carries the true exam count, kept current by
        // scripts/update_site_stats.mjs. Reading it here costs nothing and stops
        // the hero quoting a hardcoded figure that has drifted from the catalogue.
        exams: clampNumber(data.exams),
      };
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  return q.data ?? { activeStudentsThisTerm: null, exams: null };
}
