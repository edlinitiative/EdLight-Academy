import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import useStore from '../../contexts/store';
import {
  listCommentReports,
  resolveReport,
  type CommentReport,
} from '../../services/adminService';
import { deleteComment } from '../../services/firebase';

/**
 * AdminModeration — comment reports queue.
 *
 * Lists pending reports from the `commentReports` collection and lets an admin
 * either delete the offending comment (then clear the report) or simply dismiss
 * the report. Renders inside the admin sidebar layout via <Outlet>.
 */

function formatDate(value: any): string {
  if (!value) return '—';
  let date: Date | null = null;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value?.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else {
    const d = new Date(value);
    date = Number.isNaN(d.getTime()) ? null : d;
  }
  return date ? date.toLocaleString('fr-FR') : '—';
}

export default function AdminModeration() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [reports, setReports] = useState<CommentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCommentReports();
      setReports(data);
    } catch (err) {
      console.error('[AdminModeration] Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(report: CommentReport) {
    const confirmed = window.confirm(
      t(
        'Supprimer définitivement ce commentaire et effacer le signalement ?',
        'Efase komantè sa a nèt epi retire siyalman an ?',
      ),
    );
    if (!confirmed) return;
    setBusyId(report.id);
    // Optimistic removal from the queue.
    setReports((prev) => prev.filter((r) => r.id !== report.id));
    try {
      await deleteComment(report.commentId);
      await resolveReport(report.id);
    } catch (err) {
      console.error('[AdminModeration] Failed to delete comment:', err);
    } finally {
      setBusyId(null);
      load();
    }
  }

  async function handleDismiss(report: CommentReport) {
    setBusyId(report.id);
    setReports((prev) => prev.filter((r) => r.id !== report.id));
    try {
      await resolveReport(report.id);
    } catch (err) {
      console.error('[AdminModeration] Failed to dismiss report:', err);
    } finally {
      setBusyId(null);
      load();
    }
  }

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <ShieldAlert size={13} aria-hidden="true" />
          {t('MODÉRATION', 'MODERASYON')}
        </div>
        <h1 className="admin-page__title">{t('Signalements', 'Siyalman')}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'N ap chaje…')
            : reports.length === 0
              ? t('Aucun signalement en attente', 'Pa gen okenn siyalman')
              : t(
                  `${reports.length} signalement${reports.length > 1 ? 's' : ''} en attente`,
                  `${reports.length} siyalman ap tann`,
                )}
        </p>
      </div>

      {loading ? (
        <div className="admin-empty">{t('Chargement…', 'N ap chaje…')}</div>
      ) : reports.length === 0 ? (
        <div className="admin-empty">
          {t('Aucun signalement — tout est en ordre.', 'Pa gen siyalman — tout bagay anfòm.')}
        </div>
      ) : (
        <div className="admin-card">
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Raison', 'Rezon')}</th>
                  <th>{t('Commentaire', 'Komantè')}</th>
                  <th>{t('Fil', 'Fil')}</th>
                  <th>{t('Signalé par', 'Siyale pa')}</th>
                  <th>{t('Date', 'Dat')}</th>
                  <th>{t('Actions', 'Aksyon')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.reason || '—'}</td>
                    <td>{report.commentId || '—'}</td>
                    <td>{report.threadKey || '—'}</td>
                    <td>{report.reporterId || '—'}</td>
                    <td>{formatDate(report.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          onClick={() => handleDelete(report)}
                          disabled={busyId === report.id}
                        >
                          {t('Supprimer le commentaire', 'Efase komantè a')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => handleDismiss(report)}
                          disabled={busyId === report.id}
                        >
                          {t('Ignorer', 'Inyore')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
