import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Flag, Ban, Trash2 } from 'lucide-react';
import { addComment, addReply, subscribeToComments, subscribeToReplies } from '../services/firebase';
import { getCurrentUser, reportComment, blockUser, deleteComment, getUserProfile } from '../services/firebase';
import useStore from '../contexts/store';

function timeAgo(timestamp, language) {
  // Handle Firestore Timestamp objects
  let ts = timestamp;
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    ts = timestamp.seconds * 1000;
  } else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
    ts = timestamp.toDate().getTime();
  }
  
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return language === 'ht' ? 'kounye a' : 'à l’instant';
  const m = Math.floor(s / 60);
  if (m < 60) return language === 'ht' ? `gen ${m} min` : `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return language === 'ht' ? `gen ${h} è` : `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return language === 'ht' ? 'yè' : 'hier';
  if (d < 7) return language === 'ht' ? `gen ${d} jou` : `il y a ${d} j`;
  const w = Math.floor(d / 7);
  if (w < 4) return language === 'ht' ? `gen ${w} semèn` : `il y a ${w} sem.`;
  return new Date(ts).toLocaleDateString();
}

export default function Comments({ threadKey, isAuthenticated, onRequireAuth }) {
  const language = useStore((s) => s.language);
  const defaultAuthorName = language === 'ht' ? 'Elèv' : 'Élève';
  const isCreole = language === 'ht';
  const [comments, setComments] = useState([]);
  const [commentReplies, setCommentReplies] = useState({}); // {commentId: [replies]}
  const [draft, setDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({}); // {commentId: text}
  const [replyOpen, setReplyOpen] = useState({}); // {commentId: boolean}
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  // Moderation (UGC): blocked author ids, locally-reported comment ids, transient notice
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [reportedIds, setReportedIds] = useState([]);
  const [notice, setNotice] = useState('');
  const currentUid = getCurrentUser()?.uid;

  // Load the current user's blocked authors so their comments stay hidden
  useEffect(() => {
    const user = getCurrentUser();
    if (!isAuthenticated || !user) {
      setBlockedUsers([]);
      return;
    }
    let active = true;
    getUserProfile(user.uid).then((profile) => {
      if (active && Array.isArray(profile?.blockedUsers)) setBlockedUsers(profile.blockedUsers);
    });
    return () => { active = false; };
  }, [isAuthenticated]);

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
      alert(isCreole ? 'Nou pa rive voye kòmantè a. Tanpri eseye ankò.' : 'Impossible de publier le commentaire. Veuillez réessayer.');
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
      alert(isCreole ? 'Nou pa rive voye repons lan. Tanpri eseye ankò.' : 'Impossible de publier la réponse. Veuillez réessayer.');
    } finally {
      setPosting(false);
    }
  };

  const handleReport = async (comment) => {
    const user = getCurrentUser();
    if (!user) return onRequireAuth();
    try {
      await reportComment(comment.id, threadKey, 'inappropriate', user);
      setReportedIds((ids) => (ids.includes(comment.id) ? ids : [...ids, comment.id]));
      setNotice(isCreole ? 'Mèsi, ou siyale kòmantè sa a' : 'Merci, ce commentaire a été signalé');
      setTimeout(() => setNotice(''), 4000);
    } catch (error) {
      console.error('Error reporting comment:', error);
      alert(isCreole ? 'Nou pa rive siyale kòmantè a. Eseye ankò.' : 'Impossible de signaler le commentaire. Réessayez.');
    }
  };

  const handleBlock = async (comment) => {
    const user = getCurrentUser();
    if (!user) return onRequireAuth();
    try {
      await blockUser(user.uid, comment.authorId);
      setBlockedUsers((ids) => (ids.includes(comment.authorId) ? ids : [...ids, comment.authorId]));
    } catch (error) {
      console.error('Error blocking user:', error);
      alert(isCreole ? 'Nou pa rive bloke itilizatè a. Eseye ankò.' : 'Impossible de bloquer l’utilisateur. Réessayez.');
    }
  };

  const handleDelete = async (comment) => {
    if (!window.confirm(isCreole ? 'Efase kòmantè sa a ?' : 'Supprimer ce commentaire ?')) return;
    try {
      await deleteComment(comment.id);
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert(isCreole ? 'Nou pa rive efase kòmantè a. Eseye ankò.' : 'Impossible de supprimer le commentaire. Réessayez.');
    }
  };

  // Hide comments the user blocked or already reported this session
  const visibleComments = comments.filter(
    (c) => !reportedIds.includes(c.id) && !blockedUsers.includes(c.authorId),
  );

  return (
    <section className="comments card">
      <div className="comments__header">
        <h3 className="section__title" style={{ fontSize: '1.1rem' }}>
          {isCreole ? 'Kesyon & Diskisyon' : 'Questions & échanges'}
        </h3>
        <p className="text-muted" style={{ marginTop: '0.25rem' }}>
          {isCreole
            ? 'Poze yon kesyon oswa pataje yon ide sou leson sa a.'
            : 'Posez une question ou partagez une idée sur cette leçon.'}
        </p>
      </div>

      <div className="comments__form">
        <textarea
          className="form-input"
          rows={3}
          placeholder={isAuthenticated
            ? (isCreole ? 'Ekri yon kòmantè…' : 'Écrivez un commentaire…')
            : (isCreole ? 'Konekte pou ekri yon kòmantè' : 'Connectez-vous pour écrire un commentaire')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isAuthenticated || posting}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          {!isAuthenticated ? (
            <button className="button button--primary button--sm" type="button" onClick={onRequireAuth}>
              {isCreole ? 'Konekte pou kòmante' : 'Se connecter pour commenter'}
            </button>
          ) : (
            <button
              className="button button--primary button--sm"
              type="button"
              onClick={handleAddComment}
              disabled={!draft.trim() || posting}
            >
              {posting
                ? (isCreole ? 'Ap voye…' : 'Publication…')
                : (isCreole ? 'Voye kòmantè' : 'Publier le commentaire')}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="text-muted" style={{ fontSize: '0.85rem', padding: '0.5rem 0' }} role="status">
          {notice}
        </div>
      )}

      <div className="comments__list">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="loading-spinner" style={{ width: '32px', height: '32px' }} />
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>
            {isCreole
              ? 'Pa gen kòmantè ankò. Se ou menm ki ka poze premye kesyon an.'
              : 'Aucun commentaire pour le moment. Soyez le premier à poser une question.'}
          </div>
        ) : (
          visibleComments.map((c) => {
            const replies = commentReplies[c.id] || [];
            return (
              <div key={c.id} className="comment">
                <div className="comment__avatar" aria-hidden><MessageCircle size={18} /></div>
                <div className="comment__body">
                  <div className="comment__meta">
                    <strong>{c.authorName || defaultAuthorName}</strong>
                    <span className="text-muted">· {timeAgo(c.created_at, language)}</span>
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
                      {isCreole ? 'Reponn' : 'Répondre'} {c.replyCount > 0 && `(${c.replyCount})`}
                    </button>
                    {currentUid && c.authorId === currentUid ? (
                      <button
                        className="button button--ghost button--sm"
                        type="button"
                        title={isCreole ? 'Efase' : 'Supprimer'}
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 size={14} /> {isCreole ? 'Efase' : 'Supprimer'}
                      </button>
                    ) : (
                      <>
                        <button
                          className="button button--ghost button--sm"
                          type="button"
                          title={isCreole ? 'Siyale' : 'Signaler'}
                          onClick={() => handleReport(c)}
                        >
                          <Flag size={14} /> {isCreole ? 'Siyale' : 'Signaler'}
                        </button>
                        <button
                          className="button button--ghost button--sm"
                          type="button"
                          title={isCreole ? 'Bloke' : 'Bloquer'}
                          onClick={() => handleBlock(c)}
                        >
                          <Ban size={14} /> {isCreole ? 'Bloke' : 'Bloquer'}
                        </button>
                      </>
                    )}
                  </div>

                  {replies.length > 0 && (
                    <div className="comment__replies">
                      {replies.map((r) => (
                        <div key={r.id} className="comment comment--reply">
                          <div className="comment__avatar" aria-hidden>↳</div>
                          <div className="comment__body">
                            <div className="comment__meta">
                              <strong>{r.authorName || defaultAuthorName}</strong>
                              <span className="text-muted">· {timeAgo(r.created_at, language)}</span>
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
                        placeholder={isCreole ? 'Ekri yon repons…' : 'Écrivez une réponse…'}
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
                          {isCreole ? 'Anile' : 'Annuler'}
                        </button>
                        <button
                          className="button button--primary button--sm"
                          type="button"
                          onClick={() => handleAddReply(c.id)}
                          disabled={!isAuthenticated || !(replyDrafts[c.id] || '').trim() || posting}
                        >
                          {posting
                            ? (isCreole ? 'Ap voye…' : 'Publication…')
                            : (isCreole ? 'Voye repons' : 'Publier la réponse')}
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