import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CheckCircle2, CloudOff, AlertCircle, ArrowRight, ChevronRight } from 'lucide-react-native';
import PressableScale from '../../ui/PressableScale';
import { useTheme, typeScale } from '../../../theme/theme';
import { tapLight } from '../../../utils/haptics';
import { EVIDENCE } from '../../../utils/learningJourney';
import type { CompletionEntry } from './completionController';
import type { ChapterPractice } from './chapterPractice';

/**
 * The lesson's one action region (PRD LJ-05). It shows exactly what the
 * persistence layer can prove:
 *
 *   idle       "Terminer la leçon" (primary)
 *   saving     "Enregistrement…" — disabled, no celebration
 *   slow       still saving after 8 s — said plainly, still no celebration
 *   queued     offline: pending until the connection is back
 *   failed     not saved — the same button retries
 *   confirmed  "Leçon terminée" + "Pratiquer ce chapitre · N questions"
 *              (primary) + "Leçon suivante" (secondary)
 *
 * A lesson already recorded as done on arrival goes straight to the confirmed
 * actions. Practice is labelled as the CHAPTER: the bank has no reliable
 * per-lesson mapping.
 */
export default function LessonCompletionPanel({
  entry, alreadyDone, isGuest, isCreole, practice, nextTitle, isLast,
  onComplete, onPractice, onNext,
}: {
  entry: CompletionEntry;
  alreadyDone: boolean;
  isGuest: boolean;
  isCreole: boolean;
  practice: ChapterPractice;
  nextTitle: string | null;
  isLast: boolean;
  onComplete: () => void;
  onPractice: () => void;
  onNext: () => void;
}) {
  const { colors, radius } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const confirmed = alreadyDone || entry.status === 'confirmed';
  const pending = entry.status === 'saving' || entry.status === 'slow' || entry.status === 'queued';

  const primaryStyle = {
    minHeight: 48, borderRadius: radius.control, backgroundColor: colors.azureFill,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
  };
  const secondaryStyle = {
    minHeight: 48, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6,
  };

  if (!confirmed) {
    let status: { icon: React.ReactNode; text: string; tone: string } | null = null;
    if (entry.status === 'slow') {
      status = {
        icon: <ActivityIndicator size="small" color={colors.muted} />,
        text: t(
          "L'enregistrement prend plus de temps que prévu. Ta leçon n'est pas encore confirmée.",
          'Anrejistreman an pran plis tan pase sa nou te prevwa. Leson ou an poko konfime.',
        ),
        tone: colors.muted,
      };
    } else if (entry.status === 'queued') {
      status = {
        icon: <CloudOff color={colors.warn} size={18} />,
        text: t(
          "Pas de connexion. L'enregistrement partira dès le retour du réseau — garde l'app ouverte.",
          'Pa gen koneksyon. Anrejistreman an ap pati depi rezo a tounen — kite aplikasyon an louvri.',
        ),
        tone: colors.ink,
      };
    } else if (entry.status === 'failed') {
      status = {
        icon: <AlertCircle color={colors.danger} size={18} />,
        text: entry.reason === 'offline'
          ? t("Pas enregistré : la connexion a été perdue. Réessaie quand tu es en ligne.", 'Pa anrejistre : koneksyon an koupe. Eseye ankò lè w sou entènèt.')
          : t("Pas enregistré. Ta leçon n'a pas été perdue : réessaie.", 'Pa anrejistre. Leson ou an pa pèdi : eseye ankò.'),
        tone: colors.ink,
      };
    }
    const label = entry.status === 'failed'
      ? t("Réessayer d'enregistrer", 'Eseye anrejistre ankò')
      : pending
        ? t('Enregistrement…', 'N ap anrejistre…')
        : t('Terminer la leçon', 'Fini leson an');

    return (
      <View style={{ marginTop: 14 }}>
        {status ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}
          >
            <View style={{ marginTop: 1 }}>{status.icon}</View>
            <Text style={[typeScale.status, { color: status.tone, flex: 1 }]}>{status.text}</Text>
          </View>
        ) : null}
        <PressableScale
          onPress={() => { if (!pending) { tapLight(); onComplete(); } }}
          disabled={pending}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          accessibilityLabel={label}
          style={{ ...primaryStyle, opacity: pending ? 0.7 : 1 }}
        >
          {entry.status === 'saving' ? <ActivityIndicator size="small" color="#ffffff" /> : <CheckCircle2 color="#ffffff" size={18} />}
          <Text style={[typeScale.action, { color: '#ffffff' }]}>{label}</Text>
        </PressableScale>
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

  return (
    <View style={{ marginTop: 14 }}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${t('Leçon terminée', 'Leson fini')}. ${local ? t('Enregistrée sur cet appareil.', 'Anrejistre sou aparèy sa a.') : ''} ${isCreole ? EVIDENCE.completed.helpHt : EVIDENCE.completed.helpFr}`}
        style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: radius.card, backgroundColor: colors.successSoft }}
      >
        <CheckCircle2 color={colors.success} size={20} />
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.title, { color: colors.ink }]}>{t('Leçon terminée', 'Leson fini')}</Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 2 }]}>
            {local
              ? t('Enregistrée sur cet appareil. Connecte-toi pour la garder partout.', 'Anrejistre sou aparèy sa a. Konekte w pou kenbe l toupatou.')
              : (isCreole ? EVIDENCE.completed.helpHt : EVIDENCE.completed.helpFr)}
          </Text>
        </View>
      </View>

      {showPractice ? (
        <PressableScale
          onPress={() => { if (ready) { tapLight(); onPractice(); } }}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy: practice.status === 'loading' }}
          accessibilityLabel={practiceLabel}
          style={{ ...primaryStyle, marginTop: 12, opacity: ready ? 1 : 0.7 }}
        >
          {practice.status === 'loading' ? <ActivityIndicator size="small" color="#ffffff" /> : null}
          <Text style={[typeScale.action, { color: '#ffffff', flexShrink: 1 }]} numberOfLines={1}>{practiceLabel}</Text>
          {ready ? <ArrowRight color="#ffffff" size={16} /> : null}
        </PressableScale>
      ) : null}

      {!isLast && nextTitle ? (
        showPractice ? (
          <TouchableOpacity
            onPress={() => { tapLight(); onNext(); }}
            accessibilityRole="button"
            accessibilityLabel={`${t('Leçon suivante', 'Pwochen leson')} : ${nextTitle}`}
            style={{ ...secondaryStyle, marginTop: 10 }}
          >
            <Text style={[typeScale.action, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
              {t('Leçon suivante', 'Pwochen leson')} · {nextTitle}
            </Text>
            <ChevronRight color={colors.muted} size={16} />
          </TouchableOpacity>
        ) : (
          // No practice for this chapter: the next lesson is the one primary.
          <PressableScale
            onPress={() => { tapLight(); onNext(); }}
            accessibilityRole="button"
            accessibilityLabel={`${t('Leçon suivante', 'Pwochen leson')} : ${nextTitle}`}
            style={{ ...primaryStyle, marginTop: 12 }}
          >
            <Text style={[typeScale.action, { color: '#ffffff', flexShrink: 1 }]} numberOfLines={1}>
              {t('Leçon suivante', 'Pwochen leson')} · {nextTitle}
            </Text>
            <ArrowRight color="#ffffff" size={16} />
          </PressableScale>
        )
      ) : isLast ? (
        <Text style={[typeScale.status, { color: colors.muted, marginTop: 10 }]}>
          {t('Dernière leçon du cours. Le test de chapitre confirme la maîtrise.', 'Dènye leson kou a. Tès chapit la konfime metriz la.')}
        </Text>
      ) : null}
    </View>
  );
}
