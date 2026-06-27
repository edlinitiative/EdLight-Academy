import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Crown, Medal, Trophy } from 'lucide-react-native';
import { useLeaderboard } from '../hooks/useLeaderboard';

function rankBadge(rank: number) {
  if (rank === 1) return { icon: <Crown size={16} color="#FFD700" />, bg: '#FFD70020', text: '#B8860B' };
  if (rank === 2) return { icon: <Medal size={16} color="#A0A0A0" />, bg: '#C0C0C020', text: '#808080' };
  if (rank === 3) return { icon: <Medal size={16} color="#CD7F32" />, bg: '#CD7F3220', text: '#8B4513' };
  return { icon: null, bg: 'transparent', text: '#6b7280' };
}

function EntryRow({ entry, isMe, compact = false }: { entry: any; isMe: boolean; compact?: boolean }) {
  const badge = rankBadge(entry.rank);
  const initials = String(entry.displayName || '?')
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View
      className={`flex-row items-center py-2.5 px-3 rounded-xl mb-1.5 ${isMe ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100'}`}
    >
      {/* Rank badge */}
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: badge.bg }}
      >
        {badge.icon ?? (
          <Text className="text-xs font-bold" style={{ color: badge.text }}>{entry.rank}</Text>
        )}
      </View>

      {/* Avatar */}
      <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center mr-2.5">
        <Text className="text-xs font-bold text-primary-700">{initials}</Text>
      </View>

      {/* Name + school */}
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${isMe ? 'text-blue-800' : 'text-gray-900'}`} numberOfLines={1}>
          {entry.displayName || 'Élève'}
          {isMe ? ' (vous)' : ''}
        </Text>
        {!compact && entry.school && (
          <Text className="text-xs text-gray-400" numberOfLines={1}>{entry.school}</Text>
        )}
      </View>

      {/* XP */}
      <View className="items-end">
        <Text className="text-sm font-bold text-amber-600">{entry.xp ?? 0}</Text>
        <Text className="text-xs text-gray-400">XP</Text>
      </View>
    </View>
  );
}

interface LeaderboardProps {
  compact?: boolean;
  maxRows?: number;
}

export default function Leaderboard({ compact = false, maxRows = 10 }: LeaderboardProps) {
  const { entries, myEntry, myRank, isLoading } = useLeaderboard(maxRows);
  const myUid = myEntry?.id;

  const displayList = entries.slice(0, maxRows);

  if (isLoading) {
    return (
      <View className="bg-white rounded-2xl p-4 shadow-sm items-center py-8">
        <Text className="text-gray-400 text-sm">Chargement…</Text>
      </View>
    );
  }

  if (displayList.length === 0) {
    return (
      <View className="bg-white rounded-2xl p-4 shadow-sm items-center py-6">
        <Trophy color="#d1d5db" size={32} />
        <Text className="text-gray-400 text-sm mt-2 text-center">
          Aucune entrée cette semaine.{'\n'}Joue au Trivia pour apparaître !
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-2xl p-4 shadow-sm">
      {!compact && (
        <View className="flex-row items-center gap-2 mb-3">
          <Trophy color="#f59e0b" size={18} />
          <Text className="font-bold text-gray-900 text-base">Classement de la semaine</Text>
          {myRank && (
            <View className="ml-auto bg-amber-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs font-bold text-amber-700">#{myRank}</Text>
            </View>
          )}
        </View>
      )}
      {displayList.map((entry: any) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isMe={entry.id === myUid}
          compact={compact}
        />
      ))}
      {myEntry && !displayList.find((e: any) => e.id === myUid) && (
        <View className="border-t border-dashed border-gray-200 mt-1 pt-2">
          <EntryRow entry={myEntry} isMe compact={compact} />
        </View>
      )}
    </View>
  );
}
