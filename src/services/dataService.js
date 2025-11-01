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
  CHEM: { color: '#10B981', icon: 'beaker', name: 'Chemistry' },
  PHYS: { color: '#3B82F6', icon: 'atom', name: 'Physics' },
  MATH: { color: '#8B5CF6', icon: 'calculator', name: 'Mathematics' },
  ECON: { color: '#F59E0B', icon: 'chart', name: 'Economics' }
};

/**
 * Fetch courses from Firebase Firestore with full course structure
 * @returns {Promise<Object[]>} Array of course objects from Firestore
 */
const fetchCoursesFromFirestore = async () => {
  try {
    console.log('📚 Fetching courses from Firestore...');
    const coursesRef = collection(db, 'courses');
    const snapshot = await getDocs(coursesRef);
    
    const courses = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      courses.push({
        id: doc.id,
        ...data
      });
    });
    
    console.log(`✅ Fetched ${courses.length} courses from Firestore`);
    return courses;
  } catch (error) {
    console.error('❌ Error fetching courses from Firestore:', error);
    // Return empty array if Firestore fetch fails
    return [];
  }
};

/**
 * Fetch videos from Firebase Firestore
 * @returns {Promise<Map>} Map of video ID to video data
 */
const fetchVideosFromFirestore = async () => {
  try {
    console.log('🎬 Fetching videos from Firestore...');
    const videosRef = collection(db, 'videos');
    const snapshot = await getDocs(videosRef);
    
    const videosMap = new Map();
    snapshot.forEach((doc) => {
      videosMap.set(doc.id, {
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Fetched ${videosMap.size} videos from Firestore`);
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
    console.log('📝 Fetching quizzes from Firestore...');
    const quizzesRef = collection(db, 'quizzes');
    const snapshot = await getDocs(quizzesRef);
    
    const quizzesMap = new Map();
    snapshot.forEach((doc) => {
      quizzesMap.set(doc.id, {
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Fetched ${quizzesMap.size} quizzes from Firestore`);
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
  console.log('🔄 Transforming Firestore courses for app...');

  return firestoreCourses.map(course => {
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
    const modules = (course.units || []).map(unit => ({
      id: unit.unitId || unit.id,
      title: unit.title,
      order: unit.order,
      lessons: (unit.lessons || []).map(lesson => {
        const lessonId = lesson.lessonId;
        const lessonType = lesson.type;
        
        // Enrich with video data if it's a video lesson
        if (lessonType === 'video' && videosMap.has(lessonId)) {
          const videoData = videosMap.get(lessonId);
          return {
            id: lessonId,
            title: lesson.title || videoData.title,
            type: lessonType,
            order: lesson.order,
            videoUrl: videoData.video_url || 'https://www.youtube.com/embed/placeholder',
            duration: videoData.duration_min || 15,
            objectives: videoData.learning_objectives || '',
            thumbnail: videoData.thumbnail_url || ''
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
      })
    }));

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
};

/**
 * Load all required data for the application
 * All data comes from Firestore
 * @returns {Promise<{subjects: Object[], videos: Object[], quizzes: Object[], courses: Object[], quizBank: Object}>}
 */
export const loadAppData = async () => {
  try {
    console.log('🚀 Loading application data from Firestore...');
    
    // Fetch all data from Firestore in parallel
    const [quizBankRows, firestoreCourses, firestoreVideosMap, firestoreQuizzesMap] = await Promise.all([
      loadQuizBankSafe(),
      fetchCoursesFromFirestore(),
      fetchVideosFromFirestore(),
      fetchQuizzesFromFirestore(),
    ]);
    
    console.log('📊 Firestore data loaded:', {
      courses: firestoreCourses.length,
      videos: firestoreVideosMap.size,
      quizzes: firestoreQuizzesMap.size,
      quizBankQuestions: quizBankRows.length
    });
    
    // Transform Firestore courses to app format
    // Enriched with video and quiz data from Firestore
    const courses = transformFirestoreCourses(firestoreCourses, firestoreVideosMap, firestoreQuizzesMap);
    
    console.log(`✅ Transformed ${courses.length} courses for app`);
    
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
    
    // Build quiz bank from Firestore videos
    const quizBank = normalizeAndIndexQuizBank(quizBankRows, videos);
    
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