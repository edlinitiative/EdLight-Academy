import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  getMobilePlatform,
  isStandalone,
  PLAY_STORE_URL,
  APP_STORE_URL,
  DOWNLOAD_URL,
} from '../utils/platform';
import useStore from '../contexts/store';

const DISMISS_KEY = 'edlight:dl-banner-dismissed';
const DISMISS_DAYS = 14;

function wasDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function track(platform: string) {
  try {
    (window as any).gtag?.('event', 'app_download_click', { platform });
  } catch {
    /* best-effort */
  }
}

/**
 * "Get the app" prompt for the website.
 *  • iOS      → nothing here (Apple's native Safari smart banner handles it via
 *               the apple-itunes-app meta tag in index.html).
 *  • Android  → a slim dismissible top strip → Google Play.
 *  • Desktop  → a corner card with a QR code + both store badges.
 * Hidden when already running as the installed app, and after dismissal.
 */
export default function DownloadAppBanner() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;
    setPlatform(getMobilePlatform());
    setVisible(true);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  // iOS is handled by the native Safari banner; render nothing.
  if (!visible || platform === 'ios') return null;

  // ── Android: slim top strip ────────────────────────────────────────────────
  if (platform === 'android') {
    return (
      <div
        role="complementary"
        style={{
          // Normal document flow at the very top of the shell (before the
          // sticky navbar) so it pushes content down instead of overlapping.
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          background: '#ffffff',
          borderBottom: '1px solid #e8edf5',
        }}
      >
        <button
          onClick={dismiss}
          aria-label={t('Fermer', 'Fèmen')}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
        >
          <X size={18} />
        </button>
        <img src="/assets/logo.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>EdLight Academy</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{t('Plus rapide dans l’app', 'Pi rapid nan app la')}</div>
        </div>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('android')}
          style={{
            background: '#1B6FE0',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 999,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {t('Installer', 'Enstale')}
        </a>
      </div>
    );
  }

  // ── Desktop: corner card with QR + badges ──────────────────────────────────
  return (
    <div
      role="complementary"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1200,
        width: 300,
        background: '#ffffff',
        borderRadius: 20,
        border: '1px solid #e8edf5',
        boxShadow: '0 12px 40px rgba(8,87,166,0.16)',
        padding: 20,
      }}
    >
      <button
        onClick={dismiss}
        aria-label={t('Fermer', 'Fèmen')}
        style={{ position: 'absolute', top: 6, right: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
      >
        <X size={18} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <img src="/assets/logo.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
          {t('EdLight sur mobile', 'EdLight sou mobil')}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5, margin: '0 0 14px' }}>
        {t('Scanne pour installer l’app sur ton téléphone.', 'Eskane pou enstale app la sou telefòn ou.')}
      </p>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('desktop-qr')} style={{ flexShrink: 0 }}>
          <img src="/assets/download-qr.svg" alt={t('Code QR', 'Kòd QR')} width={92} height={92} style={{ display: 'block', borderRadius: 8 }} />
        </a>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('desktop-ios')} aria-label="Download on the App Store">
            <img src="/assets/appstore-badge.svg" alt="App Store" style={{ height: 34, display: 'block' }} />
          </a>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('desktop-android')} aria-label="Get it on Google Play">
            <img src="/assets/googleplay-badge.png" alt="Google Play" style={{ height: 34, display: 'block' }} />
          </a>
        </div>
      </div>
    </div>
  );
}
