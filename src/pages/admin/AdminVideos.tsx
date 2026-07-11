import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video, ChevronDown } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, deleteVideo } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * AdminVideos — browse / search / delete the Firestore `videos` collection.
 * Full document editing is out of scope; users are pointed at the raw
 * collection editor for that. Renders inside AdminLayout's <Outlet>.
 *
 * Live `videos` document fields:
 *   id, subject_code, unit_no, unit_title, lesson_no, video_title,
 *   learning_objectives, language, duration_min, video_url, thumbnail_url, tags
 */

interface VideoRow {
  id: string;
  [key: string]: any;
}

/** Coerce a Firestore value to a trimmed display string ('' when empty). */
function str(v: any): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Numeric sort key, pushing missing values to the end. */
function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Human title for a video row. The live `videos` collection is unevenly
 * populated: many docs never got `video_title`/`subject_code` filled and carry
 * the descriptive title in `unit_title` instead. Fall back through both so a
 * title always shows (the original bug was a blank column). `id` is the floor.
 */
function videoTitle(r: VideoRow): string {
  return str(r.video_title) || str(r.unit_title) || r.id;
}

export default function AdminVideos() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'videos'));
      const list: VideoRow[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRows(list);
    } catch (err) {
      console.error('[AdminVideos] Failed to load videos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        str(r.video_title),
        str(r.subject_code),
        str(r.unit_title),
        r.id,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  /** Group filtered videos by subject_code, sorted by unit_no then lesson_no. */
  const groups = useMemo(() => {
    const map = new Map<string, VideoRow[]>();
    for (const r of filtered) {
      const key = str(r.subject_code) || t('(sans matière)', '(san matyè)');
      const bucket = map.get(key);
      if (bucket) bucket.push(r);
      else map.set(key, [r]);
    }
    const out = Array.from(map.entries()).map(([subject, list]) => ({
      subject,
      list: [...list].sort((a, b) => {
        const u = num(a.unit_no) - num(b.unit_no);
        if (u !== 0) return u;
        return num(a.lesson_no) - num(b.lesson_no);
      }),
    }));
    out.sort((a, b) => a.subject.localeCompare(b.subject));
    return out;
  }, [filtered, isCreole]);

  async function handleDelete(row: VideoRow) {
    const label = videoTitle(row);
    const ok = window.confirm(
      t(`Supprimer la vidéo « ${label} » ? Cette action est irréversible.`,
        `Efase videyo « ${label} » ? Aksyon sa a pa ka defèt.`),
    );
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await deleteVideo(row.id);
      await load();
    } catch (err) {
      console.error('[AdminVideos] Failed to delete video:', err);
      window.alert(t('Échec de la suppression.', 'Efasman an echwe.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Video size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
        </div>
        <h1 className="admin-page__title">{t('Vidéos', 'Videyo')}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'N ap chaje…')
            : t(
                `${rows.length} vidéo${rows.length > 1 ? 's' : ''} au total`,
                `${rows.length} videyo antou`,
              )}
        </p>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          type="search"
          className="admin-input"
          placeholder={t('Rechercher par titre ou matière…', 'Chèche pa tit oswa matyè…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('Rechercher une vidéo', 'Chèche yon videyo')}
        />
      </div>

      {loading ? (
        <div className="admin-card admin-empty">
          {t('Chargement des vidéos…', 'N ap chaje videyo yo…')}
        </div>
      ) : groups.length === 0 ? (
        <div className="admin-card admin-empty">
          {search
            ? t('Aucune vidéo ne correspond.', 'Pa gen videyo ki koresponn.')
            : t('Aucune vidéo.', 'Pa gen videyo.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map(({ subject, list }) => {
            const isCollapsed = !!collapsed[subject];
            return (
              <div key={subject} className="admin-card" style={{ padding: 0 }}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [subject]: !c[subject] }))
                  }
                  aria-expanded={!isCollapsed}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '13px 16px',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--asb-line)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <ChevronDown
                    size={16}
                    style={{
                      color: 'var(--asb-muted)',
                      flex: 'none',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 700,
                      fontFamily: 'var(--asb-mono, monospace)',
                    }}
                  >
                    {subject}
                  </span>
                  <span
                    className="admin-role-pill"
                    style={{ marginLeft: 'auto' }}
                  >
                    {list.length} {t('vidéo', 'videyo')}
                    {list.length > 1 && !isCreole ? 's' : ''}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="admin-table__scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th style={{ width: 56 }}>{t('Réf', 'Ref')}</th>
                          <th>{t('Titre', 'Tit')}</th>
                          <th>{t('Unité', 'Inite')}</th>
                          <th>{t('Durée', 'Dire')}</th>
                          <th>{t('Vidéo', 'Videyo')}</th>
                          <th aria-label={t('Actions', 'Aksyon')} />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => {
                          const url = str(r.video_url);
                          const dur = num(r.duration_min);
                          const hasDur = dur !== Number.MAX_SAFE_INTEGER;
                          return (
                            <tr key={r.id}>
                              <td
                                style={{
                                  color: 'var(--asb-muted)',
                                  fontFamily: 'var(--asb-mono, monospace)',
                                  fontSize: 12,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {str(r.unit_no) || '—'}.{str(r.lesson_no) || '—'}
                              </td>
                              <td style={{ fontWeight: 550 }}>{videoTitle(r)}</td>
                              <td>
                                {/* Avoid echoing the title when it already came
                                    from unit_title (see videoTitle fallback). */}
                                {str(r.unit_title) && str(r.unit_title) !== videoTitle(r)
                                  ? str(r.unit_title)
                                  : str(r.unit_no)
                                    ? `${t('Unité', 'Inite')} ${str(r.unit_no)}`
                                    : '—'}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {hasDur ? `${dur} min` : '—'}
                              </td>
                              <td>
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer">
                                    {t('Ouvrir', 'Louvri')}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--danger"
                                  onClick={() => handleDelete(r)}
                                  disabled={deletingId === r.id}
                                >
                                  {deletingId === r.id
                                    ? t('Suppression…', 'N ap efase…')
                                    : t('Supprimer', 'Efase')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="admin-page__subtitle" style={{ marginTop: 16 }}>
        {t(
          'Pour modifier le contenu détaillé d’une vidéo, utilisez ',
          'Pou modifye kontni detaye yon videyo, sèvi ak ',
        )}
        <Link to="/admin/data/collections">/admin/data/collections</Link>.
      </p>
    </div>
  );
}
