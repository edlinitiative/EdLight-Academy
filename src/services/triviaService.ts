/**
 * Trivia / Gamification Service
 * ─────────────────────────────
 * Turns trivia play into a progression economy: XP, levels, a once-a-day Daily
 * Challenge, per-category bests, and (opt-in) weekly leaderboard submission.
 *
 * Firestore path: users/{uid}/gamification/profile
 *   {
 *     xp, totalGames, totalCorrect, totalQuestions, bestScorePct,
 *     byCategory: { [catId]: { games, correct, questions, bestPct } },
 *     dailyChallenge: { date, completed, score, total, xpEarned },
 *     lastPlayedDate,
 *     leaderboard: { optedIn, displayName, school, city },
 *     updatedAt,
 *   }
 *
 * Trivia counts as platform activity, so every recorded round also pings the
 * global streak service.
 */

import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { recordActivity as recordStreakActivity, todayStr } from './streakService';
import { addWeeklyXp, getWeeklyTop, isValidAlias } from './leaderboardService';
import { notifyLeaderboardRank } from './notificationService';

// ─── XP & levels ────────────────────────────────────────────────────────────

/** XP awarded to reach level 2 (the curve scales triangularly from here). */
const LEVEL_BASE = 100;

/**
 * Derive level + progress from a cumulative XP total.
 *
 * Cumulative XP required to *reach* level L = LEVEL_BASE · (L−1)·L / 2
 * (a triangular curve: 0, 100, 300, 600, 1000, 1500 …). Inverting gives the
 * current level in closed form.
 */
export function levelInfo(xp = 0) {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor((1 + Math.sqrt(1 + (8 * safeXp) / LEVEL_BASE)) / 2);
  const curFloor = (LEVEL_BASE * (level - 1) * level) / 2;
  const nextFloor = (LEVEL_BASE * level * (level + 1)) / 2;
  const span = nextFloor - curFloor;
  const into = safeXp - curFloor;
  return {
    level,
    xp: safeXp,
    xpIntoLevel: into,
    xpForNext: span,
    xpToNext: Math.max(0, nextFloor - safeXp),
    progressPct: span > 0 ? Math.round((into / span) * 100) : 0,
  };
}

/**
 * XP for a finished round. Rewards correctness, a perfect-round bonus, and a
 * once-daily bonus for the Daily Challenge.
 */
export function computeXpEarned({ score = 0, total = 0, isDaily = false, dailyAlreadyDone = false }) {
  const correct = Math.max(0, score);
  const base = correct * 10;
  const perfect = total > 0 && correct === total ? 25 : 0;
  const dailyBonus = isDaily && !dailyAlreadyDone ? 50 : 0;
  return base + perfect + dailyBonus;
}

// ─── Profile shape ──────────────────────────────────────────────────────────

export function defaultTriviaProfile() {
  return {
    xp: 0,
    totalGames: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    bestScorePct: 0,
    byCategory: {},
    dailyChallenge: { date: null, completed: false, score: 0, total: 0, xpEarned: 0 },
    // Which of today's daily quests have already been PAID. `claimed` is an
    // ARRAY on purpose: Firestore's {merge:true} replaces arrays wholesale but
    // deep-merges maps key-by-key, so a map would carry yesterday's quest ids
    // into today's document forever.
    dailyQuests: { date: null, claimed: [], xpEarned: 0 },
    lastPlayedDate: null,
    games: { gamesPlayed: 0, highScores: {} },
    leaderboard: { optedIn: false, displayName: '', school: null, city: null, department: null },
  };
}

function profileRef(uid) {
  return doc(db, 'users', uid, 'gamification', 'profile');
}

/** Load the gamification profile (defaults when none exists / offline). */
export async function loadTriviaProfile(uid) {
  if (!uid) return defaultTriviaProfile();
  try {
    const snap = await getDoc(profileRef(uid));
    if (!snap.exists()) return defaultTriviaProfile();
    const base = defaultTriviaProfile();
    const data = snap.data() || {};
    return {
      ...base,
      ...data,
      byCategory: { ...base.byCategory, ...(data.byCategory || {}) },
      dailyChallenge: { ...base.dailyChallenge, ...(data.dailyChallenge || {}) },
      dailyQuests: { ...base.dailyQuests, ...(data.dailyQuests || {}) },
      games: { ...base.games, ...(data.games || {}) },
      leaderboard: { ...base.leaderboard, ...(data.leaderboard || {}) },
    };
  } catch (err) {
    console.error('[Trivia] loadTriviaProfile error:', err);
    return defaultTriviaProfile();
  }
}

