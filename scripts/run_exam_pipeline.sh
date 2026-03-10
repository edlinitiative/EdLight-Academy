#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_exam_pipeline.sh
# ────────────────────
# Full Audit → Deterministic Fix → Re-audit pipeline for public/exam_catalog.json.
#
# All changes are left as a plain `git diff` — nothing is committed automatically.
# Open a PR after reviewing the diff to get team sign-off before merging.
#
# Usage:
#   bash scripts/run_exam_pipeline.sh              # deterministic fixes only
#   bash scripts/run_exam_pipeline.sh --gemini     # also run Gemini structure fixes
#                                                  #   (requires GEMINI_API_KEY env var)
#   bash scripts/run_exam_pipeline.sh --audit-only # audit only, no fixes
#
# Artifacts are written to: artifacts/exam_pipeline/<timestamp>/
#   exam_catalog_original.json  — snapshot before any changes
#   audit_before.json / .md     — issues before fixes
#   audit_after.json / .md      — issues after fixes (only if fixes ran)
#   fix_all_exams.log           — output from fix_all_exams.py
#   format_exam_text.log        — output from format_exam_text.py
#   fix_exam_structure.log      — output from fix_exam_structure.py (if --gemini)
#
# Exit codes:
#   0 = no critical issues remaining after fixes (safe to open PR)
#   1 = critical issues remain (check audit_after.md for details)
#   2 = catalog unreadable / pipeline setup error
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_BASE="$REPO_ROOT/artifacts/exam_pipeline"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
RUN_DIR="$ARTIFACTS_BASE/$TIMESTAMP"

ENABLE_GEMINI=false
AUDIT_ONLY=false

for arg in "$@"; do
  if [[ "$arg" == "--gemini"     ]]; then ENABLE_GEMINI=true; fi
  if [[ "$arg" == "--audit-only" ]]; then AUDIT_ONLY=true;   fi
done

# ─────────────────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  EdLight Exam Pipeline"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  Run dir: $RUN_DIR"
  if [[ "$AUDIT_ONLY" == "true" ]]; then
    echo "  Mode: AUDIT ONLY (no fixes)"
  elif [[ "$ENABLE_GEMINI" == "true" ]]; then
    echo "  Mode: Full (deterministic + Gemini structure fixes)"
  else
    echo "  Mode: Deterministic fixes only (use --gemini to also fix structure)"
  fi
  echo "════════════════════════════════════════════════════════════"
}

check_deps() {
  local missing=false
  command -v node    >/dev/null 2>&1 || { echo "❌ node is not installed"; missing=true; }
  command -v python3 >/dev/null 2>&1 || { echo "❌ python3 is not installed"; missing=true; }
  if [[ "$missing" == "true" ]]; then exit 2; fi
}

# ─────────────────────────────────────────────────────────────────────────────

print_header
check_deps

mkdir -p "$RUN_DIR"
cd "$REPO_ROOT"

CATALOG="public/exam_catalog.json"

# ── Step 0: Snapshot ─────────────────────────────────────────────────────────
echo ""
echo "── Step 0: Snapshot ──"
cp "$CATALOG" "$RUN_DIR/exam_catalog_original.json"
ORIGINAL_SIZE=$(wc -c < "$CATALOG" | tr -d ' ')
ORIGINAL_LINES=$(wc -l < "$CATALOG" | tr -d ' ')
echo "   ✅ Saved snapshot ($ORIGINAL_LINES lines, $(( ORIGINAL_SIZE / 1024 )) KB)"

# ── Step 1: Audit (before) ───────────────────────────────────────────────────
echo ""
echo "── Step 1: Audit (before fixes) ──"
set +e
node scripts/audit_exams.mjs --out "$RUN_DIR/audit_before"
AUDIT_BEFORE_EXIT=$?
set -e

if [[ $AUDIT_BEFORE_EXIT -eq 2 ]]; then
  echo "❌ Catalog could not be read or parsed. Aborting."
  exit 2
fi

if [[ "$AUDIT_ONLY" == "true" ]]; then
  echo ""
  echo "── Audit-only mode — skipping fixes ──"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  if [[ $AUDIT_BEFORE_EXIT -eq 0 ]]; then
    echo "  ✅ AUDIT PASSED — no critical issues found."
  else
    echo "  🔴 AUDIT FOUND CRITICAL ISSUES."
    echo "  Review: $RUN_DIR/audit_before.md"
    echo "  Then run without --audit-only to apply deterministic fixes."
  fi
  echo "════════════════════════════════════════════════════════════"
  exit $AUDIT_BEFORE_EXIT
fi

# ── Step 2: Deterministic fixes ──────────────────────────────────────────────
echo ""
echo "── Step 2: Deterministic fixes ──"

echo ""
echo "  [2a] Ensure stable exam IDs (ensure_exam_ids.mjs)…"
node scripts/ensure_exam_ids.mjs

