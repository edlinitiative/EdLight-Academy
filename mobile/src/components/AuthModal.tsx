import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../contexts/store';
import { useColors, typeScale } from '../theme/theme';
import AuthScreen from '../screens/AuthScreen';
import { useReduceMotion } from '../utils/motion';

export default function AuthModal() {
  const showAuthModal = useStore((s) => s.showAuthModal);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const guestInteractionCount = useStore((s) => s.guestInteractionCount);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const language = useStore((s) => s.language);
  const colors = useColors();
  const reduce = useReduceMotion();
  // Root-provider insets (context crosses the Modal portal). The old fixed
  // top: 56 / paddingTop: 60 sat under the status bar on Dynamic Island phones.
  const insets = useSafeAreaInsets();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const visible = showAuthModal && !isAuthenticated;
  const dismissable = guestInteractionCount < 5;

  return (
    <Modal
      visible={visible}
      animationType={reduce ? 'none' : 'slide'}
      onRequestClose={dismissable ? () => setShowAuthModal(false) : undefined}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }} accessibilityViewIsModal>
        {!dismissable && (
          // A tonal note above the form, not a coloured band (and no white text
          // on `azure`, which is 2.9:1 in dark).
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12 }}>
            <View style={{ backgroundColor: colors.azureSoft, borderRadius: 18, padding: 16 }}>
            <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>
              {t('Crée un compte gratuit pour continuer', 'Kreye yon kont gratis pou kontinye')}
            </Text>
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>
              {t(
                "Tu as atteint la limite d'exploration. Inscris-toi pour garder ta progression.",
                'Ou rive nan limit eksplorasyon an : enskri pou konsève pwogrè ou.',
              )}
            </Text>
            </View>
          </View>
        )}

        {dismissable && (
          <TouchableOpacity
            onPress={() => setShowAuthModal(false)}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              right: 16,
              zIndex: 100,
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 22,
              backgroundColor: colors.surfaceAlt,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer', 'Fèmen')}
          >
            <X color={colors.ink} size={20} />
          </TouchableOpacity>
        )}

        <AuthScreen />
      </View>
    </Modal>
  );
}
