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
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
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
      title: t("Rappel d'étude quotidien", 'Rapèl etid chak jou'),
      message: t('Continue ton apprentissage ✨', 'Kontinye aprann ✨'),
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
      await showLocalNotification(t('Notifications activées ✅', 'Notifikasyon aktive ✅'), {
        body: t('Tu recevras tes rappels et tes succès ici.', 'W ap resevwa rapèl ou yo ak siksè ou yo isit la.'),
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
      body: t('Ceci est une notification de test.', 'Sa a se yon notifikasyon tès.'),
      url: '/dashboard',
    });
    if (server && server.delivered > 0) return;
    await showLocalNotification('Test EdLight 🔔', {
      body: t('Ceci est une notification de test.', 'Sa a se yon notifikasyon tès.'),
      tag: 'test',
      url: '/dashboard',
    });
  };

  if (loading) {
    return (
      <div className="notification-center">
        <div className="notification-center__header">
          <h3>{t('Notifications', 'Notifikasyon')}</h3>
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
        <h3>{t('Notifications et rappels', 'Notifikasyon ak rapèl')}</h3>
        <button className="button button--ghost button--sm" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="notification-center__tabs">
        <button
          className={`notification-center__tab ${activeTab === 'notifications' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          {t('Notifications', 'Notifikasyon')} {notifications.length > 0 && `(${notifications.length})`}
        </button>
        <button
          className={`notification-center__tab ${activeTab === 'reminders' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('reminders')}
        >
          {t('Rappels', 'Rapèl')} {reminders.length > 0 && `(${reminders.length})`}
        </button>
        <button
          className={`notification-center__tab ${activeTab === 'settings' ? 'notification-center__tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          {t('Réglages', 'Reglaj')}
        </button>
      </div>

      <div className="notification-center__content">
        {isNotificationSupported() && permission !== 'granted' && (
          <div className="notification-permission">
            <div className="notification-permission__icon"><BellRing size={20} /></div>
            <div className="notification-permission__text">
              <strong>{t('Activer les notifications', 'Aktive notifikasyon yo')}</strong>
              <span>{t("Reçois tes rappels d'étude et tes succès, même quand l'app est en arrière-plan.", "Resevwa rapèl etid ou yo ak siksè ou yo, menm lè app la nan background.")}</span>
            </div>
            {permission === 'denied' ? (
              <span className="notification-permission__blocked">{t('Bloquées dans le navigateur', 'Bloke nan navigatè a')}</span>
            ) : (
              <button className="button button--primary button--sm" onClick={handleEnableNotifications}>
                {t('Activer', 'Aktive')}
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
                    {t('Tout marquer comme lu', 'Make tout kòm li')}
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
                        {notif.createdAt?.toDate ? new Date(notif.createdAt.toDate()).toLocaleString() : t('À l’instant', 'Kounye a')}
                      </div>
                    </div>
                    <button
                      className="notification-item__dismiss"
                      onClick={() => handleMarkRead(notif.id)}
                      title={t('Marquer comme lu', 'Make kòm li')}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <div className="notification-empty">
                <p><PartyPopper size={18} /> {t('Tu es à jour !', 'Ou ajou !')}</p>
                <p className="text-muted">{t('Aucune nouvelle notification', 'Pa gen nouvo notifikasyon')}</p>
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
                {t('+ Créer un rappel', '+ Kreye yon rapèl')}
              </button>
            </div>
            {reminders.length > 0 ? (
              reminders.map(reminder => (
                <div key={reminder.id} className="reminder-item">
                  <div className="reminder-item__content">
                    <div className="reminder-item__title">{reminder.title}</div>
                    <div className="reminder-item__message">{reminder.message}</div>
                    <div className="reminder-item__schedule">
                      {reminder.recurring && <><Repeat size={12} /> {t('Récurrent', 'Repetitif')} • </>}
                      {t('Prévu :', 'Previ :')} {new Date(reminder.scheduledFor).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="reminder-item__delete"
                    onClick={() => handleDeleteReminder(reminder.id)}
                    title={t('Supprimer le rappel', 'Efase rapèl la')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="notification-empty">
                <p><Clock size={18} /> {t('Aucun rappel actif', 'Pa gen rapèl aktif')}</p>
                <p className="text-muted">{t('Crée un rappel pour rester régulier', 'Kreye yon rapèl pou ou rete regilye')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && preferences && (
          <div className="notification-settings">
            <h4>{t('Préférences de notification', 'Preferans notifikasyon')}</h4>
            
            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications}
                  onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
                />
                <span>{t('Notifications par e-mail', 'Notifikasyon pa imèl')}</span>
              </label>
              <p className="text-muted">{t('Reçois les mises à jour importantes par e-mail', 'Resevwa mizajou enpòtan yo pa imèl')}</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.studyReminders}
                  onChange={(e) => handlePreferenceChange('studyReminders', e.target.checked)}
                />
                <span>{t("Rappels d'étude", 'Rapèl etid')}</span>
              </label>
              <p className="text-muted">{t("Reçois des rappels pour garder ta série d'apprentissage", 'Resevwa rapèl pou kenbe seri aprantisaj ou')}</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.achievementNotifications}
                  onChange={(e) => handlePreferenceChange('achievementNotifications', e.target.checked)}
                />
                <span>{t('Notifications de succès', 'Notifikasyon siksè')}</span>
              </label>
              <p className="text-muted">{t('Célèbre chaque nouveau badge gagné', 'Selebre chak nouvo badj ou genyen')}</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input
                  type="checkbox"
                  checked={preferences.weeklyProgress}
                  onChange={(e) => handlePreferenceChange('weeklyProgress', e.target.checked)}
                />
                <span>{t('Rapport de progrès hebdomadaire', 'Rapò pwogrè chak semèn')}</span>
              </label>
              <p className="text-muted">{t('Reçois un résumé de tes progrès de la semaine', 'Resevwa yon rezime pwogrè ou pou semèn nan')}</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <span>{t('Heure du rappel', 'Lè rapèl la')}</span>
                <input
                  type="time"
                  value={preferences.reminderTime}
                  onChange={(e) => handlePreferenceChange('reminderTime', e.target.value)}
                  className="notification-setting__time-input"
                />
              </label>
              <p className="text-muted">{t('Heure par défaut des rappels quotidiens', 'Lè pa defo pou rapèl chak jou yo')}</p>
            </div>

            <div className="notification-setting">
              <div className="notification-setting__label">
                <span>{t('Notifications sur cet appareil', 'Notifikasyon sou aparèy sa a')}</span>
                {permission === 'granted' ? (
                  <button className="button button--ghost button--sm" onClick={handleTestNotification}>
                    {t('Tester', 'Teste')}
                  </button>
                ) : permission === 'denied' ? (
                  <span className="text-muted">{t('Bloquées', 'Bloke')}</span>
                ) : (
                  <button className="button button--primary button--sm" onClick={handleEnableNotifications}>
                    {t('Activer', 'Aktive')}
                  </button>
                )}
              </div>
              <p className="text-muted">
                {permission === 'granted'
                  ? t('Activées — tu recevras rappels et succès sur cet appareil.', 'Aktive — w ap resevwa rapèl ak siksè sou aparèy sa a.')
                  : t('Autorise les notifications pour recevoir tes rappels.', 'Otorize notifikasyon yo pou ou resevwa rapèl ou yo.')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
