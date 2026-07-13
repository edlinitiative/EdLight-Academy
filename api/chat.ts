import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { chatWithTools, embed, resolveLLMConfig, LLMError, type ToolCallRecord } from './_lib/llm';
import {
  buildSandraSystemPrompt,
  SANDRA_LIMITS,
  type KbChunk,
  type PageContext,
} from './_lib/sandraPrompt';
import { SANDRA_TOOL_DEFS, createToolExecutor } from './_lib/sandraTools';
import { getDb } from './_lib/firebaseAdmin';

/**
 * POST /api/chat
 *
 * Sandra — the student-facing AI tutor. Grounds every answer in the
 * `sandraKb` knowledge base (Firestore vector search) and persists the full
 * conversation server-side to `chatConversations` (clients have no write
 * access — see firestore.rules).
 *
 * Body: {
 *   conversationId?: string,          // reuse an open conversation (must belong to caller)
 *   message: string,                  // non-empty, ≤ SANDRA_LIMITS.maxMessageChars
 *   lang?: 'fr' | 'ht',               // UI language (default 'fr')
 *   page?: { path?, courseId?, lessonId? },
 * }
 *
 * 200 → { reply, conversationId, remaining }
 * 200 → { conversationFull: true, conversationId, remaining }   (cap reached, LLM not called)
 * 400 / 401 / 403 / 405 / 429 / 502 on the corresponding failures.
 */

interface ChatBody {
  conversationId?: string;
  message?: string;
  lang?: string;
  page?: { path?: string; courseId?: string; lessonId?: string };
}

interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  /** Present only on assistant messages produced with tool executions. */
  toolCalls?: ToolCallRecord[];
}

const CHAT_LIMIT_MAX = 30; // mirrors LIMITS['chat'] in _lib/rateLimit.ts

function sanitizePage(raw: ChatBody['page']): PageContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const page: PageContext = {};
  if (typeof raw.path === 'string' && raw.path) page.path = raw.path.slice(0, 200);
  if (typeof raw.courseId === 'string' && raw.courseId) page.courseId = raw.courseId.slice(0, 100);
  if (typeof raw.lessonId === 'string' && raw.lessonId) page.lessonId = raw.lessonId.slice(0, 100);
  return page.path || page.courseId || page.lessonId ? page : undefined;
}

/**
 * Retrieve the top-K KB chunks for the question. Prefers same-course chunks
 * when the student is on a course page; falls back to an unfiltered query
 * when the filtered one returns fewer than 3 hits. Any failure (missing
 * index, embedding error…) degrades to no grounding — Sandra still answers.
 */
