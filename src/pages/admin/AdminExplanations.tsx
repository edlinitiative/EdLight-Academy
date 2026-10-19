import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb } from '../../components/icons';
import InstructionRenderer from '../../components/InstructionRenderer';
import { getIdToken } from '../../services/firebase';

/**
 * AdminExplanations — Contenu → "Explications".
 *
 * The reviewed Explique-moi cache (api/_lib/explanationCache.ts). For each
 * question × language that a VERIFIED Explique-moi request reached, the first
 * canonical worked explanation the model wrote waits here as `pending`.
 * Approve it (as is, or after editing) and the next students who ask about
 * that question get it instantly, with no model call, and can rate it
 * "Utile / Pas utile". Reject it and students keep getting a fresh reply.
 *
 * Everything goes through the admin-only /api/explanations (the collection is
 * server-only in firestore.rules), which records reviewedBy / reviewedAt and a
 * bounded review history.
 */

export interface ExplanationRow {
  key: string;
  source: 'exam' | 'bank';
  sourceId: string;
  examId?: string;
  questionIndex?: number;
  lang: 'fr' | 'ht';
  question: string;
  expectedAnswer?: string;
  authoredExplanation?: string;
  subject?: string;
  level?: string;
  questionType?: string;
  text: string;
  originalText?: string;
  model: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewedAt: number | null;
  uses: number;
  served: number;
  helpful: number;
  notHelpful: number;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | '';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchExplanations(filter: { status: StatusFilter; lang: string; subject: string }): Promise<ExplanationRow[]> {
  const qs = new URLSearchParams({ limit: '200' });
  if (filter.status) qs.set('status', filter.status);
  if (filter.lang) qs.set('lang', filter.lang);
  if (filter.subject.trim()) qs.set('subject', filter.subject.trim());
  const res = await fetch(`/api/explanations?${qs}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`explanations_${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.explanations) ? body.explanations : [];
}

export async function reviewExplanationRequest(id: string, decision: 'approve' | 'reject', text?: string): Promise<ExplanationRow> {
  const res = await fetch('/api/explanations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ action: 'review', id, decision, ...(text != null ? { text } : {}) }),
  });
  if (!res.ok) throw new Error(`review_${res.status}`);
  return (await res.json()).explanation;
}

const STATUS_LABEL: Record<ExplanationRow['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
};

const date = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function sourceLabel(r: ExplanationRow): string {
  if (r.source === 'exam') return `Examen ${r.examId ?? ''} · question ${Number(r.questionIndex ?? 0) + 1}`;
  return `Banque de quiz · ${r.sourceId}`;
}

function ExplanationCard({ row, onChange }: { row: ExplanationRow; onChange: (r: ExplanationRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (decision: 'approve' | 'reject', text?: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await reviewExplanationRequest(row.key, decision, text);
      onChange(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'review_failed');
    } finally {
      setBusy(false);
    }
  };

  const total = row.helpful + row.notHelpful;
  return (
    <article className="admin-card" style={{ marginBottom: 16, display: 'grid', gap: 12 }} aria-label={sourceLabel(row)}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          {sourceLabel(row)}
          {row.subject ? ` · ${row.subject}` : ''}
          {row.level ? ` · ${row.level}` : ''}
          {` · ${row.lang === 'ht' ? 'Kreyòl' : 'Français'}`}
        </div>
        <span className={`admin-role-pill${row.status === 'approved' ? ' admin-role-pill--admin' : ''}`}>{STATUS_LABEL[row.status]}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
        <span><strong>{row.uses}</strong> demandes</span>
        <span><strong>{row.served}</strong> servies sans IA</span>
        <span>Utile <strong>{row.helpful}</strong> · Pas utile <strong>{row.notHelpful}</strong>{total ? ` (${Math.round((row.helpful / total) * 100)} % utile)` : ''}</span>
      </div>

      <section>
        <div className="admin-tile__label">Question</div>
        <InstructionRenderer text={row.question} />
      </section>
      <section>
        <div className="admin-tile__label">Corrigé</div>
        {row.expectedAnswer ? <InstructionRenderer text={row.expectedAnswer} /> : <em>Aucun corrigé utilisable enregistré.</em>}
      </section>
      {row.authoredExplanation ? (
        <section>
          <div className="admin-tile__label">Explication rédigée (catalogue)</div>
          <InstructionRenderer text={row.authoredExplanation} />
        </section>
      ) : null}

      <section>
        <div className="admin-tile__label">Explication de Sandra{row.originalText ? ' (modifiée)' : ''}</div>
        {editing ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <textarea
              className="admin-input"
              rows={10}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Modifier l’explication"
              style={{ fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div className="admin-tile__label">Aperçu</div>
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-muted)' }}>
              <InstructionRenderer text={draft} />
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-muted)' }}>
            <InstructionRenderer text={row.text} />
          </div>
        )}
        <p style={{ fontSize: 12, opacity: 0.75, margin: '8px 0 0' }}>
          Vérifie la justesse de chaque étape par rapport au corrigé avant d’approuver : le texte approuvé est servi tel quel à tous les élèves.
        </p>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {editing ? (
          <>
            <button type="button" className="admin-btn" disabled={busy || !draft.trim()} onClick={() => void act('approve', draft)}>
              Enregistrer et approuver
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(row.text); }}>
              Annuler
            </button>
          </>
        ) : (
          <>
            {row.status !== 'approved' ? (
              <button type="button" className="admin-btn" disabled={busy} onClick={() => void act('approve')}>Approuver</button>
            ) : null}
            <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => { setDraft(row.text); setEditing(true); }}>
              Modifier puis approuver
            </button>
            {row.status !== 'rejected' ? (
              <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => void act('reject')}>Rejeter</button>
            ) : null}
          </>
        )}
      </div>
      {error ? <div role="alert" style={{ fontSize: 13 }}>Échec de l’enregistrement ({error}).</div> : null}

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Générée le {date(row.createdAt)} par {row.model || '—'}
        {row.reviewedAt ? ` · revue le ${date(row.reviewedAt)} par ${row.reviewedByName || row.reviewedBy}` : ''}
      </div>
    </article>
  );
}

