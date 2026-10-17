import React, { useCallback } from 'react';
import { Volume2, VolumeX } from '../../components/icons';
import useStore from '../../contexts/store';
import { getArenaSound } from './arenaSound';
import { useArenaSound } from './useArenaSound';
import { pressSoundToggle, soundToggleView } from './toggle';
import './sound.css';

/**
 * "Son" — the explicit, user-initiated sound switch for the real Arène
 * experiences (trivia match, duel, /arena/demo). Off by default; nothing
 * plays until the student presses it; the choice persists per viewer on this
 * device (toggle.ts). Every cue it unlocks is also shown on screen, so the
 * experience stays complete in silence.
 */
export default function SoundToggle({ compact = false, className = '' }: {
  /** Icon-only (the label stays as the accessible name and tooltip). */
  compact?: boolean;
  className?: string;
}) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const snd = useArenaSound();
  const { on } = soundToggleView(snd);
  const press = useCallback(() => {
    try { pressSoundToggle(getArenaSound()); } catch { /* silent is fine */ }
  }, []);
  const label = on ? t('Son activé', 'Son limen') : t('Son coupé', 'Son koupe');
  const action = on ? t('Couper le son', 'Koupe son an') : t('Activer le son', 'Limen son an');
  return (
    <button
      type="button"
      className={`snd-toggle${compact ? ' snd-toggle--compact' : ''}${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      aria-label={compact ? action : undefined}
      title={action}
      onClick={press}
    >
      {on ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
