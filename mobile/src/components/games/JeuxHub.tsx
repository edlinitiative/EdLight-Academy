/**
 * JeuxHub — the games arcade landing (RN port of the web /jeux hub, "Limyè
 * Arcade" style): header with XP/streak/parties stats, a grid of 6 solid
 * color game tiles (white icon chip + tilted high-score sticker), and a
 * community Records strip fed by leaderboardService.getGameRecords.
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { Zap, Flame, Trophy, Clock, Crown, Sparkles, Share2 } from 'lucide-react-native';
import { GAMES, GAME_ICONS } from '../../data/games';
import { getGameRecords } from '../../services/leaderboardService';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import DailyChallengeBanner from './DailyChallengeBanner';
import { Skeleton } from '../StateViews';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../share/ShareCardCapture';

const GRID_PAD = 16;
const TILE_GAP = 12;
// Cap so 2-col tiles don't balloon on iPad (portrait + requireFullScreen → stable
// width). Phones fall under the cap unchanged; the grid is centered on tablets.
const GRID_W = Math.min(Dimensions.get('window').width, 560);
const TILE_W = Math.floor((GRID_W - GRID_PAD * 2 - TILE_GAP) / 2);

interface GameRecord {
  score: number;
  displayName: string;
  uid?: string;
}

interface JeuxHubProps {
  onSelectGame: (id: string) => void;
  onStartTrivia: () => void;
  onStartDaily: () => void;
}

/* ─── Records strip: best-ever score per arcade game + holder ─── */
function GameRecords({ isCreole }: { isCreole: boolean }) {
  const colors = useColors();
  const { shadow } = useTheme();
  const user = useStore((s) => s.user);
  const shareRef = useRef<ShareCardCaptureHandle>(null);
  const [records, setRecords] = useState<Record<string, GameRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getGameRecords()
      .then((r: Record<string, GameRecord>) => {
        if (alive) setRecords(r || {});
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const arcade = GAMES.filter((g) => g.id !== 'trivia');

  // Fetch in flight → show a layout-matched skeleton instead of a silent gap.
  if (loading) {
    return (
      <View
        className="px-4 py-4 mx-4 mt-5"
        style={{ backgroundColor: colors.surface, borderRadius: radius.hero, ...shadow.md }}
        accessible
        accessibilityLabel={isCreole ? 'Ap chaje' : 'Chargement…'}
        accessibilityLiveRegion="polite"
      >
        <View className="flex-row items-center gap-1.5 mb-3">
          <Crown color={colors.warn} size={15} />
          <Skeleton width={90} height={16} radius={6} />
        </View>
        {arcade.map((g, i) => (
          <View
            key={g.id}
            className="flex-row items-center justify-between py-2"
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
          >
            <Skeleton width={110} height={13} radius={6} />
            <Skeleton width={64} height={13} radius={6} />
          </View>
        ))}
      </View>
    );
  }

  if (!arcade.some((g) => records[g.id])) return null; // loaded, nothing set yet

  return (
    <>
    <ShareCardCapture ref={shareRef} />
    <View
      className="px-4 py-4 mx-4 mt-5"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.hero,
        ...shadow.md,
      }}
    >
      <View className="flex-row items-center gap-1.5 mb-0.5">
        <Crown color={colors.warn} size={15} />
        <Text style={[typeScale.title, { color: colors.ink }]}>
          {isCreole ? 'Rekò yo' : 'Records'}
        </Text>
      </View>
      <Text style={[typeScale.caption, { color: colors.muted, marginBottom: 10 }]}>
        {isCreole ? 'Meyè nòt kominote a' : 'Meilleurs scores de la communauté'}
      </Text>
      {arcade.map((g, i) => {
        const rec = records[g.id];
        const Icon = GAME_ICONS[g.id];
        // The signed-in student holds this record → offer to share the N°1 card.
        const isHolder = !!rec?.uid && !!user?.uid && rec.uid === user.uid;
        return (
          <View
            key={g.id}
            className="flex-row items-center justify-between py-2"
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
          >
            <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1 }}>
              <Icon color={g.color} size={14} />
              <Text style={[typeScale.label, { color: g.color }]}>
                {isCreole ? g.nameHt : g.name}
              </Text>
            </View>
            {rec ? (
              <View className="flex-row items-center" style={{ gap: 10 }}>
                {isHolder ? (
                  <TouchableOpacity
                    onPress={() => shareRef.current?.share({ mode: 'rank', subject: g.name, scoreLabel: `${rec.score}`, holder: rec.displayName })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={isCreole ? 'Pataje rang mwen' : 'Partager mon rang'}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Share2 color={colors.azure} size={15} />
                  </TouchableOpacity>
                ) : null}
                {/* Score is the hero (gold chip); the holder is a clear caption so
                    a bare "L · 12" no longer reads as a mystery — it's "🏆 12, par L". */}
                <View style={{ alignItems: 'flex-end' }}>
                  <View
                    className="flex-row items-center gap-1 rounded-full"
                    style={{ backgroundColor: colors.warnSoft, paddingHorizontal: 9, paddingVertical: 3 }}
                  >
                    <Trophy color={colors.warn} size={12} />
                    <Text style={[typeScale.label, { color: colors.ink }]}>{rec.score}</Text>
                  </View>
                  <Text style={[typeScale.micro, { color: colors.faint, marginTop: 2 }]} numberOfLines={1}>
                    {isCreole ? 'pa' : 'par'} {rec.displayName}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: colors.surfaceAlt }}>
                <Text style={[typeScale.micro, { color: colors.muted }]}>
                  {isCreole ? 'Poko gen rekò !' : 'À prendre !'}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
    </>
  );
}

/* ─── Hub ─── */
export default function JeuxHub({ onSelectGame, onStartTrivia, onStartDaily }: JeuxHubProps) {
  const { profile, level, isAuthed, daily } = useTrivia();
  const { streak } = useStreak();
  const colors = useColors();
  const { shadow } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const highScores: Record<string, number> = profile?.games?.highScores || {};
  const gamesPlayed: number = profile?.games?.gamesPlayed || 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Défi du jour — surfaced on the hub so it's visible without opening the
          Trivia card. */}
      <View className="px-4 pt-2 pb-3">
        <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={onStartDaily} />
      </View>

      {/* Stats row — or, for guests, a friendly prompt instead of an empty band */}
      {isAuthed ? (
        <View className="flex-row px-4 gap-2 mb-4">
          <View className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-3 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Zap color={colors.azure} size={16} />
            <Text style={[typeScale.titleSm, { color: colors.ink }]}>{level.xp}</Text>
            <Text style={[typeScale.caption, { color: colors.muted }]}>
              XP · {isCreole ? 'Nivo' : 'Niv.'} {level.level}
            </Text>
          </View>
          <View className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-3 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Flame color={colors.danger} size={16} />
            <Text style={[typeScale.titleSm, { color: colors.ink }]}>
              {streak?.currentStreak || 0}
            </Text>
            <Text style={[typeScale.caption, { color: colors.muted }]}>{isCreole ? 'Seri' : 'Série'}</Text>
          </View>
          <View className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl py-3 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Trophy color={colors.warn} size={16} />
            <Text style={[typeScale.titleSm, { color: colors.ink }]}>{gamesPlayed}</Text>
            <Text style={[typeScale.caption, { color: colors.muted }]}>{isCreole ? 'Pati' : 'Parties'}</Text>
          </View>
        </View>
      ) : (
        <View
          className="flex-row items-center mx-4 mb-4 px-4 py-3 rounded-2xl border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, gap: 12 }}
          accessible
          accessibilityLabel={isCreole
            ? 'Konekte pou swiv XP, seri ak pati ou yo'
            : 'Connecte-toi pour suivre tes XP, ta série et tes parties'}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.control,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.azureSoft,
            }}
          >
            <Sparkles color={colors.azure} size={20} />
          </View>
          <View className="flex-1">
            <Text style={[typeScale.titleSm, { color: colors.ink }]}>
              {isCreole ? 'Konekte pou kenbe pwogrè w' : 'Connecte-toi pour suivre tes XP'}
            </Text>
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
              {isCreole
                ? 'XP, seri ak pati ap parèt isit la.'
                : 'Tes XP, ta série et tes parties s\'afficheront ici.'}
            </Text>
          </View>
        </View>
      )}

      {/* Game tiles */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: TILE_GAP,
          paddingHorizontal: GRID_PAD,
        }}
      >
        {GAMES.map((g) => {
          const Icon = GAME_ICONS[g.id];
          const hs = highScores[g.id];
          return (
            <PressableScale
              key={g.id}
              onPress={() => (g.id === 'trivia' ? onStartTrivia() : onSelectGame(g.id))}
              accessibilityRole="button"
              accessibilityLabel={`${isCreole ? g.nameHt : g.name} — ${isCreole ? g.descriptionHt : g.description}`}
              pressedScale={0.96}
              style={{
                width: TILE_W,
                borderRadius: radius.hero,
                backgroundColor: g.color,
                padding: 14,
                paddingTop: 16,
                minHeight: 170,
                overflow: 'visible',
                shadowColor: g.color,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 5,
              }}
            >
              {/* Icon chip */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.control,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon color="#fff" size={24} />
              </View>

              {/* Tilted high-score sticker */}
              {hs != null && (
                <View
                  className="flex-row items-center gap-1"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    backgroundColor: '#ffffff',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    transform: [{ rotate: '4deg' }],
                    ...shadow.sm,
                  }}
                >
                  <Trophy color={g.color} size={11} />
                  <Text style={[typeScale.micro, { color: g.color }]}>{hs}</Text>
                </View>
              )}

              <Text style={[typeScale.h2, { color: '#ffffff', marginTop: 12 }]}>
                {isCreole ? g.nameHt : g.name}
              </Text>
              <Text
                style={[typeScale.caption, { color: 'rgba(255,255,255,0.88)', marginTop: 4, flexGrow: 1 }]}
                numberOfLines={3}
              >
                {isCreole ? g.descriptionHt : g.description}
              </Text>
              <View className="flex-row items-center gap-1 mt-2">
                <Clock color="rgba(255,255,255,0.85)" size={12} />
                <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.85)' }]}>
                  ~{g.minutes} min
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {/* Community records */}
      <GameRecords isCreole={isCreole} />
    </ScrollView>
  );
}
