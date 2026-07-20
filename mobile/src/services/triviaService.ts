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
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { recordActivity as recordStreakActivity, todayStr } from './streakService';
import { addWeeklyXp, isValidAlias } from './leaderboardService';

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
    // Everyone is on the leaderboard by default (auto-enrolled). The board only
    // shows an entry once it has a valid alias — we fall back to the player's
    // first name when they haven't set a custom pseudo.
    leaderboard: { optedIn: true, displayName: '', school: null, city: null, department: null },
  };
}

function profileRef(uid: string) {
  return doc(db, 'users', uid, 'gamification', 'profile');
}

/** Load the gamification profile (defaults when none exists / offline). */
export async function loadTriviaProfile(uid: string) {
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
      games: { ...base.games, ...((data as any).games || {}) },
      leaderboard: { ...base.leaderboard, ...(data.leaderboard || {}) },
    };
  } catch (err) {
    console.error('[Trivia] loadTriviaProfile error:', err);
    return defaultTriviaProfile();
  }
}

/** Daily-challenge status derived from a profile + today's date. */
export function getDailyChallengeState(profile: any, today = todayStr()) {
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
export async function recordTriviaResult(uid: string, { category, score = 0, total = 0, isDaily = false, defaultName }: { category: any; score: number; total: number; isDaily?: boolean; defaultName?: string }) {
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

    // Accrue weekly + all-time XP on EVERY game. A learner who hasn't opted in
    // (or hasn't picked a pseudo) still accumulates XP — the entry is stored
    // with a null alias, which the board hides. As soon as they join + choose a
    // pseudo, updateEntryProfile stamps the name and their already-earned XP
    // shows up. (Previously this only ran for opted-in users, so completing the
    // daily before joining never registered on the classement.)
    if (xpEarned > 0) {
      const lb = updated.leaderboard || {};
      // Alias priority: the player's chosen pseudo → their account first name →
      // null (hidden). optedIn defaults true, so everyone with a name shows.
      const alias = lb.optedIn === false
        ? null
        : isValidAlias(lb.displayName)
        ? lb.displayName
        : isValidAlias(defaultName)
        ? defaultName
        : null;
      const meta = {
        displayName: alias,
        level: newLevelInfo.level,
        school: lb.school || null,
        city: lb.city || null,
        department: (lb as any).department || null,
      };
      // addWeeklyXp POSTs to /api/leaderboard/award, which increments BOTH the
      // weekly and all-time entries by the earned delta — no separate all-time
      // write is needed (doing both would double-count).
      await addWeeklyXp(uid, xpEarned, meta);
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

/**
 * Opt in/out of the leaderboard and set the public alias / school. When opting
 * in we also seed/refresh this week's entry so the learner shows up immediately.
 */
export async function setLeaderboardOptIn(
  uid: string,
  { optedIn, displayName, school, city, department }: { optedIn?: boolean; displayName?: string; school?: string | null; city?: string | null; department?: string | null },
) {
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
      department: department !== undefined ? department : (current.leaderboard as any)?.department ?? null,
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
 * score, streak, and (for opted-in players) the boards + record claims.
 */
export async function recordGameResult(uid: string, { gameId, score = 0, maxScore = 0 }: { gameId: string; score: number; maxScore: number }) {
  const xpEarned = computeGameXp({ score, maxScore });
  if (!uid) {
    return { profile: defaultTriviaProfile(), xpEarned, leveledUp: false, prevLevel: 1, newLevel: 1, guest: true };
  }
  try {
    const current = await loadTriviaProfile(uid);
    const prevLevel = levelInfo(current.xp).level;
    const games = (current as any).games || { gamesPlayed: 0, highScores: {} };
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
      const meta = {
        displayName: updated.leaderboard.displayName || null,
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
        department: (updated.leaderboard as any).department || null,
        gameId,
        score,
      };
      await addWeeklyXp(uid, xpEarned, meta);
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
