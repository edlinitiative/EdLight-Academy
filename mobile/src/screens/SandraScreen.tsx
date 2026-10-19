/**
 * Sandra — full-screen AI tutor chat (Stitch 12a).
 *
 * Talks to the shared /api/chat endpoint through sandraService. The server
 * owns the transcript; this screen only keeps the visible session in memory.
 * Accepts an optional `onClose` prop so it can be presented modally (a back
 * button renders in the header when provided).
 *
 * Visual rules: white header with no line under it; azure message colour for
 * the student, opaque white bubbles for Sandra; formula plates are an opaque
 * tonal wash; the send disc is the page's one solid azure control.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, RotateCcw, Send, Lock, AlertTriangle, Lightbulb, BookOpen, Brain, Dumbbell, Sparkles,
} from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import MathText, { HAS_MATH } from '../components/MathText';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import PressableScale from '../components/ui/PressableScale';
import Button from '../components/ui/Button';
import SandraFace from '../components/sandra/SandraFace';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { sendToSandra, writeConvId, MAX_CHARS } from '../services/sandraService';
import { tapLight, tapMedium } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { useTheme, fonts, typeScale, touch, type Palette } from '../theme/theme';

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

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

// ── markdown styles (Sandra bubbles) ─────────────────────────────────────────

const markdownStylesFor = (colors: Palette, plate: string) => ({
  body: { color: colors.ink, fontFamily: fonts.regular, fontSize: 17, lineHeight: 27 },
  paragraph: { marginTop: 0, marginBottom: 10 },
  heading1: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.ink, marginBottom: 8 },
  heading2: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.ink, marginBottom: 6 },
  heading3: { fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 23, color: colors.ink, marginBottom: 4 },
  // Key terms in azure bold, as in the design.
  strong: { fontFamily: fonts.bold, color: colors.azureInk },
  bullet_list: { marginBottom: 10 },
  ordered_list: { marginBottom: 10 },
  list_item: { marginBottom: 4 },
  code_inline: {
    backgroundColor: plate,
    color: colors.azureInk,
    borderRadius: 6,
    paddingHorizontal: 5,
    fontFamily: MONO,
    fontSize: 15,
  },
  // Formula plate: an opaque tonal wash, monospace, no border.
  code_block: { backgroundColor: plate, borderRadius: 14, borderWidth: 0, padding: 16, fontFamily: MONO, fontSize: 16, color: colors.ink, marginBottom: 10 },
  fence: { backgroundColor: plate, borderRadius: 14, borderWidth: 0, padding: 16, fontFamily: MONO, fontSize: 16, color: colors.ink, marginBottom: 10 },
  // A wash, never a coloured left stripe.
  blockquote: { backgroundColor: plate, borderLeftWidth: 0, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  link: { color: colors.azureInk, fontFamily: fonts.bold, textDecorationLine: 'none' as const },
});

// ── sub-components ────────────────────────────────────────────────────────────

function TypingDots({ label }: { label: string }) {
  const { colors, cardSurface } = useTheme();
  const reduce = useReduceMotion();
  const dots = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  useEffect(() => {
    if (reduce) {
      dots.forEach((v) => v.setValue(0.7));
      return;
    }
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots, reduce]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <SandraFace size={32} />
      <View style={[cardSurface, { borderRadius: 22, borderTopLeftRadius: 6, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {dots.map((v, i) => (
            <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.azure, opacity: v }} />
          ))}
        </View>
        <Text style={[typeScale.caption, { color: colors.muted }]}>{label}</Text>
      </View>
    </View>
  );
}

/**
 * Split an assistant reply into consecutive runs of "math" lines (those
 * carrying inline/display LaTeX) and "markdown" lines. Math runs are typeset by
 * KaTeX via <MathText>, so `$…$` / `$$…$$` render as real formatted fractions,
 * roots, etc.; markdown runs keep bold, lists and links. A reply with no math
 * collapses to a single markdown run, so plain-text messages render exactly as
 * before.
 */
type Segment = { type: 'math' | 'md'; content: string };
function segmentSandraText(text: string): Segment[] {
  const segs: Segment[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const type: Segment['type'] = HAS_MATH.test(line) ? 'math' : 'md';
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.content += '\n' + line;
    else segs.push({ type, content: line });
  }
  return segs;
}

