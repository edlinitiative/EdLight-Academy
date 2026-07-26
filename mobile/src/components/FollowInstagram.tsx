/**
 * FollowInstagram — a tasteful, secondary "Suivez-nous sur Instagram" row.
 * ──────────────────────────────────────────────────────────────────────
 * Rendered on ProfileScreen near the invite / settings area (never the hero).
 * Deep-links into the Instagram app (instagram://user?username=…) when it's
 * installed, else opens the web profile — the same canOpenURL → openURL pattern
 * the WhatsApp share uses. Understated: one card row, not a banner. Bilingual.
 */

import React from 'react';
import { View, Text, Linking } from 'react-native';
import { Instagram, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import PressableScale from './ui/PressableScale';
import { useTheme, radius, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';

const IG_USERNAME = 'edlightacademy';
const IG_APP = `instagram://user?username=${IG_USERNAME}`;
const IG_WEB = `https://instagram.com/${IG_USERNAME}`;
// Instagram's signature magenta — reads on both light and dark grounds, used
// only for the glyph + a soft tint tile so the row stays secondary, not loud.
const IG_MAGENTA = '#E1306C';

export default function FollowInstagram() {
  const { colors, cardSurface } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  async function open() {
    tapLight();
    try {
      const canApp = await Linking.canOpenURL(IG_APP);
      await Linking.openURL(canApp ? IG_APP : IG_WEB);
    } catch {
      try { await Linking.openURL(IG_WEB); } catch { /* give up silently */ }
    }
  }

  return (
    <PressableScale
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('Suivez-nous sur Instagram, @edlightacademy', 'Swiv nou sou Instagram, @edlightacademy')}
      style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: IG_MAGENTA + '1A' }}>
        <Instagram color={IG_MAGENTA} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Suivez-nous sur Instagram', 'Swiv nou sou Instagram')}</Text>
        <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>@edlightacademy</Text>
      </View>
      <ChevronRight color={colors.faint} size={18} />
    </PressableScale>
  );
}
