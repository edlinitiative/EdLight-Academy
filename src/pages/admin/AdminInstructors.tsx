import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, limit as fbLimit, startAfter,
  doc, updateDoc, addDoc, serverTimestamp,
  type QueryDocumentSnapshot, type DocumentData, type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../../services/firebase';

/**
 * AdminInstructors — review pipeline for volunteer-instructor applications.
 *
 * Lists `instructorApplications` (newest first, cursor-paginated) with a
 * status filter. Admins advance each application through
 * pending → contacted → approved | declined; contact happens off-platform
 * (the WhatsApp cell links straight into a wa.me chat). Creation is
 * server-only via /api/instructor-apply, so this page never creates docs.
 */

const PAGE_SIZE = 25;

type AppStatus = 'pending' | 'contacted' | 'approved' | 'declined';

const STATUS_LABELS: Record<AppStatus, string> = {
  pending: 'À traiter',
  contacted: 'Contacté',
  approved: 'Approuvé',
  declined: 'Refusé',
};

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Maths', physics: 'Physique', chemistry: 'Chimie', economics: 'Économie', other: 'Autre',
};

const LEVEL_LABELS: Record<string, string> = {
  '9af': '9e AF', ns1: 'NS I', ns2: 'NS II', ns3: 'NS III', ns4: 'NS IV',
};

interface InstructorApplication {
  id: string;
  name?: string;
  email?: string;
  whatsapp?: string;
  subjects?: string[];
  levels?: string[];
  experience?: string;
  school?: string;
  department?: string;
  motivation?: string;
  lang?: string;
  source?: string;
  status?: AppStatus;
  createdAt?: any;
  /** Written back when the profile is created from this application. */
  instructorId?: string;
  [k: string]: any;
}

function formatDate(value: any): string {
  const d = typeof value?.toDate === 'function' ? value.toDate() : null;
  return d ? d.toLocaleDateString('fr-FR') : '—';
}

