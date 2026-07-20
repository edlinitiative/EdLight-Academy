import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Crown, Medal, Trophy, Pencil, ShieldCheck } from 'lucide-react-native';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useTrivia } from '../hooks/useTrivia';
import { isValidAlias } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useColors, useTheme } from '../theme/theme';
import Avatar from './ui/Avatar';
import LeaderboardJoinModal from './LeaderboardJoinModal';

function rankBadge(rank: number) {
  if (rank === 1) return { icon: <Crown size={16} color="#FFD700" />, bg: '#FFD70020', text: '#B8860B' };
  if (rank === 2) return { icon: <Medal size={16} color="#A0A0A0" />, bg: '#C0C0C020', text: '#808080' };
  if (rank === 3) return { icon: <Medal size={16} color="#CD7F32" />, bg: '#CD7F3220', text: '#8B4513' };
  return { icon: null, bg: 'transparent', text: '#6b7280' };
}

function EntryRow({ entry, isMe, compact = false }: { entry: any; isMe: boolean; compact?: boolean }) {
  const colors = useColors();
  const { language } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const badge = rankBadge(entry.rank);

  return (
    <View
      className="flex-row items-center py-2.5 px-3 rounded-xl mb-1.5"
      style={isMe
        ? { backgroundColor: colors.azureSoft, borderWidth: 1, borderColor: colors.azure }
        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      {/* Rank badge */}
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: badge.bg }}
      >
        {badge.icon ?? (
          <Text className="text-xs font-bold" style={{ color: colors.muted }}>{entry.rank}</Text>
        )}
      </View>

      {/* Avatar — the same seeded robot used across the app (not initials) */}
      <View className="mr-2.5">
        <Avatar name={entry.displayName || ''} seed={entry.id || entry.uid || entry.displayName || ''} size={32} />
      </View>

      {/* Name + city · school (parity with the web leaderboard) */}
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${isMe ? 'text-blue-800 dark:text-[#4C9AF5]' : 'text-gray-900 dark:text-slate-100'}`} numberOfLines={1}>
          {entry.displayName || t('Élève', 'Elèv')}
          {isMe ? t(' (vous)', ' (ou)') : ''}
        </Text>
        {!compact && (entry.city || entry.school) && (
          <Text className="text-xs text-gray-400 dark:text-slate-500" numberOfLines={1}>
            {[entry.city, entry.school].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* XP */}
      <View className="items-end">
        <Text className="text-sm font-bold" style={{ color: colors.azure }}>{entry.xp ?? 0}</Text>
        <Text className="text-xs text-gray-400 dark:text-slate-500">XP</Text>
      </View>
    </View>
  );
}

interface LeaderboardProps {
  compact?: boolean;
  maxRows?: number;
}

export default function Leaderboard({ compact = false, maxRows = 10 }: LeaderboardProps) {
  const { language, toggleAuthModal } = useStore();
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const { entries, myEntry, myRank, isLoading } = useLeaderboard(maxRows, compact ? 'week' : period);
  const { profile, isAuthed } = useTrivia();
  const [showJoin, setShowJoin] = useState(false);
  const myUid = myEntry?.id;

  const optedIn = !!profile?.leaderboard?.optedIn;
  // Opted in but no usable pseudo → hidden from the board; prompt to fix.
  const needsAlias = optedIn && !isValidAlias(profile?.leaderboard?.displayName);

  const displayList = entries.slice(0, maxRows);

  const cardStyle = { ...cardSurface, padding: 16 };

  const joinFooter = isAuthed && !compact && (
    <>
      {needsAlias ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.warn + '1A' }}
        >
          <Pencil size={14} color={colors.warn} />
          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.warn }}>
            {t(
              'Il vous manque un pseudo — choisissez-en un pour apparaître.',
              'Ou manke yon ti non — chwazi youn pou parèt.',
            )}
          </Text>
        </TouchableOpacity>
      ) : optedIn ? (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'center' }}
        >
          <Pencil size={12} color={colors.muted} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>
            {t('Modifier mon pseudo, mon école ou ma ville', 'Chanje ti non, lekòl oswa vil mwen')}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setShowJoin(true)}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.azure }}
        >
          <ShieldCheck size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>
            {t('Rejoindre le classement', 'Antre nan klasman')}
          </Text>
        </TouchableOpacity>
      )}
      <LeaderboardJoinModal visible={showJoin} onClose={() => setShowJoin(false)} />
    </>
  );

  // Signed-out students see the board but can't join → give them a way in.
  const guestFooter = !isAuthed && !compact && (
    <TouchableOpacity
      onPress={toggleAuthModal}
      activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.azure }}
    >
      <ShieldCheck size={15} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>
        {t('Se connecter pour jouer', 'Konekte pou jwe')}
      </Text>
    </TouchableOpacity>
  );

  const header = !compact && (
    <>
      <View className="flex-row items-center gap-2 mb-3">
        <Trophy color={colors.azure} size={18} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>
          {period === 'all' ? t('Classement général', 'Klasman jeneral') : t('Classement de la semaine', 'Klasman semèn nan')}
        </Text>
        {myRank && (
          <View className="ml-auto px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.azureSoft }}>
            <Text className="text-xs font-bold" style={{ color: colors.azure }}>#{myRank}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {(['week', 'all'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            activeOpacity={0.8}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: period === p ? colors.surface : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: period === p ? colors.azure : colors.muted }}>
              {p === 'week' ? t('Cette semaine', 'Semèn sa a') : t('Tous les temps', 'Tout tan')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  if (isLoading) {
    return (
      <View style={{ ...cardStyle, alignItems: 'center', paddingVertical: 32 }}>
        <Text style={{ color: colors.faint, fontSize: 14 }}>{t('Chargement…', 'Ap chaje…')}</Text>
      </View>
    );
  }

  if (displayList.length === 0) {
    return (
      <View style={{ ...cardStyle, alignItems: 'center', paddingVertical: 24 }}>
        {header}
        <Trophy color={colors.faint} size={32} />
        <Text style={{ color: colors.faint, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {period === 'all'
            ? t('Aucune entrée pour le moment.', 'Poko gen antre.')
            : t('Aucune entrée cette semaine.\nJoue pour apparaître !', 'Poko gen antre semèn sa a.\nJwe pou ou parèt !')}
        </Text>
        {joinFooter}
        {guestFooter}
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      {header}
      {displayList.map((entry: any) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isMe={entry.id === myUid}
          compact={compact}
        />
      ))}
      {myEntry && !displayList.find((e: any) => e.id === myUid) && (
        <View className="border-t border-dashed border-gray-200 dark:border-slate-700 mt-1 pt-2">
          <EntryRow entry={myEntry} isMe compact={compact} />
        </View>
      )}
      {joinFooter}
      {guestFooter}
    </View>
  );
}
