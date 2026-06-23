#!/usr/bin/env node
/**
 * Push the server-side Web Push env vars to Vercel via the REST API.
 * ---------------------------------------------------------------------------
 * Why REST and not `vercel env add`: the CLI's "Git branch?" prompt for the
 * Preview target can't be answered reliably in a headless shell, and sensitive
 * values can't be read back to verify. This script is deterministic and
 * idempotent — it deletes any existing entries for each key, then recreates
 * them across production + preview + development.
 *
 * Vercel rule honored: a "sensitive" variable cannot target `development`, so
 * secrets are stored sensitive on prod+preview and encrypted on development.
 *
 * Auth + project: taken from the local Vercel CLI login
 * (~/.local/share/com.vercel.cli/auth.json) and .vercel/repo.json. Run
 * `vercel login` and `vercel link` once if those are missing. A VERCEL_TOKEN
 * env var overrides the stored token.
 *
 * Values (secrets are read from the environment / a file — never hardcoded):
 *   VAPID_PRIVATE_KEY   required (env)   — must pair with the public key below
 *   CRON_SECRET         optional (env)   — generated if unset
 *   VAPID_PUBLIC_KEY    parsed from src/index.html (window.EDLIGHT_PUSH_VAPID_KEY)
 *   VAPID_SUBJECT       env or mailto:contact@edlightacademy.com
 *   FIREBASE_SERVICE_ACCOUNT_JSON  env, or read from $GOOGLE_APPLICATION_CREDENTIALS
 *
 * Usage:
 *   VAPID_PRIVATE_KEY=… [CRON_SECRET=…] node scripts/push_vercel_env.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TARGETS = ['production', 'preview', 'development'];
const API = 'https://api.vercel.com';

function fail(msg) {
  console.error(`ABORT: ${msg}`);
  process.exit(1);
}

// ── Auth + project linkage ──────────────────────────────────────────────────
function loadToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const p = path.join(os.homedir(), '.local/share/com.vercel.cli/auth.json');
  if (!fs.existsSync(p)) fail('not logged in to Vercel (run `vercel login`) and no VERCEL_TOKEN set.');
  return JSON.parse(fs.readFileSync(p, 'utf8')).token;
}
function loadProject() {
  const p = path.join(ROOT, '.vercel/repo.json');
  if (!fs.existsSync(p)) fail('project not linked (run `vercel link`).');
  const proj = JSON.parse(fs.readFileSync(p, 'utf8')).projects?.[0];
  if (!proj?.id || !proj?.orgId) fail('could not read project id / orgId from .vercel/repo.json');
  return { projId: proj.id, teamId: proj.orgId };
}

const TOKEN = loadToken();
const { projId, teamId } = loadProject();
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const req = (method, p, body) =>
  fetch(`${API}${p}${p.includes('?') ? '&' : '?'}teamId=${teamId}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });

// ── Assemble values ─────────────────────────────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const PUB = (html.match(/EDLIGHT_PUSH_VAPID_KEY = "([^"]+)"/) || [])[1];
if (!PUB) fail('could not find window.EDLIGHT_PUSH_VAPID_KEY in src/index.html');

const PRIV = process.env.VAPID_PRIVATE_KEY || '';
if (!PRIV) fail('VAPID_PRIVATE_KEY env var is required.');

// Verify the pair before touching anything.
const ecdh = crypto.createECDH('prime256v1');
try {
  ecdh.setPrivateKey(Buffer.from(PRIV, 'base64url'));
} catch {
  fail('VAPID_PRIVATE_KEY is not valid base64url.');
}
if (ecdh.getPublicKey().toString('base64url') !== PUB) {
  fail('VAPID_PRIVATE_KEY does not pair with the public key in src/index.html.');
}

const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@edlightacademy.com';
const CRON = process.env.CRON_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.CRON_SECRET) console.log(`Generated CRON_SECRET=${CRON}`);

let SA = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
if (!SA && process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  SA = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8').replace(/\n$/, '');
}
if (!SA) fail('FIREBASE_SERVICE_ACCOUNT_JSON missing (env or $GOOGLE_APPLICATION_CREDENTIALS file).');
try {
  JSON.parse(SA);
} catch {
  fail('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
}

// type "sensitive" => unreadable after save (true secrets);
// type "encrypted" => readable in dashboard (the public key + subject aren't secret).
const VARS = [
  { key: 'VAPID_PUBLIC_KEY', value: PUB, secret: false },
  { key: 'VAPID_SUBJECT', value: SUBJECT, secret: false },
  { key: 'VAPID_PRIVATE_KEY', value: PRIV, secret: true },
  { key: 'CRON_SECRET', value: CRON, secret: true },
  { key: 'FIREBASE_SERVICE_ACCOUNT_JSON', value: SA, secret: true },
];

// ── Apply ───────────────────────────────────────────────────────────────────
const keys = new Set(VARS.map((v) => v.key));

const list = await (await req('GET', `/v9/projects/${projId}/env`)).json();
const existing = (list.envs || list.env || []).filter((e) => keys.has(e.key));
console.log(`Deleting ${existing.length} existing entr(y/ies)…`);
for (const e of existing) {
  const d = await req('DELETE', `/v9/projects/${projId}/env/${e.id}`);
  if (d.status !== 200) console.warn(`  ! delete failed for ${e.key} (${d.status})`);
}

console.log('Creating entries…');
let failures = 0;
for (const v of VARS) {
  const plans = v.secret
    ? [
        { target: ['production', 'preview'], type: 'sensitive' },
        { target: ['development'], type: 'encrypted' },
      ]
    : [{ target: TARGETS, type: 'encrypted' }];
  for (const p of plans) {
    const r = await req('POST', `/v10/projects/${projId}/env`, {
      key: v.key,
      value: v.value,
      type: p.type,
      target: p.target,
    });
    const ok = r.status >= 200 && r.status < 300;
    if (!ok) failures += 1;
    const detail = ok ? 'created' : `FAIL ${r.status} ${JSON.stringify((await r.json().catch(() => ({}))).error || '')}`;
    console.log(`  + ${v.key.padEnd(30)} ${p.type.padEnd(10)} [${p.target.join('+')}] -> ${detail}`);
  }
}

console.log(failures ? `\nDone with ${failures} failure(s).` : '\n✓ All env vars set. Redeploy for them to take effect: vercel --prod');
process.exit(failures ? 1 : 0);
