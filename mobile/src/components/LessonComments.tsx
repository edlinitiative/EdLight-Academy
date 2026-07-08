import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MessageCircle, ChevronDown, ChevronUp, Send, Flag, Ban, Trash2 } from 'lucide-react-native';
import { addComment, subscribeToComments, reportComment, blockUser, deleteComment, getUserProfile } from '../services/firebase';
import useStore from '../contexts/store';

const PRIMARY = '#0857A6';

function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function timeAgo(ts: any, isCreole: boolean): string {
  const ms = toMillis(ts);
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return isCreole ? 'kounye a' : "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

/**
 * Per-lesson discussion. Uses the SAME `comments` Firestore collection and
 * threadKey (`comments:{courseId}:{lessonId}`) as the web, so threads stay in
 * sync across web + mobile. Real-time via subscribeToComments; posting requires
 * sign-in (otherwise prompts the auth modal).
 */
export default function LessonComments({ threadKey, isCreole }: { threadKey: string; isCreole: boolean }) {
  const user = useStore((s) => s.user);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);

  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [posting, setPosting] = useState(false);
  // Moderation (UGC): blocked author ids + locally-reported comment ids
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!threadKey) return;
    const unsub = subscribeToComments(threadKey, setComments);
    return () => { try { unsub && unsub(); } catch { /* ignore */ } };
  }, [threadKey]);

  // Load the current user's blocked authors so their comments stay hidden
  useEffect(() => {
    if (!user?.uid) { setBlockedUsers([]); return; }
    let active = true;
    getUserProfile(user.uid).then((p: any) => {
      if (active && Array.isArray(p?.blockedUsers)) setBlockedUsers(p.blockedUsers);
    }).catch(() => { /* ignore */ });
    return () => { active = false; };
  }, [user?.uid]);

  const post = async () => {
    const t = text.trim();
    if (!t || !user) return;
    setPosting(true);
    try { await addComment(threadKey, t, user); setText(''); } catch { /* ignore */ } finally { setPosting(false); }
  };

  const handleReport = (c: any) => {
    if (!user) return setShowAuthModal(true);
    reportComment(c.id, threadKey, 'inappropriate', user)
      .then(() => {
        setReportedIds((ids) => (ids.includes(c.id) ? ids : [...ids, c.id]));
        Alert.alert('', isCreole ? 'Mèsi, ou siyale kòmantè sa a' : 'Merci, ce commentaire a été signalé');
      })
      .catch(() => { /* ignore */ });
  };

  const handleBlock = (c: any) => {
    if (!user) return setShowAuthModal(true);
    blockUser(user.uid, c.authorId)
      .then(() => setBlockedUsers((ids) => (ids.includes(c.authorId) ? ids : [...ids, c.authorId])))
      .catch(() => { /* ignore */ });
  };

  const handleDelete = (c: any) => {
    Alert.alert(
      isCreole ? 'Efase kòmantè sa a ?' : 'Supprimer ce commentaire ?',
      undefined,
      [
        { text: isCreole ? 'Anile' : 'Annuler', style: 'cancel' },
        { text: isCreole ? 'Efase' : 'Supprimer', style: 'destructive', onPress: () => { deleteComment(c.id).catch(() => { /* ignore */ }); } },
      ],
    );
  };

  // Hide comments the user blocked or already reported this session
  const visibleComments = comments.filter(
    (c) => !reportedIds.includes(c.id) && !blockedUsers.includes(c.authorId),
  );

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', padding: 4, marginBottom: 16 }}>
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 }}
      >
        <MessageCircle color={PRIMARY} size={18} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
          {isCreole ? 'Diskisyon & kòmantè' : 'Discussion & commentaires'}
        </Text>
        {visibleComments.length > 0 ? (
          <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>{visibleComments.length}</Text>
          </View>
        ) : null}
        {expanded ? <ChevronUp color="#6b7280" size={18} /> : <ChevronDown color="#6b7280" size={18} />}
      </TouchableOpacity>

      {expanded ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 12 }}>
          {/* Composer / sign-in */}
          {isAuthenticated ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={isCreole ? 'Ekri yon kòmantè…' : 'Écrivez un commentaire…'}
                placeholderTextColor="#94a3b8"
                multiline
                style={{ flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#e8edf5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc' }}
              />
              <TouchableOpacity
                onPress={post}
                disabled={!text.trim() || posting}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() || posting ? 0.4 : 1 }}
              >
                {posting ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={18} />}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowAuthModal(true)}
              style={{ borderWidth: 1, borderColor: '#e8edf5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f8fafc' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: PRIMARY }}>
                {isCreole ? 'Konekte pou kòmante' : 'Se connecter pour commenter'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Thread */}
          {visibleComments.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 8 }}>
              {isCreole ? 'Poko gen kòmantè. Se ou premye a !' : 'Aucun commentaire pour le moment. Soyez le premier !'}
            </Text>
          ) : (
            visibleComments.map((c) => {
              const isOwn = !!user?.uid && c.authorId === user.uid;
              return (
                <View key={c.id} style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: '#eaf2fb', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>
                        {String(c.authorName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{c.authorName || 'Élève'}</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(c.created_at, isCreole)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20, marginLeft: 34 }}>{c.text}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginLeft: 34, marginTop: 6 }}>
                    {isOwn ? (
                      <TouchableOpacity onPress={() => handleDelete(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Trash2 color="#94a3b8" size={13} />
                        <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>{isCreole ? 'Efase' : 'Supprimer'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity onPress={() => handleReport(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Flag color="#94a3b8" size={13} />
                          <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>{isCreole ? 'Sinyale' : 'Signaler'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleBlock(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ban color="#94a3b8" size={13} />
                          <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>{isCreole ? 'Bloke' : 'Bloquer'}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}
