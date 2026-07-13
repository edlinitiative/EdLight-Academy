import { auth, db } from './firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { showLocalNotification, getPermission } from './pushNotificationService';

/**
 * Notification preferences and reminders system
 */

// Default notification preferences
const DEFAULT_PREFERENCES = {
  emailNotifications: true,
  studyReminders: true,
  achievementNotifications: true,
  weeklyProgress: true,
  reminderTime: '18:00', // 6 PM default
  reminderDays: ['monday', 'wednesday', 'friday'], // Default reminder days
};

/**
 * Get user's notification preferences
 */
export async function getNotificationPreferences(userId) {
  try {
    const prefDoc = await getDoc(doc(db, 'users', userId, 'settings', 'notifications'));
    
    if (prefDoc.exists()) {
      return { ...DEFAULT_PREFERENCES, ...prefDoc.data() };
    }
    
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Update user's notification preferences
 */
export async function updateNotificationPreferences(userId, preferences) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'settings', 'notifications'),
      {
        ...preferences,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    
    return true;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return false;
  }
}

/**
 * Create a study reminder
 */
export async function createStudyReminder(userId, reminderData) {
  try {
    const reminderId = `reminder-${Date.now()}`;
    
    await setDoc(doc(db, 'users', userId, 'reminders', reminderId), {
      id: reminderId,
      type: 'study',
      title: reminderData.title || 'Study Reminder',
      message: reminderData.message || 'Time to continue your learning!',
      courseId: reminderData.courseId,
      scheduledFor: reminderData.scheduledFor, // ISO timestamp
      recurring: reminderData.recurring || false,
      recurringPattern: reminderData.recurringPattern || null, // 'daily', 'weekly', etc.
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    
    return reminderId;
  } catch (error) {
    console.error('Error creating study reminder:', error);
    return null;
  }
}

/**
 * Get all reminders for a user
 */
export async function getUserReminders(userId) {
  try {
    const remindersRef = collection(db, 'users', userId, 'reminders');
    const q = query(remindersRef, where('status', '==', 'pending'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting user reminders:', error);
    return [];
  }
}

/**
 * Delete a reminder
 */
export async function deleteReminder(userId, reminderId) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'reminders', reminderId));
    return true;
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return false;
  }
}

/**
 * Mark reminder as sent
 */
export async function markReminderSent(userId, reminderId) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'reminders', reminderId),
      {
        status: 'sent',
        sentAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    return false;
  }
}

/**
 * Raise an OS notification for an in-app event, gated on the user's preference
 * flag. Best-effort: never throws, so it can't break the calling write.
 */
async function maybeShowOsNotification(userId, prefKey, title, options) {
  try {
    const prefs = await getNotificationPreferences(userId);
    if (prefs[prefKey] === false) return;
    await showLocalNotification(title, options);
  } catch (error) {
    console.warn('[Notifications] OS notification skipped:', error);
  }
}

/**
 * Deliver a notification to all of this user's subscribed devices via the
 * server-side Web Push API (/api/send-push). Works even when the PWA is closed.
 * Best-effort — never throws.
 */
async function sendServerPush(
  title: string,
  options: { body?: string; url?: string; tag?: string },
): Promise<void> {
  // Only attempt when permission is granted and the user is signed in
  if (getPermission() !== 'granted') return;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ title, ...options }),
    });
  } catch {
    // offline or backend unavailable — local notification already fired above
  }
}

/**
 * Create notification for achievement
 */
