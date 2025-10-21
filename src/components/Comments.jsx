import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'edlight.comments.v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Comments({ threadKey, isAuthenticated, onRequireAuth }) {
  const [threads, setThreads] = useState({});
  const [draft, setDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({}); // {commentId: text}
  const [replyOpen, setReplyOpen] = useState({}); // {commentId: boolean}

  useEffect(() => {
    setThreads(loadAll());
  }, [threadKey]);

  const comments = useMemo(() => threads[threadKey] || [], [threads, threadKey]);

  const persist = (nextComments) => {
    const all = loadAll();
    all[threadKey] = nextComments;
    saveAll(all);
    setThreads(all);
  };

  const addComment = () => {
    const text = draft.trim();
    if (!text) return;
    const next = [
      {
        id: uid(),
        author: { name: 'You' },
        text,
        ts: Date.now(),
        replies: [],
      },
      ...comments,
    ];
    setDraft('');
    persist(next);
  };

  const addReply = (parentId) => {
    const text = (replyDrafts[parentId] || '').trim();
    if (!text) return;
    const next = comments.map((c) =>
      c.id === parentId
        ? {
            ...c,
            replies: [
              { id: uid(), author: { name: 'You' }, text, ts: Date.now() },
              ...(Array.isArray(c.replies) ? c.replies : []),
            ],
          }
        : c
    );
    setReplyDrafts((d) => ({ ...d, [parentId]: '' }));
    setReplyOpen((o) => ({ ...o, [parentId]: false }));
    persist(next);
  };

  return (
    <section className="comments card">
      <div className="comments__header">
        <h3 className="section__title" style={{ fontSize: '1.1rem' }}>Questions & Discussion</h3>
        <p className="text-muted" style={{ marginTop: '0.25rem' }}>
          Ask a question or share an idea about this lesson.
          <span className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>
            Note: comments are saved to your device only for now.
          </span>
        </p>
      </div>

      <div className="comments__form">
        <textarea
          className="form-input"
          rows={3}
          placeholder={isAuthenticated ? 'Write a comment…' : 'Sign in to write a comment'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isAuthenticated}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          {!isAuthenticated ? (
            <button className="button button--primary button--sm" type="button" onClick={onRequireAuth}>
              Sign in to comment
            </button>
          ) : (
            <button
              className="button button--primary button--sm"
              type="button"
              onClick={addComment}
              disabled={!draft.trim()}
            >
              Post comment
            </button>
          )}
        </div>
      </div>

      <div className="comments__list">
        {comments.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>No comments yet. Be the first to ask a question.</div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="comment__avatar" aria-hidden>💬</div>
              <div className="comment__body">
                <div className="comment__meta">
                  <strong>{c.author?.name || 'Student'}</strong>
                  <span className="text-muted">· {timeAgo(c.ts)}</span>
                </div>
                <div className="comment__text">{c.text}</div>
                <div className="comment__actions">
                  <button
                    className="button button--ghost button--sm"
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) return onRequireAuth();
                      setReplyOpen((o) => ({ ...o, [c.id]: !o[c.id] }));
                    }}
                  >
                    Reply
                  </button>
                </div>

                {Array.isArray(c.replies) && c.replies.length > 0 && (
                  <div className="comment__replies">
                    {c.replies.map((r) => (
                      <div key={r.id} className="comment comment--reply">
                        <div className="comment__avatar" aria-hidden>↳</div>
                        <div className="comment__body">
                          <div className="comment__meta">
                            <strong>{r.author?.name || 'Student'}</strong>
                            <span className="text-muted">· {timeAgo(r.ts)}</span>
                          </div>
                          <div className="comment__text">{r.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {replyOpen[c.id] && (
                  <div className="comment__reply-form">
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Write a reply…"
                      value={replyDrafts[c.id] || ''}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        className="button button--ghost button--sm"
                        type="button"
                        onClick={() => setReplyOpen((o) => ({ ...o, [c.id]: false }))}
                      >
                        Cancel
                      </button>
                      <button
                        className="button button--primary button--sm"
                        type="button"
                        onClick={() => addReply(c.id)}
                        disabled={!isAuthenticated || !(replyDrafts[c.id] || '').trim()}
                      >
                        Post reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
