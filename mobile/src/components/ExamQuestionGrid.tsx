import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, typeScale, fonts } from '../theme/theme';
import PressableScale from './ui/PressableScale';
import Button from './ui/Button';

/**
 * The exam's question overview — the phone version of the web's sidebar
 * (src/pages/ExamTake.tsx: the grid grouped by section with x/y per section,
 * "N questions sans réponse · Aller à la suivante", and the legend).
 *
 * The horizontal rail only shows a handful of pills at a time; on a 20-question
 * paper with four parts the student could not see which part they were in or
 * which questions were still empty.
 */
export default function ExamQuestionGrid({
  visible, onClose, sections, total, current, filled, onGoto,
}: {
  visible: boolean;
  onClose: () => void;
  sections: { title: string; start: number; end: number }[];
  total: number;
  current: number;
  filled: (i: number) => boolean;
  onGoto: (i: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const groups = sections.length ? sections : [{ title: t('Questions', 'Kesyon'), start: 0, end: total - 1 }];
  const unanswered: number[] = [];
  for (let i = 0; i < total; i++) if (!filled(i)) unanswered.push(i);
  const nextEmpty = unanswered.find((i) => i > current) ?? unanswered[0];

  const go = (i: number) => { onGoto(i); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(11,18,32,0.4)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')} />
      <View style={{ maxHeight: '80%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[typeScale.titleSm, { color: colors.ink, fontFamily: fonts.headingBold }]}>{t('Ta progression', 'Pwogrè ou')}</Text>
            <Text style={[typeScale.meta, { color: colors.muted }]}>
              {total - unanswered.length}/{total} {t('répondues', 'reponn')}
            </Text>
          </View>
          <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X color={colors.muted} size={22} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 18 }}>
          {unanswered.length > 0 && nextEmpty != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.warnSoft }}>
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 20, color: colors.warnInk, fontVariant: ['tabular-nums'] }}>{unanswered.length}</Text>
              <Text style={[typeScale.bodyMd, { flex: 1, color: colors.warnInk }]}>
                {t(`question${unanswered.length > 1 ? 's' : ''} sans réponse`, 'kesyon san repons')}
              </Text>
              <Button size="sm" variant="secondary" label={t('Aller à la suivante', 'Ale nan pwochen an')} onPress={() => go(nextEmpty)} />
            </View>
          ) : null}

          {groups.map((g, gi) => {
            const count = g.end - g.start + 1;
            let done = 0;
            for (let i = g.start; i <= g.end; i++) if (filled(i)) done++;
            return (
              <View key={gi} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[typeScale.label, { flex: 1, color: colors.ink, fontFamily: fonts.headingBold }]} numberOfLines={1}>{g.title}</Text>
                  <Text style={[typeScale.meta, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>{done}/{count}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: count }, (_, k) => {
                    const i = g.start + k;
                    const active = i === current;
                    const ok = filled(i);
                    return (
                      <PressableScale
                        key={i}
                        onPress={() => go(i)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${t('Question', 'Kesyon')} ${i + 1}, ${active ? t('ouverte', 'louvri') : ok ? t('répondue', 'reponn') : t('sans réponse', 'san repons')}`}
                        style={{
                          width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: active ? colors.ink : ok ? colors.azureSoft : colors.surfaceAlt,
                        }}
                      >
                        <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: active ? colors.bg : ok ? colors.azureInk : colors.ink }}>{k + 1}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {[
              { c: colors.ink, l: t('Question ouverte', 'Kesyon louvri') },
              { c: colors.azureSoft, l: t('Répondu', 'Reponn') },
              { c: colors.surfaceAlt, l: t('Sans réponse', 'San repons') },
            ].map((x) => (
              <View key={x.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: x.c }} />
                <Text style={[typeScale.caption, { color: colors.muted }]}>{x.l}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
