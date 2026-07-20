/**
 * Suites logiques — 10 generated number sequences (arithmetic, tables,
 * geometric, squares, alternating, Fibonacci-like); pick the next term
 * among 4 options. RN port; difficulty pool widens after round 3.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import { buildSequenceRounds } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { useColors } from '../../theme/theme';
import { success, warn } from '../../utils/haptics';

const ROUNDS = 10;
const ACCENT = '#0e7490';

interface SuitesGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function SuitesGame({
  isCreole, onExit, onRecord, highScore = null,
}: SuitesGameProps) {
  const colors = useColors();
  const [nonce, setNonce] = useState(0);
  const rounds = useMemo(() => buildSequenceRounds(ROUNDS), [nonce]);

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const recordedRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  const round = rounds[idx];

  const pick = (opt: number) => {
    if (picked != null) return;
    setPicked(opt);
    const right = opt === round.answer;
    const nextScore = right ? score + 1 : score;
    if (right) { success(); setScore(nextScore); } else { warn(); }
    advanceTimerRef.current = setTimeout(() => {
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
        accent={ACCENT}
        highScore={highScore}
      />
    );
  }

  return (
    <View className="flex-1 px-4 pt-3" style={{ backgroundColor: colors.bg }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between mb-4">
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>
          {idx + 1} / {ROUNDS}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: ACCENT }}>
          {score} {isCreole ? 'pwen' : 'points'}
        </Text>
      </View>

      {/* Quiz block — vertically centered in the remaining space */}
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 32 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 18 }}>
        {isCreole ? 'Ki nimewo ki vini apre ?' : 'Quel nombre vient ensuite ?'}
      </Text>

      {/* Sequence terms */}
      <View className="flex-row flex-wrap items-center justify-center" style={{ gap: 8 }}>
        {round.shown.map((n, i) => (
          <View
            key={i}
            className="items-center justify-center rounded-xl border"
            style={{ minWidth: 56, height: 52, paddingHorizontal: 10, backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{n}</Text>
          </View>
        ))}
        <View
          className="items-center justify-center rounded-xl"
          style={{ minWidth: 56, height: 52, backgroundColor: ACCENT }}
        >
          <HelpCircle color="#fff" size={22} />
        </View>
      </View>

      {/* Options — 2×2 grid */}
      <View className="flex-row flex-wrap justify-center mt-7" style={{ gap: 10 }}>
        {round.options.map((opt) => {
          let bg = colors.surface;
          let border = colors.border;
          let color = colors.ink;
          let opacity = 1;
          if (picked != null) {
            if (opt === round.answer) { bg = '#10b981'; border = '#10b981'; color = '#ffffff'; }
            else if (opt === picked) { bg = '#ef4444'; border = '#ef4444'; color = '#ffffff'; }
            else { opacity = 0.45; }
          }
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => pick(opt)}
              disabled={picked != null}
              activeOpacity={0.85}
              className="items-center justify-center rounded-2xl"
              style={{
                width: '46%',
                height: 64,
                backgroundColor: bg,
                borderWidth: 2,
                borderColor: border,
                opacity,
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '800', color }}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </View>
    </View>
  );
}
