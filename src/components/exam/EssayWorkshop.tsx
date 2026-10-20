import React, { createContext, useContext, useMemo, useState } from 'react';
import useStore from '../../contexts/store';
import { authedFetch } from '../../services/firebase';
import {
  countWords, essayChecklist, planSlots, slotStarter, sujetKeyTerms, wordTarget, type EssayPlan,
} from '../../../shared/essayWorkshop';
import { buildEssayGradeBody } from '../../../shared/essayRegrade';
import { classifyEssayResponse, leanEssayFeedback, ESSAY_GRADE_TIMEOUT_MS } from '../../../shared/essayGradeCore';
import './EssayWorkshop.css';

/**
 * The essay workshop ("Atelier de rédaction") on the web — the same three
 * steps as the phone (mobile/src/components/essay/EssayWorkshop.tsx), from the
 * same rules (shared/essayWorkshop): Planifier with STRUCTURAL slots and
 * method hints, Rédiger with the plan beside the essay and a live checklist,
 * Retour with an AI practice grade (does not count) and one rewrite.
 *
 * It replaces the essay "ladder" — 3–4 one-line boxes whose labels were the
 * model answer in 91 essays, graded as fuzzy one-liners — with one real
 * essay, graded at submission by the essay grader.
 */

export interface WorkshopState {
  step: 'plan' | 'write' | 'feedback';
  plan: EssayPlan;
  rounds: number;
  feedback?: Record<string, any> | null;
}

export const MAX_ROUNDS = 2;
export const emptyWorkshop = (): WorkshopState => ({ step: 'plan', plan: { problematique: '', ideas: {} }, rounds: 0, feedback: null });

/** ExamTake provides the per-question state (saved with the draft as `essayWorkshop`). */
export const EssayWorkshopContext = createContext<{
  get: (idx: number) => WorkshopState;
  set: (idx: number, s: WorkshopState) => void;
  subject?: string;
  level?: string;
} | null>(null);

const STEPS: { key: WorkshopState['step']; fr: string; ht: string }[] = [
  { key: 'plan', fr: 'Planifier', ht: 'Planifye' },
  { key: 'write', fr: 'Rédiger', ht: 'Redije' },
  { key: 'feedback', fr: 'Retour', ht: 'Retou' },
];

