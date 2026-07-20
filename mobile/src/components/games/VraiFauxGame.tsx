/**
 * Vrai ou Faux — 60-second blitz (RN port).
 * A trivia question is shown with ONE proposed answer; decide whether that
 * answer is correct. Derives everything from the trivia bank (see gameGen).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { X, Check, Timer, Flame } from 'lucide-react-native';
import { buildVraiFauxItems } from '../../utils/gameGen';
import GameOverCard, { GameReward } from './GameOverCard';
import { useColors } from '../../theme/theme';
import { success, warn } from '../../utils/haptics';

const ROUND_SECONDS = 60;
// Volume guard: fewer than this many answers can't reach 100% XP accuracy.
const MIN_DENOMINATOR = 20;
const ACCENT = '#e0532f';

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
  const colors = useColors();
  const [nonce, setNonce] = useState(0);
  const items = useMemo(() => buildVraiFauxItems(questionsMap, 80), [questionsMap, nonce]);

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const recordedRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = items[idx % Math.max(items.length, 1)];

  useEffect(() => {
    // Don't run the clock (nor let it end + record a bogus 0) with no questions.
    if (over || items.length === 0) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(iv); setOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [over, nonce, items.length]);

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
    setFeedback(null); setTimeLeft(ROUND_SECONDS); setOver(false); setReward(null);
  };

  // Thin/empty question bank: show a friendly message instead of the play UI
  // (an empty items[] would otherwise leave nothing to answer).
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 8 }}>
          {isCreole ? 'Poko gen kesyon' : 'Aucune question disponible'}
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20 }}>
          {isCreole ? 'Tounen pita — n ap ajoute kesyon.' : 'Revenez plus tard — des questions arrivent.'}
        </Text>
        <TouchableOpacity
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
          activeOpacity={0.85}
          className="items-center justify-center py-4 px-8 rounded-2xl border"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <Text className="font-semibold text-base" style={{ color: colors.muted }}>
            ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
          </Text>
        </TouchableOpacity>
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
        accent={ACCENT}
        highScore={highScore}
      />
    );
  }

  if (!item) return null;

  const urgent = timeLeft <= 10;
  const cardBorder = feedback === 'right' ? '#10b981' : feedback === 'wrong' ? '#ef4444' : colors.border;

  return (
    <View className="flex-1 px-4 pt-3" style={{ backgroundColor: colors.bg }}>
      {/* HUD */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Timer color={urgent ? '#ef4444' : colors.muted} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: urgent ? '#ef4444' : colors.muted }}>
            {timeLeft}s
          </Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
          {correct}/{answered}
        </Text>
        <View className="flex-row items-center gap-1">
          <Flame color={streak >= 3 ? colors.warn : colors.faint} size={15} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: streak >= 3 ? colors.warn : colors.muted }}>
            {streak}
          </Text>
        </View>
      </View>

      {/* Time bar */}
      <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
        <View
          className="h-1.5 rounded-full"
          style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%`, backgroundColor: ACCENT }}
        />
      </View>

      {/* Question card */}
      <View
        className="rounded-3xl px-5 py-6 mt-4 items-center"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: cardBorder,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 3,
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
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'center' }}>
          {isCreole ? item.qHt : item.q}
        </Text>
        <Text
          style={{ fontSize: 21, fontWeight: '800', color: ACCENT, textAlign: 'center', marginTop: 12 }}
        >
          {item.proposed}
        </Text>
        {feedback === 'wrong' && (
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 10 }}>
            {isCreole ? 'Repons kòrèk la:' : 'La bonne réponse :'}{' '}
            <Text style={{ fontWeight: '800', color: colors.ink }}>{item.correctAnswer}</Text>
          </Text>
        )}
      </View>

      {/* Actions */}
      <View className="flex-row gap-3 mt-5">
        <TouchableOpacity
          onPress={() => answer(false)}
          disabled={!!feedback}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Repons lan fo' : 'La réponse est fausse'}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ backgroundColor: '#ef4444', opacity: feedback ? 0.55 : 1 }}
        >
          <X color="#fff" size={20} />
          <Text className="text-white font-bold text-base">{isCreole ? 'Fo' : 'Faux'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => answer(true)}
          disabled={!!feedback}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Repons lan vre' : 'La réponse est vraie'}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ backgroundColor: '#10b981', opacity: feedback ? 0.55 : 1 }}
        >
          <Check color="#fff" size={20} />
          <Text className="text-white font-bold text-base">{isCreole ? 'Vre' : 'Vrai'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 13, color: colors.faint, textAlign: 'center', marginTop: 12 }}>
        {isCreole ? 'Èske repons ki pwopoze a kòrèk ?' : 'La réponse proposée est-elle correcte ?'}
      </Text>
    </View>
  );
}
