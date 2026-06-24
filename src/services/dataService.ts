import { loadQuizBankSafe, normalizeAndIndexQuizBank } from './quizBank';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

// Prefer the English portion of a bilingual title when present.
// Heuristic: if the title contains parentheses, and the inner text looks ASCII,
// treat the inner as English (e.g., "Divizyon Chimi (Branches of Chemistry)" -> "Branches of Chemistry").
// Otherwise, if splitters like " - ", "/", or "|" exist, choose the ASCII segment.
const extractEnglishTitle = (title) => {
  if (!title || typeof title !== 'string') return title;
  // normalize unicode dashes to hyphen
  const normalized = title.replace(/[\u2012-\u2015]/g, '-').trim();

  // Helper checks
  const isAscii = (s) => typeof s === 'string' && /^[\x20-\x7E]+$/.test(s);
  const score = (s) => {
    if (!s) return 0;
    const len = s.length;
    const vowels = (s.match(/[aeiouAEIOU]/g) || []).length;
    const spaces = (s.match(/\s/g) || []).length;
    return (isAscii(s) ? 10 : 0) + len + vowels * 2 + spaces; // prefer readable English-ish
  };

  // Case 1: Parentheses variant (prefer inside if looks English)
  const paren = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const before = paren[1].trim();
    const inside = paren[2].trim();
    // prefer inside if it's ASCII or simply better scored
    return (isAscii(inside) || score(inside) >= score(before)) ? inside : before;
  }

  // Case 2: Delimiter-separated bilingual titles
  const parts = normalized.split(/\s*[\-|/|\|]\s*/).filter(Boolean);
  if (parts.length > 1) {
    // choose segment with highest score; tie-break by longest
    const best = parts.reduce((best, cur) => {
      const cand = cur.trim();
      const s = score(cand);
      if (!best || s > best.s || (s === best.s && cand.length > best.val.length)) {
        return { val: cand, s };
      }
      return best;
    }, null);
    if (best && best.val && best.val !== '-' && best.val !== '–') return best.val.trim();
  }

  // Fallback: return normalized without lone dash
  return normalized === '-' ? title.trim() : normalized;
};

// Subject color/icon mapping (moved from CSV to code)
const SUBJECT_DEFAULTS = {
  CHEM: { color: '#0A66C2', icon: 'beaker', name: 'Chemistry' },
  PHYS: { color: '#0857A6', icon: 'atom', name: 'Physics' },
  MATH: { color: '#4A93DD', icon: 'calculator', name: 'Mathematics' },
  ECON: { color: '#5D5B54', icon: 'chart', name: 'Economics' }
};

/**
 * Fetch courses from Firebase Firestore with full course structure
 * @returns {Promise<Object[]>} Array of course objects from Firestore
 */
const fetchCoursesFromFirestore = async () => {
  // NOTE: deliberately NOT wrapped in try/catch. Courses are essential, and a
  // transient failure must PROPAGATE so react-query can retry. Previously this
  // swallowed every error into `return []`, which callers couldn't distinguish
  // from a genuinely empty catalog — that empty array then got cached and shown
  // as "no courses" (and an empty quiz filter) until the cache expired.
  const coursesRef = collection(db, 'courses');
  const snapshot = await getDocs(coursesRef);

  const courses = [];
  snapshot.forEach((doc) => {
    courses.push({
      id: doc.id,
      ...doc.data()
    });
  });

  return courses;
};

/**
 * Fetch videos from Firebase Firestore
 * @returns {Promise<Map>} Map of video ID to video data
 */
const fetchVideosFromFirestore = async () => {
  try {
    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(videosRef);
    
    const videosMap = new Map();
    snapshot.forEach((doc) => {
      videosMap.set(doc.id, {
        id: doc.id,
        ...doc.data()
      });
    });
    
    return videosMap;
  } catch (error) {
    console.error('❌ Error fetching videos from Firestore:', error);
    return new Map();
  }
};

/**
 * Fetch quizzes from Firebase Firestore
 * @returns {Promise<Map>} Map of quiz ID to quiz data
 */
const fetchQuizzesFromFirestore = async () => {
  try {
    const quizzesRef = collection(db, 'quizzes');
    const snapshot = await getDocs(quizzesRef);
    
    const quizzesMap = new Map();
    snapshot.forEach((doc) => {
      quizzesMap.set(doc.id, {
        id: doc.id,
        ...doc.data()
      });
    });
    
    return quizzesMap;
  } catch (error) {
    console.error('❌ Error fetching quizzes from Firestore:', error);
    return new Map();
  }
};

