import React from 'react';
import useStore from '../contexts/store';

export default function Privacy() {
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>{t('Politique de confidentialité', 'Règleman sou enfòmasyon prive')}</h1>
            <p className="text-muted">
              {t(
                "Nous respectons votre vie privée. Cette page explique quelles données EdLight Academy collecte, comment elles sont utilisées, avec qui elles sont partagées et quels sont vos droits.",
                "Nou respekte vi prive ou. Paj sa a esplike ki done EdLight Academy ranmase, kijan yo itilize yo, ak ki moun yo pataje yo, ak ki dwa ou genyen.",
              )}
            </p>
            <p className="text-muted" style={{ margin: 0 }}>{t('Date d’entrée en vigueur : 7 juillet 2026', 'Dat li antre an vigè : 7 jiyè 2026')}</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">{t('Qui sommes-nous', 'Ki moun nou ye')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "EdLight Academy est une plateforme éducative gratuite qui aide les élèves haïtiens à préparer le Baccalauréat, avec des cours, des vidéos, des quiz et des examens en français et en créole haïtien (Kreyòl). Pour toute question relative à cette politique ou à vos données, contactez-nous à ",
                "EdLight Academy se yon platfòm edikatif gratis ki ede elèv ayisyen prepare Bakaloreya a, ak kou, videyo, quiz ak egzamen an franse ak an kreyòl ayisyen (Kreyòl). Pou nenpòt kesyon sou règleman sa a oswa sou done ou, kontakte nou nan ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>{' '}
              {t('ou consultez', 'oswa vizite')}{' '}
              <a className="footer__link" href="https://edlight.org" target="_blank" rel="noopener noreferrer">edlight.org</a>.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Données que nous collectons', 'Done nou ranmase')}</h3>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>{t('Informations de compte :', 'Enfòmasyon kont :')}</strong>{' '}
                {t(
                  "votre adresse e-mail et votre nom, fournis lors de l’inscription ou de la connexion. La connexion est gérée par Firebase Authentication, y compris la connexion avec Google (Google Sign-In).",
                  "adrès imèl ou ak non ou, ke ou bay lè ou enskri oswa lè ou konekte. Se Firebase Authentication ki jere koneksyon an, ansanm ak koneksyon avèk Google (Google Sign-In).",
                )}
              </li>
              <li>
                <strong>{t('Données d’apprentissage :', 'Done aprantisaj :')}</strong>{' '}
                {t(
                  "votre progression dans les cours et les leçons, vos tentatives et scores aux quiz et aux examens, vos points d’expérience (XP) et votre série de jours consécutifs (streak).",
                  "pwogrè ou nan kou yo ak leson yo, tantativ ou ak nòt ou nan quiz yo ak egzamen yo, pwen eksperyans (XP) ou ak seri jou youn dèyè lòt ou (streak).",
                )}
              </li>
              <li>
                <strong>{t('Contenu que vous publiez :', 'Kontni ou pibliye :')}</strong>{' '}
                {t('les commentaires que vous laissez sous les leçons.', 'kòmantè ou kite anba leson yo.')}
              </li>
              <li>
                <strong>{t('Informations techniques de base :', 'Enfòmasyon teknik debaz :')}</strong>{' '}
                {t(
                  "des données d’appareil et d’utilisation (type d’appareil, navigateur, identifiants techniques) nécessaires au bon fonctionnement du service et aux notifications.",
                  "done sou aparèy ou ak jan ou itilize sèvis la (kalite aparèy, navigatè, idantifyan teknik) ki nesesè pou sèvis la mache byen ak pou notifikasyon yo.",
                )}
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Comment nous utilisons vos données', 'Kijan nou itilize done ou')}</h3>
            <ul className="list--bulleted text-muted">
              <li>{t('Vous donner accès aux cours, aux leçons, aux quiz et aux examens.', 'Ba ou aksè ak kou yo, leson yo, quiz yo ak egzamen yo.')}</li>
              <li>{t('Suivre et afficher votre progression, vos scores, votre XP et votre série de jours.', 'Swiv epi montre pwogrè ou, nòt ou, XP ou ak seri jou ou.')}</li>
              <li>{t('Établir les classements (leaderboards) entre les élèves.', 'Etabli klasman (leaderboard) ant elèv yo.')}</li>
              <li>{t('Vous envoyer des notifications et des rappels d’étude.', 'Voye notifikasyon ak rapèl pou etidye ba ou.')}</li>
              <li>{t('Assurer le fonctionnement, la sécurité et l’amélioration de la plateforme.', 'Asire fonksyònman, sekirite ak amelyorasyon platfòm nan.')}</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Partage et prestataires tiers', 'Pataj ak founisè tyès pati')}</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {t('Nous ', 'Nou ')}<strong>{t('ne vendons pas', 'pa vann')}</strong>{' '}
              {t(
                "vos données personnelles. Nous faisons appel à un nombre limité de prestataires de services qui traitent des données pour notre compte :",
                "done pèsonèl ou. Nou sèvi ak yon ti kantite founisè sèvis ki trete done pou nou :",
              )}
            </p>
            <ul className="list--bulleted text-muted">
              <li>
                <strong>Google Firebase</strong>{' '}
                {t(
                  "— authentification (Firebase Authentication), base de données (Firestore) et notifications (Cloud Messaging).",
                  "— otantifikasyon (Firebase Authentication), baz done (Firestore) ak notifikasyon (Cloud Messaging).",
                )}
              </li>
              <li>
                <strong>YouTube</strong>{' '}
                {t(
                  "— les vidéos des leçons sont intégrées via des lecteurs YouTube ; le visionnage d’une vidéo peut être soumis à la politique de confidentialité de Google/YouTube.",
                  "— videyo leson yo entegre atravè lektè YouTube ; lè ou gade yon videyo, sa ka soumèt anba règleman sou enfòmasyon prive Google/YouTube.",
                )}
              </li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Sécurité', 'Sekirite')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Vos données sont transmises de manière chiffrée (chiffrement en transit, HTTPS/TLS). Aucun système n’étant totalement infaillible, nous ne pouvons garantir une sécurité absolue, mais nous prenons des mesures raisonnables pour protéger vos informations.",
                "Done ou yo voye yon fason chifre (chifreman pandan transfè, HTTPS/TLS). Kòm pa gen okenn sistèm ki pafè nèt, nou pa ka garanti yon sekirite total, men nou pran mezi rezonab pou pwoteje enfòmasyon ou.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Élèves et mineurs', 'Elèv ak minè')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "EdLight Academy s’adresse principalement à des élèves du secondaire, dont certains sont mineurs. Nous ne collectons que les données nécessaires à l’apprentissage et nous n’utilisons pas les données des élèves à des fins publicitaires. Si vous êtes le parent ou le tuteur d’un mineur et souhaitez consulter ou supprimer ses données, contactez-nous à ",
                "EdLight Academy vize sitou elèv nan segondè, epi gen kèk ladan yo ki minè. Nou ranmase sèlman done ki nesesè pou aprantisaj la epi nou pa itilize done elèv yo pou piblisite. Si ou se paran oswa responsab yon minè epi ou vle gade oswa efase done li, kontakte nou nan ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Conservation et suppression des données', 'Konsèvasyon ak efasman done')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Nous conservons vos données tant que votre compte est actif. Vous pouvez à tout moment demander la suppression de votre compte et des données associées en écrivant à ",
                "Nou konsève done ou toutotan kont ou aktif. Ou ka mande nenpòt lè pou efase kont ou ak done ki mache avè l lè ou ekri nan ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.{' '}
              {t('Nous traiterons votre demande dans un délai raisonnable.', 'Nou pral trete demann ou nan yon delè rezonab.')}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Modifications de cette politique', 'Chanjman nan règleman sa a')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Nous pouvons mettre à jour cette politique de temps à autre. En cas de changement important, nous actualiserons la date d’entrée en vigueur indiquée ci-dessus.",
                "Nou ka mete règleman sa a ajou detanzantan. Si gen yon chanjman enpòtan, nou pral mete ajou dat li antre an vigè a ki endike anwo a.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('Nous contacter', 'Kontakte nou')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Pour toute question concernant vos données ou cette politique de confidentialité, écrivez-nous à ",
                "Pou nenpòt kesyon sou done ou oswa sou règleman sou enfòmasyon prive sa a, ekri nou nan ",
              )}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
