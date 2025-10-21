import React, { useEffect, useRef, useState } from 'react';

const PERSEUS_VERSION = '71.2.3';
const ASSETS = {
  // Use unpkg build artifacts, which expose a browser global window.Perseus
  katexCss: `https://unpkg.com/katex@0.16.9/dist/katex.min.css`,
  perseusCss: `https://unpkg.com/@khanacademy/perseus@${PERSEUS_VERSION}/build/perseus.css`,
  perseusJs: `https://unpkg.com/@khanacademy/perseus@${PERSEUS_VERSION}/build/perseus.js`,
};

function loadCssOnce(href) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.body.appendChild(script);
  });
}

async function ensurePerseusLoaded() {
  if (window.Perseus?.ItemRenderer) return;
  await Promise.all([
    loadCssOnce(ASSETS.katexCss),
    loadCssOnce(ASSETS.perseusCss),
  ]);
  await loadScriptOnce(ASSETS.perseusJs);
  // Poll briefly for the global to attach
  const started = Date.now();
  while (!window.Perseus?.ItemRenderer && Date.now() - started < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

export default function PerseusQuiz({ item, onScore }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensurePerseusLoaded();
        if (cancelled) return;
        if (window.Perseus?.ItemRenderer) {
          setReady(true);
        } else {
          console.error('Perseus global not found after script load:', ASSETS.perseusJs);
          setError('Interactive renderer unavailable.');
        }
      } catch (e) {
        console.error('Failed to load Perseus assets', e);
        setError('Interactive renderer unavailable.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !item || !window.Perseus?.ItemRenderer) return;
    const mountNode = containerRef.current;
    mountNode.innerHTML = '';
    const { ItemRenderer } = window.Perseus;
    const apiOptions = { readOnly: false, customKeypad: false, staticRender: false };
    rendererRef.current = ItemRenderer.mountItem(item, mountNode, apiOptions);
    return () => {
      if (rendererRef.current && rendererRef.current.destroy) {
        rendererRef.current.destroy();
      }
    };
  }, [ready, item]);

  const handleScore = () => {
    if (!rendererRef.current) return;
    const score = rendererRef.current.scoreInput();
    if (onScore) onScore(score);
  };

  if (error) return <div className="card"><p>{error}</p></div>;

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {!ready && <p className="text-muted">Loading interactive question…</p>}
      <div ref={containerRef} />
      {ready && (
        <div style={{ marginTop: '0.75rem' }}>
          <button className="button button--primary button--sm" onClick={handleScore}>Check</button>
        </div>
      )}
    </div>
  );
}
