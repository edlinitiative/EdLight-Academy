import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plus, Pencil, Trash2, Database, Lock, ChevronLeft } from 'lucide-react';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../data/triviaData';
import {
  loadTriviaCategories,
  loadTriviaQuestions,
  seedTriviaFromStatic,
  saveTriviaQuestion,
  deleteTriviaQuestion,
  saveTriviaCategory,
  GENERATED_CATEGORY_IDS,
} from '../../services/triviaService';
import useStore from '../../contexts/store';

/**
 * AdminTrivia — full editor for trivia content stored in Firestore.
 *
 * The live game reads static banks first and overlays Firestore, so this editor
 * only manages the overlay. Generated categories (capitals/currencies/flags)
 * are code-generated and shown read-only.
 * Renders inside AdminLayout's <Outlet>.
 */

const staticQuestions: Record<string, any[]> = TRIVIA_QUESTIONS as any;
const isGenerated = (id: string) => GENERATED_CATEGORY_IDS.includes(id);

const emptyForm = () => ({
  id: undefined as string | undefined,
  q: '',
  qHt: '',
  options: ['', ''],
  answer: 0,
  order: undefined as number | undefined,
});

export default function AdminTrivia() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fsCategories, setFsCategories] = useState<any[]>([]);
  const [fsQuestions, setFsQuestions] = useState<Record<string, any[]>>({});
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [catForm, setCatForm] = useState<any | null>(null);

  const seeded = fsCategories.length > 0;

  const reload = useCallback(async () => {
    setLoading(true);
    const [cats, qs] = await Promise.all([loadTriviaCategories(), loadTriviaQuestions()]);
    setFsCategories(cats);
    setFsQuestions(qs);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Category list to browse: Firestore's when seeded, else the static catalog.
  const displayCategories: any[] = seeded ? fsCategories : (TRIVIA_CATEGORIES as any[]);
  const selectedCat = displayCategories.find((c) => c.id === selectedCatId) || null;

  const questionsForSelected = (catId: string): any[] => {
    if (isGenerated(catId)) return staticQuestions[catId] || [];
    return fsQuestions[catId] || [];
  };

  const handleSeed = async () => {
    if (!window.confirm(t(
      'Migrer tout le contenu statique vers Firestore ? Les questions existantes en base seront remplacées.',
      'Migre tout kontni estatik la nan Firestore ? Kesyon ki deja nan baz la ap ranplase.',
    ))) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await seedTriviaFromStatic(TRIVIA_CATEGORIES as any[], staticQuestions);
      await reload();
      setMessage({
        type: 'success',
        text: t(
          `Migration terminée : ${res.categories} catégories, ${res.questions} questions.`,
          `Migrasyon fini : ${res.categories} kategori, ${res.questions} kesyon.`,
        ),
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: t('Échec de la migration : ', 'Migrasyon echwe : ') + (err?.message || err) });
    } finally {
      setBusy(false);
    }
  };

  // ── Question form handlers ──
  const openNew = () => {
    setForm(emptyForm());
    setShowForm(true);
    setMessage(null);
  };
  const openEdit = (q: any) => {
    setForm({
      id: q.id,
      q: q.q || '',
      qHt: q.qHt || '',
      options: Array.isArray(q.options) && q.options.length >= 2 ? [...q.options] : ['', ''],
      answer: typeof q.answer === 'number' ? q.answer : 0,
      order: typeof q.order === 'number' ? q.order : undefined,
    });
    setShowForm(true);
    setMessage(null);
  };
  const setOption = (i: number, val: string) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? val : o)) }));
  const addOption = () => setForm((f) => ({ ...f, options: [...f.options, ''] }));
  const removeOption = (i: number) =>
    setForm((f) => {
      const options = f.options.filter((_, idx) => idx !== i);
      let answer = f.answer;
      if (answer === i) answer = 0;
      else if (answer > i) answer -= 1;
      return { ...f, options, answer };
    });

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId) return;
    const cleanedOptions = form.options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!form.q.trim()) {
      setMessage({ type: 'error', text: t('La question (FR) est obligatoire.', 'Kesyon (FR) obligatwa.') });
      return;
    }
    if (cleanedOptions.length < 2) {
      setMessage({ type: 'error', text: t('Au moins 2 options sont requises.', 'Ou bezwen omwen 2 opsyon.') });
      return;
    }
    if (form.answer < 0 || form.answer >= cleanedOptions.length) {
      setMessage({ type: 'error', text: t('Choisissez une bonne réponse valide.', 'Chwazi yon bon repons valid.') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveTriviaQuestion(
        selectedCatId,
        {
          q: form.q.trim(),
          qHt: form.qHt.trim(),
          options: cleanedOptions,
          answer: form.answer,
          order: form.order,
        },
        form.id,
      );
      await reload();
      setShowForm(false);
      setForm(emptyForm());
      setMessage({ type: 'success', text: t('Question enregistrée.', 'Kesyon anrejistre.') });
    } catch (err: any) {
      setMessage({ type: 'error', text: t('Échec de l’enregistrement : ', 'Anrejistreman echwe : ') + (err?.message || err) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (q: any) => {
    if (!window.confirm(t('Supprimer cette question ?', 'Efase kesyon sa a ?'))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteTriviaQuestion(q.id);
      await reload();
      setMessage({ type: 'success', text: t('Question supprimée.', 'Kesyon efase.') });
    } catch (err: any) {
      setMessage({ type: 'error', text: t('Échec de la suppression : ', 'Efasman echwe : ') + (err?.message || err) });
    } finally {
      setBusy(false);
    }
  };

  // ── Category metadata form ──
  const openCatForm = (cat: any) => {
    setCatForm({
      name: cat.name || '',
      nameHt: cat.nameHt || '',
      description: cat.description || '',
      descriptionHt: cat.descriptionHt || '',
      color: cat.color || '',
      icon: cat.icon || '',
    });
    setMessage(null);
  };
  const submitCatForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId || !catForm) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveTriviaCategory(selectedCatId, catForm);
      await reload();
      setCatForm(null);
      setMessage({ type: 'success', text: t('Catégorie mise à jour.', 'Kategori mete ajou.') });
    } catch (err: any) {
      setMessage({ type: 'error', text: t('Échec : ', 'Echwe : ') + (err?.message || err) });
    } finally {
      setBusy(false);
    }
  };

  const catName = (cat: any) => (isCreole ? cat.nameHt || cat.name : cat.name);

  if (loading) {
    return (
      <div>
        <div className="admin-page__head">
          <div className="admin-page__eyebrow">
            <Sparkles size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
          </div>
          <h1 className="admin-page__title">{t('Trivia', 'Trivia')}</h1>
        </div>
        <div className="admin-card">
          <div className="admin-empty">{t('Chargement…', 'Ap chaje…')}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Sparkles size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
        </div>
        <h1 className="admin-page__title">{t('Trivia', 'Trivia')}</h1>
        <p className="admin-page__subtitle">
          {seeded
            ? t(
                `${fsCategories.length} catégories dans Firestore`,
                `${fsCategories.length} kategori nan Firestore`,
              )
            : t(
                'Contenu non migré — le jeu utilise les données statiques.',
                'Kontni pa migre — jwèt la ap sèvi ak done estatik yo.',
              )}
        </p>
      </div>

      {message && (
        <div className={`form-message form-message--${message.type}`} style={{ marginBottom: 16 }}>
          {message.text}
        </div>
      )}

      {/* Migration banner when Firestore is empty */}
      {!seeded && (
        <div className="admin-card" style={{ padding: 18, marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px' }}>
            {t(
              'Firestore ne contient pas encore de trivia. Le jeu fonctionne sur les données statiques. Migrez-les pour pouvoir les éditer.',
              'Firestore poko gen trivia. Jwèt la ap mache sou done estatik yo. Migre yo pou ou ka modifye yo.',
            )}
          </p>
          <button className="admin-btn" onClick={handleSeed} disabled={busy}>
            <Database size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {busy ? t('Migration…', 'Ap migre…') : t('Migrer le contenu vers Firestore', 'Migre kontni an nan Firestore')}
          </button>
        </div>
      )}

      {/* Re-seed option when already seeded */}
      {seeded && !selectedCat && (
        <div style={{ marginBottom: 16 }}>
          <button className="admin-btn admin-btn--ghost" onClick={handleSeed} disabled={busy}>
            <Database size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t('Re-migrer depuis le code (remplace tout)', 'Re-migre soti nan kòd la (ranplase tout)')}
          </button>
        </div>
      )}

      {/* Category tiles */}
      {!selectedCat && (
        <section className="admin-tiles" aria-label={t('Catégories de trivia', 'Kategori trivia')}>
          {displayCategories.map((cat) => {
            const gen = isGenerated(cat.id);
            const count = gen
              ? (staticQuestions[cat.id]?.length || 0)
              : (seeded ? (fsQuestions[cat.id]?.length || 0) : (staticQuestions[cat.id]?.length || 0));
            return (
              <button
                key={cat.id}
                className="admin-card admin-tile"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => { setSelectedCatId(cat.id); setShowForm(false); setCatForm(null); setMessage(null); }}
              >
                <div className="admin-tile__label">
                  <span aria-hidden="true" style={{ marginRight: 6 }}>{cat.icon}</span>
                  {catName(cat)}
                  {gen && <Lock size={11} style={{ marginLeft: 6, verticalAlign: 0 }} aria-label="auto" />}
                </div>
                <div className="admin-tile__value" style={{ color: cat.color }}>{count}</div>
                <div className="admin-page__subtitle" style={{ margin: 0 }}>
                  {gen
                    ? t('auto-générée', 'jenere otomatik')
                    : t(`${count} question${count > 1 ? 's' : ''}`, `${count} kesyon`)}
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Selected category detail */}
      {selectedCat && (
        <div>
          <button
            className="admin-btn admin-btn--ghost"
            style={{ marginBottom: 16 }}
            onClick={() => { setSelectedCatId(null); setShowForm(false); setCatForm(null); }}
          >
            <ChevronLeft size={14} style={{ verticalAlign: -2 }} /> {t('Toutes les catégories', 'Tout kategori yo')}
          </button>

          <div className="admin-page__head">
            <h2 className="admin-page__title" style={{ fontSize: 'clamp(20px, 2.6vw, 26px)' }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{selectedCat.icon}</span>
              {catName(selectedCat)}
            </h2>
          </div>

          {/* Category metadata editor */}
          {!isGenerated(selectedCat.id) && seeded && (
            catForm ? (
              <form className="admin-card" style={{ padding: 16, marginBottom: 20 }} onSubmit={submitCatForm}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <label>{t('Nom (FR)', 'Non (FR)')}
                    <input className="admin-input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                  </label>
                  <label>{t('Nom (HT)', 'Non (HT)')}
                    <input className="admin-input" value={catForm.nameHt} onChange={(e) => setCatForm({ ...catForm, nameHt: e.target.value })} />
                  </label>
                  <label>{t('Description (FR)', 'Deskripsyon (FR)')}
                    <input className="admin-input" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
                  </label>
                  <label>{t('Description (HT)', 'Deskripsyon (HT)')}
                    <input className="admin-input" value={catForm.descriptionHt} onChange={(e) => setCatForm({ ...catForm, descriptionHt: e.target.value })} />
                  </label>
                  <label>{t('Couleur', 'Koulè')}
                    <input className="admin-input" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} />
                  </label>
                  <label>{t('Icône', 'Ikòn')}
                    <input className="admin-input" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
                  </label>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button type="submit" className="admin-btn" disabled={busy}>{t('Enregistrer', 'Anrejistre')}</button>
                  <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setCatForm(null)}>{t('Annuler', 'Anile')}</button>
                </div>
              </form>
            ) : (
              <button className="admin-btn admin-btn--ghost" style={{ marginBottom: 16 }} onClick={() => openCatForm(selectedCat)}>
                <Pencil size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{t('Éditer la catégorie', 'Modifye kategori a')}
              </button>
            )
          )}

          {/* Generated → read-only note */}
          {isGenerated(selectedCat.id) ? (
            <div className="admin-card" style={{ padding: 18 }}>
              <p style={{ margin: 0 }}>
                <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t(
                  `Cette catégorie est générée automatiquement à partir des données pays (lecture seule). ${staticQuestions[selectedCat.id]?.length || 0} questions actives.`,
                  `Kategori sa a jenere otomatik apati done peyi yo (lekti sèlman). ${staticQuestions[selectedCat.id]?.length || 0} kesyon aktif.`,
                )}
              </p>
            </div>
          ) : !seeded ? (
            <div className="admin-card" style={{ padding: 18 }}>
              <p style={{ margin: 0 }}>
                {t(
                  'Migrez le contenu vers Firestore pour éditer les questions de cette catégorie.',
                  'Migre kontni an nan Firestore pou modifye kesyon kategori sa a.',
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Add + question form */}
              {showForm ? (
                <form className="admin-card" style={{ padding: 16, marginBottom: 20 }} onSubmit={submitForm}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <label>{t('Question (FR)', 'Kesyon (FR)')}
                      <textarea className="admin-input" rows={2} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
                    </label>
                    <label>{t('Question (HT)', 'Kesyon (HT)')}
                      <textarea className="admin-input" rows={2} value={form.qHt} onChange={(e) => setForm({ ...form, qHt: e.target.value })} />
                    </label>

                    <div>
                      <div className="admin-tile__label" style={{ marginBottom: 8 }}>
                        {t('Options (choisir la bonne réponse)', 'Opsyon (chwazi bon repons lan)')}
                      </div>
                      {form.options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <input
                            type="radio"
                            name="answer"
                            checked={form.answer === i}
                            onChange={() => setForm({ ...form, answer: i })}
                            aria-label={t('Bonne réponse', 'Bon repons')}
                          />
                          <input
                            className="admin-input"
                            value={opt}
                            onChange={(e) => setOption(i, e.target.value)}
                            placeholder={`${t('Option', 'Opsyon')} ${String.fromCharCode(65 + i)}`}
                          />
                          {form.options.length > 2 && (
                            <button type="button" className="admin-btn admin-btn--ghost admin-btn--danger" onClick={() => removeOption(i)} aria-label={t('Retirer', 'Retire')}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="admin-btn admin-btn--ghost" onClick={addOption}>
                        <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />{t('Ajouter une option', 'Ajoute yon opsyon')}
                      </button>
                    </div>

                    <label style={{ maxWidth: 160 }}>{t('Ordre (optionnel)', 'Lòd (opsyonèl)')}
                      <input
                        className="admin-input"
                        type="number"
                        value={form.order ?? ''}
                        onChange={(e) => setForm({ ...form, order: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-btn" disabled={busy}>
                      {busy ? t('Enregistrement…', 'Ap anrejistre…') : t('Enregistrer', 'Anrejistre')}
                    </button>
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { setShowForm(false); setForm(emptyForm()); }}>
                      {t('Annuler', 'Anile')}
                    </button>
                  </div>
                </form>
              ) : (
                <button className="admin-btn" style={{ marginBottom: 16 }} onClick={openNew}>
                  <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{t('Nouvelle question', 'Nouvo kesyon')}
                </button>
              )}

              {/* Questions table */}
              <div className="admin-card">
                <div className="admin-table__scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('Question', 'Kesyon')}</th>
                        <th>{t('Options', 'Opsyon')}</th>
                        <th>{t('Bonne réponse', 'Bon repons')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {questionsForSelected(selectedCat.id).length === 0 ? (
                        <tr><td colSpan={5}><div className="admin-empty">{t('Aucune question.', 'Pa gen kesyon.')}</div></td></tr>
                      ) : (
                        questionsForSelected(selectedCat.id).map((q, i) => {
                          const opts = Array.isArray(q.options) ? q.options : [];
                          const correct = opts[q.answer];
                          const truncated = (q.q || '').length > 70 ? `${q.q.slice(0, 70)}…` : q.q;
                          return (
                            <tr key={q.id || i}>
                              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{typeof q.order === 'number' ? q.order : i}</td>
                              <td>{truncated}</td>
                              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{opts.length}</td>
                              <td>{correct}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button className="admin-btn admin-btn--ghost" onClick={() => openEdit(q)} aria-label={t('Modifier', 'Modifye')}>
                                    <Pencil size={13} />
                                  </button>
                                  <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(q)} aria-label={t('Supprimer', 'Efase')}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
