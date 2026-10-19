/**
 * /ambassadeur — a designated school ambassador's dashboard: their invite
 * code and link, recruits, RETAINED recruits (shared/ambassadors.ts defines
 * it) and how their school stands. Every number is computed by the server.
 */
import React from 'react';
import useStore from '../contexts/store';
import { ambassadorRequest } from '../services/ambassadorService';
import { canNativeShare, schoolInviteMessage, sendInvite } from '../utils/schoolInvite';
import { AMBASSADOR_RULES, ambassadorErrorMessage, type AmbassadorDashboard } from '../../shared/ambassadors';
import './Classes.css';
import './PartagerSuivi.css';

export default function Ambassadeur() {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const isCreole = language === 'ht', t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid = user?.uid;
  const [data, setData] = React.useState<AmbassadorDashboard | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError(null);
    try { setData(await ambassadorRequest<AmbassadorDashboard>('dashboard')); }
    catch (e) { setError(e); } finally { setLoading(false); }
  }, [uid]);
  React.useEffect(() => { setData(null); void load(); }, [load]);

  if (!uid) {
    return <section className="section classes-page"><h1>{t('Ambassadeur', 'Anbasadè')}</h1>
      <button className="btn btn-primary" onClick={() => useStore.getState().setShowAuthModal(true)}>{t('Se connecter', 'Konekte')}</button></section>;
  }
  const message = data?.link ? schoolInviteMessage(data.school, data.code, data.link, isCreole) : '';
  const share = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    if (await sendInvite(channel, message, 'ambassador')) setNotice(t('Message copié.', 'Mesaj la kopye.'));
  };
  const figures = (s: AmbassadorDashboard['total']) => (
    <dl className="amb-figures">
      <div><dt>{t('Recrues', 'Rekri')}</dt><dd>{s.recruits}</dd></div>
      <div><dt>{t('Recrues actives', 'Rekri aktif')}</dt><dd>{s.retained}</dd></div>
      <div><dt>{t('En cours', 'An kou')}</dt><dd>{s.pending}</dd></div>
    </dl>
  );
  const standing = (label: string, s: AmbassadorDashboard['schoolProgress']['week']) => (
    <li><span>{label}</span><span>{s ? t(`${s.rank}e sur ${s.of} · ${s.totalXp} XP · ${s.members} élèves`, `${s.rank}yèm sou ${s.of} · ${s.totalXp} XP · ${s.members} elèv`) : t('pas encore au classement', 'poko nan klasman an')}</span></li>
  );

  return (
    <section className="section classes-page">
      <header>
        <p className="text-muted">{t('Programme ambassadeurs', 'Pwogram anbasadè')}</p>
        <h1>{data ? data.school : t('Ambassadeur', 'Anbasadè')}</h1>
      </header>
      {loading && <p role="status">{t('Chargement…', 'Ap chaje…')}</p>}
      {error != null && <div role="alert" className="card"><p>{ambassadorErrorMessage(error, language)}</p><button className="btn btn-secondary" disabled={loading} onClick={() => load()}>{t('Réessayer', 'Eseye ankò')}</button></div>}
      {notice && <p role="status">{notice}</p>}
      {data && <>
        <div className="card classes-form">
          <h2>{t('Mon invitation', 'Envitasyon mwen')}</h2>
          {data.code ? <>
            <p>{t('Ton code', 'Kòd ou')} : <strong className="classes-code">{data.code}</strong></p>
            <p className="text-muted">{data.link}</p>
            <div className="share-actions">
              <button className="btn btn-primary" onClick={() => share('whatsapp')}>WhatsApp</button>
              {canNativeShare() && <button className="btn btn-secondary" onClick={() => share('native')}>{t('Partager', 'Pataje')}</button>}
              <button className="btn btn-secondary" onClick={() => share('copy')}>{t('Copier', 'Kopye')}</button>
            </div>
          </> : <p>{t('Code indisponible pour le moment. Réessaie plus tard.', 'Kòd la pa disponib kounye a. Eseye pita.')}</p>}
        </div>
        <div className="card">
          <h2>{t('Ce mois-ci', 'Mwa sa a')} ({data.period})</h2>
          {figures(data.thisPeriod)}
          <h3>{t('Depuis le début', 'Depi nan kòmansman')}</h3>
          {figures(data.total)}
          <p className="text-muted">{t(
            `Une recrue active est un nouveau compte inscrit avec ton code qui a étudié au moins ${AMBASSADOR_RULES.retainedMinDays} jours différents pendant ses ${AMBASSADOR_RULES.retentionWindowDays} premiers jours. Les chiffres sont calculés par EdLight et mis à jour quand tu ouvres cette page.`,
            `Yon rekri aktif se yon nouvo kont ki enskri ak kòd ou epi ki etidye omwen ${AMBASSADOR_RULES.retainedMinDays} jou diferan pandan ${AMBASSADOR_RULES.retentionWindowDays} premye jou li yo. EdLight kalkile chif yo epi mete yo ajou lè ou ouvri paj sa a.`)}</p>
          <p className="text-muted">{t('Les récompenses sont décidées et remises par l’équipe EdLight, en dehors de l’application.', 'Ekip EdLight deside epi remèt rekonpans yo, andeyò aplikasyon an.')}</p>
        </div>
        <div className="card">
          <h2>{t('Mon école au classement', 'Lekòl mwen nan klasman an')}</h2>
          <ul className="classes-members">
            {standing(t('Cette semaine', 'Semèn sa a'), data.schoolProgress.week)}
            {standing(t('Depuis le début', 'Depi nan kòmansman'), data.schoolProgress.allTime)}
          </ul>
        </div>
        <button className="btn btn-secondary" disabled={loading} onClick={() => load()}>{t('Actualiser', 'Rafrechi')}</button>
      </>}
    </section>
  );
}
