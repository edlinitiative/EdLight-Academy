/**
 * Suites logiques — 10 generated number sequences (arithmetic, tables,
 * geometric, squares, alternating, Fibonacci-like); pick the next term
 * among 4 options. Difficulty pool widens after round 3.
 */

import React, { useMemo, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { buildSequenceRounds } from '../../utils/gameGen';
import GameOverCard from './GameOverCard';

const ROUNDS = 10;

export default function SuitesGame({ isCreole, onExit, onRecord, highScore = null }) {
  const [nonce, setNonce] = useState(0);
  const rounds = useMemo(() => buildSequenceRounds(ROUNDS), [nonce]);

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState(null);
  const recordedRef = useRef(false);

  const round = rounds[idx];

  const pick = (opt) => {
    if (picked != null) return;
    setPicked(opt);
    const right = opt === round.answer;
    const nextScore = right ? score + 1 : score;
    if (right) setScore(nextScore);
    setTimeout(() => {
      if (idx + 1 >= ROUNDS) {
        setOver(true);
        if (!recordedRef.current) {
          recordedRef.current = true;
          onRecord({ gameId: 'suites', score: nextScore, maxScore: ROUNDS })
            .then(setReward).catch(() => setReward(null));
        }
      } else {
        setIdx((i) => i + 1);
        setPicked(null);
      }
    }, right ? 500 : 1200);
  };

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIdx(0); setScore(0); setPicked(null); setOver(false); setReward(null);
  };

  if (over) {
    return (
      <GameOverCard
        score={score}
        maxScore={ROUNDS}
        stats={[{ label: isCreole ? 'Sekans jwenn' : 'Suites trouvées', value: `${score}/${ROUNDS}` }]}
        reward={reward}
        onReplay={replay}
        onExit={onExit}
        isCreole={isCreole}
        accent="#0e7490"
        highScore={highScore}
      />
    );
  }

  return (
    <div className="seq-game" style={{ '--cat-color': '#0e7490' } as React.CSSProperties}>
      <div className="seq-game__hud">
        <span>{idx + 1} / {ROUNDS}</span>
        <span className="seq-game__points">{score} {isCreole ? 'pwen' : 'points'}</span>
      </div>

      <p className="seq-game__prompt">
        {isCreole ? 'Ki nimewo ki vini apre ?' : 'Quel nombre vient ensuite ?'}
      </p>

      <div className="seq-game__terms" translate="no">
        {round.shown.map((n, i) => (
          <span key={i} className="seq-game__term">{n}</span>
        ))}
        <span className="seq-game__term seq-game__term--unknown"><HelpCircle size={20} /></span>
      </div>

      <div className="seq-game__options" translate="no">
        {round.options.map((opt) => {
          let cls = 'seq-game__option';
          if (picked != null) {
            if (opt === round.answer) cls += ' is-correct';
            else if (opt === picked) cls += ' is-wrong';
            else cls += ' is-dimmed';
          }
          return (
            <button key={opt} className={cls} onClick={() => pick(opt)} disabled={picked != null}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
