import React, { useEffect, useRef, useState } from 'react';
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
 * react-native WebView at /figure-embed?d=<encoded figure_description>.
 */
export default function FigureEmbed() {
  const [description, setDescription] = useState<string>(() => readDescription());
  const rootRef = useRef<HTMLDivElement>(null);

  // Inside a react-native WKWebView the default layout viewport can come out
  // wider than the view, cropping the figure. The host passes its measured
  // width as ?w=<pts>; pin the viewport to that exact width.
  useEffect(() => {
    const w = Number(new URLSearchParams(window.location.search).get('w'));
    if (Number.isFinite(w) && w > 0) {
      let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', `width=${Math.round(w)}, initial-scale=1, maximum-scale=1`);
      document.documentElement.style.width = `${Math.round(w)}px`;
      document.body.style.width = `${Math.round(w)}px`;
      window.setTimeout(postHeight, 50);
    }
  }, []);

  // Re-render when the hash changes (host can swap figures without a reload).
  useEffect(() => {
    const onHashChange = () => setDescription(readDescription());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Some figures lay out wider than the viewport no matter what (WKWebView's
  // table width resolution, fixed-size SVGs, KaTeX blocks…). Rather than fight
  // each case, zoom the whole figure down to fit — WebKit's `zoom` affects
  // layout, so the reported scrollHeight stays correct. Re-run after the lazy
  // KaTeX/figure chunks settle, then report the final height.
  useEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      const iw = window.innerWidth;
      if (!(iw > 0)) return;

      // Tables: WKWebView resolves their width against a phantom 800px block;
      // an inline !important width is the only thing nothing can override.
      el.querySelectorAll('table').forEach((t) => {
        (t as HTMLElement).style.setProperty('width', `${iw - 20}px`, 'important');
        (t as HTMLElement).style.setProperty('table-layout', 'fixed', 'important');
      });

      // Anything still wider than the viewport (fixed-size SVGs, KaTeX blocks):
      // zoom the whole figure down to fit. Overflow can hide inside scrollable
      // wraps, so measure the widest descendant, not just the root.
      (el.style as any).zoom = '1';
      let widest = Math.max(el.scrollWidth, document.documentElement.scrollWidth);
      el.querySelectorAll('div, table, svg, img, canvas').forEach((n) => {
        const w = (n as HTMLElement).scrollWidth || 0;
        if (w > widest) widest = w;
      });
      if (widest > iw + 2) {
        (el.style as any).zoom = String(Math.max(0.35, iw / widest));
      }
      postHeight();
    };

    fit();
    const t1 = window.setTimeout(fit, 200);
    const t2 = window.setTimeout(fit, 600);
    const t3 = window.setTimeout(fit, 1400);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => postHeight());
      observer.observe(document.body);
    }
    window.addEventListener('resize', fit);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [description]);

  return (
    <div ref={rootRef} style={{ background: '#ffffff', padding: 8, minHeight: 1 }}>
      {/* Keep mobile text at authored size and let tables use the full width. */}
      <style>{`
        html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        .figure-render { max-width: 100%; }
        .figure-render__table th, .figure-render__table td { word-break: break-word; }
      `}</style>
      {description ? <FigureRenderer description={description} /> : null}
    </div>
  );
}
