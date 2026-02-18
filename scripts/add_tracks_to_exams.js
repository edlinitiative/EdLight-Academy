#!/usr/bin/env node
/**
 * add_tracks_to_exams.js
 * ──────────────────────
 * Enriches every exam in exam_catalog.json with a `tracks` array field.
 *
 * Strategy:
 *   1. For each exam, extract track codes from:
 *      a) exam_title (SÉRIES: SVT, SES, SMP, ...)
 *      b) _source_file name (chimie_svt_smp.pdf)
 *      c) section instructions (SVT et SMP : Traiter...)
 *   2. For "universal" subjects (Français, Anglais, Espagnol, Philosophie,
 *      Histoire-Géo, Kreyòl, Mathématiques, Informatique), always set ["ALL"]
 *   3. For non-baccalaureat levels (9eme_af, universite), always set ["ALL"]
 *   4. When no tracks are detected, default to ["ALL"]
 *
 * Usage:
 *   node scripts/add_tracks_to_exams.js
 *   node scripts/add_tracks_to_exams.js --dry-run   # preview changes
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const DRY_RUN = process.argv.includes('--dry-run');

// Canonical track codes
const VALID_TRACKS = new Set(['SVT', 'SMP', 'SES', 'LET', 'ARTS']);

// Track code aliases — only match in uppercase/track-listing context
// NOTE: "LA" (Lettres et Arts) is extremely ambiguous because "la" is a
// common French article. We only match it next to other track codes or
// after a slash, e.g. "LET/LA" or "SÉRIES: LA, SVT".
const TRACK_ALIASES = {
  'LLA': 'LET',
  'ART': 'ARTS',
  'LETTRES': 'LET',
};

// LA is special — only match when preceded by "/" or "," and another track code nearby
function matchLAAlias(text) {
  if (!text) return false;
  // Match LA only after slash: "LET/LA", "SVT/LA"
  if (/[/,]\s*LA\b/i.test(text)) return true;
  // Match LA only when part of a SÉRIES listing
  if (/S[ÉE]RIES?\s*:?[^.]*\bLA\b/i.test(text)) return true;
  return false;
}

// Subjects that are universal (taken by all tracks)
const UNIVERSAL_SUBJECTS = new Set([
  'francais', 'français',
  'anglais', 'anglais - business',
  'espagnol', 'espagnol - gastronomía',
  'philosophie', 'philosophie (esthétique)', 'philosophie (religion)', 'philosophie - logique',
  'histoire et géographie', 'histoire - géographie', 'histoire-géographie',
  'kreyol', 'kreyòl', 'kominikasyon kreyòl',
  'mathematiques', 'mathématiques', 'mathématiques topographie',
  'informatique',
  'mixed', 'culture générale', 'connaissances générales',
  'éthique',
]);

// Subject keywords that make a subject track-specific
const TRACK_SPECIFIC_SUBJECTS = {
  'chimie': ['SVT', 'SMP', 'SES'],   // Chemistry exams usually specify series
  'physique': ['SVT', 'SMP', 'SES'],
  'svt': ['SVT'],
  'biologie': ['SVT'],
  'géologie': ['SVT'],
  'anatomie': ['SVT'],
  'zoologie': ['SVT'],
  'cytologie': ['SVT'],
  'économie': ['SES'],
  'art': ['ARTS'],
  'musique': ['ARTS'],
};

function normalizeTrackCode(raw) {
  const upper = raw.trim().toUpperCase();
  if (VALID_TRACKS.has(upper)) return upper;
  if (TRACK_ALIASES[upper]) return TRACK_ALIASES[upper];
  // "LA" in a SÉRIES listing context is always LET (handled by caller)
  if (upper === 'LA') return 'LET';
  return null;
}

function extractTracksFromTitle(title) {
  if (!title) return [];
  const tracks = new Set();

  // Pattern 1: SÉRIES : (SVT, SES, SMP) or SÉRIE : LLA
  const seriesMatch = title.match(/S[ÉE]RIES?\s*:?\s*\(?([A-Za-z,/\s-]+)\)?/i);
  if (seriesMatch) {
    const codes = seriesMatch[1].split(/[,/\s]+/).filter(Boolean);
    for (const c of codes) {
      const norm = normalizeTrackCode(c);
      if (norm) tracks.add(norm);
    }
  }

  // Pattern 2: Parenthesized codes like (SVT, SMP) or (SES)
  const parenMatches = title.matchAll(/\(([A-Z]{2,5}(?:[\s,/-]+[A-Z]{2,5})*)\)/gi);
  for (const m of parenMatches) {
    const codes = m[1].split(/[\s,/-]+/).filter(Boolean);
    for (const c of codes) {
      const norm = normalizeTrackCode(c);
      if (norm) tracks.add(norm);
    }
  }

  return [...tracks];
}

function extractTracksFromSource(sourceFile) {
  if (!sourceFile) return [];
  const tracks = new Set();
  const upper = sourceFile.toUpperCase();

  for (const code of VALID_TRACKS) {
    // Match as word in filename (underscore/hyphen/dot-delimited or word boundary)
    const re = new RegExp(`(?:^|[\\b_\\-\\.])${code}(?:$|[\\b_\\-\\.])`, 'i');
    if (re.test(upper)) tracks.add(code);
  }

  // Check aliases
  for (const [alias, canonical] of Object.entries(TRACK_ALIASES)) {
    const re = new RegExp(`(?:^|[\\b_\\-\\.])${alias}(?:$|[\\b_\\-\\.])`, 'i');
    if (re.test(upper)) tracks.add(canonical);
  }

  return [...tracks];
}

function extractTracksFromSections(sections) {
  if (!sections) return [];
  const tracks = new Set();

  for (const sec of sections) {
    const instr = sec.instructions || '';
    const title = sec.section_title || '';
    const combined = `${title} ${instr}`;

    // Check for track codes in instructions
    for (const code of VALID_TRACKS) {
      const re = new RegExp(`\\b${code}\\b`, 'i');
      if (re.test(combined)) tracks.add(code);
    }

    // Check aliases (excluding LA which needs special handling)
    for (const [alias, canonical] of Object.entries(TRACK_ALIASES)) {
      // Only match as standalone word
      const re = new RegExp(`\\b${alias}\\b(?!\\w)`, 'i');
      if (re.test(combined)) tracks.add(canonical);
    }

    // Special handling for "LA" alias — only in track-listing context
    if (matchLAAlias(combined)) tracks.add('LET');
  }

  return [...tracks];
}

function getSubjectDefaultTracks(subject) {
  if (!subject) return [];
  const lower = subject.trim().toLowerCase();

  // Check if universal
  if (UNIVERSAL_SUBJECTS.has(lower)) return ['ALL'];

  // Check track-specific subjects
  for (const [keyword, tracks] of Object.entries(TRACK_SPECIFIC_SUBJECTS)) {
    if (lower.includes(keyword)) return tracks;
  }

  return [];
}

function isUniversalSubject(subject) {
  if (!subject) return false;
  return UNIVERSAL_SUBJECTS.has(subject.trim().toLowerCase());
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log(`📚 Reading exam catalog from ${CATALOG_PATH}`);
const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
const exams = JSON.parse(raw);
console.log(`   Found ${exams.length} exams`);

let enriched = 0;
let allCount = 0;
let trackSpecific = 0;
const trackDistribution = {};

for (const exam of exams) {
  const level = (exam.level || '').toLowerCase();
  const subject = (exam.subject || '').toLowerCase();

  // Non-baccalauréat levels → always ALL
  if (level !== 'baccalaureat') {
    exam.tracks = ['ALL'];
    allCount++;
    enriched++;
    continue;
  }

  // Universal subjects → always ALL
  if (isUniversalSubject(exam.subject)) {
    exam.tracks = ['ALL'];
    allCount++;
    enriched++;
    continue;
  }

  // Extract tracks from multiple sources
  const fromTitle = extractTracksFromTitle(exam.exam_title);
  const fromSource = extractTracksFromSource(exam._source_file);
  const fromSections = extractTracksFromSections(exam.sections);
  const fromSubject = getSubjectDefaultTracks(exam.subject);

  // Merge all extracted tracks
  const allTracks = new Set([...fromTitle, ...fromSource, ...fromSections]);

  // Filter out noise — only keep canonical codes
  const validTracks = [...allTracks].filter((t) => VALID_TRACKS.has(t));

  // Remove false positives: "PICCARD", "GRAVIT", "ONDE", "ENTROPIE" etc. were
  // appearing because they matched a code regex. These are already filtered
  // by normalizeTrackCode but double-check.
  const cleanTracks = validTracks.filter((t) => VALID_TRACKS.has(t));

  if (cleanTracks.length > 0) {
    // If ALL canonical tracks are present, just use ALL
    if (cleanTracks.length >= 4) {
      exam.tracks = ['ALL'];
      allCount++;
    } else {
      exam.tracks = cleanTracks.sort();
      trackSpecific++;
      for (const t of cleanTracks) {
        trackDistribution[t] = (trackDistribution[t] || 0) + 1;
      }
    }
  } else if (fromSubject.length > 0 && fromSubject[0] !== 'ALL') {
    // Use subject-level defaults for track-specific subjects with no explicit tracks
    exam.tracks = fromSubject.sort();
    trackSpecific++;
    for (const t of fromSubject) {
      trackDistribution[t] = (trackDistribution[t] || 0) + 1;
    }
  } else {
    // No track info found → default to ALL
    exam.tracks = ['ALL'];
    allCount++;
  }

  enriched++;
}

console.log(`\n✅ Enriched ${enriched} exams:`);
console.log(`   ALL (universal): ${allCount}`);
console.log(`   Track-specific:  ${trackSpecific}`);
console.log(`   Track distribution:`, trackDistribution);

if (DRY_RUN) {
  console.log('\n🔍 DRY RUN — no changes written.');
  // Show a few examples
  console.log('\n── Sample enriched exams (track-specific) ──');
  const samples = exams.filter((e) => e.tracks && !e.tracks.includes('ALL')).slice(0, 10);
  for (const ex of samples) {
    console.log(`  [${ex.level}] ${(ex.subject || '').slice(0, 25).padEnd(25)} tracks: [${ex.tracks.join(', ')}]  title: ${(ex.exam_title || '').slice(0, 50)}`);
  }
} else {
  // Write back
  const output = JSON.stringify(exams);
  fs.writeFileSync(CATALOG_PATH, output, 'utf-8');
  console.log(`\n💾 Written to ${CATALOG_PATH} (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(1)} MB)`);
}
