import React from 'react';

export default function DeleteAccount() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>Supprimer votre compte</h1>
            <p className="text-muted">
              Vous pouvez à tout moment demander la suppression de votre compte EdLight Academy et de
              toutes les données associées. Cette page explique comment faire cette demande, quelles
              données sont supprimées et dans quel délai.
            </p>
            <p className="text-muted" style={{ margin: 0 }}>Date d’entrée en vigueur : 7 juillet 2026</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">Comment demander la suppression</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              Pour demander la suppression de votre compte EdLight Academy et de toutes les données
              associées, envoyez un e-mail à{' '}
              <a className="footer__link" href="mailto:info@edlight.org?subject=Suppression%20de%20compte">info@edlight.org</a>{' '}
              depuis l’adresse e-mail de votre compte, avec pour objet <strong>« Suppression de compte »</strong>.
            </p>
            <p className="text-muted" style={{ margin: 0 }}>
              Cette procédure fonctionne pour tous les comptes, qu’ils aient été créés avec une adresse
              e-mail et un mot de passe ou via la connexion avec Google (Google Sign-In). Nous confirmerons
              votre demande à l’adresse e-mail de votre compte.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Données qui sont supprimées</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              Lorsque nous traitons votre demande, nous supprimons l’ensemble des données associées à votre
              compte, notamment :
            </p>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>Votre compte :</strong> votre adresse e-mail et votre nom.
              </li>
              <li>
                <strong>Votre progression d’apprentissage :</strong> votre avancement dans les cours et les
                leçons.
              </li>
              <li>
                <strong>Vos tentatives et scores :</strong> vos tentatives et résultats aux quiz et aux
                examens.
              </li>
              <li>
                <strong>Vos points d’expérience (XP) et votre série de jours consécutifs (streak).</strong>
              </li>
              <li>
                <strong>Les commentaires que vous avez publiés</strong> sous les leçons.
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Délai de suppression et conservation</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Vos données seront supprimées dans un délai de <strong>30 jours</strong> à compter de la
              réception de votre demande, sauf lorsque la conservation de certaines données est requise par
              la loi. Une fois supprimées, ces données ne peuvent pas être récupérées.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Nous contacter</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Pour toute question concernant la suppression de votre compte ou de vos données, écrivez-nous à{' '}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