async function retrieveChunks(
  db: FirebaseFirestore.Firestore,
  message: string,
  page: PageContext | undefined,
): Promise<KbChunk[]> {
  try {
    const [qVec] = await embed([message]);
    const queryVector = FieldValue.vector(qVec);
    const base = db.collection('sandraKb');

    const nearest = (query: FirebaseFirestore.Query) =>
      query
        .findNearest({
          vectorField: 'embedding',
          queryVector,
          limit: SANDRA_LIMITS.topK,
          distanceMeasure: 'COSINE',
        })
        .get();

    let snap = page?.courseId
      ? await nearest(base.where('courseId', '==', page.courseId))
      : await nearest(base);
    if (page?.courseId && snap.docs.length < 3) {
      snap = await nearest(base); // too few same-course hits — widen to the whole KB
    }

    return snap.docs.map((doc) => {
      const data = doc.data() as Partial<KbChunk>;
      return {
        text: data.text || '',
        courseId: data.courseId || '',
        level: data.level || '',
        subject: data.subject || '',
        type: data.type === 'quiz' || data.type === 'exam' ? data.type : 'lesson',
        sourceId: data.sourceId || '',
      };
    });
  } catch (error) {
    console.error('chat: KB retrieval failed, answering ungrounded:', error instanceof Error ? error.message : error);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'chat');
  if (!allowed) {
    res.setHeader('X-RateLimit-Limit', String(CHAT_LIMIT_MAX));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Trop de messages envoyés. Réessayez dans une heure.',
    });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  const body: ChatBody = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > SANDRA_LIMITS.maxMessageChars) {
    res.status(400).json({
      error: 'invalid_message',
      message: `Le message doit contenir entre 1 et ${SANDRA_LIMITS.maxMessageChars} caractères.`,
    });
    return;
  }
  const lang: 'fr' | 'ht' = body.lang === 'ht' ? 'ht' : 'fr';
  const page = sanitizePage(body.page);

  try {
    const db = getDb();
    const conversations = db.collection('chatConversations');

    // ── Load or create the conversation (server-side only writes) ──────────
    let convRef: FirebaseFirestore.DocumentReference | null = null;
    let history: StoredMessage[] = [];
    let messageCount = 0;

    if (typeof body.conversationId === 'string' && body.conversationId) {
      const ref = conversations.doc(body.conversationId);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data() || {};
        if (data.uid !== uid) {
          res.status(403).json({
            error: 'forbidden',
            message: 'Cette conversation ne vous appartient pas.',
          });
          return;
        }
        convRef = ref;
        history = Array.isArray(data.messages) ? (data.messages as StoredMessage[]) : [];
        messageCount = typeof data.messageCount === 'number' ? data.messageCount : history.length;
      }
      // Unknown id (e.g. stale sessionStorage) — fall through and start fresh.
    }

    // Conversation cap reached: tell the widget to start a new one. No LLM call.
    if (convRef && messageCount >= SANDRA_LIMITS.conversationCap) {
      res.status(200).json({ conversationFull: true, conversationId: convRef.id, remaining });
      return;
    }

    // ── Retrieval + generation ──────────────────────────────────────────────
    // NOTE: for a first message, the conversation doc is deliberately NOT
    // created yet — if the LLM call below fails, nothing is persisted, so no
    // empty 0-message shells pollute the admin transcript browser.
    const chunks = await retrieveChunks(db, message, page);
    const system = buildSandraSystemPrompt({ lang, page, chunks });
    const llmMessages = [
      ...history.slice(-SANDRA_LIMITS.historyTurns).map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      })),
      { role: 'user' as const, content: message },
    ];

    let reply: string;
    let toolCalls: ToolCallRecord[];
    try {
      // 900-token default truncates detailed explanations mid-formula; give
      // tutoring answers room to conclude properly. Tools are scoped to the
      // authenticated uid — the model never chooses whose data it reads.
      ({ reply, toolCalls } = await chatWithTools({
        system,
        messages: llmMessages,
        tools: SANDRA_TOOL_DEFS,
        executeTool: createToolExecutor({ uid, origin: `https://${req.headers.host}` }),
        maxTokens: 1800,
        config: resolveLLMConfig(),
      }));
    } catch (error) {
      const detail = error instanceof LLMError ? `${error.provider} ${error.status}` : 'unknown';
      console.error('chat: LLM failed:', detail, error instanceof Error ? error.message : error);
      res.status(502).json({
        error: 'llm_failed',
        message: 'Sandra est momentanément indisponible. Réessayez dans un instant.',
      });
      return;
    }

    if (!convRef) {
      // First message and the LLM succeeded: create the shell doc now,
      // denormalizing the student's identity for the admin transcript
      // browser (tolerate a missing users doc).
      let studentName = '';
      let studentEmail = '';
      try {
        const userSnap = await db.collection('users').doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        studentName = typeof userData.full_name === 'string' ? userData.full_name : '';
        studentEmail = typeof userData.email === 'string' ? userData.email : '';
      } catch (error) {
        console.warn('chat: could not read users doc for', uid, error instanceof Error ? error.message : error);
      }

      convRef = conversations.doc();
      await convRef.set({
        uid,
        studentName,
        studentEmail,
        startedAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
        messageCount: 0,
        lang,
        firstPage: page?.path || '',
        messages: [],
      });
    }

    // ── Persist both turns atomically (one update) ──────────────────────────
    const now = Date.now();
    const userMsg: StoredMessage = { role: 'user', text: message, ts: now };
    const assistantMsg: StoredMessage = { role: 'assistant', text: reply, ts: now + 1 };
    // Firestore rejects undefined fields — only attach the key when tools ran.
    if (toolCalls.length > 0) assistantMsg.toolCalls = toolCalls;
    await convRef.update({
      messages: FieldValue.arrayUnion(userMsg, assistantMsg),
      messageCount: FieldValue.increment(2),
      lastMessageAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ reply, conversationId: convRef.id, remaining });
  } catch (error) {
    console.error('chat: unexpected failure:', error instanceof Error ? error.message : error);
    res.status(500).json({
      error: 'internal',
      message: 'Une erreur est survenue. Réessayez dans un instant.',
    });
  }
}
