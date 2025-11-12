import React, { useState, useEffect } from 'react';
import useStore from '../contexts/store';
import { 
  getUnreadNotifications, 
  markNotificationRead, 
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  getUserReminders,
  createStudyReminder,
  deleteReminder,
} from '../services/notificationService';

export default function NotificationCenter({ onClose }) {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' or 'settings'
  const [notifications, setNotifications] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.uid) {
      loadNotifications();
      loadReminders();
      loadPreferences();
    }
  }, [user?.uid]);

  const loadNotifications = async () => {
    if (!user?.uid) return;
    const unread = await getUnreadNotifications(user.uid);
    setNotifications(unread);
    setLoading(false);
  };

  const loadReminders = async () => {
    if (!user?.uid) return;
    const userReminders = await getUserReminders(user.uid);
    setReminders(userReminders);
  };

  const loadPreferences = async () => {
    if (!user?.uid) return;
    const prefs = await getNotificationPreferences(user.uid);
    setPreferences(prefs);
  };

  const handleMarkRead = async (notificationId) => {
    if (!user?.uid) return;
    await markNotificationRead(user.uid, notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    await markAllNotificationsRead(user.uid);
    setNotifications([]);
  };

  const handleDeleteReminder = async (reminderId) => {
    if (!user?.uid) return;
    await deleteReminder(user.uid, reminderId);
    setReminders(prev => prev.filter(r => r.id !== reminderId));
  };

  const handlePreferenceChange = async (key, value) => {
    if (!user?.uid) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await updateNotificationPreferences(user.uid, updated);
  };

  const handleCreateReminder = async () => {
    if (!user?.uid) return;
    
    // Simple reminder creation - in production, this would open a form
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    
    await createStudyReminder(user.uid, {
      title: 'Daily Study Reminder',
      message: 'Time to continue your learning journey!',
      scheduledFor: tomorrow.toISOString(),
      recurring: true,
      recurringPattern: 'daily',
    });
    
    await loadReminders();
  };

  if (loading) {
    return (
      <div className="notification-center">
        <div className="notification-center__header">
          <h3>Notifications</h3>
          <button className="button button--ghost button--sm" onClick={onClose}>✕</button>
        </div>
        <div className="notification-center__loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="notification-center">
      <div className="notification-center__header">
        <h3>Notifications & Reminders</h3>
        <button className="button button--ghost button--sm" onClick={onClose}>✕</button>
      </div>

      <div className="notification-center__tabs">
        <button
          className={`notification-center__tab ${activeTab === 'notifications' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications {notifications.length > 0 && `(${notifications.length})`}
        </button>
        <button
          className={`notification-center__tab ${activeTab === 'reminders' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('reminders')}
        >
          Reminders {reminders.length > 0 && `(${reminders.length})`}
        </button>
        <button
          className={`notification-center__tab ${activeTab === 'settings' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="notification-center__content">
        {activeTab === 'notifications' && (
          <div className="notification-list">
            {notifications.length > 0 ? (
              <>
                <div className="notification-list__header">
                  <button 
                    className="button button--ghost button--sm"
                    onClick={handleMarkAllRead}
                  >
                    Mark all as read
                  </button>
                </div>
                {notifications.map(notif => (
                  <div key={notif.id} className="notification-item">
                    <div className="notification-item__icon">
                      {notif.type === 'achievement' ? '🏆' : 
                       notif.type === 'streak' ? '🔥' : '📢'}
                    </div>
                    <div className="notification-item__content">
                      <div className="notification-item__title">{notif.title}</div>
                      <div className="notification-item__message">{notif.message}</div>
                      <div className="notification-item__time">
                        {notif.createdAt?.toDate ? new Date(notif.createdAt.toDate()).toLocaleString() : 'Just now'}
                      </div>
                    </div>
                    <button
                      className="notification-item__dismiss"
                      onClick={() => handleMarkRead(notif.id)}
                      title="Dismiss"
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <div className="notification-empty">
                <p>🎉 You're all caught up!</p>
                <p className="text-muted">No new notifications</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reminders' && (
          <div className="reminder-list">
            <div className="reminder-list__header">
              <button 
                className="button button--primary button--sm"
                onClick={handleCreateReminder}
              >
                + Create Reminder
              </button>
            </div>
            {reminders.length > 0 ? (
              reminders.map(reminder => (
                <div key={reminder.id} className="reminder-item">
                  <div className="reminder-item__content">
                    <div className="reminder-item__title">{reminder.title}</div>
                    <div className="reminder-item__message">{reminder.message}</div>
                    <div className="reminder-item__schedule">
                      {reminder.recurring && '🔁 Recurring • '}
                      Scheduled: {new Date(reminder.scheduledFor).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="reminder-item__delete"
                    onClick={() => handleDeleteReminder(reminder.id)}
                    title="Delete reminder"
                  >
                    🗑️
                  </button>
                </div>
              ))
            ) : (
              <div className="notification-empty">
                <p>⏰ No active reminders</p>
                <p className="text-muted">Create a reminder to stay on track</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && preferences && (
          <div className="notification-settings">
            <h4>Notification Preferences</h4>
            
            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications}
                  onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
                />
                <span>Email Notifications</span>
              </label>
              <p className="text-muted">Receive important updates via email</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.studyReminders}
                  onChange={(e) => handlePreferenceChange('studyReminders', e.target.checked)}
                />
                <span>Study Reminders</span>
              </label>
              <p className="text-muted">Get reminders to keep your learning streak</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.achievementNotifications}
                  onChange={(e) => handlePreferenceChange('achievementNotifications', e.target.checked)}
                />
                <span>Achievement Notifications</span>
              </label>
              <p className="text-muted">Celebrate when you earn new badges</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.weeklyProgress}
                  onChange={(e) => handlePreferenceChange('weeklyProgress', e.target.checked)}
                />
                <span>Weekly Progress Report</span>
              </label>
              <p className="text-muted">Get a summary of your weekly achievements</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <span>Reminder Time</span>
                <input
                  type="time"
                  value={preferences.reminderTime}
                  onChange={(e) => handlePreferenceChange('reminderTime', e.target.value)}
                  className="notification-setting__time-input"
                />
              </label>
              <p className="text-muted">Default time for daily reminders</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
