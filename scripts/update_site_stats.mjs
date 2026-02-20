#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function toNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function loadServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be valid JSON).');
    }
  }

  if (p) {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  }

  throw new Error('Missing credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.');
}

function readExamCount() {
  const examPath = path.resolve(__dirname, '../public/exam_catalog.json');
  const raw = fs.readFileSync(examPath, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('public/exam_catalog.json is not a JSON array.');
  return arr.length;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || args.h) {
    console.log(`Usage:
  node scripts/update_site_stats.mjs [--students 1234] [--mastery 92]

Environment:
  FIREBASE_SERVICE_ACCOUNT_JSON  (preferred) JSON string for Admin SDK
  FIREBASE_SERVICE_ACCOUNT_PATH  path to service account JSON file

Notes:
  - Writes Firestore doc: siteStats/public
  - --students: if omitted, auto-fetched from Firestore users collection.
  - --mastery:  if omitted, existing value in siteStats/public is preserved.
  - Exam count is always auto-computed from public/exam_catalog.json.
`);
    process.exit(0);
  }

  const serviceAccount = loadServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  // Auto-fetch student count if not provided.
  let students = toNumber(args.students);
  if (students == null) {
    try {
      const snap = await db.collection('users').count().get();
      students = snap.data().count;
      console.log(`Auto-fetched student count: ${students}`);
    } catch (e) {
      console.warn('Could not auto-fetch student count:', e.message);
    }
  }

  // Preserve existing mastery if not provided.
  let mastery = toNumber(args.mastery);
  if (mastery == null) {
    try {
      const existing = await db.collection('siteStats').doc('public').get();
      if (existing.exists) {
        mastery = toNumber(existing.data().mastery_rate_percent);
        if (mastery != null) console.log(`Preserving existing mastery rate: ${mastery}%`);
      }
    } catch (e) {
      console.warn('Could not read existing mastery rate:', e.message);
    }
  }

  let exams;
  try {
    exams = readExamCount();
  } catch (e) {
    console.warn('Could not compute exams count from public/exam_catalog.json. Skipping exams update.', e);
    exams = null;
  }

  const update = { updated_at: FieldValue.serverTimestamp() };
  if (students != null) update.active_students_term = students;
  if (mastery != null) update.mastery_rate_percent = mastery;
  if (exams != null) update.exams = exams;

  await db.collection('siteStats').doc('public').set(update, { merge: true });

  console.log('Updated siteStats/public:', {
    ...(students != null ? { active_students_term: students } : {}),
    ...(mastery != null ? { mastery_rate_percent: mastery } : {}),
    ...(exams != null ? { exams } : {}),
  });
}

main().catch((e) => {
  console.error('Failed to update site stats:', e);
  process.exit(1);
});