echo ""
echo "  [2b] Enrich track metadata (add_tracks_to_exams.js)…"
node scripts/add_tracks_to_exams.js

echo ""
echo "  [2c] Fix question types, MCQ correct keys, LaTeX in language exams (fix_all_exams.py)…"
python3 scripts/fix_all_exams.py 2>&1 | tee "$RUN_DIR/fix_all_exams.log"
# fix_all_exams.py overwrites .bak — back up the .bak too for reference
[[ -f "public/exam_catalog.json.bak" ]] && cp "public/exam_catalog.json.bak" "$RUN_DIR/exam_catalog_after_fix_all.json.bak"

echo ""
echo "  [2d] Text formatting cleanup — deterministic pass (format_exam_text.py)…"
python3 scripts/format_exam_text.py 2>&1 | tee "$RUN_DIR/format_exam_text.log"

echo ""
echo "  [2e] Fix remaining audit warnings — TF mapping, MCQ text-not-key, scaffold truncation (fix_audit_warnings.py)…"
python3 scripts/fix_audit_warnings.py 2>&1 | tee "$RUN_DIR/fix_audit_warnings.log"

echo "   ✅ Deterministic fixes complete."

# ── Step 3: Optional — Gemini-assisted structure fixes ───────────────────────
if [[ "$ENABLE_GEMINI" == "true" ]]; then
  echo ""
  echo "── Step 3: Gemini structure fixes ──"
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    echo "  ⚠️  GEMINI_API_KEY is not set in the environment — skipping Gemini step."
    echo "       Export it first:  export GEMINI_API_KEY=<your-key>"
  else
    echo "  Running fix_exam_structure.py (Gemini-powered section restructuring)…"
    echo "  ⚠️  This calls the Gemini API and may take several minutes for large catalogs."
    python3 scripts/fix_exam_structure.py 2>&1 | tee "$RUN_DIR/fix_exam_structure.log"
    echo "  ✅ Gemini structure fixes applied."
  fi
else
  echo ""
  echo "── Step 3: Gemini structure fixes — SKIPPED ──"
  echo "   (Re-run with --gemini to also fix section structure issues)"
fi

# ── Step 4: Audit (after) ────────────────────────────────────────────────────
echo ""
echo "── Step 4: Audit (after fixes) ──"
set +e
node scripts/audit_exams.mjs --out "$RUN_DIR/audit_after"
AUDIT_AFTER_EXIT=$?
set -e

# ── Step 5: Diff summary ─────────────────────────────────────────────────────
echo ""
echo "── Step 5: Change summary ──"

AFTER_LINES=$(wc -l < "$CATALOG")
AFTER_SIZE=$(wc -c < "$CATALOG")
DIFF_LINES=$(( AFTER_LINES - ORIGINAL_LINES ))
DIFF_SIGN="+"
[[ $DIFF_LINES -lt 0 ]] && DIFF_SIGN=""

echo ""
echo "   exam_catalog.json:"
echo "     Before: $ORIGINAL_LINES lines  ($(( ORIGINAL_SIZE / 1024 )) KB)"
echo "     After:  $AFTER_LINES lines  ($(( AFTER_SIZE / 1024 )) KB)  [${DIFF_SIGN}${DIFF_LINES} lines]"
echo ""
echo "   Artifacts:"
echo "     $RUN_DIR/exam_catalog_original.json  — original snapshot"
echo "     $RUN_DIR/audit_before.md / .json     — issues before fixes"
echo "     $RUN_DIR/audit_after.md / .json      — issues after fixes"
echo "     $RUN_DIR/*.log                       — fix script output logs"
echo ""
echo "   Review all changes:"
echo "     git diff public/exam_catalog.json"
echo "     git diff --stat public/exam_catalog.json"
echo ""
echo "   To undo all changes (revert to snapshot):"
echo "     cp $RUN_DIR/exam_catalog_original.json public/exam_catalog.json"

# ── Step 6: Final verdict ─────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
if [[ $AUDIT_AFTER_EXIT -eq 0 ]]; then
  echo "  ✅ PIPELINE PASSED"
  echo "  No critical issues remain. Run 'git diff public/exam_catalog.json',"
  echo "  then open a PR for team review."
elif [[ $AUDIT_BEFORE_EXIT -ne 0 && $AUDIT_AFTER_EXIT -ne 0 ]]; then
  echo "  ⚠️  PIPELINE PARTIAL — some critical issues remain."
  echo "  Check $RUN_DIR/audit_after.md for the remaining issues."
  echo "  Options:"
  echo "    • Re-run with --gemini to apply Gemini-assisted structure fixes"
  echo "    • Fix manually and re-run: node scripts/audit_exams.mjs"
else
  echo "  🔴 PIPELINE FAILED — critical issues remain after all fixes."
  echo "  Check: $RUN_DIR/audit_after.md"
fi
echo "════════════════════════════════════════════════════════════"

exit $AUDIT_AFTER_EXIT
