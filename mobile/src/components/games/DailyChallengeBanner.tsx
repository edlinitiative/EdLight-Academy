import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarCheck, Check, ChevronRight } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { useColors, radius } from '../../theme/theme';

/**
 * "Défi du jour" banner — a shared once-a-day round (same 10 questions for
 * everyone) worth a +50 XP bonus. Active state is a gradient hero card (matching
 * the app's 2026 language); collapses to a calm "done" state after playing.
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
  const colors = useColors();
  const done = !!daily?.completedToday;

  // Done → a quiet, settled card so the eye moves on to the categories.
  if (done) {
    return (
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            borderRadius: 18,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
          <Check color={colors.azure} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
            {isCreole ? 'Defi jodi a' : 'Défi du jour'}
          </Text>
          <Text style={{ fontSize: 12.5, marginTop: 2, color: colors.muted }}>
            {isCreole
              ? `Fini — ${daily?.score}/${daily?.total}. Retounen demen !`
              : `Terminé — ${daily?.score}/${daily?.total}. Revenez demain !`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={isCreole ? 'Jwe defi jodi a' : 'Jouer le défi du jour'}
      style={[
        {
          borderRadius: 18,
          overflow: 'hidden',
          shadowColor: colors.azure,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.28,
          shadowRadius: 14,
          elevation: 5,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['#2E86F0', '#1B6FE0', '#0857A6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
          }}
        >
          <CalendarCheck color="#ffffff" size={23} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#ffffff' }}>
            {isCreole ? 'Defi jodi a' : 'Défi du jour'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)' }}>
              {isCreole ? '10 kesyon' : '10 questions'}
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.chip, paddingHorizontal: 7, paddingVertical: 1.5 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fde68a' }}>+50 XP</Text>
            </View>
          </View>
        </View>
        {/* Frosted CTA chip — a clearer tap target than a bare arrow. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.chip, paddingLeft: 12, paddingRight: 8, paddingVertical: 7 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#ffffff' }}>
            {isCreole ? 'Jwe' : 'Jouer'}
          </Text>
          <ChevronRight color="#ffffff" size={16} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}
