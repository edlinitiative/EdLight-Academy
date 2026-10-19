import { useRef } from 'react';
import { standingsMoves, type RowMove } from '../../../shared/competition/presentation';

/**
 * Movement of each row since the previous DIFFERENT board this component saw
 * (shared/competition/presentation `standingsMoves`). The first board shows
 * no movement; the "▲ 2" stays until the order changes again.
 */
export function useBoardMoves(keys: readonly string[]): Record<string, RowMove> {
  const mem = useRef<{ sig: string | null; prev: string[] | null; cur: string[] }>({ sig: null, prev: null, cur: [] });
  const sig = keys.join('\u0001');
  if (mem.current.sig !== sig) {
    // An empty board (still loading) is not a "before": rows arriving with the
    // first data are not news.
    mem.current = { sig, prev: mem.current.cur.length ? mem.current.cur : null, cur: [...keys] };
  }
  return standingsMoves(mem.current.prev, keys);
}

export default useBoardMoves;
