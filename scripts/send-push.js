#!/usr/bin/env node
/**
 * send-push.js — send Expo push notifications to EdLight mobile users.
 *
 * Reads `expoPushTokens` from Firestore user docs (written by the mobile app's
 * pushService.ts), chunks tokens by 100, POSTs to the Expo push API, checks
 * receipts, and prunes tokens that come back as DeviceNotRegistered.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='...' node scripts/send-push.js \
 *     --title "C'est l'heure de réviser ! 📚" \
 *     --body  "Continuez vos révisions et gardez votre série active." \
 *     [--title-ht "Li lè pou revize ! 📚"] \
 *     [--body-ht  "Kontinye revizyon ou yo epi kenbe seri ou aktif."] \
 *     [--uid <userId>]          only send to one user \
 *     [--data '{"tab":"trivia"}']  extra data payload (JSON) \
 *     [--dry-run]               list recipients without sending
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) or
 * FIREBASE_SERVICE_ACCOUNT_PATH (path to a service-account key file) —
 * same convention as the other scripts in this directory.
 *
 * Per-user language: the mobile app stores `language` ('fr' | 'ht') on the
 * user doc at push-registration time. Users whose doc says 'ht' get the
 * --title-ht/--body-ht variant when provided; everyone else gets the French
 * --title/--body. Docs created before this field existed default to French.
 */

const fs = require('fs');
const process = require('process');

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100; // Expo push API limit per request
const RECEIPT_WAIT_MS = 5000;

// ── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[name] = true;
      continue;
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

function loadServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be valid JSON).');
    }
  }
  if (p) return JSON.parse(fs.readFileSync(p, 'utf8'));
  throw new Error('Missing credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || (!args.title && !args['dry-run'])) {
    console.log('Usage: node scripts/send-push.js --title "..." --body "..." [--title-ht "..."] [--body-ht "..."] [--uid <id>] [--data \'{"tab":"trivia"}\'] [--dry-run]');
    process.exit(args.help ? 0 : 1);
  }

  let data = {};
  if (args.data) {
    try {
      data = JSON.parse(args.data);
    } catch {
      console.error('--data must be valid JSON');
      process.exit(1);
    }
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(loadServiceAccount()) });
  }
  const db = getFirestore();

  // ── 1. Collect recipients ──────────────────────────────────────────────────
  const users = [];
  if (args.uid) {
    const snap = await db.collection('users').doc(args.uid).get();
    if (snap.exists) users.push({ id: snap.id, ...snap.data() });
  } else {
    const snap = await db.collection('users').get();
    snap.forEach((d) => users.push({ id: d.id, ...d.data() }));
  }

  const tokenOwner = new Map(); // token -> uid (for pruning dead tokens)
  const messages = [];
  for (const user of users) {
    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens : [];
    if (tokens.length === 0) continue;
    const isCreole = user.language === 'ht';
    const title = (isCreole && args['title-ht']) || args.title;
    const body = (isCreole && args['body-ht']) || args.body || '';
    for (const token of tokens) {
      if (typeof token !== 'string' || !token.startsWith('ExponentPushToken')) continue;
      tokenOwner.set(token, user.id);
      messages.push({ to: token, title, body, data, sound: 'default' });
    }
  }

  console.log(`Recipients: ${tokenOwner.size} device token(s) across ${users.filter((u) => (u.expoPushTokens || []).length > 0).length} user(s).`);
  if (messages.length === 0) {
    console.log('Nothing to send.');
    return;
  }
  if (args['dry-run']) {
    for (const m of messages) console.log(`  ${tokenOwner.get(m.to)}  ${m.to}  "${m.title}"`);
    console.log('Dry run — nothing sent.');
    return;
  }

  // ── 2. Send in chunks of 100 ───────────────────────────────────────────────
  const deadTokens = new Set();
  const receiptIds = []; // { id, token }

  for (const [i, batch] of chunk(messages, CHUNK_SIZE).entries()) {
    console.log(`Sending chunk ${i + 1} (${batch.length} message(s))...`);
    let tickets;
    try {
      ({ data: tickets } = await postJson(EXPO_SEND_URL, batch));
    } catch (err) {
      console.error(`  Chunk ${i + 1} failed:`, err.message);
      continue;
    }
    tickets.forEach((ticket, j) => {
      const token = batch[j].to;
      if (ticket.status === 'ok') {
        receiptIds.push({ id: ticket.id, token });
      } else {
        console.error(`  Ticket error for ${token}: ${ticket.message} (${ticket.details?.error || 'unknown'})`);
        if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.add(token);
      }
    });
  }
  console.log(`Tickets OK: ${receiptIds.length}, immediate errors: ${messages.length - receiptIds.length}.`);

  // ── 3. Check receipts (delivery to FCM/APNs) ───────────────────────────────
  if (receiptIds.length > 0) {
    console.log(`Waiting ${RECEIPT_WAIT_MS / 1000}s before fetching receipts...`);
    await sleep(RECEIPT_WAIT_MS);
    const tokenByReceipt = new Map(receiptIds.map((r) => [r.id, r.token]));
    for (const ids of chunk(receiptIds.map((r) => r.id), 300)) {
      try {
        const { data: receipts } = await postJson(EXPO_RECEIPTS_URL, { ids });
        for (const [id, receipt] of Object.entries(receipts || {})) {
          if (receipt.status === 'ok') continue;
          const token = tokenByReceipt.get(id);
          console.error(`  Receipt error for ${token}: ${receipt.message} (${receipt.details?.error || 'unknown'})`);
          if (receipt.details?.error === 'DeviceNotRegistered' && token) deadTokens.add(token);
        }
      } catch (err) {
        console.warn('  Could not fetch receipts:', err.message);
      }
    }
  }

  // ── 4. Prune dead tokens (best-effort) ─────────────────────────────────────
  if (deadTokens.size > 0) {
    console.log(`Removing ${deadTokens.size} unregistered token(s) from Firestore...`);
    for (const token of deadTokens) {
      const uid = tokenOwner.get(token);
      if (!uid) continue;
      try {
        await db.collection('users').doc(uid).update({
          expoPushTokens: FieldValue.arrayRemove(token),
        });
        console.log(`  Removed dead token for user ${uid}.`);
      } catch (err) {
        console.warn(`  Could not remove token for ${uid}:`, err.message);
      }
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
