import React from 'react';

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            className="button button--primary button--pill"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.75rem', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', overflow: 'auto' }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
