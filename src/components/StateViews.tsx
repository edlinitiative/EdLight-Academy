import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';

/**
 * Shared "UX state" primitives so every async/list view ships the same
 * polished Empty and Error states instead of a blank screen or a raw error.
 *
 * Conventions:
 *  - EmptyState  → role="status" (polite): an expected, non-urgent outcome.
 *  - ErrorState  → role="alert"  (assertive): something failed; offers retry.
 * Both inherit the warm-minimalism design tokens via the .state-view classes
 * defined in index.css, and both are fully keyboard- and screen-reader-friendly.
 */

type StateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'ghost' | 'secondary';
};

function ActionButton({ label, onClick, href, variant = 'primary' }: StateAction) {
  const className = `button button--${variant} button--pill`;
  if (href) {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  );
}

type EmptyStateProps = {
  /** Optional custom icon node; defaults to an inbox glyph. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: StateAction;
  secondaryAction?: StateAction;
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  message,
  action,
  secondaryAction,
  compact = false,
  className = '',
}: EmptyStateProps) {
  const wrapperClass = ['state-view', compact ? 'state-view--compact' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapperClass} role="status">
      <div className="state-view__icon" aria-hidden="true">
        {icon ?? <Inbox size={28} strokeWidth={1.75} />}
      </div>
      <h3 className="state-view__title">{title}</h3>
      {message ? <p className="state-view__message">{message}</p> : null}
      {action || secondaryAction ? (
        <div className="state-view__actions">
          {action ? <ActionButton {...action} /> : null}
          {secondaryAction ? (
            <ActionButton variant="ghost" {...secondaryAction} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ErrorStateProps = {
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** When provided, renders a "Réessayer" button wired to this handler. */
  onRetry?: () => void;
  /** Shows the spinner + "Nouvelle tentative…" label while a retry is running. */
  retrying?: boolean;
  /** Optional extra action (e.g. "Retour à l'accueil"). */
  action?: StateAction;
  compact?: boolean;
  className?: string;
};

export function ErrorState({
  title,
  message,
  onRetry,
  retrying = false,
  action,
  compact = false,
  className = '',
}: ErrorStateProps) {
  const { t } = useTranslation();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wrapperClass = [
    'state-view',
    'state-view--error',
    compact ? 'state-view--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClass} role="alert" aria-live="assertive">
      <div className="state-view__icon state-view__icon--error" aria-hidden="true">
        {offline ? (
          <WifiOff size={28} strokeWidth={1.75} />
        ) : (
          <AlertTriangle size={28} strokeWidth={1.75} />
        )}
      </div>
      <h3 className="state-view__title">{title ?? t('errors.loadTitle')}</h3>
      <p className="state-view__message">
        {offline ? t('errors.offlineHint') : message ?? t('errors.loadBody')}
      </p>
      <div className="state-view__actions">
        {onRetry ? (
          <button
            type="button"
            className="button button--primary button--pill state-view__retry"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={retrying ? 'state-view__spin' : undefined}
            />
            {retrying ? t('common.retrying') : t('common.retry')}
          </button>
        ) : null}
        {action ? <ActionButton variant="ghost" {...action} /> : null}
      </div>
    </div>
  );
}

export default { EmptyState, ErrorState };
