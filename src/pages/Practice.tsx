import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Brain, ChevronRight, ClipboardCheck, ListChecks, Sparkles } from 'lucide-react';
import useStore from '../contexts/store';
import { loadDueReviewIds } from '../services/reviewService';
import './Practice.css';

type PracticeChoice = {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  primary?: boolean;
};

export default function Practice() {
  const language = useStore((state) => state.language);
  const userId = useStore((state) => state.user?.uid);
  const { data: dueIds = [] } = useQuery({
    queryKey: ['due-review-ids', userId],
    queryFn: () => loadDueReviewIds(userId!),
    enabled: !!userId,
  });
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const choices: PracticeChoice[] = [
    {
      href: '/revision',
      icon: <Brain size={23} aria-hidden="true" />,
      eyebrow: t('À partir de vos erreurs', 'Soti nan erè ou yo'),
      title: t('Revoir ce que vous avez manqué', 'Revize sa ou te rate'),
      description: t(
        'Retrouvez les questions ratées et travaillez-les jusqu’à les maîtriser.',
        'Jwenn kesyon ou te rate yo epi travay sou yo jiskaske ou metrize yo.',
      ),
      note: dueIds.length > 0
        ? t(`${dueIds.length} question${dueIds.length === 1 ? '' : 's'} à revoir`, `${dueIds.length} kesyon pou revize`)
        : t('Retrouvez ici vos erreurs après une pratique', 'Jwenn erè ou yo isit la apre yon pratik'),
      primary: dueIds.length > 0,
    },
    {
      href: '/quizzes',
      icon: <ListChecks size={23} aria-hidden="true" />,
      eyebrow: t('Pratique courte', 'Pratik kout'),
      title: t('S’entraîner par matière', 'Pratike pa matyè'),
      description: t(
        'Choisissez une matière ou une leçon et obtenez une correction immédiate.',
        'Chwazi yon matyè oswa yon leson epi jwenn koreksyon touswit.',
      ),
      note: t('Non chronométré · correction après chaque réponse', 'San kwonomèt · koreksyon apre chak repons'),
      primary: dueIds.length === 0,
    },
    {
      href: '/exams',
      icon: <ClipboardCheck size={23} aria-hidden="true" />,
      eyebrow: t('Préparation aux examens', 'Preparasyon egzamen'),
      title: t('Passer un examen blanc', 'Pase yon egzamen blan'),
      description: t(
        'Choisissez un examen officiel, consultez les consignes, puis travaillez en conditions d’examen.',
        'Chwazi yon egzamen ofisyèl, li enstriksyon yo, epi travay nan kondisyon egzamen.',
      ),
      note: t('Durée et barème affichés avant de commencer', 'Dire ak barèm parèt anvan ou kòmanse'),
    },
    {
      href: '/study-plan',
      icon: <Sparkles size={23} aria-hidden="true" />,
      eyebrow: t('Organiser la suite', 'Òganize sa k ap vini'),
      title: t('Ouvrir mon plan d’étude', 'Louvri plan etid mwen'),
      description: t(
        'Transformez vos objectifs et disponibilités en étapes de travail claires.',
        'Transfòme objektif ak tan ou genyen an etap travay ki klè.',
      ),
      note: t('Selon vos objectifs et votre temps disponible', 'Dapre objektif ou ak tan ou genyen'),
    },
  ];

  // Mistakes first when there are any to fix, otherwise a short practice.
  const ordered = [...choices].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));

  return (
    <section className="section practice-hub">
      <div className="container practice-hub__container">
        <header className="practice-hub__header">
          <span className="practice-hub__eyebrow">{t('Pratique', 'Pratik')}</span>
          <h1>{t('De quoi avez-vous besoin aujourd’hui ?', 'Kisa ou bezwen travay jodi a?')}</h1>
          <p>
            {t(
              'Révisez une difficulté, entraînez-vous sans pression ou préparez un examen complet.',
              'Revize yon difikilte, pratike san presyon oswa prepare yon egzamen konplè.',
            )}
          </p>
        </header>

        {/*
          * ONE LEAD, THEN ROWS — not four cards of equal weight.
          *
          * Seen on the live page: four near-identical cards in a 2×2 grid left
          * a large dead band above the footer on desktop and a long scroll on
          * a phone, and nothing in the composition said which choice matters
          * today. The hub has one answer that is right most of the time —
          * unfinished mistakes if there are any, otherwise a short practice —
          * so that one gets the surface and the rest get compact rows.
          * Redesign plan §4.1 (one primary task), §7 (compact rows + selective
          * featured surfaces, fewer decorative icon containers).
          */}
        <div className="practice-hub__stack">
          {ordered.map((choice, i) => (i === 0 ? (
            <Link key={choice.href} to={choice.href} className="practice-lead">
              <span className="practice-lead__icon">{choice.icon}</span>
              <span className="practice-lead__body">
                <span className="practice-choice__eyebrow">{choice.eyebrow}</span>
                <h2>{choice.title}</h2>
                <p>{choice.description}</p>
                <span className="practice-lead__note">{choice.note}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="practice-lead__chev" />
            </Link>
          ) : (
            <Link key={choice.href} to={choice.href} className="practice-row">
              <span className="practice-row__icon">{choice.icon}</span>
              <span className="practice-row__body">
                <span className="practice-row__title">{choice.title}</span>
                {/* The row keeps the NOTE, not the description: the note is the
                    fact a student chooses on (timed? corrected when? how many
                    waiting?), the description only restates the title. */}
                <span className="practice-row__note">{choice.note}</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          )))}
        </div>
      </div>
    </section>
  );
}
