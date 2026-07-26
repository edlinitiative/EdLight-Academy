/**
 * JeuxHub — the games arcade landing (RN port of the web /jeux hub, "Limyè
 * Arcade" style): header with XP/streak/parties stats, a grid of 6 solid
 * color game tiles (white icon chip + tilted high-score sticker), and a
 * community Records strip fed by leaderboardService.getGameRecords.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import { Zap, Flame, Trophy, Clock, Crown } from 'lucide-react-native';
import { GAMES, GAME_ICONS } from '../../data/games';
import { getGameRecords } from '../../services/leaderboardService';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import DailyChallengeBanner from './DailyChallengeBanner';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';

const GRID_PAD = 16;
const TILE_GAP = 12;
const TILE_W = Math.floor((Dimensions.get('window').width - GRID_PAD * 2 - TILE_GAP) / 2);

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
  const [records, setRecords] = useState<Record<string, GameRecord>>({});

  useEffect(() => {
    let alive = true;
    getGameRecords().then((r: Record<string, GameRecord>) => {
      if (alive) setRecords(r || {});
    });
    return () => { alive = false; };
  }, []);

  const arcade = GAMES.filter((g) => g.id !== 'trivia');
  if (!arcade.some((g) => records[g.id])) return null; // nothing set yet

  return (
    <View
      className="px-4 py-4 mx-4 mt-5"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.hero,
        ...shadow.md,
      }}
    >
      <View className="flex-row items-center gap-1.5 mb-3">
        <Crown color={colors.warn} size={15} />
        <Text style={[typeScale.title, { color: colors.ink }]}>
          {isCreole ? 'Rekò yo' : 'Records'}
        </Text>
      </View>
      {arcade.map((g, i) => {
        const rec = records[g.id];
        const Icon = GAME_ICONS[g.id];
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
              <Text style={[typeScale.label, { color: colors.muted }]} numberOfLines={1}>
                {rec.displayName} ·{' '}
                <Text style={[typeScale.label, { color: colors.ink }]}>{rec.score}</Text>
              </Text>
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

      {/* Stats row */}
      {isAuthed && (
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
