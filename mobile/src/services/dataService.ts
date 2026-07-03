import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { loadQuizBankSafe, normalizeAndIndexQuizBank } from './quizBank';

const SUBJECT_DEFAULTS: Record<string, { color: string; icon: string; name: string }> = {
  CHEM: { color: '#0A66C2', icon: 'beaker', name: 'Chemistry' },
  PHYS: { color: '#0857A6', icon: 'atom', name: 'Physics' },
  MATH: { color: '#4A93DD', icon: 'calculator', name: 'Mathematics' },
  ECON: { color: '#5D5B54', icon: 'chart', name: 'Economics' },
};

const COURSES_CACHE_KEY = 'edlight:courses:v2';
const VIDEOS_CACHE_KEY = 'edlight:videos:v1';
const QUIZ_QUESTIONS_CACHE_KEY = 'edlight:quizQuestions:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

// The videos (618 docs) and quizzes (2684 docs) collections barely change, but
// were re-read from Firestore on every screen mount — the main reason pages
// felt slow. Cache them for a day; a stale copy always beats a spinner.
async function readCache(key: string): Promise<{ t: number; data: any[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.data) && parsed.data.length > 0 ? parsed : null;
  } catch { return null; }
}

async function writeCache(key: string, data: any[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch { /* ignore quota errors */ }
}

async function fetchCoursesFromFirestore(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'courses'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Dedupe concurrent background refreshes (several loaders share collections).
const inflightRefreshes = new Map<string, Promise<any[]>>();

function refreshCollection(name: string, cacheKey: string): Promise<any[]> {
  let p = inflightRefreshes.get(cacheKey);
  if (!p) {
    p = (async () => {
      const snap = await getDocs(collection(db, name));
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (arr.length > 0) await writeCache(cacheKey, arr);
      return arr;
    })().finally(() => inflightRefreshes.delete(cacheKey));
    inflightRefreshes.set(cacheKey, p);
  }
  return p;
}

async function fetchCollectionCached(name: string, cacheKey: string): Promise<any[]> {
  const cached = await readCache(cacheKey);
  if (cached) {
    // Stale-while-revalidate: an expired copy still renders instantly;
    // kick off a background refresh so the next read is fresh.
    if (Date.now() - cached.t >= DAY_MS) refreshCollection(name, cacheKey).catch(() => {});
    return cached.data;
  }
  return refreshCollection(name, cacheKey).catch(() => []);
}

const fetchVideosCached = () => fetchCollectionCached('videos', VIDEOS_CACHE_KEY);
const fetchQuizQuestionsCached = () => fetchCollectionCached('quizzes', QUIZ_QUESTIONS_CACHE_KEY);

const toMap = (arr: any[]) => new Map<string, any>(arr.map((x) => [x.id, x]));

function transformFirestoreCourses(
  firestoreCourses: any[],
  videosMap = new Map<string, any>(),
  quizzesMap = new Map<string, any>(),
): any[] {
  const transformed = firestoreCourses.map((course) => {
    const [subjectPart, levelPart] = course.id.split('-');
    const subjectCode = subjectPart?.toUpperCase() ?? '';
    const rawLevel = levelPart?.toUpperCase() ?? '';
    const levelCode = rawLevel
      .replace('NS', 'NS')
      .replace('1', 'I')
      .replace('2', 'II')
      .replace('3', 'III')
      .replace('4', 'IV');

    const subjectInfo = SUBJECT_DEFAULTS[subjectCode] ?? { color: '#0A66C2', icon: 'book', name: 'Course' };

    const modules = (course.units ?? []).map((unit: any) => {
      const lessons = (unit.lessons ?? []).map((lesson: any) => {
        const { lessonId, type: lessonType, order } = lesson;
        if (lessonType === 'video' && videosMap.has(lessonId)) {
          const v = videosMap.get(lessonId)!;
          return {
            id: lessonId,
            title: lesson.title || v.title,
            type: lessonType,
            order,
            videoUrl: v.video_url || '',
            duration: v.duration_min || 15,
            objectives: v.learning_objectives || '',
            thumbnail: v.thumbnail_url || '',
            unit_no: v.unit_no,
            lesson_no: v.lesson_no ?? null,
          };
        }
        if (lessonType === 'quiz' && quizzesMap.has(lessonId)) {
          const q = quizzesMap.get(lessonId)!;
          return {
            id: lessonId,
            title: lesson.title || q.title,
            type: lessonType,
            order,
            videoUrl: null,
            duration: q.time_limit_minutes || 30,
            objectives: q.description || '',
            questionCount: q.total_questions || 0,
            passingScore: q.passing_score || 70,
          };
        }
        return { id: lessonId, title: lesson.title, type: lessonType, order, videoUrl: null, duration: 15, objectives: '' };
      });
      const firstVideo = lessons.find((l: any) => l.type === 'video' && l.unit_no);
      return { id: unit.unitId || unit.id, title: unit.title, order: unit.order, unit_no: firstVideo?.unit_no ?? unit.order, lessons };
    });

    return {
      id: course.id,
      code: `${subjectCode}-${levelCode}`,
      name: course.display_name || course.name,
      level: levelCode,
      subject: subjectCode,
      description: course.description || '',
      thumbnail: subjectInfo.icon,
      color: subjectInfo.color,
      videoCount: course.number_of_lessons || 0,
      duration: course.length || 0,
      modules,
      instructor: 'EdLight Academy',
    };
  });

  const byCode = new Map<string, any>();
  for (const c of transformed) {
    const key = c.code || c.id;
    const prev = byCode.get(key);
    if (!prev || (c.modules?.length ?? 0) > (prev.modules?.length ?? 0)) byCode.set(key, c);
  }
  return Array.from(byCode.values());
}

// ─── Cache helpers (AsyncStorage instead of localStorage) ─────────────────

export async function getCachedCourses(): Promise<{ data: any[]; updatedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(COURSES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    return { data: parsed.data, updatedAt: parsed.t || 0 };
  } catch { return null; }
}

async function writeCachedCourses(data: any[]) {
  try {
    await AsyncStorage.setItem(COURSES_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch { /* ignore */ }
}

let inflightCoursesRefresh: Promise<any[]> | null = null;

function refreshCoursesData(): Promise<any[]> {
  if (!inflightCoursesRefresh) {
    inflightCoursesRefresh = (async () => {
      const [firestoreCourses, videosArr, quizArr] = await Promise.all([
        fetchCoursesFromFirestore(),
        fetchVideosCached(),
        fetchQuizQuestionsCached(),
      ]);
      const courses = transformFirestoreCourses(firestoreCourses, toMap(videosArr), toMap(quizArr));
      if (courses.length > 0) await writeCachedCourses(courses);
      return courses;
    })().finally(() => { inflightCoursesRefresh = null; });
  }
  return inflightCoursesRefresh;
}

export async function loadCoursesData(): Promise<any[]> {
  // Cached copy (fresh OR stale) → render immediately with zero Firestore
  // reads. An expired cache triggers a background refresh so the next mount
  // is fresh: a stale copy always beats a spinner.
  const cached = await getCachedCourses();
  if (cached) {
    if (Date.now() - cached.updatedAt >= 60 * 60 * 1000) refreshCoursesData().catch(() => {});
    return cached.data;
  }
  return refreshCoursesData();
}

// ─── Practice quizzes (grouped from the question bank) ─────────────────────

const SUBJECT_FR: Record<string, string> = {
  CHEM: 'Chimie', PHYS: 'Physique', MATH: 'Maths', ECON: 'Économie', BIO: 'SVT',
};

function parseOptions(row: any): string[] {
  const raw = row.options ?? row.choices ?? row.alternatives ?? '';
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(String);
    } catch { /* not JSON */ }
  }
  return [];
}

function prettySubject(code: string): string {
  const [subj, level] = String(code).split('-');
  const name = SUBJECT_FR[subj?.toUpperCase() ?? ''] ?? subj ?? '';
  return level ? `${name} ${level}` : name;
}

/**
 * The Firestore `quizzes` collection stores INDIVIDUAL question rows
 * (question / options / correct_answer, keyed by subject_code + unit), not
 * quiz objects. Group them into per-unit practice quizzes the runner can play,
 * mirroring the PWA's question-bank practice.
 */
export function groupQuestionsIntoQuizzes(rows: any[]): any[] {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const question = String(row.question ?? '').trim();
    const options = parseOptions(row);
    if (!question || options.length < 2) continue;
    const subjectCode = String(row.subject_code ?? '').trim() || 'Divers';
    const unit = String(row.unit ?? row.video_title ?? '').trim() || 'Général';
    const key = `${subjectCode}::${unit}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        title: `${prettySubject(subjectCode)} — ${unit}`,
        subject: subjectCode,
        unit,
        questions: [],
      };
      groups.set(key, group);
    }
    group.questions.push({
      id: row.id,
      question,
      options,
      answer: String(row.correct_answer ?? row.good_response ?? ''),
      hint: row.hint || row.hint1 || '',
      explanation: row.explanation || '',
    });
  }
  return Array.from(groups.values())
    .filter((g) => g.questions.length >= 3)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

/** Quizzes screen: grouped practice quizzes only — no courses/videos fetch. */
export async function loadPracticeQuizzes(): Promise<any[]> {
  const rows = await fetchQuizQuestionsCached();
  return groupQuestionsIntoQuizzes(rows);
}

export async function loadAppData(): Promise<any> {
  const [firestoreCourses, videosArr, quizArr] = await Promise.all([
    fetchCoursesFromFirestore(),
    fetchVideosCached(),
    fetchQuizQuestionsCached(),
  ]);

  const courses = transformFirestoreCourses(firestoreCourses, toMap(videosArr), toMap(quizArr));
  const quizzes = groupQuestionsIntoQuizzes(quizArr);

  const subjects = Object.entries(SUBJECT_DEFAULTS).map(([code, info]) => ({
    id: code, code, name: info.name, color: info.color, icon: info.icon,
  }));

  const quizBank = normalizeAndIndexQuizBank(quizArr, videosArr);

  if (courses.length > 0) await writeCachedCourses(courses);

  return { subjects, videos: videosArr, quizzes, courses, quizBank };
}
