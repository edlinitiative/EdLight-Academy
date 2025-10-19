import { loadCSV } from '../utils/csvParser';

const DATA_URLS = {
  subjects: '/data/edlight_subjects.csv',
  videos: '/data/edlight_videos.csv',
  quizzes: '/data/edlight_quizzes.csv',
};

/**
 * Load all required CSV data for the application
 * @returns {Promise<{subjects: Object[], videos: Object[], quizzes: Object[]}>}
 */
export const loadAppData = async () => {
  try {
    const [subjects, videos, quizzes] = await Promise.all([
      loadCSV(DATA_URLS.subjects),
      loadCSV(DATA_URLS.videos),
      loadCSV(DATA_URLS.quizzes),
    ]);
    return { subjects, videos, quizzes };
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