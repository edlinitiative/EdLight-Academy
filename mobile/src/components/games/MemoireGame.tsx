/**
 * Mémoire — concentration with country ↔ capital pairs (RN port).
 * Score = pairs×10 − moves (a move = one two-card attempt), so fewer flips
 * score higher, same formula as code.edlight.org's Code Memory.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Timer, MousePointerClick } from 'lucide-react-native';
import { CAPITAL_PAIRS } from '../../data/triviaData';
import { buildMemoryDeck, MemoryCard } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { useColors } from '../../theme/theme';

const PAIRS = 6;
const ACCENT = '#7c3aed';

const GRID_PAD = 16;
const CARD_GAP = 10;
// 3 columns × 4 rows for the 12-card deck.
const CARD_W = Math.floor((Dimensions.get('window').width - GRID_PAD * 2 - CARD_GAP * 2) / 3);
const CARD_H = Math.round(CARD_W * 1.0);

interface MemoireGameProps {
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function MemoireGame({
  isCreole, onExit, onRecord, highScore = null,
}: MemoireGameProps) {
  const colors = useColors();
  const [nonce, setNonce] = useState(0);
  const deck = useMemo(() => buildMemoryDeck(CAPITAL_PAIRS, PAIRS, isCreole), [isCreole, nonce]);

  const [flipped, setFlipped] = useState<string[]>([]); // card ids face-up (unmatched)
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [reward, setReward] = useState<GameReward | null>(null);
  const lockRef = useRef(false);
  const recordedRef = useRef(false);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = matched.size === deck.length && deck.length > 0;

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [done, nonce]);

  useEffect(() => () => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
  }, []);

  const score = Math.max(0, PAIRS * 10 - moves);

  useEffect(() => {
    if (!done || recordedRef.current) return;
    recordedRef.current = true;
    onRecord({ gameId: 'memoire', score, maxScore: PAIRS * 10 })
      .then(setReward).catch(() => setReward(null));
  }, [done, score, onRecord]);

  const flip = (card: MemoryCard) => {
    if (lockRef.current || matched.has(card.id) || flipped.includes(card.id)) return;
    const next = [...flipped, card.id];
    setFlipped(next);
    if (next.length < 2) return;

    lockRef.current = true;
    setMoves((m) => m + 1);
    const [a, b] = next.map((id) => deck.find((c) => c.id === id)!);
    if (a.pairId === b.pairId && a.side !== b.side) {
      flipTimerRef.current = setTimeout(() => {
        setMatched((prev) => new Set([...prev, a.id, b.id]));
        setFlipped([]);
        lockRef.current = false;
      }, 400);
    } else {
      flipTimerRef.current = setTimeout(() => {
        setFlipped([]);
        lockRef.current = false;
      }, 900);
    }
  };

  const replay = () => {
    recordedRef.current = false;
    lockRef.current = false;
    setNonce((n) => n + 1);
    setFlipped([]); setMatched(new Set()); setMoves(0); setSeconds(0); setReward(null);
  };

  if (done) {
    return (
      <GameOverCard
        score={score}
        maxScore={PAIRS * 10}
        stats={[
          { label: isCreole ? 'Mouvman' : 'Coups', value: moves },
          { label: isCreole ? 'Tan' : 'Temps', value: `${seconds}s` },
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

  return (
    <View className="flex-1 pt-3" style={{ backgroundColor: colors.bg }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between px-4 mb-3">
        <View className="flex-row items-center gap-1.5">
          <MousePointerClick color={colors.muted} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>
            {moves} {isCreole ? 'mouvman' : 'coups'}
          </Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: ACCENT }}>
          {isCreole ? 'Peyi ↔ Kapital' : 'Pays ↔ Capitale'}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Timer color={colors.muted} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>{seconds}s</Text>
        </View>
      </View>

      {/* Card grid */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: CARD_GAP,
          paddingHorizontal: GRID_PAD,
        }}
      >
        {deck.map((card) => {
          const isMatched = matched.has(card.id);
          const isUp = flipped.includes(card.id) || isMatched;
          return (
            <TouchableOpacity
              key={card.id}
              onPress={() => flip(card)}
              accessibilityRole="button"
              accessibilityLabel={isUp ? card.label : (isCreole ? 'Vire kat la' : 'Retourner la carte')}
              activeOpacity={0.85}
              style={{
                width: CARD_W,
                height: CARD_H,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
                backgroundColor: isUp ? colors.surface : card.side === 'a' ? ACCENT : '#9d6ff0',
                borderWidth: isUp ? 2 : 0,
                borderColor: isMatched ? '#10b981' : colors.border,
                opacity: isMatched ? 0.75 : 1,
              }}
            >
              {isUp ? (
                <Text
                  numberOfLines={3}
                  adjustsFontSizeToFit
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: isMatched ? '#059669' : colors.ink,
                    textAlign: 'center',
                  }}
                >
                  {card.label}
                </Text>
              ) : (
                <Text style={{ fontSize: 26, fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>
                  ?
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
