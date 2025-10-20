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

    // Level formatting (NSI -> NS I, etc.)
    const levelFormatted = level ? level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';
    
    // Create polished course titles based on subject and level
    const courseTitles = {
      'CHEM-NSI': 'Introduction to Chemistry',
      'CHEM-NSII': 'General Chemistry',
      'CHEM-NSIII': 'Advanced Chemistry',
      'CHEM-NSIV': 'Organic & Physical Chemistry',
      'PHYS-NSII': 'Introduction to Physics',
      'PHYS-NSIII': 'Classical Physics',
      'PHYS-NSIV': 'Modern Physics & Thermodynamics',
      'MATH-NSI': 'Foundations of Mathematics',
      'MATH-NSII': 'Intermediate Mathematics',
      'MATH-NSIII': 'Advanced Mathematics & Calculus',
      'ECON-NSI': 'Introduction to Economics'
    };

    // Create detailed descriptions
    const courseDescriptions = {
      'CHEM-NSI': 'Master the fundamentals of chemistry, including matter, energy, chemical reactions, and the periodic table. Perfect for beginners.',
      'CHEM-NSII': 'Explore chemical bonding, stoichiometry, solutions, and acids & bases. Build upon your foundational knowledge.',
      'CHEM-NSIII': 'Dive into thermodynamics, chemical equilibrium, electrochemistry, and advanced reaction mechanisms.',
      'CHEM-NSIV': 'Study organic chemistry, hydrocarbons, functional groups, and physical chemistry principles at an advanced level.',
      'PHYS-NSII': 'Learn the basics of motion, forces, energy, and simple machines. Develop your understanding of the physical world.',
      'PHYS-NSIII': 'Study mechanics, Newton\'s laws, work and energy, waves, optics, and electricity fundamentals.',
      'PHYS-NSIV': 'Master electromagnetic induction, modern physics concepts, nuclear physics, and thermodynamics.',
      'MATH-NSI': 'Build strong mathematical foundations with algebra, geometry, basic trigonometry, and problem-solving skills.',
      'MATH-NSII': 'Advance your skills in functions, equations, coordinate geometry, and analytical methods.',
      'MATH-NSIII': 'Master advanced topics including calculus, derivatives, integrals, and complex problem solving.',
      'ECON-NSI': 'Understand economic principles, supply and demand, market systems, and basic economic theories relevant to Haiti.'
    };

    const baseName = subjectNames[baseSubject] || baseSubject;
    const courseTitle = courseTitles[subjectCode] || `${baseName} - ${levelFormatted}`;
    const courseDescription = courseDescriptions[subjectCode] || 
      `Comprehensive ${baseName} curriculum for ${levelFormatted} students following the Haitian national education standards.`;

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