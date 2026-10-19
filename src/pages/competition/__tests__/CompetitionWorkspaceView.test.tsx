import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompetitionWorkspaceView } from '../CompetitionWorkspaceView';
import { CompetitionProjectorView } from '../CompetitionProjectorView';
import {
  FIXTURE_UIDS,
  WORKSPACE_SCENARIOS,
  projectorScenarios,
  scenarioPage,
} from '../fixtures';

const NOW = Date.UTC(2026, 9, 18, 12);
const noop = () => undefined;

function renderScenario(id: string, ht = false) {
  const scenario = WORKSPACE_SCENARIOS.find((s) => s.id === id)!;
  return render(
    <MemoryRouter initialEntries={['/arena/competitions']}>
      <CompetitionWorkspaceView
        kind={scenario.target.kind}
        page={scenario.loading ? null : scenarioPage(scenario, NOW)}
        ht={ht}
        uid={scenario.uid}
        loading={!!scenario.loading}
        error={scenario.error ? 'Connexion interrompue.' : ''}
        onRetry={noop}
        onSignIn={noop}
        onMore={scenario.more ? noop : undefined}
        execute={async () => undefined}
      />
    </MemoryRouter>,
  );
}

const UIDS = Object.values(FIXTURE_UIDS);

describe('CompetitionWorkspaceView with fixtures', () => {
  it.each(WORKSPACE_SCENARIOS.map((s) => [s.id]))(
    '%s never prints an account identifier, in either language',
    (id) => {
      for (const ht of [false, true]) {
        const { container, unmount } = renderScenario(id, ht);
        const text = container.textContent || '';
        for (const uid of UIDS) expect(text).not.toContain(uid);
        expect(text).not.toContain('uid');
        // The deleted-account sentinel is shown in one language only.
        expect(text).not.toContain('Compte supprimé / Kont efase');
        unmount();
      }
    },
  );

  it('renders the empty home with an empty-state line instead of a blank card', () => {
    renderScenario('home-empty');
    const teams = screen
      .getByRole('heading', { name: 'Mes équipes' })
      .closest('section')!;
    expect(within(teams).getByText('Rien pour le moment.')).toBeTruthy();
    expect(
      screen.getByText(/Aucun événement disponible dans cette page/),
    ).toBeTruthy();
  });

  it('marks unread inbox rows with a labelled dot, not a raw bullet', () => {
    const { container } = renderScenario('home');
    expect(container.textContent).not.toContain('●');
    expect(container.querySelectorAll('.cw-link.is-unread')).toHaveLength(2);
    expect(screen.getAllByText('Non lu')).toHaveLength(2);
  });

  it('shows the deleted account in Kreyòl on the team page', () => {
    renderScenario('team-member', true);
    expect(screen.getByText('Kont efase')).toBeTruthy();
  });

  it('shows retry on error and a status while loading', () => {
    renderScenario('error');
    expect(screen.getByRole('alert').textContent).toContain('Connexion interrompue.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    const loading = renderScenario('loading');
    expect(
      within(loading.container).getByRole('status').textContent,
    ).toContain('Chargement…');
  });

  it('asks a guest to sign in', () => {
    renderScenario('home-guest');
    expect(
      screen.getByRole('button', { name: 'Se connecter pour participer' }),
    ).toBeTruthy();
  });
});

describe('CompetitionProjectorView with fixtures', () => {
  const scenarios = projectorScenarios(NOW);
  const renderPj = (id: string, ht = false) => {
    const s = scenarios.find((p) => p.id === id)!;
    return render(
      <MemoryRouter>
        <CompetitionProjectorView
          eventId="ev1"
          event={s.event}
          live={s.live}
          board={s.board}
          phase={s.phase}
          error={s.error ? 'Erreur' : ''}
          now={NOW}
          ht={ht}
          onRetry={noop}
        />
      </MemoryRouter>,
    );
  };

  it('lists standings by name in one language, never by uid', () => {
    const { container } = renderPj('live', true);
    const text = container.textContent || '';
    for (const uid of UIDS) expect(text).not.toContain(uid);
    expect(text).toContain('Kont efase');
    expect(text).not.toContain('Compte supprimé');
    expect(container.querySelectorAll('.cp-rows li')).toHaveLength(10);
  });

  it('says where the standings will appear when there are none yet', () => {
    renderPj('empty');
    expect(
      screen.getByText('Le classement apparaîtra ici dès les premiers points.'),
    ).toBeTruthy();
  });
});
