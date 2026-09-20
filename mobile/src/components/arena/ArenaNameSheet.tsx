import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import PressableScale from '../ui/PressableScale';
import { isAcceptableAliasInput } from '../../../../shared/alias';
import { useColors, typeScale, radius } from '../../theme/theme';
import { tapMedium } from '../../utils/haptics';

/**
 * Edit the name that will appear on the Arena board.
 *
 * NOT the account name. What a public board shows is the leaderboard alias —
 * `leaderboards/all-time/entries/{uid}.displayName` — falling back to "Ted J."
 * derived from the account. This sheet writes that alias, which is the only
 * field a student can actually change about how they are named in public, and
 * the same one the weekly leaderboard uses. One name, one place.
 *
 * The default is shown as a suggestion rather than silently accepted, because
 * a student about to be on a stream in front of their school should get to
 * decide whether their surname initial is on it.
 */
export default function ArenaNameSheet({
  visible,
  current,
  suggestion,
  isCreole,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** The alias on file, or null when there is none yet. */
  current: string | null;
  /** What the board would show if they saved nothing — may be null. */
  suggestion: string | null;
  isCreole: boolean;
  saving: boolean;
  onSave: (alias: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(current ?? suggestion ?? '');
  }, [visible, current, suggestion]);

  const ok = isAcceptableAliasInput(value);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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
          }}
        >
          <Text style={[typeScale.title, { color: colors.ink }]}>
            {t('Ton nom sur le tableau', 'Non ou sou tablo a')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {t(
              'C’est ce que le public verra pendant la diffusion. Pas ton nom complet.',
              'Se sa piblik la ap wè pandan difizyon an. Pa non konplè ou.',
            )}
          </Text>

          <TextInput
            value={value}
            onChangeText={setValue}
            maxLength={24}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={suggestion ?? t('Ton prénom', 'Prenon ou')}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t('Nom affiché', 'Non ki parèt')}
            style={{
              borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
              padding: 14, color: colors.ink, backgroundColor: colors.surface,
              fontSize: 16,
            }}
          />

          <PressableScale
            onPress={() => { if (ok && !saving) { tapMedium(); onSave(value.trim()); } }}
            disabled={!ok || saving}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ok || saving }}
            style={{
              padding: 15, borderRadius: radius.card, alignItems: 'center',
              backgroundColor: ok && !saving ? colors.azure : colors.border,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[typeScale.label, { color: ok ? '#fff' : colors.faint }]}>
                {t('Enregistrer', 'Anrejistre')}
              </Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
