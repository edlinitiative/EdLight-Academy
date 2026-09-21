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

        <div className="practice-hub__grid">
          {[...choices].sort((a, b) => Number(!!b.primary) - Number(!!a.primary)).map((choice) => (
            <Link
              key={choice.href}
              to={choice.href}
              className={`practice-choice${choice.primary ? ' practice-choice--primary' : ''}`}
            >
              <span className="practice-choice__icon">{choice.icon}</span>
              <span className="practice-choice__eyebrow">{choice.eyebrow}</span>
              <h2>{choice.title}</h2>
              <p>{choice.description}</p>
              <span className="practice-choice__footer">
                <span>{choice.note}</span>
                <ChevronRight size={19} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
