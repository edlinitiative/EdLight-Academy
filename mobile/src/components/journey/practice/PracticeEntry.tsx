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
import { ChevronLeft, Info, WifiOff, Smartphone, ListChecks, Lightbulb, Target, TimerOff } from 'lucide-react-native';
import { useTheme, typeScale, fonts } from '../../../theme/theme';
import Button from '../../ui/Button';
import Segmented from '../../ui/Segmented';
import { modeRules, offlineNote, questionsLabel, saveNote, type Tx } from './copy';
import { QUIZ_LENGTH, type SessionMode } from './session';
import type { ResolvedScope } from './practiceScope';

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
  const { colors } = useTheme();
  const quizLength = Math.min(QUIZ_LENGTH, scope.quizCount);
  const canQuiz = quizLength > 0;
  const pool = scope.poolCount;
  const wide = scope.unit?.value === '*';
  const chapter = scope.unitIndex ? t(`Chapitre ${scope.unitIndex}`, `Chapit ${scope.unitIndex}`) : '';
  const rules = modeRules(mode, quizLength, t);

  const RULE_ICONS = [ListChecks, Lightbulb, Target, TimerOff];
  const startCount = mode === 'quiz' ? quizLength : pool;
  const startLabel = startCount > 0
    ? `${t('Commencer', 'Kòmanse')} · ${questionsLabel(startCount, t)}`
    : t('Commencer', 'Kòmanse');

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 20 }}>
        {onBackToLesson && scope.lesson ? (
          <TouchableOpacity
            onPress={onBackToLesson}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 }}
          >
            <ChevronLeft color={colors.azureInk} size={20} />
            <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>{t('Retour à la leçon', 'Retounen nan leson an')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Topic */}
        <View style={{ gap: 6 }}>
          <Text style={[typeScale.meta, { color: colors.muted }]}>
            {scope.lesson
              ? `${t('Après la leçon', 'Apre leson')} « ${scope.lesson.title} »`
              : wide ? t('Pratiquer tout le cours', 'Pratike tout kou a') : t('Pratiquer ce chapitre', 'Pratike chapit sa a')}
          </Text>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: colors.ink }}>
            {scope.unit?.label || ''}
          </Text>
          <Text style={[typeScale.meta, { color: colors.muted }]}>
            {[chapter, subjectLabel].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* Mode — a pill switch, only when both modes are real choices. */}
        {canQuiz ? (
          <View style={{ gap: 10 }}>
            <Text style={[typeScale.meta, { color: colors.muted }]} nativeID="pe-mode-label">
              {t('Comment veux-tu t’entraîner ?', 'Kijan ou vle antrene ?')}
            </Text>
            <Segmented<SessionMode>
              options={[
                { key: 'quiz', label: `${t('Quiz', 'Kwiz')} · ${quizLength}`, accessibilityLabel: `${t('Quiz', 'Kwiz')} · ${questionsLabel(quizLength, t)}` },
                { key: 'practice', label: t('Entraînement libre', 'Pratik lib') },
              ]}
              value={mode}
              onChange={onMode}
            />
          </View>
        ) : (
          <Text style={[typeScale.body, { color: colors.ink }]}>
            {t('Aucune question de ce chapitre ne se corrige automatiquement : le quiz avec score n’est pas possible ici.',
              'Okenn kesyon nan chapit sa a pa korije otomatikman : kwiz ak nòt pa posib isit la.')}
          </Text>
        )}

        {/* What this session is — the real rules, on one tonal panel. */}
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 18, padding: 16, gap: 14 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
            {wide
              ? t(`${questionsLabel(pool, t)} dans ce cours`, `${pool} kesyon nan kou sa a`)
              : t(`${questionsLabel(pool, t)} dans ce chapitre`, `${pool} kesyon nan chapit sa a`)}
          </Text>
          {rules.map((line, i) => {
            const Icon = RULE_ICONS[i] ?? ListChecks;
            return (
              <View key={line} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon color={colors.azureInk} size={18} strokeWidth={2.2} />
                </View>
                <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>{line}</Text>
              </View>
            );
          })}
          {canQuiz && mode === 'quiz' && scope.quizCount < QUIZ_LENGTH ? (
            <Text style={[typeScale.meta, { color: colors.muted }]}>
              {t(`Ce chapitre a ${questionsLabel(quizLength, t)} corrigeable${quizLength > 1 ? 's' : ''} : le quiz en aura ${quizLength}.`,
                `Chapit sa a gen ${quizLength} kesyon ki ka korije : kwiz la ap genyen ${quizLength}.`)}
            </Text>
          ) : null}
        </View>

        {scope.lesson && !wide ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Info color={colors.muted} size={18} style={{ marginTop: 2 }} />
            <Text style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>
              {t('Ces questions couvrent tout le chapitre : elles ne sont pas encore classées leçon par leçon.',
                'Kesyon sa yo kouvri tout chapit la : yo poko klase leson pa leson.')}
            </Text>
          </View>
        ) : null}

        {/* What is saved · what works offline */}
        <View style={{ gap: 10 }}>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{saveNote(signedIn, t)}</Text>
          {!signedIn ? (
            <TouchableOpacity onPress={onSignIn} accessibilityRole="button" style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
              <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>
                {t('Connecte-toi pour les retrouver sur tous tes appareils', 'Konekte pou jwenn yo sou tout aparèy ou')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            {online === false ? <WifiOff color={colors.muted} size={17} style={{ marginTop: 2 }} /> : <Smartphone color={colors.muted} size={17} style={{ marginTop: 2 }} />}
            <Text style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>{offlineNote(online, t)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 2, backgroundColor: colors.bg }}>
        <Button
          label={startLabel}
          onPress={onStart}
          disabled={mode === 'quiz' ? !canQuiz : pool === 0}
          size="lg"
          fullWidth
        />
        <TouchableOpacity onPress={onChange} accessibilityRole="button" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
          <Text style={[typeScale.bodyMd, { color: colors.muted }]}>{t('Choisir un autre chapitre', 'Chwazi yon lòt chapit')}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