/** Daily-challenge status derived from a profile + today's date. */
export function getDailyChallengeState(profile, today = todayStr()) {
  const dc = profile?.dailyChallenge;
  const completedToday = !!dc && dc.date === today && !!dc.completed;
  return {
    date: today,
    completedToday,
    score: completedToday ? dc.score : null,
    total: completedToday ? dc.total : null,
    xpEarned: completedToday ? dc.xpEarned : 0,
  };
}

// ─── Daily quests ───────────────────────────────────────────────────────────
//
// The quests themselves — which ones a student gets, and how far along each
// one is — are DERIVED in services/dailyQuests.ts from records the app already
// writes. Nothing about a quest's progress is stored.
//
// What lives here is the one thing that cannot be derived: whether a finished
// quest has already been PAID. XP is durable state, so "did we already add
// those 20 XP?" is a fact about our own ledger, not about the student's day.
// It belongs on the document that owns the XP it protects — this one — and it
// is written by the service that owns XP, not around it.

/** Quest ids already paid for `today`. `{}` yesterday's entry, so the day rolls over. */
export function getDailyQuestClaims(profile, today = todayStr()): string[] {
  const dq = profile?.dailyQuests;
  if (!dq || dq.date !== today) return [];
  return Array.isArray(dq.claimed) ? dq.claimed.filter((id) => typeof id === 'string') : [];
}

/**
 * Pay one finished daily quest, once.
 *
 * Idempotent by re-reading the profile: the claim list is checked against the
 * stored copy, not against whatever the caller believed, so a double click, a
 * second tab or a replayed effect adds nothing. Returns `{ awarded: 0 }` when
 * the quest was already paid or the amount is not a positive number.
 *
 * Like every other XP award in this file (`recordTriviaResult`,
 * `recordGameResult`) it also pings the global streak and, for opted-in
 * players, the weekly board — a quest is finished because the student did real
 * work today, and it would be strange for that work to move the XP total and
 * not the day count. Worth noting because the practice quizzes that resolve a
 * review question write nothing else at all: DirectBankQuiz records the missed
 * question and stops, so before this, an hour of /revision left the streak
 * untouched.
 */
export async function claimQuestXp(uid, { questId, xp, today = todayStr() }) {
  const amount = Math.max(0, Math.floor(Number(xp) || 0));
  const none = { awarded: 0, xp: 0, leveledUp: false, prevLevel: 1, newLevel: 1, profile: null };
  if (!uid || !questId || amount <= 0) return none;

  try {
    const current = await loadTriviaProfile(uid);
    const alreadyClaimed = getDailyQuestClaims(current, today);
    if (alreadyClaimed.includes(questId)) {
      return { ...none, xp: current.xp || 0, profile: current };
    }

    const prevLevel = levelInfo(current.xp).level;
    const claimed = [...alreadyClaimed, questId];
    const dailyQuests = {
      date: today,
      claimed,
      // Banked today. Purely informational — the quest list re-derives its own
      // total from `claimed`, so nothing depends on this staying in step.
      xpEarned: (alreadyClaimed.length === 0 ? 0 : current.dailyQuests?.xpEarned || 0) + amount,
    };
    const nextXp = (current.xp || 0) + amount;

    await setDoc(
      profileRef(uid),
      { xp: nextXp, dailyQuests, updatedAt: serverTimestamp() },
      { merge: true },
    );

    const newLevelInfo = levelInfo(nextXp);
    try { await recordStreakActivity(uid); } catch {}

    if (current.leaderboard?.optedIn) {
      try {
        await addWeeklyXp(uid, amount, {
          displayName: current.leaderboard.displayName || null,
          level: newLevelInfo.level,
          school: current.leaderboard.school || null,
          city: current.leaderboard.city || null,
          department: current.leaderboard.department || null,
        });
      } catch { /* the board is best-effort; the XP is already banked */ }
    }

    return {
      awarded: amount,
      xp: nextXp,
      leveledUp: newLevelInfo.level > prevLevel,
      prevLevel,
      newLevel: newLevelInfo.level,
      profile: { ...current, xp: nextXp, dailyQuests },
    };
  } catch (err) {
    console.error('[Trivia] claimQuestXp error:', err);
    return none;
  }
}

