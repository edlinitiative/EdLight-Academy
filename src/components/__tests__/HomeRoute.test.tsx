import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../contexts/store';
import HomeRoute from '../HomeRoute';

// Replace the heavy real pages (Firebase, data fetching, many child sections)
// with lightweight markers so the test stays fast and focuses purely on the
// auth-based branching that HomeRoute is responsible for.
jest.mock('../../pages/Home', () => ({
  __esModule: true,
  default: () => <div>MARKETING_HOME</div>,
}));
jest.mock('../../pages/Dashboard', () => ({
  __esModule: true,
  default: () => <div>LEARNER_DASHBOARD</div>,
}));

function renderHomeRoute() {
  return render(
    <MemoryRouter>
      <Suspense fallback={<div>loading</div>}>
        <HomeRoute />
      </Suspense>
    </MemoryRouter>,
  );
}

describe('HomeRoute (adaptive index route)', () => {
  beforeEach(() => {
    // Reset to a clean signed-out state before each test. Doing this in
    // `beforeEach` (rather than `afterEach`) means no HomeRoute is mounted and
    // subscribed when the store updates, avoiding an act(...) warning.
    useStore.setState({ isAuthenticated: false, authConfirmed: false, user: null });
  });

  it('renders the marketing landing page for signed-out visitors', async () => {
    renderHomeRoute();

    expect(await screen.findByText('MARKETING_HOME')).toBeInTheDocument();
    expect(screen.queryByText('LEARNER_DASHBOARD')).not.toBeInTheDocument();
  });

  it('renders a loading state while firebase auth is pending', () => {
    // isAuthenticated=true from localStorage but Firebase hasn't confirmed yet
    useStore.setState({ isAuthenticated: true, authConfirmed: false, user: { uid: 'u1' } });
    renderHomeRoute();
    expect(screen.queryByText('LEARNER_DASHBOARD')).not.toBeInTheDocument();
    expect(screen.queryByText('MARKETING_HOME')).not.toBeInTheDocument();
  });

  it('renders the personalized dashboard for signed-in learners', async () => {
    useStore.setState({ isAuthenticated: true, authConfirmed: true, user: { uid: 'u1', name: 'Test Learner' } });

    renderHomeRoute();

    expect(await screen.findByText('LEARNER_DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('MARKETING_HOME')).not.toBeInTheDocument();
  });
});
