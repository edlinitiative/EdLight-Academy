/**
 * JeuxHub — the games arcade landing (RN port of the web /jeux hub, "Limyè
 * Arcade" style): header with XP/streak/parties stats, a grid of 6 solid
 * color game tiles (white icon chip + tilted high-score sticker), and a
 * community Records strip fed by leaderboardService.getGameRecords.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Zap, Flame, Trophy, Clock, Crown } from 'lucide-react-native';
import { GAMES, GAME_ICONS } from '../../data/games';
import { getGameRecords } from '../../services/leaderboardService';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import DailyChallengeBanner from './DailyChallengeBanner';

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
      className="bg-white rounded-3xl px-4 py-4 mx-4 mt-5"
      style={{
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View className="flex-row items-center gap-1.5 mb-3">
        <Crown color="#d97706" size={15} />
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
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
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#f1f5f9' }}
          >
            <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1 }}>
              <Icon color={g.color} size={14} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: g.color }}>
                {isCreole ? g.nameHt : g.name}
              </Text>
            </View>
            {rec ? (
              <Text style={{ fontSize: 13, color: '#64748b' }} numberOfLines={1}>
                {rec.displayName} ·{' '}
                <Text style={{ fontWeight: '800', color: '#0f172a' }}>{rec.score}</Text>
              </Text>
            ) : (
              <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: '#f1f5f9' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b' }}>
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
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const highScores: Record<string, number> = profile?.games?.highScores || {};
  const gamesPlayed: number = profile?.games?.gamesPlayed || 0;

  return (
    <ScrollView
      style={{ backgroundColor: '#f4f6fb' }}
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
          <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl py-3 border border-gray-100">
            <Zap color="#0857A6" size={16} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>{level.xp}</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>
              XP · {isCreole ? 'Nivo' : 'Niv.'} {level.level}
            </Text>
          </View>
          <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl py-3 border border-gray-100">
            <Flame color="#ef4444" size={16} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
              {streak?.currentStreak || 0}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>{isCreole ? 'Seri' : 'Série'}</Text>
          </View>
          <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl py-3 border border-gray-100">
            <Trophy color="#d97706" size={16} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>{gamesPlayed}</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>{isCreole ? 'Pati' : 'Parties'}</Text>
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
            <TouchableOpacity
              key={g.id}
              onPress={() => (g.id === 'trivia' ? onStartTrivia() : onSelectGame(g.id))}
              activeOpacity={0.85}
              style={{
                width: TILE_W,
                borderRadius: 22,
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
                  borderRadius: 14,
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
                    shadowColor: '#0f172a',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    elevation: 3,
                  }}
                >
                  <Trophy color={g.color} size={11} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: g.color }}>{hs}</Text>
                </View>
              )}

              <Text style={{ fontSize: 17, fontWeight: '800', color: '#ffffff', marginTop: 12 }}>
                {isCreole ? g.nameHt : g.name}
              </Text>
              <Text
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 4, flexGrow: 1 }}
                numberOfLines={3}
              >
                {isCreole ? g.descriptionHt : g.description}
              </Text>
              <View className="flex-row items-center gap-1 mt-2">
                <Clock color="rgba(255,255,255,0.85)" size={12} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
                  ~{g.minutes} min
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Community records */}
      <GameRecords isCreole={isCreole} />
    </ScrollView>
  );
}
