import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import useStore from '../../contexts/store';

/**
 * AdminExams — read-only browse of the static exam catalog.
 * Exams are NOT stored in Firestore; they are shipped as a static index
 * (`/exam_catalog_index.json`) and managed via the exam pipeline, not the
 * console. Renders inside AdminLayout's <Outlet>.
 */

interface ExamMeta {
  exam_id?: string;
  exam_title?: string;
  title?: string;
  subject?: string;
  level?: string;
  year?: string | number;
  total_points?: number;
  difficulty?: number;
  [key: string]: any;
}

/** Map a raw catalog level to the public route segment used by ExamBrowser. */
function levelToUrl(rawLevel: string): string {
  const l = (rawLevel || '').toLowerCase();
  if (l.startsWith('9')) return '9e'; // 9eme_af
  if (l.startsWith('univers')) return 'university'; // universite
  return 'terminale'; // baccalaureat / terminale / default
}

export default function AdminExams() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [exams, setExams] = useState<ExamMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/exam_catalog_index.json');
        const data = await res.json();
        if (alive) setExams(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[AdminExams] Failed to load exam catalog:', err);
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
    if (!q) return exams;
    return exams.filter((e) => {
      const title = (e.exam_title || e.title || '').toLowerCase();
      const subject = (e.subject || '').toLowerCase();
      const level = (e.level || '').toLowerCase();
      return title.includes(q) || subject.includes(q) || level.includes(q);
    });
  }, [exams, search]);

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <FileText size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
        </div>
        <h1 className="admin-page__title">{t('Examens', 'Egzamen')}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'N ap chaje…')
            : t(
                `${exams.length} examen${exams.length > 1 ? 's' : ''} au catalogue`,
                `${exams.length} egzamen nan katalòg la`,
              )}
        </p>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          type="search"
          className="admin-input"
          placeholder={t('Rechercher par titre, matière ou niveau…', 'Chèche pa tit, matyè oswa nivo…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('Rechercher un examen', 'Chèche yon egzamen')}
        />
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">{t('Chargement du catalogue…', 'N ap chaje katalòg la…')}</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            {search
              ? t('Aucun examen ne correspond.', 'Pa gen egzamen ki koresponn.')
              : t('Aucun examen.', 'Pa gen egzamen.')}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Titre', 'Tit')}</th>
                  <th>{t('Matière', 'Matyè')}</th>
                  <th>{t('Niveau', 'Nivo')}</th>
                  <th>{t('Année', 'Ane')}</th>
                  <th>{t('Points', 'Pwen')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const id = e.exam_id || '';
                  const urlLevel = levelToUrl(e.level || '');
                  return (
                    <tr key={id || `${e.exam_title}-${e.year}`}>
                      <td>{e.exam_title || e.title || '—'}</td>
                      <td>{e.subject || '—'}</td>
                      <td>{e.level || '—'}</td>
                      <td>{e.year != null ? String(e.year) : '—'}</td>
                      <td>{e.total_points != null ? e.total_points : '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {id ? (
                          <Link
                            className="admin-btn admin-btn--ghost"
                            to={`/exams/${urlLevel}/${id}`}
                          >
                            {t('Voir', 'Gade')}
                          </Link>
                        ) : null}{' '}
                        <Link className="admin-btn admin-btn--ghost" to="/admin/content/verify">
                          {t('Vérifier', 'Verifye')}
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

      <p className="admin-page__subtitle" style={{ marginTop: 16 }}>
        {t(
          'Catalogue en lecture seule — les examens sont gérés via le pipeline d’examens, pas la console.',
          'Katalòg an lekti sèlman — egzamen yo jere atravè pipeline egzamen an, pa konsòl la.',
        )}
      </p>
    </div>
  );
}
