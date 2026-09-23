import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Pause, Play, Check, X, RotateCcw, Target, NotebookPen, Languages, SkipForward, ShieldCheck } from 'lucide-react';
import { useTrivia } from '../../hooks/useTrivia';
import { useFocusMode } from '../../hooks/useFocusMode';
import { drawAndRemember } from '../../utils/questionRotation';
import { triviaOptions, triviaExplanation, trackTriviaEvent as trackEvent } from '../../utils/triviaLearning';
import {
  SPRINT_DURATIONS, accuracy, formatClock, loadBank, saveBank, updateBank, loadHistory, saveHistory,
  appendHistory, sessionFromResults, mastery, loadScratch, saveScratch,
  type SprintQuestion, type BankItem,
} from './sprintLogic';

/**
 * Sprint solo — Ted's "Station Sprint Solo" mockup, wired to what exists.
 *
 *   HUD        topic, question N/total, live accuracy (correct ÷ answered),
 *              a global countdown (3/5/10 min) with pause
 *   card       the bank's own question, a FR/HT toggle that uses the real
 *              Kreyòl text when the bank has it, 1–4 + Enter, "Valider & voir
 *              l'explication" showing the question's real explanation, Passer
 *   scratchpad a textarea saved on this device for this session
 *   sidebar    the error bank (missed questions, this device) with Refaire and
 *              "Session zéro faute", and mastery per topic computed from the
 *              sprints actually played here
 *
 * Left out of the mockup because nothing backs it: a Bac score predictor,
 * "Top 5%" speed ranks, SQLite/offline claims, audio reading, and a hint —
 * the bank carries no hints, and the explanation would give the answer away.
 * XP goes through the same recordResult as a normal round.
 */
type Result = { question: SprintQuestion; selected: number; correct: boolean };
type Screen = 'setup' | 'play' | 'done';
type Mode = { kind: 'topic'; category: string } | { kind: 'bank'; items: SprintQuestion[] };

const POOL_MAX = 60;

