#!/usr/bin/env python3
"""
Generate question-specific progressive hints for every question in exam_catalog.json.

Uses Google Gemini 2.0 Flash to produce 2-3 unique hints per question that
actually help the student reason toward the correct answer — not boilerplate.

Usage:
    python3 scripts/generate_hints.py [--resume] [--dry-run] [--batch-size N]

Checkpoints progress to scripts/hints_checkpoint.json so it can be resumed.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Config ──────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get(
    "GEMINI_API_KEY", "AIzaSyBA4NHDVyIbnGt7iVfPUJHi7jNMV2Maqbc"
)
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)

CATALOG_PATH = Path("public/exam_catalog.json")
CHECKPOINT_PATH = Path("scripts/hints_checkpoint.json")

BATCH_SIZE = 10         # questions per API call
CONCURRENCY = 4         # parallel API calls
DELAY_BETWEEN = 0.2     # seconds between batches
MAX_RETRIES = 3

# ── Prompt ──────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert tutor creating progressive hints for Haitian baccalauréat exam questions.

For each question, generate exactly 2 or 3 SHORT progressive hints that:
1. Guide the student's thinking WITHOUT revealing the answer
2. Are SPECIFIC to THIS particular question (reference the actual content)
3. Progress from a general nudge → a more specific clue → a near-giveaway

RULES:
- Each hint must be 1 sentence, max 20 words
- Hint 1: Point toward the right topic/concept/era/formula (gentle nudge)
- Hint 2: Give a more specific clue (a key detail, date range, related concept)
- Hint 3 (optional, for hard questions): Almost reveal the answer without stating it
- For math: reference the specific formula or technique needed
- For history/geography: reference the era, region, or key figure
- For science: reference the specific law, reaction type, or biological process
- For languages: give grammatical or contextual clues
- For MCQ with options: help eliminate wrong choices without naming the correct one
- NEVER repeat the question text back
- NEVER use generic advice like "read carefully" or "check your answer"
- Write hints in the SAME LANGUAGE as the question (French, English, Spanish, or Kreyòl)
- Use $...$ for any math/formulas in hints

Return ONLY a JSON array where each element corresponds to a question (same order).
Each element is an array of 2-3 hint strings.
Example: [["Hint1 for Q1", "Hint2 for Q1"], ["Hint1 for Q2", "Hint2 for Q2", "Hint3 for Q2"]]"""


def build_question_block(q, idx):
    """Format a question for the prompt."""
    parts = [f"Q{idx + 1}:"]
    parts.append(f"  Subject: {q.get('_subject', '?')}")
    parts.append(f"  Type: {q.get('type', '?')}")
    parts.append(f"  Question: {q.get('question', '')[:500]}")

    # Include answer info so hints can be crafted to guide toward it
    correct = q.get('correct')
    model_ans = q.get('model_answer')
    if correct:
        parts.append(f"  Correct answer: {str(correct)[:200]}")
    elif model_ans:
        parts.append(f"  Answer: {str(model_ans)[:200]}")
    elif q.get('answer_parts'):
        ap = q['answer_parts']
        labels = [f"{p.get('label','')}: {p.get('answer','')}" for p in ap[:5]]
        parts.append(f"  Answer parts: {'; '.join(labels)}")

    if q.get('options') and isinstance(q['options'], (list, dict)):
        opts = q['options'] if isinstance(q['options'], list) else list(q['options'].values())
        opts = opts[:6]
        parts.append(f"  Options: {' | '.join(str(o) for o in opts)}")

    return "\n".join(parts)


# ── API call ────────────────────────────────────────────────────────────────

