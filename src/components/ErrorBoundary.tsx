import React from 'react';
import i18n from 'i18next';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle } from './icons';
import { reportRenderError } from '../utils/telemetry';
import { classifyError } from '../../shared/errorSignature';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
  /**
   * 'root' (default): the whole app — full-page fallback, reload only.
   * 'route': one page inside the Layout — the navbar stays usable, and the
   * fallback offers "Réessayer" and "Retour à l'accueil".
   */
  scope?: 'root' | 'route';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** A lazy route whose chunk could not be fetched (stale deploy, flaky network). */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null;
  return classifyError(String(e?.name ?? ''), String(e?.message ?? '')) === 'chunk_load';
}

/**
 * Fresh shell after a failed chunk. lazyWithRetry has already retried and
 * reloaded once; this is the student's explicit retry. Asking the service
 * worker to check for an update first is harmless and leaves its three
 * bundle-poisoning guards (pwa/sw.js) untouched — a plain reload still goes
 * through them.
 */
function reloadForNewVersion() {
  const reload = () => window.location.reload();
  try {
    const sw = navigator.serviceWorker;
    if (!sw?.getRegistration) return reload();
    const timer = setTimeout(reload, 1500);
    sw.getRegistration()
      .then((r) => r?.update())
      .catch(() => undefined)
      .finally(() => { clearTimeout(timer); reload(); });
  } catch {
    reload();
  }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== 'test') console.error('[ErrorBoundary]', error, info?.componentStack);
    reportRenderError(error, this.props.scope ?? 'root');
  }

  render() {
    if (this.state.hasError) {
      const t = (key, fallback) => i18n.t(key, { defaultValue: fallback });
      const route = this.props.scope === 'route';
      const chunk = isChunkLoadError(this.state.error);
      const title = chunk
        ? t('errors.chunkTitle', 'Une nouvelle version est disponible')
        : t('errors.boundaryTitle', 'Un problème est survenu');
      const body = chunk
        ? t('errors.chunkBody', 'Cette page n’a pas pu se charger. Recharge pour obtenir la dernière version.')
        : route
          ? t('errors.routeBody', 'Cette page a rencontré un problème. Tu peux réessayer ou revenir à l’accueil.')
          : t('errors.boundaryBody', 'Désolé pour la gêne occasionnée. Vous pouvez recharger la page pour continuer.');
      return (
        <section className="section">
          <div className="container">
            <div
              className={`state-view state-view--error ${route ? '' : 'state-view--page'}`}
              role="alert"
              aria-live="assertive"
            >
              <div className="state-view__icon state-view__icon--error" aria-hidden="true">
                <AlertTriangle size={28} strokeWidth={1.75} />
              </div>
              <h1 className="state-view__title">{title}</h1>
              <p className="state-view__message">{body}</p>
              <div className="state-view__actions">
                {route && !chunk ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => this.setState({ hasError: false, error: null })}
                  >
                    {t('errors.retry', 'Réessayer')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => {
                      this.setState({ hasError: false, error: null });
                      if (chunk) reloadForNewVersion();
                      else window.location.reload();
                    }}
                  >
                    {t('errors.reload', 'Recharger la page')}
                  </button>
                )}
                {route ? (
                  <Link
                    to="/"
                    className="button button--ghost"
                    onClick={() => this.setState({ hasError: false, error: null })}
                  >
                    {t('errors.home', 'Retour à l’accueil')}
                  </Link>
                ) : null}
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <pre
                  style={{
                    marginTop: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    padding: '0.75rem',
                    background: 'var(--surface-muted)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'auto',
                    width: '100%',
                  }}
                >
                  {this.state.error.toString()}
                </pre>
              )}
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

/**
 * Per-route containment inside a layout's <Outlet>. Keyed by pathname so
 * navigating away from a broken page clears the error automatically.
 */
export function RouteErrorBoundary({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname} scope="route">
      {children}
    </ErrorBoundary>
  );
}
