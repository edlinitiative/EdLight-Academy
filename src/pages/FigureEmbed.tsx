import React, { useEffect, useState } from 'react';
import FigureRenderer from '../components/FigureRenderer';

// Reads the figure description from the URL hash (falls back to the `d` query
// param). Using the hash avoids URL-length limits and server involvement.
function readDescription(): string {
  const hash = window.location.hash.slice(1);
  if (hash) {
    try {
      return decodeURIComponent(hash);
    } catch {
      return hash;
    }
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('d') || '';
}

// Reports the rendered content height to the react-native WebView host.
function postHeight() {
  const rn = (window as any).ReactNativeWebView;
  if (rn && typeof rn.postMessage === 'function') {
    rn.postMessage(String(document.body.scrollHeight));
  }
}

/**
 * Minimal chrome-free page that renders a single exam figure with the same
 * engine as the web app (FigureRenderer). Loaded by the mobile app inside a
 * react-native WebView at /figure-embed#<encoded figure_description>.
 */
export default function FigureEmbed() {
  const [description, setDescription] = useState<string>(() => readDescription());

  // Re-render when the hash changes (host can swap figures without a reload).
  useEffect(() => {
    const onHashChange = () => setDescription(readDescription());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Report content height after render, on resize, and after short delays to
  // catch lazy KaTeX layout shifts.
  useEffect(() => {
    postHeight();
    const t1 = window.setTimeout(postHeight, 150);
    const t2 = window.setTimeout(postHeight, 500);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => postHeight());
      observer.observe(document.body);
    }
    window.addEventListener('resize', postHeight);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer?.disconnect();
      window.removeEventListener('resize', postHeight);
    };
  }, [description]);

  return (
    <div style={{ background: '#ffffff', padding: 8, minHeight: 1 }}>
      {description ? <FigureRenderer description={description} /> : null}
    </div>
  );
}
