import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Check, Trophy, Flame, Megaphone, Repeat, Trash2 } from './icons';
import useStore from '../contexts/store';
import {
  getRecentNotifications,
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
import './NotificationCenter.css';

/*
 * The inbox drawer (design spec S17 / NOTIF-01–04).
 *
 * - "Toutes" keeps read items; "Non lues" filters. Marking read never removes
 *   a row from Toutes, and a failed write puts the row back to unread.
 * - Rows are grouped Aujourd'hui / Plus tôt, with a relative time whose exact
 *   value is in the <time> element. The row's destination is a link; "marquer
 *   comme lu" is a separate button beside it, never nested inside.
 * - Achievement and streak items are written with English text by older
 *   code; their typed fields (badge name, streak days) are enough to render
 *   them in the student's language. Anything else shows its stored text.
 * - A reminder is created only from an explicit form — time, repeat, the
 *   device's time zone and a preview sentence — never by one silent click.
 */

type Tab = 'all' | 'unread' | 'reminders' | 'settings';

/** Only same-site paths are followed; anything else falls back by type. */
function safePath(url: unknown): string | null {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

function createdMs(n: any): number | null {
  const c = n?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.toDate === 'function') return c.toDate().getTime();
  const ms = new Date(c).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export default function NotificationCenter({ onClose }) {
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const locale = isCreole ? 'fr-HT' : 'fr-FR';

  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<any[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [permission, setPermission] = useState(
    () => (typeof window !== 'undefined' ? getPermission() : 'default'),
  );
  const [pushNote, setPushNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reminder form
  const [formOpen, setFormOpen] = useState(false);
  const [formTime, setFormTime] = useState('18:00');
  const [formRepeat, setFormRepeat] = useState<'daily' | 'weekly' | 'once'>('daily');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const timeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }, []);

  const load = async () => {
    if (!user?.uid) return;
    setLoadFailed(false);
    const rows = await getRecentNotifications(user.uid);
    if (rows === null) { setLoadFailed(true); setItems([]); return; }
    setItems(rows);
  };

  useEffect(() => {
    if (!user?.uid) return;
    load();
    getUserReminders(user.uid).then(setReminders);
    getNotificationPreferences(user.uid).then((p) => {
      setPreferences(p);
      if (p?.reminderTime) setFormTime(p.reminderTime);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // A dialog: focus starts on Fermer, Escape closes.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unreadCount = (items || []).filter((n) => !n.read).length;

  /** Title, body and destination in the student's language where the data allows. */
  const present = (n: any) => {
    if (n.type === 'achievement') {
      const name = n.badgeName || String(n.message || '').match(/"([^"]+)"/)?.[1] || '';
      return {
        Icon: Trophy,
        title: t('Nouveau succès', 'Nouvo siksè'),
        body: name ? t(`Tu as gagné le badge «\u00A0${name}\u00A0».`, `Ou genyen badj «\u00A0${name}\u00A0».`) : (n.message || ''),
        to: safePath(n.url) || '/profile',
        action: t('Voir mes badges', 'Wè badj mwen yo'),
      };
    }
    if (n.type === 'streak' && Number(n.streakDays) > 0) {
      const d = Number(n.streakDays);
      return {
        Icon: Flame,
        title: t(`Série de ${d} jours`, `Seri ${d} jou`),
        body: t(`${d} jours d’étude d’affilée. Continue demain pour la garder.`, `${d} jou etid youn dèyè lòt. Kontinye demen pou kenbe l.`),
        to: safePath(n.url) || '/dashboard',
        action: t('Continuer', 'Kontinye'),
      };
    }
    return {
      Icon: Megaphone,
      title: n.title || t('Notification', 'Notifikasyon'),
      body: n.message || '',
      to: safePath(n.url),
      action: t('Ouvrir', 'Louvri'),
    };
  };

  const relative = (ms: number | null) => {
    if (ms === null) return t('À l’instant', 'Kounye a');
    const diff = Date.now() - ms;
    const min = Math.round(diff / 60000);
    if (min < 1) return t('À l’instant', 'Kounye a');
    if (min < 60) return t(`Il y a ${min} min`, `Sa gen ${min} min`);
    const h = Math.round(min / 60);
    if (h < 24) return t(`Il y a ${h} h`, `Sa gen ${h} è`);
    const days = Math.round(h / 24);
    if (days === 1) return t('Hier', 'Ayè');
    if (days < 7) return t(`Il y a ${days} jours`, `Sa gen ${days} jou`);
    return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  };

  const setRead = (id: string, read: boolean) =>
    setItems((prev) => (prev || []).map((n) => (n.id === id ? { ...n, read } : n)));

  const handleMarkRead = async (id: string) => {
    if (!user?.uid) return;
    setRead(id, true);
    const ok = await markNotificationRead(user.uid, id);
    if (!ok) {
      setRead(id, false);
      setNotice(t('Impossible de marquer comme lu. Réessaie.', 'Nou pa t ka make l kòm li. Eseye ankò.'));
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    setNotice(null);
    const { failed } = await markAllNotificationsRead(user.uid);
    await load();
    if (failed !== 0) {
      setNotice(failed < 0
        ? t('Rien n’a pu être marqué comme lu. Vérifie ta connexion.', 'Anyen pa t ka make kòm li. Tcheke koneksyon ou.')
        : t(`${failed} notification${failed > 1 ? 's' : ''} n’${failed > 1 ? 'ont' : 'a'} pas pu être marquée${failed > 1 ? 's' : ''} comme lue${failed > 1 ? 's' : ''}.`, `${failed} notifikasyon pa t ka make kòm li.`));
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!user?.uid) return;
    const before = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    const ok = await deleteReminder(user.uid, id);
    if (ok === false) {
      setReminders(before);
      setNotice(t('Le rappel n’a pas pu être supprimé.', 'Nou pa t ka efase rapèl la.'));
    }
  };

  const handlePreferenceChange = async (key: string, value: any) => {
    if (!user?.uid) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await updateNotificationPreferences(user.uid, updated);
  };

  /** First moment the chosen time happens, from now, on this device's clock. */
  const firstRun = useMemo(() => {
    const [h, m] = formTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }, [formTime, formOpen]);

  const preview = (() => {
    const day = firstRun.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = formTime;
    if (formRepeat === 'daily') return t(`Chaque jour à ${time}, à partir du ${day} — ${timeZone}.`, `Chak jou a ${time}, apati ${day} — ${timeZone}.`);
    if (formRepeat === 'weekly') {
      const wd = firstRun.toLocaleDateString(locale, { weekday: 'long' });
      return t(`Chaque ${wd} à ${time}, à partir du ${day} — ${timeZone}.`, `Chak ${wd} a ${time}, apati ${day} — ${timeZone}.`);
    }
    return t(`Une fois, le ${day} à ${time} — ${timeZone}.`, `Yon sèl fwa, ${day} a ${time} — ${timeZone}.`);
  })();

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setFormSaving(true);
    setFormError(null);
    const id = await createStudyReminder(user.uid, {
      title: t('Rappel d’étude', 'Rapèl etid'),
      message: t('C’est l’heure de réviser.', 'Se lè pou revize.'),
      scheduledFor: firstRun.toISOString(),
      recurring: formRepeat !== 'once',
      recurringPattern: formRepeat === 'once' ? null : formRepeat,
    });
    setFormSaving(false);
    if (!id) {
      // The form stays filled so nothing has to be re-entered.
      setFormError(t('Le rappel n’a pas été enregistré. Réessaie.', 'Rapèl la pa t anrejistre. Eseye ankò.'));
      return;
    }
    setFormOpen(false);
    setReminders(await getUserReminders(user.uid));
  };

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    setPushNote(null);
    if (result === 'granted' && user?.uid) {
      try {
        await subscribeToPush(user.uid);
      } catch {
        // Browser permission is not a server subscription: say which one failed.
        setPushNote(t(
          'Autorisé dans le navigateur, mais l’abonnement aux notifications n’a pas abouti. Les rappels s’afficheront quand le site est ouvert.',
          'Navigatè a otorize, men abònman notifikasyon an pa mache. Rapèl yo ap parèt lè sit la louvri.',
        ));
      }
    }
  };

  const handleTestNotification = async () => {
    const server = await sendSelfTestPush({
      title: 'Test EdLight',
      body: t('Ceci est une notification de test.', 'Sa a se yon notifikasyon tès.'),
      url: '/dashboard',
    });
    if (server && server.delivered > 0) return;
    await showLocalNotification('Test EdLight', {
      body: t('Ceci est une notification de test.', 'Sa a se yon notifikasyon tès.'),
      tag: 'test',
      url: '/dashboard',
    });
  };

  // ── Inbox rows, grouped ──
  const visible = (items || []).filter((n) => (tab === 'unread' ? !n.read : true));
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const groups = [
    { key: 'today', label: t('Aujourd’hui', 'Jodi a'), rows: visible.filter((n) => (createdMs(n) ?? Date.now()) >= startOfToday.getTime()) },
    { key: 'earlier', label: t('Plus tôt', 'Pi bonè'), rows: visible.filter((n) => (createdMs(n) ?? Date.now()) < startOfToday.getTime()) },
  ].filter((g) => g.rows.length > 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: t('Toutes', 'Tout') },
    { key: 'unread', label: unreadCount > 0 ? `${t('Non lues', 'Poko li')} · ${unreadCount}` : t('Non lues', 'Poko li') },
    { key: 'reminders', label: t('Rappels', 'Rapèl') },
    { key: 'settings', label: t('Réglages', 'Reglaj') },
  ];

  return (
    <div className="notification-center nc" role="dialog" aria-modal="true" aria-labelledby="nc-title">
      <header className="nc-head">
        <h2 id="nc-title" className="nc-head__title">{t('Notifications', 'Notifikasyon')}</h2>
        <button ref={closeRef} type="button" className="nc-head__close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
          <span className="nc-sr">{t('Fermer', 'Fèmen')}</span>
        </button>
      </header>

      <div className="nc-tabs" role="tablist" aria-label={t('Sections', 'Seksyon')}>
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`nc-tab${tab === x.key ? ' is-on' : ''}`}
            onClick={() => { setTab(x.key); setNotice(null); }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="nc-body">
        {notice && <p className="nc-notice" role="status">{notice}</p>}

        {(tab === 'all' || tab === 'unread') && (
          items === null ? (
            <div className="nc-loading" aria-busy="true"><div className="loading-spinner" /></div>
          ) : loadFailed ? (
            <div className="nc-empty">
              <p>{t('Les notifications n’ont pas pu être chargées.', 'Notifikasyon yo pa t ka chaje.')}</p>
              <button type="button" className="button button--ghost button--sm" onClick={load}>{t('Réessayer', 'Eseye ankò')}</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="nc-empty">
              {tab === 'unread' ? (
                <>
                  <p>{t('Tout est à jour.', 'Tout bagay ajou.')}</p>
                  {(items || []).length > 0 && (
                    <button type="button" className="nc-link" onClick={() => setTab('all')}>{t('Voir toutes les notifications', 'Wè tout notifikasyon yo')}</button>
                  )}
                </>
              ) : (
                <p>{t('Aucune notification pour le moment.', 'Pa gen notifikasyon pou kounye a.')}</p>
              )}
            </div>
          ) : (
            <>
              {unreadCount > 0 && (
                <div className="nc-bar">
                  <button type="button" className="nc-link" onClick={handleMarkAllRead}>{t('Tout marquer comme lu', 'Make tout kòm li')}</button>
                </div>
              )}
              {groups.map((g) => (
                <section key={g.key} className="nc-group" aria-label={g.label}>
                  <h3 className="nc-group__title">{g.label}</h3>
                  <ul className="nc-list">
                    {g.rows.map((n) => {
                      const p = present(n);
                      const ms = createdMs(n);
                      const inner = (
                        <>
                          <span className={`nc-row__icon nc-row__icon--${n.type || 'info'}`} aria-hidden="true"><p.Icon size={18} /></span>
                          <span className="nc-row__text">
                            <span className="nc-row__title">
                              {!n.read && <span className="nc-row__dot"><span className="nc-sr">{t('Non lue : ', 'Poko li : ')}</span></span>}
                              {p.title}
                            </span>
                            {p.body && <span className="nc-row__body">{p.body}</span>}
                            <time className="nc-row__time" dateTime={ms ? new Date(ms).toISOString() : undefined} title={ms ? new Date(ms).toLocaleString(locale) : undefined}>
                              {relative(ms)}
                            </time>
                          </span>
                        </>
                      );
                      return (
                        <li key={n.id} className={`nc-row${n.read ? '' : ' is-unread'}`}>
                          {p.to ? (
                            <Link
                              className="nc-row__main"
                              to={p.to}
                              onClick={() => { if (!n.read) handleMarkRead(n.id); onClose(); }}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="nc-row__main">{inner}</div>
                          )}
                          {!n.read && (
                            <button type="button" className="nc-row__read" onClick={() => handleMarkRead(n.id)}>
                              <Check size={16} aria-hidden="true" />
                              <span className="nc-sr">{t('Marquer comme lu', 'Make kòm li')}</span>
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )
        )}

        {tab === 'reminders' && (
          <div className="nc-reminders">
            {formOpen ? (
              <form className="nc-form" onSubmit={handleCreateReminder}>
                <h3 className="nc-form__title">{t('Nouveau rappel', 'Nouvo rapèl')}</h3>
                <label className="nc-field">
                  <span>{t('Heure', 'Lè')}</span>
                  <input type="time" lang="fr" required value={formTime} onChange={(e) => setFormTime(e.target.value)} />
                </label>
                <fieldset className="nc-field nc-field--choice">
                  <legend>{t('Répétition', 'Repetisyon')}</legend>
                  {([
                    ['daily', t('Chaque jour', 'Chak jou')],
                    ['weekly', t('Chaque semaine', 'Chak semèn')],
                    ['once', t('Une seule fois', 'Yon sèl fwa')],
                  ] as const).map(([v, label]) => (
                    <label key={v} className={`nc-choice${formRepeat === v ? ' is-on' : ''}`}>
                      <input type="radio" name="nc-repeat" value={v} checked={formRepeat === v} onChange={() => setFormRepeat(v)} />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <p className="nc-preview">{preview}</p>
                {formError && <p className="nc-notice" role="alert">{formError}</p>}
                <div className="nc-form__actions">
                  <button type="submit" className="button button--primary" disabled={formSaving}>
                    {formSaving ? t('Enregistrement…', 'N ap anrejistre…') : t('Créer le rappel', 'Kreye rapèl la')}
                  </button>
                  <button type="button" className="button button--ghost" onClick={() => { setFormOpen(false); setFormError(null); }}>
                    {t('Annuler', 'Anile')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="nc-bar nc-bar--start">
                <button type="button" className="button button--primary button--sm" onClick={() => setFormOpen(true)}>
                  {t('Nouveau rappel', 'Nouvo rapèl')}
                </button>
              </div>
            )}

            {reminders.length > 0 ? (
              <ul className="nc-list">
                {reminders.map((r) => (
                  <li key={r.id} className="nc-row">
                    <div className="nc-row__main">
                      <span className="nc-row__icon" aria-hidden="true"><Repeat size={18} /></span>
                      <span className="nc-row__text">
                        <span className="nc-row__title">{r.title}</span>
                        <span className="nc-row__body">
                          {r.recurring
                            ? (r.recurringPattern === 'weekly' ? t('Chaque semaine', 'Chak semèn') : r.recurringPattern === 'monthly' ? t('Chaque mois', 'Chak mwa') : t('Chaque jour', 'Chak jou'))
                            : t('Une fois', 'Yon fwa')}
                          {' · '}
                          {t('prochain', 'pwochen')} {new Date(r.scheduledFor).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    </div>
                    <button type="button" className="nc-row__read" onClick={() => handleDeleteReminder(r.id)}>
                      <Trash2 size={16} aria-hidden="true" />
                      <span className="nc-sr">{t('Supprimer le rappel', 'Efase rapèl la')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !formOpen && (
              <div className="nc-empty"><p>{t('Aucun rappel pour le moment.', 'Pa gen rapèl pou kounye a.')}</p></div>
            )}
          </div>
        )}

        {tab === 'settings' && preferences && (
          <div className="nc-settings">
            <div className="nc-setting">
              <div>
                <strong>{t('Notifications sur cet appareil', 'Notifikasyon sou aparèy sa a')}</strong>
                <p>
                  {!isNotificationSupported()
                    ? t('Ce navigateur ne prend pas en charge les notifications.', 'Navigatè sa a pa sipòte notifikasyon.')
                    : permission === 'granted'
                      ? t('Autorisées dans ce navigateur.', 'Otorize nan navigatè sa a.')
                      : permission === 'denied'
                        ? t('Bloquées. Pour les réactiver, ouvre les réglages du site dans ton navigateur (icône à gauche de l’adresse).', 'Bloke. Pou reaktive yo, louvri reglaj sit la nan navigatè ou (ikòn bò gòch adrès la).')
                        : t('Pour recevoir tes rappels même quand le site est fermé.', 'Pou resevwa rapèl ou yo menm lè sit la fèmen.')}
                </p>
                {pushNote && <p className="nc-notice">{pushNote}</p>}
              </div>
              {isNotificationSupported() && permission === 'default' && (
                <button type="button" className="button button--primary button--sm" onClick={handleEnableNotifications}>{t('Activer', 'Aktive')}</button>
              )}
            </div>

            {([
              ['emailNotifications', t('E-mails', 'Imèl'), t('Les mises à jour importantes par e-mail.', 'Mizajou enpòtan yo pa imèl.')],
              ['studyReminders', t('Rappels d’étude', 'Rapèl etid'), t('Tes rappels et les relances pour garder ta série.', 'Rapèl ou yo ak relans pou kenbe seri ou.')],
              ['achievementNotifications', t('Succès', 'Siksè'), t('Quand tu gagnes un badge ou une série.', 'Lè ou genyen yon badj oswa yon seri.')],
              ['weeklyProgress', t('Bilan de la semaine', 'Bilan semèn nan'), t('Un résumé de tes progrès chaque semaine.', 'Yon rezime pwogrè ou chak semèn.')],
            ] as const).map(([key, label, help]) => (
              <label key={key} className="nc-setting nc-setting--toggle">
                <span>
                  <strong>{label}</strong>
                  <p>{help}</p>
                </span>
                <input type="checkbox" checked={!!preferences[key]} onChange={(e) => handlePreferenceChange(key, e.target.checked)} />
              </label>
            ))}

            {permission === 'granted' && (
              <button type="button" className="nc-link nc-link--quiet" onClick={handleTestNotification}>
                {t('Envoyer une notification de test', 'Voye yon notifikasyon tès')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
