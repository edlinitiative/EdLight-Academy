import { loadCSV } from '../utils/csvParser';

const DATA_URLS = {
  subjects: '/data/edlight_subjects.csv',
  videos: '/data/edlight_videos.csv',
  quizzes: '/data/edlight_quizzes.csv',
};

/**
 * Transform video data into course structure
 * Groups videos by subject_code to create courses
 */
const transformDataToCourses = (subjects, videos, quizzes) => {
  // Group videos by subject_code
  const videosBySubject = videos.reduce((acc, video) => {
    const subjectCode = video.subject_code;
    if (!acc[subjectCode]) {
      acc[subjectCode] = [];
    }
    acc[subjectCode].push(video);
    return acc;
  }, {});

  // Create courses from grouped videos
  const courses = Object.entries(videosBySubject).map(([subjectCode, subjectVideos]) => {
    // Extract base subject and level from code (e.g., CHEM-NSI -> CHEM, NSI)
    const [baseSubject, level] = subjectCode.split('-');
    
    // Find matching subject info
    const subjectInfo = subjects.find(s => s.code === subjectCode || s.id === baseSubject);
    
    // Group videos by unit
    const units = subjectVideos.reduce((acc, video) => {
      const unitKey = `U${video.unit_no}`;
      if (!acc[unitKey]) {
        acc[unitKey] = {
          id: unitKey,
          title: video.unit_title,
          lessons: []
        };
      }
      acc[unitKey].lessons.push({
        id: video.id,
        title: video.video_title,
        videoUrl: video.video_url,
        duration: video.duration_min,
        objectives: video.learning_objectives
      });
      return acc;
    }, {});

    // Subject name mapping
    const subjectNames = {
      CHEM: 'Chemistry',
      PHYS: 'Physics',
      MATH: 'Mathematics',
      ECON: 'Economics'
    };

    // Level formatting (NSI -> NS I, etc.)
    const levelFormatted = level ? level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';

    // Simple, catalog-friendly course naming
    const baseName = subjectNames[baseSubject] || baseSubject;
    const courseTitle = `${baseName} - ${levelFormatted}`;

    // Short descriptions used in the catalog
    const courseDescriptions = {
      'CHEM-NSI': 'Build a strong chemistry foundation with everyday examples and core lab concepts.',
      'CHEM-NSII': 'Deepen your chemistry skills with bonding, reactions, and solution chemistry practice.',
      'CHEM-NSIII': 'Tackle equilibrium, thermodynamics, and electrochemistry with problem-focused lessons.',
      'CHEM-NSIV': 'Explore advanced organic topics and physical chemistry questions for exam readiness.',
      'PHYS-NSII': 'Understand motion, forces, and energy through real-world investigations.',
      'PHYS-NSIII': 'Master mechanics, waves, and electricity with step-by-step explanations.',
      'PHYS-NSIV': 'Connect modern physics ideas with thermodynamics and practical experiments.',
      'MATH-NSI': 'Review algebra and geometry essentials while growing confident problem-solving habits.',
      'MATH-NSII': 'Strengthen functions and trigonometry skills with guided examples.',
      'MATH-NSIII': 'Practice calculus and advanced problem sets designed for NS III learners.',
      'ECON-NSI': 'Learn key economic principles and how markets shape daily life in Haiti.'
    };

    const courseDescription = courseDescriptions[subjectCode]
      || `${baseName} concepts tailored for ${levelFormatted} students with quick practice sets.`;

    return {
      id: subjectCode,
      code: subjectCode,
      name: courseTitle,
      level: level || 'NSI',
      subject: baseSubject,
      description: courseDescription,
      thumbnail: subjectInfo?.icon || 'book',
      color: subjectInfo?.color || '#0A66C2',
      videoCount: subjectVideos.length,
      duration: subjectVideos.reduce((sum, v) => sum + (parseInt(v.duration_min) || 0), 0),
      modules: Object.values(units),
      instructor: 'EdLight Academy'
    };
  });

  return courses;
};

/**
 * Load all required CSV data for the application
 * @returns {Promise<{subjects: Object[], videos: Object[], quizzes: Object[], courses: Object[]}>}
 */
export const loadAppData = async () => {
  try {
    const [subjects, videos, quizzes] = await Promise.all([
      loadCSV(DATA_URLS.subjects),
      loadCSV(DATA_URLS.videos),
      loadCSV(DATA_URLS.quizzes),
    ]);
    
    // Transform data into courses
    const courses = transformDataToCourses(subjects, videos, quizzes);
    
    return { subjects, videos, quizzes, courses };
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