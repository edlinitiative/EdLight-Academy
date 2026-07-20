import React, { useState } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';

export default function WelcomeLanguageModal() {
  const hydrated = useStore((s) => s.hydrated);
  const languageChosen = useStore((s) => s.languageChosen);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const setLanguageChosen = useStore((s) => s.setLanguageChosen);
  const colors = useColors();

  const [selected, setSelected] = useState<string>(language || 'fr');

  const visible = hydrated && !languageChosen;

  const handleSelect = (lang: string) => {
    setSelected(lang);
    setLanguage(lang);
  };

  const handleConfirm = () => {
    setLanguage(selected);
    setLanguageChosen(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={[styles.title, { color: colors.ink }]}>Choisissez votre langue</Text>
          <Text style={[styles.titleSecondary, { color: colors.muted }]}>Chwazi lang ou</Text>
          <Text style={[styles.subtitle, { color: colors.faint }]}>
            Vous pouvez la changer à tout moment dans votre profil.
          </Text>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }, selected === 'fr' && { borderColor: colors.azure }]}
              onPress={() => handleSelect('fr')}
              activeOpacity={0.7}
            >
              <Text style={styles.flagEmoji}>🇫🇷</Text>
              <Text style={[styles.optionText, { color: colors.ink }, selected === 'fr' && { color: colors.azure, fontWeight: '600' }]}>
                Français
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }, selected === 'ht' && { borderColor: colors.azure }]}
              onPress={() => handleSelect('ht')}
              activeOpacity={0.7}
            >
              <Text style={styles.flagEmoji}>🇭🇹</Text>
              <Text style={[styles.optionText, { color: colors.ink }, selected === 'ht' && { color: colors.azure, fontWeight: '600' }]}>
                Kreyòl Ayisyen
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.confirmButton, { backgroundColor: colors.azure }]} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={styles.confirmButtonText}>Continuer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  titleSecondary: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  optionsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  option: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e8edf5',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionSelected: {
    borderColor: '#1B6FE0',
  },
  flagEmoji: {
    fontSize: 24,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  optionTextSelected: {
    color: '#1B6FE0',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#1B6FE0',
    borderRadius: 14,
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
