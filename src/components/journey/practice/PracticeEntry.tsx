import React from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Lightbulb, Target, Clock, Repeat, LogOut, ChevronRight, Info } from '../../icons';
import type { ResolvedScope } from './practiceScope';

type Tx = (fr: string, ht: string) => string;
export type PracticeMode = 'quiz' | 'practice';

/**
 * What a mode does, in the student's words (LJ-07). Every line is a fact
 * about the code: DirectBankQuiz gives `tries` tries with a hint after each
 * miss and shows the correction once the question is resolved; neither mode
 * has a timer or stores a score.
 */
export function ModeRules({ mode, count, tries, tx }: { mode: PracticeMode; count: number; tries: number; tx: Tx }) {
  const rows = mode === 'quiz'
    ? [
      { Icon: ListChecks, text: tx(`${count} question${count > 1 ? 's' : ''}, l’une après l’autre. Tu vois toujours où tu en es.`, `${count} kesyon, youn apre lòt. Ou toujou wè ki kote ou ye.`) },
      { Icon: Lightbulb, text: tx(`Correction après chaque question : ${tries} essais, avec un indice après chaque erreur.`, `Koreksyon apre chak kesyon : ${tries} esè, ak yon endis apre chak erè.`) },
      { Icon: Target, text: tx('À la fin : ton score (bonnes réponses du premier coup) et la correction de chaque question.', 'Nan fen : nòt ou (bon repons premye fwa) ak koreksyon chak kesyon.') },
      { Icon: Clock, text: tx('Pas de chrono. Ce n’est pas un examen.', 'Pa gen kwonomèt. Se pa yon egzamen.') },
    ]
    : [
      { Icon: Repeat, text: tx('Une question à la fois, au hasard dans ce chapitre, autant que tu veux.', 'Yon kesyon alafwa, o aza nan chapit sa a, otan ou vle.') },
      { Icon: Lightbulb, text: tx(`Correction tout de suite : ${tries} essais, avec un indice après chaque erreur.`, `Koreksyon touswit : ${tries} esè, ak yon endis apre chak erè.`) },
      { Icon: LogOut, text: tx('Tu t’arrêtes quand tu veux avec « Terminer » et tu vois ton bilan.', 'Ou kanpe lè ou vle ak « Fini » epi ou wè rezilta ou.') },
      { Icon: Clock, text: tx('Pas de score, pas de chrono.', 'Pa gen nòt, pa gen kwonomèt.') },
    ];
  return (
    <ul className="pe-rules">
      {rows.map(({ Icon, text }) => (
        <li key={text}><Icon size={18} aria-hidden="true" /><span>{text}</span></li>
      ))}
    </ul>
  );
}

/** What is kept — the same sentence before the session and after it. */
export function SaveNote({ signedIn, onSignIn, tx }: { signedIn: boolean; onSignIn: () => void; tx: Tx }) {
  return (
    <p className="pe-save">
      {signedIn ? (
        <>{tx('Ton score n’est pas enregistré. Les questions ratées du premier coup vont dans ta ', 'Nòt ou pa anrejistre. Kesyon ou rate premye fwa yo ale nan ')}<Link to="/revision">{tx('Révision', 'Revizyon')}</Link>.</>
      ) : (
        <>
          {tx('Sans compte, rien n’est gardé après cette visite.', 'San kont, anyen pa rete apre vizit sa a.')}{' '}
          <button type="button" className="pe-save__link" onClick={onSignIn}>{tx('Connecte-toi', 'Konekte')}</button>{' '}
          {tx('pour retrouver tes erreurs dans Révision.', 'pou jwenn erè ou yo nan Revizyon.')}
        </>
      )}
    </p>
  );
}

/**
 * The compact confirmation a lesson hands the student into (LJ-06): topic,
 * mode, the real count, what is saved, one "Commencer". Rendered only once
 * the scope has resolved against loaded data, so the count is never a
 * placeholder.
 */
