import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, ErrorState, LoadingState } from '../StateViews';
import { Skeleton } from '../Skeleton';
import { initI18n } from '../../utils/i18n';

// The shared state views are the contract every data screen leans on, so
// their roles, names and actions are pinned here (no snapshots: what matters
// is what assistive tech and the student can do, not the markup).

// French is the default UI language (jsdom's navigator is not ht/fr → 'fr').
beforeAll(() => initI18n());

const setOnline = (online: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });

afterEach(() => setOnline(true));

describe('LoadingState', () => {
  it('is one polite busy status with a spoken label; the skeleton stays hidden', () => {
    const { container } = render(
      <LoadingState label="Chargement des examens…">
        <Skeleton height={84} />
      </LoadingState>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Chargement des examens…');
    expect(container.querySelector('.skeleton')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a default card-row skeleton when no content-shaped one is given', () => {
    const { container } = render(<LoadingState rows={3} />);
    expect(container.querySelectorAll('.state-loading__row')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent(/\S/);
  });
});

describe('EmptyState', () => {
  it('announces as a status with a heading at the requested level and an actionable CTA', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        headingLevel={1}
        title="Aucune épreuve pour cette matière"
        message="Le catalogue évolue."
        action={{ label: 'Toutes les matières', onClick }}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Aucune épreuve pour cette matière' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les matières' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('defaults to an h3 so it nests under a page section', () => {
    render(<EmptyState title="Rien ici" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Rien ici' })).toBeInTheDocument();
  });

  it('renders an href action as a link', () => {
    render(<EmptyState title="Rien" action={{ label: 'Voir les cours', href: '/courses' }} />);
    expect(screen.getByRole('link', { name: 'Voir les cours' })).toHaveAttribute('href', '/courses');
  });
});

describe('ErrorState', () => {
  it('is an assertive alert with a labelled retry and a way back', () => {
    const onRetry = jest.fn();
    const back = jest.fn();
    render(
      <ErrorState
        title="Catalogue indisponible"
        message="Vérifie ta connexion."
        onRetry={onRetry}
        retryLabel="Réessayer"
        action={{ label: 'Voir les examens', onClick: back }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Catalogue indisponible');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les examens' }));
    expect(back).toHaveBeenCalled();
  });

  it('disables retry and says so while a retry is running', () => {
    render(<ErrorState onRetry={() => {}} retrying />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Nouvelle tentative…');
  });

  it('switches to the offline copy when the browser is offline', () => {
    setOnline(false);
    render(
      <ErrorState
        title="Catalogue indisponible"
        message="Erreur serveur"
        offlineTitle="Hors ligne"
        offlineMessage="La liste n’est pas encore enregistrée sur cet appareil."
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hors ligne' })).toBeInTheDocument();
    expect(screen.getByText('La liste n’est pas encore enregistrée sur cet appareil.')).toBeInTheDocument();
    expect(screen.queryByText('Erreur serveur')).not.toBeInTheDocument();
  });

  it('falls back to localized defaults (title, offline hint) when given nothing', () => {
    setOnline(false);
    render(<ErrorState />);
    expect(screen.getByRole('heading', { name: 'Impossible de charger le contenu' })).toBeInTheDocument();
    expect(screen.getByText('Vous semblez être hors ligne.')).toBeInTheDocument();
  });
});
