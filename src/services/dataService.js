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
      'CHEM': 'Chemistry',
      'PHYS': 'Physics',
      'MATH': 'Mathematics',
      'ECON': 'Economics'
    };

    return {
      id: subjectCode,
      code: subjectCode,
      name: subjectInfo?.name || subjectNames[baseSubject] || baseSubject,
      level: level || 'NSI',
      subject: baseSubject,
      description: `Comprehensive ${subjectNames[baseSubject] || baseSubject} course for ${level || 'NS I'}`,
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