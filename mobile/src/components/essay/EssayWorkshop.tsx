import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Lightbulb, ListChecks, NotebookPen, Zap } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../../theme/theme';
import {
  countWords, essayChecklist, planSlots, slotStarter, sujetKeyTerms, wordTarget, type EssayPlan,
} from '../../../../shared/essayWorkshop';
import { buildEssayGradeBody } from '../../../../shared/essayRegrade';
import { classifyEssayResponse, leanEssayFeedback } from '../../../../shared/essayGradeCore';
import { postEssayForGrading } from '../../services/essayGrading';
import { select, tapMedium } from '../../utils/haptics';
import PressableScale from '../ui/PressableScale';
import ExamFigure from '../ExamFigure';

/**
 * The essay workshop ("Atelier de rédaction") on the phone. Three steps, one
 * card: Planifier (problématique + a plan of STRUCTURAL slots with method
 * hints), Rédiger (one real essay, the plan folded above it, a word meter and
 * a live checklist), Retour (an AI practice grade with strengths, what to
 * improve, ONE thing to fix now and the criteria — then one rewrite).
 *
 * Rules shared with the web live in shared/essayWorkshop: the plan never
 * shows the expected ideas, the plan is never graded, and the final text is
 * graded by the existing essay grader at submission like any essay. The
 * practice grade here does not count; it exists so the student can improve.
 *
 * Look: the Stitch "Académie Digitale" mockups — segmented step bar, timeline
 * plan with Validé / À rédiger, azure-wash "une chose à corriger" card. No
 * left-border stripes, no hero band.
 */

export interface WorkshopState {
  step: 'plan' | 'write' | 'feedback';
  plan: EssayPlan;
  /** Practice feedback rounds used (max MAX_ROUNDS). */
  rounds: number;
  feedback?: Record<string, any> | null;
}

export const MAX_ROUNDS = 2; // one feedback, one rewrite, one more feedback

export const emptyWorkshop = (): WorkshopState => ({ step: 'plan', plan: { problematique: '', ideas: {} }, rounds: 0, feedback: null });

const STEPS: { key: WorkshopState['step']; fr: string; ht: string }[] = [
  { key: 'plan', fr: 'Planifier', ht: 'Planifye' },
  { key: 'write', fr: 'Rédiger', ht: 'Redije' },
  { key: 'feedback', fr: 'Retour', ht: 'Retou' },
];