/**
 * Transform Firestore courses to app format and enrich with video/quiz data
 * @param {Object[]} firestoreCourses - Courses from Firestore with units structure
 * @param {Map} videosMap - Map of video ID to video data from Firestore
 * @param {Map} quizzesMap - Map of quiz ID to quiz data from Firestore
 * @returns {Object[]} Transformed courses ready for the app
 */
const transformFirestoreCourses = (firestoreCourses, videosMap = new Map(), quizzesMap = new Map()) => {

  const transformed = firestoreCourses.map(course => {
    // Parse course ID (e.g., chem-ns1)
    const [subjectPart, levelPart] = course.id.split('-');
    const subjectCode = subjectPart ? subjectPart.toUpperCase() : '';
    const levelCode = levelPart ? levelPart.toUpperCase().replace('NS', 'NS').replace('1', 'I').replace('2', 'II').replace('3', 'III').replace('4', 'IV') : 'NSI';
    const fullSubjectCode = `${subjectCode}-${levelCode}`;
    
    // Get subject defaults (color, icon, name)
    const subjectInfo = SUBJECT_DEFAULTS[subjectCode] || { color: '#0A66C2', icon: 'book', name: 'Course' };
    
    // Transform units from Firestore to modules for the app
    // Firestore structure: { unitId, title, order, lessons: [{lessonId, title, type, order}] }
    // App expects: { id, title, lessons: [{id, title, videoUrl, duration, objectives}] }
    const modules = (course.units || []).map(unit => {
      const lessons = (unit.lessons || []).map(lesson => {
        const lessonId = lesson.lessonId;
        const lessonType = lesson.type;
        
        // Enrich with video data if it's a video lesson
        if (lessonType === 'video' && videosMap.has(lessonId)) {
          const videoData = videosMap.get(lessonId);
          
          // Extract lesson_no from video data, or parse from ID if not present
          // Video IDs follow pattern: CHEM-NSI-U1-L2 (lesson 2)
          let lessonNo = videoData.lesson_no;
          if (!lessonNo) {
            const lessonMatch = lessonId.match(/-L(\d+)$/i);
            if (lessonMatch) {
              lessonNo = parseInt(lessonMatch[1], 10);
            }
          }
          
          return {
            id: lessonId,
            title: lesson.title || videoData.title,
            type: lessonType,
            order: lesson.order,
            videoUrl: videoData.video_url || 'https://www.youtube.com/embed/placeholder',
            duration: videoData.duration_min || 15,
            objectives: videoData.learning_objectives || '',
            thumbnail: videoData.thumbnail_url || '',
            unit_no: videoData.unit_no, // Include unit_no from video data
            lesson_no: lessonNo // Include lesson_no for subchapter filtering
          };
        }
        
        // Enrich with quiz data if it's a quiz lesson
        if (lessonType === 'quiz' && quizzesMap.has(lessonId)) {
          const quizData = quizzesMap.get(lessonId);
          return {
            id: lessonId,
            title: lesson.title || quizData.title,
            type: lessonType,
            order: lesson.order,
            videoUrl: null, // Quizzes don't have videos
            duration: quizData.time_limit_minutes || 30,
            objectives: quizData.description || '',
            questionCount: quizData.total_questions || 0,
            passingScore: quizData.passing_score || 70
          };
        }
        
        // Fallback if no enrichment data found
        return {
          id: lessonId,
          title: lesson.title,
          type: lessonType,
          order: lesson.order,
          videoUrl: lessonType === 'video' ? 'https://www.youtube.com/embed/placeholder' : null,
          duration: 15,
          objectives: ''
        };
      });
      
      // Extract unit_no from the first video lesson in this unit
      const firstVideoLesson = lessons.find(l => l.type === 'video' && l.unit_no);
      const unitNo = firstVideoLesson?.unit_no || unit.order;
      
      return {
        id: unit.unitId || unit.id,
        title: unit.title,
        order: unit.order,
        unit_no: unitNo, // Add unit_no to module
        lessons
      };
    });

    // Return transformed course
    return {
      id: course.id,
      code: fullSubjectCode,
      name: course.display_name || course.name,
      level: levelCode,
      subject: subjectCode,
      description: course.description || '',
      thumbnail: subjectInfo.icon,
      color: subjectInfo.color,
      videoCount: course.number_of_lessons || 0,
      duration: course.length || 0,
      modules: modules,
      instructor: 'EdLight Academy',
      // Keep original Firestore data for reference
      _firestore: {
        number_of_units: course.number_of_units,
        number_of_lessons: course.number_of_lessons,
        created_at: course.created_at,
        updated_at: course.updated_at
      }
    };
  });

  // De-duplicate by course code (subject + level). Some catalogs contain more
  // than one Firestore document for the same course — e.g. a re-imported
  // "Mathématiques NS IV" — which would otherwise render as two identical
  // cards. Keep the most complete copy (most modules) so each course shows once.
  const byCode = new Map();
  for (const c of transformed) {
    const key = c.code || c.id;
    const prev = byCode.get(key);
    if (!prev || (c.modules?.length || 0) > (prev.modules?.length || 0)) {
      byCode.set(key, c);
    }
  }
  return Array.from(byCode.values());
};

