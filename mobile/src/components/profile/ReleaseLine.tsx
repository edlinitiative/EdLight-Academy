import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../theme/theme';
import { releaseLabel } from '../../services/telemetry';

/**
 * "Version 1.2.0 (61) · mise à jour 1a2b3c4d · runtime 1.2.0" at the foot of
 * Profil. Testers quote it in reports so a failure maps to the exact binary
 * AND the OTA update (the same identifiers every diagnostic event carries).
 * Selectable so it can be copied without a clipboard dependency.
 */
export default function ReleaseLine({ lang }: { lang: 'fr' | 'ht' }) {
  const { colors, typeScale } = useTheme();
  const label = useMemo(() => releaseLabel(lang), [lang]);
  return (
    <Text
      selectable
      accessibilityLabel={`${lang === 'ht' ? 'Vèsyon' : 'Version'} ${label}`}
      style={[typeScale.caption, { color: colors.muted, textAlign: 'center', marginTop: 12, paddingHorizontal: 20 }]}
    >
      {lang === 'ht' ? 'Vèsyon' : 'Version'} {label}
    </Text>
  );
}
