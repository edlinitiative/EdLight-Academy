/**
 * FollowInstagram — a tasteful, secondary "Suivez-nous sur Instagram" row.
 * ──────────────────────────────────────────────────────────────────────
 * Rendered on ProfileScreen near the invite / settings area (never the hero).
 * Deep-links into the Instagram app (instagram://user?username=…) when it's
 * installed, else opens the web profile — the same canOpenURL → openURL pattern
 * the WhatsApp share uses. Understated: one card row, not a banner. Bilingual.
 */

import React from 'react';
import { View, Text, Linking, TouchableOpacity } from 'react-native';
import { Instagram, ChevronRight, X } from 'lucide-react-native';
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

/** Open our Instagram profile — app deep-link first, web fallback. */
export async function openInstagram() {
  tapLight();
  try {
    const canApp = await Linking.canOpenURL(IG_APP);
    await Linking.openURL(canApp ? IG_APP : IG_WEB);
  } catch {
    try { await Linking.openURL(IG_WEB); } catch { /* give up silently */ }
  }
}

/**
 * One-time Home prompt shown once the student has real usage behind them
 * (see the engagement gate on DashboardScreen). Both actions mark it seen —
 * an ignored banner that reappears forever reads as spam, not community.
 */
export function FollowInstagramPrompt() {
  const { colors, cardSurface } = useTheme();
  const { language, igPromptSeen, setIgPromptSeen } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  if (igPromptSeen) return null;

  return (
    <View style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: IG_MAGENTA + '1A' }}>
        <Instagram color={IG_MAGENTA} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.titleSm, { color: colors.ink }]}>
          {t('Tu progresses bien 🎉', 'W ap pwogrese byen 🎉')}
        </Text>
        <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={2}>
          {t('Rejoins la communauté EdLight sur Instagram — astuces et annonces.',
             'Antre nan kominote EdLight sou Instagram — konsèy ak anons.')}
        </Text>
        <PressableScale
          onPress={() => { setIgPromptSeen(true); openInstagram(); }}
          accessibilityRole="button"
          accessibilityLabel={t('Suivre @edlightacademy', 'Swiv @edlightacademy')}
          style={{
            alignSelf: 'flex-start', marginTop: 8, borderRadius: 999,
            backgroundColor: IG_MAGENTA, paddingHorizontal: 14, paddingVertical: 7,
          }}
        >
          <Text style={[typeScale.label, { color: '#ffffff' }]}>
            {t('Suivre @edlightacademy', 'Swiv @edlightacademy')}
          </Text>
        </PressableScale>
      </View>
      <TouchableOpacity
        onPress={() => { tapLight(); setIgPromptSeen(true); }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('Fermer', 'Fèmen')}
        style={{ alignSelf: 'flex-start' }}
      >
        <X color={colors.faint} size={18} />
      </TouchableOpacity>
    </View>
  );
}

export default function FollowInstagram() {
  const { colors, cardSurface } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  return (
    <PressableScale
      onPress={openInstagram}
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
