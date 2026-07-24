/**
 * Mémoire — concentration with country ↔ capital pairs.
 * Score = pairs×10 − moves (a move = one two-card attempt), so fewer flips
 * score higher, same formula as code.edlight.org's Code Memory.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, MousePointerClick } from 'lucide-react';
import { CAPITAL_PAIRS } from '../../data/triviaData';
import { buildMemoryDeck } from '../../utils/gameGen';
import GameOverCard from './GameOverCard';

const PAIRS = 6;

export default function MemoireGame({ isCreole, onExit, onRecord, highScore = null }) {
  const [nonce, setNonce] = useState(0);
  const deck = useMemo(() => buildMemoryDeck(CAPITAL_PAIRS, PAIRS, isCreole), [isCreole, nonce]);

  const [flipped, setFlipped] = useState([]); // card ids currently face-up (unmatched)
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [reward, setReward] = useState(null);
  const lockRef = useRef(false);
  const recordedRef = useRef(false);

  const done = matched.size === deck.length && deck.length > 0;

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [done, nonce]);

  const score = Math.max(0, PAIRS * 10 - moves);
  // A flawless game still uses PAIRS moves (you must flip each pair once), so
  // the best achievable score is PAIRS*10 - PAIRS. Using PAIRS*10 as the max
  // capped a perfect run at 90% and made the +perfect XP bonus unreachable.
  const maxScore = PAIRS * 10 - PAIRS;

  useEffect(() => {
    if (!done || recordedRef.current) return;
    recordedRef.current = true;
    onRecord({ gameId: 'memoire', score: Math.min(score, maxScore), maxScore }).then(setReward).catch(() => setReward(null));
  }, [done, score, maxScore, onRecord]);

  const flip = (card) => {
    if (lockRef.current || matched.has(card.id) || flipped.includes(card.id)) return;
    const next = [...flipped, card.id];
    setFlipped(next);
    if (next.length < 2) return;

    lockRef.current = true;
    setMoves((m) => m + 1);
    const [a, b] = next.map((id) => deck.find((c) => c.id === id));
    if (a.pairId === b.pairId && a.side !== b.side) {
      setTimeout(() => {
        setMatched((prev) => new Set([...prev, a.id, b.id]));
        setFlipped([]);
        lockRef.current = false;
      }, 400);
    } else {
      setTimeout(() => {
        setFlipped([]);
        lockRef.current = false;
      }, 900);
    }
  };

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setFlipped([]); setMatched(new Set()); setMoves(0); setSeconds(0); setReward(null);
  };

  if (done) {
    return (
      <GameOverCard
        score={Math.min(score, maxScore)}
        maxScore={maxScore}
        stats={[
          { label: isCreole ? 'Mouvman' : 'Coups', value: moves },
          { label: isCreole ? 'Tan' : 'Temps', value: `${seconds}s` },
        ]}
        reward={reward}
        onReplay={replay}
        onExit={onExit}
        isCreole={isCreole}
        accent="#7c3aed"
        highScore={highScore}
      />
    );
  }

  return (
    <div className="mem-game" style={{ '--cat-color': '#7c3aed' } as React.CSSProperties}>
      <div className="mem-game__hud">
        <span><MousePointerClick size={15} /> {moves} {isCreole ? 'mouvman' : 'coups'}</span>
        <span className="mem-game__hint">{isCreole ? 'Peyi ↔ Kapital' : 'Pays ↔ Capitale'}</span>
        <span><Timer size={15} /> {seconds}s</span>
      </div>
      <div className="mem-game__grid">
        {deck.map((card) => {
          const isUp = flipped.includes(card.id) || matched.has(card.id);
          return (
            <button
              key={card.id}
              className={`mem-card ${isUp ? 'is-up' : ''} ${matched.has(card.id) ? 'is-matched' : ''} mem-card--${card.side}`}
              onClick={() => flip(card)}
              aria-label={isUp ? card.label : (isCreole ? 'Kat kache' : 'Carte cachée')}
            >
              <span className="mem-card__face">{isUp ? card.label : '?'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
