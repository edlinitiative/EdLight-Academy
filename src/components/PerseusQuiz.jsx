import React, { useEffect, useRef, useState } from 'react';

// Try a small matrix of CDN + versions to maximize odds of finding a build
const PERSEUS_VERSIONS = [
  '71.2.3',
  '71.0.0',
  '70.3.0',
  '68.4.1',
  '67.3.3',
];

function prox(url) {
  return `/proxy?url=${encodeURIComponent(url)}`;
}

const CDN_TEMPLATES = [
  // jsDelivr variants
  (v) => ({ js: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.min.js`), css: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.js`), css: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus-standalone.min.js`), css: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus-standalone.js`), css: prox(`https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.css`) }),
  // unpkg variants
  (v) => ({ js: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.min.js`), css: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.js`), css: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus-standalone.min.js`), css: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.css`) }),
  (v) => ({ js: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus-standalone.js`), css: prox(`https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.css`) }),
  // As a final fallback, try direct CDNs (no proxy)
  (v) => ({ js: `https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.min.js`, css: `https://cdn.jsdelivr.net/npm/@khanacademy/perseus@${v}/build/perseus.css` }),
  (v) => ({ js: `https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.min.js`, css: `https://unpkg.com/@khanacademy/perseus@${v}/build/perseus.css` }),
];

const KATEX_CSS = `https://unpkg.com/katex@0.16.9/dist/katex.min.css`;
const KATEX_JS = `https://unpkg.com/katex@0.16.9/dist/katex.min.js`;

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

async function tryLoadFrom({ js, css }) {
  await Promise.all([
    loadCssOnce(prox(KATEX_CSS)),
    loadCssOnce(css),
  ]);
  // Ensure KaTeX is available before Perseus initializes math rendering
  try {
    await loadScriptOnce(prox(KATEX_JS));
  } catch (e) {
    console.warn('[Perseus] KaTeX JS failed to load (continuing):', KATEX_JS, e);
  }
  console.info('[Perseus] Loading', js);
  await loadScriptOnce(js);
  const started = Date.now();
  const timeoutMs = 12000; // give even more time on slower networks
  while (!window.Perseus?.ItemRenderer && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const has = Boolean(window.Perseus?.ItemRenderer || window.Perseus?.default?.ItemRenderer);
  if (has) {
    const keys = Object.keys(window.Perseus || {});
    console.info('[Perseus] Available keys on global:', keys);
  }
  return has;
}

function resolvePerseusGlobal() {
  if (window.Perseus?.ItemRenderer) return window.Perseus;
  if (window.Perseus?.default?.ItemRenderer) return window.Perseus.default;
  return null;
}

async function ensurePerseusLoaded() {
  if (resolvePerseusGlobal()) return { ok: true, source: 'cached' };
  let lastErr;
  for (const v of PERSEUS_VERSIONS) {
    for (const tmpl of CDN_TEMPLATES) {
      const candidate = tmpl(v);
      try {
        const ok = await tryLoadFrom(candidate);
        if (ok) return { ok: true, source: candidate.js };
        // If loaded but still no ItemRenderer, continue trying others
        console.warn('[Perseus] Loaded but ItemRenderer missing, trying next candidate', candidate.js);
      } catch (e) {
        lastErr = e;
        console.warn('[Perseus] Failed to load candidate', candidate.js, e);
      }
    }
  }
  return { ok: false, error: lastErr };
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
        const res = await ensurePerseusLoaded();
        if (cancelled) return;
        if (res.ok && resolvePerseusGlobal()) {
          setReady(true);
        } else {
          console.error('Perseus global not found after script load. Tried multiple sources/versions.', res);
          // Provide some quick diagnostics to the user in a non-technical way
          setError('Interactive renderer unavailable. Please check your network or try again.');
        }
      } catch (e) {
        console.error('Failed to load Perseus assets', e);
        setError('Interactive renderer unavailable.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
  const perseus = resolvePerseusGlobal();
  if (!ready || !containerRef.current || !item || !perseus?.ItemRenderer) return;
    const mountNode = containerRef.current;
    mountNode.innerHTML = '';
  const { ItemRenderer } = perseus;
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
