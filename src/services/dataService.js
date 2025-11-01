import { loadCSV } from '../utils/csvParser';
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

const DATA_URLS = {
  subjects: '/data/edlight_subjects.csv',
  videos: '/data/edlight_videos.csv',
  quizzes: '/data/edlight_quizzes.csv',
};

/**
 * Fetch courses from Firebase Firestore
 * @returns {Promise<Object[]>} Array of course objects from Firestore
 */
const fetchCoursesFromFirestore = async () => {
  try {
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
  } catch (error) {
    console.error('Error fetching courses from Firestore:', error);
    // Return empty array if Firestore fetch fails
    return [];
  }
};

/**
 * Enrich Firestore courses with video modules and additional metadata
 * @param {Object[]} firestoreCourses - Courses from Firestore
 * @param {Object[]} subjects - Subject data from CSV
 * @param {Object[]} videos - Video data from CSV
 * @returns {Object[]} Enriched courses with modules
 */
const enrichCoursesWithVideos = (firestoreCourses, subjects, videos) => {
  // Group videos by subject_code
  const videosBySubject = videos.reduce((acc, video) => {
    const subjectCode = video.subject_code;
    if (!acc[subjectCode]) {
      acc[subjectCode] = [];
    }
    acc[subjectCode].push(video);
    return acc;
  }, {});

  return firestoreCourses.map(course => {
    // Convert course ID to subject code format (e.g., chem-ns1 -> CHEM-NSI)
    const [subjectPart, levelPart] = course.id.split('-');
    const subjectCode = subjectPart.toUpperCase();
    const levelCode = levelPart ? levelPart.toUpperCase().replace('NS', 'NS').replace('1', 'I').replace('2', 'II').replace('3', 'III').replace('4', 'IV') : 'NSI';
    const fullSubjectCode = `${subjectCode}-${levelCode}`;
    
    // Get videos for this course
    const courseVideos = videosBySubject[fullSubjectCode] || [];
    
    // Find matching subject info for color and icon
    const subjectInfo = subjects.find(s => s.code === fullSubjectCode || s.id === subjectCode);
    
    // Group videos by unit to create modules
    const units = courseVideos.reduce((acc, video) => {
      const unitKey = `U${video.unit_no}`;
      if (!acc[unitKey]) {
        acc[unitKey] = {
          id: unitKey,
          title: extractEnglishTitle(video.unit_title),
          lessons: []
        };
      }
      acc[unitKey].lessons.push({
        id: video.id,
        title: extractEnglishTitle(video.video_title),
        videoUrl: video.video_url,
        duration: video.duration_min,
        objectives: video.learning_objectives
      });
      return acc;
    }, {});

    // Return enriched course with Firestore data + video modules
    return {
      id: course.id,
      code: fullSubjectCode,
      name: course.display_name,
      level: levelCode,
      subject: subjectCode,
      description: course.description,
      thumbnail: subjectInfo?.icon || 'book',
      color: subjectInfo?.color || '#0A66C2',
      videoCount: course.number_of_lessons || courseVideos.length,
      duration: course.length || courseVideos.reduce((sum, v) => sum + (parseInt(v.duration_min) || 0), 0),
      modules: Object.values(units),
      instructor: 'EdLight Academy'
    };
  });
};

/**
 * Load all required CSV data for the application
 * @returns {Promise<{subjects: Object[], videos: Object[], quizzes: Object[], courses: Object[]}>}
 */
export const loadAppData = async () => {
  try {
    const [subjects, videos, quizzes, quizBankRows, firestoreCourses] = await Promise.all([
      loadCSV(DATA_URLS.subjects),
      loadCSV(DATA_URLS.videos),
      loadCSV(DATA_URLS.quizzes),
      loadQuizBankSafe(),
      fetchCoursesFromFirestore(),
    ]);
    
    // Enrich Firestore courses with video modules from CSV
    const courses = enrichCoursesWithVideos(firestoreCourses, subjects, videos);
    
    const quizBank = normalizeAndIndexQuizBank(quizBankRows, videos);
    
    return { subjects, videos, quizzes, courses, quizBank };
  } catch (err) {
    console.error('Failed to load application data:', err);
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