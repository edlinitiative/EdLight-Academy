import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CalendarCheck, Check } from 'lucide-react-native';

const AZURE = '#0857A6';

/**
 * "Défi du jour" banner — a shared once-a-day round (same 10 questions for
 * everyone) worth a +50 XP bonus. Collapses to a "done" state after playing.
 */
export default function DailyChallengeBanner({
  daily,
  isCreole,
  onStart,
  style,
}: {
  daily: { completedToday?: boolean; score?: number | null; total?: number | null } | null;
  isCreole: boolean;
  onStart: () => void;
  style?: object;
}) {
  const done = !!daily?.completedToday;
  return (
    <TouchableOpacity
      activeOpacity={done ? 1 : 0.85}
      disabled={done}
      onPress={() => {
        if (!done) onStart();
      }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          borderRadius: 16,
          backgroundColor: done ? '#eef2f7' : AZURE,
          borderWidth: done ? 1 : 0,
          borderColor: '#e8edf5',
          ...(done
            ? {}
            : {
                shadowColor: AZURE,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 4,
              }),
        },
        style,
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? '#dbe3ee' : 'rgba(255,255,255,0.18)',
        }}
      >
        {done ? <Check color={AZURE} size={22} /> : <CalendarCheck color="#ffffff" size={22} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: done ? '#0f172a' : '#ffffff' }}>
          {isCreole ? 'Defi jodi a' : 'Défi du jour'}
        </Text>
        <Text style={{ fontSize: 12.5, marginTop: 2, color: done ? '#64748b' : 'rgba(255,255,255,0.88)' }}>
          {done
            ? isCreole
              ? `Fini — ${daily?.score}/${daily?.total}. Retounen demen !`
              : `Terminé — ${daily?.score}/${daily?.total}. Revenez demain !`
            : isCreole
            ? '10 kesyon · +50 XP bonis'
            : '10 questions · +50 XP bonus'}
        </Text>
      </View>
      {!done && (
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }}>
          {isCreole ? 'Jwe →' : 'Jouer →'}
        </Text>
      )}
    </TouchableOpacity>
  );
}
