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
import { typeScale } from '../../theme/theme';
import { useArenaColors, arenaColors as C } from '../../theme/arenaTheme';
import { success, warn } from '../../utils/haptics';
import PressableScale from '../ui/PressableScale';
import GameOverCard from './GameOverCard';

const MAX_GUESSES = 6;
const KEY_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', '↵WXCVBN⌫'];
// The night has one accent (coral); tile states use success / warn fills.
const ACCENT = C.coral;
const storageKey = (date: string) => `edlight_mokache_${date}`;

// Cap the board/keyboard width so keys don't balloon on iPad (portrait +
// requireFullScreen → stable width); phones fall under the cap unchanged.
const SCREEN_W = Math.min(Dimensions.get('window').width, 500);
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

// Opaque fills only — no tile outlines. Solid state fills carry marine text.
const TILE_COLORS: Record<TileState, { bg: string; text: string }> = {
  correct: { bg: C.success, text: C.marine },
  present: { bg: C.warn, text: C.marine },
  absent: { bg: C.secondary, text: C.muted },
  filled: { bg: C.surfaceRaised, text: C.ink },
  empty: { bg: C.surface, text: C.ink },
};

const KEY_COLORS: Record<string, { bg: string; text: string }> = {
  correct: { bg: C.success, text: C.marine },
  present: { bg: C.warn, text: C.marine },
  absent: { bg: C.bg, text: C.faint },
};

interface MoKacheGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function MoKacheGame({ isCreole, onExit, onRecord, highScore = null }: MoKacheGameProps) {
  const colors = useArenaColors();
  const tileColors = TILE_COLORS;
  const today = todayStr();
  const [mode, setMode] = useState<'daily' | 'practice'>('daily');
  const [practiceNonce, setPracticeNonce] = useState(0);

