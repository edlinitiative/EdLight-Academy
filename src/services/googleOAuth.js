// Google OAuth 2.0 Authorization Code with PKCE (no GIS)
// Docs: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow

import { GOOGLE_CLIENT_ID } from '../config';

function randomString(length = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (x) => charset[x % charset.length]).join('');
}

async function sha256(buffer) {
  const enc = new TextEncoder();
  const data = enc.encode(buffer);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

function base64urlEncode(bytes) {
  let str = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createCodeChallenge(verifier) {
  const hash = await sha256(verifier);
  return base64urlEncode(hash);
}

export function getRedirectUri() {
  const origin = window.location.origin;
  return `${origin}/auth/google/callback`;
}

export async function startGoogleOAuth({ prompt = 'select_account' } = {}) {
  const clientId = GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Missing GOOGLE_CLIENT_ID');

  const verifier = randomString(64);
  const challenge = await createCodeChallenge(verifier);
  const state = randomString(32);

  // Persist for callback
  sessionStorage.setItem('google_oauth_verifier', verifier);
  sessionStorage.setItem('google_oauth_state', state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    access_type: 'online',
    prompt,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.assign(authUrl);
}

export async function exchangeCodeForTokens(code) {
  const verifier = sessionStorage.getItem('google_oauth_verifier');
  if (!verifier) throw new Error('Missing code_verifier in session');

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const tokens = await res.json();
  return tokens; // { access_token, expires_in, id_token, scope, token_type, refresh_token? }
}

export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
