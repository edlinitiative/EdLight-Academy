/**
 * Suites logiques — 10 generated number sequences (arithmetic, tables,
 * geometric, squares, alternating, Fibonacci-like); pick the next term
 * among 4 options. RN port; difficulty pool widens after round 3.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import { buildSequenceRounds } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { typeScale } from '../../theme/theme';
import { useArenaColors, arenaColors as C } from '../../theme/arenaTheme';
import PressableScale from '../ui/PressableScale';
import { success, warn } from '../../utils/haptics';

const ROUNDS = 10;
// The night has one accent; the score and the blank speak in tonal steps.
const ACCENT = C.coral;

interface SuitesGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function SuitesGame({
  isCreole, onExit, onRecord, highScore = null,
}: SuitesGameProps) {
  const colors = useArenaColors();
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
        shareSubject={isCreole ? 'Sekans Lojik' : 'Suites logiques'}
      />
    );
  }

  return (
    <View className="flex-1 px-4 pt-3" style={{ backgroundColor: colors.bg }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between mb-4">
        <Text style={[typeScale.bodyMd, { color: colors.muted }]}>
          {idx + 1} / {ROUNDS}
        </Text>
        <Text style={[typeScale.bodyMd, { color: C.ink }]}>
          {score} {isCreole ? 'pwen' : 'points'}
        </Text>
      </View>

      {/* Quiz block — vertically centered in the remaining space */}
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 32 }}>
      <Text style={[typeScale.title, { color: colors.ink, textAlign: 'center', marginBottom: 18 }]}>
        {isCreole ? 'Ki nimewo ki vini apre ?' : 'Quel nombre vient ensuite ?'}
      </Text>

      {/* Sequence terms */}
      <View className="flex-row flex-wrap items-center justify-center" style={{ gap: 8 }}>
        {round.shown.map((n, i) => (
          <View
            key={i}
            className="items-center justify-center"
            style={{ minWidth: 56, height: 52, paddingHorizontal: 10, borderRadius: 14, backgroundColor: C.surfaceRaised }}
          >
            <Text style={[typeScale.h2, { color: colors.ink }]}>{n}</Text>
          </View>
        ))}
        <View
          className="items-center justify-center"
          style={{ minWidth: 56, height: 52, borderRadius: 14, backgroundColor: C.secondary }}
        >
          <HelpCircle color={C.coral} size={22} />
        </View>
      </View>

      {/* Options — 2×2 grid */}
      <View className="flex-row flex-wrap justify-center mt-7" style={{ gap: 10 }}>
        {round.options.map((opt) => {
          // State is a tonal wash, never an outline.
          let bg: string = C.surface;
          let color: string = C.ink;
          let opacity = 1;
          if (picked != null) {
            if (opt === round.answer) { bg = C.successSoft; color = C.success; }
            else if (opt === picked) { bg = C.dangerSoft; color = C.danger; }
            else { opacity = 0.45; }
          }
          return (
            <PressableScale
              key={opt}
              onPress={() => pick(opt)}
              disabled={picked != null}
              accessibilityRole="button"
              accessibilityLabel={`${isCreole ? 'Chwazi' : 'Choisir'} ${opt}`}
              pressedScale={0.95}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: '46%',
                height: 64,
                borderRadius: 18,
                backgroundColor: bg,
                opacity,
              }}
            >
              <Text style={[typeScale.h1, { color }]}>{opt}</Text>
            </PressableScale>
          );
        })}
      </View>
      </View>
    </View>
  );
}
