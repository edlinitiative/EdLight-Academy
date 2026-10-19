/**
 * Sandra transcript + unsent draft, for the browser session (CON-04).
 *
 * The conversation id already lived in sessionStorage, so after a reload the
 * server thread continued — but the panel came back EMPTY, and a half-typed
 * question was lost. The phone restores its transcript (sandraService); this is
 * the web's equivalent, with the same rules:
 *   • bound to the account AND the conversation id it belongs to — a different
 *     student, a new conversation or no conversation shows nothing;
 *   • main chat only: an "Explique-moi" conversation is grounded in a question
 *     context that is not persisted, so it is never restored half-grounded;
 *   • bounded (last MAX_MESSAGES), sessionStorage only (gone with the tab).
 */

export type TranscriptMessage = { role: 'user' | 'assistant'; text: string };

export const TRANSCRIPT_KEY = 'edlight:sandra:transcript';
export const DRAFT_KEY = 'edlight:sandra:draft';
export const MAX_MESSAGES = 40;
const MAX_TEXT = 8000;

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

export function writeTranscript(uid: string | null | undefined, convId: string | null, messages: TranscriptMessage[]): void {
  const s = storage();
  if (!s) return;
  try {
    if (!uid || !convId || !messages.length) { s.removeItem(TRANSCRIPT_KEY); return; }
    const kept = messages.slice(-MAX_MESSAGES).map((m) => ({ role: m.role, text: String(m.text).slice(0, MAX_TEXT) }));
    s.setItem(TRANSCRIPT_KEY, JSON.stringify({ uid, convId, messages: kept }));
  } catch { /* quota / blocked */ }
}

export function readTranscript(uid: string | null | undefined, convId: string | null): TranscriptMessage[] {
  const s = storage();
  if (!s || !uid || !convId) return [];
  try {
    const rec = JSON.parse(s.getItem(TRANSCRIPT_KEY) || 'null');
    if (!rec || rec.uid !== uid || rec.convId !== convId || !Array.isArray(rec.messages)) return [];
    return rec.messages
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text)
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function writeDraft(uid: string | null | undefined, text: string): void {
  const s = storage();
  if (!s) return;
  try {
    if (!text.trim()) s.removeItem(DRAFT_KEY);
    else s.setItem(DRAFT_KEY, JSON.stringify({ uid: uid ?? null, text: text.slice(0, 2000) }));
  } catch { /* ignore */ }
}

export function readDraft(uid: string | null | undefined): string {
  const s = storage();
  if (!s) return '';
  try {
    const rec = JSON.parse(s.getItem(DRAFT_KEY) || 'null');
    return rec && (rec.uid ?? null) === (uid ?? null) && typeof rec.text === 'string' ? rec.text : '';
  } catch {
    return '';
  }
}
