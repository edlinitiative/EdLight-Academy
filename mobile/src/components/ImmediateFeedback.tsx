import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Check, CircleDashed, Lock, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, typeScale, fonts } from '../theme/theme';
import { classifyEssayResponse } from '../../../shared/essayGradeCore';
import MathText from './MathText';
import PressableScale from './ui/PressableScale';

/**
 * "Résultat immédiat" — the correction shown right after a checked answer,
 * the phone twin of the web's ImmediateFeedback (src/pages/ExamTake.tsx):
 * status + points, the AI note for a written answer, the expected answer on a
 * miss, per-blank results for a scaffold, and the explanation on demand. The
 * answer above it is locked once checked.
 */
export default function ImmediateFeedback({ result, question }: { result: any; question: any }) {
  const colors = useColors();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [open, setOpen] = useState(false);
  const status: string = result?.status ?? 'manual';

  const cfg: Record<string, { label: string; bg: string; ink: string; Icon: any }> = {
    correct: { label: t('Correct', 'Kòrèk'), bg: colors.successSoft, ink: colors.successInk, Icon: Check },
    'scaffold-complete': { label: t('Complété', 'Konplè'), bg: colors.successSoft, ink: colors.successInk, Icon: Check },
    partial: { label: t('Partiellement correct', 'Kòrèk an pati'), bg: colors.warnSoft, ink: colors.warnInk, Icon: CircleDashed },
    incorrect: { label: t('Incorrect', 'Pa kòrèk'), bg: colors.dangerSoft, ink: colors.dangerInk, Icon: X },
    ungraded: { label: t('Pas encore corrigée', 'Poko korije'), bg: colors.surfaceAlt, ink: colors.muted, Icon: CircleDashed },
    manual: { label: t('Évaluation manuelle', 'Koreksyon alamen'), bg: colors.surfaceAlt, ink: colors.muted, Icon: CircleDashed },
    unanswered: { label: t('Sans réponse', 'San repons'), bg: colors.surfaceAlt, ink: colors.muted, Icon: CircleDashed },
  };
  const c = cfg[status] ?? cfg.manual;
  const awarded = result?.result?.awarded ?? 0;
  const maxPts = result?.result?.maxPoints ?? (Number(question?.points) || 1);
  const essay = result?.essayFeedback;
  const essayOk = essay && classifyEssayResponse(essay) !== 'failed';
  const blanks: any[] = Array.isArray(result?.result?.blankResults) ? result.result.blankResults : [];
  const correctText = (() => {
    if (status !== 'incorrect' || !question?.correct || question?.type === 'essay') return '';
    const k = String(question.correct);
    const opts = question?.options;
    if (opts && typeof opts === 'object' && !Array.isArray(opts) && opts[k]) return `${k.toUpperCase()}. ${opts[k]}`;
    return k;
  })();
  const explanation = String(question?.explanation || question?.model_answer || '').trim();

  return (
    <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View accessible accessibilityLabel={`${c.label}${status !== 'ungraded' ? `, ${awarded} sur ${maxPts}` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: c.bg }}>
        <c.Icon color={c.ink} size={18} strokeWidth={2.6} />
        <Text style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 16, color: c.ink }}>{c.label}</Text>
        {status !== 'ungraded' ? (
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums'] }}>{awarded}/{maxPts} pt{maxPts > 1 ? 's' : ''}</Text>
        ) : null}
      </View>

      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Lock color={colors.faint} size={13} />
          <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Réponse vérifiée : elle ne peut plus être modifiée.', 'Repons verifye : ou pa ka chanje l ankò.')}</Text>
        </View>

        {essay && !essayOk ? (
          <Text style={[typeScale.bodyMd, { color: colors.muted }]}>{t('La correction automatique n’a pas abouti. Tu pourras la relancer depuis tes résultats.', 'Koreksyon otomatik la pa t mache. W ap ka relanse l nan rezilta ou yo.')}</Text>
        ) : null}
        {essayOk ? (
          <View style={{ gap: 6 }}>
            <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
              <Text style={{ fontFamily: fonts.bold }}>{t('Note IA : ', 'Nòt IA : ')}</Text>{String(essay.score)}
            </Text>
            {essay.feedback ? <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{String(essay.feedback)}</Text> : null}
          </View>
        ) : null}

        {correctText ? (
          <View style={{ gap: 4 }}>
            <Text style={[typeScale.label, { color: colors.muted }]}>{t('Réponse correcte :', 'Bon repons :')}</Text>
            <MathText text={correctText} style={{ fontSize: 16, lineHeight: 23, color: colors.ink, fontFamily: fonts.bold }} />
          </View>
        ) : null}

        {blanks.length ? (
          <View style={{ gap: 6 }}>
            {blanks.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                {b.correct ? <Check color={colors.successInk} size={15} style={{ marginTop: 3 }} /> : <X color={colors.dangerInk} size={15} style={{ marginTop: 3 }} />}
                <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]}>
                  {b.label ? `${b.label} : ` : ''}
                  {b.correct ? String(b.userValue ?? '') : `${b.userValue || '—'} → ${b.expectedAnswer ?? ''}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {explanation ? (
          <View style={{ gap: 6 }}>
            <PressableScale onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
              <Text style={[typeScale.label, { color: colors.azureInk }]}>{open ? t('Masquer l’explication', 'Kache eksplikasyon an') : t('Voir l’explication', 'Wè eksplikasyon an')}</Text>
            </PressableScale>
            {open ? <MathText text={explanation} style={{ fontSize: 15, lineHeight: 22, color: colors.ink }} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
