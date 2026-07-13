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
import { addWeeklyXp, getWeeklyTop, isValidAlias, upsertAllTimeEntry } from './leaderboardService';
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

    // Opt-in weekly leaderboard submission + rank notification.
    if (updated.leaderboard?.optedIn && xpEarned > 0) {
      await addWeeklyXp(uid, xpEarned, {
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: updated.leaderboard.department || null,
      });
      // All-time board mirrors lifetime XP (absolute, self-backfilling).
      upsertAllTimeEntry(uid, {
        xp: updated.xp,
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: updated.leaderboard.department || null,
      }).catch(() => {});
      // Best-effort rank notification — fire and forget.
      getWeeklyTop(50).then((top) => {
        const entry = top.find((e) => e.id === uid);
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

    if (updated.leaderboard?.optedIn) {
      if (xpEarned > 0) {
        await addWeeklyXp(uid, xpEarned, {
          displayName: updated.leaderboard.displayName || null,
          level: newLevelInfo.level,
          school: updated.leaderboard.school || null,
          city: updated.leaderboard.city || null,
          department: updated.leaderboard.department || null,
        });
      }
      upsertAllTimeEntry(uid, {
        xp: updated.xp,
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: updated.leaderboard.department || null,
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

/**
 * Load all category docs, sorted by `order` then id.
 * Returns [] on empty or error (never throws).
 */
export async function loadTriviaCategories(): Promise<any[]> {
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
    return cats;
  } catch (err) {
    console.warn('[triviaService] loadTriviaCategories failed:', err);
    return [];
  }
}

/**
 * Load all question docs, assembled into a map { catId: Question[] },
 * each category's list sorted by `order`.
 * Returns {} on empty or error (never throws).
 */
export async function loadTriviaQuestions(): Promise<Record<string, any[]>> {
  try {
    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    if (snap.empty) return {};
    const map: Record<string, any[]> = {};
    snap.forEach((d) => {
      const data: any = d.data();
      const catId = data.categoryId;
      if (!catId) return;
      if (!map[catId]) map[catId] = [];
      map[catId].push({ id: d.id, ...data });
    });
    for (const catId of Object.keys(map)) {
      map[catId].sort((a, b) => {
        const oa = typeof a.order === 'number' ? a.order : 9999;
        const ob = typeof b.order === 'number' ? b.order : 9999;
        return oa - ob;
      });
    }
    return map;
  } catch (err) {
    console.warn('[triviaService] loadTriviaQuestions failed:', err);
    return {};
  }
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
): Promise<{ categories: number; questions: number }> {
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
        const ref = doc(collection(db, QUESTIONS_COLLECTION)); // auto-id
        batch.set(ref, {
          categoryId: catId,
          q: q.q ?? '',
          qHt: q.qHt ?? '',
          options: Array.isArray(q.options) ? q.options : [],
          answer: typeof q.answer === 'number' ? q.answer : 0,
          order,
          created_at: serverTimestamp(),
        });
        qCount += 1;
      }
      await batch.commit();
    }
  }

  return { categories: catCount, questions: qCount };
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
  const payload: any = {
    categoryId: catId,
    q: question.q ?? '',
    qHt: question.qHt ?? '',
    options: Array.isArray(question.options) ? question.options : [],
    answer: typeof question.answer === 'number' ? question.answer : 0,
    updated_at: serverTimestamp(),
  };
  if (typeof question.order === 'number') payload.order = question.order;

  if (questionId) {
    await setDoc(doc(db, QUESTIONS_COLLECTION, questionId), payload, { merge: true });
    return questionId;
  }
  const ref = doc(collection(db, QUESTIONS_COLLECTION));
  await setDoc(ref, { ...payload, created_at: serverTimestamp() });
  return ref.id;
}

/** Delete a single question doc. */
export async function deleteTriviaQuestion(questionId: string): Promise<void> {
  await deleteDoc(doc(db, QUESTIONS_COLLECTION, questionId));
}

/** Create or update category metadata (setDoc merge). */
export async function saveTriviaCategory(catId: string, data: any): Promise<void> {
  await setDoc(
    doc(db, CATEGORIES_COLLECTION, catId),
    { ...data, updated_at: serverTimestamp() },
    { merge: true },
  );
}
