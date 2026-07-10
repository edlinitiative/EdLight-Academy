import React from 'react';
import useStore from '../contexts/store';

export default function Terms() {
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>{t('Conditions d’utilisation', 'Kondisyon itilizasyon')}</h1>
            <p className="text-muted">
              {t(
                "Ces conditions régissent votre utilisation d’EdLight Academy. En utilisant le site, vous les acceptez.",
                "Kondisyon sa yo gouvène jan ou itilize EdLight Academy. Lè ou itilize sit la, ou dakò avèk yo.",
              )}
            </p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">{t('1. Acceptation des conditions', '1. Aksepte kondisyon yo')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "En accédant à la plateforme ou en l’utilisant, vous acceptez ces Conditions d’utilisation et notre Politique de confidentialité.",
                "Lè ou aksede platfòm nan oswa ou itilize l, ou dakò ak Kondisyon itilizasyon sa yo ak Règleman sou enfòmasyon prive nou an.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('2. Comptes et accès', '2. Kont ak aksè')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Vous êtes responsable de la confidentialité de votre compte et de toutes les activités qui s’y déroulent. Prévenez-nous de toute utilisation non autorisée.",
                "Se ou ki responsab pou kenbe kont ou konfidansyèl ak pou tout aktivite ki fèt anba l. Avèti nou si gen nenpòt itilizasyon san otorizasyon.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('3. Utilisations autorisées', '3. Itilizasyon ki otorize')}</h3>
            <ul className="list--bulleted text-muted">
              <li>{t('Utilisez le site pour un apprentissage personnel et non commercial.', 'Itilize sit la pou aprantisaj pèsonèl, pa pou komès.')}</li>
              <li>{t('Respectez toutes les lois applicables et les droits d’autrui.', 'Respekte tout lwa ki aplikab yo ak dwa lòt moun.')}</li>
              <li>{t('N’essayez pas de perturber, de faire de l’ingénierie inverse ou de détourner la plateforme.', 'Pa eseye deranje platfòm nan, demonte l pou wè kijan li fèt, oswa mal itilize l.')}</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('4. Contenu et propriété intellectuelle', '4. Kontni ak pwopriyete entèlektyèl')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Les supports de cours et les quiz sont fournis pour votre apprentissage. Ne redistribuez pas et ne copiez pas le contenu sans autorisation.",
                "Materyèl kou yo ak quiz yo bay pou aprantisaj ou. Pa redistribye ni kopye kontni an san otorizasyon.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('5. Avertissements', '5. Avètisman')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Le service est fourni « tel quel », sans garanties. Nous nous efforçons d’être exacts mais ne garantissons pas un contenu sans erreur ni une disponibilité ininterrompue.",
                "Sèvis la bay « jan li ye a », san garanti. Nou fè jefò pou li egzak, men nou pa garanti yon kontni san erè ni yon disponiblite san koupi.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('6. Modifications et résiliation', '6. Chanjman ak rezilyasyon')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t(
                "Nous pouvons mettre à jour la plateforme ou ces conditions de temps à autre. Nous pouvons suspendre ou résilier l’accès en cas de violation ou pour des raisons de sécurité.",
                "Nou ka mete platfòm nan oswa kondisyon sa yo ajou detanzantan. Nou ka sispann oswa rezilye aksè a si gen vyolasyon oswa pou rezon sekirite.",
              )}
            </p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">{t('7. Contact', '7. Kontak')}</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {t('Des questions sur ces conditions ? Écrivez à ', 'Ou gen kesyon sou kondisyon sa yo ? Ekri nan ')}
              <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
