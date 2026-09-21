import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import PressableScale from '../ui/PressableScale';
import { defaultAlias, isAcceptableAliasInput } from '../../../../shared/alias';
import { useColors, typeScale, radius } from '../../theme/theme';
import { tapMedium } from '../../utils/haptics';

/**
 * Confirm the student's name before a tournament.
 *
 * ASKS FOR THE FULL NAME, SHOWS WHAT THE AUDIENCE WILL SEE. Ted's call,
 * 2026-09-21, on the first version of this sheet — which asked for the public
 * name directly: "you should ask them to put their full name, but we show them
 * what the audience will see — just first name."
 *
 * The two serve different purposes and the split is the point:
 *  · the FULL name is held because a prize winner has to prove their identity,
 *    and "Sandra" is not something anyone can prove;
 *  · the FIRST name is all that reaches a public broadcast, because most of
 *    this audience is under 18.
 *
 * The preview is live, so nobody discovers what the stream showed afterwards.
 */
export default function ArenaNameSheet({
  visible,
  fullName,
  isCreole,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** The full name on the account, or null when it has never been set. */
  fullName: string | null;
  isCreole: boolean;
  saving: boolean;
  onSave: (fullName: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(fullName ?? '');
  }, [visible, fullName]);

  // Exactly the server's derivation, so the preview cannot promise one thing
  // and the broadcast carry another.
  const audienceName = defaultAlias(value);
  const ok = !!audienceName && isAcceptableAliasInput(audienceName);

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
            {t('Ton nom complet', 'Non konplè ou')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {t(
              'Si tu gagnes, tu devras prouver ton identité — écris ton nom tel qu’il est sur tes papiers.',
              'Si w genyen, w ap gen pou pwouve ki moun ou ye — ekri non ou jan li ye sou papye ou yo.',
            )}
          </Text>

          <TextInput
            value={value}
            onChangeText={setValue}
            maxLength={80}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={t('Prénom et nom', 'Prenon ak siyati')}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t('Nom complet', 'Non konplè')}
            style={{
              borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
              padding: 14, color: colors.ink, backgroundColor: colors.surface,
              fontSize: 16,
            }}
          />

          {/* What the stream will actually show. Live, and never the full name. */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            padding: 12, borderRadius: radius.card,
            backgroundColor: colors.azureSoft, borderWidth: 1, borderColor: colors.azureBorder,
          }}>
            <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>
              {t('Le public verra', 'Piblik la ap wè')}
            </Text>
            <Text style={[typeScale.label, { color: audienceName ? colors.azure : colors.faint }]}>
              {audienceName ?? t('—', '—')}
            </Text>
          </View>

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
