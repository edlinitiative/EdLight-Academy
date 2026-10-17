import React, { useCallback, useRef } from 'react';
import { AlertTriangle, Check, Clock, RefreshCw, WifiOff } from '../../icons';
import { acceptChallenge, getChallenge, type AcceptResult } from '../../../services/challengeWebService';
import { acceptErrorMessage, outcomeFor, type DuelLike } from '../../../utils/duels';
import { duelSubmitView } from './trustState';
import { useOnline, useOnReconnect } from './useOnline';
import RulesButton from './RulesSheet';
import ReportProblem from './ReportProblem';
import { DUEL_RULES } from './rulesFacts';
import './trust.css';

export type DuelAcceptResult = AcceptResult & {
  /** The score was already on the server from an earlier attempt whose reply was lost. */
  recovered?: boolean;
};

/**
 * Post the opponent's one attempt — and make a lost reply recoverable.
 *
 * The accept endpoint is transactional and one-shot: a second post of a
 * score that already landed answers `already_played`. On a bad network that
 * is exactly what a retry looks like when the FIRST post got through and only
 * its response was lost. So `already_played` re-reads the duel, and when the
 * recorded opponent is this student, returns the server's recorded result
 * (`recovered`) instead of "someone else already played". XP is reported as 0
 * in that case: the payout happened server-side, but this client never saw
 * the amount, and it does not guess.
 */
export function useDuelSubmission(code: string, uid: string | null) {
  return useCallback(async (score: number): Promise<DuelAcceptResult> => {
    const r = await acceptChallenge({ code, score });
    if (r.ok || r.error !== 'already_played' || !uid) return r;
    const read = await getChallenge(code);
    const c = read.challenge;
    if (c && c.opponent && c.opponent.uid === uid) {
      return {
        ok: true,
        result: outcomeFor(c, uid) ?? 'tie',
        challengerScore: c.challengerScore,
        opponentScore: c.opponent.score,
        total: c.total,
        xpAwarded: 0,
        recovered: true,
      };
    }
    return r;
  }, [code, uid]);
}

/**
 * The submission line under a finished duel round: saving → saved, or
 * failed with a retry (automatic when the network comes back).
 */
