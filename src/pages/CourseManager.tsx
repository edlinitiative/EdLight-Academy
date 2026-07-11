import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, BookOpen, ChevronRight } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import useStore from '../contexts/store';

/**
 * Course list (admin console) — a compact, scannable table of courses. Each row
 * links to a per-course subpage (/admin/content/courses/:id) that manages that
 * course's units and lessons. Uses the shared admin primitives.
 */
export default function CourseManager() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => { loadCourses(); }, []);

  async function loadCourses() {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'courses'));
      const data: any[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      setCourses(data);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = courses.filter((c) => {
    if (!q.trim()) return true;
    const hay = `${c.display_name || c.name || ''} ${c.id} ${c.subject || ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow"><BookOpen size={13} /> {t('CONTENU', 'KONTNI')}</div>
        <h1 className="admin-page__title">{t('Cours', 'Kou')}</h1>
        <p className="admin-page__subtitle">
          {t('Gérez les unités et leçons de chaque cours.', 'Jere inite ak leson chak kou.')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="admin-input"
          style={{ maxWidth: 320 }}
          placeholder={t('Rechercher un cours…', 'Chèche yon kou…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="admin-btn admin-btn--ghost" onClick={loadCourses} type="button">
          <RefreshCw size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {t('Recharger', 'Rechaje')}
        </button>
      </div>

      {loading ? (
        <div className="admin-empty">{t('Chargement…', 'Ap chaje…')}</div>
      ) : filtered.length === 0 ? (
        <div className="admin-card admin-empty">{t('Aucun cours trouvé.', 'Pa gen kou.')}</div>
      ) : (
        <div className="admin-card admin-table__scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('Cours', 'Kou')}</th>
                <th>ID</th>
                <th style={{ textAlign: 'right' }}>{t('Unités', 'Inite')}</th>
                <th style={{ textAlign: 'right' }}>{t('Leçons', 'Leson')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.display_name || c.name || c.id}</td>
                  <td style={{ fontFamily: 'var(--asb-mono, monospace)', color: 'var(--asb-muted)', fontSize: 12 }}>{c.id}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.units?.length || 0}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.number_of_lessons || 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/admin/content/courses/${c.id}`} className="admin-btn">
                      {t('Gérer', 'Jere')} <ChevronRight size={13} style={{ verticalAlign: '-2px' }} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
