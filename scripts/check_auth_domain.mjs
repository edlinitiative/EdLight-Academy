#!/usr/bin/env node
/**
 * Is it safe to point authDomain at our own domain yet?
 *
 * Serving Firebase's auth handler from academy.edlight.org removes a cold
 * third origin (edlight-academy.firebaseapp.com) from the sign-in path. The
 * catch: Identity Toolkit derives the OAuth `redirect_uri` from whatever domain
 * asks, so the moment authDomain changes, Google starts receiving
 * `https://academy.edlight.org/__/auth/handler` — and if that exact URI is not
 * on the OAuth client, EVERY sign-in fails with redirect_uri_mismatch.
 *
 * There is no API for OAuth client redirect URIs; they are console-only. So
 * this script probes Google the way a real sign-in would, and refuses to give
 * the all-clear until the URI is actually registered.
 *
 *   node scripts/check_auth_domain.mjs
 *
 * Read-only: it makes unauthenticated GETs to the consent endpoint and never
 * completes a sign-in.
 */

const CLIENT_ID = '618990331083-lq461c7uqjr6sk389qi1tarcdrgfcobj.apps.googleusercontent.com';
const CURRENT = 'https://edlight-academy.firebaseapp.com/__/auth/handler';
const TARGET = 'https://academy.edlight.org/__/auth/handler';
// If Google rejected this, the probe itself would be meaningless.
const CONTROL = 'https://definitely-not-registered.example.com/__/auth/handler';

async function probe(redirectUri) {
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&response_type=code&scope=openid%20email';

  const res = await fetch(url, { redirect: 'follow' });
  const body = await res.text();
  if (/redirect_uri_mismatch/i.test(body)) return 'rejected';
  if (/signin|accountchooser/i.test(res.url)) return 'accepted';
  return 'unknown';
}

async function main() {
  const [control, current, target] = await Promise.all([
    probe(CONTROL), probe(CURRENT), probe(TARGET),
  ]);

  console.log(`  control (must be rejected) : ${control}`);
  console.log(`  firebaseapp.com (current)  : ${current}`);
  console.log(`  academy.edlight.org        : ${target}`);
  console.log('');

  if (control !== 'rejected' || current !== 'accepted') {
    console.log('INCONCLUSIVE — the probe is not measuring what it should.');
    console.log('Do not change authDomain based on this run.');
    process.exit(2);
  }

  if (target === 'accepted') {
    console.log('SAFE TO SWITCH.');
    console.log('Set authDomain to "academy.edlight.org" in src/index.html');
    console.log('(window.EDLIGHT_FIREBASE_CONFIG) and deploy.');
    process.exit(0);
  }

  console.log('NOT SAFE YET — switching now would break every sign-in.');
  console.log('');
  console.log('Add this exact URI to the OAuth client\'s "Authorized redirect URIs":');
  console.log(`  ${TARGET}`);
  console.log('');
  console.log('  https://console.cloud.google.com/apis/credentials?project=edlight-academy');
  console.log(`  → OAuth 2.0 Client IDs → the Web client (${CLIENT_ID.slice(0, 24)}…)`);
  console.log('');
  console.log('Then re-run this script. Changes can take a few minutes to propagate.');
  process.exit(1);
}

main().catch((e) => { console.error('Probe failed:', e.message); process.exit(2); });
