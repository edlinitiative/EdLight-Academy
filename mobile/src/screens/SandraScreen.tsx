/**
 * Sandra — full-screen AI tutor chat.
 *
 * Talks to the shared /api/chat endpoint through sandraService. The server
 * owns the transcript; this screen only keeps the visible session in memory.
 * Accepts an optional `onClose` prop so it can be presented modally (an X
 * button renders in the header when provided).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, RotateCcw, X, Send, Lock, AlertTriangle } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import useStore from '../contexts/store';
import { sendToSandra, writeConvId, MAX_CHARS } from '../services/sandraService';
import { tapLight, tapMedium } from '../utils/haptics';

// ── types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'sandra';
  text: string;
}

type Notice =
  | { kind: 'limit'; message: string }
  | { kind: 'auth' }
  | { kind: 'error'; failedText: string };

let msgSeq = 0;
const nextId = () => `msg-${Date.now()}-${msgSeq++}`;

// ── markdown styles (Sandra bubbles) ─────────────────────────────────────────

const markdownStyles = {
  body: { color: '#0f172a', fontSize: 14, lineHeight: 21 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  heading1: { fontSize: 18, fontWeight: '800' as const, color: '#0f172a', marginBottom: 6 },
  heading2: { fontSize: 16, fontWeight: '700' as const, color: '#0f172a', marginBottom: 6 },
  heading3: { fontSize: 15, fontWeight: '700' as const, color: '#0f172a', marginBottom: 4 },
  strong: { fontWeight: '700' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 2 },
  code_inline: {
    backgroundColor: '#eef2f9',
    color: '#1B6FE0',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
  },
  code_block: {
    backgroundColor: '#eef2f9',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  fence: {
    backgroundColor: '#eef2f9',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  blockquote: {
    backgroundColor: '#f4f7fb',
    borderLeftColor: '#1B6FE0',
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  link: { color: '#1B6FE0' },
};

// ── sub-components ────────────────────────────────────────────────────────────

function TypingDots({ label }: { label: string }) {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View className="flex-row items-center self-start" style={bubbleStyles.sandra}>
      <View className="flex-row items-center gap-1 mr-2">
        {dots.map((v, i) => (
          <Animated.View
            key={i}
            style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#1B6FE0', opacity: v }}
          />
        ))}
      </View>
      <Text className="text-xs text-gray-500">{label}</Text>
    </View>
  );
}

function SandraBubble({
  text,
  onLinkPress,
}: {
  text: string;
  onLinkPress?: (url: string) => boolean;
}) {
  return (
    <View className="self-start max-w-[85%]" style={bubbleStyles.sandra}>
      <Markdown style={markdownStyles} onLinkPress={onLinkPress}>
        {text}
      </Markdown>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View className="self-end max-w-[85%]" style={bubbleStyles.user}>
      <Text className="text-white text-sm leading-5">{text}</Text>
    </View>
  );
}

const bubbleStyles = {
  sandra: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8edf5',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    shadowColor: '#1B6FE0',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  user: {
    backgroundColor: '#1B6FE0',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
};

// ── main screen ───────────────────────────────────────────────────────────────

export default function SandraScreen({
  onClose,
  onNavigate,
}: {
  onClose?: () => void;
  /** Called with an in-app path (e.g. "/study-plan") when a chat link is tapped. */
  onNavigate?: (path: string) => void;
}) {
  const { user, language, toggleAuthModal } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lang: 'fr' | 'ht' = language === 'ht' ? 'ht' : 'fr';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const suggestions = [
    t('Explique-moi les fractions', 'Eksplike m fraksyon yo'),
    t('Comment réviser pour le bac ?', 'Kijan pou m revize pou bak la ?'),
    t('Aide-moi en économie', 'Ede m nan ekonomi'),
  ];

  /**
   * Sandra's replies embed markdown links to in-app tools (e.g.
   * "[/study-plan](/study-plan)", "[Examens Terminale](/exams/terminale)").
   * Route in-app paths through onNavigate; open genuine external URLs in the
   * browser. Returning false always suppresses the library's default openURL,
   * which can't resolve a relative in-app path (the old silent no-op bug).
   */
  const handleLinkPress = useCallback(
    (url: string): boolean => {
      const raw = (url || '').trim();
      if (!raw) return false;

      // Absolute URL: our own domain → treat its path as in-app; anything else
      // opens externally.
      const abs = raw.match(/^https?:\/\/([^/]+)(\/[^\s]*)?$/i);
      if (abs) {
        const host = abs[1].toLowerCase();
        if (host.endsWith('edlight.org')) {
          tapLight();
          onNavigate?.(abs[2] || '/');
        } else {
          Linking.openURL(raw).catch(() => {});
        }
        return false;
      }

      // Relative in-app path (the common case from Sandra's prompt).
      if (raw.startsWith('/')) {
        tapLight();
        onNavigate?.(raw);
        return false;
      }

      // mailto:, tel:, custom schemes — let the OS try.
      Linking.openURL(raw).catch(() => {});
      return false;
    },
    [onNavigate],
  );

  /** Core send. `appendUser` is false when retrying a turn whose bubble is already shown. */
  const deliver = useCallback(
    async (raw: string, appendUser: boolean) => {
      const text = raw.trim();
      if (!text || sending) return;

      setNotice(null);
      if (appendUser) {
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }]);
      }
      setSending(true);
      scrollToEnd();

      const result = await sendToSandra(text, lang, { path: '/mobile' });
      setSending(false);

      if (result.kind === 'reply') {
        setMessages((prev) => [...prev, { id: nextId(), role: 'sandra', text: result.reply }]);
      } else if (result.kind === 'limit') {
        setNotice({
          kind: 'limit',
          message:
            result.message ||
            t('Limite atteinte — réessayez plus tard.', 'Ou rive nan limit — eseye ankò pita.'),
        });
      } else if (result.kind === 'auth') {
        setNotice({ kind: 'auth' });
      } else {
        // Keep the user's bubble on screen and offer a retry of the same text.
        setNotice({ kind: 'error', failedText: text });
      }
      scrollToEnd();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sending, lang, isCreole],
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    tapMedium();
    setInput('');
    deliver(text, true);
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setNotice(null);
    writeConvId(null);
  };

  // ── guest gate ──────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Sparkles size={20} color="#E0532F" />
            <Text className="text-lg font-bold text-gray-900">Sandra</Text>
          </View>
          {onClose ? (
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.75}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8edf5' }}
              accessibilityLabel={t('Fermer', 'Fèmen')}
            >
              <X size={18} color="#0f172a" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="w-full items-center rounded-2xl p-6"
            style={{
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#e8edf5',
              shadowColor: '#1B6FE0',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: '#fdeae4' }}
            >
              <Lock size={24} color="#E0532F" />
            </View>
            <Text className="text-base font-bold text-gray-900 text-center mb-2">
              {t('Connectez-vous pour parler à Sandra', 'Konekte pou pale ak Sandra')}
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-5">
              {t(
                'Sandra est votre tutrice IA. Créez un compte gratuit pour lui poser vos questions.',
                'Sandra se titris IA ou. Kreye yon kont gratis pou poze l kesyon ou yo.',
              )}
            </Text>
            <TouchableOpacity
              onPress={toggleAuthModal}
              activeOpacity={0.8}
              className="rounded-full px-6 py-3"
              style={{ backgroundColor: '#1B6FE0' }}
            >
              <Text className="text-white font-bold text-sm">
                {t('Se connecter', 'Konekte')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── chat ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f6f9fd' }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          className="flex-row items-center justify-between px-4 py-3"
          style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e8edf5' }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: '#fdeae4' }}
            >
              <Sparkles size={20} color="#E0532F" />
            </View>
            <View>
              <Text className="text-lg font-bold text-gray-900">Sandra</Text>
              <Text className="text-xs text-gray-500">
                {t('Votre tutrice IA', 'Titris IA ou')}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleReset}
              activeOpacity={0.75}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e8edf5' }}
              accessibilityLabel={t('Nouvelle conversation', 'Nouvo konvèsasyon')}
            >
              <RotateCcw size={16} color="#1B6FE0" />
            </TouchableOpacity>
            {onClose ? (
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.75}
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e8edf5' }}
                accessibilityLabel={t('Fermer', 'Fèmen')}
              >
                <X size={18} color="#0f172a" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View>
              <SandraBubble
                onLinkPress={handleLinkPress}
                text={t(
                  'Bonjour ! Je suis Sandra, votre tutrice. Posez-moi vos questions sur vos cours !',
                  'Bonjou ! Mwen se Sandra, titris ou. Poze m kesyon ou yo sou kou ou yo !',
                )}
              />
              <View className="flex-row flex-wrap gap-2 mt-2">
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => { tapLight(); deliver(s, true); }}
                    disabled={sending}
                    activeOpacity={0.75}
                    className="rounded-full px-4 py-2"
                    style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#cfdff2',
                      opacity: sending ? 0.5 : 1,
                    }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: '#1B6FE0' }}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} text={m.text} />
              ) : (
                <SandraBubble key={m.id} text={m.text} onLinkPress={handleLinkPress} />
              ),
            )
          )}

          {sending ? <TypingDots label={t('Sandra écrit…', 'Sandra ap ekri…')} /> : null}

          {/* Notices */}
          {notice?.kind === 'limit' ? (
            <View
              className="flex-row items-start gap-2 rounded-xl p-3 mt-1"
              style={{ backgroundColor: '#fef7e6', borderWidth: 1, borderColor: '#f5d78e' }}
            >
              <AlertTriangle size={16} color="#b45309" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-xs leading-4" style={{ color: '#92400e' }}>
                {notice.message}
              </Text>
            </View>
          ) : null}

          {notice?.kind === 'auth' ? (
            <View
              className="flex-row items-start gap-2 rounded-xl p-3 mt-1"
              style={{ backgroundColor: '#eef4fb', borderWidth: 1, borderColor: '#cfdff2' }}
            >
              <Lock size={16} color="#1B6FE0" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-xs leading-4" style={{ color: '#1B6FE0' }}>
                {t('Connectez-vous pour parler à Sandra', 'Konekte pou pale ak Sandra')}
              </Text>
            </View>
          ) : null}

          {notice?.kind === 'error' ? (
            <View
              className="rounded-xl p-3 mt-1"
              style={{ backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f5b8ae' }}
            >
              <Text className="text-xs leading-4 mb-2" style={{ color: '#b91c1c' }}>
                {t(
                  'Oups, la réponse n’est pas arrivée. Vérifiez votre connexion.',
                  'Oups, repons lan pa rive. Tcheke koneksyon ou.',
                )}
              </Text>
              <TouchableOpacity
                onPress={() => deliver(notice.failedText, false)}
                disabled={sending}
                activeOpacity={0.8}
                className="self-start rounded-full px-4 py-1.5"
                style={{ backgroundColor: '#b91c1c', opacity: sending ? 0.5 : 1 }}
              >
                <Text className="text-white text-xs font-bold">
                  {t('Réessayer', 'Eseye ankò')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>

        {/* Input row */}
        <View
          className="flex-row items-end gap-2 px-3 py-2"
          style={{ backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e8edf5' }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={MAX_CHARS}
            placeholder={t('Posez votre question…', 'Poze kesyon ou…')}
            placeholderTextColor="#94a3b8"
            className="flex-1 text-sm text-gray-900"
            style={{
              backgroundColor: '#f4f7fb',
              borderWidth: 1,
              borderColor: '#e8edf5',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 10,
              maxHeight: 110,
            }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || !input.trim()}
            activeOpacity={0.8}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: '#1B6FE0',
              opacity: sending || !input.trim() ? 0.4 : 1,
            }}
            accessibilityLabel={t('Envoyer', 'Voye')}
          >
            <Send size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
