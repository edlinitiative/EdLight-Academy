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

async function fetchCoursesFromFirestore(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'courses'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchVideosFromFirestore(): Promise<Map<string, any>> {
  try {
    const snap = await getDocs(collection(db, 'videos'));
    const map = new Map<string, any>();
    snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
    return map;
  } catch { return new Map(); }
}

async function fetchQuizzesFromFirestore(): Promise<Map<string, any>> {
  try {
    const snap = await getDocs(collection(db, 'quizzes'));
    const map = new Map<string, any>();
    snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
    return map;
  } catch { return new Map(); }
}

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

export async function loadCoursesData(): Promise<any[]> {
  const firestoreCourses = await fetchCoursesFromFirestore();
  const courses = transformFirestoreCourses(firestoreCourses);
  if (courses.length > 0) await writeCachedCourses(courses);
  return courses;
}

export async function loadAppData(): Promise<any> {
  const [firestoreCourses, videosMap, quizzesMap] = await Promise.all([
    fetchCoursesFromFirestore(),
    fetchVideosFromFirestore(),
    fetchQuizzesFromFirestore(),
  ]);

  const courses = transformFirestoreCourses(firestoreCourses, videosMap, quizzesMap);
  const videos = Array.from(videosMap.values());
  const quizzes = Array.from(quizzesMap.values());

  const subjects = Object.entries(SUBJECT_DEFAULTS).map(([code, info]) => ({
    id: code, code, name: info.name, color: info.color, icon: info.icon,
  }));

  const quizBank = normalizeAndIndexQuizBank(quizzes, videos);

  if (courses.length > 0) await writeCachedCourses(courses);

  return { subjects, videos, quizzes, courses, quizBank };
}
