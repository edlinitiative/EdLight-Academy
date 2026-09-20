/**
 * attestation — "this request came from the real app", for the Arena.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * From an external audit (E7): a Firebase ID token proves an ACCOUNT. It says
 * nothing about what sent the request, so a script holding a freely-created
 * login is indistinguishable from the app. Apple's App Attest and Google's
 * Play Integrity are the other half — the device attests, the platform
 * vouches, and Firebase App Check turns that into a token our API can verify.
 *
 * ── WHY NOT @react-native-firebase/app-check ────────────────────────────────
 *
 * It would work, and it would mean carrying a SECOND Firebase SDK in the
 * binary — native config files, a parallel initialisation at launch — beside
 * the JS SDK this app already uses for auth and Firestore. App Check's REST
 * API exposes the same exchange endpoints its client SDKs call, and they take
 * the app's public API key, so the raw attestation can go straight to Google
 * from here. Google still does the hard part (validating Apple's certificate
 * chain, decoding the Play Integrity verdict); we just carry the result.
 *
 * ── NOTHING HERE MAY EVER COST A STUDENT AN ANSWER ──────────────────────────
 *
 * Every path returns null rather than throwing, a failure is remembered so
 * that a broken device does not retry on all twenty-five questions, and the
 * caller sends no header when there is no token. Attestation fails for reasons
 * that are not cheating: a second-hand jailbroken phone, an Apple service
 * outage, a Play Services that needs updating. The server treats absence as
 * unknown and never blocks on it.
 *
 * ── STATE OF THIS CODE ──────────────────────────────────────────────────────
 *
 * The exchange endpoints refuse until the two providers are registered for
 * this Firebase project (App Attest for iOS, Play Integrity for Android).
 * Until that is done every call here fails closed and the app behaves exactly
 * as it did before. It has NOT been exercised against a live provider yet.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig } from '../config/firebase';

const BASE = 'https://firebaseappcheck.googleapis.com/v1';

/** Where the iOS App Attest key id and its exchanged artifact live. */
const KEY_ID_STORAGE = '@edlight/attest/keyId';
const ARTIFACT_STORAGE = '@edlight/attest/artifact';

/** Refresh a little before expiry so a question is never answered on a token
 *  that dies in flight. */
const REFRESH_MARGIN_MS = 5 * 60_000;

/** After a failure, how long before trying again. A device that cannot attest
 *  usually still cannot a minute later, and the submit path is not the place
 *  to keep finding that out. */
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

interface CachedToken { token: string; expiresAt: number }

let cached: CachedToken | null = null;
let failedUntil = 0;
let inFlight: Promise<string | null> | null = null;

/**
 * The native module, loaded lazily and never at import time.
 *
 * A build that predates this dependency still receives JS over the air, and
 * an import at module scope would take the whole bundle down on it. Inside a
 * try/catch, an older binary simply has no attestation and says so.
 */
function nativeModule(): typeof import('@expo/app-integrity') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('@expo/app-integrity');
  } catch {
    return null;
  }
}

const appId = () => firebaseConfig.appId;
const apiKey = () => firebaseConfig.apiKey;
/** The App Check resource path is keyed by project NUMBER, which is what the
 *  messaging sender id is. */
const projectNumber = () => firebaseConfig.messagingSenderId;

