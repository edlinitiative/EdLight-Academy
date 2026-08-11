/**
 * Shared game-over screen for the arcade games — now built on the same
 * "Aurora Depth" QuizResultHero as the Trivia and practice-quiz results, so
 * every surface in the app ends on one victory language. The per-game accent is
 * preserved (it tints the deep gradient, the count-up score ring and the glows),
 * while the stat rows, XP reward block and replay/exit actions ride on glass.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import {
  Trophy, Star, ThumbsUp, Dumbbell, Sparkles, Crown, RefreshCw, Share2,
} from 'lucide-react-native';
import { typeScale } from '../../theme/theme';
import { success } from '../../utils/haptics';
import QuizResultHero, { HeroButton, glass } from '../quiz/QuizResultHero';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../share/ShareCardCapture';

export interface GameReward {
  xpEarned: number;
  leveledUp?: boolean;
  newLevel?: number;
  prevLevel?: number;
  guest?: boolean;
  /** True when this round was the featured "Jeu de la semaine" (×2 XP). */
  weeklyFeatured?: boolean;
}

export interface GameStat {
  label: string;
  value: string | number;
}

interface GameOverCardProps {
  score: number;
  maxScore: number;
  stats?: GameStat[];
  reward?: GameReward | null;
  onReplay?: (() => void) | null;
  onExit: () => void;
  isCreole: boolean;
  accent?: string;
  highScore?: number | null;
  /**
   * Canonical (FR) game name for the 1080×1920 share card. When set, a
   * "Partager mon score" button appears — every arcade ending becomes a
   * shareable moment instead of the card existing only on the trivia results.
   */
  shareSubject?: string | null;
}

export default function GameOverCard({
  score,
  maxScore,
  stats = [],
  reward = null,
  onReplay,
  onExit,
  isCreole,
  accent = '#1B6FE0',
  highScore = null,
  shareSubject = null,
}: GameOverCardProps) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const shareRef = useRef<ShareCardCaptureHandle>(null);

  // Celebrate the game-over reveal once on mount (kept here so the haptic fires
  // for every game; the hero's own celebrateHaptic stays off to avoid doubling).
  useEffect(() => { success(); }, []);

  let IconCmp: typeof Trophy;
  let message: string;
  let messageHt: string;
  if (pct >= 90) {
    IconCmp = Trophy;
    message = 'Excellent ! Vous êtes un champion !';
    messageHt = 'Ekselan! Ou se yon chanpyon!';
  } else if (pct >= 70) {
    IconCmp = Star;
    message = 'Très bien ! Continuez comme ça !';
    messageHt = 'Trè byen! Kontinye konsa!';
  } else if (pct >= 50) {
    IconCmp = ThumbsUp;
    message = 'Pas mal ! Vous pouvez vous améliorer.';
    messageHt = 'Pa mal! Ou ka amelyore.';
  } else {
    IconCmp = Dumbbell;
    message = 'Courage ! Réessayez pour progresser.';
    messageHt = 'Kouraj! Eseye ankò pou pwogrese.';
  }

  const isRecord = highScore != null && score >= highScore && score > 0;

  return (
    <>
    {shareSubject ? <ShareCardCapture ref={shareRef} /> : null}
    <QuizResultHero
      score={score}
      total={maxScore}
      isCreole={isCreole}
      accent={accent}
      title={isCreole ? 'Rezilta Ou' : 'Vos Résultats'}
      showConfetti={pct >= 90 || !!reward?.leveledUp}
      footer={
        <>
          {onReplay && (
            <HeroButton
              variant="solid"
              color={accent}
              icon={<RefreshCw color="#fff" size={18} />}
              label={isCreole ? 'Jwe ankò' : 'Rejouer'}
              onPress={onReplay}
              style={{ marginBottom: 10 }}
            />
          )}
          {shareSubject && (
            <HeroButton
              variant="glass"
              icon={<Share2 color="#fff" size={18} />}
              label={isCreole ? 'Pataje nòt mwen' : 'Partager mon score'}
              onPress={() => shareRef.current?.share({ mode: 'score', subject: shareSubject, score, total: maxScore })}
              style={{ marginBottom: 10 }}
            />
          )}
          <HeroButton
            variant="ghost"
            label={`← ${isCreole ? 'Jwèt yo' : 'Les jeux'}`}
            accessibilityLabel={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
            onPress={onExit}
          />
        </>
      }
    >
      {/* Tier badge + message */}
      <View style={{ ...glass, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
        <IconCmp color="#fff" size={24} />
      </View>
      <Text style={{ fontFamily: typeScale.body.fontFamily, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 12, paddingHorizontal: 8 }}>
        {isCreole ? messageHt : message}
      </Text>

      {/* Stat chips */}
      {stats.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
          {stats.map((s) => (
            <View key={s.label} style={{ ...glass, flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontFamily: typeScale.num.fontFamily, color: '#fff' }}>{s.value}</Text>
              <Text numberOfLines={1} style={{ fontSize: 10, fontFamily: typeScale.overline.fontFamily, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Personal record */}
      {isRecord && (
        <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14 }}>
          <Trophy color="#fde68a" size={14} />
          <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 13, color: '#fde68a' }}>
            {isCreole ? 'Nouvo rekò pèsonèl !' : 'Nouveau record personnel !'}
          </Text>
        </View>
      )}

      {/* XP reward */}
      {reward && reward.xpEarned > 0 && (
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Sparkles color="#fde68a" size={16} />
            <Text style={{ fontFamily: typeScale.bodyMd.fontFamily, fontSize: 14, color: '#fde68a' }}>
              +{reward.xpEarned} XP
            </Text>
            {reward.weeklyFeatured && (
              <View style={{ backgroundColor: '#fde68a', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 11, color: '#3a2c00' }}>
                  {isCreole ? '×2 semèn nan' : '×2 cette semaine'}
                </Text>
              </View>
            )}
          </View>
          {reward.leveledUp && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Crown color="#fde68a" size={14} />
              <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 13, color: '#fde68a' }}>
                {reward.prevLevel != null && reward.newLevel != null && reward.prevLevel !== reward.newLevel
                  ? (isCreole ? `Nivo ${reward.prevLevel} → ${reward.newLevel} !` : `Niveau ${reward.prevLevel} → ${reward.newLevel} !`)
                  : (isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`)}
              </Text>
            </View>
          )}
          {reward.guest && (
            <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 6, textAlign: 'center' }}>
              {isCreole ? 'Konekte pou anrejistre XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
            </Text>
          )}
        </View>
      )}
    </QuizResultHero>
    </>
  );
}