  const entry = useMemo(() => {
    // No words loaded → return null rather than indexing an empty array
    // (dailyWordIndex would compute `h % 0` = NaN and entry.word would throw).
    if (MO_KACHE_WORDS.length === 0) return null;
    if (mode === 'daily') return MO_KACHE_WORDS[dailyWordIndex(today)];
    return MO_KACHE_WORDS[Math.floor(Math.random() * MO_KACHE_WORDS.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, today, practiceNonce]);
  const target = entry?.word ?? '';

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [state, setState] = useState<PlayState>('playing');
  const [loaded, setLoaded] = useState(false);
  const [reward, setReward] = useState<any>(null);
  const [showHint, setShowHint] = useState(false);

  const shakeX = useRef(new Animated.Value(0)).current;
  // One record per puzzle (same idempotency pattern as the other games) — the
  // key changes with the daily date / practice nonce, re-arming the guard.
  const recordedRef = useRef<string | null>(null);

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
    const puzzleKey = mode === 'daily' ? `daily:${today}` : `practice:${practiceNonce}`;
    if (recordedRef.current === puzzleKey) return;
    recordedRef.current = puzzleKey;
    const score = won ? MAX_GUESSES - guessCount + 1 : 0;
    onRecord({ gameId: 'mo-kache', score, maxScore: MAX_GUESSES })
      .then(setReward).catch(() => setReward(null));
  }, [onRecord, mode, today, practiceNonce]);

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
    // Guess feedback in the hand, not only the tiles (parity with VraiFaux/Suites).
    if (nextState === 'won') success();
    else warn();
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
    const text = `Mo Kaché ${today} · ${state === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}\n${rows.join('\n')}\nacademy.edlight.org/jeux`;
    try { await Share.share({ message: text }); } catch {}
  };

  const over = state !== 'playing';

  // No word bank available: friendly empty state instead of a broken grid.
  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.bg }}>
        <Text style={[typeScale.h2, { color: colors.ink, textAlign: 'center', marginBottom: 8 }]}>
          {isCreole ? 'Poko gen mo' : 'Aucun mot disponible'}
        </Text>
        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginBottom: 20 }]}>
          {isCreole ? 'Tounen pita, n ap ajoute mo.' : 'Revenez plus tard, des mots arrivent.'}
        </Text>
        <TouchableOpacity
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
          activeOpacity={0.85}
          className="items-center justify-center px-8"
          style={{ minHeight: 50, borderRadius: 999, backgroundColor: C.secondary }}
        >
          <Text style={[typeScale.title, { color: C.ink }]}>
            {isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Game over → the same shared victory surface as every other arcade game
  // (score ring, stat chips, XP + level-up, personal-record chip). The word
  // reveal + hint + emoji-grid share ride in a strip above it.
  if (over) {
    const finalScore = state === 'won' ? MAX_GUESSES - guesses.length + 1 : 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ marginHorizontal: 20, marginTop: 8, padding: 16, borderRadius: 20, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.body, { color: colors.muted }]}>
                {state === 'won'
                  ? (isCreole ? 'Bravo !' : 'Bravo !')
                  : (isCreole ? 'Mo a te:' : 'Le mot était :')}{' '}
                <Text style={[typeScale.title, { color: colors.ink }]}>{entry.display}</Text>
              </Text>
              {!!entry.hint && (
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]} numberOfLines={2}>
                  {isCreole ? entry.hintHt : entry.hint}
                </Text>
              )}
            </View>
            {state === 'won' && (
              <TouchableOpacity
                onPress={share}
                accessibilityRole="button"
                accessibilityLabel={isCreole ? 'Pataje rezilta a' : 'Partager le résultat'}
                activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.secondary, borderRadius: 999, paddingHorizontal: 16, minHeight: 44 }}
              >
                <Share2 color={C.ink} size={16} />
                <Text style={[typeScale.label, { color: C.ink }]}>{isCreole ? 'Pataje' : 'Partager'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {mode === 'daily' && (
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 6 }]}>
              {isCreole ? 'Retounen demen pou yon nouvo mo !' : 'Revenez demain pour un nouveau mot !'}
            </Text>
          )}
        </View>
        <GameOverCard
          score={finalScore}
          maxScore={MAX_GUESSES}
          accent={ACCENT}
          isCreole={isCreole}
          reward={reward}
          highScore={highScore}
          stats={[
            { label: isCreole ? 'Esè' : 'Essais', value: `${state === 'won' ? guesses.length : 'X'}/${MAX_GUESSES}` },
            { label: isCreole ? 'Mo a' : 'Le mot', value: entry.display },
          ]}
          onReplay={mode === 'practice' ? () => setPracticeNonce((n) => n + 1) : null}
          onExit={onExit}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 12, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Mode tabs */}
      <View className="flex-row gap-2 mb-4">
        <TouchableOpacity
          onPress={() => setMode('daily')}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Mo jou a' : 'Mot du jour'}
          activeOpacity={0.85}
          className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
          style={{ backgroundColor: mode === 'daily' ? C.surfaceRaised : C.surface, minHeight: 44 }}
        >
          <CalendarCheck color={mode === 'daily' ? C.ink : colors.muted} size={16} />
          <Text style={[typeScale.label, { color: mode === 'daily' ? C.ink : colors.muted }]}>
            {isCreole ? 'Mo jou a' : 'Mot du jour'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setMode('practice'); setPracticeNonce((n) => n + 1); }}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Antrennman' : 'Entraînement'}
          activeOpacity={0.85}
          className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
          style={{ backgroundColor: mode === 'practice' ? C.surfaceRaised : C.surface, minHeight: 44 }}
        >
          <Shuffle color={mode === 'practice' ? C.ink : colors.muted} size={16} />
          <Text style={[typeScale.label, { color: mode === 'practice' ? C.ink : colors.muted }]}>
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
                const c = tileColors[st];
                return (
                  <View
                    key={col}
                    style={{
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      borderRadius: 10,
                      backgroundColor: c.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={[typeScale.h1, { color: c.text }]}>{letter}</Text>
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
            <Lightbulb color={C.warn} size={16} />
            <Text style={[typeScale.label, { color: C.inkSoft, flexShrink: 1 }]}>
              {isCreole ? entry.hintHt : entry.hint}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setShowHint(true)}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Montre yon endis' : 'Afficher un indice'}
            activeOpacity={0.85}
            className="flex-row items-center gap-1.5 rounded-full px-4 mt-4"
            style={{ backgroundColor: C.secondary, minHeight: 44 }}
          >
            <Lightbulb color={C.warn} size={16} />
            <Text style={[typeScale.label, { color: C.ink }]}>
              {isCreole ? 'Yon endis ?' : 'Un indice ?'}
            </Text>
          </TouchableOpacity>
        )
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
                  <PressableScale
                    key={k}
                    onPress={() => type(k)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      k === '↵'
                        ? (isCreole ? 'Antre' : 'Valider')
                        : k === '⌫'
                        ? (isCreole ? 'Efase' : 'Effacer')
                        : k
                    }
                    pressedScale={0.92}
                    style={{
                      width: wide ? Math.floor(KEY_W * 1.5) : KEY_W,
                      height: KEY_H,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: kc ? kc.bg : C.surfaceRaised,
                    }}
                  >
                    {k === '↵' ? (
                      <CornerDownLeft color={kc ? kc.text : colors.ink} size={18} />
                    ) : k === '⌫' ? (
                      <Delete color={kc ? kc.text : colors.ink} size={18} />
                    ) : (
                      <Text style={[typeScale.title, { color: kc ? kc.text : colors.ink }]}>
                        {k}
                      </Text>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
