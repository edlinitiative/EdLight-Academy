/**
 * InviteSheet — the "Inviter des amis" bottom sheet.
 * ──────────────────────────────────────────────────
 * Opened from ProfileScreen. On mount it fetches the caller's referral code
 * (GET /api/referrals/code, shown with a skeleton while loading), then presents
 * the code + link with three actions: share on WhatsApp, the native share
 * sheet, and copy (via the share sheet, since expo-clipboard isn't installed).
 *
 * Fully themed (useTheme) and bilingual (t). Best-effort throughout — a failed
 * fetch shows a gentle retry, never a crash.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Share, Linking, ActivityIndicator,
} from 'react-native';
import { X, Share2, Copy, MessageCircle, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../theme/theme';
import Button from './ui/Button';
import { useReduceMotion } from '../utils/motion';
import { getReferralCode, inviteMessage, type ReferralCode } from '../services/referralService';
import * as haptics from '../utils/haptics';

interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  lang: 'fr' | 'ht';
}

export default function InviteSheet({ visible, onClose, lang }: InviteSheetProps) {
  const { colors, radius, shadow, typeScale, cardSurface, featureSurface, isDark } = useTheme();
  const reduce = useReduceMotion();
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);

  const [data, setData] = useState<ReferralCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    const res = await getReferralCode();
    setData(res);
    setFailed(!res);
    setLoading(false);
  }

  useEffect(() => {
    if (visible && !data) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const message = data ? inviteMessage(data.code, data.link, lang) : '';

  async function shareWhatsApp() {
    if (!data) return;
    haptics.tapMedium();
    const encoded = encodeURIComponent(message);
    const scheme = `whatsapp://send?text=${encoded}`;
    const web = `https://wa.me/?text=${encoded}`;
    try {
      const canWhatsApp = await Linking.canOpenURL(scheme);
      await Linking.openURL(canWhatsApp ? scheme : web);
    } catch {
      try { await Linking.openURL(web); } catch { /* give up silently */ }
    }
  }

  async function shareNative() {
    if (!data) return;
    haptics.tapLight();
    try { await Share.share({ message }); } catch { /* user cancelled */ }
  }

  async function copyCode() {
    if (!data) return;
    haptics.tapLight();
    // No clipboard module bundled — the share sheet is the copy affordance.
    try { await Share.share({ message: data.code }); } catch { /* cancelled */ }
  }

  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('Fermer', 'Fèmen')} />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.hero,
            borderTopRightRadius: radius.hero,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 34,
            ...shadow.lg,
          }}
        >
          {/* grabber — decorative, hidden from screen readers */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginBottom: 14 }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Text accessibilityRole="header" style={[typeScale.section, { flex: 1, color: colors.ink }]}>
              {t('Inviter des amis', 'Envite zanmi')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
            >
              <X color={colors.muted} size={20} />
            </TouchableOpacity>
          </View>

          <Text style={[typeScale.body, { color: colors.muted, marginBottom: 18 }]}>
            {t(
              'Ton ami et toi gagnez un bonus quand il s’inscrit avec ton code : +1 gel de série et des XP chacun.',
              'Ou menm ak zanmi ou chak ap genyen yon bonus lè li enskri ak kòd ou : +1 jèl seri ak XP pou chak.',
            )}
          </Text>

          {loading ? (
            <View style={[cardSurface, { height: 120, alignItems: 'center', justifyContent: 'center' }]}>
              <ActivityIndicator color={colors.azure} />
            </View>
          ) : failed || !data ? (
            <View style={[cardSurface, { padding: 20, alignItems: 'center', gap: 14 }]}>
              <Text style={[typeScale.body, { color: colors.ink, textAlign: 'center' }]}>
                {t('Ton code n’a pas pu être chargé.', 'Nou pa t ka chaje kòd ou.')}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                label={t('Réessayer', 'Eseye ankò')}
                icon={<RefreshCw color={isDark ? colors.ink : colors.azureInk} size={16} />}
                onPress={load}
              />
            </View>
          ) : (
            <>
              {/* Code card */}
              <TouchableOpacity
                onPress={copyCode}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${t('Ton code', 'Kòd ou')} ${data.code}. ${t('Touche pour partager le code', 'Touche pou pataje kòd la')}`}
                style={[featureSurface, { paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' }]}
              >
                <Text style={[typeScale.meta, { color: colors.muted, marginBottom: 4 }]}>
                  {t('Ton code', 'Kòd ou')}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[typeScale.numeral, { color: colors.azureInk, letterSpacing: 4 }]}>
                  {data.code}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <Copy color={colors.muted} size={16} />
                  <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Touche pour partager le code', 'Touche pou pataje kòd la')}</Text>
                </View>
              </TouchableOpacity>

              {/* Actions — one primary. (WhatsApp green under white text was 2:1.) */}
              <Button
                size="lg"
                fullWidth
                label={t('Partager sur WhatsApp', 'Pataje sou WhatsApp')}
                icon={<MessageCircle color="#ffffff" size={20} />}
                onPress={shareWhatsApp}
                style={{ marginTop: 16 }}
              />
              <Button
                size="lg"
                fullWidth
                variant="secondary"
                label={t('Autres applis', 'Lòt aplikasyon')}
                icon={<Share2 color={isDark ? colors.ink : colors.azureInk} size={20} />}
                onPress={shareNative}
                style={{ marginTop: 10 }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
