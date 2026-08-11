import React from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../contexts/store';

/**
 * /defi/:code — landing page for "Défi d'un ami" duel links shared from the
 * mobile app. Duels are played in the app only, so this page's one job is to
 * hand the visitor off: "Ouvrir dans l'app" (custom scheme deep link) for
 * people who have it, store links for people who don't. The code is carried
 * into the scheme URL so the app opens straight onto the challenge.
 */
export default function Defi() {
  const { code } = useParams();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const cleanCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const appUrl = `edlight://defi/${cleanCode}`;

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560, textAlign: 'center' }}>
        <div className="page-header" style={{ justifyContent: 'center' }}>
          <div>
            <h1>⚔️ {isCreole ? 'Yo defye w !' : 'On te défie !'}</h1>
            <p className="text-muted">
              {isCreole
                ? 'Yon zanmi voye yon defi quiz ba ou sou EdLight Academy. Menm kesyon yo, yon sèl tantativ — louvri app la pou w jwe.'
                : "Un ami t'a lancé un défi quiz sur EdLight Academy. Les mêmes questions, une seule tentative — ouvre l'app pour jouer."}
            </p>
          </div>
        </div>

        {cleanCode ? (
          <p className="text-muted" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>
            {isCreole ? 'Kòd defi' : 'Code du défi'} : {cleanCode}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 16 }}>
          <a className="btn btn-primary" href={appUrl}>
            {isCreole ? "Louvri nan app la" : "Ouvrir dans l'app"}
          </a>
          <a
            className="btn"
            href="https://apps.apple.com/app/id6792210920"
            target="_blank"
            rel="noreferrer"
          >
            {isCreole ? 'Telechaje sou iPhone' : 'Télécharger sur iPhone'}
          </a>
          <a
            className="btn"
            href="https://play.google.com/store/apps/details?id=com.edlightacademy"
            target="_blank"
            rel="noreferrer"
          >
            {isCreole ? 'Telechaje sou Android' : 'Télécharger sur Android'}
          </a>
        </div>
      </div>
    </section>
  );
}
