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
import { X, Gift, Share2, Copy, MessageCircle, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../theme/theme';
import { getReferralCode, inviteMessage, type ReferralCode } from '../services/referralService';
import * as haptics from '../utils/haptics';

interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  lang: 'fr' | 'ht';
}

export default function InviteSheet({ visible, onClose, lang }: InviteSheetProps) {
  const { colors, radius, shadow } = useTheme();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,12,24,0.55)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('Fermer', 'Fèmen')} />
        <View
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
          {/* grabber */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
              <Gift color={colors.azure} size={20} />
            </View>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.ink }}>
              {t('Inviter des amis', 'Envite zanmi')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')}>
              <X color={colors.faint} size={22} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13.5, color: colors.muted, lineHeight: 19, marginBottom: 16 }}>
            {t(
              'Vous et votre ami gagnez un bonus quand il s’inscrit avec votre code : +1 gel de série et des XP chacun.',
              'Ou menm ak zanmi ou chak ap genyen yon bonus lè li enskri ak kòd ou : +1 jèl seri ak XP pou chak.',
            )}
          </Text>

          {loading ? (
            <View style={{ height: 92, borderRadius: radius.card, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.azure} />
            </View>
          ) : failed || !data ? (
            <TouchableOpacity
              onPress={load}
              activeOpacity={0.85}
              style={{ height: 92, borderRadius: radius.card, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'row' }}
            >
              <RefreshCw color={colors.azure} size={16} />
              <Text style={{ color: colors.azure, fontWeight: '700', fontSize: 14 }}>
                {t('Réessayer', 'Eseye ankò')}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Code card */}
              <TouchableOpacity
                onPress={copyCode}
                activeOpacity={0.8}
                style={{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.azureBorder, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', ...shadow.sm }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {t('Votre code', 'Kòd ou')}
                </Text>
                <Text style={{ fontSize: 30, fontWeight: '800', color: colors.azure, letterSpacing: 4 }}>
                  {data.code}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Copy color={colors.faint} size={13} />
                  <Text style={{ fontSize: 12, color: colors.faint }}>{t('Appuyez pour partager le code', 'Peze pou pataje kòd la')}</Text>
                </View>
              </TouchableOpacity>

              {/* Actions */}
              <TouchableOpacity
                onPress={shareWhatsApp}
                activeOpacity={0.9}
                style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#25D366', borderRadius: radius.control, paddingVertical: 15 }}
              >
                <MessageCircle color="#fff" size={18} />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('Partager sur WhatsApp', 'Pataje sou WhatsApp')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={shareNative}
                activeOpacity={0.9}
                style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.control, paddingVertical: 14 }}
              >
                <Share2 color={colors.azure} size={18} />
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{t('Partager', 'Pataje')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
