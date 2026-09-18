import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListChecks, ChevronLeft, Lock, Check, Pencil } from 'lucide-react';
import useStore from '../../contexts/store';
import {
  ArenaAdminError,
  OPTION_COUNT,
  PROMPT_TRUNCATE_CHARS,
  PROMPT_WARN_CHARS,
  authoringProgress,
  getQuestion,
  getTournament,
  listDeliveredIndices,
  listQuestions,
  saveQuestion,
  validateQuestionDraft,
  type ArenaQuestionDraft,
  type ArenaQuestionRow,
  type ArenaTournament,
  type QuestionIssue,
} from '../../services/arenaAdminService';

/**
 * AdminArenaQuestions — authoring the tournament's question bank.
 *
 * WHY THIS PAGE TALKS TO AN API AND NOT TO FIRESTORE. `firestore.rules` denies
 * every client read of `tournaments/{tid}/questions/**` — including an admin's,
 * deliberately, because the whole integrity model of the Arena rests on the
 * answer key existing server-side only. So everything here goes through
 * `/api/arena/questions`, which verifies `users/{uid}.role === 'admin'` with
 * the Admin SDK: the TABLE is fetched without answer keys, and a single key is
 * fetched only when an editor is actually opened.
 *
 * TWO THINGS THE PAGE MAKES VISIBLE ON PURPOSE.
 *
 * · **The slots nobody has written yet.** The table is built from the
 *   tournament's `questionCount`, not from the rows that came back, so the
 *   twenty-five slots are all on screen from the first day and "7 remaining" is
 *   a list rather than a subtraction. Writing twenty-five questions a month is
 *   the recurring operational cost of this format; a tool that only shows
 *   finished work hides the bill.
 *
 * · **A delivered question is locked, not broken.** Once `live/{index}` exists
 *   the students who answered answered THAT question, and re-scoring them
 *   against a new key would be indefensible. The endpoint returns 409; this
 *   page reads the delivery documents up front (they are client-readable) so
 *   the row shows as locked before anyone retypes a prompt.
 */

const emptyDraft = (index: number): ArenaQuestionDraft => ({
  index,
  prompt: '',
  promptHt: '',
  options: ['', '', '', ''],
  optionsHt: ['', '', '', ''],
  answerIndex: 0,
  explanation: '',
  category: '',
  difficulty: 3,
});

const LETTERS = ['A', 'B', 'C', 'D'];

