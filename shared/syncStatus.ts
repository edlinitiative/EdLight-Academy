/**
 * syncStatus — the ONE connectivity/sync message both apps show
 * (roadmap §5 "Offline and reconnection", PRE-04 "queued" state).
 * ─────────────────────────────────────────────────────────────────
 * The web banner (src/components/NetworkStatus.tsx) and the phone banner
 * (mobile/src/components/NetworkStatus.tsx) used to word this differently,
 * and the web said "Synchronisé ✓" the moment the browser fired `online` —
 * before anything had actually been sent. This module decides, from facts
 * only, what may be said:
 *
 *   offline, nothing queued   → "Hors ligne — le contenu enregistré reste disponible"
 *   offline, N queued         → "… · N action(s) en attente d'envoi"
 *   back online, N queued     → "Connexion rétablie · envoi de N action(s)…"
 *   back online, 0 queued     → "Connexion rétablie · mise à jour"
 *                               (and "Tout est synchronisé ✓" only when a
 *                               queue that was non-empty has just drained)
 *   steady online             → nothing (the banner hides)
 *
 * `pending` is the signed-in account's outbox length (shared/outbox.ts);
 * the outbox removes an operation only on a server ack, so "synchronisé"
 * here is a confirmed statement, never a hope.
 */

export type SyncPhase = 'online' | 'offline' | 'reconnected';
export type SyncTone = 'offline' | 'syncing' | 'synced' | 'refreshing';

export interface SyncMessage {
  tone: SyncTone;
  text: string;
}

export interface SyncInput {
  phase: SyncPhase;
  /** Operations still waiting for a server ack (current account only). */
  pending: number;
  /** A non-empty queue reached zero during this reconnect window. */
  drained?: boolean;
  lang: 'fr' | 'ht' | 'en' | string;
}

function plural(n: number, lang: string): string {
  if (lang === 'ht') return `${n} aksyon`;
  if (lang === 'en') return `${n} action${n > 1 ? 's' : ''}`;
  return `${n} action${n > 1 ? 's' : ''}`;
}

export function syncMessage({ phase, pending, drained = false, lang }: SyncInput): SyncMessage | null {
  const n = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  const L = (fr: string, ht: string, en: string) => (lang === 'ht' ? ht : lang === 'en' ? en : fr);

  if (phase === 'offline') {
    const base = L(
      'Hors ligne — le contenu enregistré reste disponible',
      'Ou pa sou entènèt — sa ki anrejistre rete disponib',
      'Offline — saved content is still available',
    );
    if (!n) return { tone: 'offline', text: base };
    return {
      tone: 'offline',
      text: `${base} · ${plural(n, lang)} ${L("en attente d'envoi", 'ap tann pou voye', 'waiting to sync')}`,
    };
  }

  if (phase === 'reconnected') {
    if (n) {
      return {
        tone: 'syncing',
        text: L(
          `Connexion rétablie · envoi de ${plural(n, lang)}…`,
          `Koneksyon an tounen · n ap voye ${plural(n, lang)}…`,
          `Back online · sending ${plural(n, lang)}…`,
        ),
      };
    }
    if (drained) {
      return { tone: 'synced', text: L('Tout est synchronisé ✓', 'Tout bagay senkronize ✓', 'All synced ✓') };
    }
    return {
      tone: 'refreshing',
      text: L('Connexion rétablie · mise à jour', 'Koneksyon an tounen · n ap mete ajou', 'Back online · updating'),
    };
  }

  return null;
}
