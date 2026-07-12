import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { authedFetch } from '../../services/firebase';
import useStore from '../../contexts/store';
import InstructionRenderer from '../InstructionRenderer';

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
  const location = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message (or the typing indicator) in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, error, open]);

  useEffect(() => {
    if (open && user) inputRef.current?.focus();
  }, [open, user]);

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
    opts: { isRetry?: boolean; wasFullRetry?: boolean } = {},
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
      };
      const convId = readConvId();
      if (convId) body.conversationId = convId;

      const res = await authedFetch('/api/chat', body);

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
    setMessages([]);
    setError(null);
    setInput('');
    inputRef.current?.focus();
  };

  const signedIn = !!user;
  const showAuthPrompt = !signedIn || error?.kind === 'auth';

  return (
    <section
      className="sandra-panel"
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

      <div className="sandra-panel__messages" ref={listRef} aria-live="polite">
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
