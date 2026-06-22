import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStatCards } from '../hooks/useSiteStats';
import useStore from '../contexts/store';

const APPROACH_ITEMS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    ),
    titleFr: 'Vidéos courtes et ciblées',
    descFr: 'Chaque concept est expliqué dans une vidéo claire et concise, pour apprendre à votre rythme.',
    titleHt: 'Videyo kout, byen klè',
    descHt: 'Nou eksplike chak konsèp nan yon videyo kout e klè, pou ou aprann nan ritm pa ou.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    titleFr: 'Pratique après chaque leçon',
    descFr: 'Des questions ciblées après chaque leçon pour vérifier et renforcer la compréhension.',
    titleHt: 'Pratik apre chak leson',
    descHt: 'Kesyon pratik apre chak leson pou verifye epi ranfòse konpreyansyon.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    titleFr: 'Suivi de progression personnalisé',
    descFr: 'Voyez clairement où vous en êtes, par leçon, unité et matière.',
    titleHt: 'Swivi pwogrè pèsonalize',
    descHt: 'Konnen egzakteman kote ou ye, pa leson, pa inite, pa matyè.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    titleFr: 'Contenu bilingue',
    descFr: 'Des ressources en français et en kreyòl pour servir chaque élève haïtien.',
    titleHt: 'Kontni 2 lang',
    descHt: 'Resous an franse ak an kreyòl pou sèvi chak elèv ayisyen.',
  },
];

const VALUES = [
  { label: 'Accessibilité', labelHt: 'Aksesibilite', desc: "L'éducation de qualité est un droit, pas un privilège.", descHt: 'Edikasyon kalite se yon dwa, se pa yon privilèj.' },
  { label: 'Excellence', labelHt: 'Eksèlans', desc: 'Nous visons les meilleurs standards pédagogiques haïtiens et mondiaux.', descHt: 'Nou vize pi bon estanda pedagojik ayisyen ak mondyal.' },
  { label: 'Communauté', labelHt: 'Kominote', desc: 'Construit par et pour les élèves et enseignants haïtiens.', descHt: 'Konstwi pa ak pou elèv ak pwofesè ayisyen.' },
];

/* The concrete learning loop — explains how a student actually uses EdLight. */
const STEPS = [
  {
    n: '1',
    titleFr: 'Apprenez', titleHt: 'Aprann',
    descFr: 'Regardez des leçons vidéo courtes, organisées par matière, niveau et unité.',
    descHt: 'Gade leçon videyo kout, ki òganize pa matyè, nivò ak inite.',
  },
  {
    n: '2',
    titleFr: 'Pratiquez', titleHt: 'Pratike',
    descFr: 'Renforcez chaque leçon avec des exercices ciblés et des indices progressifs.',
    descHt: 'Ranfòse chak leçon ak egzèsis ki vize ak endis pwogresif.',
  },
  {
    n: '3',
    titleFr: 'Évaluez-vous', titleHt: 'Evalye tèt ou',
    descFr: 'Passez de vrais examens officiels (9e, Bac, université) avec correction automatique.',
    descHt: 'Pase vrè egzamen ofisyèl (9yèm, Bak, inivèsite) ak koreksyon otomatik.',
  },
  {
    n: '4',
    titleFr: 'Progressez', titleHt: 'Avanse',
    descFr: 'Suivez vos résultats en temps réel et voyez exactement quoi réviser ensuite.',
    descHt: 'Swiv rezilta ou an tan reyèl epi wè egzakteman kisa pou revize apè.',
  },
];

/* What the platform actually offers — each links to the relevant section. */
const OFFERINGS = [
  {
    to: '/courses',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
    titleFr: 'Cours structurés', titleHt: 'Kou estriktire',
    descFr: 'Des parcours complets en sciences et mathématiques, du fondamental au supérieur.',
    descHt: 'Pakou konplè nan syans ak matematik, soti fondamantal rive siperye.',
    ctaFr: 'Explorer les cours', ctaHt: 'Eksplore kou yo',
  },
  {
    to: '/exams',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5"/>
      </svg>
    ),
    titleFr: 'Examens officiels', titleHt: 'Egzamen ofisyèl',
    descFr: 'La banque d’annales MENFP (9e, Baccalauréat, université) avec corrections détaillées.',
    descHt: 'Bank annè MENFP (9yèm, Bakaloreya, inivèsite) ak koreksyon detaye.',
    ctaFr: 'Voir les examens', ctaHt: 'Wè egzamen yo',
  },
  {
    to: '/quizzes',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
    titleFr: 'Exercices & quiz', titleHt: 'Egzèsis & quiz',
    descFr: 'Entraînez-vous par unité avec des indices, trois essais et des explications complètes.',
    descHt: 'Antrene pa inite ak endis, twa esè ak eksplikasyon konplè.',
    ctaFr: 'Commencer un quiz', ctaHt: 'Kòmanse yon quiz',
  },
];

