import React, { useState, useEffect } from 'react';
import { X, Check, Trophy, Flame, Megaphone, PartyPopper, Repeat, Trash2, Clock, BellRing } from 'lucide-react';
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
import {
  getPermission,
  requestNotificationPermission,
  isNotificationSupported,
  showLocalNotification,
  subscribeToPush,
  sendSelfTestPush,
} from '../services/pushNotificationService';

export default function NotificationCenter({ onClose }) {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' or 'settings'
  const [notifications, setNotifications] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(
    () => (typeof window !== 'undefined' ? getPermission() : 'default')
  );

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
      title: "Rappel d'étude quotidien",
      message: 'Continue ton apprentissage ✨',
      scheduledFor: tomorrow.toISOString(),
      recurring: true,
      recurringPattern: 'daily',
    });
    
    await loadReminders();
  };

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      if (user?.uid) {
        try {
          await subscribeToPush(user.uid);
        } catch {
          /* push optional */
        }
      }
      await showLocalNotification('Notifications activées ✅', {
        body: 'Tu recevras tes rappels et tes succès ici.',
        tag: 'welcome',
        url: '/dashboard',
      });
    }
  };

  const handleTestNotification = async () => {
    // Prefer the server path (this is what fires when the app is closed). If the
    // backend isn't configured or reached no devices, fall back to a local one.
    const server = await sendSelfTestPush({
      title: 'Test EdLight 🔔',
      body: 'Ceci est une notification de test.',
      url: '/dashboard',
    });
    if (server && server.delivered > 0) return;
    await showLocalNotification('Test EdLight 🔔', {
      body: 'Ceci est une notification de test.',
      tag: 'test',
      url: '/dashboard',
    });
  };

  if (loading) {
    return (
      <div className="notification-center">
        <div className="notification-center__header">
          <h3>Notifications</h3>
          <button className="button button--ghost button--sm" onClick={onClose}><X size={16} /></button>
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
        <h3>Notifications et rappels</h3>
        <button className="button button--ghost button--sm" onClick={onClose}><X size={16} /></button>
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
          Rappels {reminders.length > 0 && `(${reminders.length})`}
        </button>
        <button
          className={`notification-center__tab ${activeTab === 'settings' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Réglages
        </button>
      </div>

      <div className="notification-center__content">
        {isNotificationSupported() && permission !== 'granted' && (
          <div className="notification-permission">
            <div className="notification-permission__icon"><BellRing size={20} /></div>
            <div className="notification-permission__text">
              <strong>Activer les notifications</strong>
              <span>Reçois tes rappels d'étude et tes succès, même quand l'app est en arrière-plan.</span>
            </div>
            {permission === 'denied' ? (
              <span className="notification-permission__blocked">Bloquées dans le navigateur</span>
            ) : (
              <button className="button button--primary button--sm" onClick={handleEnableNotifications}>
                Activer
              </button>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="notification-list">
            {notifications.length > 0 ? (
              <>
                <div className="notification-list__header">
                  <button 
                    className="button button--ghost button--sm"
                    onClick={handleMarkAllRead}
                  >
                    Tout marquer comme lu
                  </button>
                </div>
                {notifications.map(notif => (
                  <div key={notif.id} className="notification-item">
                    <div className="notification-item__icon">
                      {notif.type === 'achievement' ? <Trophy size={20} /> : 
                       notif.type === 'streak' ? <Flame size={20} /> : <Megaphone size={20} />}
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
                      <Check size={16} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <div className="notification-empty">
                <p><PartyPopper size={18} /> Tu es à jour !</p>
                <p className="text-muted">Aucune nouvelle notification</p>
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
                + Créer un rappel
              </button>
            </div>
            {reminders.length > 0 ? (
              reminders.map(reminder => (
                <div key={reminder.id} className="reminder-item">
                  <div className="reminder-item__content">
                    <div className="reminder-item__title">{reminder.title}</div>
                    <div className="reminder-item__message">{reminder.message}</div>
                    <div className="reminder-item__schedule">
                      {reminder.recurring && <><Repeat size={12} /> Récurrent • </>}
                      Prévu : {new Date(reminder.scheduledFor).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="reminder-item__delete"
                    onClick={() => handleDeleteReminder(reminder.id)}
                    title="Delete reminder"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="notification-empty">
                <p><Clock size={18} /> Aucun rappel actif</p>
                <p className="text-muted">Crée un rappel pour rester régulier</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && preferences && (
          <div className="notification-settings">
            <h4>Préférences de notification</h4>
            
            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications}
                  onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
                />
                <span>Notifications par e-mail</span>
              </label>
              <p className="text-muted">Reçois les mises à jour importantes par e-mail</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.studyReminders}
                  onChange={(e) => handlePreferenceChange('studyReminders', e.target.checked)}
                />
                <span>Rappels d'étude</span>
              </label>
              <p className="text-muted">Reçois des rappels pour garder ta série d'apprentissage</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.achievementNotifications}
                  onChange={(e) => handlePreferenceChange('achievementNotifications', e.target.checked)}
                />
                <span>Notifications de succès</span>
              </label>
              <p className="text-muted">Célèbre chaque nouveau badge gagné</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.weeklyProgress}
                  onChange={(e) => handlePreferenceChange('weeklyProgress', e.target.checked)}
                />
                <span>Rapport de progrès hebdomadaire</span>
              </label>
              <p className="text-muted">Reçois un résumé de tes progrès de la semaine</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <span>Heure du rappel</span>
                <input
                  type="time"
                  value={preferences.reminderTime}
                  onChange={(e) => handlePreferenceChange('reminderTime', e.target.value)}
                  className="notification-setting__time-input"
                />
              </label>
              <p className="text-muted">Heure par défaut des rappels quotidiens</p>
            </div>

            <div className="notification-setting">
              <div className="notification-setting__label">
                <span>Notifications sur cet appareil</span>
                {permission === 'granted' ? (
                  <button className="button button--ghost button--sm" onClick={handleTestNotification}>
                    Tester
                  </button>
                ) : permission === 'denied' ? (
                  <span className="text-muted">Bloquées</span>
                ) : (
                  <button className="button button--primary button--sm" onClick={handleEnableNotifications}>
                    Activer
                  </button>
                )}
              </div>
              <p className="text-muted">
                {permission === 'granted'
                  ? 'Activées — tu recevras rappels et succès sur cet appareil.'
                  : 'Autorise les notifications pour recevoir tes rappels.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