def call_gemini(questions_block):
    """Call Gemini with a batch of questions, return list of hint arrays."""
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{questions_block}"}],
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        },
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        GEMINI_URL,
        data=data,
        headers={"Content-Type": "application/json"},
    )

    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))

            text = (
                body.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )

            # Parse JSON from response (strip markdown fences if present)
            text = text.strip()
            if text.startswith("```"):
                text = re.sub(r"^```\w*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)

            # Fix invalid JSON escapes from LaTeX (e.g. \frac → \\frac)
            # JSON only allows: \" \\ \/ \b \f \n \r \t \uXXXX
            text = re.sub(
                r'\\(?!["\\/bfnrtu])',
                r'\\\\',
                text,
            )

            hints = json.loads(text)
            if isinstance(hints, list):
                return hints

            raise ValueError(f"Expected list, got {type(hints)}")

        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            status = getattr(e, "code", None)
            if status == 429 or status == 503:
                wait = (attempt + 1) * 5
                print(f"    ⏳ Rate limited ({status}), waiting {wait}s...")
                time.sleep(wait)
                continue
            if status == 400:
                # Bad request — likely content too long, skip
                print(f"    ⚠️  400 error, skipping batch")
                return None
            raise
        except (json.JSONDecodeError, ValueError, KeyError, IndexError) as e:
            if attempt < MAX_RETRIES - 1:
                print(f"    ⚠️  Parse error ({e}), retrying...")
                time.sleep(1)
                continue
            print(f"    ❌ Failed to parse after {MAX_RETRIES} attempts")
            return None

    return None


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate question-specific hints")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without calling API")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args()

    # Load catalog
    print(f"📂 Loading {CATALOG_PATH}...")
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)

    # Build flat list of (exam_idx, section_idx, question_idx, question)
    all_questions = []
    for ei, exam in enumerate(catalog):
        subj = exam.get("subject", "?")
        for si, sec in enumerate(exam.get("sections", [])):
            for qi, q in enumerate(sec.get("questions", [])):
                q["_subject"] = subj
                all_questions.append((ei, si, qi, q))

    print(f"📊 Total questions: {len(all_questions)}")

    # Load checkpoint
    done = {}
    if args.resume and CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH) as f:
            done = json.load(f)
        print(f"🔄 Resuming — {len(done)} questions already done")

    # Filter to pending
    pending = [
        (ei, si, qi, q)
        for ei, si, qi, q in all_questions
        if f"{ei}-{si}-{qi}" not in done
    ]
    print(f"⏳ Pending: {len(pending)} questions")

    if args.dry_run:
        print("\n🔍 Dry run — showing first batch:")
        batch = pending[: args.batch_size]
        for i, (ei, si, qi, q) in enumerate(batch):
            print(build_question_block(q, i))
            print()
        return

    # Process in batches
    batches = [
        pending[i : i + args.batch_size]
        for i in range(0, len(pending), args.batch_size)
    ]
    print(f"📦 {len(batches)} batches of up to {args.batch_size} questions")
    print()

    success_count = 0
    fail_count = 0
    start_time = time.time()

    for bi, batch in enumerate(batches):
        # Build prompt
        blocks = []
        for i, (ei, si, qi, q) in enumerate(batch):
            blocks.append(build_question_block(q, i))
        prompt_text = "\n\n".join(blocks)

        pct = (bi / len(batches)) * 100
        elapsed = time.time() - start_time
        rate = success_count / max(elapsed / 60, 0.01)
        print(
            f"  [{bi + 1}/{len(batches)}] ({pct:.0f}%) "
            f"Generating hints for {len(batch)} questions... "
            f"({success_count} done, {rate:.0f} q/min)",
            end="",
            flush=True,
        )

        hints_list = call_gemini(prompt_text)

        if hints_list and len(hints_list) >= len(batch):
            for i, (ei, si, qi, q) in enumerate(batch):
                h = hints_list[i]
                if isinstance(h, list) and len(h) >= 2:
                    key = f"{ei}-{si}-{qi}"
                    done[key] = h
                    success_count += 1
                else:
                    fail_count += 1
            print(f" ✅")
        elif hints_list and len(hints_list) < len(batch):
            # Partial result — save what we got
            for i in range(min(len(hints_list), len(batch))):
                ei, si, qi, q = batch[i]
                h = hints_list[i]
                if isinstance(h, list) and len(h) >= 2:
                    key = f"{ei}-{si}-{qi}"
                    done[key] = h
                    success_count += 1
            print(f" ⚠️ partial ({len(hints_list)}/{len(batch)})")
            fail_count += len(batch) - len(hints_list)
        else:
            fail_count += len(batch)
            print(f" ❌")

        # Save checkpoint every 5 batches
        if (bi + 1) % 5 == 0 or bi == len(batches) - 1:
            with open(CHECKPOINT_PATH, "w") as f:
                json.dump(done, f)

        # Rate limit
        time.sleep(DELAY_BETWEEN)

    # Final checkpoint
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump(done, f)

    elapsed = time.time() - start_time
    print(f"\n✅ Done! {success_count} hints generated, {fail_count} failed")
    print(f"⏱️  {elapsed:.0f}s ({success_count / max(elapsed / 60, 0.01):.0f} q/min)")

    # Apply hints to catalog
    print(f"\n📝 Applying hints to {CATALOG_PATH}...")
    applied = 0
    for ei, exam in enumerate(catalog):
        for si, sec in enumerate(exam.get("sections", [])):
            for qi, q in enumerate(sec.get("questions", [])):
                key = f"{ei}-{si}-{qi}"
                if key in done:
                    q["hints"] = done[key]
                    applied += 1
                # Clean up temp field
                q.pop("_subject", None)

    print(f"   Applied {applied} hint sets")

    # Write updated catalog
    print(f"💾 Saving {CATALOG_PATH}...")
    with open(CATALOG_PATH, "w") as f:
        json.dump(catalog, f, ensure_ascii=False)
    print(f"✅ Saved! File size: {CATALOG_PATH.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