// ─── Recording a round ──────────────────────────────────────────────────────

/**
 * Persist a finished trivia round and update XP / aggregates / daily state.
 *
 * @returns {{ profile, xpEarned, leveledUp, prevLevel, newLevel }}
 */
export async function recordTriviaResult(uid, { category, score = 0, total = 0, isDaily = false }) {
  if (!uid) {
    const xpEarned = computeXpEarned({ score, total, isDaily });
    return { profile: defaultTriviaProfile(), xpEarned, leveledUp: false, prevLevel: 1, newLevel: 1 };
  }

  const today = todayStr();
  try {
    const current = await loadTriviaProfile(uid);
    const prevLevel = levelInfo(current.xp).level;

    const dailyAlreadyDone =
      isDaily && current.dailyChallenge?.date === today && current.dailyChallenge?.completed;

    const xpEarned = computeXpEarned({ score, total, isDaily, dailyAlreadyDone });
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    // Per-category aggregates
    const catKey = category || 'mixed';
    const prevCat = current.byCategory[catKey] || { games: 0, correct: 0, questions: 0, bestPct: 0 };
    const nextCat = {
      games: prevCat.games + 1,
      correct: prevCat.correct + score,
      questions: prevCat.questions + total,
      bestPct: Math.max(prevCat.bestPct || 0, pct),
    };

    const updated = {
      ...current,
      xp: (current.xp || 0) + xpEarned,
      totalGames: (current.totalGames || 0) + 1,
      totalCorrect: (current.totalCorrect || 0) + score,
      totalQuestions: (current.totalQuestions || 0) + total,
      bestScorePct: Math.max(current.bestScorePct || 0, pct),
      byCategory: { ...current.byCategory, [catKey]: nextCat },
      lastPlayedDate: today,
    };

    if (isDaily) {
      updated.dailyChallenge = {
        date: today,
        completed: true,
        score,
        total,
        xpEarned: dailyAlreadyDone ? current.dailyChallenge?.xpEarned || 0 : xpEarned,
      };
    }

    await setDoc(
      profileRef(uid),
      { ...updated, updatedAt: serverTimestamp() },
      { merge: true },
    );

    const newLevelInfo = levelInfo(updated.xp);

    // Trivia is platform activity → keep the streak alive.
    try { await recordStreakActivity(uid); } catch {}

    // Opt-in weekly leaderboard submission + rank notification. addWeeklyXp now
    // POSTs to /api/leaderboard/award, which increments BOTH the weekly and the
    // all-time entries by the earned delta — so no separate all-time write.
    if (updated.leaderboard?.optedIn && xpEarned > 0) {
      await addWeeklyXp(uid, xpEarned, {
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: updated.leaderboard.department || null,
      });
      // Best-effort rank notification — fire and forget. Re-rank over
      // valid-alias entries exactly as the visible board does, so the notified
      // rank matches what the learner sees when they open the leaderboard
      // (the old raw positional rank counted hidden aliasless entries).
      getWeeklyTop(50).then((top) => {
        const ranked = top
          .filter((e) => isValidAlias(e.displayName))
          .map((e, i) => ({ ...e, rank: i + 1 }));
        const entry = ranked.find((e) => e.id === uid);
        if (entry && entry.rank <= 10) notifyLeaderboardRank(uid, entry.rank).catch(() => {});
      }).catch(() => {});
    }

    return {
      profile: updated,
      xpEarned,
      leveledUp: newLevelInfo.level > prevLevel,
      prevLevel,
      newLevel: newLevelInfo.level,
    };
  } catch (err) {
    console.error('[Trivia] recordTriviaResult error:', err);
    const xpEarned = computeXpEarned({ score, total, isDaily });
    return { profile: defaultTriviaProfile(), xpEarned, leveledUp: false, prevLevel: 1, newLevel: 1 };
  }
}

// ─── Arcade games (non-trivia) XP ────────────────────────────────────────────

/**
 * XP for an arcade game round: accuracy-scaled up to 40, +10 for a perfect
 * run. Deliberately below the trivia rate (10/correct) since arcade rounds
 * are shorter and infinitely repeatable.
 */
export function computeGameXp({ score = 0, maxScore = 0 }) {
  if (!maxScore || score <= 0) return 0;
  const pct = Math.max(0, Math.min(1, score / maxScore));
  return Math.round(pct * 40) + (pct >= 1 ? 10 : 0);
}

