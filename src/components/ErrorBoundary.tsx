import React from 'react';
import i18n from 'i18next';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../utils/telemetry';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      const t = (key, fallback) => i18n.t(key, { defaultValue: fallback });
      return (
        <section className="section">
          <div className="container">
            <div
              className="state-view state-view--error state-view--page"
              role="alert"
              aria-live="assertive"
            >
              <div className="state-view__icon state-view__icon--error" aria-hidden="true">
                <AlertTriangle size={28} strokeWidth={1.75} />
              </div>
              <h1 className="state-view__title">
                {t('errors.boundaryTitle', 'Un problème est survenu')}
              </h1>
              <p className="state-view__message">
                {t(
                  'errors.boundaryBody',
                  'Désolé pour la gêne occasionnée. Vous pouvez recharger la page pour continuer.'
                )}
              </p>
              <div className="state-view__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.reload();
                  }}
                >
                  {t('errors.reload', 'Recharger la page')}
                </button>
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
