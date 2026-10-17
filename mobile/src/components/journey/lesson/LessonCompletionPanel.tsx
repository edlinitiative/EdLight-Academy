import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { CheckCircle2, CloudOff, AlertCircle, ArrowRight } from 'lucide-react-native';
import PressableScale from '../../ui/PressableScale';
import { useTheme } from '../../../theme/theme';
import { tapLight } from '../../../utils/haptics';
import { EVIDENCE } from '../../../utils/learningJourney';
import type { CompletionEntry } from './completionController';
import type { ChapterPractice } from './chapterPractice';

/**
 * The lesson's one action region (PRD LJ-05), drawn as DIRECTION §5.4's white
 * card (radius 24, padding 24, no ring). It shows exactly what the persistence
 * layer can prove:
 *
 *   idle       "Terminer la leçon" (primary) + "Leçon suivante" (tonal)
 *   saving     "Enregistrement…" — disabled, no celebration
 *   slow       still saving after 8 s — said plainly, still no celebration
 *   queued     offline: pending until the connection is back
 *   failed     not saved — the same button retries
 *   confirmed  check + "Terminée", the help line, then
 *              "Pratiquer ce chapitre · N questions" (primary) and
 *              "Leçon suivante : …" (tonal, may wrap to two lines)
 *
 * A lesson already recorded as done on arrival goes straight to the confirmed
 * actions. Practice is labelled as the CHAPTER: the bank has no reliable
 * per-lesson mapping. Exactly one solid button at any time.
 */
