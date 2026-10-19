import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { GRADES } from '../../../../shared/trackConfig';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { select } from '../../utils/haptics';

/**
 * Pick a class, from the Arena lobby.
 *
 * The same list as onboarding (`shared/trackConfig`'s GRADES) rather than a
 * tournament-specific one, because this writes the student's actual profile
 * grade — the one that drives adaptive content everywhere else. A separate
 * "Arena class" would be a second answer to a question the student has already
 * been asked, and the two would disagree.
 *
 * POSTBAC is SHOWN, not hidden. A post-bac student is ineligible for this
 * tournament, and the honest way to say that is to let them see their real
 * answer selected with the consequence written next to it — not to omit the
 * option and leave them wondering why their class is missing.
 *
 * Night palette (Arène): opaque tonal steps; the picked row is a wash + check.
 */
export default function ArenaGradeSheet({
  visible,
  current,
  isCreole,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: string | null;
  isCreole: boolean;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(2, 6, 18, 0.72)' }}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel={t('Fermer', 'Fèmen')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: Math.max(34, insets.bottom + 12),
          gap: 14,
          maxHeight: '75%',
        }}
      >
        <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>
          {t('Ta classe', 'Klas ou')}
        </Text>
        <Text style={[arenaType.body, { color: C.muted }]}>
          {t(
            'Le championnat est réservé au primaire et au secondaire.',
            'Chanpyona a se pou primè ak segondè.',
          )}
        </Text>

        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {GRADES.map((g) => {
            const picked = current === g.code;
            const ineligible = g.code === 'POSTBAC';
            return (
              <PressableScale
                key={g.code}
                onPress={() => { select(); onPick(g.code); onClose(); }}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityState={{ selected: picked }}
                accessibilityLabel={`${isCreole ? g.labelHt : g.label}${ineligible ? t(', pas éligible au championnat', ', pa kalifye pou chanpyona a') : ''}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
                  paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
                  backgroundColor: picked ? C.signalSoft : C.surfaceRaised,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[arenaType.name, { color: C.ink }]}>
                    {isCreole ? g.labelHt : g.label}
                  </Text>
                  {ineligible ? (
                    <Text style={[arenaType.status, { color: C.muted }]}>
                      {t('Pas éligible au championnat', 'Pa kalifye pou chanpyona a')}
                    </Text>
                  ) : null}
                </View>
                {picked ? <Check color={C.ink} size={18} /> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
