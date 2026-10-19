import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2, RotateCcw, Send, Sparkles, X } from '../icons';
import { authedFetch } from '../../services/firebase';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import InstructionRenderer from '../InstructionRenderer';
import { EXPLAIN_DISCLOSURE, type QuestionContext } from '../../../shared/explainContext';

/** sessionStorage key holding the active conversation id — a new browser
 *  session (or a full conversation) starts a fresh one. */
const CONV_KEY = 'edlight:sandra:conv';
const MAX_CHARS = 2000;

type ChatMessage = { role: 'user' | 'assistant'; text: string };

type ChatError =
  | { kind: 'generic'; retryText: string } // network / 5xx — offer retry
  | { kind: 'limit'; message: string }     // 429 — show the server's message
  | { kind: 'auth' };                      // 401 — stale/absent token

type PageContext = { path: string; courseId?: string; lessonId?: string };

function readConvId(): string | null {
  try {
    return sessionStorage.getItem(CONV_KEY);
  } catch {
    return null;
  }
}

function writeConvId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CONV_KEY, id);
    else sessionStorage.removeItem(CONV_KEY);
  } catch {
    /* sessionStorage unavailable — conversation just won't persist */
  }
}

interface SandraPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SandraPanel({ open, onClose }: SandraPanelProps) {
  const { t, i18n } = useTranslation();
  const { user, setShowAuthModal } = useStore();
  // Grade + filière drive Sandra's grounding; XP level comes from the trivia
  // profile. Sent as `studentContext` (shape the /api/chat endpoint reads).
  const grade = useStore((s) => s.grade);
  const track = useStore((s) => s.track);
  const { level: triviaLevel } = useTrivia();
  const location = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /*
   * "Explique-moi": the missed question this conversation is about. Kept for
   * the whole conversation (every follow-up is still about that question, and
   * the server rebuilds the system prompt per message) and dropped with
   * "Nouvelle conversation". A ref, not only state, because the ask handler
   * sends in the same tick it sets it.
   */
  const [explainCtx, setExplainCtx] = useState<QuestionContext | null>(null);
  const explainRef = useRef<QuestionContext | null>(null);
  const setExplain = (ctx: QuestionContext | null) => {
    explainRef.current = ctx;
    setExplainCtx(ctx);
  };

  // Keep the newest message (or the typing indicator) in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, error, open]);

  useEffect(() => {
    if (open && user) inputRef.current?.focus();
  }, [open, user]);

