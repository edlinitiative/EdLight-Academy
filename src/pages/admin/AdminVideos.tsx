import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, deleteVideo } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * AdminVideos — browse / search / delete the Firestore `videos` collection.
 * Full document editing is out of scope; users are pointed at the raw
 * collection editor for that. Renders inside AdminLayout's <Outlet>.
 */

interface VideoRow {
  id: string;
  [key: string]: any;
}

/** Return the first non-empty value among `keys` on `obj`. */
function pick(obj: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

export default function AdminVideos() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const title = pick(r, ['title', 'name']).toLowerCase();
      const subject = pick(r, ['subject']).toLowerCase();
      return title.includes(q) || subject.includes(q) || r.id.toLowerCase().includes(q);
    });
  }, [rows, search]);

  async function handleDelete(row: VideoRow) {
    const label = pick(row, ['title', 'name']) || row.id;
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

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">{t('Chargement des vidéos…', 'N ap chaje videyo yo…')}</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            {search
              ? t('Aucune vidéo ne correspond.', 'Pa gen videyo ki koresponn.')
              : t('Aucune vidéo.', 'Pa gen videyo.')}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Titre', 'Tit')}</th>
                  <th>{t('Matière', 'Matyè')}</th>
                  <th>{t('Niveau', 'Nivo')}</th>
                  <th>{t('Cours', 'Kou')}</th>
                  <th>{t('Vidéo', 'Videyo')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const url = pick(r, ['video_url', 'youtube', 'youtube_url', 'url']);
                  return (
                    <tr key={r.id}>
                      <td>{pick(r, ['title', 'name']) || '—'}</td>
                      <td>{pick(r, ['subject']) || '—'}</td>
                      <td>{pick(r, ['level']) || '—'}</td>
                      <td>{pick(r, ['courseId', 'course_id', 'course']) || '—'}</td>
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
