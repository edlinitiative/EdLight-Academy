import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Plus, ArrowLeft } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, deleteQuiz, addQuiz, updateQuiz } from '../../services/firebase';
import useStore from '../../contexts/store';

/**
 * AdminQuizzes — browse / search / delete AND create / edit the Firestore
 * `quizzes` collection. Renders inside AdminLayout's <Outlet> (no chrome of its
 * own). Bulk / raw edits still happen in the collection editor.
 */

interface QuizRow {
  id: string;
  [key: string]: any;
}

/** Shape of the editor form. `options` is always an array of strings. */
interface QuizForm {
  question: string;
  options: string[];
  /** Index into `options` of the correct answer. Saved as option TEXT. */
  correctIndex: number;
  hint: string;
  good_response: string;
  wrong_response: string;
  subject: string;
  subject_code: string;
  level: string;
  unit: string;
  Chapter_Number: string;
  Subchapter_Number: string;
  video_title: string;
  question_type: string;
  difficulty: string;
  language: string;
  tags: string;
  source_doc: string;
}

const EMPTY_FORM: QuizForm = {
  question: '',
  options: ['', ''],
  correctIndex: 0,
  hint: '',
  good_response: '',
  wrong_response: '',
  subject: '',
  subject_code: '',
  level: '',
  unit: '',
  Chapter_Number: '',
  Subchapter_Number: '',
  video_title: '',
  question_type: 'mcq',
  difficulty: 'easy',
  language: 'fr',
  tags: '',
  source_doc: '',
};

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--asb-mono, monospace)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--asb-muted)',
  marginBottom: 5,
};

/**
 * Labelled field wrapper for the editor. Defined at module scope (NOT inside
 * the component) so React keeps the same component identity across renders —
 * otherwise the wrapped inputs would remount and lose focus on every keystroke.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Build an editor form from an existing quiz row (or a blank one for create).
 * `correct_answer` may be stored as the correct option's TEXT or as an index —
 * inspect defensively and resolve to a positional index for the radio group.
 */
function rowToForm(row: QuizRow | null): QuizForm {
  if (!row) return { ...EMPTY_FORM };

  const rawOptions = Array.isArray(row.options)
    ? row.options.map((o: any) => String(o ?? ''))
    : [];
  const options = rawOptions.length >= 2 ? rawOptions : [...rawOptions, '', ''].slice(0, 2);

  // Resolve correct_answer -> index. If it matches an option string, use that.
  // Otherwise, if it's a number, treat it as an index. Fall back to 0.
  let correctIndex = 0;
  const ca = row.correct_answer;
  if (ca != null) {
    const asTextIdx = options.findIndex((o) => o === String(ca));
    if (asTextIdx >= 0) {
      correctIndex = asTextIdx;
    } else if (typeof ca === 'number' && ca >= 0 && ca < options.length) {
      correctIndex = ca;
    } else if (!isNaN(Number(ca)) && String(ca).trim() !== '') {
      const n = Number(ca);
      if (n >= 0 && n < options.length) correctIndex = n;
    }
  }

  const tags = Array.isArray(row.tags)
    ? row.tags.join(', ')
    : row.tags != null
      ? String(row.tags)
      : '';

  const s = (v: any) => (v != null ? String(v) : '');

  return {
    question: s(row.question),
    options,
    correctIndex,
    hint: s(row.hint),
    good_response: s(row.good_response),
    wrong_response: s(row.wrong_response),
    subject: s(row.subject),
    subject_code: s(row.subject_code),
    level: s(row.level),
    unit: s(row.unit),
    Chapter_Number: s(row.Chapter_Number),
    Subchapter_Number: s(row.Subchapter_Number),
    video_title: s(row.video_title),
    question_type: s(row.question_type) || 'mcq',
    difficulty: s(row.difficulty) || 'easy',
    language: s(row.language) || 'fr',
    tags,
    source_doc: s(row.source_doc),
  };
}

