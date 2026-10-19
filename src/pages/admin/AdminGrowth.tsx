/**
 * Admin → Croissance: the school ambassador programme.
 *   1. Find a student and designate them for a school (max 2 per school), or revoke.
 *   2. Monthly report: ambassadors × recruits × retained, with fraud flags,
 *      the designation's origin (this console, or an EdLight Apply application id + reviewer),
 *      CSV export, and the manual "récompense remise" record with notes.
 * Rewards are handed over by a person, off-app; nothing here pays anyone.
 * Definitions: shared/ambassadors.ts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { listUsers, type AdminUser } from '../../services/adminService';
import { ambassadorRequest } from '../../services/ambassadorService';
import { AMBASSADOR_RULES, ambassadorErrorMessage, haitiPeriod, reportCsv, type AmbassadorReportRow } from '../../../shared/ambassadors';

type RecruitRow = { id: string; signupAt: number; period: string; activeDays: number; state: string; flags: string[] };
const STATE_LABEL: Record<string, string> = { retained: 'Retenue', pending: 'En cours', not_retained: 'Non retenue' };
const FLAG_LABEL: Record<string, string> = { burst: 'Inscriptions groupées', shared_ip: 'Même adresse' };

export default function AdminGrowth() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState(haitiPeriod(Date.now()));
  const [rows, setRows] = useState<AmbassadorReportRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<{ uid: string; recruits: RecruitRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { listUsers(1000).then(setUsers).catch(() => setMessage('Liste des utilisateurs indisponible.')); }, []);
  const loadReport = async (p = period) => {
    setBusy(true); setMessage('');
    try {
      const out = await ambassadorRequest<{ period: string; rows: AmbassadorReportRow[] }>('report', { period: p });
      setRows(out.rows); setNotes(Object.fromEntries(out.rows.map((r) => [r.uid, r.rewardNotes])));
    } catch (e) { setMessage(ambassadorErrorMessage(e, 'fr')); } finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadReport(period); }, [period]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return users.filter((u) => `${u.full_name || ''} ${u.email || ''} ${u.uid}`.toLowerCase().includes(q)).slice(0, 20);
  }, [users, search]);

  const act = async (action: string, values: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage('');
    try { await ambassadorRequest(action, values); setMessage(done); await loadReport(); }
    catch (e) { setMessage(ambassadorErrorMessage(e, 'fr')); } finally { setBusy(false); }
  };
  const exportCsv = () => {
    if (!rows) return;
    // Byte-order mark first so Excel opens the accents correctly.
    const blob = new Blob([String.fromCharCode(0xfeff), reportCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ambassadeurs-${period}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const openDetail = async (uid: string) => {
    setBusy(true);
    try { setDetail({ uid, ...(await ambassadorRequest<{ recruits: RecruitRow[] }>('recruits', { uid })) }); }
    catch (e) { setMessage(ambassadorErrorMessage(e, 'fr')); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="admin-page__head">
        <p className="admin-page__eyebrow">Utilisateurs</p>
        <h1 className="admin-page__title">Croissance · Ambassadeurs</h1>
        <p className="admin-page__subtitle">
          Une recrue est retenue quand le serveur a observé de l’activité sur au moins {AMBASSADOR_RULES.retainedMinDays} jours
          différents pendant ses {AMBASSADOR_RULES.retentionWindowDays} premiers jours (calendrier d’Haïti). Les signalements sont
          à vérifier par une personne, ce ne sont pas des refus automatiques. Les récompenses sont remises hors application.
        </p>
      </div>
      {message && <p role="status" className="admin-card">{message}</p>}

      <div className="admin-card">
        <h2>Désigner un ambassadeur</h2>
        <input className="admin-input" type="search" placeholder="Nom, e-mail ou uid (2 caractères minimum)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un utilisateur" />
        {matches.length > 0 && (
          <div className="admin-table__scroll"><table className="admin-table"><tbody>
            {matches.map((u) => { const value = school[u.uid] ?? String(u.school || ''); return (
              <tr key={u.uid}>
                <td>{u.full_name || '—'}<br /><small>{u.email}</small></td>
                <td><input className="admin-input" placeholder="École" value={value} onChange={(e) => setSchool((s) => ({ ...s, [u.uid]: e.target.value }))} aria-label={`École de ${u.full_name || u.uid}`} /></td>
                <td><button className="admin-btn" disabled={busy || value.trim().length < 2} onClick={() => act('designate', { uid: u.uid, school: value }, 'Ambassadeur désigné.')}>Désigner</button></td>
              </tr>
            ); })}
          </tbody></table></div>
        )}
      </div>

      <div className="admin-card">
        <h2>Rapport mensuel</h2>
        <label>Mois d’inscription des recrues{' '}
          <input className="admin-input" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
        </label>{' '}
        <button className="admin-btn admin-btn--ghost" disabled={busy || !rows?.length} onClick={exportCsv}>Exporter en CSV</button>{' '}
        <button className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => loadReport()}>Actualiser</button>
        {rows == null ? <div className="admin-empty">Chargement…</div> : rows.length === 0 ? <div className="admin-empty">Aucun ambassadeur désigné.</div> : (
          <div className="admin-table__scroll"><table className="admin-table">
            <thead><tr><th>Ambassadeur</th><th>École</th><th>Origine</th><th>Recrues</th><th>Retenues</th><th>Sans signalement</th><th>En cours</th><th>Signalées</th><th>Récompense remise</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.uid}>
                <td>{r.name || r.uid}{!r.active && <><br /><small>révoqué</small></>}</td>
                <td>{r.school}</td>
                <td>{r.source === 'edlight-apply'
                  ? <>EdLight Apply<br /><small>Candidature {r.applicationId || '—'}{r.reviewerName ? ` · ${r.reviewerName}` : ''}</small></>
                  : 'Console admin'}</td>
                <td>{r.recruits}</td><td>{r.retained}</td><td>{r.retainedUnflagged}</td><td>{r.pending}</td><td>{r.flagged}</td>
                <td>
                  <label><input type="checkbox" checked={r.rewardDelivered} disabled={busy} onChange={(e) => act('reward', { uid: r.uid, period, delivered: e.target.checked, notes: notes[r.uid] || '' }, 'Récompense enregistrée.')} /> remise</label>
                  <input className="admin-input" maxLength={500} placeholder="Notes (montant, date, qui)" value={notes[r.uid] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.uid]: e.target.value }))}
                    onBlur={() => { if ((notes[r.uid] || '') !== r.rewardNotes) void act('reward', { uid: r.uid, period, delivered: r.rewardDelivered, notes: notes[r.uid] || '' }, 'Notes enregistrées.'); }} aria-label={`Notes pour ${r.name || r.uid}`} />
                </td>
                <td>
                  <button className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => openDetail(r.uid)}>Détails</button>
                  {r.active && <button className="admin-btn admin-btn--danger" disabled={busy} onClick={() => { if (window.confirm('Révoquer cet ambassadeur ?')) void act('revoke', { uid: r.uid }, 'Ambassadeur révoqué.'); }}>Révoquer</button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {detail && (
        <div className="admin-card">
          <h2>Recrues de {rows?.find((r) => r.uid === detail.uid)?.name || detail.uid}</h2>
          <button className="admin-btn admin-btn--ghost" onClick={() => setDetail(null)}>Fermer</button>
          {detail.recruits.length === 0 ? <div className="admin-empty">Aucune recrue.</div> : (
            <div className="admin-table__scroll"><table className="admin-table">
              <thead><tr><th>Compte</th><th>Inscription</th><th>Jours actifs observés</th><th>État</th><th>Signalements</th></tr></thead>
              <tbody>{detail.recruits.map((r) => (
                <tr key={`${r.id}-${r.signupAt}`}>
                  <td><small>{r.id}</small></td>
                  <td>{new Date(r.signupAt).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' })}</td>
                  <td>{r.activeDays}</td><td>{STATE_LABEL[r.state] || r.state}</td>
                  <td>{r.flags.map((f) => FLAG_LABEL[f] || f).join(', ')}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
