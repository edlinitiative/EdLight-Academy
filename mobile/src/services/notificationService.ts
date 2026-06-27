// Mobile stub for notificationService — achievements are shown in-app
// Full push notification support requires expo-notifications (configured separately)

export async function notifyAchievement(_userId: string, _achievement: any) {
  // TODO: use expo-notifications for local push
}

export async function notifyStreak(_userId: string, _streak: any) {
  // TODO: use expo-notifications for streak reminders
}

export async function getUserNotificationPreferences(_userId: string) {
  return {
    studyReminders: true,
    achievementNotifications: true,
    weeklyProgress: true,
  };
}
