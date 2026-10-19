import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultAlias, isAcceptableAliasInput } from '../../../../shared/alias';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { tapMedium } from '../../utils/haptics';
import { ArenaButton } from './ArenaKit';
import { modalAnimation, isReduceMotionOn } from '../../utils/motion';

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
 *
 * Night palette (Arène): opaque tonal steps, one flat coral primary.
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
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType={modalAnimation(isReduceMotionOn(), 'slide')} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity accessibilityRole="button"
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
          }}
        >
          <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>
            {t('Ton nom complet', 'Non konplè ou')}
          </Text>
          <Text style={[arenaType.body, { color: C.muted }]}>
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
            placeholderTextColor={C.faint}
            accessibilityLabel={t('Nom complet', 'Non konplè')}
            keyboardAppearance="dark"
            selectionColor={C.coral}
            style={{
              minHeight: 52, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
              color: C.ink, backgroundColor: C.surfaceAlt,
              fontFamily: fonts.regular, fontSize: 16,
            }}
          />

          {/* What the stream will actually show. Live, and never the full name. */}
          <View
            accessible
            accessibilityLabel={`${t('Le public verra', 'Piblik la ap wè')} ${audienceName ?? ''}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48,
              paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
              backgroundColor: C.surfaceRaised,
            }}
          >
            <Text style={[arenaType.status, { color: C.muted, flex: 1 }]}>
              {t('Le public verra', 'Piblik la ap wè')}
            </Text>
            <Text style={[arenaType.name, { color: audienceName ? C.ink : C.faint }]}>
              {audienceName ?? '—'}
            </Text>
          </View>

          <ArenaButton
            label={t('Enregistrer', 'Anrejistre')}
            onPress={() => { if (ok && !saving) { tapMedium(); onSave(value.trim()); } }}
            disabled={!ok}
            busy={saving}
            style={{ minHeight: 52 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