/**
 * Persist a finished arcade round: XP, games-played counter, per-game high
 * score, streak, and (for opted-in players) the weekly + all-time boards.
 * Mirrors recordTriviaResult's contract so results screens can reuse it.
 */
export async function recordGameResult(uid, { gameId, score = 0, maxScore = 0 }) {
  const xpEarned = computeGameXp({ score, maxScore });
  try {
    const current = await loadTriviaProfile(uid);
    const prevLevel = levelInfo(current.xp).level;
    const games = current.games || { gamesPlayed: 0, highScores: {} };
    const updated = {
      ...current,
      xp: (current.xp || 0) + xpEarned,
      games: {
        gamesPlayed: (games.gamesPlayed || 0) + 1,
        highScores: {
          ...(games.highScores || {}),
          [gameId]: Math.max(games.highScores?.[gameId] || 0, score),
        },
      },
    };
    await setDoc(
      profileRef(uid),
      { xp: updated.xp, games: updated.games, updatedAt: serverTimestamp() },
      { merge: true },
    );

    const newLevelInfo = levelInfo(updated.xp);
    try { await recordStreakActivity(uid); } catch {}

    // A single server-authoritative award increments the weekly + all-time
    // entries by the earned delta AND claims the per-game record (passed via
    // gameId/score) in one POST /api/leaderboard/award. xpEarned === 0 implies
    // score <= 0, so there's no valid record to claim in that case anyway.
    if (updated.leaderboard?.optedIn && xpEarned > 0) {
      await addWeeklyXp(uid, xpEarned, {
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: updated.leaderboard.department || null,
        gameId,
        score,
      });
    }

    return {
      profile: updated,
      xpEarned,
      leveledUp: newLevelInfo.level > prevLevel,
      prevLevel,
      newLevel: newLevelInfo.level,
    };
  } catch (err) {
    console.error('[Trivia] recordGameResult error:', err);
    return { profile: defaultTriviaProfile(), xpEarned, leveledUp: false, prevLevel: 1, newLevel: 1 };
  }
}

/**
 * Opt in/out of the leaderboard and set the public alias / school. When opting
 * in we also seed/refresh this week's entry so the learner shows up immediately.
 */
export async function setLeaderboardOptIn(uid, { optedIn, displayName, school, city, department }: any) {
  if (!uid) return null;
  try {
    const current = await loadTriviaProfile(uid);
    const alias = displayName ?? current.leaderboard?.displayName;
    const leaderboard = {
      optedIn: !!optedIn,
      // Letter-less pseudos (".") are stored as null — the board hides them
      // and the owner gets a "choose a pseudo" prompt instead.
      displayName: isValidAlias(alias) ? alias : null,
      school: school !== undefined ? school : current.leaderboard?.school ?? null,
      city: city !== undefined ? city : current.leaderboard?.city ?? null,
      department: department !== undefined ? department : current.leaderboard?.department ?? null,
    };
    await setDoc(profileRef(uid), { leaderboard, updatedAt: serverTimestamp() }, { merge: true });

    if (leaderboard.optedIn) {
      const { updateEntryProfile } = await import('./leaderboardService');
      await updateEntryProfile(uid, {
        displayName: leaderboard.displayName,
        level: levelInfo(current.xp).level,
        school: leaderboard.school,
        city: leaderboard.city,
        department: leaderboard.department,
      });
    }
    return { ...current, leaderboard };
  } catch (err) {
    console.error('[Trivia] setLeaderboardOptIn error:', err);
    return null;
  }
}

/**
 * Set the learner's school (and its département) WITHOUT touching their
 * leaderboard opt-in. The sign-in school step asks everyone, including people
 * who never opted into the public board; saving a school must not publish them.
 * If they are already on the board, their entry picks the school up at once.
 */
