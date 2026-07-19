import React, { useEffect, useState } from 'react';
import {
  getMobilePlatform,
  storeUrlFor,
  APP_STORE_URL,
  PLAY_STORE_URL,
} from '../utils/platform';
import useStore from '../contexts/store';

/**
 * /download — device-detecting smart link (the QR-code target).
 *  • On a phone: immediately forwards to the correct store.
 *  • On desktop: shows a clean card with both store badges + a QR code so the
 *    visitor can grab it on their phone.
 * Standalone route (no app shell) so a scanned QR resolves instantly.
 */
export default function Download() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [platform] = useState(() => getMobilePlatform());

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
    background: '#f4f6fb',
    color: '#0f172a',
  };

  if (platform) {
    // Redirecting — brief message in case the store is slow to open.
    return (
      <div style={wrap}>
        <p style={{ fontSize: 16, color: '#64748b' }}>
          {t('Ouverture de la boutique…', 'Ap louvri boutik la…')}
        </p>
      </div>
    );
  }

  // Desktop
  return (
    <div style={wrap}>
      <div
        style={{
          background: '#fff',
          borderRadius: 24,
          border: '1px solid #e8edf5',
          boxShadow: '0 8px 30px rgba(8,87,166,0.10)',
          padding: 32,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <img src="/assets/logo.png" alt="EdLight Academy" style={{ width: 64, height: 64, margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>
          {t('Emporte EdLight partout', 'Pote EdLight tout kote')}
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, margin: '0 0 24px' }}>
          {t(
            'Scanne le code avec ton téléphone pour installer l’application.',
            'Eskane kòd la ak telefòn ou pou enstale aplikasyon an.',
          )}
        </p>
        <div
          style={{
            display: 'inline-flex',
            padding: 12,
            borderRadius: 16,
            border: '1px solid #e8edf5',
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
      </div>
    </div>
  );
}
