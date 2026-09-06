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
 * There is a second precondition too: /__/auth/* must actually be proxied from
 * our domain. If it is not, the SPA catch-all serves index.html there and the
 * auth iframe silently loads the app's own shell instead of Firebase's handler.
 *
 *   node scripts/check_auth_domain.mjs
 *   node scripts/check_auth_domain.mjs --origin https://<preview>.vercel.app
 *
 * Read-only: unauthenticated GETs only; it never completes a sign-in.
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

/**
 * Is /__/auth/* proxied to Firebase at this origin, or is the SPA catch-all
 * still swallowing it? Both return HTTP 200, so a missing proxy fails
 * silently: the auth iframe would load the app's own shell and sign-in would
 * hang with nothing in the network tab looking wrong.
 *
 * Identified by the relative script tags only Firebase's auth pages carry
 * (iframe.js / handler.js). An earlier version looked for a gapi URL, which
 * that page does not contain — it reported a working proxy as "unrecognised".
 *
 * Note this cannot see a protected preview: Vercel's SSO page answers instead.
 * That is reported as such rather than as a failed proxy, since the two need
 * completely different fixes. Use `vercel curl` for protected deployments.
 */
async function probeProxy(origin) {
  const url = `${origin}/__/auth/iframe?apiKey=AIzaSyBvrcbWNBByF8OlD0_iJstZDYcZrKaBjYU`;
  let res, body;
  try {
    res = await fetch(url, { redirect: 'follow' });
    body = await res.text();
  } catch (e) {
    return { ok: false, why: `request failed (${e.message})` };
  }
  if (/vercel\.com\/(login|sso)/i.test(res.url) || /_vercel\/protection/i.test(body)) {
    return {
      ok: false,
      why: 'Vercel Deployment Protection answered, not the app — re-check with:\n' +
           `       vercel curl "${url}"`,
    };
  }
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
  if (/EdLight Academy/i.test(body)) return { ok: false, why: 'served the SPA shell — proxy not deployed' };
  if (/src="(iframe|handler)\.js"/i.test(body)) return { ok: true, why: "Firebase's auth iframe page" };
  return { ok: false, why: `unrecognised response (${body.length} bytes)` };
}

async function main() {
  const originArg = process.argv.indexOf('--origin');
  const origin = originArg > -1 ? process.argv[originArg + 1] : 'https://academy.edlight.org';

  const [control, current, target, proxy] = await Promise.all([
    probe(CONTROL), probe(CURRENT), probe(TARGET), probeProxy(origin),
  ]);

  console.log('1. OAuth redirect URI');
  console.log(`     control (must be rejected) : ${control}`);
  console.log(`     firebaseapp.com (current)  : ${current}`);
  console.log(`     academy.edlight.org        : ${target}`);
  console.log('');
  console.log(`2. /__/auth/* proxy at ${origin}`);
  console.log(`     ${proxy.ok ? 'ok' : 'FAILED'} — ${proxy.why}`);
  console.log('');

  if (control !== 'rejected' || current !== 'accepted') {
    console.log('INCONCLUSIVE — the probe is not measuring what it should.');
    console.log('Do not change authDomain based on this run.');
    process.exit(2);
  }

  const problems = [];
  if (target !== 'accepted') {
    problems.push(
      'Add this exact URI to the OAuth client\'s "Authorized redirect URIs":\n' +
      `  ${TARGET}\n` +
      '  https://console.cloud.google.com/apis/credentials?project=edlight-academy\n' +
      `  → OAuth 2.0 Client IDs → the Web client (${CLIENT_ID.slice(0, 24)}…)`
    );
  }
  if (!proxy.ok) {
    problems.push(
      `Deploy the vercel.json rewrite so ${origin}/__/auth/* reaches Firebase.\n` +
      '  It is inert until authDomain points at it, so it is safe to ship first.\n' +
      '  On a preview URL, re-run with --origin https://<preview>.vercel.app'
    );
  }

  if (problems.length === 0) {
    console.log('BOTH PRECONDITIONS MET — safe to point authDomain at academy.edlight.org.');
    process.exit(0);
  }

  console.log('NOT SAFE YET — sign-in would break. Outstanding:\n');
  problems.forEach((p, i) => console.log(`  (${i + 1}) ${p}\n`));
  process.exit(1);
}

main().catch((e) => { console.error('Probe failed:', e.message); process.exit(2); });
