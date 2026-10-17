import React from 'react';
import { ShieldAlert, ShieldCheck } from '../../icons';
import './trust.css';

/**
 * "Résultats provisoires" / "Résultats définitifs" — read straight off the
 * tournament state (`provisional` | `final`, shared/arena/state.ts), never
 * inferred. No champion is declared while this says provisional.
 */
export default function ResultStatus({ final, isCreole, children }: {
  final: boolean;
  isCreole: boolean;
  /** Actions under the explanation (rules, dispute). */
  children?: React.ReactNode;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <div className={`trust-result ${final ? 'is-final' : 'is-provisional'}`} data-final={final ? 'true' : 'false'}>
      <p className="trust-result__badge">
        {final ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />}
        <strong>{final ? t('Résultats définitifs', 'Rezilta definitif') : t('Résultats provisoires', 'Rezilta pwovizwa')}</strong>
      </p>
      <p className="trust-result__body">
        {final
          ? t('La vérification est terminée. Ce classement ne changera plus.', 'Verifikasyon an fini. Klasman sa a p ap chanje ankò.')
          : t(
            'En cours de vérification : les rangs peuvent encore bouger. Les prix sont confirmés après la vérification et les gagnants sont contactés.',
            'Verifikasyon an ap fèt : plas yo ka toujou chanje. Nou konfime pri yo apre verifikasyon an e n ap kontakte moun ki genyen yo.',
          )}
      </p>
      {children ? <div className="trust-row">{children}</div> : null}
    </div>
  );
}
