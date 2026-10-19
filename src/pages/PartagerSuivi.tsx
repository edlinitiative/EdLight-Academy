/**
 * /partager-suivi — "Partager mon suivi": the student's controls for the
 * read-only progress links they send to a parent (shared/progressShare.ts).
 * Create (7, 30 or 90 days), send or copy, see views, revoke.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import useStore from '../contexts/store';
import { shareRequest } from '../services/progressShareService';
import { canNativeShare } from '../utils/schoolInvite';
import {
  DEFAULT_SHARE_DAYS, SHARE_DURATIONS, SHARE_PRIVACY, daysLeft, shareErrorMessage, shareLink, shareMessage,
  type ShareDuration, type ShareListItem,
} from '../../shared/progressShare';
import '../styles/pf.css';
import './Classes.css';
import './PartagerSuivi.css';

const fmt = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Port-au-Prince' });

export default function PartagerSuivi() {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const isCreole = language === 'ht', t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid = user?.uid;
  const [shares, setShares] = React.useState<ShareListItem[] | null>(null);
  const [days, setDays] = React.useState<ShareDuration>(DEFAULT_SHARE_DAYS);
  const [fresh, setFresh] = React.useState<{ link: string; message: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    if (!uid) return;
    setError(null);
    try { setShares((await shareRequest<{ shares: ShareListItem[] }>('list')).shares); }
    catch (e) { setError(e); }
  }, [uid]);
  React.useEffect(() => { setShares(null); setFresh(null); setNotice(''); void load(); }, [load]);

  if (!uid) {
    return <section className="section classes-page"><h1>{t('Partager mon suivi', 'Pataje swivi mwen')}</h1>
      <p>{t('Connecte-toi pour partager tes progrès avec un parent.', 'Konekte pou pataje pwogrè ou ak yon paran.')}</p>
      <button className="btn btn-primary" onClick={() => useStore.getState().setShowAuthModal(true)}>{t('Se connecter', 'Konekte')}</button></section>;
  }

  async function create() {
    setBusy(true); setError(null); setNotice('');
    try {
      const out = await shareRequest<{ token: string }>('create', { days });
      const link = shareLink(out.token, window.location.origin);
      setFresh({ link, message: shareMessage(link, isCreole ? 'ht' : 'fr') });
      await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  async function send(channel: 'whatsapp' | 'native' | 'copy') {
    if (!fresh) return;
    if (channel === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(fresh.message)}`, '_blank', 'noopener'); return; }
    if (channel === 'native' && canNativeShare()) { try { await navigator.share({ text: fresh.message }); } catch { /* dismissed */ } return; }
    try { await navigator.clipboard.writeText(fresh.message); setNotice(t('Message copié.', 'Mesaj la kopye.')); }
    catch { setNotice(t('Copie impossible. Sélectionne le lien ci-dessus.', 'Nou pa ka kopye l. Seleksyone lyen ki anlè a.')); }
  }
  async function revoke(id: string) {
    if (!window.confirm(t('Désactiver ce lien ? La personne qui l’a ne verra plus ton suivi.', 'Dezaktive lyen sa a? Moun ki genyen l lan p ap wè swivi ou ankò.'))) return;
    setBusy(true); setError(null);
    try { await shareRequest('revoke', { id }); setFresh(null); await load(); setNotice(t('Lien désactivé.', 'Lyen an dezaktive.')); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <section className="section classes-page">
      <header>
        <p className="text-muted">{t('Mon espace', 'Espas mwen')}</p>
        <h1>{t('Partager mon suivi', 'Pataje swivi mwen')}</h1>
        <p>{t('Envoie à un parent un lien en lecture seule vers ton relevé de progression. Pas besoin de compte pour l’ouvrir.', 'Voye yon paran yon lyen pou li sèlman sou relve pwogrè ou. Li pa bezwen kont pou l ouvri l.')}</p>
      </header>
      {error != null && <div role="alert" className="card"><p>{shareErrorMessage(error, language)}</p><button className="btn btn-secondary" disabled={busy} onClick={() => load()}>{t('Réessayer', 'Eseye ankò')}</button></div>}
      {notice && <p role="status">{notice}</p>}

      <div className="card classes-form">
        <h2>{t('Nouveau lien', 'Nouvo lyen')}</h2>
        <p className="pf-note">{SHARE_PRIVACY[isCreole ? 'ht' : 'fr']}</p>
        <fieldset className="share-days">
          <legend>{t('Durée du lien', 'Dire lyen an')}</legend>
          {SHARE_DURATIONS.map((d) => (
            <label key={d}><input type="radio" name="share-days" checked={days === d} onChange={() => setDays(d)} /> {d} {t('jours', 'jou')}</label>
          ))}
        </fieldset>
        <button className="btn btn-primary" disabled={busy} onClick={create}>{t('Créer le lien', 'Kreye lyen an')}</button>
        {fresh && (
          <div className="share-fresh">
            <p>{t('Ton lien est prêt. Il ne sera plus affiché ensuite : envoie-le maintenant.', 'Lyen ou pare. Nou p ap montre l ankò apre sa : voye l kounye a.')}</p>
            <input readOnly value={fresh.link} aria-label={t('Lien de suivi', 'Lyen swivi')} onFocus={(e) => e.currentTarget.select()} />
            <div className="share-actions">
              <button className="btn btn-primary" onClick={() => send('whatsapp')}>WhatsApp</button>
              {canNativeShare() && <button className="btn btn-secondary" onClick={() => send('native')}>{t('Partager', 'Pataje')}</button>}
              <button className="btn btn-secondary" onClick={() => send('copy')}>{t('Copier le message', 'Kopye mesaj la')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>{t('Liens actifs', 'Lyen ki aktif')}</h2>
        {shares == null && error == null && <p role="status">{t('Chargement…', 'Ap chaje…')}</p>}
        {shares?.length === 0 && <p>{t('Aucun lien actif.', 'Pa gen lyen ki aktif.')}</p>}
        <ul className="classes-members">
          {shares?.map((s) => (
            <li key={s.id}>
              <span>
                {t('Créé le', 'Kreye')} {fmt(s.createdAt)} · {t(`expire dans ${daysLeft(s.expiresAt, Date.now())} j`, `ekspire nan ${daysLeft(s.expiresAt, Date.now())} jou`)}
                <br />
                <small className="text-muted">
                  {s.views === 0 ? t('Pas encore ouvert', 'Poko ouvri')
                    : t(`Ouvert ${s.views} fois, dernière fois le ${fmt(s.lastViewedAt || s.createdAt)}`, `Ouvri ${s.views} fwa, dènye fwa ${fmt(s.lastViewedAt || s.createdAt)}`)}
                </small>
              </span>
              <button className="btn btn-secondary" disabled={busy} onClick={() => revoke(s.id)}>{t('Désactiver', 'Dezaktive')}</button>
            </li>
          ))}
        </ul>
        <p className="text-muted">{t('Pour des raisons de sécurité, un lien n’est affiché qu’à sa création. Pour en renvoyer un, crée un nouveau lien.', 'Pou sekirite, nou montre yon lyen sèlman lè ou kreye l. Pou voye youn ankò, kreye yon nouvo lyen.')}</p>
      </div>
      <Link to="/releve" className="pf-link">{t('Voir mon relevé', 'Gade relve mwen')}</Link>
    </section>
  );
}
