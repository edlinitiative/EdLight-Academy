import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '../icons';
import useStore from '../../contexts/store';

/**
 * The one title row every Arène page opens on (/classement, /jeux,
 * /tournois, /defi): a way back, a confident display title, the page's
 * controls on the right — then straight into the content. No banner, no
 * greeting, no stat strip above the content (Ted, three times).
 * Styles live in styles/arenaNight.css, which Layout loads app-wide.
 */
export default function ArenaPageHead({
  title, sub, actions, back = '/arena', backLabel,
}: {
  title: React.ReactNode;
  /** One plain sentence under the title — what this page is for. Optional. */
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string | null;
  backLabel?: string;
}) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const label = backLabel || (isCreole ? 'Arèn' : 'Arène');
  return (
    <header className="aph">
      {back && (
        <Link to={back} className="aph__back" aria-label={label} title={label}>
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      )}
      <div className="aph__text">
        <h1 className="aph__title">{title}</h1>
        {sub && <p className="aph__sub">{sub}</p>}
      </div>
      {actions && <div className="aph__actions">{actions}</div>}
    </header>
  );
}