export default function AdminQuizzes() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [rows, setRows] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Editor state. `editing` null = list view. editingId null = create mode.
  const [editing, setEditing] = useState<QuizForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

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

  function openCreate() {
    setMessage(null);
    setEditingId(null);
    setEditing({ ...EMPTY_FORM, options: ['', ''] });
  }

  function openEdit(row: QuizRow) {
    setMessage(null);
    setEditingId(row.id);
    setEditing(rowToForm(row));
  }

  function closeEditor() {
    setEditing(null);
    setEditingId(null);
    setSaving(false);
  }

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

  // ── Editor field helpers ──
  function setField<K extends keyof QuizForm>(key: K, value: QuizForm[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setOption(index: number, value: string) {
    setEditing((prev) => {
      if (!prev) return prev;
      const options = prev.options.slice();
      options[index] = value;
      return { ...prev, options };
    });
  }

  function addOption() {
    setEditing((prev) => (prev ? { ...prev, options: [...prev.options, ''] } : prev));
  }

  function removeOption(index: number) {
    setEditing((prev) => {
      if (!prev || prev.options.length <= 2) return prev; // min 2
      const options = prev.options.filter((_, i) => i !== index);
      let correctIndex = prev.correctIndex;
      if (index === correctIndex) correctIndex = 0;
      else if (index < correctIndex) correctIndex -= 1;
      return { ...prev, options, correctIndex };
    });
  }

  async function handleSave() {
    if (!editing) return;

    const question = editing.question.trim();
    const options = editing.options.map((o) => o.trim()).filter((o) => o !== '');
    if (!question) {
      setMessage({ type: 'error', text: t('La question est requise.', 'Kesyon an obligatwa.') });
      return;
    }
    if (options.length < 2) {
      setMessage({
        type: 'error',
        text: t('Ajoutez au moins deux options non vides.', 'Ajoute omwen de opsyon ki pa vid.'),
      });
      return;
    }

    // correct_answer is saved as the option TEXT (the safer canonical form),
    // not an index — clamp the chosen index to the trimmed options list.
    const correctIndex = Math.min(editing.correctIndex, options.length - 1);
    const correct_answer = options[correctIndex] ?? options[0];

    // tags: comma-separated string -> array (trimmed, empties dropped).
    const tags = editing.tags
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');

    // Numbers stay as strings — Firestore tolerates it; don't over-coerce.
    const quizData: Record<string, any> = {
      question,
      options,
      correct_answer,
      hint: editing.hint.trim(),
      good_response: editing.good_response.trim(),
      wrong_response: editing.wrong_response.trim(),
      subject: editing.subject.trim(),
      subject_code: editing.subject_code.trim(),
      level: editing.level.trim(),
      unit: editing.unit.trim(),
      Chapter_Number: editing.Chapter_Number.trim(),
      Subchapter_Number: editing.Subchapter_Number.trim(),
      video_title: editing.video_title.trim(),
      question_type: editing.question_type.trim() || 'mcq',
      difficulty: editing.difficulty.trim(),
      language: editing.language.trim() || 'fr',
      tags,
      source_doc: editing.source_doc.trim(),
    };

    setSaving(true);
    setMessage({ type: 'info', text: t('Enregistrement…', 'N ap anrejistre…') });
    try {
      if (editingId) {
        await updateQuiz(editingId, quizData);
      } else {
        await addQuiz(quizData);
      }
      await load();
      setMessage({
        type: 'success',
        text: editingId
          ? t('Quiz mis à jour.', 'Kiz mete ajou.')
          : t('Quiz créé.', 'Kiz kreye.'),
      });
      setEditing(null);
      setEditingId(null);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('[AdminQuizzes] Failed to save quiz:', err);
      setMessage({ type: 'error', text: `${t('Erreur', 'Erè')}: ${err?.message || err}` });
    } finally {
      setSaving(false);
    }
  }

  // ── EDITOR VIEW ──
  if (editing) {
    return (
      <div>
        <button
          type="button"
          className="admin-sidebar__back"
          onClick={closeEditor}
          style={{ marginBottom: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={14} /> {t('Retour à la liste', 'Retounen nan lis la')}
        </button>

        <div className="admin-page__head">
          <div className="admin-page__eyebrow">
            <ListChecks size={13} aria-hidden="true" />{' '}
            {editingId ? t('ÉDITER', 'EDITE') : t('NOUVEAU', 'NOUVO')}
          </div>
          <h1 className="admin-page__title">
            {editingId ? t('Éditer le quiz', 'Edite kiz la') : t('Ajouter un quiz', 'Ajoute yon kiz')}
          </h1>
          <p className="admin-page__subtitle">
            {editingId
              ? t(`ID : ${editingId}`, `ID : ${editingId}`)
              : t('Nouveau quiz avec ID auto-généré.', 'Nouvo kiz ak ID otomatik.')}
          </p>
        </div>

        {message && (
          <div
            className={`form-message form-message--${message.type}`}
            style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 4 }}
          >
            {message.text}
          </div>
        )}

        {/* Pedagogy group */}
        <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="admin-page__eyebrow" style={{ marginBottom: 14 }}>
            {t('PÉDAGOGIE', 'PEDAGOJI')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t('Question', 'Kesyon')}>
              <textarea
                className="admin-input"
                rows={3}
                value={editing.question}
                onChange={(e) => setField('question', e.target.value)}
              />
            </Field>

            <div>
              <label style={labelStyle}>{t('Options (choisir la bonne)', 'Opsyon (chwazi bon an)')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {editing.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name="correct-option"
                      aria-label={t(`Option ${i + 1} est correcte`, `Opsyon ${i + 1} kòrèk`)}
                      checked={editing.correctIndex === i}
                      onChange={() => setField('correctIndex', i)}
                      style={{ flex: 'none' }}
                    />
                    <input
                      type="text"
                      className="admin-input"
                      value={opt}
                      placeholder={t(`Option ${i + 1}`, `Opsyon ${i + 1}`)}
                      onChange={(e) => setOption(i, e.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      onClick={() => removeOption(i)}
                      disabled={editing.options.length <= 2}
                      aria-label={t('Retirer cette option', 'Retire opsyon sa a')}
                      style={{ flex: 'none' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={addOption}
                style={{ marginTop: 10 }}
              >
                <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                {t('Ajouter une option', 'Ajoute yon opsyon')}
              </button>
            </div>

            <Field label={t('Indice', 'Endis')}>
              <textarea
                className="admin-input"
                rows={2}
                value={editing.hint}
                onChange={(e) => setField('hint', e.target.value)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <Field label={t('Feedback si correct', 'Fidbak si kòrèk')}>
                <textarea
                  className="admin-input"
                  rows={2}
                  value={editing.good_response}
                  onChange={(e) => setField('good_response', e.target.value)}
                />
              </Field>
              <Field label={t('Feedback si incorrect', 'Fidbak si pa kòrèk')}>
                <textarea
                  className="admin-input"
                  rows={2}
                  value={editing.wrong_response}
                  onChange={(e) => setField('wrong_response', e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Taxonomy group */}
        <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="admin-page__eyebrow" style={{ marginBottom: 14 }}>
            {t('CLASSEMENT', 'KLASMAN')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Field label={t('Matière', 'Matyè')}>
              <input className="admin-input" value={editing.subject} onChange={(e) => setField('subject', e.target.value)} />
            </Field>
            <Field label={t('Code matière', 'Kòd matyè')}>
              <input className="admin-input" value={editing.subject_code} onChange={(e) => setField('subject_code', e.target.value)} />
            </Field>
            <Field label={t('Niveau', 'Nivo')}>
              <input className="admin-input" value={editing.level} onChange={(e) => setField('level', e.target.value)} />
            </Field>
            <Field label={t('Unité', 'Inite')}>
              <input className="admin-input" value={editing.unit} onChange={(e) => setField('unit', e.target.value)} />
            </Field>
            <Field label={t('Numéro de chapitre', 'Nimewo chapit')}>
              <input className="admin-input" value={editing.Chapter_Number} onChange={(e) => setField('Chapter_Number', e.target.value)} />
            </Field>
            <Field label={t('Numéro de sous-chapitre', 'Nimewo sou-chapit')}>
              <input className="admin-input" value={editing.Subchapter_Number} onChange={(e) => setField('Subchapter_Number', e.target.value)} />
            </Field>
            <Field label={t('Titre de la vidéo / leçon', 'Tit videyo / leson')}>
              <input className="admin-input" value={editing.video_title} onChange={(e) => setField('video_title', e.target.value)} />
            </Field>
            <Field label={t('Type de question', 'Tip kesyon')}>
              <input className="admin-input" value={editing.question_type} onChange={(e) => setField('question_type', e.target.value)} />
            </Field>
            <Field label={t('Difficulté', 'Difikilte')}>
              <select
                className="admin-input"
                value={editing.difficulty}
                onChange={(e) => setField('difficulty', e.target.value)}
              >
                <option value="easy">{t('Facile', 'Fasil')}</option>
                <option value="medium">{t('Moyen', 'Mwayen')}</option>
                <option value="hard">{t('Difficile', 'Difisil')}</option>
              </select>
            </Field>
            <Field label={t('Langue', 'Lang')}>
              <input className="admin-input" value={editing.language} onChange={(e) => setField('language', e.target.value)} />
            </Field>
            <Field label={t('Tags (séparés par des virgules)', 'Tag (separe ak vigil)')}>
              <input className="admin-input" value={editing.tags} onChange={(e) => setField('tags', e.target.value)} />
            </Field>
            <Field label={t('Document source', 'Dokiman sous')}>
              <input className="admin-input" value={editing.source_doc} onChange={(e) => setField('source_doc', e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={closeEditor} disabled={saving}>
            {t('Annuler', 'Anile')}
          </button>
          <button type="button" className="admin-btn" onClick={handleSave} disabled={saving}>
            {saving
              ? t('Enregistrement…', 'N ap anrejistre…')
              : editingId
                ? t('Enregistrer', 'Anrejistre')
                : t('Créer le quiz', 'Kreye kiz la')}
          </button>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
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
            : t(`${rows.length} quiz au total`, `${rows.length} kiz antou`)}
        </p>
      </div>

      {message && (
        <div
          className={`form-message form-message--${message.type}`}
          style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 4 }}
        >
          {message.text}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <input
            type="search"
            className="admin-input"
            placeholder={t('Rechercher par question ou matière…', 'Chèche pa kesyon oswa matyè…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('Rechercher un quiz', 'Chèche yon kiz')}
          />
        </div>
        <button type="button" className="admin-btn" onClick={openCreate}>
          <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {t('Ajouter un quiz', 'Ajoute yon kiz')}
        </button>
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
                          className="admin-btn admin-btn--ghost"
                          onClick={() => openEdit(r)}
                          style={{ marginRight: 8 }}
                        >
                          {t('Éditer', 'Edite')}
                        </button>
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