export default function PracticeEntry({
  scope,
  subjectLabel,
  levelLabel,
  thumb,
  mode,
  onMode,
  quizLength,
  tries,
  signedIn,
  onSignIn,
  onStart,
  onChange,
  backHref,
  tx,
}: {
  scope: ResolvedScope;
  subjectLabel: string;
  levelLabel: string;
  thumb?: string;
  mode: PracticeMode;
  onMode: (m: PracticeMode) => void;
  /** Questions the fixed quiz will really hold (already capped). */
  quizLength: number;
  tries: number;
  signedIn: boolean;
  onSignIn: () => void;
  onStart: () => void;
  onChange: () => void;
  backHref?: string | null;
  tx: Tx;
}) {
  const unitTitle = scope.unit?.label || '';
  const pool = scope.poolCount;
  const canQuiz = quizLength > 0;
  const chapter = scope.unitIndex ? tx(`Chapitre ${scope.unitIndex}`, `Chapit ${scope.unitIndex}`) : '';
  return (
    <section className="pe" aria-labelledby="pe-title">
      <div className="pe__topic">
        {backHref && scope.lesson && (
          <Link className="pe__back" to={backHref}>
            {tx('Retour à la leçon', 'Retounen nan leson an')}
          </Link>
        )}
        <div className="pe__head">
          <div className="pe__headtext">
            <p className="pe__eyebrow">
              {scope.lesson
                ? <>{tx('Après la leçon', 'Apre leson')} <span className="pe__lesson">« {scope.lesson.title} »</span></>
                : tx('Pratique du chapitre', 'Pratik chapit la')}
            </p>
            <h1 id="pe-title" className="pe__title">{unitTitle}</h1>
            <p className="pe__meta">
              {[subjectLabel, levelLabel, chapter].filter(Boolean).join(' · ')}
              <span className="pe__count">{tx(`${pool} question${pool > 1 ? 's' : ''} dans ce chapitre`, `${pool} kesyon nan chapit sa a`)}</span>
            </p>
          </div>
          {thumb && <img className="pe__thumb" src={thumb} alt="" width={96} height={68} decoding="async" />}
        </div>
        {scope.lesson && (
          <p className="pe-scope">
            <Info size={16} aria-hidden="true" />
            <span>{tx('Ces questions couvrent tout le chapitre : elles ne sont pas encore classées leçon par leçon.', 'Kesyon sa yo kouvri tout chapit la : yo poko klase leson pa leson.')}</span>
          </p>
        )}
        <SaveNote signedIn={signedIn} onSignIn={onSignIn} tx={tx} />
      </div>

      <div className="pe__plan">
        <div className="pe-mode">
          <p className="pe-mode__label" id="pe-mode-label">{tx('Comment veux-tu t’entraîner ?', 'Kijan ou vle antrene ?')}</p>
          <div className="pe-mode__chips" role="radiogroup" aria-labelledby="pe-mode-label">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'quiz'}
              className={mode === 'quiz' ? 'is-on' : ''}
              disabled={!canQuiz}
              onClick={() => onMode('quiz')}
            >
              {tx('Quiz', 'Kwiz')} · {tx(`${quizLength} questions`, `${quizLength} kesyon`)}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'practice'}
              className={mode === 'practice' ? 'is-on' : ''}
              onClick={() => onMode('practice')}
            >
              {tx('Entraînement libre', 'Pratik lib')}
            </button>
          </div>
          {!canQuiz && (
            <p className="pe-note">{tx('Aucune question de ce chapitre ne se corrige automatiquement : le quiz avec score n’est pas possible ici.', 'Okenn kesyon nan chapit sa a pa korije otomatikman : kwiz ak nòt pa posib isit la.')}</p>
          )}
          {canQuiz && mode === 'quiz' && quizLength < 10 && (
            <p className="pe-note">{tx(`Ce chapitre a ${quizLength} question${quizLength > 1 ? 's' : ''} corrigeable${quizLength > 1 ? 's' : ''} : le quiz en aura ${quizLength}.`, `Chapit sa a gen ${quizLength} kesyon ki ka korije : kwiz la ap genyen ${quizLength}.`)}</p>
          )}
          <ModeRules mode={mode} count={quizLength} tries={tries} tx={tx} />
        </div>

        <div className="pe-actions">
          <button type="button" className="button button--primary button--lg pe-actions__start" onClick={onStart} disabled={mode === 'quiz' && !canQuiz}>
            {tx('Commencer', 'Kòmanse')}
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="pe-actions__text" onClick={onChange}>
            {tx('Choisir un autre chapitre', 'Chwazi yon lòt chapit')}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The link asked for something the bank cannot serve (LJ-06, QA-05). Say what
 * happened and offer an explicit choice — the page below keeps every
 * selector. Never a silent swap to unrelated questions.
 */
export function ScopeNotice({
  scope,
  courseLabel,
  onCourseWide,
  tx,
}: {
  scope: ResolvedScope;
  courseLabel: string;
  onCourseWide?: () => void;
  tx: Tx;
}) {
  let text = '';
  if (scope.status === 'unknown-course') {
    text = tx('Ce lien de pratique ne correspond à aucun cours disponible. Choisis une matière et un chapitre ci-dessous.',
      'Lyen pratik sa a pa koresponn ak okenn kou ki disponib. Chwazi yon matyè ak yon chapit anba a.');
  } else if (scope.status === 'unknown-unit') {
    text = tx(`Le chapitre demandé n’existe plus dans ${courseLabel}. Choisis un chapitre ci-dessous.`,
      `Chapit ou mande a pa egziste ankò nan ${courseLabel}. Chwazi yon chapit anba a.`);
  } else if (scope.status === 'empty-unit') {
    text = tx(`« ${scope.unit?.label} » n’a pas encore de questions. Choisis un autre chapitre ci-dessous.`,
      `« ${scope.unit?.label} » poko gen kesyon. Chwazi yon lòt chapit anba a.`);
  }
  if (!text) return null;
  const wide = scope.coursePoolCount;
  return (
    <div className="pe-notice" role="status">
      <Info size={18} aria-hidden="true" />
      <div>
        <p>{text}</p>
        {onCourseWide && scope.status !== 'unknown-course' && wide > 0 && (
          <button type="button" className="button button--ghost button--sm" onClick={onCourseWide}>
            {tx(`S’entraîner sur tout le cours · ${wide} questions`, `Pratike sou tout kou a · ${wide} kesyon`)}
          </button>
        )}
      </div>
    </div>
  );
}
