import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../../contexts/store';
import { getAdminOverview, listUsers } from '../../services/adminService';
import type { AdminOverviewCounts, AdminUser } from '../../services/adminService';

/**
 * AdminOverview — the admin console's dashboard.
 * Renders inside AdminLayout via <Outlet>, so it adds no nav/layout chrome.
 */

/** Coerce a Firestore Timestamp | number | string | Date into ms, or null. */
function toMillis(v: any): number | null {
  if (v == null) return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

export default function AdminOverview() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [overview, setOverview] = useState<AdminOverviewCounts | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setOverviewLoading(true);
    getAdminOverview()
      .then((data) => {
        if (alive) setOverview(data);
      })
      .catch(() => {
        if (alive) setOverview(null);
      })
      .finally(() => {
        if (alive) setOverviewLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setUsersLoading(true);
    listUsers(500)
      .then((rows) => {
        if (alive) setUsers(rows);
      })
      .catch(() => {
        if (alive) setUsers([]);
      })
      .finally(() => {
        if (alive) setUsersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // "—" while loading or when a count is null/undefined.
  const fmt = (v: number | null | undefined, loading: boolean) => {
    if (loading) return '—';
    if (v == null || !Number.isFinite(v)) return '—';
    return new Intl.NumberFormat('fr-FR').format(v);
  };

  const pendingReports = overview?.pendingReports ?? null;
  const hasPending = typeof pendingReports === 'number' && pendingReports > 0;

  const tiles = [
    {
      key: 'users',
      label: t('Utilisateurs', 'Itilizatè'),
      value: fmt(overview?.users, overviewLoading),
    },
    {
      key: 'courses',
      label: t('Cours', 'Kou'),
      value: fmt(overview?.courses, overviewLoading),
    },
    {
      key: 'videos',
      label: t('Vidéos', 'Videyo'),
      value: fmt(overview?.videos, overviewLoading),
    },
    {
      key: 'quizzes',
      label: t('Quiz', 'Quiz'),
      value: fmt(overview?.quizzes, overviewLoading),
    },
    {
      key: 'exams',
      label: t('Examens', 'Egzamen'),
      value: fmt(overview?.exams, overviewLoading),
    },
    {
      key: 'reports',
      label: t('Signalements en attente', 'Siyalman k ap tann'),
      value: fmt(pendingReports, overviewLoading),
      highlight: hasPending,
    },
  ];

  const quickActions = [
    {
      to: '/admin/content/courses',
      title: t('Ajouter un cours', 'Ajoute yon kou'),
      desc: t('Créer et organiser le catalogue.', 'Kreye ak òganize katalòg la.'),
    },
    {
      to: '/admin/content/exams',
      title: t('Vérifier les réponses', 'Verifye repons yo'),
      desc: t('Valider les corrigés d’examens.', 'Valide korije egzamen yo.'),
    },
    {
      to: '/admin/users',
      title: t('Gérer les utilisateurs', 'Jere itilizatè yo'),
      desc: t('Rôles, filières et accès.', 'Wòl, filyè ak aksè.'),
    },
    {
      to: '/admin/users/moderation',
      title: t('Modération', 'Moderasyon'),
      desc: t('Traiter les commentaires signalés.', 'Trete kòmantè yo siyale yo.'),
      highlight: hasPending,
    },
    {
      to: '/admin/data/collections',
      title: t('Collections', 'Koleksyon'),
      desc: t('Explorer les données Firestore.', 'Eksplore done Firestore yo.'),
    },
    {
      to: '/admin/data/stats',
      title: t('Statistiques du site', 'Estatistik sit la'),
      desc: t('Suivre l’activité et l’audience.', 'Swiv aktivite ak odyans lan.'),
    },
  ];

  // Most recent registrations: sort by created_at desc, top 8.
  const recentUsers = (users ?? [])
    .map((u) => ({ ...u, _joined: toMillis(u.created_at) }))
    .sort((a, b) => (b._joined ?? 0) - (a._joined ?? 0))
    .slice(0, 8);

  const roleLabel = (role?: string) =>
    role === 'admin' ? 'Admin' : t('Élève', 'Elèv');

  return (
    <div>
      <header className="admin-page__head">
        <div className="admin-page__eyebrow">CONSOLE ADMIN</div>
        <h1 className="admin-page__title">{t("Vue d'ensemble", 'Apèsi jeneral')}</h1>
        <p className="admin-page__subtitle">
          {t(
            'Un coup d’œil sur le contenu, les utilisateurs et la modération.',
            'Yon apèsi sou kontni, itilizatè ak moderasyon.'
          )}
        </p>
      </header>

      {/* Stat tiles */}
      <section className="admin-tiles" aria-label={t('Chiffres clés', 'Chif kle')}>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="admin-card admin-tile"
            style={
              tile.highlight
                ? { borderColor: '#c93434', boxShadow: '3px 3px 0 0 #c93434' }
                : undefined
            }
          >
            <div className="admin-tile__label">{tile.label}</div>
            <div
              className="admin-tile__value"
              style={tile.highlight ? { color: '#c93434' } : undefined}
            >
              {tile.value}
            </div>
          </div>
        ))}
      </section>

      {/* Quick actions */}
      <section style={{ marginTop: 32 }}>
        <h2
          className="admin-page__eyebrow"
          style={{ marginBottom: 14 }}
        >
          {t('ACTIONS RAPIDES', 'AKSYON RAPID')}
        </h2>
        <div className="admin-tiles">
          {quickActions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="admin-card admin-tile"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
                ...(a.highlight
                  ? { borderColor: '#c93434', boxShadow: '3px 3px 0 0 #c93434' }
                  : {}),
              }}
            >
              <div
                className="admin-tile__value"
                style={{ fontSize: 17, marginTop: 0 }}
              >
                {a.title}
              </div>
              <div
                className="admin-page__subtitle"
                style={{ marginTop: 6 }}
              >
                {a.desc}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent registrations */}
      <section style={{ marginTop: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h2 className="admin-page__eyebrow" style={{ margin: 0 }}>
            {t('INSCRIPTIONS RÉCENTES', 'ENSKRIPSYON RESAN')}
          </h2>
          <Link
            to="/admin/users"
            className="admin-btn admin-btn--ghost"
            style={{ textDecoration: 'none' }}
          >
            {t('Tous les utilisateurs', 'Tout itilizatè')}
          </Link>
        </div>

        <div className="admin-card">
          {usersLoading ? (
            <div className="admin-empty">{t('Chargement…', 'Ap chaje…')}</div>
          ) : recentUsers.length === 0 ? (
            <div className="admin-empty">
              {t('Aucune inscription pour le moment.', 'Poko gen enskripsyon.')}
            </div>
          ) : (
            <div className="admin-table__scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('Nom', 'Non')}</th>
                    <th>{t('E-mail', 'Imèl')}</th>
                    <th>{t('Rôle', 'Wòl')}</th>
                    <th>{t('Inscrit le', 'Enskri le')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((u) => (
                    <tr key={u.uid}>
                      <td>{u.full_name || t('Sans nom', 'San non')}</td>
                      <td>{u.email || '—'}</td>
                      <td>
                        <span
                          className={
                            u.role === 'admin'
                              ? 'admin-role-pill admin-role-pill--admin'
                              : 'admin-role-pill'
                          }
                        >
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td>
                        {u._joined
                          ? new Date(u._joined).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
