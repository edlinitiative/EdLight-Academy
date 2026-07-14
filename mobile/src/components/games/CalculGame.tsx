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
  const [nonce, setNonce] = useState(0);
  const [solved, setSolved] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [problem, setProblem] = useState(() => nextCalcProblem(0));
  const [input, setInput] = useState('');
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const recordedRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    advance(Number(input) === problem.answer);
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
    setTimeLeft(ROUND_SECONDS); setOver(false); setReward(null); setFlash(null);
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
      />
    );
  }

  const urgent = timeLeft <= 10;
  const problemBorder = flash === 'right' ? '#10b981' : flash === 'wrong' ? '#ef4444' : '#e5e7eb';
  const okDisabled = input === '' || input === '-';

  return (
    <View className="flex-1 px-4 pt-3" style={{ backgroundColor: '#f4f6fb' }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Timer color={urgent ? '#ef4444' : '#64748b'} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: urgent ? '#ef4444' : '#334155' }}>
            {timeLeft}s
          </Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{solved}</Text>
        <View className="flex-row items-center gap-1">
          <Flame color={streak >= 3 ? '#f97316' : '#94a3b8'} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: streak >= 3 ? '#f97316' : '#64748b' }}>
            {streak}
          </Text>
        </View>
      </View>

      {/* Time bar */}
      <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e2e8f0' }}>
        <View
          className="h-1.5 rounded-full"
          style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%`, backgroundColor: ACCENT }}
        />
      </View>

      {/* Problem */}
      <View
        className="bg-white rounded-3xl px-5 py-6 mt-4 flex-row items-center justify-center gap-3"
        style={{
          borderWidth: 2,
          borderColor: problemBorder,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#0f172a' }}>
          {problem.text} =
        </Text>
        <View
          style={{
            minWidth: 84,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 12,
            backgroundColor: '#f1f5f9',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: '800', color: ACCENT }}>
            {input || ' '}
          </Text>
        </View>
      </View>

      {/* Keypad */}
      <View className="flex-row flex-wrap justify-center mt-5" style={{ gap: 8 }}>
        {PAD_KEYS.map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => press(k)}
            activeOpacity={0.7}
            className="items-center justify-center bg-white rounded-2xl border border-gray-200"
            style={{ width: '30%', height: 56 }}
          >
            {k === '⌫' ? (
              <Delete color="#0f172a" size={20} />
            ) : (
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#0f172a' }}>{k}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <View className="flex-row gap-3 mt-4">
        <TouchableOpacity
          onPress={() => advance(false)}
          activeOpacity={0.85}
          className="flex-1 items-center justify-center py-4 rounded-2xl border border-gray-300 bg-white"
        >
          <Text className="text-gray-700 font-semibold text-base">
            {isCreole ? 'Sote' : 'Passer'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={okDisabled}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ backgroundColor: ACCENT, opacity: okDisabled ? 0.5 : 1 }}
        >
          <CornerDownLeft color="#fff" size={16} />
          <Text className="text-white font-bold text-base">OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
