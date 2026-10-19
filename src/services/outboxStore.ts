/**
 * outboxStore (web) — the localStorage outbox instance on its own, with no
 * Firebase import, so the always-mounted offline banner (NetworkStatus in
 * Layout) can count queued writes without pulling the Firebase chunk into the
 * initial bundle. writeOutbox.ts owns the replay handlers and re-exports this.
 */
import { createOutbox, memoryOutboxStorage, type OutboxStorage } from '../../shared/outbox';

function browserStorage(): OutboxStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage;
      return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
      };
    }
  } catch { /* private mode / blocked storage */ }
  return memoryOutboxStorage();
}

export const outbox = createOutbox(browserStorage(), { prefix: 'edlight-outbox', maxOps: 60 });
