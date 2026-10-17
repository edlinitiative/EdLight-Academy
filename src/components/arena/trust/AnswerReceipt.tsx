import React from 'react';
import { AlertTriangle, Check, Clock, Keyboard, RefreshCw, WifiOff, X } from '../../icons';
import type { ReceiptKind } from './trustState';
import './trust.css';

/**
 * What happened to the student's tap, in one line — and only what is KNOWN.
 *
 * "Réponse reçue ✓" appears for exactly one input: the answer endpoint's 200.
 * Everything else says "envoyée", "non confirmée" or "non comptée", with what
 * the student can still do about it. Text first, icon second, colour third:
 * nothing here depends on telling green from red.
 *
 * `ackClock` is the question clock (mm:ss, floored) at the moment the
 * server's confirmation came BACK — the server received the answer at or
 * before that instant, so the time shown is never earlier than the truth.
 */
export default function AnswerReceipt({
  kind, choiceLabel, ackClock, duplicate, onRetry, isCreole,
}: {
  kind: ReceiptKind;
  /** "B" — the option the student committed to. */
  choiceLabel?: string | null;
  ackClock?: string | null;
  duplicate?: boolean;
  onRetry?: () => void;
  isCreole: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const yours = choiceLabel ? t(` (${choiceLabel})`, ` (${choiceLabel})`) : '';

  let tone: 'ok' | 'wait' | 'warn' | 'bad' | 'muted' = 'muted';
  let icon: React.ReactNode = null;
  let title = '';
  let body: string | null = null;
  let action: React.ReactNode = null;

  switch (kind) {
    case 'idle':
      icon = <Keyboard size={18} aria-hidden="true" />;
      title = t('Touches 1 à 4 pour répondre', 'Touch 1 rive 4 pou reponn');
      body = t('Un clic = ta réponse définitive.', 'Yon klik = repons final ou.');
      break;
    case 'sending':
      tone = 'wait';
      icon = <span className="trust-spin" aria-hidden="true" />;
      title = t(`Réponse envoyée${yours}…`, `Repons voye${yours}…`);
      body = t('En attente de la confirmation du serveur.', 'N ap tann sèvè a konfime.');
      break;
    case 'received':
      tone = 'ok';
      icon = <Check size={18} aria-hidden="true" />;
      title = ackClock
        ? t(`Réponse reçue ✓ à ${ackClock}`, `Repons resevwa ✓ a ${ackClock}`)
        : t('Réponse reçue ✓', 'Repons resevwa ✓');
      body = duplicate
        ? t('Ta première réponse avait déjà été reçue : c’est elle qui compte.', 'Premye repons ou te deja rive : se li ki konte.')
        : t('Le serveur l’a enregistrée. Pas de retour en arrière.', 'Sèvè a anrejistre l. Pa gen retounen.');
      break;
    case 'waitingNetwork':
      tone = 'warn';
      icon = <WifiOff size={18} aria-hidden="true" />;
      title = t(`Reconnexion… ta réponse${yours} est gardée`, `N ap rekonekte… repons ou${yours} sere`);
      body = t(
        'Elle repart toute seule dès le retour du réseau. Le chrono du serveur continue : elle compte au moment où elle arrive, si la question est encore ouverte.',
        'L ap repati pou kont li lè rezo a tounen. Kwonomèt sèvè a kontinye : li konte lè l rive, si kesyon an toujou louvri.',
      );
      break;
    case 'failed':
      tone = 'warn';
      icon = <AlertTriangle size={18} aria-hidden="true" />;
      title = t(`Réponse non confirmée${yours}`, `Repons pa konfime${yours}`);
      body = t(
        'Le serveur n’a pas répondu. Renvoyer est sans risque : une réponse déjà reçue n’est jamais comptée deux fois.',
        'Sèvè a pa reponn. Ou ka voye l ankò san danje : yon repons ki deja rive pa janm konte de fwa.',
      );
      action = onRetry ? (
        <button type="button" className="trust-btn" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> {t('Renvoyer', 'Voye ankò')}
        </button>
      ) : null;
      break;
    case 'unconfirmedLate':
      tone = 'bad';
      icon = <Clock size={18} aria-hidden="true" />;
      title = t('Temps écoulé — réponse non confirmée', 'Tan an fini — repons pa konfime');
      body = t(
        'Le serveur n’a pas confirmé l’avoir reçue avant la fin. Si elle n’est pas arrivée à temps, elle ne compte pas.',
        'Sèvè a pa konfime li te resevwa l anvan lafen. Si l pa t rive alè, li pa konte.',
      );
      break;
    case 'tooLate':
      tone = 'bad';
      icon = <X size={18} aria-hidden="true" />;
      title = t('Temps écoulé — réponse non comptée', 'Tan an fini — repons pa konte');
      body = t('Elle est arrivée après la fermeture de la question.', 'Li rive apre kesyon an te fèmen.');
      break;
    case 'ineligible':
      tone = 'bad';
      icon = <X size={18} aria-hidden="true" />;
      title = t('Réponse non comptée', 'Repons pa konte');
      body = t(
        'Ce compte ne peut pas marquer dans cette édition. Si c’est une erreur, signale-le.',
        'Kont sa a pa ka make pwen nan edisyon sa a. Si se yon erè, siyale l.',
      );
      break;
    case 'noAnswer':
    default:
      icon = <Clock size={18} aria-hidden="true" />;
      title = t('Temps écoulé — pas de réponse', 'Tan an fini — pa gen repons');
      body = null;
      break;
  }

  return (
    <div className={`trust-receipt is-${tone}`} data-kind={kind} role="status" aria-live="polite">
      <span className="trust-receipt__icon">{icon}</span>
      <span className="trust-receipt__text">
        <strong>{title}</strong>
        {body ? <span>{body}</span> : null}
      </span>
      {action}
    </div>
  );
}
