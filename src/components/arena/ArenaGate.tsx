import React from 'react';
import { Link } from 'react-router-dom';
import { LogIn } from '../icons';
import useStore from '../../contexts/store';

/** A six-cell PIN board — the tournament's way in, drawn. */
export function PinArt() {
  return (
    <span className="an-pinart">
      <span className="an-pinart__label">PIN</span>
      <span className="an-pinart__cells">
        {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ '--d': `${i * 0.12}s` } as React.CSSProperties} />)}
      </span>
    </span>
  );
}

/**
 * The Arène's signed-out door: what this place is, why it needs an account,
 * and one coral button — instead of a bare box saying « connecte-toi ».
 * `art` is the page's own illustration (a PIN board, a duel…).
 */
export default function ArenaGate({
  over, title, text, art, back = '/arena', backLabel,
}: {
  over: string;
  title: string;
  text: string;
  art: React.ReactNode;
  back?: string;
  backLabel?: string;
}) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <div className="agate an-panel an-panel--edge">
      <div className="agate__art" aria-hidden="true">{art}</div>
      <div className="agate__body">
        <p className="aph__over">{over}</p>
        <h1 className="agate__title">{title}</h1>
        <p className="agate__text">{text}</p>
        <div className="agate__actions">
          <button type="button" className="an-go" onClick={toggleAuthModal}>
            <LogIn size={18} aria-hidden="true" /> {t('Se connecter', 'Konekte')}
          </button>
          <Link to={back} className="an-ghost">{backLabel || t('Retour à l’Arène', 'Tounen nan Arèn nan')}</Link>
        </div>
        <p className="agate__note">{t('Gratuit. Dix secondes avec Google.', 'Gratis. Dis segonn ak Google.')}</p>
      </div>
    </div>
  );
}
