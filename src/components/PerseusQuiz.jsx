import React, { useEffect, useRef, useState } from 'react';

const PERSEUS_VERSION = '71.2.3';
const ASSETS = {
  katexCss: `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css`,
  perseusCss: `https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${PERSEUS_VERSION}/dist/perseus.css`,
  perseusJs: `https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${PERSEUS_VERSION}/dist/perseus.js`,
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
        setReady(true);
      } catch (e) {
        console.error('Failed to load Perseus', e);
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
