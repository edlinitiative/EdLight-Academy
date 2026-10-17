import React from 'react';
import useStore from '../../contexts/store';
import ArenaWorld, { Occasion } from './ArenaWorld';
import './ArenaWorld.css';
import './EnvironmentShowcase.css';

type Item = { occ: Occasion; banners: [string, string]; fr: [string, string]; ht: [string, string] };

const ITEMS: Item[] = [
  {
    occ: 'everyday',
    banners: ['#1F5FD1', '#D7263D'],
    fr: ['Tous les jours', 'La ville calme, le stade au repos — on entre jouer en toute simplicité.'],
    ht: ['Chak jou', 'Vil la kalm, estad la ap repoze — ou antre jwe san traka.'],
  },
  {
    occ: 'match',
    banners: ['#1FA36B', '#7B4FD6'],
    fr: ['Soir de match', 'Les couleurs des deux écoles sur la façade et dans la rue, la scène s’allume.'],
    ht: ['Swa match', 'Koulè de lekòl yo sou fasad la ak nan lari a, sèn nan limen.'],
  },
  {
    occ: 'championship',
    banners: ['#1F5FD1', '#D7263D'],
    fr: ['Championnat national', 'Faisceaux coordonnés, trophée illuminé, guirlandes d’or — réservé à la finale.'],
    ht: ['Chanpyona nasyonal', 'Limyè ki danse ansanm, twofe a klere, gilann lò — se pou final la sèlman.'],
  },
];

export default function EnvironmentShowcase() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [still, setStill] = React.useState(false);

  return (
    <div className="aw-show">
      <label className="aw-show__toggle">
        <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} />
        <span>{t('Mouvement réduit', 'Mouvman redwi')}</span>
      </label>

      <h3 className="aw-show__h">{t('Ordinateur — composition large', 'Òdinatè — konpozisyon laj')}</h3>
      <div className="aw-show__wide">
        {ITEMS.map((it) => (
          <figure key={it.occ} className="aw-show__fig">
            <ArenaWorld occasion={it.occ} layout="wide" banners={it.banners} still={still} />
            <figcaption>
              <strong>{isCreole ? it.ht[0] : it.fr[0]}</strong>
              <span>{isCreole ? it.ht[1] : it.fr[1]}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      <h3 className="aw-show__h">{t('Téléphone — composition verticale', 'Telefòn — konpozisyon vètikal')}</h3>
      <div className="aw-show__tall">
        {ITEMS.map((it) => (
          <figure key={it.occ} className="aw-show__fig aw-show__fig--tall">
            <ArenaWorld occasion={it.occ} layout="tall" banners={it.banners} still={still} />
            <figcaption>
              <strong>{isCreole ? it.ht[0] : it.fr[0]}</strong>
              <span>{isCreole ? it.ht[1] : it.fr[1]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
