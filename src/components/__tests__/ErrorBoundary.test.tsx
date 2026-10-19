/**
 * ErrorBoundary — root and per-route containment, chunk-load recovery and the
 * sanitized render_error report.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { ErrorBoundary, RouteErrorBoundary, isChunkLoadError } from '../ErrorBoundary';
import { setTelemetrySink, __resetWebTelemetryForTests } from '../../utils/telemetry';
import { initI18n } from '../../utils/i18n';

beforeAll(() => initI18n());

let shouldThrow: Error | null = null;
function Bomb() {
  if (shouldThrow) throw shouldThrow;
  return <p>page content</p>;
}

let sink: jest.Mock;
beforeEach(() => {
  __resetWebTelemetryForTests();
  sink = jest.fn();
  setTelemetrySink(sink);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  shouldThrow = null;
  jest.restoreAllMocks();
});

it('route boundary shows retry + home, reports a sanitized render_error, and recovers', () => {
  shouldThrow = new TypeError('Cannot read property of undefined for student@example.com');
  render(
    <MemoryRouter initialEntries={['/courses/abc123']}>
      <Routes>
        <Route path="*" element={<RouteErrorBoundary><Bomb /></RouteErrorBoundary>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Réessayer')).toBeTruthy();
  expect(screen.getByText('Retour à l’accueil').closest('a')?.getAttribute('href')).toBe('/');

  const reported = sink.mock.calls.map(([e]) => e).find((e) => e.name === 'render_error');
  expect(reported.detail).toEqual(expect.objectContaining({
    boundary: 'route', fatal: false, errorKind: 'undefined_access', screen: 'home', occurrence: 1,
  }));
  expect(reported.detail.signature).toMatch(/^[0-9a-f]{8}$/);
  expect(JSON.stringify(reported.detail)).not.toMatch(/student|example/);

  shouldThrow = null;
  fireEvent.click(screen.getByText('Réessayer'));
  expect(screen.getByText('page content')).toBeTruthy();
});

it('navigating away clears a route error', () => {
  shouldThrow = new Error('boom');
  function Shell() {
    return (
      <>
        <Link to="/other">go</Link>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/broken" element={<Bomb />} />
            <Route path="/other" element={<p>other page</p>} />
          </Routes>
        </RouteErrorBoundary>
      </>
    );
  }
  render(<MemoryRouter initialEntries={['/broken']}><Shell /></MemoryRouter>);
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByText('go'));
  expect(screen.getByText('other page')).toBeTruthy();
});

it('a chunk-load failure offers a reload to the new version', () => {
  shouldThrow = Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' });
  render(
    <MemoryRouter>
      <RouteErrorBoundary><Bomb /></RouteErrorBoundary>
    </MemoryRouter>,
  );
  expect(screen.getByText('Une nouvelle version est disponible')).toBeTruthy();
  expect(screen.getByText('Recharger la page')).toBeTruthy();
  expect(screen.queryByText('Réessayer')).toBeNull();
  expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module'))).toBe(true);
  expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
});

it('root boundary renders without a router and offers reload only', () => {
  shouldThrow = new Error('boom');
  render(<ErrorBoundary><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Recharger la page')).toBeTruthy();
  expect(screen.queryByText('Retour à l’accueil')).toBeNull();
  expect(sink.mock.calls[0][0].detail.boundary).toBe('root');
});
