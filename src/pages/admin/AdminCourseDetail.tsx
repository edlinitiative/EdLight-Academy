import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Layers, Trash2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, removeLessonFromCourse } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * Per-course management subpage (/admin/content/courses/:courseId) — manage the
 * units and lessons of a single course. Compact, admin-console styled.
 */
export default function AdminCourseDetail() {
  const { courseId } = useParams();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [course, setCourse] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (!snap.exists()) { setNotFound(true); setCourse(null); }
      else { setCourse({ id: snap.id, ...snap.data() }); setNotFound(false); }
    } catch (e: any) {
      setMessage({ type: 'error', text: `${t('Erreur', 'Erè')}: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  async function handleRemoveLesson(unitId: string, lessonId: string, title: string) {
    if (!window.confirm(t(`Retirer « ${title} » de ce cours ?`, `Retire « ${title} » nan kou sa a ?`))) return;
    try {
      setMessage({ type: 'info', text: t('Suppression…', 'N ap efase…') });
      await removeLessonFromCourse(courseId, unitId, lessonId);
      setMessage({ type: 'success', text: t(`« ${title} » retirée.`, `« ${title} » retire.`) });
      await loadCourse();
      setTimeout(() => setMessage(null), 3000);
    } catch (e: any) {
      setMessage({ type: 'error', text: `${t('Erreur', 'Erè')}: ${e.message}` });
    }
  }

  const back = (
    <Link to="/admin/content/courses" className="admin-sidebar__back" style={{ marginBottom: 14 }}>
      <ArrowLeft size={14} /> {t('Tous les cours', 'Tout kou yo')}
    </Link>
  );

  if (loading) return <div><div className="admin-empty">{t('Chargement…', 'Ap chaje…')}</div></div>;
  if (notFound) return (
    <div>{back}<div className="admin-card admin-empty">{t('Cours introuvable.', 'Kou pa jwenn.')}</div></div>
  );

  const units = course?.units || [];

  return (
    <div>
      {back}
      <div className="admin-page__head">
        <div className="admin-page__eyebrow"><Layers size={13} /> {t('COURS', 'KOU')} · {course.id}</div>
        <h1 className="admin-page__title">{course.display_name || course.name || course.id}</h1>
        <p className="admin-page__subtitle">
          {units.length} {t('unités', 'inite')} · {course.number_of_lessons || 0} {t('leçons', 'leson')}
          {course.subject ? ` · ${course.subject}` : ''}
        </p>
      </div>

      {message && (
        <div className={`form-message form-message--${message.type}`} style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 4 }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="admin-btn admin-btn--ghost" onClick={loadCourse} type="button">
          <RefreshCw size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> {t('Recharger', 'Rechaje')}
        </button>
      </div>

      {units.length === 0 ? (
        <div className="admin-card admin-empty">{t('Aucune unité dans ce cours.', 'Pa gen inite nan kou sa a.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {units.map((unit: any, ui: number) => (
            <div key={unit.unitId || unit.id || ui} className="admin-card" style={{ padding: 0 }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--asb-line)' }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--asb-editorial, inherit)' }}>
                  {t('Unité', 'Inite')} {ui + 1} · {unit.title}
                </div>
                <div className="admin-page__eyebrow" style={{ marginTop: 3 }}>
                  {unit.unitId || unit.id} · {unit.lessons?.length || 0} {t('leçons', 'leson')}
                </div>
              </div>
              {(unit.lessons || []).length === 0 ? (
                <div className="admin-empty" style={{ padding: 20 }}>{t('Aucune leçon.', 'Pa gen leson.')}</div>
              ) : (
                <div className="admin-table__scroll">
                  <table className="admin-table">
                    <tbody>
                      {unit.lessons.map((lesson: any, li: number) => (
                        <tr key={lesson.lessonId || li}>
                          <td style={{ width: 44, color: 'var(--asb-muted)', fontFamily: 'var(--asb-mono, monospace)', fontSize: 12 }}>
                            {ui + 1}.{li + 1}
                          </td>
                          <td style={{ fontWeight: 550 }}>{lesson.title}</td>
                          <td><span className="admin-role-pill">{lesson.type || 'lesson'}</span></td>
                          <td style={{ color: 'var(--asb-muted)', fontFamily: 'var(--asb-mono, monospace)', fontSize: 11 }}>{lesson.lessonId}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="admin-btn admin-btn--danger"
                              onClick={() => handleRemoveLesson(unit.unitId || unit.id, lesson.lessonId, lesson.title)}
                              type="button"
                            >
                              <Trash2 size={13} style={{ verticalAlign: '-2px' }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
