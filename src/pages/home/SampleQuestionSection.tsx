import React, { useState } from 'react';
import { Sigma } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowIcon, TFn } from './content';
import useStore from '../../contexts/store';

/**
 * A real exercise, playable, in both languages — before anything is asked of you.
 *
 * The homepage made two claims it could not back up on the page itself: that
 * EdLight is genuinely bilingual, and that it teaches the Haitian programme
 * rather than a generic one. Both were assertions in a paragraph. A visitor
 * had to create an account to find out whether either was true.
 *
 * So the page now hands over an actual exercise instead. The language toggle
 * IS the bilingual claim — the whole exercise, question, options, correction
 * and all, switches — and the exercise itself is from a unit that exists,
 * links to it, and is counted in the catalogue numbers further down.
 *
 * WHAT THIS IS NOT: a score, a level estimate or a readiness signal. It is one
 * question. Answering it tells the student nothing about their Bac, and the
 * copy never suggests otherwise.
 *
 * Content note: this is an exercise written to represent ECON-NSI-U2
 * ("L'Intérêt Simple", 3 lessons), NOT a question lifted from a past State
 * paper. The page says "un exercice" and never claims it is a Bac question,
 * because the real papers are a separate thing and are linked separately.
 */

interface Choice {
  fr: string;
  ht: string;
}

/**
 * Simple interest on a sum in Gourdes — the arithmetic a NS1 économie student
 * is actually taught, in the currency they actually use. The distractors are
 * the three mistakes that unit's lessons spend their time on: forgetting to
 * add the principal back, using one year instead of three, and compounding
 * when the question says simple.
 */
const QUESTION = {
  fr: 'Un commerçant place 150 000 gourdes à un taux d’intérêt simple de 8,5 % par an. Quelle somme aura-t-il au bout de 3 ans ?',
  ht: 'Yon machann mete 150 000 goud nan bank ak yon to enterè senp 8,5 % pa an. Konbyen lajan l ap genyen apre 3 an ?',
};

const CHOICES: Choice[] = [
  { fr: '38 250 gourdes', ht: '38 250 goud' },
  { fr: '188 250 gourdes', ht: '188 250 goud' },
  { fr: '162 750 gourdes', ht: '162 750 goud' },
  { fr: '192 214 gourdes', ht: '192 214 goud' },
];

const ANSWER = 1;

/** Why each wrong choice is wrong — the part that makes this teaching, not testing. */
const WHY: Array<{ fr: string; ht: string }> = [
  {
    fr: 'C’est l’intérêt seul. La question demande la somme totale, donc il faut rajouter le capital de départ.',
    ht: 'Sa se enterè a sèlman. Kesyon an mande total la, donk ou dwe ajoute kapital depa a tou.',
  },
  {
    fr: 'Intérêt = 150 000 × 0,085 × 3 = 38 250. Total = 150 000 + 38 250 = 188 250 gourdes.',
    ht: 'Enterè = 150 000 × 0,085 × 3 = 38 250. Total = 150 000 + 38 250 = 188 250 goud.',
  },
  {
    fr: 'C’est le total après 1 an seulement. Le placement court sur 3 ans.',
    ht: 'Sa se total la apre yon sèl an. Plasman an dire 3 an.',
  },
  {
    fr: 'C’est le résultat avec des intérêts composés. Ici le taux est simple : il porte toujours sur le capital de départ.',
    ht: 'Sa se rezilta ak enterè konpoze. Isit la to a senp : li toujou kalkile sou kapital depa a.',
  },
];

/**
 * The exercise card on its own — the homepage hero leads with it (Ted's
 * mockup: a live question on the right of the headline), so it is the first
 * thing a visitor can DO rather than read about.
 */
export function SampleQuestionCard({ t }: { t: TFn }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const lang = (c: { fr: string; ht: string }) => (isCreole ? c.ht : c.fr);

  return (
    <div className="lp-sample__card">
      <div className="lp-sample__bar">
        {/* A badge, not a stripe: where the exercise comes from, stated. */}
        <span className="lp-sample__source">
          <Sigma size={14} aria-hidden="true" />
          {t('Économie NS1 · L’Intérêt Simple', 'Ekonomi NS1 · Enterè Senp')}
        </span>
      </div>

      <p className="lp-sample__question">{lang(QUESTION)}</p>

      <ul className="lp-sample__choices">
        {CHOICES.map((choice, i) => {
          const isAnswer = i === ANSWER;
          const isPicked = i === picked;
          const state = !answered
            ? ''
            : isAnswer
              ? ' is-answer'
              : isPicked
                ? ' is-picked'
                : ' is-dim';
          return (
            <li key={i}>
              <button
                type="button"
                className={`lp-sample__choice${state}`}
                onClick={() => !answered && setPicked(i)}
                disabled={answered}
              >
                <span className="lp-sample__choice-mark" aria-hidden="true">
                  {answered && isAnswer ? '✓' : answered && isPicked ? '✕' : String.fromCharCode(65 + i)}
                </span>
                <span>{lang(choice)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div className="lp-sample__why" role="status">
          <p className={`lp-sample__verdict${picked === ANSWER ? '' : ' lp-sample__verdict--wrong'}`}>
            {picked === ANSWER
              ? t('C’est juste.', 'Se sa menm.')
              : t('Pas tout à fait.', 'Pa fin kòrèk.')}
          </p>
          {/* The student's own wrong answer is explained first, because
              that is the one they need; the worked solution follows. */}
          <p>{lang(WHY[picked as number])}</p>
          {picked !== ANSWER && <p>{lang(WHY[ANSWER])}</p>}

          <div className="lp-sample__after">
            <Link className="lp-btn lp-btn--primary" to="/courses/econ-ns1">
              <span>{t('Ouvrir cette leçon', 'Louvri leson sa a')}</span>
              <ArrowIcon />
            </Link>
            <button type="button" className="lp-link" onClick={() => setPicked(null)}>
              {t('Recommencer', 'Rekòmanse')}
            </button>
          </div>
        </div>
      )}

      {!answered && (
        <p className="lp-sample__hint">
          {t('Choisissez une réponse — la correction s’affiche tout de suite.', 'Chwazi yon repons — koreksyon an parèt touswit.')}
        </p>
      )}
    </div>
  );
}
