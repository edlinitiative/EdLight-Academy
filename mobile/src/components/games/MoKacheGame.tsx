/**
 * Mo Kaché — the daily hidden word (wordle-style, RN port).
 * • Daily mode: everyone gets the same word (deterministic from the date);
 *   the grid is persisted in AsyncStorage so one puzzle a day, come back
 *   tomorrow. • Practice mode: random word, replayable at will.
 * Hint unlocks after 2 guesses; win shares as an emoji grid (native share sheet).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Dimensions, Animated, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarCheck, Shuffle, Lightbulb, Share2, Delete, CornerDownLeft } from 'lucide-react-native';
import { MO_KACHE_WORDS, WORD_LENGTH, isPlayableWordShape } from '../../data/moKacheWords';
import { todayStr } from '../../services/streakService';

const MAX_GUESSES = 6;
const KEY_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', '↵WXCVBN⌫'];
const ACCENT = '#059669';
const storageKey = (date: string) => `edlight_mokache_${date}`;

const SCREEN_W = Dimensions.get('window').width;
const TILE_GAP = 6;
const TILE_SIZE = Math.min(56, Math.floor((SCREEN_W - 32 - TILE_GAP * (WORD_LENGTH - 1)) / WORD_LENGTH));
const KEY_GAP = 4;
const KEY_W = Math.floor((SCREEN_W - 16 - KEY_GAP * 9) / 10);
const KEY_H = 46;

type TileState = 'correct' | 'present' | 'absent' | 'filled' | 'empty';
type PlayState = 'playing' | 'won' | 'lost';

function dailyWordIndex(dateStr: string) {
  // Simple deterministic hash of YYYY-MM-DD → stable index for everyone.
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h % MO_KACHE_WORDS.length;
}

/** Two-pass wordle evaluation: correct → present → absent. */
function evaluateGuess(guess: string, target: string): TileState[] {
  const res: TileState[] = Array(WORD_LENGTH).fill('absent');
  const remaining: Record<string, number> = {};
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

const TILE_COLORS: Record<TileState, { bg: string; border: string; text: string }> = {
  correct: { bg: '#059669', border: '#059669', text: '#ffffff' },
  present: { bg: '#d97706', border: '#d97706', text: '#ffffff' },
  absent: { bg: '#94a3b8', border: '#94a3b8', text: '#ffffff' },
  filled: { bg: '#ffffff', border: '#94a3b8', text: '#0f172a' },
  empty: { bg: '#ffffff', border: '#e2e8f0', text: '#0f172a' },
};

const KEY_COLORS: Record<string, { bg: string; text: string }> = {
  correct: { bg: '#059669', text: '#ffffff' },
  present: { bg: '#d97706', text: '#ffffff' },
  absent: { bg: '#64748b', text: '#ffffff' },
};

interface MoKacheGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function MoKacheGame({ isCreole, onExit, onRecord }: MoKacheGameProps) {
  const today = todayStr();
  const [mode, setMode] = useState<'daily' | 'practice'>('daily');
  const [practiceNonce, setPracticeNonce] = useState(0);

  const entry = useMemo(() => {
    if (mode === 'daily') return MO_KACHE_WORDS[dailyWordIndex(today)];
    return MO_KACHE_WORDS[Math.floor(Math.random() * MO_KACHE_WORDS.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, today, practiceNonce]);
  const target = entry.word;

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [state, setState] = useState<PlayState>('playing');
  const [loaded, setLoaded] = useState(false);
  const [reward, setReward] = useState<any>(null);
  const [showHint, setShowHint] = useState(false);

  const shakeX = useRef(new Animated.Value(0)).current;

  // Restore today's daily grid (once per day rule). AsyncStorage is async, so
  // gate input on `loaded` to avoid clobbering a restored grid.
  useEffect(() => {
    let alive = true;
    if (mode !== 'daily') {
      setGuesses([]); setCurrent(''); setState('playing'); setReward(null); setShowHint(false);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    setGuesses([]); setCurrent(''); setState('playing'); setReward(null); setShowHint(false);
    AsyncStorage.getItem(storageKey(today))
      .then((raw) => {
        if (!alive) return;
        try {
          const saved = raw ? JSON.parse(raw) : null;
          if (saved && Array.isArray(saved.guesses)) {
            setGuesses(saved.guesses);
            setState(saved.state || 'playing');
          }
        } catch {}
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [mode, today, practiceNonce]);

  const persistDaily = (nextGuesses: string[], nextState: PlayState) => {
    if (mode !== 'daily') return;
    AsyncStorage.setItem(
      storageKey(today),
      JSON.stringify({ guesses: nextGuesses, state: nextState }),
    ).catch(() => {});
  };

  const finish = useCallback((won: boolean, guessCount: number) => {
    const score = won ? MAX_GUESSES - guessCount + 1 : 0;
    onRecord({ gameId: 'mo-kache', score, maxScore: MAX_GUESSES })
      .then(setReward).catch(() => setReward(null));
  }, [onRecord]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const submit = useCallback(() => {
    if (state !== 'playing' || !loaded) return;
    if (!isPlayableWordShape(current)) { shake(); return; }
    const nextGuesses = [...guesses, current];
    let nextState: PlayState = 'playing';
    if (current === target) nextState = 'won';
    else if (nextGuesses.length >= MAX_GUESSES) nextState = 'lost';
    setGuesses(nextGuesses);
    setCurrent('');
    setState(nextState);
    persistDaily(nextGuesses, nextState);
    if (nextState !== 'playing') finish(nextState === 'won', nextGuesses.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, guesses, state, target, finish, loaded]);

  const type = useCallback((key: string) => {
    if (state !== 'playing' || !loaded) return;
    if (key === '↵') { submit(); return; }
    if (key === '⌫') { setCurrent((c) => c.slice(0, -1)); return; }
    setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
  }, [state, submit, loaded]);

  const evaluations = guesses.map((g) => evaluateGuess(g, target));

  // Best-known state per keyboard letter.
  const keyStates = useMemo(() => {
    const rank: Record<string, number> = { absent: 1, present: 2, correct: 3 };
    const map: Record<string, TileState> = {};
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
    const rows = evaluations.map((ev) =>
      ev.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛')).join(''),
    );
    const text = `Mo Kaché ${today} — ${state === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}\n${rows.join('\n')}\nacademy.edlight.org/jeux`;
    try { await Share.share({ message: text }); } catch {}
  };

  const over = state !== 'playing';

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#f4f6fb' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 12, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Mode tabs */}
      <View className="flex-row gap-2 mb-4">
        <TouchableOpacity
          onPress={() => setMode('daily')}
          activeOpacity={0.85}
          className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
          style={{ backgroundColor: mode === 'daily' ? ACCENT : '#ffffff', borderWidth: 1, borderColor: mode === 'daily' ? ACCENT : '#e2e8f0' }}
        >
          <CalendarCheck color={mode === 'daily' ? '#fff' : '#64748b'} size={14} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: mode === 'daily' ? '#fff' : '#334155' }}>
            {isCreole ? 'Mo jou a' : 'Mot du jour'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setMode('practice'); setPracticeNonce((n) => n + 1); }}
          activeOpacity={0.85}
          className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
          style={{ backgroundColor: mode === 'practice' ? ACCENT : '#ffffff', borderWidth: 1, borderColor: mode === 'practice' ? ACCENT : '#e2e8f0' }}
        >
          <Shuffle color={mode === 'practice' ? '#fff' : '#64748b'} size={14} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: mode === 'practice' ? '#fff' : '#334155' }}>
            {isCreole ? 'Antrennman' : 'Entraînement'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <Animated.View style={{ gap: TILE_GAP, transform: [{ translateX: shakeX }] }}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const guess = guesses[row] || (row === guesses.length ? current : '');
          const evaln = evaluations[row];
          return (
            <View key={row} style={{ flexDirection: 'row', gap: TILE_GAP }}>
              {Array.from({ length: WORD_LENGTH }).map((_, col) => {
                const letter = guess[col] || '';
                const st: TileState = evaln ? evaln[col] : letter ? 'filled' : 'empty';
                const c = TILE_COLORS[st];
                return (
                  <View
                    key={col}
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      borderRadius: 10,
                      backgroundColor: c.bg,
                      borderWidth: 2,
                      borderColor: c.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>{letter}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Animated.View>

      {/* Hint (unlocks after 2 guesses) */}
      {!over && guesses.length >= 2 && (
        showHint ? (
          <View className="flex-row items-center gap-1.5 mt-4 px-6">
            <Lightbulb color={ACCENT} size={14} />
            <Text style={{ fontSize: 13, color: '#334155', flexShrink: 1 }}>
              {isCreole ? entry.hintHt : entry.hint}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setShowHint(true)}
            activeOpacity={0.85}
            className="flex-row items-center gap-1.5 rounded-full px-4 py-2 mt-4 bg-white border border-gray-200"
          >
            <Lightbulb color={ACCENT} size={14} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: ACCENT }}>
              {isCreole ? 'Yon endis ?' : 'Un indice ?'}
            </Text>
          </TouchableOpacity>
        )
      )}

      {/* End panel */}
      {over && (
        <View className="items-center px-6 mt-5 w-full">
          <Text style={{ fontSize: 16, color: '#334155', textAlign: 'center' }}>
            {state === 'won'
              ? (isCreole ? 'Bravo !' : 'Bravo !')
              : (isCreole ? 'Mo a te:' : 'Le mot était :')}{' '}
            <Text style={{ fontWeight: '800', color: '#0f172a' }}>{entry.display}</Text>
          </Text>
          {!!entry.hint && (
            <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
              {isCreole ? entry.hintHt : entry.hint}
            </Text>
          )}
          {reward && reward.xpEarned > 0 && (
            <Text style={{ fontSize: 14, fontWeight: '800', color: ACCENT, marginTop: 10 }}>
              +{reward.xpEarned} XP
              {reward.guest
                ? (isCreole ? ' — konekte pou sove yo' : ' — connectez-vous pour les garder')
                : ''}
            </Text>
          )}

          <View className="w-full mt-5">
            {state === 'won' && (
              <TouchableOpacity
                onPress={share}
                activeOpacity={0.85}
                className="w-full flex-row items-center justify-center gap-2 py-4 rounded-2xl mb-3"
                style={{ backgroundColor: ACCENT }}
              >
                <Share2 color="#fff" size={16} />
                <Text className="text-white font-bold text-base">
                  {isCreole ? 'Pataje' : 'Partager'}
                </Text>
              </TouchableOpacity>
            )}
            {mode === 'practice' ? (
              <TouchableOpacity
                onPress={() => setPracticeNonce((n) => n + 1)}
                activeOpacity={0.85}
                className="w-full items-center justify-center py-4 rounded-2xl mb-3"
                style={{ backgroundColor: state === 'won' ? '#ffffff' : ACCENT, borderWidth: state === 'won' ? 1 : 0, borderColor: '#e2e8f0' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: state === 'won' ? '#334155' : '#ffffff' }}>
                  {isCreole ? 'Yon lòt mo' : 'Un autre mot'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 12 }}>
                {isCreole ? 'Retounen demen pou yon nouvo mo !' : 'Revenez demain pour un nouveau mot !'}
              </Text>
            )}
            <TouchableOpacity
              onPress={onExit}
              activeOpacity={0.85}
              className="w-full items-center justify-center py-4 rounded-2xl border border-gray-300 bg-white"
            >
              <Text className="text-gray-700 font-semibold text-base">
                ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* On-screen AZERTY keyboard */}
      {!over && (
        <View style={{ marginTop: 18, gap: KEY_GAP, alignItems: 'center' }}>
          {KEY_ROWS.map((row) => (
            <View key={row} style={{ flexDirection: 'row', gap: KEY_GAP }}>
              {row.split('').map((k) => {
                const wide = k === '↵' || k === '⌫';
                const st = keyStates[k];
                const kc = st ? KEY_COLORS[st] : null;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => type(k)}
                    activeOpacity={0.7}
                    style={{
                      width: wide ? Math.floor(KEY_W * 1.5) : KEY_W,
                      height: KEY_H,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: kc ? kc.bg : '#e2e8f0',
                    }}
                  >
                    {k === '↵' ? (
                      <CornerDownLeft color={kc ? kc.text : '#0f172a'} size={18} />
                    ) : k === '⌫' ? (
                      <Delete color={kc ? kc.text : '#0f172a'} size={18} />
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: '700', color: kc ? kc.text : '#0f172a' }}>
                        {k}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
