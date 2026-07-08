import React from 'react';

export default function Privacy() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>Politique de confidentialité</h1>
            <p className="text-muted">
              Nous respectons votre vie privée. Cette page explique quelles données EdLight Academy
              collecte, comment elles sont utilisées, avec qui elles sont partagées et quels sont vos droits.
            </p>
            <p className="text-muted" style={{ margin: 0 }}>Date d’entrée en vigueur : 7 juillet 2026</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">Qui sommes-nous</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              EdLight Academy est une plateforme éducative gratuite qui aide les élèves haïtiens à préparer
              le Baccalauréat, avec des cours, des vidéos, des quiz et des examens en français et en créole
              haïtien (Kreyòl). Pour toute question relative à cette politique ou à vos données, contactez-nous
              à <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a> ou consultez{' '}
              <a className="footer__link" href="https://edlight.org" target="_blank" rel="noopener noreferrer">edlight.org</a>.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Données que nous collectons</h3>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>Informations de compte :</strong> votre adresse e-mail et votre nom, fournis lors de
                l’inscription ou de la connexion. La connexion est gérée par Firebase Authentication, y compris
                la connexion avec Google (Google Sign-In).
              </li>
              <li>
                <strong>Données d’apprentissage :</strong> votre progression dans les cours et les leçons,
                vos tentatives et scores aux quiz et aux examens, vos points d’expérience (XP) et votre série
                de jours consécutifs (streak).
              </li>
              <li>
                <strong>Contenu que vous publiez :</strong> les commentaires que vous laissez sous les leçons.
              </li>
              <li>
                <strong>Informations techniques de base :</strong> des données d’appareil et d’utilisation
                (type d’appareil, navigateur, identifiants techniques) nécessaires au bon fonctionnement du
                service et aux notifications.
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Comment nous utilisons vos données</h3>
            <ul className="list--bulleted text-muted">
              <li>Vous donner accès aux cours, aux leçons, aux quiz et aux examens.</li>
              <li>Suivre et afficher votre progression, vos scores, votre XP et votre série de jours.</li>
              <li>Établir les classements (leaderboards) entre les élèves.</li>
              <li>Vous envoyer des notifications et des rappels d’étude.</li>
              <li>Assurer le fonctionnement, la sécurité et l’amélioration de la plateforme.</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Partage et prestataires tiers</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              Nous <strong>ne vendons pas</strong> vos données personnelles. Nous faisons appel à un nombre
              limité de prestataires de services qui traitent des données pour notre compte :
            </p>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>Google Firebase</strong> — authentification (Firebase Authentication), base de données
                (Firestore) et notifications (Cloud Messaging).
              </li>
              <li>
                <strong>YouTube</strong> — les vidéos des leçons sont intégrées via des lecteurs YouTube ; le
                visionnage d’une vidéo peut être soumis à la politique de confidentialité de Google/YouTube.
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Sécurité</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Vos données sont transmises de manière chiffrée (chiffrement en transit, HTTPS/TLS). Aucun système
              n’étant totalement infaillible, nous ne pouvons garantir une sécurité absolue, mais nous prenons
              des mesures raisonnables pour protéger vos informations.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Élèves et mineurs</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              EdLight Academy s’adresse principalement à des élèves du secondaire, dont certains sont mineurs.
              Nous ne collectons que les données nécessaires à l’apprentissage et nous n’utilisons pas les
              données des élèves à des fins publicitaires. Si vous êtes le parent ou le tuteur d’un mineur et
              souhaitez consulter ou supprimer ses données, contactez-nous à{' '}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Conservation et suppression des données</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Nous conservons vos données tant que votre compte est actif. Vous pouvez à tout moment demander
              la suppression de votre compte et des données associées en écrivant à{' '}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>. Nous traiterons
              votre demande dans un délai raisonnable.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Modifications de cette politique</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Nous pouvons mettre à jour cette politique de temps à autre. En cas de changement important, nous
              actualiserons la date d’entrée en vigueur indiquée ci-dessus.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Nous contacter</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Pour toute question concernant vos données ou cette politique de confidentialité, écrivez-nous à{' '}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
