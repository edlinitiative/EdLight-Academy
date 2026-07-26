import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Award, ListChecks, Layers, Play } from 'lucide-react-native';
import { normalizeExamTitle } from '../utils/examUtils';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import Button from './ui/Button';

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.bg, borderRadius: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{value}</Text>
        <Text style={[typeScale.micro, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

export type ExamSectionSummary = { title: string; count: number };

export default function ExamOverview({
  exam,
  sections,
  questionCount,
  hasProgress,
  answeredCount,
  onStart,
  onBack,
}: {
  exam: any;
  sections: ExamSectionSummary[];
  questionCount: number;
  hasProgress: boolean;
  answeredCount: number;
  onStart: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { shadow, radius } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const title = normalizeExamTitle(exam);
  const durationMin = Number(exam?.duration_minutes) || 0;
  const totalPoints = Number(exam?.total_points) || 0;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={onBack} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Retour', 'Retounen')}>
          <ArrowLeft color={colors.ink} size={22} />
        </TouchableOpacity>
        <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t("Aperçu de l'examen", 'Apèsi egzamen an')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
        {/* Hero card — the composed title already leads with the subject and
            ends with the year/session (e.g. "Espagnol — … · Juillet 2025"), so
            the old subject/year pills above it were redundant and were removed. */}
        <View style={[cardStyle, { padding: 18 }]}>
          <Text style={[typeScale.h1, { color: colors.ink, marginBottom: 16 }]}>
            {title}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {durationMin > 0 ? (
              <StatItem icon={<Clock color={colors.azure} size={17} />} value={`${durationMin} min`} label={t('Durée', 'Dire')} />
            ) : null}
            {totalPoints > 0 ? (
              <StatItem icon={<Award color={colors.azure} size={17} />} value={`${totalPoints} pts`} label={t('Total des points', 'Total pwen')} />
            ) : null}
            <StatItem
              icon={<ListChecks color={colors.azure} size={17} />}
              value={String(questionCount)}
              label={t(questionCount > 1 ? 'Questions' : 'Question', 'Kesyon')}
            />
            <StatItem
              icon={<Layers color={colors.azure} size={17} />}
              value={String(sections.length)}
              label={t(sections.length > 1 ? 'Sections' : 'Section', 'Seksyon')}
            />
          </View>
        </View>

        {/* Sections card */}
        {sections.length > 0 ? (
          <View style={[cardStyle, { padding: 18 }]}>
            <Text style={[typeScale.overline, { color: colors.muted, marginBottom: 12 }]}>
              {t('Aperçu des sections', 'Apèsi seksyon yo')}
            </Text>
            {sections.map((sec, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[typeScale.caption, { color: colors.azure, fontFamily: 'Satoshi-Bold' }]}>{i + 1}</Text>
                </View>
                <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]} numberOfLines={2}>
                  {sec.title}
                </Text>
                <Text style={[typeScale.caption, { color: colors.muted }]}>
                  {sec.count} {t(sec.count > 1 ? 'questions' : 'question', 'kesyon')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Saved progress notice */}
        {hasProgress ? (
          <View style={[cardStyle, { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.azure }} />
            <Text style={[typeScale.label, { flex: 1, color: colors.muted }]}>
              {t(
                `Progression sauvegardée — ${answeredCount} réponse${answeredCount > 1 ? 's' : ''} enregistrée${answeredCount > 1 ? 's' : ''} sur ${questionCount}.`,
                `Pwogrè konsève — ${answeredCount} repons anrejistre sou ${questionCount}.`,
              )}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Start CTA — safe-area aware so it always clears the home indicator /
          Android gesture bar (the floating tab bar is hidden here via focus mode). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button
          onPress={onStart}
          variant="primary"
          size="lg"
          fullWidth
          icon={<Play color="#ffffff" size={17} fill="#ffffff" />}
          label={hasProgress ? t("Continuer l'examen", 'Kontinye egzamen an') : t("Commencer l'examen", 'Kòmanse egzamen an')}
        />
        <Text style={[typeScale.caption, { textAlign: 'center', color: colors.muted, marginTop: 8 }]}>
          {hasProgress
            ? t('Vous reprendrez là où vous vous étiez arrêté.', 'W ap kontinye kote ou te rete a.')
            : t('Votre progression sera sauvegardée automatiquement.', 'Pwogrè ou ap konsève otomatikman.')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