export default function AdminExplanations() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [lang, setLang] = useState('');
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState({ status: 'pending' as StatusFilter, lang: '', subject: '' });
  const [rows, setRows] = useState<ExplanationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      setRows(await fetchExplanations(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'explanations_failed');
      setRows([]);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const replace = (next: ExplanationRow) =>
    setRows((prev) => (prev || []).map((r) => (r.key === next.key ? next : r)));

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Lightbulb size={13} aria-hidden="true" />
          CONTENU
        </div>
        <h1 className="admin-page__title">Explications</h1>
        <p className="admin-page__subtitle">
          Les explications « Explique-moi » écrites par Sandra pour une question déjà corrigée, une par
          question et par langue, classées par nombre de demandes. Une explication approuvée est servie
          immédiatement, sans appel à l’IA, puis Sandra continue la conversation à partir d’elle. Les
          textes en attente ou rejetés ne sont jamais montrés : l’élève reçoit une réponse fraîche.
        </p>
      </div>

      <form
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}
        onSubmit={(e) => { e.preventDefault(); setQuery({ status, lang, subject }); }}
      >
        <select className="admin-input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Statut">
          <option value="pending">En attente</option>
          <option value="approved">Approuvées</option>
          <option value="rejected">Rejetées</option>
          <option value="">Tous les statuts</option>
        </select>
        <select className="admin-input" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Langue">
          <option value="">Toutes les langues</option>
          <option value="fr">Français</option>
          <option value="ht">Kreyòl</option>
        </select>
        <input className="admin-input" style={{ width: 200 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Matière (ex. maths)" aria-label="Matière" />
        <button type="submit" className="admin-btn">Filtrer</button>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void load()}>Actualiser</button>
      </form>

      {rows == null ? (
        <div className="admin-card"><div className="admin-empty">Chargement…</div></div>
      ) : error ? (
        <div className="admin-card"><div className="admin-empty" role="alert">Impossible de charger les explications ({error}).</div></div>
      ) : rows.length === 0 ? (
        <div className="admin-card"><div className="admin-empty">Aucune explication pour ces filtres.</div></div>
      ) : (
        rows.map((r) => <ExplanationCard key={r.key} row={r} onChange={replace} />)
      )}
    </div>
  );
}