function SandraBubble({
  text,
  onLinkPress,
  accessibilityLabel,
  live,
}: {
  text: string;
  onLinkPress?: (url: string) => boolean;
  /** Screen-reader label, e.g. "Sandra: …". Groups the bubble as one node. */
  accessibilityLabel?: string;
  /** When true the bubble is announced politely as it appears (latest reply). */
  live?: boolean;
}) {
  const { colors, cardSurface, isDark } = useTheme();
  const plate = isDark ? colors.surfaceAlt : colors.bg;
  const mdStyles = useMemo(() => markdownStylesFor(colors, plate), [colors, plate]);
  const segments = useMemo(() => segmentSandraText(text), [text]);
  const hasMath = segments.some((s) => s.type === 'math');

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, maxWidth: '94%' }}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={live ? 'polite' : 'none'}
    >
      <SandraFace size={32} />
      <View style={[cardSurface, { flex: 1, borderRadius: 22, borderTopLeftRadius: 6, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }]}>
        {!hasMath ? (
          // No LaTeX anywhere → single markdown pass (unchanged plain-text path).
          <Markdown style={mdStyles} onLinkPress={onLinkPress}>
            {text}
          </Markdown>
        ) : (
          segments.map((seg, i) =>
            seg.type === 'math' ? (
              // KaTeX typesets the `$…$` parts; surrounding prose stays plain in
              // the themed ink color (MathText injects colors.ink).
              <View key={i} style={{ marginBottom: 10 }}>
                <MathText text={seg.content} />
              </View>
            ) : seg.content.trim() ? (
              <Markdown key={i} style={mdStyles} onLinkPress={onLinkPress}>
                {seg.content}
              </Markdown>
            ) : null,
          )
        )}
      </View>
    </View>
  );
}

function UserBubble({ text, accessibilityLabel }: { text: string; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end', maxWidth: '80%', marginBottom: 14,
        backgroundColor: colors.azureFill, borderRadius: 22, borderBottomRightRadius: 6,
        paddingHorizontal: 18, paddingVertical: 13,
      }}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={{ fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: '#ffffff' }}>{text}</Text>
    </View>
  );
}

