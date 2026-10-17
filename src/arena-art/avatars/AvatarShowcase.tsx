import React from 'react';
import useStore from '../../contexts/store';
import Avatar from './Avatar';
import { AVATAR_MOODS, AvatarMood, HairStyle, SCHOOL_COLORS, avatarTraits } from './traits';
import './avatars.css';

// Real-looking ids chosen so the grid shows all 8 hair styles and 8 skin tones.
const SEEDS = [
  'u-roseline', 'u-jean-marc', 'u-kervens', 'u-mirlande', 'u-wideline', 'u-dieula',
  'u-sherly', 'u-fedna', 'u-bendy', 'u-kenny', 'u-emmanuel', 'u-rose-darline',
];

const HAIR_TEXT: Record<HairStyle, [string, string]> = {
  fade: ['Dégradé', 'Degrade'],
  afro: ['Afro', 'Afro'],
  cornrows: ['Nattes collées', 'Très kole'],
  puffs: ['Deux puffs', 'De ti boul'],
  locs: ['Locks', 'Dread'],
  crop: ['Coupe courte', 'Tèt koupe kout'],
  braids: ['Tresses, chignon', 'Très, chiyon'],
  headwrap: ['Foulard', 'Mouchwa tèt'],
};

const MOOD_TEXT: Record<AvatarMood, { fr: string; ht: string; dfr: string; dht: string }> = {
  idle: { fr: 'Au repos', ht: 'Repo', dfr: 'Respire doucement, cligne des yeux.', dht: 'L ap respire dousman, l ap bat je.' },
  ready: { fr: 'Prêt·e', ht: 'Pare', dfr: 'Déterminé·e, penché·e en avant.', dht: 'Detèmine, l panche pi devan.' },
  focused: { fr: 'Concentré·e', ht: 'Konsantre', dfr: 'Sourcils serrés, regard sur la question.', dht: 'Sousi sere, je l sou kesyon an.' },
  celebrating: { fr: 'Fête', ht: 'Fèt', dfr: 'Grand sourire, petit saut, confettis une fois.', dht: 'Gwo souri, ti sote, konfeti yon sèl fwa.' },
  recovering: { fr: 'On repart', ht: 'Nou rekòmanse', dfr: 'Après une erreur : on se secoue, petit sourire décidé.', dht: 'Apre yon erè : nou souke kò nou, ti souri detèmine.' },
};

export default function AvatarShowcase() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [mood, setMood] = React.useState<AvatarMood>('idle');
  const [still, setStill] = React.useState(false);
  const m = MOOD_TEXT[mood];

  return (
    <div className="av-show">
      <div className="av-show__stage">
        <Avatar seed="u-dieula" mood={mood} size={240} still={still}
          title={t(`Élève, état : ${m.fr}`, `Elèv, eta : ${m.ht}`)} />
        <div>
          <p className="av-show__label">{t('État', 'Eta')}</p>
          <p className="av-show__moodname" aria-live="polite">{t(m.fr, m.ht)}</p>
          <p className="av-show__note">{t(m.dfr, m.dht)}</p>
          <div className="av-show__moods" role="group" aria-label={t('Choisir un état', 'Chwazi yon eta')}>
            {AVATAR_MOODS.map((k) => (
              <button key={k} type="button" className="av-show__btn" aria-pressed={mood === k} onClick={() => setMood(k)}>
                {t(MOOD_TEXT[k].fr, MOOD_TEXT[k].ht)}
              </button>
            ))}
          </div>
          <div className="av-show__moods">
            <button type="button" className="av-show__btn av-show__toggle" aria-pressed={still} onClick={() => setStill((v) => !v)}>
              {t('Mouvement réduit', 'Mouvman redwi')} : {still ? t('oui', 'wi') : t('non', 'non')}
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="av-show__label">{t('Douze élèves, douze écoles', 'Douz elèv, douz lekòl')}</p>
        <div className="av-show__grid">
          {SEEDS.map((s, i) => {
            const tr = avatarTraits(s);
            return (
              <div key={s} className="av-show__cell">
                <Avatar seed={s} size={120} mood={mood} still={still} colors={SCHOOL_COLORS[i % SCHOOL_COLORS.length]} />
                <small>{t(...HAIR_TEXT[tr.hair])}{tr.glasses !== 'none' ? ' · ' + t('lunettes', 'linèt') : ''}</small>
              </div>
            );
          })}
        </div>
        <p className="av-show__note">
          {t('Chaque élève est tiré·e de son identifiant : même identifiant, même personnage, partout.',
            'Chak elèv soti nan idantifyan li : menm idantifyan, menm pèsonaj, toupatou.')}
        </p>
      </div>

      <div>
        <p className="av-show__label">{t('En petit (32 px) — classements, listes', 'An piti (32 px) — klasman, lis')}</p>
        <div className="av-show__row">
          {SEEDS.map((s, i) => (
            <Avatar key={s} seed={s} size={32} mood={i % 5 === 3 ? 'celebrating' : mood} still={still}
              colors={SCHOOL_COLORS[i % SCHOOL_COLORS.length]} />
          ))}
        </div>
      </div>
    </div>
  );
}
