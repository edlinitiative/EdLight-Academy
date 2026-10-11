/**
 * The question bank duels are played from — the APP's bank, on purpose.
 * ---------------------------------------------------------------------------
 * A duel is a list of indexes into a category bank (see utils/duels.ts for
 * why both players must read the same bank). Every duel minted so far came
 * from the app, and Android opens academy.edlight.org/defi/* links in the app,
 * so the bank that duels index into is mobile/src/data/triviaData.ts. The web
 * imports that very file rather than a copy: a copy drifts the day someone
 * edits the app's bank, and a drifted copy fails silently — the opponent just
 * gets different questions.
 *
 * If the two platforms' banks are ever unified (the web's is larger), change
 * this one import, and keep in mind that duels already in flight (7-day TTL)
 * were indexed against the old order.
 *
 * Loaded lazily: the bank is ~460 KB (~125 KB gzipped) of question text that
 * only a duel needs, so it is its own chunk and is fetched only by a signed-in
 * student about to make or play one.
 */
import type { DuelQuestion } from './duels';

let cache: Promise<Record<string, DuelQuestion[]>> | null = null;

export function loadDuelBank(): Promise<Record<string, DuelQuestion[]>> {
  if (!cache) {
    cache = import(/* webpackChunkName: "duel-bank" */ '../../mobile/src/data/triviaData')
      .then((m) => m.TRIVIA_QUESTIONS as unknown as Record<string, DuelQuestion[]>)
      .catch((err) => {
        cache = null; // let the next attempt retry a failed chunk load
        throw err;
      });
  }
  return cache;
}

/** Category ids that have a duel bank (the app's 15 decks). */
export async function duelCategoryIds(): Promise<string[]> {
  const bank = await loadDuelBank();
  return Object.keys(bank).filter((k) => (bank[k] || []).length > 0);
}