export default function AdminArenaQuestions() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);

  const [params] = useSearchParams();
  const tid = params.get('tid') || '';

  const [tournament, setTournament] = useState<ArenaTournament | null>(null);
  const [rows, setRows] = useState<ArenaQuestionRow[]>([]);
  const [delivered, setDelivered] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArenaQuestionDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(async () => {
    if (!tid) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const [meta, questions, live] = await Promise.all([
        getTournament(tid),
        listQuestions(tid),
        listDeliveredIndices(tid),
      ]);
      setTournament(meta);
      setRows(questions);
      setDelivered(live);
    } catch (err) {
      const e = err as ArenaAdminError;
      console.error('[AdminArenaQuestions] load failed:', err);
      setLoadError(
        e?.code === 'unauthorized'
          ? t(
            'Accès refusé : /api/arena/questions vérifie le rôle administrateur côté serveur.',
            'Aksè refize : /api/arena/questions verifye wòl administratè a bò sèvè a.',
          )
          : t('Chargement impossible : ', 'Chajman enposib : ') + (e?.message || String(err)),
      );
    } finally {
      setLoading(false);
    }
  }, [tid, t]);

  useEffect(() => { void reload(); }, [reload]);

  const deliveredSet = useMemo(() => new Set(delivered), [delivered]);
  const byIndex = useMemo(() => {
    const map = new Map<number, ArenaQuestionRow>();
    rows.forEach((r) => map.set(r.index, r));
    return map;
  }, [rows]);

  const progress = useMemo(
    () => authoringProgress(rows, tournament?.questionCount || 0),
    [rows, tournament],
  );

  /**
   * Every slot the tournament has promised, written or not, plus any row that
   * exists past `questionCount` so a mismatch is visible rather than hidden.
   */
  const slots = useMemo(() => {
    const total = Math.max(tournament?.questionCount || 0, ...(rows.length ? rows.map((r) => r.index + 1) : [0]));
    return Array.from({ length: total }, (_, i) => ({
      index: i,
      row: byIndex.get(i) || null,
      locked: deliveredSet.has(i),
      extra: i >= (tournament?.questionCount || 0),
    }));
  }, [tournament, rows, byIndex, deliveredSet]);

  const validation = useMemo(
    () => (draft ? validateQuestionDraft(draft) : null),
    [draft],
  );

  // ── Issue copy ────────────────────────────────────────────────────────────

  const issueCopy = useCallback((issue: QuestionIssue): string => {
    switch (issue.code) {
      case 'prompt_empty':
        return t('L’énoncé (FR) est obligatoire.', 'Kesyon (FR) obligatwa.');
      case 'prompt_short':
        return t('L’énoncé est trop court pour être une question.', 'Kesyon an twò kout.');
      case 'option_count':
        return t(
          `Il faut exactement ${OPTION_COUNT} options — l’écran de jeu a quatre boutons.`,
          `Ou bezwen egzakteman ${OPTION_COUNT} opsyon — ekran jwèt la gen kat bouton.`,
        );
      case 'option_empty':
        return t(
          `L’option ${LETTERS[issue.option ?? 0]} est vide.`,
          `Opsyon ${LETTERS[issue.option ?? 0]} vid.`,
        );
      case 'answer_out_of_range':
        return t('Choisissez la bonne réponse.', 'Chwazi bon repons lan.');
      case 'options_ht_partial':
        return t(
          'Les options en kreyòl sont toutes les quatre ou aucune : à moitié traduites, l’élève ne peut pas distinguer la traduction d’un bug.',
          'Opsyon kreyòl yo se tout kat oswa okenn : si yo tradui a mwatye, elèv la pa ka konnen si se tradiksyon an oswa yon bug.',
        );
      case 'index_invalid':
        return t('Numéro de question invalide.', 'Nimewo kesyon an pa valab.');
      case 'prompt_long':
        return t(
          `Plus de ${PROMPT_WARN_CHARS} caractères : l’élève lit encore quand les points pleins (12 s) sont déjà passés.`,
          `Plis pase ${PROMPT_WARN_CHARS} karaktè : elèv la ap li toujou lè pwen konplè yo (12 s) gentan pase.`,
        );
      case 'prompt_truncated':
        return t(
          `Plus de ${PROMPT_TRUNCATE_CHARS} caractères : le serveur coupera la fin.`,
          `Plis pase ${PROMPT_TRUNCATE_CHARS} karaktè : sèvè a ap koupe bout la.`,
        );
      case 'prompt_ht_missing':
        return t(
          'Les options sont en kreyòl mais pas l’énoncé.',
          'Opsyon yo an kreyòl men kesyon an non.',
        );
      default:
        return issue.code;
    }
  }, [t]);

  // ── Editing ───────────────────────────────────────────────────────────────

  const openEditor = useCallback(async (index: number, exists: boolean) => {
    setMessage(null);
    if (!exists) { setDraft(emptyDraft(index)); return; }
    setDraftLoading(true);
    try {
      const q = await getQuestion(tid, index);
      setDraft(q || emptyDraft(index));
    } catch (err) {
      const e = err as ArenaAdminError;
      setMessage({ type: 'error', text: t('Lecture impossible : ', 'Lekti enposib : ') + (e?.message || String(err)) });
    } finally {
      setDraftLoading(false);
    }
  }, [tid, t]);

  const setField = <K extends keyof ArenaQuestionDraft>(key: K, value: ArenaQuestionDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const setOption = (list: 'options' | 'optionsHt', i: number, value: string) =>
    setDraft((d) => (d ? { ...d, [list]: d[list].map((o, idx) => (idx === i ? value : o)) } : d));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !validation?.ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveQuestion(tid, draft);
      await reload();
      setDraft(null);
      setMessage({ type: 'success', text: t('Question enregistrée.', 'Kesyon anrejistre.') });
    } catch (err) {
      const e2 = err as ArenaAdminError;
      if (e2?.code === 'already_delivered') {
        await reload();
        setDraft(null);
        setMessage({
          type: 'error',
          text: t(
            'Cette question a déjà été diffusée : elle est verrouillée. Les élèves qui ont répondu ont répondu à celle-là.',
            'Kesyon sa a deja difize : li fèmen. Elèv ki te reponn yo te reponn sa a.',
          ),
        });
      } else if (e2?.code === 'invalid_question') {
        setMessage({
          type: 'error',
          text: t(`Refusé par le serveur — champ « ${e2.field} ».`, `Sèvè a refize — chan « ${e2.field} ».`),
        });
      } else {
        setMessage({ type: 'error', text: t('Échec de l’enregistrement : ', 'Anrejistreman echwe : ') + (e2?.message || String(err)) });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!tid) {
    return (
      <div>
        <div className="admin-page__head">
          <div className="admin-page__eyebrow">
            <ListChecks size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
          </div>
          <h1 className="admin-page__title">{t('Questions de tournoi', 'Kesyon tounwa')}</h1>
        </div>
        <div className="admin-card">
          <div className="admin-empty">
            {t('Choisissez un tournoi depuis la liste Arena.', 'Chwazi yon tounwa nan lis Arena a.')}
            <div style={{ marginTop: 14 }}>
              <Link className="admin-btn" to="/admin/content/arena">{t('Aller à Arena', 'Ale nan Arena')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        className="admin-btn admin-btn--ghost"
        style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center' }}
        to={`/admin/content/arena?tid=${encodeURIComponent(tid)}`}
      >
        <ChevronLeft size={14} style={{ verticalAlign: -2 }} /> {t('Console du tournoi', 'Konsòl tounwa a')}
      </Link>

      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <ListChecks size={13} aria-hidden="true" /> {t('BANQUE DE QUESTIONS', 'BANK KESYON')}
        </div>
        <h1 className="admin-page__title">{tournament?.title || tid}</h1>
        <p className="admin-page__subtitle">
          {loading
            ? t('Chargement…', 'Ap chaje…')
            : t(
              `${progress.authored} / ${progress.total} rédigées · ${progress.remaining} restante${progress.remaining > 1 ? 's' : ''}`,
              `${progress.authored} / ${progress.total} ekri · ${progress.remaining} ki rete`,
            )}
        </p>
      </div>

      {/* The bill, as a bar. 25 questions a month is the format's running cost. */}
      <div className="admin-card" style={{ padding: 16, marginBottom: 18 }}>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--asb-accent, #1B6FE0) 12%, transparent)',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('Progression de la rédaction', 'Pwogrè redaksyon an')}
        >
          <div
            style={{
              width: `${progress.percent}%`,
              height: '100%',
              background: progress.complete ? '#0F9D58' : 'var(--asb-accent, #1B6FE0)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <p className="admin-page__subtitle" style={{ marginTop: 10, fontSize: 12 }}>
          {progress.over
            ? t(
              'Plus de questions rédigées que le tournoi n’en annonce — vérifiez questionCount.',
              'Gen plis kesyon ekri pase sa tounwa a anonse — tcheke questionCount.',
            )
            : t(
              'Les questions ne sont jamais lisibles depuis un navigateur : cette page passe par /api/arena/questions, et la bonne réponse n’est chargée qu’à l’ouverture d’un éditeur.',
              'Kesyon yo pa janm lizib depi yon navigatè : paj sa a pase pa /api/arena/questions, epi bon repons lan chaje sèlman lè yon editè ouvè.',
            )}
        </p>
      </div>

      {message && (
        <div className={`form-message form-message--${message.type}`} style={{ marginBottom: 16 }}>
          {message.text}
        </div>
      )}
      {loadError && (
        <div className="form-message form-message--error" style={{ marginBottom: 16 }}>{loadError}</div>
      )}

      {/* ── Editor ── */}
      {draft && (
        <form className="admin-card" style={{ padding: 20, marginBottom: 20 }} onSubmit={submit}>
          <div className="admin-tile__label" style={{ marginBottom: 14 }}>
            {t(`QUESTION ${draft.index + 1}`, `KESYON ${draft.index + 1}`)}
          </div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="admin-page__subtitle" style={{ fontSize: 12 }}>{t('Énoncé (français)', 'Kesyon (fransè)')}</span>
            <textarea
              className="admin-input"
              rows={2}
              value={draft.prompt}
              onChange={(e) => setField('prompt', e.target.value)}
              style={{ marginTop: 4, resize: 'vertical' }}
            />
            <span className="admin-page__subtitle" style={{ fontSize: 11 }}>
              {draft.prompt.trim().length} / {PROMPT_WARN_CHARS}
            </span>
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span className="admin-page__subtitle" style={{ fontSize: 12 }}>{t('Énoncé (kreyòl)', 'Kesyon (kreyòl)')}</span>
            <textarea
              className="admin-input"
              rows={2}
              value={draft.promptHt}
              onChange={(e) => setField('promptHt', e.target.value)}
              style={{ marginTop: 4, resize: 'vertical' }}
            />
          </label>

          <div className="admin-tile__label" style={{ marginBottom: 8 }}>
            {t('OPTIONS — COCHEZ LA BONNE RÉPONSE', 'OPSYON — TCHEKE BON REPONS LAN')}
          </div>
          {draft.options.map((opt, i) => (
            <div
              key={LETTERS[i]}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr 1fr',
                gap: 10,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="radio"
                  name="answerIndex"
                  checked={draft.answerIndex === i}
                  onChange={() => setField('answerIndex', i)}
                  aria-label={t(`Bonne réponse : option ${LETTERS[i]}`, `Bon repons : opsyon ${LETTERS[i]}`)}
                />
                {LETTERS[i]}
              </label>
              <input
                className="admin-input"
                value={opt}
                placeholder={t('Option (français)', 'Opsyon (fransè)')}
                onChange={(e) => setOption('options', i, e.target.value)}
              />
              <input
                className="admin-input"
                value={draft.optionsHt[i] || ''}
                placeholder={t('Option (kreyòl)', 'Opsyon (kreyòl)')}
                onChange={(e) => setOption('optionsHt', i, e.target.value)}
              />
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '16px 0' }}>
            <label style={{ display: 'block' }}>
              <span className="admin-page__subtitle" style={{ fontSize: 12 }}>{t('Catégorie', 'Kategori')}</span>
              <input
                className="admin-input"
                value={draft.category}
                onChange={(e) => setField('category', e.target.value)}
                style={{ marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span className="admin-page__subtitle" style={{ fontSize: 12 }}>{t('Difficulté (1–5)', 'Difikilte (1–5)')}</span>
              <input
                className="admin-input"
                type="number"
                min={1}
                max={5}
                value={draft.difficulty}
                onChange={(e) => setField('difficulty', Number(e.target.value))}
                style={{ marginTop: 4 }}
              />
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span className="admin-page__subtitle" style={{ fontSize: 12 }}>
              {t('Explication (jamais servie avant la fermeture)', 'Eksplikasyon (pa janm voye anvan fèmti a)')}
            </span>
            <textarea
              className="admin-input"
              rows={2}
              value={draft.explanation}
              onChange={(e) => setField('explanation', e.target.value)}
              style={{ marginTop: 4, resize: 'vertical' }}
            />
          </label>

          {validation && validation.errors.length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--danger-500, #E23D3D)', fontSize: 13 }}>
              {validation.errors.map((issue) => (
                <li key={`${issue.code}-${issue.option ?? 'x'}`}>{issueCopy(issue)}</li>
              ))}
            </ul>
          )}
          {validation && validation.warnings.length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: '#C77700', fontSize: 13 }}>
              {validation.warnings.map((issue) => (
                <li key={issue.code}>{issueCopy(issue)}</li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="admin-btn" type="submit" disabled={busy || !validation?.ok}>
              {busy ? t('Enregistrement…', 'Ap anrejistre…') : t('Enregistrer', 'Anrejistre')}
            </button>
            <button
              className="admin-btn admin-btn--ghost"
              type="button"
              disabled={busy}
              onClick={() => { setDraft(null); setMessage(null); }}
            >
              {t('Annuler', 'Anile')}
            </button>
          </div>
        </form>
      )}

      {/* ── Table ── */}
      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">{t('Chargement des questions…', 'Ap chaje kesyon yo…')}</div>
        ) : slots.length === 0 ? (
          <div className="admin-empty">
            {t(
              'Ce tournoi n’annonce aucune question (questionCount = 0).',
              'Tounwa sa a pa anonse okenn kesyon (questionCount = 0).',
            )}
          </div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>#</th>
                  <th>{t('Énoncé', 'Kesyon')}</th>
                  <th>{t('Catégorie', 'Kategori')}</th>
                  <th>{t('Diff.', 'Dif.')}</th>
                  <th>{t('Kreyòl', 'Kreyòl')}</th>
                  <th>{t('État', 'Eta')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {slots.map(({ index, row, locked, extra }) => (
                  <tr key={index}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {index + 1}
                      {extra && <span title={t('Au-delà de questionCount', 'Pi lwen pase questionCount')}> *</span>}
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      {row?.prompt || (
                        <span style={{ color: 'var(--asb-muted)' }}>{t('— à écrire', '— pou ekri')}</span>
                      )}
                    </td>
                    <td>{row?.category || '—'}</td>
                    <td>{row ? row.difficulty : '—'}</td>
                    <td>
                      {row && row.optionsHt.filter((o) => o).length === OPTION_COUNT
                        ? <Check size={14} aria-label={t('traduite', 'tradui')} />
                        : '—'}
                    </td>
                    <td>
                      {locked ? (
                        <span className="admin-role-pill" style={{ color: '#C77700', borderColor: 'currentColor' }}>
                          <Lock size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                          {t('diffusée', 'difize')}
                        </span>
                      ) : row?.authored ? (
                        <span className="admin-role-pill admin-role-pill--admin">{t('rédigée', 'ekri')}</span>
                      ) : (
                        <span className="admin-role-pill">{t('à écrire', 'pou ekri')}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={locked || draftLoading || busy}
                        title={locked
                          ? t(
                            'Question déjà diffusée : la modifier reviendrait à recorriger des élèves sur une autre question.',
                            'Kesyon an deja difize : chanje l ta vle di re-korije elèv sou yon lòt kesyon.',
                          )
                          : undefined}
                        onClick={() => void openEditor(index, !!row)}
                      >
                        {locked
                          ? <><Lock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t('Verrouillée', 'Fèmen')}</>
                          : <><Pencil size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{row ? t('Modifier', 'Modifye') : t('Rédiger', 'Ekri')}</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
