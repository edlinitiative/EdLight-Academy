/**
 * LessonCompleteAction — the "Terminer la leçon" button and the plain truth
 * about its save, side by side (PRD §13: a failure sits beside the affected
 * action, never only in a toast).
 *
 * The button is disabled for as long as a write is pending, so it cannot be
 * submitted twice; the hook behind it refuses a second write anyway. A failed
 * save keeps the same button, relabelled "Réessayer" — nothing is lost.
 */
import React from 'react';
import { AlertCircle, WifiOff } from '../../icons';
import { PENDING, type CompletionEntry } from './useLessonCompletion';

export default function LessonCompleteAction({
  entry,
  isCreole,
  onComplete,
}: {
  entry: CompletionEntry;
  isCreole: boolean;
  onComplete: () => void;
}) {
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { status, reason } = entry;
  const pending = PENDING.has(status);

  const label =
    status === 'saving' || status === 'slow'
      ? L('Enregistrement…', 'N ap anrejistre…')
      : status === 'queued'
        ? L('En attente de connexion…', 'N ap tann koneksyon…')
        : status === 'failed'
          ? L('Réessayer d’enregistrer', 'Eseye anrejistre ankò')
          : L('Terminer la leçon', 'Fini leson an');

  return (
    <div className="lesson-complete-action">
      <button
        type="button"
        className="button button--primary lesson-stage__next-primary"
        onClick={onComplete}
        disabled={pending}
        aria-describedby={status !== 'idle' ? 'lesson-save-status' : undefined}
      >
        {label}
      </button>

      {/* One live region for every state, so a screen reader hears each change once. */}
      <div id="lesson-save-status" className="lesson-complete-action__status" role="status" aria-live="polite">
        {status === 'saving' && (
          <span className="qz__sr-only">{L('Enregistrement en cours.', 'N ap anrejistre.')}</span>
        )}
        {status === 'slow' && (
          <p className="lesson-stage__save lesson-stage__save--pending">
            {L(
              'Toujours en cours — pas encore confirmé. Tu peux rester ici ; la leçon sera marquée terminée dès que c’est enregistré.',
              'Sa poko fini — poko konfime. Ou ka rete la ; leson an ap make fini kou li anrejistre.',
            )}
          </p>
        )}
        {status === 'queued' && (
          <p className="lesson-stage__save lesson-stage__save--pending">
            <WifiOff size={15} aria-hidden="true" />
            {L(
              'En attente de connexion — pas encore confirmé. L’enregistrement partira au retour de la connexion ; garde cette page ouverte.',
              'N ap tann koneksyon — poko konfime. Anrejistreman an ap pati lè entènèt la tounen ; kite paj sa a louvri.',
            )}
          </p>
        )}
        {status === 'failed' && (
          <p className="lesson-stage__save lesson-stage__save--failed">
            <AlertCircle size={15} aria-hidden="true" />
            {reason === 'offline'
              ? L(
                  'Pas enregistré : la connexion est coupée. Réessaie quand tu es de nouveau en ligne.',
                  'Li pa anrejistre : pa gen koneksyon. Eseye ankò lè ou gen entènèt.',
                )
              : L(
                  'Nous n’avons pas pu enregistrer. Rien n’est perdu : réessaie.',
                  'Nou pa t ka anrejistre. Anyen pa pèdi : eseye ankò.',
                )}
          </p>
        )}
      </div>
    </div>
  );
}
