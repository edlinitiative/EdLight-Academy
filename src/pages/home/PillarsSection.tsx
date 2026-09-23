import React from 'react';
import { BookOpenCheck, Languages, Trophy, Wifi } from '../../components/icons';
import { TFn } from './content';

/**
 * Four pillars — the mockup's "Conçu pour la réalité haïtienne" band, with
 * only what is true of EdLight today. The mockup's "0 Mo / 100 % hors-ligne /
 * PDF" pillar became what the PWA actually does: pages already opened stay
 * readable without a connection; videos still need one.
 */
export default function PillarsSection({ t }: { t: TFn }) {
  const pillars = [
    {
      icon: <BookOpenCheck size={24} aria-hidden="true" />, tone: 'azure',
      title: t('Programme MENFP, NS I à NS IV', 'Pwogram MENFP, NS I rive NS IV'),
      body: t('Mathématiques, Chimie et Économie, leçon par leçon, avec quiz et vrais sujets d’examen.', 'Matematik, Chimi ak Ekonomi, leson pa leson, ak quiz ak vrè sijè egzamen.'),
      foot: t('Physique en préparation', 'Fizik ap prepare'),
    },
    {
      icon: <Languages size={24} aria-hidden="true" />, tone: 'amber',
      title: t('Français ⇄ Kreyòl', 'Fransè ⇄ Kreyòl'),
      body: t('Un concept bloque ? Passe en kreyòl en un clic — la question, les réponses et la correction suivent.', 'Yon konsèp bloke w ? Pase an kreyòl nan yon klik — kesyon an, repons yo ak koreksyon an swiv.'),
      foot: t('Tout le site, dans les deux langues', 'Tout sit la, nan de lang yo'),
    },
    {
      icon: <Trophy size={24} aria-hidden="true" />, tone: 'emerald',
      title: t('La ligue des écoles', 'Lig lekòl yo'),
      body: t('Chaque quiz, jeu et examen fait monter ton école au classement national.', 'Chak quiz, jwèt ak egzamen fè lekòl ou monte nan klasman nasyonal la.'),
      foot: t('Finale en direct chaque mois', 'Final an dirèk chak mwa'),
    },
    {
      icon: <Wifi size={24} aria-hidden="true" />, tone: 'violet',
      title: t('Pensé pour les petits forfaits', 'Fèt pou ti fòfè'),
      body: t('Les pages déjà ouvertes restent lisibles sans connexion. Web, iOS et Android.', 'Paj ou deja louvri yo rete lizib san koneksyon. Wèb, iOS ak Android.'),
      foot: t('Gratuit pour les élèves', 'Gratis pou elèv yo'),
    },
  ];
  return (
    <section className="lp-section lp-pillars">
      <div className="lp-container">
        <div className="lp-pillars__head">
          <span className="lp-tag">{t('L’excellence scolaire pour tous', 'Ekselans lekòl pou tout moun')}</span>
          <h2 className="lp-section__title">{t('Conçu pour la réalité haïtienne', 'Fèt pou reyalite ayisyen an')}</h2>
        </div>
        <div className="lp-pillars__grid">
          {pillars.map((p) => (
            <article key={p.title} className="lp-pillar" data-reveal>
              <span className={`lp-pillar__icon lp-pillar__icon--${p.tone}`}>{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <span className={`lp-pillar__foot lp-pillar__foot--${p.tone}`}>{p.foot}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
