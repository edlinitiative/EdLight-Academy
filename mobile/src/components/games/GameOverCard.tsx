/**
 * Shared game-over screen for the arcade games, on the Jeux night: the same
 * NightResult as a trivia round, so every game in the tab ends in one language
 * — your face, the gold score (earned), the rewards as chips, one coral
 * "Rejouer". `accent` is accepted for API stability but no longer tints
 * anything: the night has one accent.
 */

import React, { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { Trophy, Star, Crown, RefreshCw, Share2 } from 'lucide-react-native';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { success } from '../../utils/haptics';
import useStore from '../../contexts/store';
import NightResult, { RewardChip } from './NightResult';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../share/ShareCardCapture';
import BeatMyScoreCard from '../share/BeatMyScoreCard';

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
  const user = useStore((s) => s.user);
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const shareRef = useRef<ShareCardCaptureHandle>(null);

  // One haptic on the reveal, and only when it is worth one: a new personal
  // record or a strong round. A routine game over is not a celebration — the
  // same buzz on every ending teaches the student to ignore it (audit #19).
  const recordRound = highScore != null && score > 0 && score >= highScore;
  useEffect(() => {
    if (recordRound || pct >= 80) success();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let message: string;
  let messageHt: string;
  if (pct >= 90) {
    message = 'Excellent';
    messageHt = 'Ekselan';
  } else if (pct >= 70) {
    message = 'Très bien';
    messageHt = 'Trè byen';
  } else if (pct >= 50) {
    message = 'Pas mal';
    messageHt = 'Pa mal';
  } else {
    message = 'Courage, réessaie';
    messageHt = 'Kouraj, eseye ankò';
  }

  const isRecord = highScore != null && score >= highScore && score > 0;
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const statLine = stats.map((s) => `${s.label} ${s.value}`).join(' · ');

  return (
    <>
      {shareSubject ? <ShareCardCapture ref={shareRef} /> : null}
      <NightResult
        title={t('Résultat', 'Rezilta')}
        subtitle={shareSubject ?? undefined}
        onClose={onExit}
        closeLabel={t('Retour aux jeux', 'Tounen nan jwèt yo')}
        me={{ seed: user?.uid || 'toi', label: t('Toi', 'Ou') }}
        winner={isRecord || pct >= 90 ? 'me' : null}
        headline={isCreole ? messageHt : message}
        score={score}
        total={maxScore}
        scoreEarned={score > 0}
        scoreLine={statLine || null}
        chips={(
          <>
            {isRecord ? <RewardChip earned icon={<Trophy color={C.gold} size={16} />} label={t('Nouveau record personnel', 'Nouvo rekò pèsonèl')} /> : null}
            {reward && reward.xpEarned > 0 ? (
              <RewardChip earned icon={<Star color={C.gold} size={16} />} label={`+${reward.xpEarned} XP${reward.weeklyFeatured ? t(' · ×2 cette semaine', ' · ×2 semèn nan') : ''}`} />
            ) : null}
            {reward?.leveledUp ? (
              <RewardChip
                earned
                icon={<Crown color={C.gold} size={16} />}
                label={reward.prevLevel != null && reward.newLevel != null && reward.prevLevel !== reward.newLevel
                  ? t(`Niveau ${reward.prevLevel} → ${reward.newLevel}`, `Nivo ${reward.prevLevel} → ${reward.newLevel}`)
                  : t(`Niveau ${reward.newLevel}`, `Nivo ${reward.newLevel}`)}
              />
            ) : null}
          </>
        )}
        primary={onReplay ? { label: t('Rejouer', 'Jwe ankò'), icon: <RefreshCw color={C.onCoral} size={18} />, onPress: onReplay } : null}
        secondary={shareSubject ? [{
          label: t('Partager mon score', 'Pataje nòt mwen'),
          icon: <Share2 color={C.ink} size={18} />,
          onPress: () => shareRef.current?.share({ mode: 'score', subject: shareSubject, score, total: maxScore }),
        }] : []}
        link={{ label: t('Retour aux jeux', 'Tounen nan jwèt yo'), onPress: onExit }}
      >
        {reward?.guest ? (
          <Text style={[arenaType.status, { color: C.muted, textAlign: 'center' }]}>
            {t('Connecte-toi pour garder tes XP.', 'Konekte pou kenbe XP ou.')}
          </Text>
        ) : null}
        {/* Invite someone to beat it — the thing that brings a second player in. */}
        {shareSubject ? (
          <BeatMyScoreCard title={shareSubject} score={score} total={maxScore} variant="night" source="game" />
        ) : null}
      </NightResult>
    </>
  );
}
