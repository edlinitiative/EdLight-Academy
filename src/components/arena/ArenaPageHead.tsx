import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '../icons';
import useStore from '../../contexts/store';

/**
 * The header every Arène page shares (/classement, /jeux, /tournois, /defi):
 * a way back to the arcade, a gold over-label, a display title and one line
 * of lede, with room for the page's own actions on the right. Styles live in
 * styles/arenaNight.css, which Layout loads app-wide.
 */
export default function ArenaPageHead({
  over, title, lede, actions, back = '/arena', backLabel,
}: {
  over: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string | null;
  backLabel?: string;
}) {
  const isCreole = useStore((s) => s.language) === 'ht';
  return (
    <header className="aph">
      <div className="aph__copy">
        {back && (
          <Link to={back} className="aph__back">
            <ArrowLeft size={16} aria-hidden="true" /> {backLabel || (isCreole ? 'Arèn' : 'Arène')}
          </Link>
        )}
        <p className="aph__over">{over}</p>
        <h1 className="aph__title">{title}</h1>
        {lede && <p className="aph__lede">{lede}</p>}
      </div>
      {actions && <div className="aph__actions">{actions}</div>}
    </header>
  );
}