/** A white suggestion pill with a line icon. */
function Chip({ label, Icon, onPress, disabled }: { label: string; Icon: any; onPress: () => void; disabled?: boolean }) {
  const { colors, elevation, isDark } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressedScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: touch.min,
          paddingHorizontal: 16, borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceAlt : colors.surface, opacity: disabled ? 0.5 : 1,
        },
        isDark ? null : elevation.thumb,
      ]}
    >
      <Icon size={18} color={colors.azureInk} strokeWidth={2} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={{ fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.ink }}>{label}</Text>
    </PressableScale>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function SandraScreen({
  onClose,
  onNavigate,
  initialAsk,
}: {
  onClose?: () => void;
  /** Called with an in-app path (e.g. "/study-plan") when a chat link is tapped. */
  onNavigate?: (path: string) => void;
  /** Query handed over from SearchScreen's "Mande Sandra" row — auto-sent
   *  when signed in, parked in the composer otherwise. */
  initialAsk?: string;
}) {
  const { user, language, toggleAuthModal, grade, track, enrolledCourses, lastActivity } = useStore();
  const { level } = useTrivia();
  const { colors, cardSurface, featureSurface, isDark } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const insets = useSafeAreaInsets();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lang: 'fr' | 'ht' = language === 'ht' ? 'ht' : 'fr';

  // From a modal sheet, dismiss it BEFORE asking for sign-in: the auth Modal
  // cannot present over a native modal screen, and when it tries, every later
  // touch is swallowed (reproduced in the sim 2026-10-17).
  const openSignIn = () => {
    if (onClose) {
      onClose();
      setTimeout(toggleAuthModal, 450);
    } else {
      toggleAuthModal();
    }
  };

  // Learner profile so Sandra tailors depth/examples to this grade (server
  // appends it to the system prompt). Same shape the web app sends.
  const studentContext = useMemo(
    () => ({ grade: grade ?? null, track: track ?? null, level: level?.level ?? null }),
    [grade, track, level?.level],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Suggestion chips drawn from the student's own context (last lesson, grade,
  // enrolled courses) so Sandra feels aware of where they are — with generic
  // prompts as fallbacks for fresh profiles.
  const suggestions = useMemo(() => {
    // (a) Pick up where they left off — their most recent lesson by title.
    const lessonChip =
      lastActivity?.type === 'lesson' && lastActivity.title
        ? t(`Explique-moi « ${lastActivity.title} »`, `Eksplike m « ${lastActivity.title} »`)
        : t('Explique-moi les fractions', 'Eksplike m fraksyon yo');

    // (b) Grade-aware: concours prep after the Bac, the official 9e exams, or
    // their most recent enrolled course by name for NS1–NS3.
    const latestCourse = enrolledCourses?.length
      ? enrolledCourses[enrolledCourses.length - 1]
      : null;
    let gradeChip: string;
    if (grade === 'NS4' || grade === 'POSTBAC') {
      gradeChip = t(
        'Comment préparer les concours et la préfac ?',
        'Kijan pou m prepare konkou yo ak prefak la ?',
      );
    } else if (grade === '9e') {
      gradeChip = t(
        'Aide-moi à préparer les examens de 9ème année',
        'Ede m prepare egzamen 9yèm ane yo',
      );
    } else if (latestCourse?.name) {
      gradeChip = t(`Aide-moi en ${latestCourse.name}`, `Ede m nan ${latestCourse.name}`);
    } else {
      gradeChip = t('Comment réviser pour le bac ?', 'Kijan pou m revize pou bak la ?');
    }

    // (c) One generic study-method question.
    const methodChip = t(
      'Comment mieux mémoriser mes leçons ?',
      'Kijan pou m memorize leson m yo pi byen ?',
    );

    return [
      { label: lessonChip, Icon: BookOpen },
      { label: gradeChip, Icon: Lightbulb },
      { label: methodChip, Icon: Brain },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastActivity, grade, enrolledCourses, isCreole]);

  // Follow-ups once Sandra has answered: they continue the same conversation.
  const followUps = useMemo(() => [
    { label: t('Donne-moi un exercice', 'Ban m yon egzèsis'), Icon: Dumbbell },
    { label: t('Explique avec un exemple', 'Eksplike ak yon egzanp'), Icon: Lightbulb },
    { label: t('Plus simplement', 'Pi senp'), Icon: Sparkles },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isCreole]);

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

      const result = await sendToSandra(text, lang, { path: '/mobile' }, studentContext);
      setSending(false);

      if (result.kind === 'reply') {
        setMessages((prev) => [...prev, { id: nextId(), role: 'sandra', text: result.reply }]);
      } else if (result.kind === 'limit') {
        setNotice({
          kind: 'limit',
          message:
            result.message ||
            t('Limite atteinte. Réessaie plus tard.', 'Ou rive nan limit. Eseye ankò pita.'),
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
    [sending, lang, isCreole, studentContext],
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

  // Search handoff: consume the query once on mount. Guests see it parked in
  // the composer behind the sign-in gate instead of losing it.
  const consumedAskRef = useRef(false);
  useEffect(() => {
    if (!initialAsk || consumedAskRef.current) return;
    consumedAskRef.current = true;
    if (user) deliver(initialAsk, true);
    else setInput(initialAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk, user]);

  // ── header (shared by the gate and the chat) ───────────────────────────────

  const iconButton = { width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: onClose ? 6 : 20, paddingRight: 12, paddingVertical: 10, backgroundColor: colors.surface }}>
      {onClose ? (
        <PressableScale onPress={onClose} haptic={false} accessibilityRole="button" accessibilityLabel={t('Retour', 'Retounen')} style={iconButton}>
          <ChevronLeft size={26} color={colors.ink} strokeWidth={2.2} />
        </PressableScale>
      ) : null}
      <SandraFace size={48} online={!!user} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: colors.ink }}>
            Sandra
          </Text>
          <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: isDark ? colors.ink : colors.azureInk }}>IA</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={[typeScale.caption, { color: colors.muted }]}>
          {t('Ta tutrice · répond en français ou en kreyòl', 'Titris ou · reponn an franse oswa an kreyòl')}
        </Text>
      </View>
      {user && messages.length > 0 ? (
        <PressableScale
          onPress={handleReset}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel={t('Nouvelle conversation', 'Nouvo konvèsasyon')}
          style={[iconButton, { backgroundColor: colors.surfaceAlt }]}
        >
          <RotateCcw size={18} color={colors.muted} strokeWidth={2.2} />
        </PressableScale>
      ) : null}
    </View>
  );

  // ── guest gate ──────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surface }}>
        {header}
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={[featureSurface, { padding: 24, alignItems: 'center' }]}>
            <View
              style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
            >
              <Lock size={26} color="#ffffff" strokeWidth={2.2} />
            </View>
            <Text style={[typeScale.section, { color: colors.ink, textAlign: 'center' }]}>
              {t('Connecte-toi pour parler à Sandra', 'Konekte pou pale ak Sandra')}
            </Text>
            <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 20 }]}>
              {t(
                'Sandra est ta tutrice IA. Crée un compte gratuit pour lui poser tes questions.',
                'Sandra se titris IA ou. Kreye yon kont gratis pou poze l kesyon ou yo.',
              )}
            </Text>
            <Button label={t('Se connecter', 'Konekte')} onPress={openSignIn} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── chat ────────────────────────────────────────────────────────────────────

  const greeting = t(
    'Bonjour ! Je suis Sandra, ta tutrice. Pose-moi tes questions sur tes cours, en français ou en kreyòl.',
    'Bonjou ! Mwen se Sandra, titris ou. Poze m kesyon ou yo sou kou ou yo, an franse oswa an kreyòl.',
  );
  const lastIsSandra = messages.length > 0 && messages[messages.length - 1].role === 'sandra';
  const chips = messages.length === 0 ? suggestions : lastIsSandra && !sending ? followUps : [];
  const canSend = !sending && !!input.trim();

  return (
    // surface, not bg: the safe-area strip above the header must be the SAME
    // colour as the header (TestFlight 2026-08-29). The chat area sets its own bg.
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {header}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }, centerColumn]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 }}>
            <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Aujourd’hui', 'Jodi a')}</Text>
          </View>

          {messages.length === 0 ? (
            <SandraBubble onLinkPress={handleLinkPress} text={greeting} accessibilityLabel={`Sandra : ${greeting}`} />
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} text={m.text} accessibilityLabel={`${t('Toi', 'Ou')} : ${m.text}`} />
              ) : (
                <SandraBubble
                  key={m.id}
                  text={m.text}
                  onLinkPress={handleLinkPress}
                  accessibilityLabel={`Sandra : ${m.text}`}
                  // Announce only the newest reply so VoiceOver reads it aloud
                  // as it lands, without re-announcing the whole transcript.
                  live={i === messages.length - 1}
                />
              ),
            )
          )}

          {sending ? <TypingDots label={t('Sandra écrit…', 'Sandra ap ekri…')} /> : null}

          {/* Notices — opaque tonal washes, no outlines. */}
          {notice?.kind === 'limit' ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, padding: 14, marginTop: 2, backgroundColor: colors.warnSoft }}>
              <AlertTriangle size={18} color={colors.warnInk} style={{ marginTop: 1 }} />
              <Text accessibilityRole="alert" style={[typeScale.status, { flex: 1, color: colors.ink }]}>
                {notice.message}
              </Text>
            </View>
          ) : null}

          {notice?.kind === 'auth' ? (
            <View style={{ gap: 12, borderRadius: 16, padding: 14, marginTop: 2, backgroundColor: colors.azureSoft }}>
              <Text accessibilityRole="alert" style={[typeScale.status, { color: colors.ink }]}>
                {t('Ta session a expiré. Reconnecte-toi pour parler à Sandra.', 'Sesyon ou ekspire. Rekonekte pou pale ak Sandra.')}
              </Text>
              <Button size="sm" label={t('Se connecter', 'Konekte')} variant="secondary" onPress={openSignIn} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}

          {notice?.kind === 'error' ? (
            <View style={{ gap: 12, borderRadius: 16, padding: 14, marginTop: 2, backgroundColor: colors.dangerSoft }}>
              <Text accessibilityRole="alert" style={[typeScale.status, { color: colors.ink }]}>
                {t(
                  'Oups, la réponse n’est pas arrivée. Vérifie ta connexion.',
                  'Oups, repons lan pa rive. Tcheke koneksyon ou.',
                )}
              </Text>
              <Button
                size="sm"
                variant="outline"
                label={t('Réessayer', 'Eseye ankò')}
                disabled={sending}
                onPress={() => deliver(notice.failedText, false)}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          ) : null}
        </ScrollView>

        {/* Suggestions + composer, on the page ground. */}
        <View style={{ backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 10) }}>
          {chips.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              {chips.map((c) => (
                <Chip key={c.label} label={c.label} Icon={c.Icon} disabled={sending} onPress={() => { tapLight(); deliver(c.label, true); }} />
              ))}
            </ScrollView>
          ) : null}

          <View style={[{ paddingHorizontal: 16, paddingTop: chips.length ? 0 : 10 }, centerColumn]}>
            <View
              style={[
                cardSurface,
                { borderRadius: 28, minHeight: 56, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 20, paddingRight: 4, paddingVertical: 4, gap: 8 },
              ]}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={MAX_CHARS}
                placeholder={t('Ta question pour Sandra…', 'Kesyon ou pou Sandra…')}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t('Ta question pour Sandra', 'Kesyon ou pou Sandra')}
                style={{
                  flex: 1,
                  fontFamily: fonts.regular,
                  fontSize: 17,
                  lineHeight: 23,
                  color: colors.ink,
                  paddingTop: 13,
                  paddingBottom: 13,
                  maxHeight: 120,
                }}
              />
              <PressableScale
                onPress={handleSend}
                disabled={!canSend}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={t('Envoyer', 'Voye')}
                accessibilityState={{ disabled: !canSend }}
                style={{
                  width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: canSend ? colors.azureFill : colors.surfaceAlt,
                }}
              >
                <Send size={20} color={canSend ? '#ffffff' : colors.faint} strokeWidth={2.2} />
              </PressableScale>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
