/**
 * Vrai ou Faux — 60-second blitz.
 * A trivia question is shown with ONE proposed answer; decide whether that
 * answer is correct. Derives everything from the trivia bank (see gameGen).
 * Keyboard: ← faux, → vrai.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Timer, Flame } from 'lucide-react';
import { buildVraiFauxItems } from '../../utils/gameGen';
import GameOverCard from './GameOverCard';

const ROUND_SECONDS = 60;
// Volume guard: fewer than this many answers can't reach 100% XP accuracy.
const MIN_DENOMINATOR = 20;

export default function VraiFauxGame({ questionsMap, isCreole, onExit, onRecord, highScore = null }) {
  const [nonce, setNonce] = useState(0);
  const items = useMemo(() => buildVraiFauxItems(questionsMap, 80), [questionsMap, nonce]);

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'right' | 'wrong' | null
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState(null);
  const recordedRef = useRef(false);

  const item = items[idx % items.length];

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

  // Record once when the round ends.
  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const maxScore = Math.max(answered, MIN_DENOMINATOR);
    onRecord({ gameId: 'vrai-faux', score: correct, maxScore }).then(setReward).catch(() => setReward(null));
  }, [over, answered, correct, onRecord]);

  const answer = (saysTrue) => {
    if (over || feedback) return;
    const right = saysTrue === item.truth;
    setAnswered((n) => n + 1);
    if (right) {
      setCorrect((n) => n + 1);
      setStreak((s) => { const ns = s + 1; setBestStreak((b) => Math.max(b, ns)); return ns; });
    } else {
      setStreak(0);
    }
    setFeedback(right ? 'right' : 'wrong');
    setTimeout(() => { setFeedback(null); setIdx((i) => i + 1); }, right ? 350 : 900);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') answer(true);
      if (e.key === 'ArrowLeft') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIdx(0); setCorrect(0); setAnswered(0); setStreak(0); setBestStreak(0);
    setFeedback(null); setTimeLeft(ROUND_SECONDS); setOver(false); setReward(null);
  };

  if (over) {
    return (
      <GameOverCard
        score={correct}
        maxScore={Math.max(answered, MIN_DENOMINATOR)}
        stats={[
          { label: isCreole ? 'Bon repons' : 'Bonnes réponses', value: `${correct}/${answered}` },
          { label: isCreole ? 'Pi long seri' : 'Meilleure série', value: bestStreak },
        ]}
        reward={reward}
        onReplay={replay}
        onExit={onExit}
        isCreole={isCreole}
        accent="#e0532f"
        highScore={highScore}
      />
    );
  }

  return (
    <div className="vf-game" style={{ '--cat-color': '#e0532f' } as React.CSSProperties}>
      <div className="vf-game__hud">
        <span className={`vf-game__timer ${timeLeft <= 10 ? 'is-urgent' : ''}`}>
          <Timer size={15} /> {timeLeft}s
        </span>
        <span className="vf-game__score">{correct}/{answered}</span>
        <span className="vf-game__streak" data-hot={streak >= 3 ? 'true' : undefined}>
          <Flame size={15} /> {streak}
        </span>
      </div>

      <div className={`vf-game__card ${feedback ? `vf-game__card--${feedback}` : ''}`}>
        {item.flag && (
          <div className="vf-game__flag">
            {item.flagIso ? (
              <img
                src={`https://flagcdn.com/w320/${item.flagIso}.png`}
                srcSet={`https://flagcdn.com/w640/${item.flagIso}.png 2x`}
                alt=""
                className="vf-game__flag-img"
                loading="eager"
              />
            ) : (
              <span className="vf-game__flag-emoji" aria-hidden>{item.flag}</span>
            )}
          </div>
        )}
        <p className="vf-game__question">{isCreole ? item.qHt : item.q}</p>
        <p className="vf-game__proposed">{item.proposed}</p>
        {feedback === 'wrong' && (
          <p className="vf-game__correction">
            {isCreole ? 'Repons kòrèk la:' : 'La bonne réponse :'} <strong>{item.correctAnswer}</strong>
          </p>
        )}
      </div>

      <div className="vf-game__actions">
        <button className="vf-game__btn vf-game__btn--faux" onClick={() => answer(false)} disabled={!!feedback}>
          <X size={20} /> {isCreole ? 'Fo' : 'Faux'}
        </button>
        <button className="vf-game__btn vf-game__btn--vrai" onClick={() => answer(true)} disabled={!!feedback}>
          <Check size={20} /> {isCreole ? 'Vre' : 'Vrai'}
        </button>
      </div>
      <p className="vf-game__help text-muted">
        {isCreole ? 'Èske repons ki pwopoze a kòrèk ?' : 'La réponse proposée est-elle correcte ?'}
      </p>
    </div>
  );
}
