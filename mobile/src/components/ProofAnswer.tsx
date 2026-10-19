import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Check, Lightbulb, Plus, X } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import { detectProofSubtype, JUSTIFICATION_OPTIONS } from '../../../shared/proofQuestion';
import { select } from '../utils/haptics';
import { MathChips, MathPreview } from './ExamAnswerInput';
import PressableScale from './ui/PressableScale';

/**
 * Proof / demonstration questions on the phone — the web's ProofInput
 * (src/pages/ExamTake.tsx): numbered steps, an optional justification per
 * step, progressive step hints, and a final-answer field when the kind of
 * question has one. Stored as the same JSON, { steps, finalAnswer }, which the
 * shared grader scores on `finalAnswer`. It used to be one free-text box.
 */
type Step = { math: string; justification: string };

function parse(value: string, blank: number): { steps: Step[]; finalAnswer: string } {
  const empty = { steps: Array.from({ length: blank }, () => ({ math: '', justification: '' })), finalAnswer: '' };
  if (!value) return empty;
  try {
    const p: any = JSON.parse(value);
    if (p && Array.isArray(p.steps)) return { steps: p.steps, finalAnswer: p.finalAnswer || '' };
    if (Array.isArray(p) && p.length) return { steps: p, finalAnswer: '' };
  } catch { /* a plain answer from before this input existed */ }
  return value.trim() ? { steps: [{ math: value, justification: '' }], finalAnswer: '' } : empty;
}

export default function ProofAnswer({ questionText, value, onChange }: {
  questionText: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const { radius, isDark } = useTheme();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const subtype = useMemo(() => detectProofSubtype(questionText), [questionText]);
  const { steps, finalAnswer } = useMemo(() => parse(value, subtype.scaffoldSteps.length), [value, subtype]);
  const [hints, setHints] = useState(0);
  const [justifyOpen, setJustifyOpen] = useState<number | null>(null);

  const save = (s: Step[], f: string) => {
    const empty = s.every((x) => !x.math.trim() && !x.justification) && !f.trim();
    onChange(empty ? '' : JSON.stringify({ steps: s, finalAnswer: f }));
  };
  const setStep = (i: number, field: keyof Step, v: string) => save(steps.map((x, k) => (k === i ? { ...x, [field]: v } : x)), finalAnswer);
  const done = steps.filter((x) => x.math?.trim()).length;

  const field = {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, minHeight: 48,
  } as const;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.azureSoft }}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 13, color: colors.azureInk }}>{subtype.label}</Text>
        </View>
        <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%`, height: 6, backgroundColor: colors.azureFill }} />
        </View>
        <Text style={[typeScale.meta, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>{done}/{steps.length}</Text>
      </View>

      {steps.map((step, i) => {
        const ok = !!step.math?.trim();
        const hint = subtype.scaffoldSteps[i]?.hint || '';
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? colors.successSoft : colors.surfaceAlt, marginTop: 2 }}>
              {ok ? <Check color={colors.success} size={15} strokeWidth={3} /> : <Text style={{ fontFamily: fonts.headingBold, fontSize: 13, color: colors.ink }}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typeScale.label, { flex: 1, color: colors.muted }]}>{t(`Étape ${i + 1}`, `Etap ${i + 1}`)}</Text>
                {steps.length > 1 ? (
                  <PressableScale
                    onPress={() => save(steps.filter((_, k) => k !== i), finalAnswer)}
                    accessibilityRole="button"
                    accessibilityLabel={t('Supprimer cette étape', 'Efase etap sa a')}
                    style={{ width: 44, height: 32, alignItems: 'flex-end', justifyContent: 'center' }}
                  >
                    <X color={colors.faint} size={16} />
                  </PressableScale>
                ) : null}
              </View>
              {i < hints && hint && !ok ? (
                <View style={{ flexDirection: 'row', gap: 6, padding: 10, borderRadius: 12, backgroundColor: colors.warnSoft }}>
                  <Lightbulb color={colors.warnInk} size={14} />
                  <Text style={[typeScale.caption, { flex: 1, color: colors.warnInk }]}>{hint}</Text>
                </View>
              ) : null}
              <MathChips onInsert={(c) => setStep(i, 'math', (step.math || '') + c)} />
              <TextInput
                value={step.math}
                onChangeText={(v) => setStep(i, 'math', v)}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                placeholder={t('Écris ton expression ici…', 'Ekri ekspresyon ou an isit la…')}
                placeholderTextColor={colors.faint}
                accessibilityLabel={t(`Étape ${i + 1} : expression`, `Etap ${i + 1} : ekspresyon`)}
                style={[field, { borderColor: ok ? colors.azure : colors.border }]}
              />
              <MathPreview value={step.math} />
              {justifyOpen === i || step.justification ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {JUSTIFICATION_OPTIONS.filter(Boolean).map((j) => {
                    const on = step.justification === j;
                    return (
                      <PressableScale
                        key={j}
                        onPress={() => { select(); setStep(i, 'justification', on ? '' : j); }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={j}
                        style={{ paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: on ? colors.azureFill : colors.surfaceAlt }}
                      >
                        <Text style={{ fontSize: 13, color: on ? '#ffffff' : colors.ink }}>{j}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
              ) : (
                <PressableScale onPress={() => setJustifyOpen(i)} accessibilityRole="button" accessibilityLabel={t('Ajouter une justification', 'Ajoute yon jistifikasyon')} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
                  <Text style={[typeScale.label, { color: colors.azureInk }]}>+ {t('Justification', 'Jistifikasyon')}</Text>
                </PressableScale>
              )}
            </View>
          </View>
        );
      })}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <PressableScale
          onPress={() => save([...steps, { math: '', justification: '' }], finalAnswer)}
          accessibilityRole="button"
          accessibilityLabel={t('Ajouter une étape', 'Ajoute yon etap')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 44, borderRadius: 999, backgroundColor: colors.surfaceAlt }}
        >
          <Plus color={colors.ink} size={16} />
          <Text style={[typeScale.label, { color: colors.ink }]}>{t('Ajouter une étape', 'Ajoute yon etap')}</Text>
        </PressableScale>
        {hints < subtype.scaffoldSteps.length ? (
          <PressableScale
            onPress={() => setHints((h) => h + 1)}
            accessibilityRole="button"
            accessibilityLabel={t('Obtenir un indice', 'Jwenn yon endis')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 44, borderRadius: 999, backgroundColor: colors.azureSoft }}
          >
            <Lightbulb color={colors.azureInk} size={16} />
            <Text style={[typeScale.label, { color: colors.azureInk }]}>{t('Obtenir un indice', 'Jwenn yon endis')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {subtype.askFinalAnswer ? (
        <View style={{ gap: 8, padding: 14, borderRadius: radius.card, backgroundColor: colors.surfaceAlt }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[typeScale.label, { flex: 1, color: colors.ink, fontFamily: fonts.headingBold }]}>{subtype.finalLabel || t('Résultat final', 'Rezilta final')}</Text>
            <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Vérifié automatiquement', 'Verifye otomatikman')}</Text>
          </View>
          <TextInput
            value={finalAnswer}
            onChangeText={(v) => save(steps, v)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            placeholder={t('Ta réponse finale…', 'Repons final ou…')}
            placeholderTextColor={colors.faint}
            accessibilityLabel={subtype.finalLabel || t('Résultat final', 'Rezilta final')}
            style={field}
          />
          <MathPreview value={finalAnswer} />
        </View>
      ) : null}
    </View>
  );
}