export default function LessonCompletionPanel({
  entry, alreadyDone, isGuest, isCreole, practice, nextTitle, isLast, stepLine,
  onComplete, onPractice, onNext,
}: {
  entry: CompletionEntry;
  alreadyDone: boolean;
  isGuest: boolean;
  isCreole: boolean;
  practice: ChapterPractice;
  nextTitle: string | null;
  isLast: boolean;
  /** "Pratiquée · Réussis 100% des exercices" — where the ladder stands; optional. */
  stepLine?: string | null;
  onComplete: () => void;
  onPractice: () => void;
  onNext: () => void;
}) {
  const { colors, radius, typeScale, fonts, featureSurface } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const confirmed = alreadyDone || entry.status === 'confirmed';
  const pending = entry.status === 'saving' || entry.status === 'slow' || entry.status === 'queued';

  const base = {
    minHeight: 52, borderRadius: radius.control, paddingHorizontal: 18, paddingVertical: 12,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
  };
  const primary = { ...base, backgroundColor: colors.azureFill };
  const tonal = { ...base, backgroundColor: colors.azureSoft };
  const primaryText = { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: '#ffffff', textAlign: 'center' as const, flexShrink: 1 };
  const tonalText = { ...primaryText, color: colors.azureInk };
  const nextLabel = nextTitle ? `${t('Leçon suivante', 'Pwochen leson')} : ${nextTitle}` : null;

  const NextTonal = !isLast && nextLabel ? (
    <PressableScale
      onPress={() => { tapLight(); onNext(); }}
      accessibilityRole="button"
      accessibilityLabel={nextLabel}
      style={{ ...tonal, marginTop: 12 }}
    >
      <Text style={tonalText} numberOfLines={2}>{nextLabel}</Text>
    </PressableScale>
  ) : null;

  if (!confirmed) {
    let status: { icon: React.ReactNode; text: string } | null = null;
    if (entry.status === 'slow') {
      status = {
        icon: <ActivityIndicator size="small" color={colors.muted} />,
        text: t(
          "L'enregistrement prend plus de temps que prévu. Ta leçon n'est pas encore confirmée.",
          'Anrejistreman an pran plis tan pase sa nou te prevwa. Leson ou an poko konfime.',
        ),
      };
    } else if (entry.status === 'queued') {
      status = {
        icon: <CloudOff color={colors.warn} size={20} />,
        text: t(
          "Pas de connexion. L'enregistrement partira dès le retour du réseau — garde l'app ouverte.",
          'Pa gen koneksyon. Anrejistreman an ap pati depi rezo a tounen — kite aplikasyon an louvri.',
        ),
      };
    } else if (entry.status === 'failed') {
      status = {
        icon: <AlertCircle color={colors.danger} size={20} />,
        text: entry.reason === 'offline'
          ? t('Pas enregistré : la connexion a été perdue. Réessaie quand tu es en ligne.', 'Pa anrejistre : koneksyon an koupe. Eseye ankò lè w sou entènèt.')
          : t("Pas enregistré. Ta leçon n'a pas été perdue : réessaie.", 'Pa anrejistre. Leson ou an pa pèdi : eseye ankò.'),
      };
    }
    const label = entry.status === 'failed'
      ? t("Réessayer d'enregistrer", 'Eseye anrejistre ankò')
      : pending
        ? t('Enregistrement…', 'N ap anrejistre…')
        : t('Terminer la leçon', 'Fini leson an');

    // While watching the panel collapses to its buttons (DIRECTION §5.4).
    return (
      <View style={{ ...featureSurface, padding: 20 }}>
        {status ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
            <View style={{ marginTop: 1 }}>{status.icon}</View>
            <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>{status.text}</Text>
          </View>
        ) : null}
        {stepLine && !status ? (
          <Text style={[typeScale.meta, { color: colors.muted, marginBottom: 14 }]}>{stepLine}</Text>
        ) : null}
        <PressableScale
          onPress={() => { if (!pending) { tapLight(); onComplete(); } }}
          disabled={pending}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          accessibilityLabel={label}
          style={{ ...primary, opacity: pending ? 0.7 : 1 }}
        >
          {entry.status === 'saving' ? <ActivityIndicator size="small" color="#ffffff" /> : <CheckCircle2 color="#ffffff" size={20} />}
          <Text style={primaryText}>{label}</Text>
        </PressableScale>
        {NextTonal}
      </View>
    );
  }

  // ── Confirmed: acknowledge, then the next learning step ──────────────────
  const ready = practice.status === 'ready';
  const practiceLabel = ready
    ? `${t('Pratiquer ce chapitre', 'Pratike chapit sa a')} · ${practice.count} ${t('questions', 'kesyon')}`
    : t('Pratiquer ce chapitre', 'Pratike chapit sa a');
  const showPractice = practice.status !== 'none';
  const local = entry.outcome === 'local' || (alreadyDone && isGuest);
  const help = local
    ? t('Enregistrée sur cet appareil. Connecte-toi pour la garder partout.', 'Anrejistre sou aparèy sa a. Konekte w pou kenbe l toupatou.')
    : (isCreole ? EVIDENCE.completed.helpHt : EVIDENCE.completed.helpFr);

  return (
    <View style={{ ...featureSurface, padding: 24 }}>
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${t('Leçon terminée', 'Leson fini')}. ${help}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 color={colors.surface} fill={colors.success} size={24} strokeWidth={2.2} />
          <Text style={[typeScale.cardTitle, { color: colors.ink, fontSize: 20, lineHeight: 25 }]}>{t('Terminée', 'Fini')}</Text>
        </View>
        <Text style={[typeScale.body, { color: colors.muted, marginTop: 8 }]}>{help}</Text>
        {stepLine ? <Text style={[typeScale.meta, { color: colors.ink, marginTop: 6 }]}>{stepLine}</Text> : null}
      </View>

      {showPractice ? (
        <PressableScale
          onPress={() => { if (ready) { tapLight(); onPractice(); } }}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy: practice.status === 'loading' }}
          accessibilityLabel={practiceLabel}
          style={{ ...primary, marginTop: 20, opacity: ready ? 1 : 0.7 }}
        >
          {practice.status === 'loading' ? <ActivityIndicator size="small" color="#ffffff" /> : null}
          <Text style={primaryText} numberOfLines={2}>{practiceLabel}</Text>
        </PressableScale>
      ) : null}

      {!isLast && nextLabel ? (
        showPractice ? NextTonal : (
          // No practice for this chapter: the next lesson is the one primary.
          <PressableScale
            onPress={() => { tapLight(); onNext(); }}
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
            style={{ ...primary, marginTop: 20 }}
          >
            <Text style={primaryText} numberOfLines={2}>{nextLabel}</Text>
            <ArrowRight color="#ffffff" size={18} />
          </PressableScale>
        )
      ) : isLast ? (
        <Text style={[typeScale.meta, { color: colors.muted, marginTop: 14 }]}>
          {t('Dernière leçon du cours. Le test de chapitre confirme la maîtrise.', 'Dènye leson kou a. Tès chapit la konfime metriz la.')}
        </Text>
      ) : null}
    </View>
  );
}
