/**
 * Vrai ou Faux — 60-second blitz (RN port).
 * A trivia question is shown with ONE proposed answer; decide whether that
 * answer is correct. Derives everything from the trivia bank (see gameGen).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { X, Check, Timer, Flame } from 'lucide-react-native';
import { buildVraiFauxItems } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { useRoundTimer, TimeBar } from './RoundTimer';
import { typeScale, radius } from '../../theme/theme';
import { useArenaColors, arenaColors as C } from '../../theme/arenaTheme';
import { ArenaButton } from '../arena/ArenaKit';
import PressableScale from '../ui/PressableScale';
import { success, warn } from '../../utils/haptics';

const ROUND_SECONDS = 60;
// Volume guard: fewer than this many answers can't reach 100% XP accuracy.
const MIN_DENOMINATOR = 20;

interface VraiFauxGameProps {
  questionsMap: Record<string, any[]>;
  isCreole: boolean;
  onExit: () => void;
  onRecord: (r: { gameId: string; score: number; maxScore: number }) => Promise<any>;
  highScore?: number | null;
}

export default function VraiFauxGame({
  questionsMap, isCreole, onExit, onRecord, highScore = null,
}: VraiFauxGameProps) {
  const colors = useArenaColors();
  const [nonce, setNonce] = useState(0);
  const items = useMemo(() => buildVraiFauxItems(questionsMap, 80), [questionsMap, nonce]);

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const recordedRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = items[idx % Math.max(items.length, 1)];

  // Don't run the clock (nor let it end + record a bogus 0) with no questions.
  const { timeLeft, urgent } = useRoundTimer(ROUND_SECONDS, {
    paused: over || items.length === 0,
    resetKey: nonce,
    onExpire: () => setOver(true),
  });

  // Clear any pending feedback timeout on unmount.
  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  // Record once when the round ends.
  useEffect(() => {
    if (!over || recordedRef.current) return;
    recordedRef.current = true;
    const maxScore = Math.max(answered, MIN_DENOMINATOR);
    onRecord({ gameId: 'vrai-faux', score: correct, maxScore })
      .then(setReward).catch(() => setReward(null));
  }, [over, answered, correct, onRecord]);

  const answer = (saysTrue: boolean) => {
    if (over || feedback || !item) return;
    const right = saysTrue === item.truth;
    setAnswered((n) => n + 1);
    if (right) {
      success();
      setCorrect((n) => n + 1);
      setStreak((s) => { const ns = s + 1; setBestStreak((b) => Math.max(b, ns)); return ns; });
    } else {
      warn();
      setStreak(0);
    }
    setFeedback(right ? 'right' : 'wrong');
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      setIdx((i) => i + 1);
    }, right ? 350 : 900);
  };

  const replay = () => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIdx(0); setCorrect(0); setAnswered(0); setStreak(0); setBestStreak(0);
    setFeedback(null); setOver(false); setReward(null);
  };

  // Thin/empty question bank: show a friendly message instead of the play UI
  // (an empty items[] would otherwise leave nothing to answer).
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.bg }}>
        <Text style={[typeScale.title, { color: colors.ink, textAlign: 'center', marginBottom: 8 }]}>
          {isCreole ? 'Poko gen kesyon' : 'Aucune question disponible'}
        </Text>
        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginBottom: 20 }]}>
          {isCreole ? 'Tounen pita, n ap ajoute kesyon.' : 'Revenez plus tard, des questions arrivent.'}
        </Text>
        <ArenaButton
          variant="secondary"
          onPress={onExit}
          label={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
        />
      </View>
    );
  }

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
        accent={C.coral}
        highScore={highScore}
        shareSubject={isCreole ? 'Vre oswa Fo' : 'Vrai ou Faux'}
      />
    );
  }

  if (!item) return null;

  // Verdict is a tonal wash on the card, never an outline.
  const cardBg = feedback === 'right' ? C.successSoft : feedback === 'wrong' ? C.dangerSoft : C.surfaceRaised;

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
        <Text style={[typeScale.titleSm, { color: colors.ink }]}>
          {correct}/{answered}
        </Text>
        <View className="flex-row items-center gap-1">
          <Flame color={streak >= 3 ? colors.warn : colors.faint} size={15} />
          <Text style={[typeScale.bodyMd, { color: streak >= 3 ? colors.warn : colors.muted }]}>
            {streak}
          </Text>
        </View>
      </View>

      {/* Time bar */}
      <TimeBar timeLeft={timeLeft} total={ROUND_SECONDS} color={urgent ? C.danger : C.coral} />

      {/* Question card */}
      <View
        className="px-5 py-6 mt-4 items-center"
        style={{
          borderRadius: 24,
          backgroundColor: cardBg,
        }}
      >
        {item.flag && (
          <View className="items-center mb-3">
            {item.flagIso ? (
              <Image
                source={{ uri: `https://flagcdn.com/w320/${item.flagIso}.png` }}
                style={{ width: 150, height: 95, borderRadius: 8 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ fontSize: 56 }}>{item.flag}</Text>
            )}
          </View>
        )}
        <Text style={[typeScale.title, { color: colors.ink, textAlign: 'center' }]}>
          {isCreole ? item.qHt : item.q}
        </Text>
        <Text
          style={[typeScale.h1, { color: C.ink, textAlign: 'center', marginTop: 12 }]}
        >
          {item.proposed}
        </Text>
        {feedback === 'wrong' && (
          <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
            {isCreole ? 'Repons kòrèk la:' : 'La bonne réponse :'}{' '}
            <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{item.correctAnswer}</Text>
          </Text>
        )}
      </View>

      {/* Actions */}
      <View className="flex-row gap-3 mt-5">
        <PressableScale
          onPress={() => answer(false)}
          disabled={!!feedback}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Repons lan fo' : 'La réponse est fausse'}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 999, backgroundColor: C.dangerSoft, opacity: feedback ? 0.55 : 1 }}
        >
          <X color={C.danger} size={20} />
          <Text style={[typeScale.title, { color: C.danger }]}>{isCreole ? 'Fo' : 'Faux'}</Text>
        </PressableScale>
        <PressableScale
          onPress={() => answer(true)}
          disabled={!!feedback}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Repons lan vre' : 'La réponse est vraie'}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 999, backgroundColor: C.successSoft, opacity: feedback ? 0.55 : 1 }}
        >
          <Check color={C.success} size={20} />
          <Text style={[typeScale.title, { color: C.success }]}>{isCreole ? 'Vre' : 'Vrai'}</Text>
        </PressableScale>
      </View>

      <Text style={[typeScale.label, { color: colors.muted, textAlign: 'center', marginTop: 12 }]}>
        {isCreole ? 'Èske repons ki pwopoze a kòrèk ?' : 'La réponse proposée est-elle correcte ?'}
      </Text>
    </View>
  );
}
