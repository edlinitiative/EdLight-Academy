/**
 * Calcul éclair — 60 seconds of mental arithmetic with ramping difficulty
 * (see nextCalcProblem's tiers). Numeric keypad input; "Passer" skips but
 * counts as an attempt so skipping isn't free.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Delete, CornerDownLeft, Flame } from 'lucide-react';
import { nextCalcProblem } from '../../utils/gameGen';
import GameOverCard from './GameOverCard';

const ROUND_SECONDS = 60;
const MIN_DENOMINATOR = 15;

export default function CalculGame({ isCreole, onExit, onRecord, highScore = null }) {
  const [nonce, setNonce] = useState(0);
  const [solved, setSolved] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [problem, setProblem] = useState(() => nextCalcProblem(0));
  const [input, setInput] = useState('');
  const [flash, setFlash] = useState(null); // 'right' | 'wrong'
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    if (over) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(iv); setOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [over, nonce]);

  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const maxScore = Math.max(attempts, MIN_DENOMINATOR);
    onRecord({ gameId: 'calcul', score: solved, maxScore }).then(setReward).catch(() => setReward(null));
  }, [over, attempts, solved, onRecord]);

  const advance = (wasRight) => {
    setAttempts((n) => n + 1);
    if (wasRight) {
      setSolved((n) => {
        const ns = n + 1;
        setProblem(nextCalcProblem(ns));
        return ns;
      });
      setStreak((s) => { const ns = s + 1; setBestStreak((b) => Math.max(b, ns)); return ns; });
    } else {
      setStreak(0);
      setProblem(nextCalcProblem(solved));
    }
    setInput('');
    setFlash(wasRight ? 'right' : 'wrong');
    setTimeout(() => setFlash(null), 350);
  };

  const submit = () => {
    if (over || input === '' || input === '-') return;
    advance(Number(input) === problem.answer);
  };

  const press = (k) => {
    if (over) return;
    if (k === '⌫') setInput((s) => s.slice(0, -1));
    else if (k === '−') setInput((s) => (s === '' ? '-' : s));
    else if (input.replace('-', '').length < 5) setInput((s) => s + k);
  };

  // Register the keydown listener once (stable [] deps) rather than on every
  // one-second timer re-render; refs keep the handlers current.
  const pressRef = useRef(press);
  pressRef.current = press;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') pressRef.current('⌫');
      else if (e.key === '-') pressRef.current('−');
      else if (e.key === 'Enter') submitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setSolved(0); setAttempts(0); setStreak(0); setBestStreak(0);
    setProblem(nextCalcProblem(0)); setInput('');
    setTimeLeft(ROUND_SECONDS); setOver(false); setReward(null);
  };

  if (over) {
    return (
      <GameOverCard
        score={solved}
        maxScore={Math.max(attempts, MIN_DENOMINATOR)}
        stats={[
          { label: isCreole ? 'Rezoud' : 'Résolus', value: `${solved}/${attempts}` },
          { label: isCreole ? 'Pi long seri' : 'Meilleure série', value: bestStreak },
        ]}
        reward={reward}
        onReplay={replay}
        onExit={onExit}
        isCreole={isCreole}
        accent="#d97706"
        highScore={highScore}
      />
    );
  }

  return (
    <div className="calc-game" style={{ '--cat-color': '#d97706' } as React.CSSProperties}>
      <div className="vf-game__hud">
        <span className={`vf-game__timer ${timeLeft <= 10 ? 'is-urgent' : ''}`}>
          <Timer size={15} /> {timeLeft}s
        </span>
        <span className="vf-game__score">{solved}</span>
        <span className="vf-game__streak" data-hot={streak >= 3 ? 'true' : undefined}>
          <Flame size={15} /> {streak}
        </span>
      </div>
      <div className="vf-game__timebar" aria-hidden="true">
        <i style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }} />
      </div>

      <div className={`calc-game__problem ${flash ? `calc-game__problem--${flash}` : ''}`}>
        <span className="calc-game__expr" translate="no">{problem.text} =</span>
        <span className="calc-game__input">{input || ' '}</span>
      </div>

      <div className="calc-game__pad" translate="no">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '⌫'].map((k) => (
          <button key={k} className="calc-game__key" onClick={() => press(k)} aria-label={k === '⌫' ? (isCreole ? 'Efase' : 'Effacer') : k}>
            {k === '⌫' ? <Delete size={18} /> : k}
          </button>
        ))}
      </div>
      <div className="calc-game__actions">
        <button className="button button--ghost" onClick={() => advance(false)}>
          {isCreole ? 'Sote' : 'Passer'}
        </button>
        <button className="button button--primary calc-game__ok" onClick={submit} disabled={input === '' || input === '-'}>
          <CornerDownLeft size={16} /> OK
        </button>
      </div>
    </div>
  );
}
