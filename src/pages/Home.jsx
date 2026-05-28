import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated, language } = useStore();
  const isCreole = language === 'ht';
  const [heroSrc, setHeroSrc] = useState('/assets/landing-hero.png');

  const t = (fr, ht) => (isCreole ? ht : fr);

  const subjectThumbs = {
    PHYS: '/assets/physics-thumb.png',
    CHEM: '/assets/chemistry-thumb.jpg',
    MATH: '/assets/math-thumb.png',
    ECON: '/assets/economy-thumb.png',
  };

  const featured = [
    { id: 'phys-ns1', name: t('Physique NS I', 'Fizik NS I'), desc: t('Mécanique · Forces · Énergie', 'Mekanik · Fòs · Enèji'), subject: 'PHYS', level: 'NS I', lessons: 24 },
    { id: 'math-ns1', name: t('Mathématiques NS I', 'Matematik NS I'), desc: t('Algèbre · Fonctions · Équations', 'Aljèb · Fonksyon · Ekwasyon'), subject: 'MATH', level: 'NS I', lessons: 30 },
    { id: 'chem-ns1', name: t('Chimie NS I', 'Chimi NS I'), desc: t('Atomes · Molécules · Réactions', 'Atòm · Molekil · Reyaksyon'), subject: 'CHEM', level: 'NS I', lessons: 20 },
    { id: 'econ-ns1', name: t('Économie NS I', 'Ekonomi NS I'), desc: t('Marché · Demande · PIB', 'Mache · Demann · PIB'), subject: 'ECON', level: 'NS I', lessons: 18 },
  ];

  const pillars = [
    { eyebrow: '01', icon: '📚', title: t('Cours structurés', 'Kou estriktire'), desc: t('Une progression claire du NS I au NS IV, alignée sur les programmes officiels.', 'Yon pwogresyon klè soti NS I rive NS IV, daprè pwogram ofisyèl yo.') },
    { eyebrow: '02', icon: '🎯', title: t('Quiz adaptatifs', 'Quiz adaptatif'), desc: t('Des questions ciblées qui s’ajustent à votre niveau et renforcent vos lacunes.', 'Kesyon ki ajiste ak nivo ou epi ranfòse pwen fèb yo.') },
    { eyebrow: '03', icon: '📝', title: t('Examens blancs', 'Egzamen blan'), desc: t('Simulez le Bac dans des conditions réelles, avec correction détaillée.', 'Simile Bak la nan kondisyon reyèl ak koreksyon detaye.') },
    { eyebrow: '04', icon: '📊', title: t('Suivi premium', 'Swivi premye klas'), desc: t('Tableaux de bord, streaks et plans d’étude personnalisés.', 'Tablo de bò, seri jou ak plan etid pèsonalize.') },
  ];

  const stats = [
    { value: '4 000+', label: t('élèves accompagnés', 'elèv ki akonpaye') },
    { value: '600+', label: t('leçons vidéo', 'leson videyo') },
    { value: '120+', label: t('examens disponibles', 'egzamen ki disponib') },
    { value: '96%', label: t('de satisfaction', 'satisfaksyon') },
  ];

  const testimonials = [
    { quote: t('« EdLight a transformé ma préparation au Bac. Les corrections détaillées ont fait toute la différence. »', '« EdLight chanje preparasyon Bak mwen. Koreksyon detaye yo fè yon gwo diferans. »'), name: 'Carline J.', role: t('Élève NS IV, Port-au-Prince', 'Elèv NS IV, Pòtoprens') },
    { quote: t('« Les quiz interactifs rendent l’apprentissage addictif. Je viens chaque jour. »', '« Quiz entèaktif yo rann aprantisaj la trè enteresan. Mwen vini chak jou. »'), name: 'Jean P.', role: t('Élève NS III, Cap-Haïtien', 'Elèv NS III, Okap') },
    { quote: t('« Une plateforme moderne, pensée pour les élèves haïtiens. Enfin ! »', '« Yon platfòm modèn, panse pou elèv ayisyen. Anfen ! »'), name: 'Mme Pierre', role: t('Enseignante, Les Cayes', 'Pwofesè, Okay') },
  ];

  return (
    <div className="lp">
      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero__bg" aria-hidden="true">
          <div className="lp-hero__orb lp-hero__orb--a" />
          <div className="lp-hero__orb lp-hero__orb--b" />
          <div className="lp-hero__grid-overlay" />
        </div>

        <div className="lp-container">
          <div className="lp-hero__layout">
            <div className="lp-hero__copy">
              <span className="lp-eyebrow">
                <span className="lp-eyebrow__dot" />
                {t('Plateforme éducative haïtienne', 'Platfòm edikatif ayisyen')}
              </span>

              <h1 className="lp-hero__title">
                {t('Maîtrisez le ', 'Metrize ')}
                <span className="lp-hero__title-accent">Bac</span>
                {t(' avec une rigueur', ' ak rigè')}
                <br />
                {t('digne d’une école d’élite.', 'tankou yon lekòl elit.')}
              </h1>

              <p className="lp-hero__lede">
                {t(
                  'Cours, quiz adaptatifs et examens blancs alignés sur le programme officiel, pensés pour les élèves haïtiens et conçus comme une expérience premium.',
                  'Kou, quiz adaptatif ak egzamen blan ki swiv pwogram ofisyèl la, pou elèv ayisyen, fè tankou yon eksperyans premye klas.'
                )}
              </p>

              <div className="lp-hero__actions">
                <button className="lp-btn lp-btn--primary" onClick={() => navigate('/courses')}>
                  <span>{t('Explorer les cours', 'Eksplore kou yo')}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
                <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/exams')}>
                  {t('Passer un examen blanc', 'Pase yon egzamen blan')}
                </button>
              </div>

              <div className="lp-hero__trust">
                <div className="lp-hero__avatars" aria-hidden="true">
                  <span style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>C</span>
                  <span style={{ background: 'linear-gradient(135deg,#6366f1,#22d3ee)' }}>J</span>
                  <span style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)' }}>M</span>
                  <span style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>+</span>
                </div>
                <div className="lp-hero__trust-copy">
                  <strong>4 000+ {t('élèves', 'elèv')}</strong>
                  <span>{t('progressent déjà avec EdLight', 'k ap pwogrese deja ak EdLight')}</span>
                </div>
              </div>
            </div>

            <div className="lp-hero__visual">
              <div className="lp-hero__frame">
                <img
                  src={heroSrc}
                  alt={t('Élève haïtien apprenant en ligne', 'Elèv ayisyen k ap aprann sou entènèt')}
                  loading="eager"
                  onError={(e) => {
                    if (heroSrc !== '/assets/student-hero.svg') {
                      setHeroSrc('/assets/student-hero.svg');
                      e.target.alt = t('Illustration EdLight', 'Ilistrasyon EdLight');
                    }
                  }}
                />
                <div className="lp-hero__chip lp-hero__chip--a">
                  <span className="lp-hero__chip-dot" />
                  {t('Quiz Physique · 8/10', 'Quiz Fizik · 8/10')}
                </div>
                <div className="lp-hero__chip lp-hero__chip--b">🔥 {t('Série de 12 jours', 'Seri 12 jou')}</div>
                <div className="lp-hero__chip lp-hero__chip--c">✦ {t('Plan d’étude prêt', 'Plan etid pare')}</div>
              </div>
            </div>
          </div>

          <div className="lp-hero__stats" data-reveal>
            {stats.map((s) => (
              <div className="lp-stat" key={s.label}>
                <div className="lp-stat__value">{s.value}</div>
                <div className="lp-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="lp-section lp-pillars">
        <div className="lp-container">
          <header className="lp-section__head" data-reveal>
            <span className="lp-eyebrow lp-eyebrow--muted">{t('Pourquoi EdLight', 'Poukisa EdLight')}</span>
            <h2 className="lp-section__title">
              {t('Une méthode complète,', 'Yon metòd konplè,')}
              <br />
              <span className="lp-text-accent">{t('soigneusement conçue.', 'fè ak swen.')}</span>
            </h2>
            <p className="lp-section__lede">
              {t(
                'Chaque détail est pensé pour donner aux élèves haïtiens les mêmes armes que les meilleures écoles internationales.',
                'Chak detay panse pou bay elèv ayisyen yo menm zouti ak pi bon lekòl entènasyonal yo.'
              )}
            </p>
          </header>

          <div className="lp-pillars__grid">
            {pillars.map((p, i) => (
              <article className="lp-pillar" key={p.eyebrow} data-reveal style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="lp-pillar__head">
                  <span className="lp-pillar__num">{p.eyebrow}</span>
                  <span className="lp-pillar__icon" aria-hidden="true">{p.icon}</span>
                </div>
                <h3 className="lp-pillar__title">{p.title}</h3>
                <p className="lp-pillar__desc">{p.desc}</p>
                <span className="lp-pillar__corner" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* COURSES */}
      <section className="lp-section lp-courses">
        <div className="lp-container">
          <header className="lp-section__head lp-section__head--row" data-reveal>
            <div>
              <span className="lp-eyebrow lp-eyebrow--muted">{t('Catalogue', 'Katalòg')}</span>
              <h2 className="lp-section__title lp-section__title--sm">{t('Cours phares de la rentrée', 'Kou ki pi enpòtan')}</h2>
            </div>
            <button className="lp-link" onClick={() => navigate('/courses')}>
              {t('Voir tout le catalogue', 'Wè tout katalòg la')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </header>

          <div className="lp-courses__grid">
            {featured.map((c, i) => (
              <article key={c.id} className="lp-course" data-reveal style={{ transitionDelay: `${i * 60}ms` }} onClick={() => navigate('/courses')}>
                <div className="lp-course__media">
                  <img src={subjectThumbs[c.subject]} alt={c.name} />
                  <span className={`lp-course__badge lp-course__badge--${c.subject.toLowerCase()}`}>{c.level}</span>
                </div>
                <div className="lp-course__body">
                  <h3 className="lp-course__title">{c.name}</h3>
                  <p className="lp-course__desc">{c.desc}</p>
                  <div className="lp-course__foot">
                    <span>{c.lessons} {t('leçons', 'leson')}</span>
                    <span className="lp-course__cta">{t('Découvrir →', 'Dekouvri →')}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* EXPERIENCE */}
      <section className="lp-section lp-experience">
        <div className="lp-container">
          <div className="lp-experience__grid">
            <div className="lp-experience__copy" data-reveal>
              <span className="lp-eyebrow lp-eyebrow--muted">{t('Expérience', 'Eksperyans')}</span>
              <h2 className="lp-section__title">
                {t('Apprenez comme dans', 'Aprann tankou nan')}
                <br />
                <span className="lp-text-accent">{t('une grande école.', 'yon gwo lekòl.')}</span>
              </h2>
              <ul className="lp-checklist">
                <li><span className="lp-check">✓</span> {t('Vidéos HD avec sous-titres en français et créole', 'Videyo HD ak soustit an franse ak kreyòl')}</li>
                <li><span className="lp-check">✓</span> {t('Quiz qui s’adaptent à votre niveau', 'Quiz ki ajiste ak nivo ou')}</li>
                <li><span className="lp-check">✓</span> {t('Corrections rédigées par des enseignants', 'Koreksyon ekri pa pwofesè')}</li>
                <li><span className="lp-check">✓</span> {t('Plan d’étude hebdomadaire personnalisé', 'Plan etid chak semèn pèsonalize')}</li>
              </ul>
              <div className="lp-hero__actions">
                <button className="lp-btn lp-btn--primary" onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}>
                  {t('Créer mon espace', 'Kreye espas mwen')}
                </button>
                <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/trivia')}>{t('Essayer la trivia', 'Eseye trivia')}</button>
              </div>
            </div>

            <div className="lp-experience__panel" data-reveal>
              <div className="lp-panel">
                <div className="lp-panel__head">
                  <div className="lp-panel__dots"><span /><span /><span /></div>
                  <span>{t('Tableau de bord', 'Tablo de bò')}</span>
                </div>
                <div className="lp-panel__body">
                  <div className="lp-panel__row">
                    <div>
                      <div className="lp-panel__label">{t('Maîtrise globale', 'Metrize jeneral')}</div>
                      <div className="lp-panel__value">82%</div>
                    </div>
                    <div className="lp-panel__bar"><div style={{ width: '82%' }} /></div>
                  </div>
                  <div className="lp-panel__row">
                    <div>
                      <div className="lp-panel__label">{t('Quiz cette semaine', 'Quiz semèn nan')}</div>
                      <div className="lp-panel__value">24</div>
                    </div>
                    <div className="lp-panel__sparkline" aria-hidden="true">
                      <span style={{ height: '30%' }} /><span style={{ height: '55%' }} /><span style={{ height: '40%' }} />
                      <span style={{ height: '70%' }} /><span style={{ height: '60%' }} /><span style={{ height: '90%' }} />
                      <span style={{ height: '75%' }} />
                    </div>
                  </div>
                  <div className="lp-panel__chips">
                    <span className="lp-chip lp-chip--ok">🔥 12 {t('jours', 'jou')}</span>
                    <span className="lp-chip">📘 Physique · 88%</span>
                    <span className="lp-chip">📐 Maths · 76%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="lp-section lp-testi">
        <div className="lp-container">
          <header className="lp-section__head lp-section__head--center" data-reveal>
            <span className="lp-eyebrow lp-eyebrow--muted">{t('Témoignages', 'Temwayaj')}</span>
            <h2 className="lp-section__title">
              {t('Ils progressent avec ', 'Y ap pwogrese ak ')}
              <span className="lp-text-accent">EdLight</span>.
            </h2>
          </header>
          <div className="lp-testi__grid">
            {testimonials.map((q, i) => (
              <figure className="lp-quote" key={i} data-reveal style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="lp-quote__mark" aria-hidden="true">“</span>
                <blockquote>{q.quote}</blockquote>
                <figcaption>
                  <strong>{q.name}</strong>
                  <span>{q.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-section lp-cta">
        <div className="lp-container">
          <div className="lp-cta__card" data-reveal>
            <div className="lp-cta__glow" aria-hidden="true" />
            <div className="lp-cta__content">
              <h2 className="lp-cta__title">
                {t('Commencez aujourd’hui.', 'Kòmanse jodi a.')}
                <br />
                <span className="lp-text-accent">{t('Réussissez demain.', 'Reyisi demen.')}</span>
              </h2>
              <p className="lp-cta__desc">
                {t(
                  'Rejoignez les milliers d’élèves qui préparent leur avenir avec EdLight Academy.',
                  'Rejwenn dè milye elèv k ap prepare avni yo ak EdLight Academy.'
                )}
              </p>
              <div className="lp-hero__actions">
                <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}>
                  {t('Créer un compte gratuit', 'Kreye yon kont gratis')}
                </button>
                <button className="lp-btn lp-btn--ghost lp-btn--lg" onClick={() => navigate('/courses')}>
                  {t('Parcourir les cours', 'Parkouri kou yo')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
