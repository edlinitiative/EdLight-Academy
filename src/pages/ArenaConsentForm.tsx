import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import useStore from '../contexts/store';

/**
 * The parental authorisation, as a page a parent can print and sign.
 *
 * A PDF generated server-side would be tidier and is not worth the dependency:
 * this has to work for a parent on a phone in Port-au-Prince as often as for
 * one at a desk. A page prints from any browser, saves to PDF from any browser,
 * and can be read aloud over the phone when neither is available.
 *
 * WHAT IT DOES NOT ASK FOR, deliberately and visibly: no identity document, no
 * document number, no bank details. Those are precisely the fields a scam built
 * on top of this tournament would add, so the form says out loud that we never
 * ask for them. A family that has read this once has a test they can apply to
 * the next message they receive.
 *
 * The prize amount and the deadline are filled in from the tournament document
 * (public: `startsAt`, `title`, `prizes` are all readable). Everything about
 * the child and the parent is left BLANK for them to write. Pre-filling a name
 * we hold onto a document somebody signs is how a form stops being a statement
 * the signer made and starts being one we made for them.
 */

type Tournament = { title: string; prizes: number[] } | null;

const money = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default function ArenaConsentForm() {
  const [params] = useSearchParams();
  const tid = params.get('tid') || '';
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [tournament, setTournament] = useState<Tournament>(null);

  useEffect(() => {
    if (!tid) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'tournaments', tid));
        const d = snap.data() as any;
        if (!alive || !d) return;
        setTournament({
          title: String(d.title || tid),
          prizes: Array.isArray(d?.prizes?.individual)
            ? d.prizes.individual.filter((p: any) => typeof p === 'number')
            : [],
        });
      } catch {
        /* the form is still printable without it — the blanks just stay blank */
      }
    })();
    return () => { alive = false; };
  }, [tid]);

  const prizeLine = useMemo(() => {
    if (!tournament || tournament.prizes.length === 0) return null;
    return tournament.prizes.map(money).join(' · ');
  }, [tournament]);

  const rule: React.CSSProperties = {
    borderBottom: '1px solid #9aa3ae', display: 'inline-block',
    minWidth: 220, height: '1.4em', verticalAlign: 'bottom',
  };

  const Field = ({ label, width = 260 }: { label: string; width?: number }) => (
    <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 2 }}>
      {label} <span style={{ ...rule, minWidth: width }} />
    </p>
  );

  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
      <style>{`
        @media print {
          .arena-consent__noprint { display: none !important; }
          .page { padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="arena-consent__noprint" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => window.print()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Printer size={16} aria-hidden="true" />
          {t('Imprimer ou enregistrer en PDF', 'Enprime oswa anrejistre an PDF')}
        </button>
        <p style={{ fontSize: 13, color: '#5B6572', marginTop: 10 }}>
          {t(
            'Imprimez cette page, signez-la à la main, puis photographiez-la ou scannez-la. Vous pouvez aussi l’enregistrer en PDF, la signer sur écran, et déposer le fichier sur la page de réclamation.',
            'Enprime paj sa a, siyen l ak men ou, apre sa pran yon foto oswa eskane l. Ou ka tou anrejistre l an PDF, siyen l sou ekran an, epi depoze fichye a sou paj reklamasyon an.',
          )}
        </p>
      </div>

      <article style={{ background: '#fff', borderRadius: 12, padding: '36px 40px', color: '#141A21' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>
          {t('Autorisation parentale', 'Otorizasyon paran')}
        </h1>
        <p style={{ fontSize: 14, color: '#5B6572', margin: '0 0 28px' }}>
          {tournament?.title || t('Tournoi EdLight Academy', 'Tounwa EdLight Academy')}
          {prizeLine ? ` — ${prizeLine}` : ''}
        </p>

        <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 28px' }}>
          {t(
            'Ce formulaire autorise EdLight Academy à remettre un prix gagné par un mineur au parent ou tuteur qui le signe. Il ne donne aucun autre droit et n’engage la famille à rien d’autre.',
            'Fòm sa a otorize EdLight Academy pou l bay yon paran oswa yon responsab ki siyen l pri yon timoun genyen. Li pa bay okenn lòt dwa epi li pa angaje fanmi an nan anyen lòt.',
          )}
        </p>

        <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px' }}>
          {t('L’élève', 'Elèv la')}
        </h2>
        <Field label={t('Nom complet', 'Non konplè')} />
        <Field label={t('École', 'Lekòl')} />
        <Field label={t('Date de naissance', 'Dat nesans')} width={180} />

        <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 16px' }}>
          {t('Le parent ou tuteur', 'Paran an oswa responsab la')}
        </h2>
        <Field label={t('Nom complet', 'Non konplè')} />
        <Field label={t('Lien avec l’élève', 'Relasyon ak elèv la')} width={200} />
        <Field label={t('Téléphone', 'Telefòn')} width={200} />
        <Field label={t('Email', 'Imel')} />

        <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 16px' }}>
          {t('Déclaration', 'Deklarasyon')}
        </h2>
        <ul style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: '0 0 28px' }}>
          <li>{t(
            'Je suis le parent ou le tuteur légal de l’élève nommé ci-dessus.',
            'Se mwen ki paran oswa responsab legal elèv ki nonmen anwo a.',
          )}</li>
          <li>{t(
            'J’autorise EdLight Academy à me remettre le prix gagné par cet élève.',
            'Mwen otorize EdLight Academy pou l ban mwen pri elèv sa a genyen an.',
          )}</li>
          <li>{t(
            'Les informations que j’ai écrites ici sont exactes.',
            'Enfòmasyon mwen ekri la yo se laverite.',
          )}</li>
          <li>{t(
            'Je comprends que les résultats sont provisoires jusqu’à vérification, et qu’un prix peut être retiré si une irrégularité est établie.',
            'Mwen konprann rezilta yo pwovizwa jiskaske nou verifye, epi yo ka retire yon pri si yo jwenn yon iregilarite.',
          )}</li>
        </ul>

        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginTop: 36 }}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ borderBottom: '1px solid #141A21', height: 48 }} />
            <p style={{ fontSize: 12, color: '#5B6572', margin: '6px 0 0' }}>
              {t('Signature du parent ou tuteur', 'Siyati paran an oswa responsab la')}
            </p>
          </div>
          <div style={{ flex: '0 1 180px' }}>
            <div style={{ borderBottom: '1px solid #141A21', height: 48 }} />
            <p style={{ fontSize: 12, color: '#5B6572', margin: '6px 0 0' }}>{t('Date', 'Dat')}</p>
          </div>
        </div>

        <p style={{
          marginTop: 36, padding: '12px 14px', borderRadius: 8, background: '#FFF6E8',
          fontSize: 13, lineHeight: 1.6,
        }}>
          {t(
            'EdLight Academy ne vous demandera jamais une photo de pièce d’identité, un numéro de document, des informations bancaires, ni un paiement. Si un message vous demande cela en notre nom, il ne vient pas de nous.',
            'EdLight Academy p ap janm mande ou yon foto kat idantite, yon nimewo dokiman, enfòmasyon labank, ni yon peman. Si yon mesaj mande ou sa nan non nou, li pa soti nan men nou.',
          )}
        </p>
      </article>
    </div>
  );
}
