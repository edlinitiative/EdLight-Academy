/**
 * Sandra — AI tutor chat client.
 * Talks to the SAME serverless endpoint as the web app
 * (https://academy.edlight.org/api/chat): POST with a Firebase ID token,
 * body { message, lang, page?, conversationId?, studentContext?, questionContext? } → { reply, conversationId,
 * remaining } (or { conversationFull: true } when the thread hits its cap).
 *
 * The active conversation id persists in AsyncStorage so a chat survives app
 * restarts; the server owns the transcript (admins see it in the console).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import type { QuestionContext } from '../../../shared/explainContext';
import { explanationVoteBody, reviewedExplanationId } from '../../../shared/explanationFeedback';

const CHAT_URL = 'https://academy.edlight.org/api/chat';
const EXPLANATIONS_URL = 'https://academy.edlight.org/api/explanations';
const CONV_KEY = 'edlight:sandra:conv';
export const MAX_CHARS = 2000;

export type SandraResult =
  /** `explanationId`: the reply is an admin-reviewed explanation (offer Utile / Pas utile). */
  | { kind: 'reply'; reply: string; remaining?: number; explanationId?: string }
  | { kind: 'limit'; message: string }
  | { kind: 'auth' }
  | { kind: 'error' };

/**
 * Lightweight learner profile the server uses to tailor Sandra's depth and
 * examples. Every field is optional — the caller passes what it knows.
 * CONTRACT: the web app sends the SAME `studentContext` shape; do not rename.
 */
export type StudentContext = {
  grade?: string | null;
  track?: string | null;
  level?: number | null;
};

export async function readConvId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CONV_KEY);
  } catch {
    return null;
  }
}

export async function writeConvId(id: string | null) {
  try {
    if (id) await AsyncStorage.setItem(CONV_KEY, id);
    else await AsyncStorage.removeItem(CONV_KEY);
  } catch {}
}

/**
 * Where a conversation id lives. The main chat persists it (AsyncStorage) so a
 * chat survives restarts; an "Explique-moi" sheet keeps its own in memory, so
 * explaining a missed question never hijacks the student's ongoing chat.
 */
export interface ConversationStore {
  read: () => Promise<string | null>;
  write: (id: string | null) => Promise<void>;
}

export const persistedConversation: ConversationStore = { read: readConvId, write: writeConvId };

export function memoryConversation(): ConversationStore {
  let id: string | null = null;
  return {
    read: async () => id,
    write: async (next) => { id = next; },
  };
}

export interface SendOptions {
  /** "Explique-moi": the missed question, sent as structured context. */
  questionContext?: QuestionContext;
  conversation?: ConversationStore;
  /** Retry key (S-2): pass the SAME id on retry. Defaults to a fresh one. */
  clientMessageId?: string;
}

// ── Transcript restore (S-5) ────────────────────────────────────────────────
// The server owns the transcript, but reopening the screen showed an empty
// chat while the conversation id was kept. The last turns are mirrored on the
// device, per ACCOUNT and per conversation, and restored only when both match.

const TRANSCRIPT_KEY = 'edlight:sandra:transcript:';
export const TRANSCRIPT_MAX = 40;

export type TranscriptMessage = { id: string; role: 'user' | 'sandra'; text: string; explanationId?: string };
export type StoredTranscript = { uid: string; convId: string; messages: TranscriptMessage[] };

/** Messages to show on open: only this account's mirror of the open conversation. */
export function restorableTranscript(
  stored: unknown,
  uid: string | null | undefined,
  convId: string | null | undefined,
): TranscriptMessage[] {
  if (!uid || !convId || !stored || typeof stored !== 'object') return [];
  const t = stored as Partial<StoredTranscript>;
  if (t.uid !== uid || t.convId !== convId || !Array.isArray(t.messages)) return [];
  return t.messages
    .filter((m) => m && (m.role === 'user' || m.role === 'sandra') && typeof m.text === 'string' && typeof m.id === 'string')
    .slice(-TRANSCRIPT_MAX);
}

export async function readTranscript(uid: string | null | undefined): Promise<TranscriptMessage[]> {
  if (!uid) return [];
  try {
    const [raw, convId] = await Promise.all([AsyncStorage.getItem(TRANSCRIPT_KEY + uid), readConvId()]);
    return restorableTranscript(raw ? JSON.parse(raw) : null, uid, convId);
  } catch {
    return [];
  }
}

export async function writeTranscript(uid: string | null | undefined, messages: TranscriptMessage[]): Promise<void> {
  if (!uid) return;
  try {
    const convId = await readConvId();
    if (!convId || !messages.length) {
      await AsyncStorage.removeItem(TRANSCRIPT_KEY + uid);
      return;
    }
    const value: StoredTranscript = { uid, convId, messages: messages.slice(-TRANSCRIPT_MAX) };
    await AsyncStorage.setItem(TRANSCRIPT_KEY + uid, JSON.stringify(value));
  } catch {}
}

/** A retry key for one question (S-2): resent unchanged on retry. */
export function newClientMessageId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * `clientMessageId` makes a retry idempotent: if the first attempt's reply was
 * saved but the response lost, the server returns that stored reply instead of
 * answering (and recording) the question twice. Pass the SAME id on retry.
 */
export async function sendToSandra(
  message: string,
  lang: 'fr' | 'ht',
  page?: { path: string; courseId?: string; lessonId?: string },
  studentContext?: StudentContext,
  isFullRetry = false,
  opts: SendOptions = {},
): Promise<SandraResult> {
  const conversation = opts.conversation ?? persistedConversation;
  const clientMessageId = opts.clientMessageId ?? newClientMessageId();
  const user = auth.currentUser;
  if (!user) return { kind: 'auth' };

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return { kind: 'auth' };
  }

  const body: Record<string, unknown> = {
    message: message.trim().slice(0, MAX_CHARS),
    lang,
    page: page || { path: '/mobile' },
  };
  if (studentContext) body.studentContext = studentContext;
  if (opts.questionContext) body.questionContext = opts.questionContext;
  const convId = await conversation.read();
  if (convId) body.conversationId = convId;
  body.clientMessageId = clientMessageId;

  // 90 s ceiling (P0 validation): a fetch on a half-dead network may never
  // settle, leaving the screen "sending" and ignoring every later message.
  const ctrl = new AbortController();
  const abortId = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (res.status === 401) return { kind: 'auth' };
    if (res.status === 429) {
      let msg = '';
      try {
        const data = await res.json();
        if (typeof data?.message === 'string') msg = data.message;
      } catch {}
      return { kind: 'limit', message: msg };
    }
    if (!res.ok) return { kind: 'error' };

    const data = await res.json();
    const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';

    if (data?.conversationFull) {
      // Thread hit the server-side cap — start fresh; transparently re-send
      // the unanswered turn once into the new conversation.
      await conversation.write(null);
      if (!reply && !isFullRetry) return sendToSandra(message, lang, page, studentContext, true, { ...opts, clientMessageId });
    } else if (typeof data?.conversationId === 'string' && data.conversationId) {
      await conversation.write(data.conversationId);
    }

    if (!reply) return { kind: 'error' };
    const explanationId = reviewedExplanationId(data);
    return { kind: 'reply', reply, remaining: data?.remaining, ...(explanationId ? { explanationId } : {}) };
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(abortId);
  }
}

/**
 * "Utile / Pas utile" on a reviewed explanation. Fire and forget: the server
 * dedupes once per day without storing who voted; a failure is not shown.
 */
export async function voteExplanation(id: string, helpful: boolean): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdToken();
    const res = await fetch(EXPLANATIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(explanationVoteBody(id, helpful)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