async function post(method: string, body: Record<string, unknown>): Promise<Record<string, any> | null> {
  const url = `${BASE}/projects/${projectNumber()}/apps/${appId()}:${method}?key=${apiKey()}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, any>;
  } catch {
    return null;
  }
}

/** "3600s" → ms. */
function ttlMs(ttl: unknown): number {
  const seconds = typeof ttl === 'string' ? parseInt(ttl.replace(/s$/, ''), 10) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : 30 * 60_000;
}

// ── iOS: App Attest ─────────────────────────────────────────────────────────

/**
 * Two shapes, and which one runs depends on whether this install has ever
 * attested before.
 *
 * FIRST TIME: generate a Secure Enclave key, have Apple attest to it, and
 * exchange that attestation for both an App Check token and an ARTIFACT. The
 * artifact is what makes every later call cheap.
 *
 * EVERY TIME AFTER: sign a fresh server challenge with the same key and
 * exchange the assertion. No Apple round trip, no new key.
 *
 * The artifact is stored, so losing it (a reinstall, cleared storage) simply
 * falls back to the first shape rather than failing.
 */
async function iosToken(native: NonNullable<ReturnType<typeof nativeModule>>): Promise<CachedToken | null> {
  if (!native.isSupported) return null;

  let keyId = await AsyncStorage.getItem(KEY_ID_STORAGE);
  if (!keyId) {
    keyId = await native.generateKeyAsync();
    await AsyncStorage.setItem(KEY_ID_STORAGE, keyId);
    // A new key has never been attested, so any stored artifact belongs to a
    // key that no longer exists.
    await AsyncStorage.removeItem(ARTIFACT_STORAGE);
  }

  const challengeRes = await post('generateAppAttestChallenge', {});
  const challenge = challengeRes?.challenge;
  if (typeof challenge !== 'string') return null;

  const artifact = await AsyncStorage.getItem(ARTIFACT_STORAGE);

  if (artifact) {
    const assertion = await native.generateAssertionAsync(keyId, challenge);
    const res = await post('exchangeAppAttestAssertion', { artifact, assertion, challenge });
    const token = res?.token;
    if (typeof token === 'string') return { token, expiresAt: Date.now() + ttlMs(res?.ttl) };
    // The artifact can be rejected after a reinstall or a key rotation; drop it
    // and let the next attempt re-attest from scratch.
    await AsyncStorage.removeItem(ARTIFACT_STORAGE);
    return null;
  }

  const attestation = await native.attestKeyAsync(keyId, challenge);
  const res = await post('exchangeAppAttestAttestation', {
    attestationStatement: attestation,
    challenge,
    keyId,
  });
  const token = res?.appCheckToken?.token;
  if (typeof token !== 'string') return null;
  if (typeof res?.artifact === 'string') await AsyncStorage.setItem(ARTIFACT_STORAGE, res.artifact);
  return { token, expiresAt: Date.now() + ttlMs(res?.appCheckToken?.ttl) };
}

// ── Android: Play Integrity ─────────────────────────────────────────────────

let providerReady = false;

async function androidToken(native: NonNullable<ReturnType<typeof nativeModule>>): Promise<CachedToken | null> {
  if (!providerReady) {
    // Warms Play Integrity's own token provider. Cheap after the first call,
    // and it is the call that fails on a device with an outdated Play Services
    // — which is a device that cannot attest, not a student doing anything.
    await native.prepareIntegrityTokenProviderAsync(projectNumber());
    providerReady = true;
  }

  const challengeRes = await post('generatePlayIntegrityChallenge', {});
  const challenge = challengeRes?.challenge;
  if (typeof challenge !== 'string') return null;

  const integrityToken = await native.requestIntegrityCheckAsync(challenge);
  const res = await post('exchangePlayIntegrityToken', { playIntegrityToken: integrityToken });
  const token = res?.token;
  if (typeof token !== 'string') return null;
  return { token, expiresAt: Date.now() + ttlMs(res?.ttl) };
}

// ── The one thing callers use ───────────────────────────────────────────────

/**
 * An App Check token for the `X-Firebase-AppCheck` header, or null.
 *
 * Null is an ordinary answer and the caller must treat it as one: send no
 * header and submit the answer regardless. De-duplicated across concurrent
 * callers, cached until shortly before expiry, and silent for ten minutes
 * after a failure.
 */
export async function attestationToken(): Promise<string | null> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token;
  if (Date.now() < failedUntil) return null;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const native = nativeModule();
      if (!native || !appId() || !apiKey() || !projectNumber()) return null;

      const fresh = Platform.OS === 'ios'
        ? await iosToken(native)
        : Platform.OS === 'android' ? await androidToken(native) : null;

      if (!fresh) {
        failedUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
        return null;
      }
      cached = fresh;
      return fresh.token;
    } catch {
      // Includes the native module throwing on a device that does not support
      // attestation at all. Never rethrown: the answer matters more.
      failedUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test seam, and the reset an account switch needs. */
export function __resetAttestationCache(): void {
  cached = null;
  failedUntil = 0;
  inFlight = null;
  providerReady = false;
}
