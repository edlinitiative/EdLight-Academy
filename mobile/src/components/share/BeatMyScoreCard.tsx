import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Swords, Send } from 'lucide-react-native';
import { shareScore, shareScoreWhatsApp } from '../../services/scoreShare';
import { logInviteSent } from '../../services/referralService';
import { useColors, typeScale } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';
import { tapMedium } from '../../utils/haptics';
import useStore from '../../contexts/store';
import { arenaColors as N } from '../../theme/arenaTheme';

/**
 * "Défie un ami de battre ton score" — the duel prompt, offered at the moment a
 * score is fresh.
 *
 * `scoreShare` already builds exactly the right message ("Tu peux me battre ?"
 * with the referral code and link baked in, so every brag is an invite) and has
 * a WhatsApp fast path. It was only ever wired to exam results and the Jeux hub
 * — never to finishing a QUIZ, which is the most frequent completion in the app
 * and therefore the peak worth spending.
 *
 * Two buttons rather than one: WhatsApp is where Haitian students actually talk,
 * so it leads; the native sheet is the fallback for everyone else.
 *
 * `variant="night"` sits on the Jeux night (opaque tonal, no outline);
 * "surface" is for light cards. ("glass" is the retired name for night.)
 */
export default function BeatMyScoreCard({
  title,
  score,
  total,
  asPercent = false,
  variant = 'surface',
  source = 'other',
}: {
  /** What was scored, already localized — e.g. "Chimie NS1". */
  title: string;
  score: number;
  total?: number;
  asPercent?: boolean;
  variant?: 'night' | 'glass' | 'surface';
  /** Which surface the challenge came from, for funnel measurement. */
  source?: 'quiz' | 'exam' | 'game' | 'other';
}) {
  const colors = useColors();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [busy, setBusy] = useState<'wa' | 'any' | null>(null);
  const glass = variant === 'glass' || variant === 'night';

  const lang: 'fr' | 'ht' = isCreole ? 'ht' : 'fr';
  const opts = { title, score, total, asPercent, lang };

  const run = async (which: 'wa' | 'any') => {
    if (busy) return;
    tapMedium();
    setBusy(which);
    try {
      await (which === 'wa' ? shareScoreWhatsApp(opts) : shareScore(opts));
      logInviteSent(source);
    } finally {
      setBusy(null);
    }
  };

  const ink = glass ? N.ink : colors.ink;
  const sub = glass ? N.muted : colors.muted;
  const scoreStr = asPercent ? `${score}%` : total != null ? `${score}/${total}` : `${score}`;

  return (
    <View
      style={{
        width: '100%',
        borderRadius: glass ? 20 : 16,
        padding: glass ? 18 : 14,
        gap: 12,
        backgroundColor: glass ? N.surface : colors.surface,
        // Opaque, no ring: it sits inside a result screen that already has its
        // one primary — this card's actions are tonal.
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Swords color={glass ? N.coral : colors.azure} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.label, { color: ink }]}>
            {t('Défie un ami', 'Defye yon zanmi')}
          </Text>
          <Text style={[typeScale.caption, { color: sub }]}>
            {t(`Qui peut battre ton ${scoreStr} ?`, `Kiyès ki ka bat ${scoreStr} ou a ?`)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale
          onPress={() => run('wa')}
          accessibilityRole="button"
          accessibilityLabel={t('Défier sur WhatsApp', 'Defye sou WhatsApp')}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 7, minHeight: 48, borderRadius: glass ? 999 : 12,
            backgroundColor: glass ? N.secondary : colors.azureSoft,
          }}
        >
          {busy === 'wa' ? (
            <ActivityIndicator size="small" color={glass ? N.ink : colors.azure} />
          ) : (
            <>
              <Send color={glass ? N.ink : colors.azure} size={16} />
              <Text style={[typeScale.label, { fontFamily: typeScale.titleSm.fontFamily, color: glass ? N.ink : colors.azure }]}>WhatsApp</Text>
            </>
          )}
        </PressableScale>

        <PressableScale
          onPress={() => run('any')}
          accessibilityRole="button"
          accessibilityLabel={t('Partager ailleurs', 'Pataje lòt kote')}
          style={{
            paddingHorizontal: 18, minHeight: 48, borderRadius: glass ? 999 : 12,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: glass ? N.secondary : colors.surfaceAlt,
          }}
        >
          {busy === 'any' ? (
            <ActivityIndicator size="small" color={glass ? N.ink : colors.azure} />
          ) : (
            <Text style={[typeScale.label, { color: ink }]}>{t('Autre', 'Lòt')}</Text>
          )}
        </PressableScale>
      </View>
    </View>
  );
}
