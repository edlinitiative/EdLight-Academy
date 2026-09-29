/**
 * Build-time render of the signed-out landing page ("/"), for
 * scripts/prerender_routes.mjs.
 *
 * The app is client-rendered, so "/" used to ship a placeholder and the hero
 * (the page's largest paint) waited for the whole bundle, the Home chunk and
 * React before anything real appeared: ~9 s on a throttled phone. This renders
 * the same components the browser will, into the HTML, so the hero paints with
 * the first response. It is NOT hydrated: index.tsx still mounts with
 * createRoot, which replaces this markup with an identical tree, so a
 * difference between the two costs a repaint, never a hydration error.
 *
 * Nothing here runs effects or queries: live figures (student count, school
 * race, catalogue totals) simply render in their loading state, as they do on
 * the client's first render.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../utils/i18n';
import { Layout } from '../components/Layout';
import Home from '../pages/Home';

export function renderHome(): string {
  initI18n();
  const queryClient = new QueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
