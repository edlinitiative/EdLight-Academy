/**
 * OfflinePacksEntry — the "Hors ligne / San entènèt" row on the Exams landing
 * and in Practice. Says what is on the phone (count and size) and how many
 * results still wait to be sent, then opens OfflinePacksScreen.
 */
import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Download } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import PressableScale from './ui/PressableScale';
import { tapLight } from '../utils/haptics';
import { formatPackSize, type StoredPack } from '../../../shared/offlinePacks';
import { packLibrary } from '../services/offlinePacks';

export default function OfflinePacksEntry({ onPress, kind = 'exam' }: { onPress: () => void; kind?: 'exam' | 'practice' }) {
  const { language, user } = useStore();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const colors = useColors();
  const { cardSurface } = useTheme();
  const [packs, setPacks] = useState<StoredPack[]>([]);
  const [pending, setPending] = useState(0);

  useFocusEffect(useCallback(() => {
    let alive = true;
    packLibrary.list().then((p) => { if (alive) setPacks(p); }, () => {});
    // Lazy: the outbox pulls in Firebase, which screens importing this row
    // must not need just to render it.
    const { pendingExamSubmissionCount } = require('../services/writeOutbox') as typeof import('../services/writeOutbox');
    pendingExamSubmissionCount(user?.uid).then((n) => { if (alive) setPending(n); }, () => {});
    return () => { alive = false; };
  }, [user?.uid]));

  const mine = packs.filter((p) => p.kind === kind);
  const used = mine.reduce((s, p) => s + p.sizeBytes, 0);
  const subtitle = mine.length
    ? t(`${mine.length} paquet${mine.length > 1 ? 's' : ''} sur ce téléphone · ${formatPackSize(used)}`, `${mine.length} pake sou telefòn sa a · ${formatPackSize(used)}`)
    : kind === 'exam'
      ? t('Télécharge des sujets pour réviser sans connexion.', 'Telechaje sijè pou revize san entènèt.')
      : t('Garde des questions pour t’entraîner sans connexion.', 'Kenbe kesyon pou pratike san entènèt.');
  const waiting = pending > 0
    ? t(`${pending} résultat${pending > 1 ? 's' : ''} en attente d’envoi`, `${pending} rezilta ap tann pou voye`)
    : null;

  return (
    <PressableScale
      onPress={() => { tapLight(); onPress(); }}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={[t('Hors ligne', 'San entènèt'), subtitle, waiting].filter(Boolean).join('. ')}
      style={{ ...cardSurface, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 72 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Download color={colors.azureInk} size={20} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>{t('Hors ligne', 'San entènèt')}</Text>
        <Text style={[typeScale.meta, { color: colors.muted }]}>{subtitle}</Text>
        {waiting ? <Text style={[typeScale.label, { color: colors.warnInk }]}>{waiting}</Text> : null}
      </View>
      <ChevronRight color={colors.faint} size={20} />
    </PressableScale>
  );
}