export async function notifyAchievement(userId, achievement) {
  try {
    const notificationId = `notif-${Date.now()}`;
    
    await setDoc(doc(db, 'users', userId, 'notifications', notificationId), {
      id: notificationId,
      type: 'achievement',
      title: 'New Achievement! 🎉',
      message: `You've earned the "${achievement.name}" badge!`,
      badgeId: achievement.badgeId,
      icon: achievement.icon,
      read: false,
      createdAt: serverTimestamp(),
    });

    const body = `Tu as gagné le badge « ${achievement.name} » ! ${achievement.icon || ''}`.trim();
    const notifOpts = { body, tag: `achievement-${achievement.badgeId}`, url: '/dashboard' };

    // Local notification (foreground / SW) + server push (when app is closed).
    await maybeShowOsNotification(userId, 'achievementNotifications', 'Nouveau succès ! 🎉', notifOpts);
    await sendServerPush('Nouveau succès ! 🎉', notifOpts);

    return notificationId;
  } catch (error) {
    console.error('Error creating achievement notification:', error);
    return null;
  }
}

/**
 * Create notification for streak milestone
 */
export async function notifyStreak(userId, streakDays) {
  try {
    const notificationId = `notif-${Date.now()}`;
    const milestoneMessages = {
      7: '🔥 Amazing! You have a 7-day study streak!',
      30: '⚡ Incredible! 30 days of consistent learning!',
      100: '👑 Legendary! 100-day study streak achieved!',
    };
    
    const message = milestoneMessages[streakDays] || `🔥 You're on a ${streakDays}-day streak!`;
    
    await setDoc(doc(db, 'users', userId, 'notifications', notificationId), {
      id: notificationId,
      type: 'streak',
      title: 'Streak Milestone!',
      message,
      streakDays,
      read: false,
      createdAt: serverTimestamp(),
    });

    const notifOpts = { body: message, tag: `streak-${streakDays}`, url: '/dashboard' };
    await maybeShowOsNotification(userId, 'achievementNotifications', 'Série en cours ! 🔥', notifOpts);
    await sendServerPush('Série en cours ! 🔥', notifOpts);

    return notificationId;
  } catch (error) {
    console.error('Error creating streak notification:', error);
    return null;
  }
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId) {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting unread notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(userId, notificationId) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'notifications', notificationId),
      {
        read: true,
        readAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(userId) {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    
    const promises = snapshot.docs.map(doc =>
      setDoc(
        doc.ref,
        {
          read: true,
          readAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
    
    await Promise.all(promises);
    return true;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return false;
  }
}

/**
 * Fire a local + server push when the user enters the top 10 on the weekly
 * leaderboard. Best-effort — never throws.
 */
export async function notifyLeaderboardRank(userId: string, rank: number): Promise<void> {
  if (rank > 10) return;
  const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
  const title = `${icon} Tu es #${rank} du classement !`;
  const body = `Continue ainsi pour rester dans le top ${rank <= 3 ? '3' : '10'} cette semaine.`;
  const opts = { body, tag: 'leaderboard-rank', url: '/jeux' };
  try {
    await maybeShowOsNotification(userId, 'achievementNotifications', title, opts);
    await sendServerPush(title, opts);
  } catch {
    // best-effort
  }
}

/**
 * Check for incomplete lessons and suggest reminders
 */
export async function suggestStudyReminders(userId, courseId, progress) {
  const suggestions = [];
  
  try {
    // If user hasn't studied in 2+ days, suggest a reminder
    if (progress.lastStudyDate) {
      const lastStudy = new Date(progress.lastStudyDate);
      const daysSince = Math.floor((Date.now() - lastStudy.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince >= 2) {
        suggestions.push({
          type: 'inactivity',
          message: `You haven't studied ${courseId} in ${daysSince} days. Set a reminder?`,
          suggestedTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        });
      }
    }
    
    // If streak is about to break, suggest reminder
    if (progress.currentStreak > 0) {
      const lastStudy = new Date(progress.lastStudyDate);
      const hoursSince = (Date.now() - lastStudy.getTime()) / (1000 * 60 * 60);
      
      if (hoursSince > 20 && hoursSince < 24) {
        suggestions.push({
          type: 'streak_risk',
          message: `Your ${progress.currentStreak}-day streak is at risk! Study today to keep it going.`,
          urgent: true,
        });
      }
    }
    
    return suggestions;
  } catch (error) {
    console.error('Error suggesting study reminders:', error);
    return [];
  }
}
