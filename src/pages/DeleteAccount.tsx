import React from 'react';
import useStore from '../contexts/store';

export default function DeleteAccount() {
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>{t('Supprimer votre compte', 'Efase kont ou')}</h1>
            <p className="text-muted">
              {t(
                "Vous pouvez à tout moment demander la suppression de votre compte EdLight Academy et de toutes les données associées. Cette page explique comment faire cette demande, quelles données sont supprimées et dans quel délai.",
                "Ou ka mande nenpòt lè pou efase kont EdLight Academy ou ak tout done ki mache avè l. Paj sa a esplike kijan pou fè demann sa a, ki done ki efase ak nan ki delè.",
              )}
            </p>
            <p className="text-muted" style={{ margin: 0 }}>{t('Date d’entrée en vigueur : 7 juillet 2026', 'Dat li antre an vigè : 7 jiyè 2026')}</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">{t('Comment demander la suppression', 'Kijan pou mande efasman')}</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {t(
                "Pour demander la suppression de votre compte EdLight Academy et de toutes les données associées, envoyez un e-mail à ",
                "Pou mande efasman kont EdLight Academy ou ak tout done ki mache avè l, voye yon imèl bay ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org?subject=Suppression%20de%20compte">info@edlight.org</a>{' '}
              {t(
                "depuis l’adresse e-mail de votre compte, avec pour objet ",
                "depi adrès imèl kont ou, ak sijè ",
              )}
              <strong>{t('« Suppression de compte »', '« Efase kont »')}</strong>.
            </p>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Cette procédure fonctionne pour tous les comptes, qu’ils aient été créés avec une adresse e-mail et un mot de passe ou via la connexion avec Google (Google Sign-In). Nous confirmerons votre demande à l’adresse e-mail de votre compte.",
                "Pwosedi sa a mache pou tout kont, kit ou te kreye yo avèk yon adrès imèl ak yon modpas oswa atravè koneksyon avèk Google (Google Sign-In). Nou pral konfime demann ou nan adrès imèl kont ou.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Données qui sont supprimées', 'Done ki efase')}</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {t(
                "Lorsque nous traitons votre demande, nous supprimons l’ensemble des données associées à votre compte, notamment :",
                "Lè nou trete demann ou, nou efase tout done ki mache ak kont ou, sitou :",
              )}
            </p>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>{t('Votre compte :', 'Kont ou :')}</strong>{' '}
                {t('votre adresse e-mail et votre nom.', 'adrès imèl ou ak non ou.')}
              </li>
              <li>
                <strong>{t('Votre progression d’apprentissage :', 'Pwogrè aprantisaj ou :')}</strong>{' '}
                {t('votre avancement dans les cours et les leçons.', 'avansman ou nan kou yo ak leson yo.')}
              </li>
              <li>
                <strong>{t('Vos tentatives et scores :', 'Tantativ ou ak nòt ou :')}</strong>{' '}
                {t('vos tentatives et résultats aux quiz et aux examens.', 'tantativ ou ak rezilta ou nan quiz yo ak egzamen yo.')}
              </li>
              <li>
                <strong>{t('Vos points d’expérience (XP) et votre série de jours consécutifs (streak).', 'Pwen eksperyans (XP) ou ak seri jou youn dèyè lòt ou (streak).')}</strong>
              </li>
              <li>
                <strong>{t('Les commentaires que vous avez publiés', 'Kòmantè ou te pibliye yo')}</strong>{' '}
                {t('sous les leçons.', 'anba leson yo.')}
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Délai de suppression et conservation', 'Delè efasman ak konsèvasyon')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t('Vos données seront supprimées dans un délai de ', 'Done ou yo ap efase nan yon delè ')}
              <strong>{t('30 jours', '30 jou')}</strong>{' '}
              {t(
                "à compter de la réception de votre demande, sauf lorsque la conservation de certaines données est requise par la loi. Une fois supprimées, ces données ne peuvent pas être récupérées.",
                "apati lè nou resevwa demann ou, esepte lè lalwa egzije pou nou konsève sèten done. Yon fwa yo efase, done sa yo pa ka rekipere.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Nous contacter', 'Kontakte nou')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Pour toute question concernant la suppression de votre compte ou de vos données, écrivez-nous à ",
                "Pou nenpòt kesyon sou efasman kont ou oswa done ou, ekri nou nan ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
