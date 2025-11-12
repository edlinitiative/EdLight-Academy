import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { notifyAchievement, notifyStreak } from './notificationService';

/**
 * Progress tracking data structure in Firestore:
 * 
 * users/{userId}/progress/{courseId} = {
 *   courseId: string,
 *   enrolledAt: timestamp,
 *   lastAccessedAt: timestamp,
 *   completedLessons: string[],  // Array of lesson IDs
 *   watchedVideos: {
 *     [videoId]: {
 *       watchedAt: timestamp,
 *       watchDuration: number,  // seconds watched
 *       totalDuration: number,  // total video length
 *       completed: boolean
 *     }
 *   },
 *   quizAttempts: {
 *     [quizId]: {
 *       attempts: [{
 *         attemptedAt: timestamp,
 *         score: number,
 *         totalQuestions: number,
 *         timeSpent: number  // seconds
 *       }]
 *     }
 *   },
 *   totalPoints: number,
 *   badges: string[],
 *   currentStreak: number,
 *   longestStreak: number,
 *   lastStudyDate: timestamp
 * }
 */

/**
 * Mark a video as watched
 */
export async function trackVideoProgress(userId, courseId, videoId, watchData) {
  if (!userId) return;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    const now = new Date();
    const watchedVideos = progressDoc.exists() ? (progressDoc.data().watchedVideos || {}) : {};
    
    watchedVideos[videoId] = {
      watchedAt: now,
      watchDuration: watchData.watchDuration || 0,
      totalDuration: watchData.totalDuration || 0,
      completed: watchData.completed || false
    };
    
    const updateData = {
      watchedVideos,
      lastAccessedAt: now,
      lastStudyDate: now
    };
    
    if (progressDoc.exists()) {
      await updateDoc(progressRef, updateData);
    } else {
      await setDoc(progressRef, {
        courseId,
        enrolledAt: now,
        ...updateData,
        completedLessons: [],
        quizAttempts: {},
        totalPoints: 0,
        badges: [],
        currentStreak: 1,
        longestStreak: 1
      });
    }
    
    // Update streak
    await updateStreak(userId, courseId);
    
    console.log(`[Progress] Video ${videoId} tracked for user ${userId}`);
  } catch (error) {
    console.error('[Progress] Error tracking video:', error);
  }
}

/**
 * Mark a lesson as completed
 */
export async function markLessonComplete(userId, courseId, lessonId) {
  if (!userId) return;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) {
      console.warn('[Progress] No progress document found');
      return;
    }
    
    const completedLessons = progressDoc.data().completedLessons || [];
    
    if (!completedLessons.includes(lessonId)) {
      completedLessons.push(lessonId);
      
      await updateDoc(progressRef, {
        completedLessons,
        lastAccessedAt: new Date()
      });
      
      // Award points for completing lesson
      await awardPoints(userId, courseId, 10, 'lesson_complete');
      
      console.log(`[Progress] Lesson ${lessonId} completed for user ${userId}`);
    }
  } catch (error) {
    console.error('[Progress] Error marking lesson complete:', error);
  }
}

/**
 * Track quiz attempt
 */
export async function trackQuizAttempt(userId, courseId, quizId, attemptData) {
  if (!userId) return;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    const quizAttempts = progressDoc.exists() ? (progressDoc.data().quizAttempts || {}) : {};
    
    if (!quizAttempts[quizId]) {
      quizAttempts[quizId] = { attempts: [] };
    }
    
    quizAttempts[quizId].attempts.push({
      attemptedAt: new Date(),
      score: attemptData.score,
      totalQuestions: attemptData.totalQuestions,
      timeSpent: attemptData.timeSpent || 0
    });
    
    await updateDoc(progressRef, {
      quizAttempts,
      lastAccessedAt: new Date(),
      lastStudyDate: new Date()
    });
    
    // Award points based on score
    const percentage = (attemptData.score / attemptData.totalQuestions) * 100;
    let points = 0;
    if (percentage >= 90) points = 50;
    else if (percentage >= 80) points = 40;
    else if (percentage >= 70) points = 30;
    else if (percentage >= 60) points = 20;
    else points = 10;
    
    await awardPoints(userId, courseId, points, 'quiz_complete');
    
    // Check for achievements
    await checkAchievements(userId, courseId);
    
    console.log(`[Progress] Quiz ${quizId} attempt tracked for user ${userId}`);
  } catch (error) {
    console.error('[Progress] Error tracking quiz attempt:', error);
  }
}

/**
 * Award points to user
 */
export async function awardPoints(userId, courseId, points, reason) {
  if (!userId) return;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) return;
    
    const currentPoints = progressDoc.data().totalPoints || 0;
    
    await updateDoc(progressRef, {
      totalPoints: currentPoints + points
    });
    
    console.log(`[Progress] Awarded ${points} points for ${reason}`);
  } catch (error) {
    console.error('[Progress] Error awarding points:', error);
  }
}

