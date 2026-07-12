import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import {
  collection, getDocs, query, orderBy, limit as fbLimit, startAfter,
  type QueryDocumentSnapshot, type DocumentData, type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../../services/firebase';

/**
 * AdminSandra — read-only browser for Sandra chatbot conversations.
 *
 * Lists `chatConversations` docs (most recent activity first, cursor-paginated
 * 25 per page) and shows a selected conversation as an in-page transcript with
 * chat bubbles (Sandra left, student right). Renders inside AdminLayout's
 * <Outlet> (no chrome of its own). French hardcoded like the other admin pages.
 */

const PAGE_SIZE = 25;

interface ChatMessage {
  role?: string; // 'user' | 'assistant'
  text?: string;
  ts?: any;
}

interface ChatConversation {
  id: string;
  uid?: string;
  studentName?: string;
  studentEmail?: string;
  startedAt?: any;
  lastMessageAt?: any;
  messageCount?: number;
  lang?: string;
  firstPage?: string;
  messages?: ChatMessage[];
  [k: string]: any;
}

/** Coerce a Firestore Timestamp | ISO string | ms number into a Date. */
function toDate(value: any): Date | null {
  if (value == null || value === '') return null;
  let date: Date | null = null;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value === 'object' && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value: any): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('fr-FR') : '—';
}

function formatDateTime(value: any): string {
  const date = toDate(value);
  return date
    ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function langLabel(lang?: string): string {
  if (lang === 'ht') return 'Créole';
  if (lang === 'fr') return 'Français';
  return lang || '—';
}

export default function AdminSandra() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [selected, setSelected] = useState<ChatConversation | null>(null);

  const loadPage = useCallback(
    async (after: QueryDocumentSnapshot<DocumentData> | null) => {
      const ref = collection(db, 'chatConversations');
      const constraints: QueryConstraint[] = [orderBy('lastMessageAt', 'desc')];
      if (after) constraints.push(startAfter(after));
      constraints.push(fbLimit(PAGE_SIZE));
      let snap;
      try {
        snap = await getDocs(query(ref, ...constraints));
      } catch {
        // Some docs may lack lastMessageAt → fall back to an unordered read.
        snap = await getDocs(
          query(ref, ...(after ? [startAfter(after)] : []), fbLimit(PAGE_SIZE)),
        );
      }
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatConversation));
      setConversations((prev) => (after ? [...prev, ...rows] : rows));
      setCursor(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadPage(null);
      } catch (err) {
        console.error('[AdminSandra] Failed to load conversations:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadPage]);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } catch (err) {
      console.error('[AdminSandra] Failed to load more conversations:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  // ---- Transcript view (in-page; the loaded list stays mounted in state) ----
  if (selected) {
    const messages = Array.isArray(selected.messages) ? selected.messages : [];
    return (
      <div>
        <div className="admin-page__head">
          <div className="admin-page__eyebrow">
            <MessageCircle size={13} aria-hidden="true" /> SANDRA
          </div>
          <h1 className="admin-page__title">
            {selected.studentName || selected.studentEmail || selected.uid || 'Élève'}
          </h1>
          <p className="admin-page__subtitle">
            {selected.studentEmail ? `${selected.studentEmail} · ` : ''}
            {langLabel(selected.lang)} · Début&nbsp;: {formatDateTime(selected.startedAt)} ·{' '}
            {selected.messageCount ?? messages.length} message
            {(selected.messageCount ?? messages.length) > 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => setSelected(null)}
          >
            <ArrowLeft size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />
            Retour aux conversations
          </button>
        </div>

        <div className="admin-card" style={{ padding: 20 }}>
          {messages.length === 0 ? (
            <div className="admin-empty">Aucun message dans cette conversation.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.map((m, i) => {
                const isStudent = m.role === 'user';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isStudent ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: 'min(72%, 560px)',
                        padding: '10px 14px',
                        borderRadius: isStudent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        fontSize: 14,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        border: '1px solid var(--asb-line)',
                        background: isStudent
                          ? 'color-mix(in srgb, var(--asb-accent) 10%, transparent)'
                          : 'var(--asb-bg)',
                      }}
                    >
                      {m.text || ''}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: 'var(--asb-muted)',
                      }}
                    >
                      {isStudent ? 'Élève' : 'Sandra'}
                      {toDate(m.ts) ? ` · ${formatDateTime(m.ts)}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <MessageCircle size={13} aria-hidden="true" /> SANDRA
        </div>
        <h1 className="admin-page__title">Conversations Sandra</h1>
        <p className="admin-page__subtitle">
          {loading
            ? 'Chargement…'
            : `${conversations.length} conversation${conversations.length > 1 ? 's' : ''} chargée${conversations.length > 1 ? 's' : ''}${hasMore ? ' (plus disponibles)' : ''}`}
        </p>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="admin-empty">Chargement des conversations…</div>
        ) : conversations.length === 0 ? (
          <div className="admin-empty">Aucune conversation pour l'instant.</div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Début</th>
                  <th>Dernière activité</th>
                  <th>Messages</th>
                  <th>Langue</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(c);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Voir la conversation de ${c.studentName || c.studentEmail || c.uid || 'élève inconnu'}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.studentName || '—'}</div>
                      {c.studentEmail && (
                        <div style={{ fontSize: 12, color: 'var(--asb-muted)' }}>{c.studentEmail}</div>
                      )}
                    </td>
                    <td>{formatDate(c.startedAt)}</td>
                    <td>{formatDateTime(c.lastMessageAt)}</td>
                    <td>{typeof c.messageCount === 'number' ? c.messageCount : (c.messages?.length ?? '—')}</td>
                    <td>
                      <span className="admin-role-pill">{langLabel(c.lang)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && hasMore && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Chargement…' : 'Charger plus'}
          </button>
        </div>
      )}
    </div>
  );
}
