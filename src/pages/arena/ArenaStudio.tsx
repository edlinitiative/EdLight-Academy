import React from 'react';
import ArenaPageHead from '../../components/arena/ArenaPageHead';
import useStore from '../../contexts/store';
import EnvironmentShowcase from '../../arena-art/environment/EnvironmentShowcase';
import AvatarShowcase from '../../arena-art/avatars/AvatarShowcase';
import SoundShowcase from '../../arena-art/sound/SoundShowcase';
import MotionShowcase from '../../arena-art/motion/MotionShowcase';
import IdentityShowcase from '../../arena-art/IdentityShowcase';
import CompetitionShowcase from './CompetitionShowcase';
import './ArenaStudio.css';

/**
 * /arena/studio — the Arène's art, characters, sound and motion, for review
 * before any of it reaches a student-facing page. Not linked from the site
 * and marked noindex.
 */
export default function ArenaStudio() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  React.useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  const sections = [
    { id: 'monde', title: t('Le monde', 'Mond lan'), sub: t('La ville et le stade, de nuit — trois ambiances.', 'Vil la ak estad la, lannwit — twa anbyans.'), el: <EnvironmentShowcase /> },
    { id: 'personnages', title: t('Les personnages', 'Pèsonaj yo'), sub: t('Avatars originaux et leurs états.', 'Avata orijinal ak eta yo.'), el: <AvatarShowcase /> },
    { id: 'identite', title: t('Écoles et joueurs', 'Lekòl ak jwè'), sub: t('Blasons d’école, emblèmes de rang et cartes de joueur.', 'Blazon lekòl, anblèm ran ak kat jwè.'), el: <IdentityShowcase /> },
    { id: 'son', title: t('Le son', 'Son an'), sub: t('L’identité sonore de l’Arène. Coupé par défaut.', 'Idantite son Arèn nan. Koupe pa defo.'), el: <SoundShowcase /> },
    { id: 'competitions', title: t('Compétitions', 'Konpetisyon'), sub: t('Espace compétitions et écran public, rendus depuis des données fictives.', 'Espas konpetisyon ak ekran piblik, ak done fiktif.'), el: <CompetitionShowcase /> },
    { id: 'mouvement', title: t('Le mouvement', 'Mouvman an'), sub: t('Révélation de l’adversaire, compte à rebours, cérémonie.', 'Revelasyon advèsè a, konte a, seremoni an.'), el: <MotionShowcase /> },
  ];
  return (
    <section className="section studio">
      <div className="container studio__container">
        <ArenaPageHead title={t('Studio de l’Arène', 'Estidyo Arèn nan')} sub={t('Aperçu interne — rien ici n’est encore dans l’Arène.', 'Apèsi entèn — anyen isit la poko nan Arèn nan.')} />
        <nav className="studio__nav" aria-label="Sections">
          {sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
        </nav>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="studio__sec" aria-labelledby={`${s.id}-t`}>
            <h2 id={`${s.id}-t`} className="studio__title">{s.title}</h2>
            <p className="studio__sub">{s.sub}</p>
            {s.el}
          </section>
        ))}
      </div>
    </section>
  );
}
