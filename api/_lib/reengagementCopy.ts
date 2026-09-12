/**
 * The words a re-engagement message says, and nothing else.
 *
 * Separate from `api/reengagement.ts` because that file is a Vercel handler:
 * importing it drags in `@vercel/node` and firebase-admin, which a unit test
 * cannot parse. Copy is the part most worth testing here — it is where the
 * French/Kreyòl mixing lived — so it lives where it can be, beside
 * `dailyNudge.ts` which made the same move for the same reason.
 */

import type { ReminderEmailLang } from './reminderEmail';
/** Mirrors the handler's own union. Declared here so a pure copy module
 *  never has to import a Vercel handler to know its own parameter type. */
export type PlanAction = 'push-soft' | 'push-hard' | 'email';

/** Human label for the grade code in copy ("NS4", "9e", "Préfac"…). */
function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  if (grade === 'POSTBAC') return 'Préfac';
  return grade;
}

/**
 * One language per message, chosen from the student's own setting.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * Both bodies used to carry French AND Kreyòl on a single line, joined with a
 * middle dot:
 *
 *   "2 minutes de quiz pour relancer ta série. · 2 minit quiz pou reprann seri ou."
 *
 * On a phone's notification shade that is one long run of text in two
 * languages, and the half a student can read is the half they have to find.
 * It happened because `reengagementCopy` took no language argument and so
 * could not choose — while the caller had already resolved `lang` on the line
 * ABOVE the call, from the student's own preference. It just never passed it.
 *
 * French is the fallback, matching `daily-nudge.ts`: `language === 'ht' ? 'ht' : 'fr'`.
 */
export function reengagementCopy(
  action: PlanAction,
  grade: string | null,
  lang: ReminderEmailLang = 'fr',
  peersToday?: number | null
): { title: string; body: string } {
  const g = gradeLabel(grade);
  const ht = lang === 'ht';

  // Social proof, and only when it is TRUE. `peersToday` is a real count of
  // students who finished a quiz today, measured once per run — not a
  // decoration and not a number anyone invented. Below a handful it is left
  // out entirely: "2 students did this today" argues against itself.
  const proof =
    peersToday && peersToday >= 5
      ? ht
        ? ` ${peersToday} elèv gentan fè youn jodi a.`
        : ` ${peersToday} élèves en ont déjà fait un aujourd'hui.`
      : '';

  if (action === 'push-soft') {
    return {
      title: ht
        ? (g ? `Defi ${g} ou a ap tann ou 🔥` : 'Defi jodi a ap tann ou 🔥')
        : (g ? `Ton défi ${g} t'attend 🔥` : "Ton défi du jour t'attend 🔥"),
      body: ht
        ? `2 minit quiz pou reprann seri ou.${proof}`
        : `2 minutes de quiz pour relancer ta série.${proof}`,
    };
  }

  return {
    title: ht
      ? (g ? `${g} : nou pa wè w depi yon bon ti tan` : 'Nou pa wè w depi yon bon ti tan')
      : (g ? `${g} : on ne t'a pas vu depuis un moment` : "On ne t'a pas vu depuis un moment"),
    body: ht
      ? `Defi jodi a ak klasman semèn nan ap tann ou.${proof}`
      : `Ton défi du jour et le classement de la semaine t'attendent.${proof}`,
  };
}

