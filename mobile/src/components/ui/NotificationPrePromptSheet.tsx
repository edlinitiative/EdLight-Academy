import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Bell, BellOff } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useColors, typeScale, radius, touch } from '../../theme/theme';
import { useReduceMotion, modalAnimation } from '../../utils/motion';
import { usePromptState, registerPromptHost } from '../../settings/notificationPrompt';
import { prePromptCopy } from '../../settings/notificationPermission';

/**
 * The short explanation shown BEFORE the system notification dialog, or the
 * "Ouvrir les réglages" path after a denial (audit #9). Driven entirely by
 * notificationService.askForNotifications — render it once, anywhere inside
 * the app (only the first mounted instance renders; extras stay inert, so a
 * second mount point during a migration is harmless).
 */
export default function NotificationPrePromptSheet() {
  const colors = useColors();
  const reduce = useReduceMotion();
  const isCreole = useStore((s) => s.language) === 'ht';
  const request = usePromptState((s) => s.request);
  const [primary, setPrimary] = useState(false);
  const claimed = useRef(false);

  useEffect(() => {
    // First mounted instance owns rendering.
    if (!hostClaimed) {
      hostClaimed = true;
      claimed.current = true;
      setPrimary(true);
    }
    const unregister = registerPromptHost();
    return () => {
      unregister();
      if (claimed.current) hostClaimed = false;
    };
  }, []);

  if (!primary) return null;

  const copy = request ? prePromptCopy(request.reason, request.mode, isCreole) : null;
  const Icon = request?.mode === 'settings' ? BellOff : Bell;

  return (
    <Modal
      visible={!!request}
      transparent
      animationType={modalAnimation(reduce)}
      statusBarTranslucent
      onRequestClose={() => request?.resolve(false)}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll} bounces={false} style={{ width: '100%' }}>
          {copy ? (
            <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={[styles.icon, { backgroundColor: colors.azureSoft }]}>
                <Icon color={colors.azure} size={26} />
              </View>
              <Text accessibilityRole="header" style={[typeScale.h2, styles.center, { color: colors.ink }]}>
                {copy.title}
              </Text>
              <Text style={[typeScale.instruction, styles.center, { color: colors.muted, marginTop: 8 }]}>
                {copy.body}
              </Text>
              <TouchableOpacity
                onPress={() => request?.resolve(true)}
                accessibilityRole="button"
                accessibilityLabel={copy.confirm}
                style={[styles.primary, { backgroundColor: colors.azureFill }]}
              >
                <Text style={[typeScale.action, { color: '#ffffff' }]}>{copy.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => request?.resolve(false)}
                accessibilityRole="button"
                accessibilityLabel={copy.cancel}
                style={styles.secondary}
              >
                <Text style={[typeScale.action, { color: colors.muted }]}>{copy.cancel}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

let hostClaimed = false;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.hero, padding: 24, alignItems: 'center' },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  center: { textAlign: 'center' },
  primary: {
    alignSelf: 'stretch', borderRadius: radius.pill, minHeight: touch.min + 4,
    alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingHorizontal: 16,
  },
  secondary: { alignSelf: 'stretch', minHeight: touch.min, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
