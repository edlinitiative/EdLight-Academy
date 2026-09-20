import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { GRADES } from '../../../../shared/trackConfig';
import { useColors, typeScale, radius } from '../../theme/theme';
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
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' }}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel={t('Fermer', 'Fèmen')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.hero,
          borderTopRightRadius: radius.hero,
          padding: 18,
          paddingBottom: 30,
          gap: 12,
          maxHeight: '75%',
        }}
      >
        <Text style={[typeScale.title, { color: colors.ink }]}>
          {t('Ta classe', 'Klas ou')}
        </Text>
        <Text style={[typeScale.caption, { color: colors.muted }]}>
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
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  padding: 14, borderRadius: radius.card,
                  backgroundColor: picked ? colors.azureSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: picked ? colors.azureBorder : colors.border,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typeScale.label, { color: colors.ink }]}>
                    {isCreole ? g.labelHt : g.label}
                  </Text>
                  {ineligible ? (
                    <Text style={[typeScale.micro, { color: colors.muted }]}>
                      {t('Pas éligible au championnat', 'Pa kalifye pou chanpyona a')}
                    </Text>
                  ) : null}
                </View>
                {picked ? <Check color={colors.azure} size={16} /> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
