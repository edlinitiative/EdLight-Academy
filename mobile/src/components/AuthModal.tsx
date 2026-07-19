import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import useStore from '../contexts/store';
import AuthScreen from '../screens/AuthScreen';

export default function AuthModal() {
  const showAuthModal = useStore((s) => s.showAuthModal);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const guestInteractionCount = useStore((s) => s.guestInteractionCount);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const visible = showAuthModal && !isAuthenticated;
  const dismissable = guestInteractionCount < 5;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={dismissable ? () => setShowAuthModal(false) : undefined}
    >
      <View style={{ flex: 1 }}>
        {!dismissable && (
          <View style={{ backgroundColor: '#1B6FE0', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {t('Crée un compte gratuit pour continuer', 'Kreye yon kont gratis pou kontinye')}
            </Text>
            <Text style={{ color: '#93c5fd', fontSize: 13, marginTop: 3 }}>
              {t(
                "Tu as atteint la limite d'exploration — inscris-toi pour garder ta progression.",
                'Ou rive nan limit eksplorasyon an — enskri pou konsève pwogrè ou.',
              )}
            </Text>
          </View>
        )}

        {dismissable && (
          <TouchableOpacity
            onPress={() => setShowAuthModal(false)}
            style={{
              position: 'absolute',
              top: 56,
              right: 16,
              zIndex: 100,
              padding: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(243,244,246,0.92)',
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X color="#374151" size={20} />
          </TouchableOpacity>
        )}

        <AuthScreen />
      </View>
    </Modal>
  );
}
