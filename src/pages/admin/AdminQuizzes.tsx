import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, deleteQuiz } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * AdminQuizzes — browse / search / delete the Firestore `quizzes` collection.
 * Bulk / raw edits happen in the collection editor. Renders inside
 * AdminLayout's <Outlet> (no chrome of its own).
 */

interface QuizRow {
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

/** Truncate long question text for the table cell. */
function truncate(text: string, max = 90): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export default function AdminQuizzes() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [rows, setRows] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'quizzes'));
      const list: QuizRow[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRows(list);
    } catch (err) {
      console.error('[AdminQuizzes] Failed to load quizzes:', err);
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
      const prompt = pick(r, ['question', 'question_text', 'prompt', 'stem', 'title']).toLowerCase();
      const subject = pick(r, ['subject']).toLowerCase();
      return prompt.includes(q) || subject.includes(q) || r.id.toLowerCase().includes(q);
    });
  }, [rows, search]);

  async function handleDelete(row: QuizRow) {
    const label =
      pick(row, ['question', 'question_text', 'prompt', 'stem', 'title']) || row.id;
    const ok = window.confirm(
      t(`Supprimer le quiz « ${truncate(label, 60)} » ? Cette action est irréversible.`,
        `Efase kiz « ${truncate(label, 60)} » ? Aksyon sa a pa ka defèt.`),
    );
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await deleteQuiz(row.id);
      await load();
    } catch (err) {
      console.error('[AdminQuizzes] Failed to delete quiz:', err);
      window.alert(t('Échec de la suppression.', 'Efasman an echwe.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <ListChecks size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
        </div>
        <h1 className="admin-page__title">{t('Quiz', 'Kiz')}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'N ap chaje…')
            : t(
                `${rows.length} quiz au total`,
                `${rows.length} kiz antou`,
              )}
        </p>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <input
          type="search"
          className="admin-input"
          placeholder={t('Rechercher par question ou matière…', 'Chèche pa kesyon oswa matyè…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('Rechercher un quiz', 'Chèche yon kiz')}
        />
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">{t('Chargement des quiz…', 'N ap chaje kiz yo…')}</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            {search
              ? t('Aucun quiz ne correspond.', 'Pa gen kiz ki koresponn.')
              : t('Aucun quiz.', 'Pa gen kiz.')}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('ID', 'ID')}</th>
                  <th>{t('Question', 'Kesyon')}</th>
                  <th>{t('Matière', 'Matyè')}</th>
                  <th>{t('Cours / Unité', 'Kou / Inite')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const prompt = pick(r, ['question', 'question_text', 'prompt', 'stem', 'title']);
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                        {r.id}
                      </td>
                      <td>{prompt ? truncate(prompt) : '—'}</td>
                      <td>{pick(r, ['subject']) || '—'}</td>
                      <td>{pick(r, ['courseId', 'course_id', 'course', 'unitId', 'unit']) || '—'}</td>
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
          'Pour les modifications en masse ou brutes, utilisez ',
          'Pou modifikasyon an mas oswa brit, sèvi ak ',
        )}
        <Link to="/admin/data/collections">/admin/data/collections</Link>.
      </p>
    </div>
  );
}
