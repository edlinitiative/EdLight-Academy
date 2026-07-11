import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UserCog } from 'lucide-react';
import { getUser, setUserRole, type AdminUser } from '../../services/adminService';
import { updateUser } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * AdminUserDetail — single-user management: profile summary, role
 * promote/demote (behind window.confirm), and an editable basic-info form.
 * Renders inside AdminLayout's <Outlet>.
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

export default function AdminUserDetail() {
  const { uid } = useParams<{ uid: string }>();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Editable basic-info form
  const [fullName, setFullName] = useState('');
  const [track, setTrack] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!uid) return;
    try {
      const u = await getUser(uid);
      setUser(u);
      setFullName(u?.full_name || '');
      setTrack(u?.track || '');
    } catch (err) {
      console.error('[AdminUserDetail] Failed to load user:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const isAdmin = user?.role === 'admin';

  async function handleToggleRole() {
    if (!uid || !user) return;
    const message = isAdmin
      ? t('Confirmer : retirer les droits admin ?', 'Konfime : retire dwa admin yo ?')
      : t('Confirmer : donner les droits admin ?', 'Konfime : bay dwa admin yo ?');
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await setUserRole(uid, isAdmin ? '' : 'admin');
      await load();
    } catch (err) {
      console.error('[AdminUserDetail] Failed to change role:', err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateUser(uid, { full_name: fullName, track });
      setUser((prev) => (prev ? { ...prev, full_name: fullName, track } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[AdminUserDetail] Failed to save user:', err);
    } finally {
      setSaving(false);
    }
  }

  const backLink = (
    <Link
      to="/admin/users"
      className="admin-page__eyebrow"
      style={{ textDecoration: 'none', cursor: 'pointer' }}
    >
      <ArrowLeft size={13} aria-hidden="true" /> {t('Retour', 'Tounen')}
    </Link>
  );

  if (loading) {
    return (
      <div>
        <div className="admin-page__head">{backLink}</div>
        <div className="admin-card">
          <div className="admin-empty">{t('Chargement…', 'N ap chaje…')}</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <div className="admin-page__head">{backLink}</div>
        <div className="admin-card">
          <div className="admin-empty">{t('Utilisateur introuvable', 'Itilizatè pa jwenn')}</div>
        </div>
      </div>
    );
  }

  const displayName = user.full_name || user.email || t('Utilisateur', 'Itilizatè');
  const initial = (user.full_name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div>
      <div className="admin-page__head">
        {backLink}
        <h1 className="admin-page__title">{displayName}</h1>
        <p className="admin-page__subtitle">{user.email || '—'}</p>
      </div>

      {/* Profile summary */}
      <div className="admin-card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          {user.profile_picture ? (
            <img
              src={user.profile_picture}
              alt=""
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--asb-line)' }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 22,
                border: '1px solid var(--asb-ink)',
                background: 'color-mix(in srgb, var(--asb-accent) 10%, transparent)',
                color: 'var(--asb-accent)',
              }}
            >
              {initial}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{user.full_name || '—'}</div>
            <span className={`admin-role-pill${isAdmin ? ' admin-role-pill--admin' : ''}`}>
              {isAdmin ? 'admin' : t('élève', 'elèv')}
            </span>
          </div>
        </div>

        <div className="admin-tiles">
          <div className="admin-tile">
            <div className="admin-tile__label">{t('Email', 'Imèl')}</div>
            <div className="admin-tile__value" style={{ fontSize: 15, wordBreak: 'break-all' }}>
              {user.email || '—'}
            </div>
          </div>
          <div className="admin-tile">
            <div className="admin-tile__label">{t('Filière', 'Filyè')}</div>
            <div className="admin-tile__value" style={{ fontSize: 15 }}>{user.track || '—'}</div>
          </div>
          <div className="admin-tile">
            <div className="admin-tile__label">{t('Inscrit le', 'Enskri le')}</div>
            <div className="admin-tile__value" style={{ fontSize: 15 }}>{formatDate(user.created_at)}</div>
          </div>
          <div className="admin-tile">
            <div className="admin-tile__label">{t('Dernière activité', 'Dènye aktivite')}</div>
            <div className="admin-tile__value" style={{ fontSize: 15 }}>{formatDate(user.last_seen)}</div>
          </div>
          <div className="admin-tile">
            <div className="admin-tile__label">{t('Intégration', 'Entwodiksyon')}</div>
            <div className="admin-tile__value" style={{ fontSize: 15 }}>
              {user.onboarding_completed
                ? t('Terminée', 'Fini')
                : t('Non terminée', 'Poko fini')}
            </div>
          </div>
        </div>
      </div>

      {/* Role management */}
      <div className="admin-card" style={{ padding: 20, marginBottom: 18 }}>
        <div className="admin-page__eyebrow" style={{ marginBottom: 8 }}>
          <UserCog size={13} aria-hidden="true" /> {t('RÔLE', 'WÒL')}
        </div>
        <p className="admin-page__subtitle" style={{ marginBottom: 14 }}>
          {isAdmin
            ? t('Cet utilisateur est administrateur.', 'Itilizatè sa a se administratè.')
            : t('Cet utilisateur est un élève.', 'Itilizatè sa a se yon elèv.')}
        </p>
        <button
          type="button"
          className={`admin-btn${isAdmin ? ' admin-btn--danger' : ''}`}
          onClick={handleToggleRole}
          disabled={busy}
        >
          {busy
            ? t('…', '…')
            : isAdmin
              ? t('Retirer les droits admin', 'Retire dwa admin')
              : t('Donner les droits admin', 'Bay dwa admin')}
        </button>
      </div>

      {/* Editable basic info */}
      <div className="admin-card" style={{ padding: 20 }}>
        <div className="admin-page__eyebrow" style={{ marginBottom: 14 }}>
          {t('INFORMATIONS', 'ENFÒMASYON')}
        </div>
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
            <label style={{ display: 'block' }}>
              <span className="admin-tile__label" style={{ display: 'block', marginBottom: 6 }}>
                {t('Nom complet', 'Non konplè')}
              </span>
              <input
                className="admin-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span className="admin-tile__label" style={{ display: 'block', marginBottom: 6 }}>
                {t('Filière', 'Filyè')}
              </span>
              <input
                className="admin-input"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" className="admin-btn" disabled={saving}>
                {saving ? t('Enregistrement…', 'N ap anrejistre…') : t('Enregistrer', 'Anrejistre')}
              </button>
              {saved && (
                <span className="admin-page__subtitle">{t('Enregistré ✓', 'Anrejistre ✓')}</span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
