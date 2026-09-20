import React from 'react';
import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { useColors, typeScale, radius } from '../../theme/theme';
import { select } from '../../utils/haptics';

/**
 * One line of "this is who is about to be registered".
 *
 * From TestFlight feedback on build 58: the lobby asked a student to tick "je
 * confirme que ces informations sont exactes" while showing them exactly one
 * piece of information — their school. The name that would appear on the
 * public board and the class that decides eligibility were both invisible, and
 * both unchangeable from here. A student whose class was wrong got a disabled
 * button and a sentence that read like a general notice.
 *
 * So each fact gets a row, each row is tappable, and a row that is blocking
 * registration says so in its own words rather than in a footnote.
 */
export default function ArenaIdentityRow({
  icon,
  label,
  value,
  placeholder,
  problem,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  /** What is set today. Null renders `placeholder` in the muted tone. */
  value: string | null;
  placeholder: string;
  /** Why this row is stopping registration, in the student's language. */
  problem?: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const blocking = !!problem;

  return (
    <PressableScale
      onPress={() => { select(); onPress(); }}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      accessibilityHint={problem ?? undefined}
      style={{
        padding: 13,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: blocking ? colors.danger : colors.border,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[typeScale.micro, { color: colors.muted }]}>{label}</Text>
          <Text numberOfLines={1} style={[typeScale.label, { color: value ? colors.ink : colors.faint }]}>
            {value ?? placeholder}
          </Text>
        </View>
        <ChevronRight color={colors.faint} size={16} />
      </View>

      {problem ? (
        <Text style={[typeScale.caption, { color: colors.danger }]}>{problem}</Text>
      ) : null}
    </PressableScale>
  );
}
