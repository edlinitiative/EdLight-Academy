import React, { useState, useRef } from 'react';
import { GraduationCap, Lightbulb } from 'lucide-react';
import useStore from '../contexts/store';
import { updateUserTrack } from '../services/firebase';
import { TRACKS } from '../config/trackConfig';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * TrackSelector — lets the user pick their Baccalauréat track (série/filière).
 *
 * Used in two contexts:
 *   1. As an onboarding modal when the user first visits Terminale exams.
 *   2. As a settings section in the user dropdown for changing tracks.
 *
 * Props:
 *   onSelect(trackCode) — called after the track is saved (optional).
 *   onClose() — called to dismiss the selector (optional).
 *   mode — "modal" (default) or "inline" for settings view.
 *   currentTrack — pre-selected track code (for change-track flow).
 */
export default function TrackSelector({ onSelect, onClose, mode = 'modal', currentTrack }) {
  const [selected, setSelected] = useState(currentTrack || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const user = useStore((s) => s.user);
  const setTrack = useStore((s) => s.setTrack);
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  // Modal mode behaves like the other dialogs: lock background scroll and trap
  // focus. Inline mode (settings) keeps the page interactive, so it's disabled.
  const isModal = mode !== 'inline';
  const modalRef = useRef(null);
  useBodyScrollLock(isModal);
  useFocusTrap(modalRef, isModal);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');

    try {
      // Save to Firestore if authenticated
      if (user?.uid) {
        await updateUserTrack(user.uid, selected);
      }

      // Update local store
      setTrack(selected);
      setOnboardingCompleted(true);

      onSelect?.(selected);
    } catch (err) {
      console.error('Failed to save track:', err);
      setError('Erreur lors de la sauvegarde. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="track-selector">
      <div className="track-selector__header">
        <span className="track-selector__icon"><GraduationCap size={28} /></span>
        <h2 className="track-selector__title">
          {currentTrack ? 'Changer de filière' : 'Choisissez votre filière'}
        </h2>
        <p className="track-selector__subtitle">
          {currentTrack
            ? 'Sélectionnez votre nouvelle filière du Baccalauréat.'
            : 'Les examens et coefficients seront adaptés à votre filière du Baccalauréat.'}
        </p>
      </div>

      <div className="track-selector__grid">
        {TRACKS.map((track) => (
          <button
            key={track.code}
            className={`track-selector__card ${selected === track.code ? 'track-selector__card--selected' : ''}`}
            onClick={() => setSelected(track.code)}
            type="button"
            style={{
              '--track-color': track.color,
              borderColor: selected === track.code ? track.color : undefined,
            }}
          >
            <span className="track-selector__card-icon">{track.icon}</span>
            <span className="track-selector__card-code">{track.shortLabel}</span>
            <span className="track-selector__card-name">{track.label}</span>
            <span className="track-selector__card-desc">{track.description}</span>
            {selected === track.code && (
              <span className="track-selector__check" style={{ color: track.color }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="track-selector__error">{error}</p>}

      <div className="track-selector__actions">
        <button
          className="button button--primary button--pill track-selector__confirm"
          onClick={handleConfirm}
          disabled={!selected || saving}
          type="button"
        >
          {saving ? 'Enregistrement…' : currentTrack ? 'Mettre à jour' : 'Confirmer'}
        </button>
        {onClose && (
          <button
            className="button button--ghost button--pill"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            {currentTrack ? 'Annuler' : 'Plus tard'}
          </button>
        )}
      </div>

      <p className="track-selector__hint">
        <Lightbulb size={14} /> Vous pourrez changer de filière à tout moment depuis votre profil.
      </p>
    </div>
  );

  if (mode === 'inline') return content;

  return (
    <div className="modal-overlay track-selector__overlay" onClick={onClose}>
      <div className="track-selector__modal" onClick={(e) => e.stopPropagation()} ref={modalRef} role="dialog" aria-modal="true">
        {content}
      </div>
    </div>
  );
}
