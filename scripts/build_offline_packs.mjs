#!/usr/bin/env node
/**
 * Build the offline revision packs from public/exam_catalog.json.
 *
 *   public/packs/manifest.json            every pack: id, level, subject, size, hash, file
 *   public/packs/<id>.<hash>.json         one pack (level + subject, maybe a volume)
 *
 * The file name carries the content hash, so a corrected paper ships as a new
 * file and the phone sees "Mise à jour disponible"; an unchanged pack keeps its
 * name and hash across builds. Runs in `prebuild` after split_exam_catalog.
 *
 *   node scripts/build_offline_packs.mjs [--max-bytes 1200000]
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildExamPacks, buildManifest } from './offline_packs_core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'exam_catalog.json');
const OUT = path.join(ROOT, 'public', 'packs');

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max-bytes');
const maxPackBytes = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 1_200_000;

async function main() {
  if (!existsSync(SRC)) {
    console.error(`ERROR: ${SRC} not found`);
    process.exit(1);
  }
  const catalog = JSON.parse(await readFile(SRC, 'utf8'));
  const now = Date.now();
  const packs = buildExamPacks(catalog, {
    maxPackBytes,
    now,
    gzipBytes: (text) => zlib.gzipSync(text, { level: 6 }).length,
  });
  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const { entry, text } of packs) await writeFile(path.join(OUT, entry.file), text, 'utf8');
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(buildManifest(packs, now)), 'utf8');

  const sizes = packs.map((p) => p.entry.sizeBytes);
  const total = sizes.reduce((a, b) => a + b, 0);
  const gz = packs.reduce((a, p) => a + (p.entry.downloadBytes || 0), 0);
  console.log('✓ Offline revision packs');
  console.log(`  packs:            ${packs.length}  ->  public/packs/`);
  console.log(`  largest pack:     ${(Math.max(...sizes) / 1024).toFixed(0)} KB stored`);
  console.log(`  all packs:        ${(total / 1024 / 1024).toFixed(1)} MB stored, ${(gz / 1024 / 1024).toFixed(1)} MB to download`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
