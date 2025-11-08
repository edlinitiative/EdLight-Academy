import React, { useEffect, useMemo, useState } from 'react';
import { addComment, addReply, subscribeToComments, subscribeToReplies } from '../services/firebase';
import { getCurrentUser } from '../services/firebase';

function timeAgo(timestamp) {
  // Handle Firestore Timestamp objects
  let ts = timestamp;
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    ts = timestamp.seconds * 1000;
  } else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
    ts = timestamp.toDate().getTime();
  }
  
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Comments({ threadKey, isAuthenticated, onRequireAuth }) {
  const [comments, setComments] = useState([]);
  const [commentReplies, setCommentReplies] = useState({}); // {commentId: [replies]}
  const [draft, setDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({}); // {commentId: text}
  const [replyOpen, setReplyOpen] = useState({}); // {commentId: boolean}
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  // Subscribe to comments for this thread
  useEffect(() => {
    if (!threadKey) return;
    
    setLoading(true);
    const unsubscribe = subscribeToComments(threadKey, (newComments) => {
      setComments(newComments);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [threadKey]);

  // Subscribe to replies for each comment
  useEffect(() => {
    const unsubscribers = [];
    
    comments.forEach((comment) => {
      const unsubscribe = subscribeToReplies(comment.id, (replies) => {
        setCommentReplies((prev) => ({
          ...prev,
          [comment.id]: replies
        }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [comments]);

  const handleAddComment = async () => {
    const text = draft.trim();
    if (!text || !isAuthenticated) return;
    
    const user = getCurrentUser();
    if (!user) {
      onRequireAuth();
      return;
    }

    try {
      setPosting(true);
      await addComment(threadKey, text, user);
      setDraft('');
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleAddReply = async (parentId) => {
    const text = (replyDrafts[parentId] || '').trim();
    if (!text || !isAuthenticated) return;
    
    const user = getCurrentUser();
    if (!user) {
      onRequireAuth();
      return;
    }

    try {
      setPosting(true);
      await addReply(parentId, text, user);
      setReplyDrafts((d) => ({ ...d, [parentId]: '' }));
      setReplyOpen((o) => ({ ...o, [parentId]: false }));
    } catch (error) {
      console.error('Error posting reply:', error);
      alert('Failed to post reply. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="comments card">
      <div className="comments__header">
        <h3 className="section__title" style={{ fontSize: '1.1rem' }}>Questions & Discussion</h3>
        <p className="text-muted" style={{ marginTop: '0.25rem' }}>
          Ask a question or share an idea about this lesson.
        </p>
      </div>

      <div className="comments__form">
        <textarea
          className="form-input"
          rows={3}
          placeholder={isAuthenticated ? 'Write a comment…' : 'Sign in to write a comment'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isAuthenticated || posting}
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
              onClick={handleAddComment}
              disabled={!draft.trim() || posting}
            >
              {posting ? 'Posting…' : 'Post comment'}
            </button>
          )}
        </div>
      </div>

      <div className="comments__list">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="loading-spinner" style={{ width: '32px', height: '32px' }} />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>No comments yet. Be the first to ask a question.</div>
        ) : (
          comments.map((c) => {
            const replies = commentReplies[c.id] || [];
            return (
              <div key={c.id} className="comment">
                <div className="comment__avatar" aria-hidden>💬</div>
                <div className="comment__body">
                  <div className="comment__meta">
                    <strong>{c.authorName || 'Student'}</strong>
                    <span className="text-muted">· {timeAgo(c.created_at)}</span>
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
                      Reply {c.replyCount > 0 && `(${c.replyCount})`}
                    </button>
                  </div>

                  {replies.length > 0 && (
                    <div className="comment__replies">
                      {replies.map((r) => (
                        <div key={r.id} className="comment comment--reply">
                          <div className="comment__avatar" aria-hidden>↳</div>
                          <div className="comment__body">
                            <div className="comment__meta">
                              <strong>{r.authorName || 'Student'}</strong>
                              <span className="text-muted">· {timeAgo(r.created_at)}</span>
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
                        disabled={posting}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          className="button button--ghost button--sm"
                          type="button"
                          onClick={() => setReplyOpen((o) => ({ ...o, [c.id]: false }))}
                          disabled={posting}
                        >
                          Cancel
                        </button>
                        <button
                          className="button button--primary button--sm"
                          type="button"
                          onClick={() => handleAddReply(c.id)}
                          disabled={!isAuthenticated || !(replyDrafts[c.id] || '').trim() || posting}
                        >
                          {posting ? 'Posting…' : 'Post reply'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}