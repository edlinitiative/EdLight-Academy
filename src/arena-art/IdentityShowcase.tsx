import React from 'react';
import useStore from '../contexts/store';
import SchoolCrest from './crest/SchoolCrest';
import RankEmblem, { EMBLEM_TIERS, ParticipationBadge } from './emblems/RankEmblem';
import PlayerCard from './cards/PlayerCard';
import './cards/showcase.css';

/**
 * Studio review sheet for school identity: crests, banners, rank emblems,
 * the participation badge and player cards. Demo data only, labelled so.
 */
const SCHOOLS = [
  'Institution Saint-Louis de Gonzague',
  'Collège Canado Haïtien',
  'Lycée Toussaint Louverture',
  'Collège Jean Wesley',
  'Lycée Alexandre Pétion',
  'Collège Saint-Pierre',
  'Institution du Sacré-Cœur',
  'École Nationale de Jacmel',
  'Lycée Philippe Guerrier',
  'Collège Catts Pressoir',
  'Lycée National de Cap-Haïtien',
  'Collège Pratique du Nord',
];

const TIER_LEVELS = [3, 7, 12, 24, 42];

export default function IdentityShowcase() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const demo = <span className="pcard-sc-demo">{t('Démo', 'Demo')}</span>;

  const players = [
    { uid: 'demo-1', name: 'Lalin_Fizik', school: SCHOOLS[1], level: 42, xp: 18640, rank: 3, title: t('Reine des équations', 'Rèn ekwasyon yo'), mood: 'celebrating' as const },
    { uid: 'demo-2', name: 'BòsKalkil509', school: SCHOOLS[2], level: 24, xp: 9210, rank: 17, title: t('Série de 10', 'Seri 10'), mood: 'ready' as const },
    { uid: 'demo-3', name: 'Ti Chouchou', school: SCHOOLS[0], level: 12, xp: 3980, rank: null, title: null, mood: 'idle' as const },
    { uid: 'demo-4', name: 'MòjoMatematik', school: SCHOOLS[3], level: 7, xp: 1420, rank: 48, title: null, mood: 'focused' as const },
    { uid: 'demo-5', name: 'Nènè.Lekti', school: SCHOOLS[7], level: 2, xp: 160, rank: null, title: null, mood: 'idle' as const },
  ];

  return (
    <div className="pcard-sc">
      <section className="pcard-sc-block" aria-labelledby="sc-crests">
        <h3 id="sc-crests" className="pcard-sc-h">{t('Blasons d’école', 'Blazon lekòl')}</h3>
        <p className="pcard-sc-p">
          {t(
            'Générés à partir du nom de l’école : forme, partition, symbole et couleurs. Deux orthographes d’une même école donnent le même blason.',
            'Yo fèt apati non lekòl la : fòm, divizyon, senbòl ak koulè. De fason ekri menm lekòl la bay menm blazon an.',
          )}
        </p>
        <ul className="pcard-sc-crests">
          {SCHOOLS.map((s) => (
            <li key={s}>
              <SchoolCrest name={s} size={72} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <h4 className="pcard-sc-h4">{t('À 18 px, dans une liste', 'A 18 px, nan yon lis')}</h4>
        <ul className="pcard-sc-tiny">
          {SCHOOLS.slice(0, 3).map((s) => (
            <li key={s}><SchoolCrest name={s} size={18} /><span>{s}</span></li>
          ))}
        </ul>
        <h4 className="pcard-sc-h4">{t('Bannières pour le stade', 'Banyè pou estad la')}</h4>
        <div className="pcard-sc-banners">
          {SCHOOLS.slice(0, 6).map((s) => <SchoolCrest key={s} name={s} size={92} variant="banner" title={s} />)}
        </div>
      </section>

      <section className="pcard-sc-block" aria-labelledby="sc-emb">
        <h3 id="sc-emb" className="pcard-sc-h">{t('Emblèmes de rang', 'Anblèm ran')}</h3>
        <p className="pcard-sc-p">
          {t(
            'Une silhouette par palier, lisible même en petit. Les matières s’enrichissent avec le niveau ; seule la Légende s’anime, et jamais si le mouvement est réduit.',
            'Yon fòm pou chak etap, li klè menm piti. Materyo yo vin pi rich ak nivo a ; se sèlman Lejand ki bouje, e jamè si mouvman an redwi.',
          )}
        </p>
        <ul className="pcard-sc-emblems">
          {EMBLEM_TIERS.map((tier, i) => (
            <li key={tier.id}>
              <RankEmblem level={TIER_LEVELS[i]} size={64} />
              <span className="pcard-sc-emb-small"><RankEmblem level={TIER_LEVELS[i]} size={20} /></span>
              <strong>{isCreole ? tier.nameHt : tier.nameFr}</strong>
              <span>{t(`Dès le niveau ${tier.minLevel}`, `Apati nivo ${tier.minLevel}`)}</span>
            </li>
          ))}
        </ul>
        <div className="pcard-sc-part">
          <ParticipationBadge school={SCHOOLS[1]} size={64} />
          <ParticipationBadge school={SCHOOLS[2]} size={20} />
          <div>
            <strong>{t('A joué pour son école', 'Te jwe pou lekòl li')}</strong>
            <span>
              {t(
                'Pour chaque élève qui a joué pour son école cette semaine, dans le Cinq Majeur ou non. Ne compte pas dans le score du championnat.',
                'Pou chak elèv ki te jwe pou lekòl li semèn sa a, nan Senk Majè a oswa non. Li pa konte nan nòt chanpyona a.',
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="pcard-sc-block" aria-labelledby="sc-cards">
        <h3 id="sc-cards" className="pcard-sc-h">{t('Cartes de joueur', 'Kat jwè')} {demo}</h3>
        <p className="pcard-sc-p">
          {t('Identité publique seulement : le pseudo, l’école, le rang. Joueurs fictifs.', 'Idantite piblik sèlman : psedo a, lekòl la, ran an. Jwè fiktif.')}
        </p>
        <h4 className="pcard-sc-h4">{t('Grande — à collectionner', 'Gwo — pou kolekte')}</h4>
        <div className="pcard-sc-lg">
          {players.slice(0, 3).map((p) => <PlayerCard key={p.uid} {...p} size="lg" />)}
        </div>
        <h4 className="pcard-sc-h4">{t('Moyenne — présentation de match', 'Mwayen — prezantasyon match')}</h4>
        <div className="pcard-sc-md">
          {players.slice(0, 2).map((p) => <PlayerCard key={p.uid} {...p} size="md" />)}
        </div>
        <h4 className="pcard-sc-h4">{t('Petite — listes et classements', 'Piti — lis ak klasman')}</h4>
        <div className="pcard-sc-sm">
          {players.map((p) => <PlayerCard key={p.uid} {...p} size="sm" />)}
        </div>
      </section>
    </div>
  );
}
