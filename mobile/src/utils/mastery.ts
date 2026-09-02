/**
 * Mastery model — MOBILE binding.
 *
 * The model itself now lives in /shared/mastery.ts so the web app and this app
 * cannot drift apart on what "maîtrisé" means. Everything is re-exported here,
 * so existing imports from '../utils/mastery' keep working unchanged.
 *
 * The only thing that stays platform-side is the colour lookup, which needs
 * this app's theme palette (the web resolves the same roles to CSS tokens).
 */

export * from '../../../shared/mastery';

import { type MasteryLevel } from '../../../shared/mastery';

/** Palette role per level. Takes the themed palette so dark mode comes free. */
export function masteryColor(level: MasteryLevel, colors: any): string {
  switch (level) {
    case 'none': return colors.faint;
    case 'seen': return colors.muted;
    case 'familiar': return colors.warn;
    case 'proficient': return colors.azure;
    case 'mastered': return colors.success;
  }
}