/* ──────────────────────────────────────────────────────────────────────────
   Lightweight course-catalog loader
   ──────────────────────────────────────────────────────────────────────────
   The /courses listing and the dashboard only need the course catalog
   (name, level, subject, description, unit/lesson counts, duration). They do
   NOT need the full `videos` + `quizzes` collections or the quiz-bank index.
   Fetching only the small `courses` collection — and skipping the quiz-bank
   build entirely — turns a multi-collection, CPU-heavy load into a single,
   fast read. A localStorage cache lets returning visitors paint instantly. */

// v2: previous builds could cache an empty [] after a transient Firestore
// failure, which then persisted and showed an empty catalog for that visitor.
// Bumping the key abandons any such poisoned entry; we also now refuse to
// cache empty results and ignore empty caches on read (see below).
const COURSES_CACHE_KEY = 'edlight:courses:v2';

/**
 * Read the cached course catalog from localStorage.
 * @returns {{ data: Object[], updatedAt: number } | null}
 */
export const getCachedCourses = () => {
  try {
    const raw = localStorage.getItem(COURSES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Treat an empty array as "no cache" so a previously poisoned entry can
    // never keep the catalog blank — we fetch fresh instead.
    if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    return { data: parsed.data, updatedAt: parsed.t || 0 };
  } catch {
    return null;
  }
};

const writeCachedCourses = (data) => {
  try {
    localStorage.setItem(COURSES_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* ignore quota / private-mode errors */
  }
};

/**
 * Load ONLY the course catalog from Firestore (no videos/quizzes/quiz-bank).
 * The catalog uses fields that already live on the course document, so the
 * transform runs with empty enrichment maps — unit/lesson counts stay intact.
 * @returns {Promise<Object[]>} Array of transformed course objects
 */
export const loadCoursesData = async () => {
  const firestoreCourses = await fetchCoursesFromFirestore();
  const courses = transformFirestoreCourses(firestoreCourses);
  // Only cache a non-empty catalog. Caching [] (e.g. after a transient error)
  // would persist an empty listing for returning visitors.
  if (courses.length > 0) writeCachedCourses(courses);
  return courses;
};

/**
 * Load all required data for the application
 * All data comes from Firestore
 * @returns {Promise<{subjects: Object[], videos: Object[], quizzes: Object[], courses: Object[], quizBank: Object}>}
 */
export const loadAppData = async () => {
  try {
    
    // Fetch all data from Firestore in parallel
    const [firestoreCourses, firestoreVideosMap, firestoreQuizzesMap] = await Promise.all([
      fetchCoursesFromFirestore(),
      fetchVideosFromFirestore(),
      fetchQuizzesFromFirestore(),
    ]);
    
    // Transform Firestore courses to app format
    // Enriched with video and quiz data from Firestore
    const courses = transformFirestoreCourses(firestoreCourses, firestoreVideosMap, firestoreQuizzesMap);
    
    
    // Convert Firestore maps to arrays for compatibility with existing code
    const videos = Array.from(firestoreVideosMap.values());
    const quizzes = Array.from(firestoreQuizzesMap.values());
    
    // Create subjects array from SUBJECT_DEFAULTS for compatibility
    const subjects = Object.entries(SUBJECT_DEFAULTS).map(([code, info]) => ({
      id: code,
      code: code,
      name: info.name,
      color: info.color,
      icon: info.icon
    }));
    
    // Build quiz bank from Firestore quizzes (not CSV)
    const quizBank = normalizeAndIndexQuizBank(quizzes, videos);
    
    return { subjects, videos, quizzes, courses, quizBank };
  } catch (err) {
    console.error('❌ Failed to load application data:', err);
    throw err;
  }
};

/**
 * Get quizzes for a specific video
 * @param {string} videoId - Video ID to get quizzes for
 * @param {Object[]} quizzes - All quizzes data
 * @returns {Object[]} Quizzes for the video
 */
export const getQuizzesForVideo = (videoId, quizzes) => 
  quizzes.filter(q => q.video_id === videoId);