export default function EssayWorkshop({ question, subject, level, value, onChange, state, onState, header }: {
  question: any;
  subject: string;
  level?: string;
  value: string;
  onChange: (v: string) => void;
  state: WorkshopState;
  onState: (s: WorkshopState) => void;
  header?: React.ReactNode;
}) {
  const colors = useColors();
  const { radius, isDark } = useTheme();
  const isCreole = useStore((s) => s.language) === 'ht';
  const signedIn = !!useStore((s) => s.user?.uid);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const tr = (x: { fr: string; ht: string }) => (isCreole ? x.ht : x.fr);

  const slots = useMemo(() => planSlots(question, subject), [question, subject]);
  const terms = useMemo(() => sujetKeyTerms(question), [question]);
  const target = wordTarget(question);
  const words = countWords(value);
  const checklist = essayChecklist(value, question, subject);
  const filled = slots.filter((s) => String(state.plan.ideas[s.key] ?? '').trim()).length;
  const [stuck, setStuck] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<WorkshopState>) => onState({ ...state, ...patch });
  const setIdea = (key: string, v: string) => set({ plan: { ...state.plan, ideas: { ...state.plan.ideas, [key]: v } } });

  const card = { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18 } as const;
  const field = {
    backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, lineHeight: 22, color: colors.ink, minHeight: 44,
  } as const;

  async function askFeedback() {
    if (busy || state.rounds >= MAX_ROUNDS) return;
    tapMedium();
    setBusy(true);
    setError(null);
    try {
      const resp = await postEssayForGrading(buildEssayGradeBody(question, value, { subject, level }));
      const outcome = classifyEssayResponse(resp);
      if (outcome === 'failed') throw new Error('failed');
      onState({ ...state, step: 'feedback', rounds: state.rounds + 1, feedback: leanEssayFeedback(resp) });
    } catch {
      setError(t('Le retour n’a pas pu être généré. Vérifie ta connexion et réessaie.', 'Nou pa t ka bay retou a. Tcheke koneksyon ou epi eseye ankò.'));
    } finally {
      setBusy(false);
    }
  }

  // ── Step bar ────────────────────────────────────────────────────────────
  const stepIdx = STEPS.findIndex((s) => s.key === state.step);
  const stepBar = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s, i) => (
          <View key={s.key} style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: i <= stepIdx ? colors.azureFill : colors.border }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {STEPS.map((s, i) => {
          const reachable = s.key !== 'feedback' || !!state.feedback;
          return (
            <PressableScale
              key={s.key}
              disabled={!reachable}
              onPress={() => { select(); set({ step: s.key }); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === stepIdx, disabled: !reachable }}
              accessibilityLabel={`${i + 1}. ${tr(s)}`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
            >
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: i === stepIdx ? colors.azureInk : colors.muted }}>{i + 1}</Text>
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, color: i === stepIdx ? colors.azureInk : reachable ? colors.ink : colors.faint }}>{tr(s)}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );

  // ── Sujet card (always on top) ────────────────────────────────────────────
  const sujet = (
    <View style={[card, { gap: 12 }]}>
      {header}
      <Text style={{ fontFamily: fonts.headingBold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>{t('SUJET', 'SIJÈ')}</Text>
      <Text style={{ fontFamily: fonts.headingBold, fontSize: 19, lineHeight: 27, color: colors.ink }}>
        {String(question?._displayText || question?.question || '')}
      </Text>
      {question?.has_figure && question?.figure_description ? <ExamFigure description={String(question.figure_description)} /> : null}
      {terms.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Text style={[typeScale.caption, { color: colors.muted, alignSelf: 'center' }]}>{t('Mots-clés :', 'Mo kle :')}</Text>
          {terms.map((w) => (
            <View key={w} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.azureSoft }}>
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 13, color: colors.azureInk }}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  // ── 1. Planifier ──────────────────────────────────────────────────────────
  if (state.step === 'plan') {
    return (
      <View style={{ gap: 16 }}>
        {stepBar}
        {sujet}
        <View style={[card, { gap: 10 }]}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Ta problématique en une phrase', 'Pwoblematik ou an yon fraz')}</Text>
          <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Quelle question précise le sujet te pose-t-il vraiment ?', 'Ki kesyon presi sijè a ap poze w vre ?')}</Text>
          <TextInput
            value={state.plan.problematique}
            onChangeText={(v) => set({ plan: { ...state.plan, problematique: v } })}
            multiline
            placeholder={t('En quoi… ?', 'Nan ki sans… ?')}
            placeholderTextColor={colors.faint}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            accessibilityLabel={t('Ta problématique', 'Pwoblematik ou')}
            style={[field, { minHeight: 64, textAlignVertical: 'top' }]}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink }}>{t('Ton plan', 'Plan ou')}</Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceAlt }}>
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: colors.muted }}>{t(`${filled} sur ${slots.length}`, `${filled} sou ${slots.length}`)}</Text>
          </View>
        </View>

        <View>
          {slots.map((s, i) => {
            const idea = String(state.plan.ideas[s.key] ?? '');
            const ok = !!idea.trim();
            const current = !ok && slots.slice(0, i).every((p) => String(state.plan.ideas[p.key] ?? '').trim());
            return (
              <View key={s.key} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 28, alignItems: 'center' }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: ok ? colors.azureSoft : current ? colors.azureFill : colors.surface,
                    borderWidth: ok || current ? 0 : 2, borderColor: colors.border, marginTop: 18,
                  }}>
                    {ok ? <Check color={colors.azureInk} size={15} strokeWidth={3} /> : (
                      <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: current ? '#ffffff' : colors.muted }}>{i + 1}</Text>
                    )}
                  </View>
                  {i < slots.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 }} /> : null}
                </View>
                <View style={[card, { flex: 1, marginBottom: 12, gap: 8, borderColor: current ? colors.azure : colors.border, borderWidth: current ? 1.5 : 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{`${i + 1}. ${tr(s.label)}`}</Text>
                    {ok ? (
                      <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: colors.azureInk }}>{t('Validé', 'Valide')}</Text>
                    ) : (
                      <PressableScale
                        onPress={() => { select(); setStuck(stuck === s.key ? null : s.key); }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Je bloque — un conseil de méthode', 'Mwen bloke — yon konsèy metòd')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 32, borderRadius: 999, backgroundColor: colors.azureSoft }}
                      >
                        <Lightbulb color={colors.azureInk} size={13} />
                        <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: colors.azureInk }}>{t('Je bloque', 'Mwen bloke')}</Text>
                      </PressableScale>
                    )}
                  </View>
                  <Text style={[typeScale.caption, { color: colors.muted }]}>{tr(s.hint)}</Text>
                  {stuck === s.key && slotStarter(s.key) ? (
                    <PressableScale
                      onPress={() => { select(); if (!idea.trim()) setIdea(s.key, tr(slotStarter(s.key)!)); }}
                      accessibilityRole="button"
                      accessibilityLabel={t('Utiliser ce début de phrase', 'Itilize kòmansman fraz sa a')}
                      style={{ flexDirection: 'row', gap: 6, padding: 10, borderRadius: 12, backgroundColor: colors.azureSoft }}
                    >
                      <Lightbulb color={colors.azureInk} size={14} style={{ marginTop: 2 }} />
                      <Text style={[typeScale.caption, { flex: 1, color: colors.ink }]}>
                        <Text style={{ fontFamily: fonts.bold }}>{t('Pour commencer : ', 'Pou kòmanse : ')}</Text>
                        {tr(slotStarter(s.key)!)}
                      </Text>
                    </PressableScale>
                  ) : null}
                  <TextInput
                    value={idea}
                    onChangeText={(v) => setIdea(s.key, v)}
                    multiline
                    placeholder={t('Ton idée…', 'Lide ou…')}
                    placeholderTextColor={colors.faint}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    accessibilityLabel={`${tr(s.label)} : ${t('ton idée', 'lide ou')}`}
                    style={field}
                  />
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[typeScale.meta, { flex: 1, color: colors.muted }]}>
            {t('Le plan n’est pas noté : c’est ton brouillon.', 'Plan an pa gen nòt : se bouyon ou.')}
          </Text>
          <PressableScale
            onPress={() => { tapMedium(); set({ step: 'write' }); }}
            accessibilityRole="button"
            accessibilityLabel={t('Rédiger', 'Redije')}
            style={{ paddingHorizontal: 22, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureFill }}
          >
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: '#ffffff' }}>{t('Rédiger →', 'Redije →')}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  // ── 2. Rédiger ────────────────────────────────────────────────────────────
  if (state.step === 'write') {
    const planned = slots.filter((s) => String(state.plan.ideas[s.key] ?? '').trim());
    const left = MAX_ROUNDS - state.rounds;
    return (
      <View style={{ gap: 16 }}>
        {stepBar}
        {sujet}
        {state.feedback && state.rounds < MAX_ROUNDS ? <FixNow feedback={state.feedback} t={t} /> : null}
        {planned.length || state.plan.problematique.trim() ? (
          <View style={card}>
            <PressableScale onPress={() => setPlanOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: planOpen }} accessibilityLabel={t('Ton plan', 'Plan ou')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
              <NotebookPen color={colors.azureInk} size={18} />
              <Text style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Ton plan', 'Plan ou')}</Text>
              {planOpen ? <ChevronUp color={colors.muted} size={18} /> : <ChevronDown color={colors.muted} size={18} />}
            </PressableScale>
            {planOpen ? (
              <View style={{ gap: 10, marginTop: 12 }}>
                {state.plan.problematique.trim() ? (
                  <Text style={[typeScale.bodyMd, { color: colors.ink, fontStyle: 'italic' }]}>{state.plan.problematique.trim()}</Text>
                ) : null}
                {planned.map((s, i) => (
                  <View key={s.key} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
                      <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, color: colors.azureInk }}>{i + 1}</Text>
                    </View>
                    <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]}>
                      <Text style={{ fontFamily: fonts.bold }}>{tr(s.label)} : </Text>
                      {String(state.plan.ideas[s.key]).trim()}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[card, { gap: 12 }]}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>{t('ZONE DE RÉDACTION', 'ZÒN REDAKSYON')}</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            multiline
            scrollEnabled={false}
            placeholder={t('Rédige ta copie ici. Saute une ligne entre chaque partie de ton plan.', 'Ekri kopi ou isit la. Sote yon liy ant chak pati plan ou.')}
            placeholderTextColor={colors.faint}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            accessibilityLabel={t('Ta rédaction', 'Redaksyon ou')}
            style={{ minHeight: 260, fontSize: 17, lineHeight: 26, color: colors.ink, textAlignVertical: 'top' }}
          />
          <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={[typeScale.caption, { flex: 1, color: colors.muted }]}>{t('Compteur de mots', 'Kantite mo')}</Text>
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 13, color: colors.azureInk, fontVariant: ['tabular-nums'] }}>{words} / {target} {t('mots', 'mo')}</Text>
            </View>
            <View style={{ height: 4, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, Math.round((words / target) * 100))}%`, height: 4, backgroundColor: colors.azureFill }} />
            </View>
          </View>
        </View>

        <View style={[card, { gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <ListChecks color={colors.ink} size={18} />
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Ta liste', 'Lis ou')}</Text>
          </View>
          {checklist.map((c) => (
            <View key={c.key} accessible accessibilityLabel={`${tr(c.label)} : ${c.ok ? t('fait', 'fèt') : t('pas encore', 'poko')}`} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 44, borderRadius: 12,
              backgroundColor: c.ok ? colors.azureSoft : 'transparent', borderWidth: 1, borderColor: c.ok ? 'transparent' : colors.border,
            }}>
              <View style={{ width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ok ? colors.azureFill : 'transparent', borderWidth: c.ok ? 0 : 1.5, borderColor: colors.border }}>
                {c.ok ? <Check color="#ffffff" size={12} strokeWidth={3} /> : null}
              </View>
              <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink, fontFamily: c.ok ? fonts.bold : undefined }]}>{tr(c.label)}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={[typeScale.caption, { color: colors.warnInk }]}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressableScale
            onPress={() => set({ step: 'plan' })}
            accessibilityRole="button"
            accessibilityLabel={t('Revenir au plan', 'Retounen nan plan an')}
            style={{ flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink }}>{t('Plan', 'Plan')}</Text>
          </PressableScale>
          {signedIn && left > 0 ? (
            <PressableScale
              onPress={askFeedback}
              disabled={busy || words < 30}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || words < 30 }}
              accessibilityLabel={t('Obtenir un retour', 'Jwenn yon retou')}
              style={{ flex: 2, flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: words < 30 ? colors.surfaceAlt : colors.azureFill }}
            >
              {busy ? <ActivityIndicator color="#ffffff" /> : null}
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: words < 30 ? colors.muted : '#ffffff' }}>
                {busy ? t('Lecture de ta copie…', 'N ap li kopi ou…') : state.rounds === 0 ? t('Obtenir un retour', 'Jwenn yon retou') : t('Nouveau retour (dernier)', 'Nouvo retou (dènye)')}
              </Text>
            </PressableScale>
          ) : null}
        </View>
        {!signedIn ? (
          <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Connecte-toi pour obtenir un retour sur ta copie avant de la remettre.', 'Konekte pou w jwenn yon retou sou kopi ou anvan ou remèt li.')}</Text>
        ) : null}
        {words < 30 && signedIn && left > 0 ? (
          <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Écris au moins 30 mots pour obtenir un retour.', 'Ekri omwen 30 mo pou w jwenn yon retou.')}</Text>
        ) : null}
      </View>
    );
  }

  // ── 3. Retour ─────────────────────────────────────────────────────────────
  const fb = state.feedback ?? {};
  const strengths: string[] = Array.isArray(fb.strengths) ? fb.strengths : [];
  const improvements: string[] = Array.isArray(fb.improvements) ? fb.improvements : [];
  const criteria: { label: string; level: number; comment?: string }[] = Array.isArray(fb.criteria) ? fb.criteria : [];
  const canRewrite = state.rounds < MAX_ROUNDS;
  return (
    <View style={{ gap: 16 }}>
      {stepBar}
      <View style={[card, { alignItems: 'center', gap: 6, paddingVertical: 22 }]}>
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 12, letterSpacing: 0.8, color: colors.muted }}>{t('ÉVALUATION FORMATIVE', 'EVALYASYON FÒMATIV')}</Text>
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 40, lineHeight: 46, color: colors.azureInk, fontVariant: ['tabular-nums'] }}>{String(fb.score ?? '—')}</Text>
        <Text style={[typeScale.bodyMd, { color: colors.muted, textAlign: 'center' }]}>
          {t('Retour d’entraînement — ta copie n’est pas encore remise et cette note ne compte pas.', 'Retou pou pratike — ou poko remèt kopi ou e nòt sa a pa konte.')}
        </Text>
      </View>

      <FixNow feedback={fb} t={t} />

      {strengths.length ? (
        <View style={[card, { gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CircleCheck color={colors.azureInk} size={20} />
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Ce qui marche', 'Sa k mache')}</Text>
          </View>
          {strengths.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Check color={colors.azureInk} size={15} style={{ marginTop: 4 }} />
              <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {improvements.length > 1 ? (
        <View style={[card, { gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CircleAlert color={colors.warnInk} size={20} />
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('À améliorer', 'Pou amelyore')}</Text>
          </View>
          {improvements.slice(1).map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: colors.warnInk, fontFamily: fonts.headingBold }}>–</Text>
              <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {criteria.length ? (
        <View style={[card, { gap: 12 }]}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Critères', 'Kritè')}</Text>
          {criteria.map((c, i) => (
            <View key={i} accessible accessibilityLabel={`${c.label} : ${c.level} sur 2`} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]}>{c.label}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[0, 1, 2].map((d) => (
                    <View key={d} style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: d <= c.level ? colors.azureFill : colors.border }} />
                  ))}
                </View>
              </View>
              {c.comment ? <Text style={[typeScale.caption, { color: colors.muted }]}>{c.comment}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PressableScale
          onPress={() => set({ step: 'write' })}
          accessibilityRole="button"
          accessibilityLabel={t('Garder ma copie', 'Kenbe kopi mwen')}
          style={{ flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink }}>{t('Garder ma copie', 'Kenbe kopi mwen')}</Text>
        </PressableScale>
        {canRewrite ? (
          <PressableScale
            onPress={() => { tapMedium(); set({ step: 'write' }); }}
            accessibilityRole="button"
            accessibilityLabel={t('Réécrire', 'Reekri')}
            style={{ flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureFill }}
          >
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, color: '#ffffff' }}>{t('Réécrire (1 essai)', 'Reekri (1 esè)')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <Text style={[typeScale.caption, { color: colors.muted }]}>
        {t('Ta copie sera notée quand tu remettras l’examen. Les idées attendues s’affichent après la remise.', 'Y ap bay kopi ou nòt lè w remèt egzamen an. Lide yo te atann yo parèt apre ou remèt.')}
      </Text>
    </View>
  );
}

/** The ONE thing to fix next — the first improvement, on the azure wash. */
function FixNow({ feedback, t }: { feedback: Record<string, any>; t: (fr: string, ht: string) => string }) {
  const colors = useColors();
  const first = Array.isArray(feedback?.improvements) && feedback.improvements[0]
    ? String(feedback.improvements[0])
    : String(feedback?.feedback ?? '');
  if (!first.trim()) return null;
  return (
    <View style={{ padding: 18, borderRadius: 20, backgroundColor: colors.azureSoft, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Zap color={colors.azureInk} size={18} />
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>{t('Une chose à corriger maintenant', 'Yon bagay pou korije kounye a')}</Text>
      </View>
      <Text style={[typeScale.bodyMd, { color: colors.ink, lineHeight: 22 }]}>{first}</Text>
    </View>
  );
}
