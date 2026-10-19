import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MessageCircle, ChevronDown, ChevronUp, Send, Flag, Ban, Trash2 } from 'lucide-react-native';
import { addComment, subscribeToComments, reportComment, blockUser, deleteComment, getUserProfile } from '../services/firebase';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';

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
  const { colors, fonts, cardSurface, isDark } = useTheme();
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

  const small = { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.muted };
  return (
    <View style={[cardSurface, { padding: 6, marginBottom: 16 }]}>
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 56 }}
      >
        <MessageCircle color={colors.azureInk} size={20} />
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }}>
          {isCreole ? 'Diskisyon & kòmantè' : 'Discussion & commentaires'}
        </Text>
        {visibleComments.length > 0 ? (
          <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>{visibleComments.length}</Text>
          </View>
        ) : null}
        {expanded ? <ChevronUp color={colors.muted} size={20} /> : <ChevronDown color={colors.muted} size={20} />}
      </TouchableOpacity>

      {expanded ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 16 }}>
          {/* Composer / sign-in */}
          {isAuthenticated ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={isCreole ? 'Ekri yon kòmantè…' : 'Écris un commentaire…'}
                placeholderTextColor={colors.faint}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                multiline
                style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, backgroundColor: colors.surfaceAlt }}
              />
              <TouchableOpacity
                onPress={post}
                disabled={!text.trim() || posting}
                accessibilityRole="button"
                accessibilityLabel={isCreole ? 'Voye' : 'Envoyer'}
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() || posting ? 0.4 : 1 }}
              >
                {posting ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={18} />}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowAuthModal(true)}
              accessibilityRole="button"
              style={{ borderRadius: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.azureSoft }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
                {isCreole ? 'Konekte pou kòmante' : 'Se connecter pour commenter'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Thread — rows separated by space, never a line. */}
          {visibleComments.length === 0 ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', paddingVertical: 8 }}>
              {isCreole ? 'Poko gen kòmantè. Se ou premye a !' : 'Aucun commentaire pour le moment. Sois le premier !'}
            </Text>
          ) : (
            visibleComments.map((c) => {
              const isOwn = !!user?.uid && c.authorId === user.uid;
              return (
                <View key={c.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.azureInk }}>
                        {String(c.authorName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink }}>{c.authorName || (isCreole ? 'Elèv' : 'Élève')}</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.faint }}>{timeAgo(c.created_at, isCreole)}</Text>
                  </View>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.ink, marginLeft: 40 }}>{c.text}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginLeft: 40, marginTop: 4 }}>
                    {isOwn ? (
                      <TouchableOpacity accessibilityRole="button" onPress={() => handleDelete(c)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
                        <Trash2 color={colors.muted} size={14} />
                        <Text style={small}>{isCreole ? 'Efase' : 'Supprimer'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity accessibilityRole="button" onPress={() => handleReport(c)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
                          <Flag color={colors.muted} size={14} />
                          <Text style={small}>{isCreole ? 'Sinyale' : 'Signaler'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity accessibilityRole="button" onPress={() => handleBlock(c)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
                          <Ban color={colors.muted} size={14} />
                          <Text style={small}>{isCreole ? 'Bloke' : 'Bloquer'}</Text>
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
