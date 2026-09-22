import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getMobilePlatform,
  storeUrlFor,
  APP_STORE_URL,
  PLAY_STORE_URL,
} from '../utils/platform';
import useStore from '../contexts/store';
import RouteMeta from '../components/RouteMeta';

/**
 * /download — device-detecting smart link (the QR-code target).
 *  • On a phone: immediately forwards to the correct store.
 *  • On desktop: shows a clean card with both store badges + a QR code so the
 *    visitor can grab it on their phone.
 * Standalone route (no app shell) so a scanned QR resolves instantly.
 *
 * ── WHY IT TAKES A `?from=` ─────────────────────────────────────────────────
 *
 * Reported from the live site: clicking "Accéder à l'application" under
 * *Championnat interscolaire* on /jeux landed here, and the page said
 * "Emporte EdLight partout · Scanne le code" — nothing about the championship,
 * and, because this route deliberately renders WITHOUT the app shell, no
 * navigation and no way back. A student who wanted to enter a tournament got a
 * generic advert and a dead end.
 *
 * The QR case still needs the generic copy, so the reason travels in the URL
 * instead: `?from=arena` explains that the championship is played in the app,
 * and every caller offers a way back to where they came from. Redesign plan
 * §8 — a screen must explain why you are on it and offer a safe way onward.
 */

/** Where the visitor came from, and what to tell them about it. */
const ORIGINS: Record<string, {
  title: [string, string];
  body: [string, string];
  backTo: string;
  backLabel: [string, string];
}> = {
  arena: {
    title: [
      'Le championnat se joue dans l’application',
      'Chanpyona a jwe nan aplikasyon an',
    ],
    // Corrected: this used to say registration was in the app too. It is not
    // any more — /arena takes it on the web, which was the whole point of
    // moving the cheap step off the install. Only PLAYING is mobile-only.
    body: [
      'Votre école s’inscrit sur le site, mais les questions du jour J se jouent dans l’application. Installez-la et connectez-vous avec le même compte : votre école ne compte que les élèves présents.',
      'Lekòl ou enskri sou sit la, men kesyon jou a jwe nan aplikasyon an. Enstale l epi konekte ak menm kont lan : lekòl ou konte sèlman elèv ki prezan.',
    ],
    backTo: '/arena',
    backLabel: ['Retour au championnat', 'Tounen nan chanpyona a'],
  },
  defi: {
    title: [
      'Les défis se lancent depuis l’application',
      'Defi yo pati depi nan aplikasyon an',
    ],
    body: [
      'Un défi part d’une partie que vous venez de finir : votre ami reçoit exactement les mêmes questions et n’a qu’un seul essai. Cette partie se joue dans l’application — mais le lien que vous envoyez s’ouvre partout.',
      'Yon defi soti nan yon pati ou fèk fini : zanmi ou resevwa egzakteman menm kesyon yo epi li gen yon sèl tantativ. Pati sa a jwe nan aplikasyon an — men lyen ou voye a ouvè tout kote.',
    ],
    backTo: '/jeux',
    backLabel: ['Retour aux jeux', 'Tounen nan jwèt yo'],
  },
};
export default function Download() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [platform] = useState(() => getMobilePlatform());
  const [params] = useSearchParams();
  const origin = ORIGINS[params.get('from') ?? ''] ?? null;

  useEffect(() => {
    if (!platform) return;
    const url = storeUrlFor(platform);
    try {
      (window as any).gtag?.('event', 'app_download_redirect', { platform });
    } catch {
      /* analytics best-effort */
    }
    window.location.replace(url);
  }, [platform]);

  const wrap: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif",
    background: 'var(--background)',
    color: 'var(--text-900)',
  };

  /* This route sits OUTSIDE <Layout> on purpose — a scanned QR should resolve
     instantly, with no navbar or footer to paint. Layout is also what mounts
     <RouteMeta />, so this page was the one route left with a bare "EdLight
     Academy" title and the homepage's description, despite being the link
     people actually share to pass the app on. RouteMeta is standalone and
     only needs a Router above it, so the page mounts its own. */
  if (platform) {
    // Redirecting — brief message in case the store is slow to open.
    return (
      <div style={wrap}>
        <RouteMeta />
        <p style={{ fontSize: 16, color: 'var(--text-500)' }}>
          {t('Ouverture de la boutique…', 'Ap louvri boutik la…')}
        </p>
      </div>
    );
  }

  // Desktop
  return (
    <div style={wrap}>
      <RouteMeta />
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 24,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          padding: 32,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <img src="/assets/logo.png" alt="EdLight Academy" style={{ width: 64, height: 64, margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, margin: '0 0 10px' }}>
          {origin ? t(origin.title[0], origin.title[1]) : t('Emporte EdLight partout', 'Pote EdLight tout kote')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-500)', lineHeight: 1.5, margin: '0 0 24px' }}>
          {origin
            ? t(origin.body[0], origin.body[1])
            : t(
              'Scanne le code avec ton téléphone pour installer l’application.',
              'Eskane kòd la ak telefòn ou pou enstale aplikasyon an.',
            )}
        </p>
        <div
          style={{
            display: 'inline-flex',
            padding: 12,
            borderRadius: 16,
            border: '1px solid var(--border)',
            /* QR needs a light ground to stay scannable in either theme. */
            background: '#fff',
            marginBottom: 24,
          }}
        >
          <img src="/assets/download-qr.svg" alt={t('Code QR de téléchargement', 'Kòd QR pou telechaje')} width={180} height={180} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
            <img src="/assets/appstore-badge.svg" alt="Download on the App Store" style={{ height: 48 }} />
          </a>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
            <img src="/assets/googleplay-badge.png" alt="Get it on Google Play" style={{ height: 48 }} />
          </a>
        </div>

        {/* This route renders without the app shell, so it has no back button
            unless it brings one. Without this the page is a dead end. */}
        <Link
          to={origin ? origin.backTo : '/'}
          style={{
            display: 'inline-block', marginTop: 20, fontSize: 14,
            color: 'var(--primary-600)', textDecoration: 'underline',
          }}
        >
          {origin
            ? t(origin.backLabel[0], origin.backLabel[1])
            : t('Retour au site', 'Tounen sou sit la')}
        </Link>
      </div>
    </div>
  );
}
