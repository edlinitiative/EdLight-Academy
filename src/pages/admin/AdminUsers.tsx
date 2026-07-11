import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { listUsers, type AdminUser } from '../../services/adminService';
import useStore from '../../contexts/store';

/**
 * AdminUsers — the "Tous les utilisateurs" page. Lists every user with a
 * client-side search filter and a link to each user's management detail page.
 * Renders inside AdminLayout's <Outlet> (no chrome of its own).
 */

/** Coerce a Firestore Timestamp | ISO string | ms number into a fr-FR date. */
function formatDate(value: any): string {
  if (value == null || value === '') return '—';
  let date: Date | null = null;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value === 'object' && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR');
}

export default function AdminUsers() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listUsers(500);
        if (alive) setUsers(rows);
      } catch (err) {
        console.error('[AdminUsers] Failed to load users:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, search]);

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Users size={13} aria-hidden="true" /> {t('UTILISATEURS', 'ITILIZATÈ')}
        </div>
        <h1 className="admin-page__title">{t('Tous les utilisateurs', 'Tout itilizatè yo')}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'N ap chaje…')
            : t(
                `${users.length} utilisateur${users.length > 1 ? 's' : ''} au total`,
                `${users.length} itilizatè antou`,
              )}
        </p>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          type="search"
          className="admin-input"
          placeholder={t('Rechercher par nom ou email…', 'Chèche pa non oswa imèl…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('Rechercher un utilisateur', 'Chèche yon itilizatè')}
        />
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">{t('Chargement des utilisateurs…', 'N ap chaje itilizatè yo…')}</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            {search
              ? t('Aucun utilisateur ne correspond.', 'Pa gen itilizatè ki koresponn.')
              : t('Aucun utilisateur.', 'Pa gen itilizatè.')}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Nom', 'Non')}</th>
                  <th>{t('Email', 'Imèl')}</th>
                  <th>{t('Rôle', 'Wòl')}</th>
                  <th>{t('Filière', 'Filyè')}</th>
                  <th>{t('Dernière activité', 'Dènye aktivite')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isAdmin = u.role === 'admin';
                  return (
                    <tr key={u.uid}>
                      <td>{u.full_name || '—'}</td>
                      <td>{u.email || '—'}</td>
                      <td>
                        <span className={`admin-role-pill${isAdmin ? ' admin-role-pill--admin' : ''}`}>
                          {isAdmin ? 'admin' : t('élève', 'elèv')}
                        </span>
                      </td>
                      <td>{u.track || '—'}</td>
                      <td>{formatDate(u.last_seen)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link className="admin-btn admin-btn--ghost" to={`/admin/users/${u.uid}`}>
                          {t('Gérer', 'Jere')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
