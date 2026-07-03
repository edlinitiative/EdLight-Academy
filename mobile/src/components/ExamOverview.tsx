import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Award, ListChecks, Layers, Play } from 'lucide-react-native';
import { normalizeSubject, normalizeExamTitle, normalizeYear } from '../utils/examUtils';
import useStore from '../contexts/store';

const PRIMARY = '#0857A6';
const TEXT = '#0f172a';
const MUTED = '#64748b';

const cardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#e8edf5',
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
} as const;

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f4f6fb', borderRadius: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e8edf5' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }} numberOfLines={1}>{value}</Text>
        <Text style={{ fontSize: 11, color: MUTED }} numberOfLines={1}>{label}</Text>
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
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const title = normalizeExamTitle(exam);
  const subject = normalizeSubject(exam?.subject ?? '');
  const { year } = normalizeYear(exam?.year);
  const durationMin = Number(exam?.duration_minutes) || 0;
  const totalPoints = Number(exam?.total_points) || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e8edf5' }}>
        <TouchableOpacity onPress={onBack} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft color={TEXT} size={22} />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{t("Aperçu de l'examen", 'Apèsi egzamen an')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
        {/* Hero card */}
        <View style={[cardStyle, { padding: 18 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {subject ? (
              <View style={{ backgroundColor: '#e6f0f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>{subject}</Text>
              </View>
            ) : null}
            {year ? (
              <View style={{ backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED }}>{year}</Text>
              </View>
            ) : null}
          </View>

          <Text style={{ fontSize: 20, fontWeight: '800', color: TEXT, lineHeight: 27, marginBottom: 16 }}>
            {title}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {durationMin > 0 ? (
              <StatItem icon={<Clock color={PRIMARY} size={17} />} value={`${durationMin} min`} label={t('Durée', 'Dire')} />
            ) : null}
            {totalPoints > 0 ? (
              <StatItem icon={<Award color={PRIMARY} size={17} />} value={`${totalPoints} pts`} label={t('Total des points', 'Total pwen yo')} />
            ) : null}
            <StatItem
              icon={<ListChecks color={PRIMARY} size={17} />}
              value={String(questionCount)}
              label={t(questionCount > 1 ? 'Questions' : 'Question', 'Kesyon')}
            />
            <StatItem
              icon={<Layers color={PRIMARY} size={17} />}
              value={String(sections.length)}
              label={t(sections.length > 1 ? 'Sections' : 'Section', 'Seksyon')}
            />
          </View>
        </View>

        {/* Sections card */}
        {sections.length > 0 ? (
          <View style={[cardStyle, { padding: 18 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
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
                  borderTopColor: '#e8edf5',
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: '#e6f0f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: PRIMARY }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: TEXT }} numberOfLines={2}>
                  {sec.title}
                </Text>
                <Text style={{ fontSize: 12, color: MUTED }}>
                  {t(`${sec.count} question${sec.count > 1 ? 's' : ''}`, `${sec.count} kesyon`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Saved progress notice */}
        {hasProgress ? (
          <View style={[cardStyle, { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: PRIMARY }} />
            <Text style={{ flex: 1, fontSize: 13, color: MUTED }}>
              {t(
                `Progression sauvegardée — ${answeredCount} réponse${answeredCount > 1 ? 's' : ''} enregistrée${answeredCount > 1 ? 's' : ''} sur ${questionCount}.`,
                `Pwogrè ou sove — ${answeredCount} repons anrejistre sou ${questionCount}.`,
              )}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Start CTA */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e8edf5' }}>
        <TouchableOpacity
          onPress={onStart}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: 16,
            paddingVertical: 15,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Play color="#ffffff" size={17} fill="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            {hasProgress ? t("Continuer l'examen", 'Kontinye egzamen an') : t("Commencer l'examen", 'Kòmanse egzamen an')}
          </Text>
        </TouchableOpacity>
        <Text style={{ textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 8 }}>
          {hasProgress
            ? t('Vous reprendrez là où vous vous étiez arrêté.', 'W ap kontinye kote ou te rete a.')
            : t('Votre progression sera sauvegardée automatiquement.', 'Pwogrè ou ap sove otomatikman.')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