export default function About() {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const { cards, counts } = useSiteStatCards();

  return (
    <div className="section">
      <div className="container">

        {/* Hero */}
        <section className="about-hero">
          <h1 className="about-hero__title">
            {isCreole ? 'Bon jan edikasyon pou chak elèv ayisyen' : 'Une éducation de qualité pour chaque élève haïtien'}
          </h1>
          <p className="about-hero__copy">
            {isCreole ? (
              <>EdLight ap bati enfrastrikti pou yon edikasyon syans (STEM) ki aksesib ak kalite ann Ayiti, kou ki byen estriktire, pratik egzamen ofisyèl, ak swivi pwogrè an tan reyèl, tout nan menm plas la.</>
            ) : (
              <>EdLight construit l’infrastructure pour une éducation STEM accessible et de qualité en Haïti, des cours structurés, des exercices d’examens officiels et un suivi de progression en temps réel, le tout au même endroit.</>
            )}
          </p>          <div className="about-hero__actions">
            <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
              {isCreole ? 'Eksplore kou yo' : 'Explorer les cours'}
            </button>
            <button className="button button--ghost button--pill" onClick={() => navigate('/exams')}>
              {isCreole ? 'Wè egzamen yo' : 'Voir les examens'}
            </button>
          </div>        </section>

        {/* Stats */}
        <section className="about-stats">
          {cards.map((stat) => (
            <div key={stat.key} className="card text-center">
              <div className="about-stats__number">{stat.value}</div>
              <div className="about-stats__label">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* How it works — the concrete learning loop */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '0.5rem' }}>
            {isCreole ? 'Kijan sa mache' : 'Comment ça marche'}
          </h2>
          <p className="text-muted" style={{ marginBottom: '1.75rem', maxWidth: '46rem' }}>
            {isCreole
              ? 'Yon bouk aprantisaj senp ki mennen ou soti nan premye leçon an rive nan jou egzamen an.'
              : "Une boucle d’apprentissage simple qui vous accompagne de la première leçon au jour de l’examen."}
          </p>
          <div className="about-steps">
            {STEPS.map((step) => (
              <div key={step.n} className="card about-step">
                <span className="about-step__num">{step.n}</span>
                <h3 className="about-step__title">{isCreole ? step.titleHt : step.titleFr}</h3>
                <p className="about-step__desc">{isCreole ? step.descHt : step.descFr}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What you get — offerings with links */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>
            {isCreole ? 'Sa ou jwenn' : 'Ce que vous obtenez'}
          </h2>
          <div className="about-offerings">
            {OFFERINGS.map((o) => (
              <button key={o.to} type="button" className="card about-offering" onClick={() => navigate(o.to)}>
                <div className="about-offering__icon">{o.icon}</div>
                <h3 className="about-offering__title">{isCreole ? o.titleHt : o.titleFr}</h3>
                <p className="about-offering__desc">{isCreole ? o.descHt : o.descFr}</p>
                <span className="about-offering__cta">{(isCreole ? o.ctaHt : o.ctaFr)} →</span>
              </button>
            ))}
          </div>
        </section>

        {/* Approach */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>
            {isCreole ? 'Kijan nou anseye' : 'Notre approche pédagogique'}
          </h2>
          <div className="about-approach">
            {APPROACH_ITEMS.map((item) => (
              <div key={item.titleFr} className="card about-approach__item">
                <div className="about-approach__icon">{item.icon}</div>
                <div>
                  <div className="about-approach__text">{isCreole ? item.titleHt : item.titleFr}</div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-500)', marginTop: '0.2rem', lineHeight: 1.55 }}>
                    {isCreole ? item.descHt : item.descFr}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>
            {isCreole ? 'Valè nou' : 'Nos valeurs'}
          </h2>
          <div className="about-values">
            {VALUES.map((v) => (
              <div key={v.label} className="card about-values__item">
                <h3 className="about-values__title">{isCreole ? v.labelHt : v.label}</h3>
                <p className="about-values__desc">{isCreole ? v.descHt : v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="about-team" style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title">{isCreole ? 'Ekip nou' : 'Notre équipe'}</h2>
          <p className="text-muted about-team__copy">
            {isCreole
              ? 'Nou se yon ekip pwofesè, edikatè, ak enjenyè ayisyen ki angaje, ini sou yon sèl lide: chak elèv merite yon eksperyans aprantisaj kalite mondyal, kèlkeswa kote li rete.'
              : 'Nous sommes une équipe engagée d’enseignants, d’éducateurs et d’ingénieurs haïtiens, unis par une conviction : chaque élève mérite une expérience d’apprentissage de classe mondiale, quel que soit son lieu de vie.'}
          </p>
        </section>

        {/* CTA */}
        <section className="card about-cta text-center">
          <h2 className="section__title">
            {isCreole ? 'Pare pou kòmanse ?' : 'Prêt à commencer ?'}
          </h2>
          <p className="text-muted" style={{ marginTop: '0.5rem', marginBottom: '1.5rem', fontSize: '1rem' }}>
            {Number.isFinite(counts?.activeStudentsThisTerm) && counts.activeStudentsThisTerm >= 1000
              ? (isCreole
                ? `Vin jwenn plis pase ${new Intl.NumberFormat('fr-FR').format(Math.round(counts.activeStudentsThisTerm))} elèv k ap aprann ak EdLight Academy.`
                : `Rejoignez plus de ${new Intl.NumberFormat('fr-FR').format(Math.round(counts.activeStudentsThisTerm))} élèves qui apprennent avec EdLight Academy.`)
              : (isCreole
                ? 'Vin jwenn elèv atravè Ayiti k ap aprann ak EdLight Academy.'
                : 'Rejoignez des élèves à travers Haïti qui apprennent avec EdLight Academy.')}
          </p>
          <button
            className="button button--primary button--pill"
            onClick={() => navigate('/courses')}
          >
            {isCreole ? 'Eksplore kou yo' : 'Explorer les cours'}
          </button>
        </section>

      </div>
    </div>
  );
}