export async function setMySchool(uid, { school, department }: { school: string | null; department?: string | null }) {
  if (!uid) return null;
  const current = await loadTriviaProfile(uid);
  return setLeaderboardOptIn(uid, {
    optedIn: !!current.leaderboard?.optedIn,
    school,
    ...(department !== undefined ? { department } : {}),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIVIA CONTENT (categories + questions) — Firestore overlay of static banks
// ═══════════════════════════════════════════════════════════════════════════
//
// SAFETY MODEL
// ────────────
// The live game NEVER depends on these reads succeeding. Every read below is
// defensive: on empty/error it returns an empty shape ([] or {}) and logs a
// warning, so callers (useTriviaContent) can fall back to the static banks in
// src/data/triviaData.ts. The static data is the floor; Firestore is an
// optional overlay.
//
// Three categories are CODE-GENERATED from country data (capitals / currencies
// / flags) and are intentionally NOT seeded as editable questions — they always
// render from code. Their category *metadata* is still written so the admin can
// see them, flagged with `generated: true`.

/** Categories whose questions are built in code and must stay in code. */
export const GENERATED_CATEGORY_IDS = ['capitals', 'currencies', 'flags'];

const CATEGORIES_COLLECTION = 'trivia_categories';
const QUESTIONS_COLLECTION = 'trivia_questions';

const isGeneratedCategory = (id: string) => GENERATED_CATEGORY_IDS.includes(id);

// ── In-memory read cache ────────────────────────────────────────────────────
// /jeux used to re-read the ENTIRE trivia bank (both collections) on every
// visit. These docs carry BOTH languages, so the cached payload is language
// agnostic — switching fr↔ht needs no re-fetch. Empty/failed reads are NOT
// cached, so the static fallback keeps working and the next visit retries.
const TRIVIA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _catsCache: { at: number; data: any[] } | null = null;
let _catsInflight: Promise<any[]> | null = null;
let _qsCache: { at: number; data: Record<string, any[]> } | null = null;
let _qsInflight: Promise<Record<string, any[]>> | null = null;

/** Drop the cached banks (call after an admin write so edits show immediately). */
export function clearTriviaCache(): void {
  _catsCache = null;
  _catsInflight = null;
  _qsCache = null;
  _qsInflight = null;
}

/**
 * Load all category docs, sorted by `order` then id.
 * Returns [] on empty or error (never throws). Cached for TTL_MS.
 */
export async function loadTriviaCategories(): Promise<any[]> {
  if (_catsCache && Date.now() - _catsCache.at < TRIVIA_CACHE_TTL_MS) return _catsCache.data;
  if (_catsInflight) return _catsInflight;
  _catsInflight = (async () => {
    try {
      const snap = await getDocs(collection(db, CATEGORIES_COLLECTION));
      if (snap.empty) return [];
      const cats: any[] = [];
      snap.forEach((d) => cats.push({ id: d.id, ...d.data() }));
      cats.sort((a, b) => {
        const oa = typeof a.order === 'number' ? a.order : 9999;
        const ob = typeof b.order === 'number' ? b.order : 9999;
        if (oa !== ob) return oa - ob;
        return String(a.id).localeCompare(String(b.id));
      });
      _catsCache = { at: Date.now(), data: cats };
      return cats;
    } catch (err) {
      console.warn('[triviaService] loadTriviaCategories failed:', err);
      return [];
    } finally {
      _catsInflight = null;
    }
  })();
  return _catsInflight;
}

/**
 * Coerce ONE stored question into the shape the game grades against, or null.
 *
 * This is the trust boundary. The game grades with `idx === q.answer` — strict
 * equality against a number — and `loadTriviaQuestions` used to spread raw
 * Firestore data straight through. So a doc whose `answer` is the STRING "2"
 * makes `2 === "2"` false for every option: the student picks the right one,
 * is told they are wrong, and no option is ever marked correct. That is not a
 * hypothetical shape for this database — the quiz collection already stores
 * `options` as a JSON string and `correct_answer` as a letter, and the trivia
 * writers have always coerced on the way IN while nothing coerced on the way
 * OUT.
 *
 * Accepts the shapes that can be resolved without guessing:
 *   • a real index (2)
 *   • a numeric string ("2")
 *   • a letter ("A".."D", any case) — the A/B/C/D the UI itself labels options with
 *   • the answer's own text, matched against the options
 *
 * Returns null for anything still ambiguous, and the caller DROPS it. That is
 * the whole point: the old write-side fallback was `: 0`, which silently makes
 * the first option "correct" and is precisely how a bank fills with questions
 * that mark a right answer wrong. Serving fewer questions is recoverable;
 * teaching a student the wrong answer is not.
 */
export function normalizeTriviaQuestion(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;

  // `options` may arrive as a JSON string — the shape the quiz collection uses.
  let options: unknown = raw.options;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { return null; }
  }
  if (!Array.isArray(options)) return null;
  const opts = options.map((o) => (typeof o === 'string' ? o : String(o ?? ''))).map((o) => o.trim());
  if (opts.length < 2 || opts.some((o) => !o)) return null;

  const a = raw.answer;
  let index: number | null = null;

  if (typeof a === 'number' && Number.isInteger(a)) {
    index = a;
  } else if (typeof a === 'string') {
    const t = a.trim();
    if (/^\d+$/.test(t)) {
      index = Number(t);
    } else if (/^[a-z]$/i.test(t)) {
      index = t.toUpperCase().charCodeAt(0) - 65;
    } else {
      // The answer written out in full: match it against the options.
      const norm = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
      const hit = opts.findIndex((o) => norm(o) === norm(t));
      if (hit >= 0) index = hit;
    }
  }

  if (index === null || index < 0 || index >= opts.length) return null;

  return { ...raw, options: opts, answer: index };
}

/**
 * Load all question docs, assembled into a map { catId: Question[] },
 * each category's list sorted by `order`.
 * Returns {} on empty or error (never throws). Cached for TTL_MS.
 */
export async function loadTriviaQuestions(): Promise<Record<string, any[]>> {
  if (_qsCache && Date.now() - _qsCache.at < TRIVIA_CACHE_TTL_MS) return _qsCache.data;
  if (_qsInflight) return _qsInflight;
  _qsInflight = (async () => {
    try {
      const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
      if (snap.empty) return {};
      const map: Record<string, any[]> = {};
      let dropped = 0;
      snap.forEach((d) => {
        const data: any = d.data();
        const catId = data.categoryId;
        if (!catId) return;
        // Normalized here rather than at the point of use, because there are
        // three points of use (the round, the daily challenge, the admin list)
        // and only one of them would have been fixed.
        const q = normalizeTriviaQuestion({ id: d.id, ...data });
        if (!q) { dropped += 1; return; }
        if (!map[catId]) map[catId] = [];
        map[catId].push(q);
      });
      if (dropped > 0) {
        console.warn(`[triviaService] dropped ${dropped} unusable question doc(s) — answer could not be resolved to an option`);
      }
      for (const catId of Object.keys(map)) {
        map[catId].sort((a, b) => {
          const oa = typeof a.order === 'number' ? a.order : 9999;
          const ob = typeof b.order === 'number' ? b.order : 9999;
          return oa - ob;
        });
      }
      _qsCache = { at: Date.now(), data: map };
      return map;
    } catch (err) {
      console.warn('[triviaService] loadTriviaQuestions failed:', err);
      return {};
    } finally {
      _qsInflight = null;
    }
  })();
  return _qsInflight;
}

/** Delete every doc in a collection in batches < 500. */
async function clearCollection(collName: string): Promise<void> {
  const snap = await getDocs(collection(db, collName));
  const docs: any[] = [];
  snap.forEach((d) => docs.push(d));
  while (docs.length > 0) {
    const batch = writeBatch(db);
    const chunk = docs.splice(0, 400);
    for (const d of chunk) batch.delete(doc(db, collName, d.id));
    await batch.commit();
  }
}

/**
 * ONE-CLICK migration of the static banks into Firestore.
 *
 * - Writes every category from `categories` into trivia_categories (doc id =
 *   category id), stamping `order` = index and `generated` = whether the id is
 *   in GENERATED_CATEGORY_IDS.
 * - For every EDITABLE (non-generated) category, writes each question in
 *   questionsMap[catId] as a trivia_questions doc (auto-id) with categoryId +
 *   order = index. Generated categories are NOT seeded (they stay in code).
 *
 * Re-seed safety: we CLEAR the whole trivia_questions collection first, then
 * re-write. Simpler and fully correct — no risk of duplicates from a re-run,
 * and nothing editable is expected to live only in Firestore before a seed.
 *
 * Returns { categories: n, questions: n }.
 */
export async function seedTriviaFromStatic(
  categories: any[],
  questionsMap: Record<string, any[]>,
): Promise<{ categories: number; questions: number; skipped: number }> {
  // 1. Wipe existing questions so a re-seed can't duplicate.
  await clearCollection(QUESTIONS_COLLECTION);

  // 2. Write categories (setDoc by id, chunked batches).
  let catCount = 0;
  {
    const list = [...categories];
    let index = 0;
    while (list.length > 0) {
      const batch = writeBatch(db);
      const chunk = list.splice(0, 400);
      for (const cat of chunk) {
        const { id, ...rest } = cat;
        batch.set(doc(db, CATEGORIES_COLLECTION, id), {
          name: rest.name ?? '',
          nameHt: rest.nameHt ?? '',
          icon: rest.icon ?? '',
          image: rest.image ?? '',
          color: rest.color ?? '',
          description: rest.description ?? '',
          descriptionHt: rest.descriptionHt ?? '',
          order: index,
          generated: isGeneratedCategory(id),
          updated_at: serverTimestamp(),
        });
        index += 1;
        catCount += 1;
      }
      await batch.commit();
    }
  }

  // 3. Write questions for EDITABLE categories only.
  let qCount = 0;
  // Questions whose answer could not be resolved to an option — reported back
  // to the admin rather than written as a silent 0.
  let skipped = 0;
  {
    // Flatten all editable questions into { catId, order, question } tuples.
    const pending: Array<{ catId: string; order: number; q: any }> = [];
    for (const cat of categories) {
      if (isGeneratedCategory(cat.id)) continue; // generated decks stay in code
      const list = questionsMap[cat.id] || [];
      list.forEach((q, i) => pending.push({ catId: cat.id, order: i, q }));
    }
    while (pending.length > 0) {
      const batch = writeBatch(db);
      const chunk = pending.splice(0, 400);
      for (const { catId, order, q } of chunk) {
        // Same rule as saveTriviaQuestion: never migrate a question whose
        // answer cannot be resolved to one of its options. A skipped question
        // is a gap someone can see; a `0` is a wrong answer nobody can.
        const checked = normalizeTriviaQuestion(q);
        if (!checked) {
          skipped += 1;
          continue;
        }
        const ref = doc(collection(db, QUESTIONS_COLLECTION)); // auto-id
        batch.set(ref, {
          categoryId: catId,
          q: q.q ?? '',
          qHt: q.qHt ?? '',
          options: checked.options,
          answer: checked.answer,
          order,
          created_at: serverTimestamp(),
        });
        qCount += 1;
      }
      await batch.commit();
    }
  }

  clearTriviaCache();
  return { categories: catCount, questions: qCount, skipped };
}

/**
 * Create or update a single question.
 * - With questionId: setDoc merge on that doc.
 * - Without: create an auto-id doc with categoryId = catId.
 * Returns the doc id.
 */
export async function saveTriviaQuestion(
  catId: string,
  question: any,
  questionId?: string,
): Promise<string> {
  /*
    Refuse an unresolvable answer instead of writing 0.

    `answer: ... : 0` was the old fallback here and in the migration below, and
    it is how a bank quietly fills with questions whose first option is marked
    correct. A save that throws is visible to the admin who made it; a save
    that writes 0 is discovered by a student being told they are wrong.
  */
  const checked = normalizeTriviaQuestion(question);
  if (!checked) {
    throw new Error(
      'Question refusée : la bonne réponse ne correspond à aucune option. '
      + 'Vérifiez les options et la réponse sélectionnée.',
    );
  }

  const payload: any = {
    categoryId: catId,
    q: question.q ?? '',
    qHt: question.qHt ?? '',
    options: checked.options,
    answer: checked.answer,
    updated_at: serverTimestamp(),
  };
  if (typeof question.order === 'number') payload.order = question.order;

  if (questionId) {
    await setDoc(doc(db, QUESTIONS_COLLECTION, questionId), payload, { merge: true });
    clearTriviaCache();
    return questionId;
  }
  const ref = doc(collection(db, QUESTIONS_COLLECTION));
  await setDoc(ref, { ...payload, created_at: serverTimestamp() });
  clearTriviaCache();
  return ref.id;
}

/** Delete a single question doc. */
export async function deleteTriviaQuestion(questionId: string): Promise<void> {
  await deleteDoc(doc(db, QUESTIONS_COLLECTION, questionId));
  clearTriviaCache();
}

/** Create or update category metadata (setDoc merge). */
export async function saveTriviaCategory(catId: string, data: any): Promise<void> {
  await setDoc(
    doc(db, CATEGORIES_COLLECTION, catId),
    { ...data, updated_at: serverTimestamp() },
    { merge: true },
  );
  clearTriviaCache();
}
