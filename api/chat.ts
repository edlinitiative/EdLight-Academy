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
  type StudentContext,
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
  studentContext?: { grade?: unknown; track?: unknown; level?: unknown };
}

interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  /** Present only on assistant messages produced with tool executions. */
  toolCalls?: ToolCallRecord[];
  /**
   * How many KB chunks grounded this answer. Recorded because retrieval
   * degrades silently — see retrieveChunks — so an ungrounded answer is
   * indistinguishable from a grounded one in the admin transcript browser
   * unless we write the count down at the time. 0 with kbError means
   * retrieval broke; 0 without means the KB simply had no match.
   */
  kbHits?: number;
  /** Set only when retrieval threw — the KB index or embedding key is broken. */
  kbError?: true;
}

const CHAT_LIMIT_MAX = 30; // mirrors LIMITS['chat'] in _lib/rateLimit.ts

/**
 * Trusted origin for server-side fetches of our own public files (the exam
 * catalog). Derived from configured env — NEVER from req.headers.host, which is
 * client-controlled and would let a caller point Sandra's tools at any host.
 */
function resolveOrigin(): string {
  const explicit = process.env.PUBLIC_ORIGIN || process.env.CANONICAL_ORIGIN;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function sanitizePage(raw: ChatBody['page']): PageContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const page: PageContext = {};
  if (typeof raw.path === 'string' && raw.path) page.path = raw.path.slice(0, 200);
  if (typeof raw.courseId === 'string' && raw.courseId) page.courseId = raw.courseId.slice(0, 100);
  if (typeof raw.lessonId === 'string' && raw.lessonId) page.lessonId = raw.lessonId.slice(0, 100);
  return page.path || page.courseId || page.lessonId ? page : undefined;
}

/**
 * Sanitize the client-supplied learner profile. Untrusted input: cap the free
 * text and only accept a finite numeric level. Returns undefined when nothing
 * usable is present so the prompt builder simply omits the section.
 */
function sanitizeStudent(raw: ChatBody['studentContext']): StudentContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const student: StudentContext = {};
  if (typeof raw.grade === 'string' && raw.grade.trim()) student.grade = raw.grade.trim().slice(0, 40);
  if (typeof raw.track === 'string' && raw.track.trim()) student.track = raw.track.trim().slice(0, 40);
  if (typeof raw.level === 'number' && Number.isFinite(raw.level)) student.level = raw.level;
  return student.grade || student.track || student.level != null ? student : undefined;
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
): Promise<{ chunks: KbChunk[]; failed: boolean }> {
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

    // Annotated because the result is no longer returned directly: without a
    // contextual type, `type` widens from KbChunk's literal union to string.
    const chunks: KbChunk[] = snap.docs.map((doc) => {
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
    return { chunks, failed: false };
  } catch (error) {
    console.error('chat: KB retrieval failed, answering ungrounded:', error instanceof Error ? error.message : error);
    return { chunks: [], failed: true };
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
  const student = sanitizeStudent(body.studentContext);

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
    const { chunks, failed: kbFailed } = await retrieveChunks(db, message, page);
    const system = buildSandraSystemPrompt({ lang, page, chunks, student });
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
        // grade flows through so save_study_plan can build the plan from the
        // student's own exam level instead of defaulting to Terminale papers.
        executeTool: createToolExecutor({ uid, origin: resolveOrigin(), lang, grade: student?.grade }),
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
    const assistantMsg: StoredMessage = {
      role: 'assistant',
      text: reply,
      ts: now + 1,
      kbHits: chunks.length,
    };
    // Firestore rejects undefined fields — only attach the key when tools ran.
    if (toolCalls.length > 0) assistantMsg.toolCalls = toolCalls;
    if (kbFailed) assistantMsg.kbError = true;
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
