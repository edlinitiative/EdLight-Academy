import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from './icons';
import { Skeleton, SkeletonText } from './Skeleton';

/**
 * Shared "UX state" primitives so every async/list view ships the same
 * polished Loading, Empty and Error states instead of a blank screen or a raw
 * error.
 *
 * Conventions:
 *  - LoadingState → role="status" + aria-busy: a content-shaped skeleton with
 *                   one spoken "Chargement…" (the blocks stay aria-hidden).
 *  - EmptyState   → role="status" (polite): an expected, non-urgent outcome.
 *                   Give it an `action` so an empty view is never a dead end.
 *  - ErrorState   → role="alert"  (assertive): something failed; offers retry
 *                   and (via `action`) a way back. Offline is detected and
 *                   gets its own icon + copy.
 * All inherit the design tokens via the .state-view / .state-loading classes
 * in index.css, and are keyboard- and screen-reader-friendly. See
 * docs/design/ui-foundations.md for when to use which.
 */

type StateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'ghost' | 'secondary';
};

type HeadingLevel = 1 | 2 | 3 | 4;

/** Renders the state's title at the heading level that fits the page outline. */
function StateTitle({ level = 3, children }: { level?: HeadingLevel; children: React.ReactNode }) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  return <Tag className="state-view__title">{children}</Tag>;
}

function ActionButton({ label, onClick, href, variant = 'primary' }: StateAction) {
  const className = `button button--${variant}`;
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
  /** Full-page placement (extra vertical margin) when it replaces a page body. */
  page?: boolean;
  /** Heading level for the title so the page outline stays in order. Default 3. */
  headingLevel?: HeadingLevel;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  message,
  action,
  secondaryAction,
  compact = false,
  page = false,
  headingLevel = 3,
  className = '',
}: EmptyStateProps) {
  const wrapperClass = [
    'state-view',
    compact ? 'state-view--compact' : '',
    page ? 'state-view--page' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapperClass} role="status">
      <div className="state-view__icon" aria-hidden="true">
        {icon ?? <Inbox size={28} strokeWidth={1.75} />}
      </div>
      <StateTitle level={headingLevel}>{title}</StateTitle>
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
  /** Overrides the localized "Réessayer" label (e.g. a page's own L()). */
  retryLabel?: string;
  /** The way back (e.g. "Retour à l'accueil", "Toutes les matières"). */
  action?: StateAction;
  /** Title/message used instead when the browser reports it is offline. */
  offlineTitle?: React.ReactNode;
  offlineMessage?: React.ReactNode;
  compact?: boolean;
  /** Full-page placement (extra vertical margin) when it replaces a page body. */
  page?: boolean;
  /** Heading level for the title so the page outline stays in order. Default 3. */
  headingLevel?: HeadingLevel;
  className?: string;
};

export function ErrorState({
  title,
  message,
  onRetry,
  retrying = false,
  retryLabel,
  action,
  offlineTitle,
  offlineMessage,
  compact = false,
  page = false,
  headingLevel = 3,
  className = '',
}: ErrorStateProps) {
  const { t } = useTranslation();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wrapperClass = [
    'state-view',
    'state-view--error',
    compact ? 'state-view--compact' : '',
    page ? 'state-view--page' : '',
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
      <StateTitle level={headingLevel}>
        {offline && offlineTitle ? offlineTitle : title ?? t('errors.loadTitle')}
      </StateTitle>
      <p className="state-view__message">
        {offline ? offlineMessage ?? t('errors.offlineHint') : message ?? t('errors.loadBody')}
      </p>
      <div className="state-view__actions">
        {onRetry ? (
          <button
            type="button"
            className="button button--primary state-view__retry"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={retrying ? 'state-view__spin' : undefined}
            />
            {retrying ? t('common.retrying') : retryLabel ?? t('common.retry')}
          </button>
        ) : null}
        {action ? <ActionButton variant={onRetry ? 'ghost' : 'primary'} {...action} /> : null}
      </div>
    </div>
  );
}

type LoadingStateProps = {
  /** Spoken loading text; defaults to the localized "Chargement…". */
  label?: string;
  /**
   * A content-shaped skeleton built from Skeleton/SkeletonText. Prefer this:
   * the placeholder should mirror the real layout so nothing jumps when the
   * data lands. Without children a generic list of card rows is drawn.
   */
  children?: React.ReactNode;
  /** Rows for the default list skeleton. */
  rows?: number;
  className?: string;
};

/**
 * The loading state. One polite "Chargement…" announcement for assistive
 * tech (role="status" + aria-busy), while every skeleton block stays
 * aria-hidden. Wrap a page's own content-shaped skeleton in it.
 */
export function LoadingState({ label, children, rows = 4, className = '' }: LoadingStateProps) {
  const { t } = useTranslation();
  return (
    <div
      className={['state-loading', className].filter(Boolean).join(' ')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {children ?? (
        <div className="state-loading__list" aria-hidden="true">
          {Array.from({ length: rows }).map((_, i) => (
            <div className="state-loading__row" key={i}>
              <Skeleton width={44} height={44} radius={14} />
              <SkeletonText lines={2} lastWidth="45%" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default { EmptyState, ErrorState, LoadingState };