function waLink(whatsapp?: string): string | null {
  const digits = (whatsapp || '').replace(/[^\d]/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export default function AdminInstructors() {
  const [apps, setApps] = useState<InstructorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [filter, setFilter] = useState<'all' | AppStatus>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadPage = useCallback(async (after: QueryDocumentSnapshot<DocumentData> | null) => {
    const ref = collection(db, 'instructorApplications');
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (after) constraints.push(startAfter(after));
    constraints.push(fbLimit(PAGE_SIZE));
    let snap;
    try {
      snap = await getDocs(query(ref, ...constraints));
    } catch {
      snap = await getDocs(query(ref, ...(after ? [startAfter(after)] : []), fbLimit(PAGE_SIZE)));
    }
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstructorApplication));
    setApps((prev) => (after ? [...prev, ...rows] : rows));
    setCursor(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
    setHasMore(snap.docs.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadPage(null);
      } catch (err) {
        console.error('[AdminInstructors] load failed:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadPage]);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } catch (err) {
      console.error('[AdminInstructors] load more failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  async function setStatus(app: InstructorApplication, status: AppStatus) {
    setSavingId(app.id);
    try {
      await updateDoc(doc(db, 'instructorApplications', app.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
    } catch (err) {
      console.error('[AdminInstructors] status update failed:', err);
    } finally {
      setSavingId(null);
    }
  }

  /** Approved application -> public instructor profile (instructors doc),
   *  prefilled from the application; the profile id is written back so the
   *  button can't create duplicates. Bio/photo/courses are edited afterwards
   *  (admin console / data browser). */
  async function createProfile(app: InstructorApplication) {
    if (app.instructorId) return;
    setSavingId(app.id);
    try {
      const ref = await addDoc(collection(db, 'instructors'), {
        name: app.name || '',
        photoUrl: '',
        bio_fr: '',
        bio_ht: '',
        subjects: app.subjects || [],
        levels: app.levels || [],
        school: app.school || '',
        credentials: '',
        courseIds: [],
        visible: true,
        applicationId: app.id,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'instructorApplications', app.id), {
        instructorId: ref.id,
        updatedAt: serverTimestamp(),
      });
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, instructorId: ref.id } : a)));
    } catch (err) {
      console.error('[AdminInstructors] profile creation failed:', err);
    } finally {
      setSavingId(null);
    }
  }

  const visible = useMemo(
    () => (filter === 'all' ? apps : apps.filter((a) => (a.status || 'pending') === filter)),
    [apps, filter],
  );
  const pendingCount = apps.filter((a) => (a.status || 'pending') === 'pending').length;

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <GraduationCap size={13} aria-hidden="true" /> ENSEIGNANTS
        </div>
        <h1 className="admin-page__title">Candidatures enseignants</h1>
        <p className="admin-page__subtitle">
          Candidatures reçues via /enseigner (web et mobile).
          {pendingCount > 0 ? ` ${pendingCount} à traiter sur cette page.` : ''}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['all', 'pending', 'contacted', 'approved', 'declined'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`admin-btn admin-btn--ghost${filter === s ? ' is-active' : ''}`}
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'Toutes' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">Chargement des candidatures…</div>
        ) : visible.length === 0 ? (
          <div className="admin-empty">
            {filter === 'all'
              ? 'Aucune candidature pour le moment. Le lien « Devenir enseignant » est dans le pied de page du site et dans le Profil de l’app.'
              : `Aucune candidature « ${STATUS_LABELS[filter as AppStatus]} ».`}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Candidat</th>
                  <th>Matières</th>
                  <th>Niveaux</th>
                  <th>École</th>
                  <th>Exp.</th>
                  <th>WhatsApp</th>
                  <th>Reçue le</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => {
                  const wa = waLink(a.whatsapp);
                  const isOpen = expanded === a.id;
                  return (
                    <React.Fragment key={a.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        style={{ cursor: 'pointer' }}
                        aria-expanded={isOpen}
                      >
                        <td>
                          <strong>{a.name || '—'}</strong>
                          <div style={{ fontSize: 12, color: 'var(--asb-muted)' }}>{a.email}</div>
                        </td>
                        <td>{(a.subjects || []).map((s) => SUBJECT_LABELS[s] || s).join(', ') || '—'}</td>
                        <td>{(a.levels || []).map((l) => LEVEL_LABELS[l] || l).join(', ') || '—'}</td>
                        <td>{a.school || '—'}</td>
                        <td>{a.experience || '—'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer">{a.whatsapp}</a>
                          ) : (a.whatsapp || '—')}
                        </td>
                        <td>{formatDate(a.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="admin-input"
                            style={{ padding: '4px 8px', fontSize: 13 }}
                            value={a.status || 'pending'}
                            disabled={savingId === a.id}
                            onChange={(e) => setStatus(a, e.target.value as AppStatus)}
                            aria-label={`Statut de ${a.name || 'la candidature'}`}
                          >
                            {(Object.keys(STATUS_LABELS) as AppStatus[]).map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ background: 'color-mix(in srgb, var(--asb-accent) 3%, transparent)' }}>
                            <div style={{ padding: '4px 2px', fontSize: 13, lineHeight: 1.6 }}>
                              <div><strong>Département :</strong> {a.department || '—'} · <strong>Langue :</strong> {a.lang === 'ht' ? 'Créole' : 'Français'} · <strong>Source :</strong> {a.source || 'web'}</div>
                              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                                <strong>Motivation :</strong> {a.motivation || '—'}
                              </div>
                              {(a.status === 'approved') && (
                                <div style={{ marginTop: 10 }}>
                                  {a.instructorId ? (
                                    <Link
                                      className="admin-btn admin-btn--ghost"
                                      to={`/enseignants/${a.instructorId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Voir le profil enseignant ↗
                                    </Link>
                                  ) : (
                                    <button
                                      type="button"
                                      className="admin-btn admin-btn--ghost"
                                      disabled={savingId === a.id}
                                      onClick={() => createProfile(a)}
                                    >
                                      {savingId === a.id ? 'Création…' : 'Créer le profil enseignant'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !loading && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Chargement…' : 'Charger plus'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
