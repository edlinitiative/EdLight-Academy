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
    descFr: 'Voyez clairement où vous en êtes — par leçon, unité et matière.',
    titleHt: 'Swivi pwogrè pèsonalize',
    descHt: 'Konnen egzakteman kote ou ye — pa leson, pa inite, pa matyè.',
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
  { label: 'Accessibilité', desc: "L'éducation de qualité est un droit, pas un privilège." },
  { label: 'Excellence', desc: 'Nous visons les meilleurs standards pédagogiques haïtiens et mondiaux.' },
  { label: 'Communauté', desc: 'Construit par et pour les élèves et enseignants haïtiens.' },
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
          <span className="page-header__eyebrow">Notre mission</span>
          <h1 className="about-hero__title">
            {isCreole ? 'Bon jan edikasyon pou chak elèv ayisyen' : 'Une éducation de qualité pour chaque élève haïtien'}
          </h1>
          <p className="about-hero__copy">
            {isCreole ? (
              <>EdLight ap bati enfrastrikti pou yon edikasyon syans (STEM) ki aksesib ak kalite ann Ayiti — kou ki byen estriktire, pratik egzamen ofisyèl, ak swivi pwogrè an tan reyèl, tout nan menm plas la.</>
            ) : (
              <>EdLight construit l’infrastructure pour une éducation STEM accessible et de qualité en Haïti — des cours structurés, des exercices d’examens officiels et un suivi de progression en temps réel, le tout au même endroit.</>
            )}
          </p>
        </section>

        {/* Stats */}
        <section className="about-stats">
          {cards.map((stat) => (
            <div key={stat.key} className="card text-center">
              <div className="about-stats__number">{stat.value}</div>
              <div className="about-stats__label">{stat.label}</div>
            </div>
          ))}
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
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>Nos valeurs</h2>
          <div className="about-values">
            {VALUES.map((v) => (
              <div key={v.label} className="card about-values__item">
                <h3 className="about-values__title">{v.label}</h3>
                <p className="about-values__desc">{v.desc}</p>
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
          <h2 className="section__title">Prêt à commencer ?</h2>
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
            Explorer les cours
          </button>
        </section>

      </div>
    </div>
  );
}