/**
 * Update study streak
 */
async function updateStreak(userId, courseId) {
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) return;
    
    const data = progressDoc.data();
    const lastStudyDate = data.lastStudyDate?.toDate();
    const now = new Date();
    
    if (!lastStudyDate) {
      await updateDoc(progressRef, {
        currentStreak: 1,
        longestStreak: 1
      });
      return;
    }
    
    // Calculate days difference
    const diffTime = Math.abs(now - lastStudyDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    let currentStreak = data.currentStreak || 1;
    let longestStreak = data.longestStreak || 1;
    
    if (diffDays === 0) {
      // Same day, no change
      return;
    } else if (diffDays === 1) {
      // Consecutive day, increment streak
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Streak broken
      currentStreak = 1;
    }
    
    await updateDoc(progressRef, {
      currentStreak,
      longestStreak
    });
    
    // Award streak milestone badges and send notifications
    if (currentStreak === 7) {
      await awardBadge(userId, courseId, 'week_streak');
      await notifyStreak(userId, 7);
    }
    if (currentStreak === 30) {
      await awardBadge(userId, courseId, 'month_streak');
      await notifyStreak(userId, 30);
    }
    if (currentStreak === 100) {
      await awardBadge(userId, courseId, 'legend_streak');
      await notifyStreak(userId, 100);
    }
    
  } catch (error) {
    console.error('[Progress] Error updating streak:', error);
  }
}

/**
 * Award badge to user
 */
export async function awardBadge(userId, courseId, badgeId) {
  if (!userId) return;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) return;
    
    const badges = progressDoc.data().badges || [];
    
    if (!badges.includes(badgeId)) {
      badges.push(badgeId);
      
      await updateDoc(progressRef, {
        badges
      });
      
      console.log(`[Progress] Badge ${badgeId} awarded to user ${userId}`);
      
      // Send notification for new badge
      const badgeNames = {
        first_lesson: { name: 'First Lesson', icon: '🎓' },
        quiz_enthusiast: { name: 'Quiz Enthusiast', icon: '📝' },
        perfectionist: { name: 'Perfectionist', icon: '💯' },
        point_collector: { name: 'Point Collector', icon: '💎' },
        week_streak: { name: '7 Day Streak', icon: '🔥' },
        month_streak: { name: '30 Day Streak', icon: '⚡' },
        legend_streak: { name: '100 Day Streak', icon: '👑' },
      };
      
      const badgeInfo = badgeNames[badgeId] || { name: badgeId, icon: '🏅' };
      await notifyAchievement(userId, { badgeId, ...badgeInfo });
    }
  } catch (error) {
    console.error('[Progress] Error awarding badge:', error);
  }
}

/**
 * Check and award achievements
 */
async function checkAchievements(userId, courseId) {
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) return;
    
    const data = progressDoc.data();
    const quizAttempts = data.quizAttempts || {};
    const totalPoints = data.totalPoints || 0;
    
    // Count total quiz attempts
    let totalAttempts = 0;
    let perfectScores = 0;
    
    Object.values(quizAttempts).forEach(quiz => {
      totalAttempts += quiz.attempts.length;
      quiz.attempts.forEach(attempt => {
        if (attempt.score === attempt.totalQuestions) {
          perfectScores++;
        }
      });
    });
    
    // Award badges based on achievements
    if (totalAttempts >= 10) await awardBadge(userId, courseId, 'quiz_enthusiast');
    if (totalAttempts >= 50) await awardBadge(userId, courseId, 'quiz_master');
    if (perfectScores >= 5) await awardBadge(userId, courseId, 'perfectionist');
    if (totalPoints >= 1000) await awardBadge(userId, courseId, 'point_collector');
    if (totalPoints >= 5000) await awardBadge(userId, courseId, 'point_master');
    
  } catch (error) {
    console.error('[Progress] Error checking achievements:', error);
  }
}

/**
 * Get user's progress for a course
 */
export async function getCourseProgress(userId, courseId) {
  if (!userId) return null;
  
  try {
    const progressRef = doc(db, 'users', userId, 'progress', courseId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) {
      return null;
    }
    
    return progressDoc.data();
  } catch (error) {
    console.error('[Progress] Error getting course progress:', error);
    return null;
  }
}

/**
 * Get all progress for a user across all courses
 */
export async function getAllUserProgress(userId) {
  if (!userId) return [];
  
  try {
    const progressCollection = collection(db, 'users', userId, 'progress');
    const snapshot = await getDocs(progressCollection);
    
    const progress = [];
    snapshot.forEach(doc => {
      progress.push({
        courseId: doc.id,
        ...doc.data()
      });
    });
    
    return progress;
  } catch (error) {
    console.error('[Progress] Error getting all user progress:', error);
    return [];
  }
}