export default function EssayWorkshop({ question, index, value, onChange, disabled }: {
  question: any;
  index: number;
  value: string;
  onChange: (index: number, v: string) => void;
  disabled?: boolean;
}) {
  const ctx = useContext(EssayWorkshopContext);
  const language = useStore((s: any) => s.language);
  const signedIn = !!useStore((s: any) => s.user?.uid);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const tr = (x: { fr: string; ht: string }) => (isCreole ? x.ht : x.fr);
  const subject = ctx?.subject ?? '';

  const [local, setLocal] = useState<WorkshopState>(emptyWorkshop);
  const state = ctx ? ctx.get(index) : local;
  const setState = (s: WorkshopState) => (ctx ? ctx.set(index, s) : setLocal(s));
  const set = (patch: Partial<WorkshopState>) => setState({ ...state, ...patch });

  const slots = useMemo(() => planSlots(question, subject), [question, subject]);
  const terms = useMemo(() => sujetKeyTerms(question), [question]);
  const text = String(value ?? '');
  const target = wordTarget(question);
  const words = countWords(text);
  const checklist = essayChecklist(text, question, subject);
  const filled = slots.filter((s) => String(state.plan.ideas[s.key] ?? '').trim()).length;
  const [stuck, setStuck] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function askFeedback() {
    if (busy || state.rounds >= MAX_ROUNDS) return;
    setBusy(true);
    setError('');
    try {
      const res = await authedFetch('/api/grade-essay', buildEssayGradeBody(question, text, { subject, level: ctx?.level }), { timeoutMs: ESSAY_GRADE_TIMEOUT_MS });
      const resp = res.ok ? await res.json() : null;
      if (classifyEssayResponse(resp) === 'failed') throw new Error('failed');
      setState({ ...state, step: 'feedback', rounds: state.rounds + 1, feedback: leanEssayFeedback(resp) });
    } catch {
      setError(t('Le retour n’a pas pu être généré. Vérifie ta connexion et réessaie.', 'Nou pa t ka bay retou a. Tcheke koneksyon ou epi eseye ankò.'));
    } finally {
      setBusy(false);
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.key === state.step);
  const stepBar = (
    <div className="ew-steps" role="tablist" aria-label={t('Étapes de la rédaction', 'Etap redaksyon an')}>
      {STEPS.map((s, i) => {
        const reachable = s.key !== 'feedback' || !!state.feedback;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === stepIdx}
            disabled={!reachable}
            className={`ew-step${i <= stepIdx ? ' is-on' : ''}${i === stepIdx ? ' is-current' : ''}`}
            onClick={() => set({ step: s.key })}
          >
            <span className="ew-step__bar" />
            <span className="ew-step__label"><b>{i + 1}</b> {tr(s)}</span>
          </button>
        );
      })}
    </div>
  );

  // The page already prints the sujet and its figure above the input, so the
  // web keeps only the key terms here (the phone's card carries the sujet).
  const sujet = terms.length ? (
    <div className="ew-terms">
      <span>{t('Mots-clés du sujet :', 'Mo kle sijè a :')}</span>
      {terms.map((w) => <span key={w} className="ew-chip">{w}</span>)}
    </div>
  ) : null;

  if (state.step === 'plan') {
    return (
      <div className="ew">
        {stepBar}
        {sujet}
        <div className="ew-card">
          <label className="ew-h3" htmlFor={`ew-pb-${index}`}>{t('Ta problématique en une phrase', 'Pwoblematik ou an yon fraz')}</label>
          <p className="ew-muted">{t('Quelle question précise le sujet te pose-t-il vraiment ?', 'Ki kesyon presi sijè a ap poze w vre ?')}</p>
          <textarea
            id={`ew-pb-${index}`}
            className="ew-field"
            rows={2}
            value={state.plan.problematique}
            onChange={(e) => set({ plan: { ...state.plan, problematique: e.target.value } })}
            placeholder={t('En quoi… ?', 'Nan ki sans… ?')}
            disabled={disabled}
          />
        </div>
        <div className="ew-plan-head">
          <h3 className="ew-h2">{t('Ton plan', 'Plan ou')}</h3>
          <span className="ew-badge">{t(`${filled} sur ${slots.length}`, `${filled} sou ${slots.length}`)}</span>
        </div>
        <ol className="ew-timeline">
          {slots.map((s, i) => {
            const idea = String(state.plan.ideas[s.key] ?? '');
            const ok = !!idea.trim();
            const current = !ok && slots.slice(0, i).every((p) => String(state.plan.ideas[p.key] ?? '').trim());
            return (
              <li key={s.key} className={`ew-slot${ok ? ' is-done' : ''}${current ? ' is-current' : ''}`}>
                <span className="ew-node" aria-hidden="true">{ok ? '✓' : i + 1}</span>
                <div className="ew-card ew-slot__card">
                  <div className="ew-slot__top">
                    <span className="ew-h3">{`${i + 1}. ${tr(s.label)}`}</span>
                    {ok ? <span className="ew-valid">{t('Validé', 'Valide')}</span> : (
                      <button type="button" className="ew-stuck" onClick={() => setStuck(stuck === s.key ? null : s.key)} aria-expanded={stuck === s.key}>
                        {t('Je bloque', 'Mwen bloke')}
                      </button>
                    )}
                  </div>
                  <p className="ew-hint">{tr(s.hint)}</p>
                  {stuck === s.key && slotStarter(s.key) ? (
                    <button
                      type="button"
                      className="ew-starter"
                      onClick={() => { if (!idea.trim()) set({ plan: { ...state.plan, ideas: { ...state.plan.ideas, [s.key]: tr(slotStarter(s.key)!) } } }); }}
                    >
                      <b>{t('Pour commencer : ', 'Pou kòmanse : ')}</b>{tr(slotStarter(s.key)!)}
                    </button>
                  ) : null}
                  <textarea
                    className="ew-field"
                    rows={1}
                    aria-label={`${tr(s.label)} : ${t('ton idée', 'lide ou')}`}
                    value={idea}
                    onChange={(e) => set({ plan: { ...state.plan, ideas: { ...state.plan.ideas, [s.key]: e.target.value } } })}
                    placeholder={t('Ton idée…', 'Lide ou…')}
                    disabled={disabled}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="ew-actions">
          <span className="ew-muted">{t('Le plan n’est pas noté : c’est ton brouillon.', 'Plan an pa gen nòt : se bouyon ou.')}</span>
          <button type="button" className="ew-btn ew-btn--primary" onClick={() => set({ step: 'write' })}>{t('Rédiger →', 'Redije →')}</button>
        </div>
      </div>
    );
  }

  if (state.step === 'write') {
    const planned = slots.filter((s) => String(state.plan.ideas[s.key] ?? '').trim());
    const left = MAX_ROUNDS - state.rounds;
    return (
      <div className="ew">
        {stepBar}
        {sujet}
        {state.feedback && state.rounds < MAX_ROUNDS ? <FixNow feedback={state.feedback} t={t} /> : null}
        {planned.length || state.plan.problematique.trim() ? (
          <div className="ew-card">
            <button type="button" className="ew-fold" aria-expanded={planOpen} onClick={() => setPlanOpen((o) => !o)}>
              <span className="ew-h3">{t('Ton plan', 'Plan ou')}</span>
              <span aria-hidden="true">{planOpen ? '▴' : '▾'}</span>
            </button>
            {planOpen ? (
              <div className="ew-planlist">
                {state.plan.problematique.trim() ? <p className="ew-problem">{state.plan.problematique.trim()}</p> : null}
                {planned.map((s, i) => (
                  <p key={s.key}><span className="ew-num">{i + 1}</span><b>{tr(s.label)} :</b> {String(state.plan.ideas[s.key]).trim()}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="ew-card">
          <div className="ew-eyebrow">{t('Zone de rédaction', 'Zòn redaksyon')}</div>
          <textarea
            className="ew-essay"
            value={text}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder={t('Rédige ta copie ici. Saute une ligne entre chaque partie de ton plan.', 'Ekri kopi ou isit la. Sote yon liy ant chak pati plan ou.')}
            aria-label={t('Ta rédaction', 'Redaksyon ou')}
            disabled={disabled}
          />
          <div className="ew-meter">
            <span>{t('Compteur de mots', 'Kantite mo')}</span>
            <b>{words} / {target} {t('mots', 'mo')}</b>
          </div>
          <div className="ew-track"><span style={{ width: `${Math.min(100, Math.round((words / target) * 100))}%` }} /></div>
        </div>
        <div className="ew-card">
          <h3 className="ew-h3">{t('Ta liste', 'Lis ou')}</h3>
          <ul className="ew-check">
            {checklist.map((c) => (
              <li key={c.key} className={c.ok ? 'is-ok' : ''}>
                <span className="ew-dot" aria-hidden="true">{c.ok ? '✓' : ''}</span>
                {tr(c.label)}<span className="ew-sr">{c.ok ? t(' — fait', ' — fèt') : t(' — pas encore', ' — poko')}</span>
              </li>
            ))}
          </ul>
        </div>
        {error ? <p className="ew-error" role="alert">{error}</p> : null}
        <div className="ew-actions">
          <button type="button" className="ew-btn" onClick={() => set({ step: 'plan' })}>{t('Plan', 'Plan')}</button>
          {signedIn && left > 0 ? (
            <button type="button" className="ew-btn ew-btn--primary" onClick={askFeedback} disabled={busy || words < 30 || disabled}>
              {busy ? t('Lecture de ta copie…', 'N ap li kopi ou…') : state.rounds === 0 ? t('Obtenir un retour', 'Jwenn yon retou') : t('Nouveau retour (dernier)', 'Nouvo retou (dènye)')}
            </button>
          ) : null}
        </div>
        {!signedIn ? <p className="ew-muted">{t('Connecte-toi pour obtenir un retour sur ta copie avant de la remettre.', 'Konekte pou w jwenn yon retou sou kopi ou anvan ou remèt li.')}</p> : null}
        {words < 30 && signedIn && left > 0 ? <p className="ew-muted">{t('Écris au moins 30 mots pour obtenir un retour.', 'Ekri omwen 30 mo pou w jwenn yon retou.')}</p> : null}
      </div>
    );
  }

  const fb = state.feedback ?? {};
  const strengths: string[] = Array.isArray(fb.strengths) ? fb.strengths : [];
  const improvements: string[] = Array.isArray(fb.improvements) ? fb.improvements : [];
  const criteria: { label: string; level: number; comment?: string }[] = Array.isArray(fb.criteria) ? fb.criteria : [];
  return (
    <div className="ew">
      {stepBar}
      <div className="ew-card ew-score">
        <div className="ew-eyebrow">{t('Évaluation formative', 'Evalyasyon fòmativ')}</div>
        <div className="ew-score__num">{String(fb.score ?? '—')}</div>
        <p className="ew-muted">{t('Retour d’entraînement — ta copie n’est pas encore remise et cette note ne compte pas.', 'Retou pou pratike — ou poko remèt kopi ou e nòt sa a pa konte.')}</p>
      </div>
      <FixNow feedback={fb} t={t} />
      {strengths.length ? (
        <div className="ew-card"><h3 className="ew-h3">{t('Ce qui marche', 'Sa k mache')}</h3>
          <ul className="ew-list ew-list--ok">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      ) : null}
      {improvements.length > 1 ? (
        <div className="ew-card"><h3 className="ew-h3">{t('À améliorer', 'Pou amelyore')}</h3>
          <ul className="ew-list ew-list--warn">{improvements.slice(1).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      ) : null}
      {criteria.length ? (
        <div className="ew-card"><h3 className="ew-h3">{t('Critères', 'Kritè')}</h3>
          <ul className="ew-criteria">
            {criteria.map((c, i) => (
              <li key={i}>
                <span>{c.label}</span>
                <span className="ew-dots" aria-label={`${c.level} / 2`}>{[0, 1, 2].map((d) => <i key={d} className={d <= c.level ? 'on' : ''} />)}</span>
                {c.comment ? <small>{c.comment}</small> : null}
              </li>
            ))}
          </ul></div>
      ) : null}
      <div className="ew-actions">
        <button type="button" className="ew-btn" onClick={() => set({ step: 'write' })}>{t('Garder ma copie', 'Kenbe kopi mwen')}</button>
        {state.rounds < MAX_ROUNDS ? (
          <button type="button" className="ew-btn ew-btn--primary" onClick={() => set({ step: 'write' })}>{t('Réécrire (1 essai)', 'Reekri (1 esè)')}</button>
        ) : null}
      </div>
      <p className="ew-muted">{t('Ta copie sera notée quand tu remettras l’examen. Les idées attendues s’affichent après la remise.', 'Y ap bay kopi ou nòt lè w remèt egzamen an. Lide yo te atann yo parèt apre ou remèt.')}</p>
    </div>
  );
}

function FixNow({ feedback, t }: { feedback: Record<string, any>; t: (fr: string, ht: string) => string }) {
  const first = Array.isArray(feedback?.improvements) && feedback.improvements[0]
    ? String(feedback.improvements[0])
    : String(feedback?.feedback ?? '');
  if (!first.trim()) return null;
  return (
    <div className="ew-fix">
      <h3 className="ew-h3">{t('Une chose à corriger maintenant', 'Yon bagay pou korije kounye a')}</h3>
      <p>{first}</p>
    </div>
  );
}