export default function SprintSolo({ isCreole, categories, questionsMap, onPlaying }: {
  isCreole: boolean;
  onPlaying?: (playing: boolean) => void;
  categories: any[];
  questionsMap: Record<string, any[]>;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { recordResult, isAuthed } = useTrivia();

  const [screen, setScreen] = useState<Screen>('setup');
  const [category, setCategory] = useState<string>('mixed');
  const [minutes, setMinutes] = useState<number>(5);
  const [mode, setMode] = useState<Mode>({ kind: 'topic', category: 'mixed' });
  const [pool, setPool] = useState<SprintQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const [paused, setPaused] = useState(false);
  const [showHt, setShowHt] = useState(isCreole);
  const [sessionId, setSessionId] = useState('');
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratch, setScratch] = useState('');
  const [bank, setBank] = useState<BankItem[]>(() => loadBank());
  const [history, setHistory] = useState(() => loadHistory());
  const [reward, setReward] = useState<any>(null);
  const finishedRef = useRef(false);
  const startedAt = useRef(0);

  useFocusMode(screen === 'play');
  useEffect(() => { onPlaying?.(screen === 'play'); }, [screen, onPlaying]);
  useEffect(() => { setShowHt(isCreole); }, [isCreole]);

  const catName = useCallback((id: string) => {
    if (id === 'mixed') return t('Mélange de thèmes', 'Melanj tèm');
    if (id === 'bank') return t('Zéro faute', 'Zewo fot');
    const c = categories.find((x) => x.id === id);
    return c ? (isCreole ? c.nameHt || c.name : c.name) : id;
  }, [categories, isCreole]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPool = useCallback((cat: string): SprintQuestion[] => {
    const tagged = (c: string, list: any[]) => (list || []).map((q) => ({ ...q, category: c }));
    const bankList = cat === 'mixed'
      ? Object.entries(questionsMap).flatMap(([c, list]) => tagged(c, list))
      : tagged(cat, questionsMap[cat]);
    return drawAndRemember(`sprint-${cat}`, bankList, POOL_MAX) as SprintQuestion[];
  }, [questionsMap]);

  const start = useCallback((next: Mode) => {
    const qs = next.kind === 'bank' ? next.items : buildPool(next.category);
    if (!qs.length) return;
    finishedRef.current = false;
    startedAt.current = Date.now();
    const id = `${Date.now().toString(36)}`;
    setSessionId(id);
    setScratch(loadScratch(id));
    setMode(next);
    setPool(qs);
    setIdx(0);
    setSelected(null);
    setChecked(false);
    setResults([]);
    setSkipped(0);
    setReward(null);
    setPaused(false);
    setSecondsLeft(minutes * 60);
    setScreen('play');
    trackEvent('sprint_start', { category: next.kind === 'bank' ? 'bank' : next.category, minutes, pool: qs.length });
  }, [buildPool, minutes]);

  const finish = useCallback((final: Result[]) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setScreen('done');
    const nextBank = updateBank(loadBank(), final);
    saveBank(nextBank);
    setBank(nextBank);
    const nextHistory = appendHistory(loadHistory(), sessionFromResults(final));
    saveHistory(nextHistory);
    setHistory(nextHistory);
    const correct = final.filter((r) => r.correct).length;
    trackEvent('sprint_complete', { answered: final.length, correct });
    if (final.length > 0) {
      const cat = mode.kind === 'bank' ? 'mixed' : mode.category;
      recordResult({ category: cat, score: correct, total: final.length, isDaily: false })
        .then(setReward).catch(() => {});
    }
  }, [mode, recordResult]);

  // Countdown — runs only while playing and not paused.
  useEffect(() => {
    if (screen !== 'play' || paused) return undefined;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [screen, paused]);
  useEffect(() => {
    if (screen === 'play' && secondsLeft <= 0) finish(results);
  }, [secondsLeft, screen, finish, results]);

  const q = pool[idx];
  const opts = q ? triviaOptions(q, showHt) : [];

  const validate = useCallback(() => {
    if (!q || selected === null || checked || paused) return;
    setChecked(true);
    setResults((r) => [...r, { question: q, selected, correct: selected === q.answer }]);
  }, [q, selected, checked, paused]);

  const next = useCallback(() => {
    if (!checked) return;
    if (idx + 1 >= pool.length) { finish(results); return; }
    setIdx((i) => i + 1);
    setSelected(null);
    setChecked(false);
  }, [checked, idx, pool.length, finish, results]);

  const skip = useCallback(() => {
    if (checked || paused) return;
    setSkipped((s) => s + 1);
    if (idx + 1 >= pool.length) { finish(results); return; }
    setIdx((i) => i + 1);
    setSelected(null);
  }, [checked, paused, idx, pool.length, finish, results]);

  // 1–4 pick, Enter validates then advances. Ignored while typing.
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (['1', '2', '3', '4'].includes(e.key) && !checked && !paused) {
        const i = Number(e.key) - 1;
        if (i < opts.length) setSelected(i);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (checked) next(); else validate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, checked, paused, opts.length, next, validate]);

  const correctCount = results.filter((r) => r.correct).length;
  const acc = accuracy(correctCount, results.length);
  const totalSeconds = minutes * 60;
  const masteryRows = useMemo(() => mastery(history), [history]);
  const mistakes = results.filter((r) => !r.correct);

  const sidebar = (
    <aside className="sprint-side" aria-label={t('Tes outils', 'Zouti ou')}>
      <section className="sprint-panel">
        <div className="sprint-panel__head">
          <h3>{t('Banque d’erreurs', 'Bank erè')}</h3>
          {bank.length > 0 && <span className="sprint-pill sprint-pill--red">{bank.length}</span>}
        </div>
        {bank.length === 0 ? (
          <p className="sprint-muted">
            {t('Tes questions ratées en sprint s’enregistrent ici, sur cet appareil.', 'Kesyon ou rate nan sprint anrejistre isit la, sou aparèy sa a.')}
          </p>
        ) : (
          <>
            <ul className="sprint-bank">
              {bank.slice(0, 5).map((b) => (
                <li key={b.key}>
                  <span className="sprint-bank__q">{showHt ? b.question.qHt || b.question.q : b.question.q}</span>
                  <span className="sprint-bank__meta">{catName(b.question.category || 'mixed')}{b.misses > 1 ? ` · ${b.misses}×` : ''}</span>
                  <button type="button" className="sprint-link" disabled={screen === 'play'} onClick={() => start({ kind: 'bank', items: [b.question] })}>
                    {t('Refaire', 'Refè')}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="sprint-btn sprint-btn--ghost sprint-btn--block" disabled={screen === 'play'}
              onClick={() => start({ kind: 'bank', items: bank.map((b) => b.question) })}>
              <ShieldCheck size={16} aria-hidden="true" /> {t(`Session zéro faute (${bank.length})`, `Sesyon zewo fot (${bank.length})`)}
            </button>
          </>
        )}
      </section>

      {masteryRows.length > 0 && (
        <section className="sprint-panel">
          <div className="sprint-panel__head"><h3>{t('Ta maîtrise par thème', 'Metriz ou pa tèm')}</h3></div>
          <ul className="sprint-mastery">
            {masteryRows.slice(0, 6).map((m) => (
              <li key={m.category} data-level={m.pct >= 80 ? 'high' : m.pct >= 50 ? 'mid' : 'low'}>
                <div className="sprint-mastery__row">
                  <span>{catName(m.category)}</span>
                  <strong>{m.pct}%</strong>
                </div>
                <span className="sprint-meter"><span style={{ width: `${m.pct}%` }} /></span>
                <small>{t(`${m.correct}/${m.answered} justes`, `${m.correct}/${m.answered} kòrèk`)}</small>
              </li>
            ))}
          </ul>
          <p className="sprint-muted">{t('Calculé sur tes sprints joués sur cet appareil.', 'Kalkile sou sprint ou jwe sou aparèy sa a.')}</p>
        </section>
      )}
    </aside>
  );

  /* ── Setup ── */
  if (screen === 'setup') {
    return (
      <div className="sprint">
        <div className="sprint-main">
          <section className="sprint-card">
            <span className="sprint-pill"><Timer size={14} aria-hidden="true" /> {t('Vitesse & précision', 'Vitès ak presizyon')}</span>
            <h2 className="sprint-title">{t('Sprint solo', 'Sprint solo')}</h2>
            <p className="sprint-muted">
              {t('Réponds à un maximum de questions avant la fin du chrono. Chaque réponse montre son explication.', 'Reponn otan kesyon posib anvan kwonomèt la fini. Chak repons montre eksplikasyon li.')}
            </p>
            <div className="sprint-field">
              <span>{t('Thème', 'Tèm')}</span>
              <div className="sprint-chips">
                {['mixed', ...categories.map((c) => c.id)].map((id) => (
                  <button key={id} type="button" className={`sprint-chip${category === id ? ' is-on' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}>
                    {catName(id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="sprint-field">
              <span>{t('Durée', 'Dire')}</span>
              <div className="sprint-chips">
                {SPRINT_DURATIONS.map((m) => (
                  <button key={m} type="button" className={`sprint-chip${minutes === m ? ' is-on' : ''}`} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="sprint-btn sprint-btn--primary" onClick={() => start({ kind: 'topic', category })}>
              <Play size={16} aria-hidden="true" /> {t('Lancer le sprint', 'Lanse sprint la')}
            </button>
          </section>
        </div>
        {sidebar}
      </div>
    );
  }

  /* ── Done ── */
  if (screen === 'done') {
    const used = Math.min(totalSeconds, Math.round((Date.now() - startedAt.current) / 1000));
    return (
      <div className="sprint">
        <div className="sprint-main">
          <section className="sprint-card sprint-done" aria-live="polite">
            <h2 className="sprint-title">{t('Sprint terminé', 'Sprint fini')}</h2>
            <div className="sprint-stats">
              <div><strong>{acc === null ? '—' : `${acc}%`}</strong><span>{t('précision', 'presizyon')}</span></div>
              <div><strong>{correctCount}/{results.length}</strong><span>{t('justes', 'kòrèk')}</span></div>
              <div><strong>{formatClock(used)}</strong><span>{t('temps', 'tan')}</span></div>
              <div><strong>{skipped}</strong><span>{t('passées', 'sote')}</span></div>
            </div>
            {reward?.xpEarned > 0 && (
              <p className="sprint-xp">+{reward.xpEarned} XP{reward.guest ? t(' (aperçu — crée un compte pour les garder)', ' (apèsi — kreye yon kont pou kenbe yo)') : ''}</p>
            )}
            <div className="sprint-actions">
              <button type="button" className="sprint-btn sprint-btn--primary" onClick={() => start(mode.kind === 'bank' ? { kind: 'topic', category } : mode)}>
                <RotateCcw size={16} aria-hidden="true" /> {t('Rejouer', 'Rejwe')}
              </button>
              {bank.length > 0 && (
                <button type="button" className="sprint-btn sprint-btn--ghost" onClick={() => start({ kind: 'bank', items: bank.map((b) => b.question) })}>
                  <ShieldCheck size={16} aria-hidden="true" /> {t('Session zéro faute', 'Sesyon zewo fot')}
                </button>
              )}
              <button type="button" className="sprint-btn sprint-btn--ghost" onClick={() => setScreen('setup')}>{t('Changer de thème', 'Chanje tèm')}</button>
            </div>
            {!isAuthed && results.length > 0 && (
              <p className="sprint-muted">{t('Sans compte, tes XP ne sont pas gardés. Ta banque d’erreurs reste sur cet appareil.', 'San kont, XP ou pa kenbe. Bank erè ou rete sou aparèy sa a.')}</p>
            )}
          </section>
          {mistakes.length > 0 && (
            <section className="sprint-card">
              <h3 className="sprint-subtitle">{t('Tes erreurs', 'Erè ou yo')}</h3>
              <ul className="sprint-mistakes">
                {mistakes.map((m, i) => {
                  const o = triviaOptions(m.question, showHt);
                  const why = triviaExplanation(m.question, showHt);
                  return (
                    <li key={i}>
                      <p className="sprint-mistakes__q">{showHt ? m.question.qHt || m.question.q : m.question.q}</p>
                      <p><X size={14} aria-hidden="true" /> {o[m.selected]}</p>
                      <p><Check size={14} aria-hidden="true" /> <strong>{o[m.question.answer]}</strong></p>
                      {why && <p className="sprint-muted">{why}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        {sidebar}
      </div>
    );
  }

  /* ── Play ── */
  const why = q && checked ? triviaExplanation(q, showHt) : '';
  return (
    <div className="sprint sprint--play">
      <div className="sprint-hud" role="group" aria-label={t('Tableau du sprint', 'Tablo sprint la')}>
        <div className="sprint-hud__top">
          <div className="sprint-hud__title">
            <strong>{mode.kind === 'bank' ? catName('bank') : catName(mode.category)}</strong>
            <span className="sprint-pill">{t('Sprint solo', 'Sprint solo')}</span>
          </div>
          <div className="sprint-hud__controls">
            <button type="button" className="sprint-btn sprint-btn--ghost sprint-btn--sm" onClick={() => setShowHt((v) => !v)} aria-pressed={showHt}>
              <Languages size={15} aria-hidden="true" /> {showHt ? 'Français' : 'Kreyòl'}
            </button>
            <button type="button" className="sprint-btn sprint-btn--ghost sprint-btn--sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
              {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              {paused ? t('Reprendre', 'Kontinye') : t('Pause', 'Poz')}
            </button>
            <button type="button" className="sprint-btn sprint-btn--ghost sprint-btn--sm" onClick={() => finish(results)}>{t('Terminer', 'Fini')}</button>
          </div>
        </div>
        <div className="sprint-hud__metrics">
          <div className="sprint-metric"><span>{t('Question', 'Kesyon')}</span><strong>{String(idx + 1).padStart(2, '0')} / {pool.length}</strong></div>
          <div className="sprint-metric"><span><Target size={14} aria-hidden="true" /> {t('Précision', 'Presizyon')}</span><strong data-testid="sprint-accuracy">{acc === null ? '—' : `${acc}%`} <small>({correctCount}/{results.length})</small></strong></div>
          <div className="sprint-metric sprint-metric--timer">
            <span><Timer size={14} aria-hidden="true" /> {t('Chrono', 'Kwonomèt')}</span>
            <strong data-testid="sprint-clock">{formatClock(secondsLeft)}</strong>
            <span className="sprint-meter sprint-meter--timer"><span style={{ width: `${(secondsLeft / totalSeconds) * 100}%` }} /></span>
          </div>
        </div>
      </div>

      <div className="sprint-main">
        {q && (
          <section className={`sprint-card sprint-q${paused ? ' is-paused' : ''}`}>
            {paused && <p className="sprint-paused" role="status">{t('En pause', 'An poz')}</p>}
            {q.flag && (q.flagIso
              ? <img className="sprint-q__flag" src={`https://flagcdn.com/w320/${q.flagIso}.png`} alt="" />
              : <span className="sprint-q__flag sprint-q__flag--emoji" aria-hidden>{q.flag}</span>)}
            <span className="sprint-pill">{catName(q.category || 'mixed')}</span>
            <h2 className="sprint-q__text">{showHt ? q.qHt || q.q : q.q}</h2>
            <div className="sprint-options">
              {opts.map((o, i) => {
                const state = !checked ? (selected === i ? 'picked' : '') : i === q.answer ? 'right' : selected === i ? 'wrong' : 'dim';
                return (
                  <button key={i} type="button" className={`sprint-option${state ? ` is-${state}` : ''}`} disabled={checked || paused} onClick={() => setSelected(i)}>
                    <span className="sprint-option__key">{String.fromCharCode(65 + i)}</span>
                    <span>{o}</span>
                    <kbd>{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
            {checked && (
              <div className={`sprint-why${results[results.length - 1]?.correct ? ' is-right' : ' is-wrong'}`} role="status">
                <strong>{results[results.length - 1]?.correct ? t('Exact !', 'Egzat !') : t('Pas tout à fait.', 'Pa fin kòrèk.')}</strong>
                {!results[results.length - 1]?.correct && <p>{t('Bonne réponse :', 'Bon repons :')} <strong>{opts[q.answer]}</strong></p>}
                {why && <p>{why}</p>}
              </div>
            )}
            <div className="sprint-actions">
              <button type="button" className="sprint-btn sprint-btn--ghost" onClick={() => setScratchOpen((v) => !v)} aria-expanded={scratchOpen}>
                <NotebookPen size={16} aria-hidden="true" /> {t('Brouillon', 'Bouyon')}
              </button>
              {!checked && (
                <button type="button" className="sprint-btn sprint-btn--ghost" onClick={skip} disabled={paused}>
                  <SkipForward size={16} aria-hidden="true" /> {t('Passer', 'Sote')}
                </button>
              )}
              {!checked ? (
                <button type="button" className="sprint-btn sprint-btn--primary" onClick={validate} disabled={selected === null || paused}>
                  {t('Valider & voir l’explication', 'Valide epi wè eksplikasyon an')}
                </button>
              ) : (
                <button type="button" className="sprint-btn sprint-btn--primary" onClick={next}>
                  {idx + 1 >= pool.length ? t('Voir le bilan', 'Wè bilan an') : t('Question suivante', 'Pwochen kesyon')}
                </button>
              )}
            </div>
            {scratchOpen && (
              <label className="sprint-scratch">
                <span>{t('Brouillon — gardé sur cet appareil pour ce sprint', 'Bouyon — kenbe sou aparèy sa a pou sprint sa a')}</span>
                <textarea
                  value={scratch}
                  onChange={(e) => { setScratch(e.target.value); saveScratch(sessionId, e.target.value); }}
                  rows={4}
                  placeholder={t('Tes calculs, tes notes…', 'Kalkil ou, nòt ou…')}
                />
              </label>
            )}
          </section>
        )}
      </div>
      {sidebar}
    </div>
  );
}
