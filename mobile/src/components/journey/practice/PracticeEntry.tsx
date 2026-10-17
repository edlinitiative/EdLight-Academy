/**
 * PracticeEntry — the compact confirmation before a session (LJ-06, LJ-07):
 * topic, mode, the REAL count, what is saved, what works offline, one
 * « Commencer ». Rendered only once the scope is resolved against loaded
 * data, so the count is never a placeholder.
 *
 * ScopeNotice — what a handoff asked for that the bank cannot serve, said
 * plainly, with an explicit choice. Never a silent swap to unrelated questions.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronLeft, Info, WifiOff, Smartphone } from 'lucide-react-native';
import { useTheme, typeScale, radius } from '../../../theme/theme';
import { tapLight } from '../../../utils/haptics';
import Button from '../../ui/Button';
import { modeRules, offlineNote, questionsLabel, saveNote, type Tx } from './copy';
import { QUIZ_LENGTH, type SessionMode } from './session';
import type { ResolvedScope } from './practiceScope';

function ModeChip({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => { if (!disabled) { tapLight(); onPress(); } }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={label}
      style={{
        flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
        borderRadius: radius.control, borderWidth: 1.5,
        borderColor: on ? colors.azure : colors.border,
        backgroundColor: on ? colors.azureSoft : colors.surface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={[typeScale.bodyMd, { color: on ? colors.azure : colors.ink, textAlign: 'center' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PracticeEntry({
  scope,
  subjectLabel,
  mode,
  onMode,
  signedIn,
  online,
  onSignIn,
  onStart,
  onChange,
  onBackToLesson,
  t,
}: {
  scope: ResolvedScope;
  /** "Chimie · NS1" */
  subjectLabel: string;
  mode: SessionMode;
  onMode: (m: SessionMode) => void;
  signedIn: boolean;
  online: boolean | null;
  onSignIn: () => void;
  onStart: () => void;
  onChange: () => void;
  /** Present only when a lesson sits under this screen in the stack. */
  onBackToLesson?: () => void;
  t: Tx;
}) {
  const { colors, cardSurface } = useTheme();
  const quizLength = Math.min(QUIZ_LENGTH, scope.quizCount);
  const canQuiz = quizLength > 0;
  const pool = scope.poolCount;
  const wide = scope.unit?.value === '*';
  const chapter = scope.unitIndex ? t(`Chapitre ${scope.unitIndex}`, `Chapit ${scope.unitIndex}`) : '';
  const rules = modeRules(mode, quizLength, t);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}>
      {onBackToLesson && scope.lesson ? (
        <TouchableOpacity
          onPress={onBackToLesson}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}
        >
          <ChevronLeft color={colors.azure} size={18} />
          <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{t('Retour à la leçon', 'Retounen nan leson an')}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Topic */}
      <View style={{ gap: 6 }}>
        <Text style={[typeScale.bodyMd, { color: colors.muted }]}>
          {scope.lesson
            ? `${t('Après la leçon', 'Apre leson')} « ${scope.lesson.title} »`
            : wide ? t('Pratique de tout le cours', 'Pratik tout kou a') : t('Pratique du chapitre', 'Pratik chapit la')}
        </Text>
        <Text accessibilityRole="header" style={[typeScale.h1, { color: colors.ink }]}>{scope.unit?.label || ''}</Text>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {[subjectLabel, chapter].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
          {wide
            ? t(`${questionsLabel(pool, t)} dans ce cours`, `${pool} kesyon nan kou sa a`)
            : t(`${questionsLabel(pool, t)} dans ce chapitre`, `${pool} kesyon nan chapit sa a`)}
        </Text>
      </View>

      {scope.lesson && !wide ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Info color={colors.muted} size={18} style={{ marginTop: 1 }} />
          <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>
            {t('Ces questions couvrent tout le chapitre : elles ne sont pas encore classées leçon par leçon.',
              'Kesyon sa yo kouvri tout chapit la : yo poko klase leson pa leson.')}
          </Text>
        </View>
      ) : null}

      {/* Mode */}
      <View style={{ ...cardSurface, padding: 16, gap: 12 }}>
        <Text style={[typeScale.titleSm, { color: colors.ink }]} nativeID="pe-mode-label">
          {t('Comment veux-tu t’entraîner ?', 'Kijan ou vle antrene ?')}
        </Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
          <ModeChip
            label={`${t('Quiz', 'Kwiz')} · ${questionsLabel(quizLength, t)}`}
            on={mode === 'quiz'}
            disabled={!canQuiz}
            onPress={() => onMode('quiz')}
          />
          <ModeChip label={t('Entraînement libre', 'Pratik lib')} on={mode === 'practice'} onPress={() => onMode('practice')} />
        </View>
        {!canQuiz ? (
          <Text style={[typeScale.body, { color: colors.ink }]}>
            {t('Aucune question de ce chapitre ne se corrige automatiquement : le quiz avec score n’est pas possible ici.',
              'Okenn kesyon nan chapit sa a pa korije otomatikman : kwiz ak nòt pa posib isit la.')}
          </Text>
        ) : null}
        {canQuiz && mode === 'quiz' && scope.quizCount < QUIZ_LENGTH ? (
          <Text style={[typeScale.body, { color: colors.ink }]}>
            {t(`Ce chapitre a ${questionsLabel(quizLength, t)} corrigeable${quizLength > 1 ? 's' : ''} : le quiz en aura ${quizLength}.`,
              `Chapit sa a gen ${quizLength} kesyon ki ka korije : kwiz la ap genyen ${quizLength}.`)}
          </Text>
        ) : null}
        <View style={{ gap: 8 }}>
          {rules.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[typeScale.body, { color: colors.muted }]}>•</Text>
              <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* What is saved · what works offline */}
      <View style={{ gap: 10 }}>
        <Text style={[typeScale.body, { color: colors.ink }]}>{saveNote(signedIn, t)}</Text>
        {!signedIn ? (
          <TouchableOpacity onPress={onSignIn} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <Text style={[typeScale.bodyMd, { color: colors.azure }]}>
              {t('Connecte-toi pour les retrouver sur tous tes appareils', 'Konekte pou jwenn yo sou tout aparèy ou')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          {online === false ? <WifiOff color={colors.muted} size={17} style={{ marginTop: 1 }} /> : <Smartphone color={colors.muted} size={17} style={{ marginTop: 1 }} />}
          <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>{offlineNote(online, t)}</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Button
          label={t('Commencer', 'Kòmanse')}
          onPress={onStart}
          disabled={mode === 'quiz' ? !canQuiz : pool === 0}
          size="lg"
          fullWidth
        />
        <TouchableOpacity onPress={onChange} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{t('Choisir un autre chapitre', 'Chwazi yon lòt chapit')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

export function ScopeNotice({
  scope, courseLabel, onCourseWide, t,
}: {
  scope: ResolvedScope;
  courseLabel: string;
  onCourseWide?: () => void;
  t: Tx;
}) {
  const { colors, cardSurface } = useTheme();
  let text = '';
  if (scope.status === 'unknown-course') {
    text = t('Ce lien de pratique ne correspond à aucun cours disponible. Choisis une matière et un chapitre ci-dessous.',
      'Lyen pratik sa a pa koresponn ak okenn kou ki disponib. Chwazi yon matyè ak yon chapit anba a.');
  } else if (scope.status === 'unknown-unit') {
    text = t(`Le chapitre demandé n’existe plus dans ${courseLabel}. Choisis un chapitre ci-dessous.`,
      `Chapit ou mande a pa egziste ankò nan ${courseLabel}. Chwazi yon chapit anba a.`);
  } else if (scope.status === 'empty-unit') {
    text = t(`« ${scope.unit?.label} » n’a pas encore de questions. Choisis un autre chapitre ci-dessous.`,
      `« ${scope.unit?.label} » poko gen kesyon. Chwazi yon lòt chapit anba a.`);
  } else if (scope.status === 'course-only') {
    text = t(`Choisis un chapitre de ${courseLabel} ci-dessous.`, `Chwazi yon chapit nan ${courseLabel} anba a.`);
  }
  if (!text) return null;
  const wide = scope.coursePoolCount;
  return (
    <View accessibilityRole="alert" style={{ ...cardSurface, padding: 14, gap: 10, marginBottom: 14, flexDirection: 'row' }}>
      <Info color={colors.muted} size={18} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 10 }}>
        <Text style={[typeScale.body, { color: colors.ink }]}>{text}</Text>
        {onCourseWide && scope.status !== 'unknown-course' && wide > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            label={t(`S’entraîner sur tout le cours · ${questionsLabel(wide, t)}`, `Pratike sou tout kou a · ${wide} kesyon`)}
            onPress={onCourseWide}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </View>
    </View>
  );
}
