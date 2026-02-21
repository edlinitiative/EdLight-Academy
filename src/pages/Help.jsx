import React from 'react';
import { Link } from 'react-router-dom';
import useStore from '../contexts/store';

export default function Help() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">{isCreole ? 'Sant sipò' : 'Centre d’aide'}</span>
            <h1>{isCreole ? 'Èd' : 'Aide'}</h1>
            <p className="text-muted">
              {isCreole
                ? 'Ti gid pou kòmanse vit, plis konsèy pou rezoud pwoblèm.'
                : 'Des guides pour démarrer rapidement, plus des conseils de dépannage.'}
            </p>
          </div>
        </div>

        <div className="practice-layout">
          <div className="practice-main">
            <div className="card card--compact" style={{ marginBottom: '0.75rem' }}>
              <h3 className="card__title">{isCreole ? 'Kòmanse' : 'Bien démarrer'}</h3>
              <ul className="list--bulleted text-muted">
                <li>
                  {isCreole
                    ? <>Ale nan <Link className="footer__link" to="/courses">Kou yo</Link> epi chwazi matyè a ak nivo NS la.</>
                    : <>Allez dans <Link className="footer__link" to="/courses">Cours</Link> puis choisissez la matière et le niveau NS.</>}
                </li>
                <li>
                  {isCreole
                    ? 'Louvri yon kou pou wè inite ak leson. Sèvi ak Pwochen/Anvan pou navige.'
                    : 'Ouvrez un cours pour voir les unités et les leçons. Utilisez Suivant/Précédent pour naviguer.'}
                </li>
                <li>
                  {isCreole
                    ? 'Klike Pratik pou kesyon ki adapte ak sa ou chwazi a.'
                    : 'Cliquez sur Pratique pour des questions adaptées à votre sélection.'}
                </li>
              </ul>
            </div>

            <div className="card card--compact" style={{ marginBottom: '0.75rem' }}>
              <h3 className="card__title">{isCreole ? 'Pratik & quiz inite' : 'Pratique et quiz d’unité'}</h3>
              <ul className="list--bulleted text-muted">
                <li>
                  {isCreole
                    ? <>Pratik: chwazi kou, nivo (NS I–IV), ak inite sou paj <Link className="footer__link" to="/quizzes">Quiz yo</Link>.</>
                    : <>Pratique : choisissez le cours, le niveau (NS I–IV) et l’unité sur la page <Link className="footer__link" to="/quizzes">Quiz</Link>.</>}
                </li>
                <li>
                  {isCreole
                    ? 'Quiz Inite: louvri nenpòt kou epi chwazi “Quiz Inite — 10 Kesyon” apre dènye sou-chapit la.'
                    : 'Quiz d’unité : ouvrez un cours et sélectionnez « Quiz d’unité — 10 questions » après le dernier sous-chapitre.'}
                </li>
                <li>
                  {isCreole
                    ? 'Ou gen jiska 3 esè ak endis ki vin pi presi; eksplikasyon parèt apre 3yèm esè a.'
                    : 'Vous avez jusqu’à 3 essais avec des indices progressifs ; l’explication apparaît après le 3e essai.'}
                </li>
              </ul>
            </div>

            <div className="card card--compact">
              <h3 className="card__title">{isCreole ? 'Depanaj' : 'Dépannage'}</h3>
              <ul className="list--bulleted text-muted">
                <li>
                  {isCreole
                    ? 'Videyo pa chaje: eseye rafrechi paj la oswa verifye koneksyon ou.'
                    : 'Vidéo qui ne charge pas : essayez de rafraîchir la page ou de vérifier votre connexion.'}
                </li>
                <li>
                  {isCreole
                    ? 'Pa gen kesyon pou yon inite: eseye yon lòt inite oswa yon lòt nivo; nou ajoute kesyon regilyèman.'
                    : 'Aucune question pour une unité : essayez une autre unité ou un autre niveau ; de nouvelles questions sont ajoutées régulièrement.'}
                </li>
                <li>
                  {isCreole
                    ? <>Ou bezwen èd? <Link className="footer__link" to="/contact">Kontakte nou</Link> epi bay detay kou a ak inite a.</>
                    : <>Besoin d’aide ? <Link className="footer__link" to="/contact">Contactez-nous</Link> en précisant le cours et l’unité.</>}
                </li>
              </ul>
            </div>
          </div>

          <aside className="practice-aside">
            <div className="card card--compact">
              <h3 className="card__title">{isCreole ? 'Aksè rapid' : 'Raccourcis'}</h3>
              <ul className="list--bulleted text-muted">
                <li><Link className="footer__link" to="/courses">{isCreole ? 'Gade kou yo' : 'Explorer les cours'}</Link></li>
                <li><Link className="footer__link" to="/quizzes">{isCreole ? 'Pratik quiz' : 'Quiz de pratique'}</Link></li>
                <li><Link className="footer__link" to="/contact">{isCreole ? 'Kontakte sipò' : 'Contacter le support'}</Link></li>
                <li><Link className="footer__link" to="/faq">{isCreole ? 'Gade kesyon yo (FAQ)' : 'Voir la FAQ'}</Link></li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
