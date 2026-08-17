/**
 * Calcul éclair — 60 seconds of mental arithmetic with ramping difficulty
 * (see nextCalcProblem's tiers). RN port: numeric keypad input; "Passer"
 * skips but counts as an attempt so skipping isn't free.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Timer, Delete, CornerDownLeft, Flame } from 'lucide-react-native';
import { nextCalcProblem } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { useRoundTimer, TimeBar } from './RoundTimer';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';
import { success, warn } from '../../utils/haptics';

const ROUND_SECONDS = 60;
const MIN_DENOMINATOR = 15;
const ACCENT = '#d97706';

const PAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '⌫'];

interface CalculGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function CalculGame({
  isCreole, onExit, onRecord, highScore = null,
}: CalculGameProps) {
  const colors = useColors();
  const { shadow } = useTheme();
  const [nonce, setNonce] = useState(0);
  const [solved, setSolved] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [problem, setProblem] = useState(() => nextCalcProblem(0));
  const [input, setInput] = useState('');
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const recordedRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { timeLeft, urgent } = useRoundTimer(ROUND_SECONDS, {
    paused: over,
    resetKey: nonce,
    onExpire: () => setOver(true),
  });

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const maxScore = Math.max(attempts, MIN_DENOMINATOR);
    onRecord({ gameId: 'calcul', score: solved, maxScore })
      .then(setReward).catch(() => setReward(null));
  }, [over, attempts, solved, onRecord]);

  const advance = (wasRight: boolean) => {
    if (over) return;
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
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 350);
  };

  const submit = () => {
    if (over || input === '' || input === '-') return;
    const right = Number(input) === problem.answer;
    // Haptic on real submissions only — a deliberate "Passer" stays silent.
    if (right) success(); else warn();
    advance(right);
  };

  const press = (k: string) => {
    if (over) return;
    if (k === '⌫') setInput((s) => s.slice(0, -1));
    else if (k === '−') setInput((s) => (s === '' ? '-' : s));
    else if (input.replace('-', '').length < 5) setInput((s) => s + k);
  };

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setSolved(0); setAttempts(0); setStreak(0); setBestStreak(0);
    setProblem(nextCalcProblem(0)); setInput('');
    setOver(false); setReward(null); setFlash(null);
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
        accent={ACCENT}
        highScore={highScore}
        shareSubject={isCreole ? 'Kalkil Rapid' : 'Calcul éclair'}
      />
    );
  }

  const problemBorder = flash === 'right' ? colors.success : flash === 'wrong' ? colors.danger : colors.border;
  const okDisabled = input === '' || input === '-';

  return (
    <View className="flex-1 px-4 pt-3" style={{ backgroundColor: colors.bg }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Timer color={urgent ? colors.danger : colors.muted} size={15} />
          <Text style={[typeScale.bodyMd, { color: urgent ? colors.danger : colors.muted }]}>
            {timeLeft}s
          </Text>
        </View>
        <Text style={[typeScale.title, { color: colors.ink }]}>{solved}</Text>
        <View className="flex-row items-center gap-1">
          <Flame color={streak >= 3 ? colors.warn : colors.faint} size={15} />
          <Text style={[typeScale.bodyMd, { color: streak >= 3 ? colors.warn : colors.muted }]}>
            {streak}
          </Text>
        </View>
      </View>

      {/* Time bar */}
      <TimeBar timeLeft={timeLeft} total={ROUND_SECONDS} color={ACCENT} />

      {/* Problem */}
      <View
        className="px-5 py-6 mt-4 flex-row items-center justify-center gap-3"
        style={{
          borderRadius: radius.hero,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: problemBorder,
          ...shadow.md,
        }}
      >
        <Text style={[typeScale.display, { color: colors.ink }]}>
          {problem.text} =
        </Text>
        <View
          style={{
            minWidth: 84,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 12,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
          }}
        >
          <Text style={[typeScale.display, { color: ACCENT }]}>
            {input || ' '}
          </Text>
        </View>
      </View>

      {/* Keypad */}
      <View className="flex-row flex-wrap justify-center mt-5" style={{ gap: 8 }}>
        {PAD_KEYS.map((k) => (
          <PressableScale
            key={k}
            onPress={() => press(k)}
            accessibilityRole="button"
            accessibilityLabel={
              k === '⌫'
                ? (isCreole ? 'Efase' : 'Effacer')
                : k === '−'
                ? (isCreole ? 'Mwens' : 'Moins')
                : k
            }
            pressedScale={0.94}
            style={{ alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.tile, width: '30%', height: 56, backgroundColor: colors.surfaceAlt, borderColor: colors.border, ...shadow.sm }}
          >
            {k === '⌫' ? (
              <Delete color={colors.ink} size={20} />
            ) : (
              <Text style={[typeScale.h1, { color: colors.ink }]}>{k}</Text>
            )}
          </PressableScale>
        ))}
      </View>

      {/* Actions */}
      <View className="flex-row gap-3 mt-4">
        <TouchableOpacity
          onPress={() => advance(false)}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Sote pwoblèm nan' : 'Passer le problème'}
          activeOpacity={0.85}
          className="flex-1 items-center justify-center py-4 border"
          style={{ borderRadius: radius.tile, borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <Text style={[typeScale.title, { color: colors.muted }]}>
            {isCreole ? 'Sote' : 'Passer'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={okDisabled}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Valide repons lan' : 'Valider la réponse'}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center justify-center gap-2 py-4"
          style={{ borderRadius: radius.tile, backgroundColor: ACCENT, opacity: okDisabled ? 0.5 : 1 }}
        >
          <CornerDownLeft color="#fff" size={16} />
          <Text style={[typeScale.title, { color: '#fff' }]}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
