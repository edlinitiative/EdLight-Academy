/**
 * Sandra — AI tutor chat client.
 * Talks to the SAME serverless endpoint as the web app
 * (https://academy.edlight.org/api/chat): POST with a Firebase ID token,
 * body { message, lang, page?, conversationId? } → { reply, conversationId,
 * remaining } (or { conversationFull: true } when the thread hits its cap).
 *
 * The active conversation id persists in AsyncStorage so a chat survives app
 * restarts; the server owns the transcript (admins see it in the console).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const CHAT_URL = 'https://academy.edlight.org/api/chat';
const CONV_KEY = 'edlight:sandra:conv';
export const MAX_CHARS = 2000;

export type SandraResult =
  | { kind: 'reply'; reply: string; remaining?: number }
  | { kind: 'limit'; message: string }
  | { kind: 'auth' }
  | { kind: 'error' };

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

export async function sendToSandra(
  message: string,
  lang: 'fr' | 'ht',
  page?: { path: string; courseId?: string; lessonId?: string },
  isFullRetry = false,
): Promise<SandraResult> {
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
  const convId = await readConvId();
  if (convId) body.conversationId = convId;

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
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
      await writeConvId(null);
      if (!reply && !isFullRetry) return sendToSandra(message, lang, page, true);
    } else if (typeof data?.conversationId === 'string' && data.conversationId) {
      await writeConvId(data.conversationId);
    }

    if (!reply) return { kind: 'error' };
    return { kind: 'reply', reply, remaining: data?.remaining };
  } catch {
    return { kind: 'error' };
  }
}