  // Search-overlay handoff: an explicit "Ask Sandra" tap auto-sends the query
  // (signed in) or parks it in the composer behind the sign-in prompt.
  const sandraAsk = useStore((s) => s.sandraAsk);
  const setSandraAsk = useStore((s) => s.setSandraAsk);
  useEffect(() => {
    if (!open || !sandraAsk) return;
    const ask = sandraAsk;
    setSandraAsk(null);
    if (typeof ask !== 'string') {
      // A question-grounded ask starts its own conversation, so the
      // explanation is not mixed into an unrelated thread.
      writeConvId(null);
      setMessages([]);
      setError(null);
      setExplain(ask.questionContext ?? null);
      if (user) void send(ask.message);
      else setInput(ask.message);
      return;
    }
    if (user) void send(ask);
    else setInput(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sandraAsk, user]);

  /** What the student is currently looking at — sent with every message so
   *  Sandra can ground her answer (`/courses/:courseId` pattern). */
  const pageContext = (): PageContext => {
    const path = location.pathname;
    const page: PageContext = { path };
    const courseMatch = path.match(/^\/courses\/([^/]+)/);
    if (courseMatch) page.courseId = decodeURIComponent(courseMatch[1]);
    const lessonId = new URLSearchParams(location.search).get('lesson');
    if (lessonId) page.lessonId = lessonId;
    return page;
  };

  const send = async (
    text: string,
    opts: { isRetry?: boolean; wasFullRetry?: boolean; convReset?: boolean } = {},
  ) => {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || sending) return;

    setError(null);
    // A retry re-sends a message whose bubble is already displayed.
    if (!opts.isRetry) setMessages((prev) => [...prev, { role: 'user', text: message }]);
    setSending(true);

    try {
      const body: Record<string, unknown> = {
        message,
        lang: i18n.language === 'ht' ? 'ht' : 'fr',
        page: pageContext(),
        studentContext: {
          grade: grade ?? null,
          track: track ?? null,
          level: typeof triviaLevel?.level === 'number' ? triviaLevel.level : null,
        },
      };
      if (explainRef.current) body.questionContext = explainRef.current;
      const convId = readConvId();
      if (convId) body.conversationId = convId;

      // 90 s ceiling (P0 validation): without it a stalled request kept
      // `sending` true and Sandra ignored every later message until reload.
      const res = await authedFetch('/api/chat', body, { timeoutMs: 90_000 });

      // 403 with a conversation id = that thread isn't this account's (an
      // older tab session). Drop it and send once into a fresh conversation.
      if (res.status === 403 && convId && !opts.convReset) {
        writeConvId(null);
        setSending(false);
        await send(message, { ...opts, isRetry: true, convReset: true });
        return;
      }

      if (res.status === 401) {
        setError({ kind: 'auth' });
        return;
      }
      if (res.status === 429) {
        let msg = '';
        try {
          const data = await res.json();
          if (typeof data?.message === 'string') msg = data.message;
        } catch {
          /* body not JSON — fall back to the generic copy */
        }
        setError({ kind: 'limit', message: msg || t('sandra.error') });
        return;
      }
      if (!res.ok) {
        setError({ kind: 'generic', retryText: message });
        return;
      }

      const data = await res.json();
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';

      if (data?.conversationFull) {
        // Conversation hit the server-side cap — drop the id so the next
        // message starts a fresh conversation.
        writeConvId(null);
        if (!reply && !opts.wasFullRetry) {
          // The capped turn wasn't answered; transparently re-send it once
          // into the new conversation.
          setSending(false);
          await send(message, { isRetry: true, wasFullRetry: true });
          return;
        }
      } else if (typeof data?.conversationId === 'string' && data.conversationId) {
        writeConvId(data.conversationId);
      }

      if (!reply) {
        setError({ kind: 'generic', retryText: message });
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setError({ kind: 'generic', retryText: message });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startNewConversation = () => {
    writeConvId(null);
    setExplain(null);
    setMessages([]);
    setError(null);
    setInput('');
    inputRef.current?.focus();
  };

  const signedIn = !!user;
  const showAuthPrompt = !signedIn || error?.kind === 'auth';
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className={`sandra-panel ${expanded ? 'sandra-panel--expanded' : ''}`}
      hidden={!open}
      role="dialog"
      aria-label={`Sandra · ${t('sandra.subtitle')}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="sandra-panel__header">
        <span className="sandra-glyph" aria-hidden="true">
          <Sparkles size={14} strokeWidth={2.4} />
        </span>
        <h2 className="sandra-panel__title">
          Sandra <span className="sandra-panel__title-sep">·</span>{' '}
          <span className="sandra-panel__subtitle">{t('sandra.subtitle')}</span>
        </h2>
        <div className="sandra-panel__actions">
          <button
            type="button"
            className="sandra-panel__icon-btn"
            aria-label={expanded ? t('sandra.collapse') : t('sandra.expand')}
            title={expanded ? t('sandra.collapse') : t('sandra.expand')}
            aria-pressed={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded
              ? <Minimize2 size={16} strokeWidth={2.2} aria-hidden="true" />
              : <Maximize2 size={16} strokeWidth={2.2} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="sandra-panel__icon-btn"
            aria-label={t('sandra.newConversation')}
            title={t('sandra.newConversation')}
            onClick={startNewConversation}
          >
            <RotateCcw size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sandra-panel__icon-btn"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>

      {explainCtx && (
        <p className="sandra-panel__explain-note" role="note">
          {i18n.language === 'ht' ? EXPLAIN_DISCLOSURE.ht : EXPLAIN_DISCLOSURE.fr}
        </p>
      )}
      <div className="sandra-panel__messages" ref={listRef} aria-live="polite">
        {signedIn && messages.length === 0 && !sending && !error && (
          <div className="sandra-welcome">
            <span className="sandra-glyph sandra-glyph--bubble" aria-hidden="true">
              <Sparkles size={13} strokeWidth={2.4} />
            </span>
            <div className="sandra-welcome__body">
              <p className="sandra-welcome__title">{t('sandra.welcomeTitle')}</p>
              <p className="sandra-welcome__text">{t('sandra.welcomeBody')}</p>
              {/* Understanding and grading are different situations (§6.9), so
                  the boundary is stated once, here, where the student meets
                  Sandra — rather than letting her quietly vanish mid-exam. */}
              <p className="sandra-welcome__rule">
                {i18n.language === 'ht'
                  ? 'Sandra la pou esplike ak korije. Li pa reponn pandan yon egzamen ak chronomèt ni pandan yon match konpetisyon.'
                  : 'Sandra explique et corrige. Elle ne répond pas pendant une épreuve chronométrée ni pendant un match de compétition.'}
              </p>
              <div className="sandra-welcome__prompts">
                {[t('sandra.suggest1'), t('sandra.suggest2'), t('sandra.suggest3')].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="sandra-welcome__prompt"
                    onClick={() => send(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="sandra-msg sandra-msg--user">
              {m.text}
            </div>
          ) : (
            <div key={i} className="sandra-row">
              <span className="sandra-glyph sandra-glyph--bubble" aria-hidden="true">
                <Sparkles size={13} strokeWidth={2.4} />
              </span>
              {/* Sandra writes markdown + $math$; students' own text stays plain. */}
              <div className="sandra-msg sandra-msg--assistant">
                <InstructionRenderer text={m.text} />
              </div>
            </div>
          ),
        )}

        {sending && (
          <div className="sandra-row">
            <span className="sandra-glyph sandra-glyph--bubble" aria-hidden="true">
              <Sparkles size={13} strokeWidth={2.4} />
            </span>
            <div className="sandra-msg sandra-msg--assistant sandra-typing">
              {t('sandra.typing')}
              <span className="sandra-typing__dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          </div>
        )}

        {error?.kind === 'generic' && (
          <div className="sandra-error" role="alert">
            <span>{t('sandra.error')}</span>
            <button
              type="button"
              className="sandra-error__retry"
              onClick={() => send(error.retryText, { isRetry: true })}
            >
              {t('sandra.retry')}
            </button>
          </div>
        )}
        {error?.kind === 'limit' && (
          <div className="sandra-error" role="alert">
            <span>{error.message}</span>
          </div>
        )}
      </div>

      {showAuthPrompt ? (
        <div className="sandra-panel__signin">
          <p>{t('sandra.signInPrompt')}</p>
          <button
            type="button"
            className="sandra-panel__signin-btn"
            onClick={() => setShowAuthModal(true)}
          >
            {t('auth.signIn')}
          </button>
        </div>
      ) : (
        <div className="sandra-panel__composer">
          <textarea
            ref={inputRef}
            className="sandra-panel__input"
            rows={1}
            maxLength={MAX_CHARS}
            placeholder={t('sandra.placeholder')}
            aria-label={t('sandra.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="sandra-panel__send"
            aria-label={t('sandra.send')}
            disabled={sending || !input.trim()}
            onClick={handleSubmit}
          >
            <Send size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      )}

      <footer className="sandra-panel__footer">{t('sandra.reviewNotice')}</footer>
    </section>
  );
}
