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
import { addWeeklyXp, getWeeklyTop } from './leaderboardService';
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
    leaderboard: { optedIn: false, displayName: '', school: null, city: null },
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
        displayName: updated.leaderboard.displayName || 'Élève',
        level: newLevelInfo.level,
        school: updated.leaderboard.school || null,
        city: updated.leaderboard.city || null,
      });
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

/**
 * Opt in/out of the leaderboard and set the public alias / school. When opting
 * in we also seed/refresh this week's entry so the learner shows up immediately.
 */
export async function setLeaderboardOptIn(uid, { optedIn, displayName, school, city }) {
  if (!uid) return null;
  try {
    const current = await loadTriviaProfile(uid);
    const leaderboard = {
      optedIn: !!optedIn,
      displayName: displayName ?? current.leaderboard?.displayName ?? 'Élève',
      school: school !== undefined ? school : current.leaderboard?.school ?? null,
      city: city !== undefined ? city : current.leaderboard?.city ?? null,
    };
    await setDoc(profileRef(uid), { leaderboard, updatedAt: serverTimestamp() }, { merge: true });

    if (leaderboard.optedIn) {
      const { updateEntryProfile } = await import('./leaderboardService');
      await updateEntryProfile(uid, {
        displayName: leaderboard.displayName,
        level: levelInfo(current.xp).level,
        school: leaderboard.school,
        city: leaderboard.city,
      });
    }
    return { ...current, leaderboard };
  } catch (err) {
    console.error('[Trivia] setLeaderboardOptIn error:', err);
    return null;
  }
}