export function DuelSubmitStatus({ pending, outcome, onRetry, challengerName, isCreole }: {
  pending: boolean;
  outcome: DuelAcceptResult | null;
  onRetry: () => void;
  challengerName: string;
  isCreole: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const online = useOnline();
  const kind = duelSubmitView({ pending, ok: outcome?.ok, error: outcome?.error, online });

  // Back online with an unsent score: send it, once per reconnect.
  const waiting = useRef(false);
  waiting.current = kind === 'waitingNetwork' || kind === 'failed';
  const resend = useCallback(() => { if (waiting.current) onRetry(); }, [onRetry]);
  useOnReconnect(resend);

  if (kind === 'saving') {
    return (
      <div className="trust-receipt is-wait" role="status" aria-live="polite" data-kind="saving">
        <span className="trust-receipt__icon"><span className="trust-spin" aria-hidden="true" /></span>
        <span className="trust-receipt__text">
          <strong>{t('Enregistrement de ta manche…', 'N ap anrejistre pati ou a…')}</strong>
          <span>{t('Reste sur cette page jusqu’à la confirmation.', 'Rete sou paj sa a jiskaske nou konfime.')}</span>
        </span>
      </div>
    );
  }
  if (kind === 'saved' && outcome) {
    return (
      <div className="trust-receipt is-ok" role="status" aria-live="polite" data-kind="saved">
        <span className="trust-receipt__icon"><Check size={18} aria-hidden="true" /></span>
        <span className="trust-receipt__text">
          <strong>{t('Manche enregistrée ✓', 'Pati anrejistre ✓')}</strong>
          <span>
            {outcome.recovered
              ? t('Elle avait déjà été reçue plus tôt : c’est ce score qui compte.', 'Li te deja rive pi bonè : se nòt sa a ki konte.')
              : t(
                `${challengerName} voit maintenant ton score, ${outcome.opponentScore}/${outcome.total}, sur la page du défi.`,
                `${challengerName} wè nòt ou kounye a, ${outcome.opponentScore}/${outcome.total}, sou paj defi a.`,
              )}
          </span>
        </span>
      </div>
    );
  }
  if (kind === 'waitingNetwork' || kind === 'failed') {
    return (
      <div className="trust-receipt is-warn" role="alert" data-kind={kind}>
        <span className="trust-receipt__icon">
          {kind === 'waitingNetwork' ? <WifiOff size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
        </span>
        <span className="trust-receipt__text">
          <strong>
            {kind === 'waitingNetwork'
              ? t('Hors ligne — ta manche n’est pas encore enregistrée', 'San rezo — pati ou a poko anrejistre')
              : t('Ta manche n’est pas encore enregistrée', 'Pati ou a poko anrejistre')}
          </strong>
          <span>
            {kind === 'waitingNetwork'
              ? t('Ton score est gardé ici et repart tout seul au retour du réseau. Ne ferme pas la page.', 'Nòt ou sere isit la, l ap repati pou kont li lè rezo a tounen. Pa fèmen paj la.')
              : t('Réessayer est sans risque : un score déjà reçu n’est jamais compté deux fois.', 'Ou ka eseye ankò san danje : yon nòt ki deja rive pa janm konte de fwa.')}
          </span>
        </span>
        <button type="button" className="trust-btn" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> {t('Réessayer', 'Eseye ankò')}
        </button>
      </div>
    );
  }
  // Refused by the server: say why, in its words. Nothing to retry.
  return (
    <p className="trust-receipt is-bad" role="alert" data-kind="refused">
      <span className="trust-receipt__text"><strong>{acceptErrorMessage(outcome?.error, isCreole)}</strong></span>
    </p>
  );
}

/** "Expire dans 3 jours" / "Expiré le 12 oct." — from the duel's own expiresAt. */
export function expiryLine(expiresAt: number, isCreole: boolean, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const left = expiresAt - now;
  const date = new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (left <= 0) return t(`Expiré le ${date}`, `Ekspire ${date}`);
  const hours = Math.floor(left / 3_600_000);
  if (hours < 24) return t(`Expire dans ${Math.max(1, hours)} h`, `Ap ekspire nan ${Math.max(1, hours)} è`);
  const days = Math.floor(hours / 24);
  return t(`Expire dans ${days} jour${days > 1 ? 's' : ''} (${date})`, `Ap ekspire nan ${days} jou (${date})`);
}

/**
 * The plain facts under a duel card: when it expires, what the other side
 * sees, the rules, and a way to report a problem.
 */
export function DuelTrustNote({ challenge, uid, isCreole, showFacts = true }: {
  challenge: DuelLike;
  uid: string | null;
  isCreole: boolean;
  /** False right after a submission, when the loaded duel is already stale. */
  showFacts?: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const mine = !!uid && challenge.challengerUid === uid;
  const open = showFacts && !challenge.opponent && challenge.status !== 'played';
  const expiry = open ? expiryLine(challenge.expiresAt, isCreole) : null;
  let sees: string | null = null;
  if (open && mine) {
    sees = t(
      `Ton ami voit ton ${challenge.challengerScore}/${challenge.total} avant de jouer. Tu verras son score ici dès qu’il aura fini.`,
      `Zanmi ou wè ${challenge.challengerScore}/${challenge.total} ou a anvan l jwe. W ap wè nòt li isit la lè l fini.`,
    );
  } else if (open && !mine) {
    sees = t(
      'Ton score est envoyé à ton ami à la fin de la dernière question. Un seul envoi compte.',
      'Nòt ou ale bay zanmi ou lè dènye kesyon an fini. Yon sèl voye konte.',
    );
  }
  return (
    <div className="trust-note">
      {expiry || sees ? (
        <ul className="trust-note__facts">
          {expiry ? <li><Clock size={16} aria-hidden="true" /> {expiry}</li> : null}
          {sees ? <li>{sees}</li> : null}
        </ul>
      ) : null}
      <div className="trust-row">
        <RulesButton variant="duel" isCreole={isCreole} />
        <ReportProblem context={{ kind: 'duel', ref: challenge.code, uid }} isCreole={isCreole} />
      </div>
    </div>
  );
}

/**
 * Under a freshly minted duel: the server's create call returned the code,
 * so the duel IS saved — say so, and for how long it stays playable.
 */
export function DuelMintReceipt({ isCreole }: { isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <div className="trust-note">
      <p className="trust-receipt is-ok" role="status" data-kind="minted">
        <span className="trust-receipt__icon"><Check size={18} aria-hidden="true" /></span>
        <span className="trust-receipt__text">
          <strong>{t('Défi enregistré ✓', 'Defi anrejistre ✓')}</strong>
          <span>{t(
            `Ton ami voit ton score avant de jouer. Le défi reste ouvert ${DUEL_RULES.ttlDays} jours.`,
            `Zanmi ou wè nòt ou anvan l jwe. Defi a rete louvri ${DUEL_RULES.ttlDays} jou.`,
          )}</span>
        </span>
      </p>
      <div className="trust-row"><RulesButton variant="duel" isCreole={isCreole} /></div>
    </div>
  );
}
