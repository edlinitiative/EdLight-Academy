import { useQuery } from '@tanstack/react-query';
import { collection, doc, getCountFromServer, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { TRACKS } from '../config/trackConfig';

const clampNumber = (v) => (Number.isFinite(v) ? v : null);

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

  // Students: only show once >= 1000
  if (Number.isFinite(counts.activeStudentsThisTerm) && counts.activeStudentsThisTerm >= 1000) {
    cards.push({
      key: 'students',
      label: 'Active Students',
      value: `${formatCompact(counts.activeStudentsThisTerm)}+`,
      numeric: counts.activeStudentsThisTerm,
    });
  }

  // Content metrics with thresholds you approved
  if (Number.isFinite(counts.videos) && counts.videos >= 40) {
    cards.push({ key: 'videos', label: 'Video Lessons', value: `${formatCompact(counts.videos)}+`, numeric: counts.videos });
  }

  if (Number.isFinite(counts.quizzes) && counts.quizzes >= 200) {
    cards.push({ key: 'quizzes', label: 'Micro-quizzes', value: `${formatCompact(counts.quizzes)}+`, numeric: counts.quizzes });
  }

  // Always ok to show
  if (Number.isFinite(counts.courses)) {
    cards.push({ key: 'courses', label: 'Courses', value: formatCompact(counts.courses), numeric: counts.courses });
  }

  if (Number.isFinite(counts.tracks)) {
    cards.push({ key: 'tracks', label: 'Tracks', value: formatCompact(counts.tracks), numeric: counts.tracks });
  }

  // Exams can be huge; keep it controlled by siteStats doc
  if (Number.isFinite(counts.exams) && counts.exams >= 10) {
    cards.push({ key: 'exams', label: 'Official Exams', value: `${formatCompact(counts.exams)}+`, numeric: counts.exams });
  }

  return cards;
}

export function useSiteStats() {
  return useQuery({
    queryKey: ['siteStats'],
    queryFn: loadSiteStats,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
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
