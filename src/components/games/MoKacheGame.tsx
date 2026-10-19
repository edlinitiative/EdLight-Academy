/**
 * Mo Kaché — the daily hidden word (wordle-style).
 * • Daily mode: everyone gets the same word (deterministic from the date);
 *   the grid is persisted in localStorage so one puzzle a day, come back
 *   tomorrow. • Practice mode: random word, replayable at will.
 * Hint unlocks after 2 guesses; win shares as an emoji grid.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Shuffle, Lightbulb, Share2, Check } from '../icons';
import { MO_KACHE_WORDS, WORD_LENGTH, isPlayableWordShape } from '../../data/moKacheWords';
import { todayStr } from '../../services/streakService';
import useStore from '../../contexts/store';

const MAX_GUESSES = 6;
const KEY_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', '↵WXCVBN⌫'];
// Per ACCOUNT and day: a device-wide key let sibling A's finished grid lock
// sibling B out of today's word (and its XP) on a shared phone (P0 validation).
export const storageKey = (date, uid?: string | null) => (uid ? `edlight_mokache_${uid}_${date}` : `edlight_mokache_${date}`);

function dailyWordIndex(dateStr) {
  // Simple deterministic hash of YYYY-MM-DD → stable index for everyone.
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h % MO_KACHE_WORDS.length;
}

/** Two-pass wordle evaluation: correct → present → absent. */
function evaluateGuess(guess, target) {
  const res = Array(WORD_LENGTH).fill('absent');
  const remaining = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) res[i] = 'correct';
    else remaining[target[i]] = (remaining[target[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (res[i] === 'correct') continue;
    if (remaining[guess[i]] > 0) { res[i] = 'present'; remaining[guess[i]] -= 1; }
  }
  return res;
}

export default function MoKacheGame({ isCreole, onExit, onRecord }) {
  const today = todayStr();
  const uid = useStore((s) => s.user?.uid ?? null);
  const [mode, setMode] = useState('daily'); // 'daily' | 'practice'
  const [practiceNonce, setPracticeNonce] = useState(0);

  const entry = useMemo(() => {
    if (mode === 'daily') return MO_KACHE_WORDS[dailyWordIndex(today)];
    return MO_KACHE_WORDS[Math.floor(Math.random() * MO_KACHE_WORDS.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, today, practiceNonce]);
  const target = entry?.word || '';

  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState('');
  const [state, setState] = useState('playing'); // 'playing' | 'won' | 'lost'
  const [shake, setShake] = useState(false);
  const [reward, setReward] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Restore today's daily grid (once per day rule).
  useEffect(() => {
    if (mode !== 'daily') { setGuesses([]); setCurrent(''); setState('playing'); setReward(null); setShowHint(false); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(today, uid)) || 'null');
      if (saved && Array.isArray(saved.guesses)) {
        setGuesses(saved.guesses);
        setState(saved.state || 'playing');
      } else {
        setGuesses([]); setState('playing');
      }
    } catch { setGuesses([]); setState('playing'); }
    setCurrent(''); setReward(null); setShowHint(false);
  }, [mode, today, practiceNonce, uid]);

  const persistDaily = (nextGuesses, nextState) => {
    if (mode !== 'daily') return;
    try {
      localStorage.setItem(storageKey(today, uid), JSON.stringify({ guesses: nextGuesses, state: nextState }));
    } catch {}
  };

  const finish = useCallback((won, guessCount) => {
    const score = won ? MAX_GUESSES - guessCount + 1 : 0;
    onRecord({ gameId: 'mo-kache', score, maxScore: MAX_GUESSES }).then(setReward).catch(() => setReward(null));
  }, [onRecord]);

  const submit = useCallback(() => {
    if (state !== 'playing') return;
    if (!isPlayableWordShape(current)) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    const nextGuesses = [...guesses, current];
    let nextState = 'playing';
    if (current === target) nextState = 'won';
    else if (nextGuesses.length >= MAX_GUESSES) nextState = 'lost';
    setGuesses(nextGuesses);
    setCurrent('');
    setState(nextState);
    persistDaily(nextGuesses, nextState);
    if (nextState !== 'playing') finish(nextState === 'won', nextGuesses.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, guesses, state, target, finish]);

  const type = useCallback((key) => {
    if (state !== 'playing') return;
    if (key === '↵') { submit(); return; }
    if (key === '⌫') { setCurrent((c) => c.slice(0, -1)); return; }
    setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
  }, [state, submit]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') type('↵');
      else if (e.key === 'Backspace') type('⌫');
      else if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [type]);

  const evaluations = guesses.map((g) => evaluateGuess(g, target));

  // Best-known state per keyboard letter.
  const keyStates = useMemo(() => {
    const rank = { absent: 1, present: 2, correct: 3 };
    const map = {};
    guesses.forEach((g, gi) => {
      for (let i = 0; i < WORD_LENGTH; i++) {
        const st = evaluations[gi][i];
        if (!map[g[i]] || rank[st] > rank[map[g[i]]]) map[g[i]] = st;
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guesses.join(',')]);

  const share = async () => {
    const rows = evaluations.map((ev) => ev.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛')).join(''));
    const text = `Mo Kaché ${today} · ${state === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}\n${rows.join('\n')}\nacademy.edlight.org/jeux`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const over = state !== 'playing';

  if (!entry) {
    return (
      <div className="mk-game" style={{ '--cat-color': '#059669' } as React.CSSProperties}>
        <p className="mk-game__answer">
          {isCreole ? 'Pa gen mo disponib kounye a.' : 'Aucun mot disponible pour le moment.'}
        </p>
        <button type="button" className="an-ghost" onClick={onExit}>
          ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
        </button>
      </div>
    );
  }

  return (
    <div className="mk-game" style={{ '--cat-color': '#059669' } as React.CSSProperties}>
      <div className="mk-game__modes" role="tablist">
        <button
          role="tab" aria-selected={mode === 'daily'}
          className={`mk-mode${mode === 'daily' ? ' is-on' : ''}`}
          onClick={() => setMode('daily')}
        >
          <CalendarCheck size={14} /> {isCreole ? 'Mo jou a' : 'Mot du jour'}
        </button>
        <button
          role="tab" aria-selected={mode === 'practice'}
          className={`mk-mode${mode === 'practice' ? ' is-on' : ''}`}
          onClick={() => { setMode('practice'); setPracticeNonce((n) => n + 1); }}
        >
          <Shuffle size={14} /> {isCreole ? 'Antrennman' : 'Entraînement'}
        </button>
      </div>

      <div className={`mk-game__grid ${shake ? 'is-shake' : ''}`}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const guess = guesses[row] || (row === guesses.length ? current : '');
          const evaln = evaluations[row];
          return (
            <div key={row} className="mk-game__row">
              {Array.from({ length: WORD_LENGTH }).map((_, col) => {
                const letter = guess[col] || '';
                const st = evaln ? evaln[col] : letter ? 'filled' : 'empty';
                const word = st === 'correct' ? (isCreole ? 'bon plas' : 'bien placée') : st === 'present' ? (isCreole ? 'move plas' : 'mal placée') : st === 'absent' ? (isCreole ? 'pa ladan' : 'absente') : '';
                return (
                  <span key={col} className={`mk-tile mk-tile--${st}`} aria-label={letter ? (word ? `${letter}, ${word}` : letter) : undefined}>
                    {letter}
                    {st === 'correct' && <Check size={11} className="mk-tile__mark" aria-hidden="true" />}
                    {st === 'present' && <span className="mk-tile__mark mk-tile__mark--dot" aria-hidden="true" />}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {guesses.length > 0 && (
        <p className="mk-legend" aria-hidden="true">
          <span><i className="mk-legend__sw mk-legend__sw--correct"><Check size={10} /></i>{isCreole ? 'Bon plas' : 'Bien placée'}</span>
          <span><i className="mk-legend__sw mk-legend__sw--present"><b /></i>{isCreole ? 'Move plas' : 'Mal placée'}</span>
          <span><i className="mk-legend__sw mk-legend__sw--absent" />{isCreole ? 'Pa ladan' : 'Absente'}</span>
        </p>
      )}

      {!over && guesses.length >= 2 && (
        showHint ? (
          <p className="mk-game__hint"><Lightbulb size={14} /> {isCreole ? entry.hintHt : entry.hint}</p>
        ) : (
          <button type="button" className="mk-game__hint-btn" onClick={() => setShowHint(true)}>
            <Lightbulb size={14} /> {isCreole ? 'Yon endis ?' : 'Un indice ?'}
          </button>
        )
      )}

      {over && (
        <div className="mk-game__end" role="status">
          <h2 className="mk-game__verdict">
            {state === 'won'
              ? (isCreole ? `Jwenn an ${guesses.length} esè !` : `Trouvé en ${guesses.length} essai${guesses.length > 1 ? 's' : ''} !`)
              : (isCreole ? 'Se pa pou jodi a' : 'Pas cette fois')}
          </h2>
          <p className="mk-game__answer">
            {isCreole ? 'Mo a se :' : 'Le mot :'} <strong>{entry.display}</strong>
            {entry.hint && <span className="mk-game__def"> — {isCreole ? entry.hintHt : entry.hint}</span>}
          </p>
          {reward && reward.xpEarned > 0 && (
            <p className="mk-game__xp">+{reward.xpEarned} XP{reward.guest ? (isCreole ? ' — konekte pou kenbe yo' : ' — connecte-toi pour les garder') : ''}</p>
          )}
          {mode !== 'practice' && (
            <p className="mk-game__tomorrow">
              {isCreole ? 'Yon nouvo mo demen. Antrennman an la toujou.' : 'Un nouveau mot demain. L’entraînement reste ouvert.'}
            </p>
          )}
          <div className="mk-game__end-actions">
            {state === 'won' && (
              <button type="button" className={mode === 'practice' ? 'an-ghost' : 'an-go'} onClick={share}>
                {copied ? <Check size={15} /> : <Share2 size={15} />} {copied ? (isCreole ? 'Kopye !' : 'Copié !') : (isCreole ? 'Kopye rezilta a' : 'Copier mon résultat')}
              </button>
            )}
            {mode === 'practice' ? (
              <button type="button" className="an-go" onClick={() => setPracticeNonce((n) => n + 1)}>
                {isCreole ? 'Yon lòt mo' : 'Un autre mot'}
              </button>
            ) : state !== 'won' && (
              <button type="button" className="an-go" onClick={() => { setMode('practice'); setPracticeNonce((n) => n + 1); }}>
                <Shuffle size={15} /> {isCreole ? 'Antrennman' : 'S’entraîner'}
              </button>
            )}
            <button type="button" className="an-ghost" onClick={onExit}>← {isCreole ? 'Jwèt yo' : 'Les jeux'}</button>
          </div>
        </div>
      )}

      {!over && (
        <div className="mk-game__keyboard">
          {KEY_ROWS.map((row) => (
            <div key={row} className="mk-game__key-row">
              {row.split('').map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`mk-key ${k === '↵' || k === '⌫' ? 'mk-key--wide' : ''} ${keyStates[k] ? `mk-key--${keyStates[k]}` : ''}`}
                  onClick={() => type(k)}
                  aria-label={k === '↵' ? (isCreole ? 'Antre' : 'Entrée') : k === '⌫' ? (isCreole ? 'Efase' : 'Effacer') : k}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
