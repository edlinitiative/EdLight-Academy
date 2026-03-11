/**
 * Streak Service
 * ──────────────
 * Global (cross-course) streak system that aggregates ALL user activity
 * to track consecutive days of platform usage.
 *
 * Firestore path: users/{uid}/streaks/global
 *
 * Data shape:
 * {
 *   currentStreak: number,
 *   longestStreak: number,
 *   lastActivityDate: string (YYYY-MM-DD),
 *   totalActiveDays: number,
 *   activeDays: string[]  (rolling 90 days of YYYY-MM-DD),
 *   milestones: string[]  (IDs of unlocked milestones),
 *   streakFreezes: number (remaining freeze tokens),
 *   lastFreezeUsed: string | null,
 *   updatedAt: Timestamp,
 * }
 */

import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTIVE_DAYS_WINDOW = 90; // Keep 90 days of history for heatmap

/** Streak milestone definitions — ordered by threshold */
export const STREAK_MILESTONES = [
  { id: 'streak_3',   days: 3,   emoji: '🔥', label: '3 jours',    labelHt: '3 jou',     message: 'Bon début ! 3 jours de suite.',          messageHt: 'Bon kòmansman! 3 jou youn dèyè lòt.' },
  { id: 'streak_7',   days: 7,   emoji: '🔥', label: '1 semaine',  labelHt: '1 semèn',   message: 'Une semaine complète ! Continue !',      messageHt: 'Yon semèn konplè! Kontinye!' },
  { id: 'streak_14',  days: 14,  emoji: '⚡', label: '2 semaines', labelHt: '2 semèn',   message: 'Deux semaines sans arrêt !',             messageHt: '2 semèn san rete!' },
  { id: 'streak_30',  days: 30,  emoji: '💪', label: '1 mois',     labelHt: '1 mwa',     message: 'Un mois entier ! Tu es inarrêtable.',    messageHt: 'Yon mwa antye! Ou pa ka rete!' },
  { id: 'streak_60',  days: 60,  emoji: '👑', label: '60 jours',   labelHt: '60 jou',    message: '60 jours — discipline de champion.',     messageHt: '60 jou — disiplin chanpyon.' },
  { id: 'streak_100', days: 100, emoji: '🏆', label: '100 jours',  labelHt: '100 jou',   message: '100 jours ! Légende EdLight.',           messageHt: '100 jou! Lejand EdLight.' },
  { id: 'streak_365', days: 365, emoji: '💎', label: '1 an',       labelHt: '1 ane',     message: 'Un an complet — incroyable !',           messageHt: 'Yon ane konplè — encroyab!' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get today's date string in YYYY-MM-DD (local timezone). */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD to midnight Date object. */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Number of calendar days between two YYYY-MM-DD strings. */
function daysBetween(a, b) {
  const msA = parseDate(a).getTime();
  const msB = parseDate(b).getTime();
  return Math.round(Math.abs(msB - msA) / 86_400_000);
}

/** Trim activeDays to the latest N entries. */
function trimActiveDays(days, limit = ACTIVE_DAYS_WINDOW) {
  const sorted = [...new Set(days)].sort();
  return sorted.slice(-limit);
}

// ─── Firestore ref helper ───────────────────────────────────────────────────

function streakRef(uid) {
  return doc(db, 'users', uid, 'streaks', 'global');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the user's global streak data.
 * Returns a default object if none exists yet.
 */
export async function loadStreak(uid) {
  if (!uid) return defaultStreak();
  try {
    const snap = await getDoc(streakRef(uid));
    if (!snap.exists()) return defaultStreak();
    return { ...defaultStreak(), ...snap.data() };
  } catch (err) {
    console.error('[Streak] loadStreak error:', err);
    return defaultStreak();
  }
}

/**
 * Record that the user did *something* today.
 * Call this from any activity handler (quiz, video, exam, study-plan task).
 *
 * Returns { streak, newMilestones } where newMilestones is an array of
 * milestone objects the user *just* unlocked (empty if none).
 */
export async function recordActivity(uid) {
  if (!uid) return { streak: defaultStreak(), newMilestones: [] };

  const today = todayStr();

  try {
    const current = await loadStreak(uid);

    // Already recorded today — no change
    if (current.lastActivityDate === today) {
      return { streak: current, newMilestones: [] };
    }

    let { currentStreak, longestStreak, activeDays, milestones, streakFreezes, lastFreezeUsed } = current;

    // Determine continuity
    const gap = current.lastActivityDate
      ? daysBetween(current.lastActivityDate, today)
      : null;

    if (gap === null) {
      // First ever activity
      currentStreak = 1;
    } else if (gap === 1) {
      // Consecutive day
      currentStreak += 1;
    } else if (gap === 2 && streakFreezes > 0) {
      // Missed exactly 1 day but has a freeze
      currentStreak += 1;
      streakFreezes -= 1;
      lastFreezeUsed = today;
    } else {
      // Streak broken
      currentStreak = 1;
    }

    longestStreak = Math.max(longestStreak, currentStreak);

    // Update active days set
    activeDays = trimActiveDays([...activeDays, today]);

    // Check milestones
    const newMilestones = [];
    for (const m of STREAK_MILESTONES) {
      if (currentStreak >= m.days && !milestones.includes(m.id)) {
        milestones.push(m.id);
        newMilestones.push(m);
      }
    }

    const updatedStreak = {
      currentStreak,
      longestStreak,
      lastActivityDate: today,
      totalActiveDays: (current.totalActiveDays || 0) + 1,
      activeDays,
      milestones,
      streakFreezes,
      lastFreezeUsed,
      updatedAt: serverTimestamp(),
    };

    await setDoc(streakRef(uid), updatedStreak, { merge: true });

    return { streak: { ...updatedStreak, updatedAt: new Date() }, newMilestones };
  } catch (err) {
    console.error('[Streak] recordActivity error:', err);
    return { streak: defaultStreak(), newMilestones: [] };
  }
}

/**
 * Award a streak freeze token (e.g. for completing a weekly challenge).
 * Max 2 freezes at a time.
 */
export async function awardStreakFreeze(uid) {
  if (!uid) return;
  try {
    const current = await loadStreak(uid);
    const freezes = Math.min((current.streakFreezes || 0) + 1, 2);
    await setDoc(streakRef(uid), { streakFreezes: freezes, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('[Streak] awardStreakFreeze error:', err);
  }
}

/**
 * Build a 7×N grid for the heatmap calendar component.
 * Returns { weeks: [[{date, active, level}]] } for the last `numWeeks` weeks.
 */
export function buildHeatmapData(activeDays = [], numWeeks = 12) {
  const activeSet = new Set(activeDays);
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun
  const totalDays = numWeeks * 7;

  // Start from (numWeeks * 7 - 1) days ago, aligned to Sunday
  const start = new Date(today);
  start.setDate(today.getDate() - totalDays + 1 - todayDay);

  const weeks = [];
  let currentWeek = [];

  for (let i = 0; i < totalDays + todayDay + 1; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    if (d > today) break;

    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const active = activeSet.has(str);

    currentWeek.push({
      date: str,
      active,
      level: active ? 1 : 0,
      isToday: str === todayStr(),
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) weeks.push(currentWeek);

  return weeks;
}

/**
 * Get the next milestone the user is working towards.
 */
export function getNextMilestone(currentStreak, unlockedMilestones = []) {
  for (const m of STREAK_MILESTONES) {
    if (!unlockedMilestones.includes(m.id)) {
      return { ...m, remaining: m.days - currentStreak };
    }
  }
  return null; // All milestones achieved!
}

// ─── Default ────────────────────────────────────────────────────────────────

function defaultStreak() {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    totalActiveDays: 0,
    activeDays: [],
    milestones: [],
    streakFreezes: 0,
    lastFreezeUsed: null,
  };
}
