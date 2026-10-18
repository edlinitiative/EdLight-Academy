import React, { useEffect, useState } from 'react';
import { isWeakStill } from '../../../utils/lessonFrames';
import './subjectFrame.css';

/**
 * SubjectFrame — the one media primitive for lesson and course pictures
 * (Stitch web direction §0.8, learning-journey RECHECK items 1–2).
 *
 * Every still sits on the same subject-tinted mat, at the same inset, radius,
 * crop and 16:9 ratio, so handwritten boards of different density read as one
 * series. When there is no usable still (none given, a curated weak frame, a
 * failed or placeholder load) the frame draws flat subject line art on the
 * same mat — honest original artwork, never a photo and never an empty block.
 *
 * Colours are tokens in subjectFrame.css (`.sf--chem` …), light and dark.
 */

export interface SubjectFrameProps {
  /** Course subject code, e.g. 'CHEM' | 'MATH' | 'PHYS' | 'ECON' | 'SVT'. Case-insensitive; unknown → neutral mat. */
  subject: string;
  /** Real lesson/course still URL; null/undefined or a weak frame → artwork. */
  still?: string | null;
  /** Default 'md'. */
  size?: 'lg' | 'md' | 'sm';
  /** Optional subject pill text (FR/HT already resolved by caller). */
  label?: string;
  /** Overlay the EdLight play disc. */
  play?: boolean;
  className?: string;
  alt?: string;
}

export type SubjectKey = 'chem' | 'math' | 'phys' | 'econ' | 'svt' | 'neutral';

/** Normalise any subject spelling the catalogue uses to a frame key. */
export function subjectKey(subject?: string | null): SubjectKey {
  const s = String(subject || '').trim().toLowerCase();
  if (!s) return 'neutral';
  if (/^(chem|chim|chm)/.test(s)) return 'chem';
  if (/^(math|mth)/.test(s)) return 'math';
  if (/^(phys|phy|fiz)/.test(s)) return 'phys';
  if (/^(econ|éco|eco|ekon)/.test(s)) return 'econ';
  if (/^(svt|bio|life|syans lavi)/.test(s)) return 'svt';
  return 'neutral';
}

// Flat line art per subject, drawn in a 48×40 box with 2px non-scaling
// strokes in the subject ink. Static markup: nothing generated at runtime.
const ART: Record<SubjectKey, React.ReactNode> = {
  // Beaker + two bonded molecule nodes.
  chem: (
    <>
      <path d="M8 4h14M10.5 4v12L3.5 32a3 3 0 0 0 2.8 4h17.4a3 3 0 0 0 2.8-4L19.5 16V4" />
      <path d="M6.5 26h17" />
      <circle cx="36" cy="10" r="4" />
      <circle cx="43" cy="22" r="3" />
      <path d="M38 13.5 41.4 19.4" />
    </>
  ),
  // Axes + a curve.
  math: (
    <>
      <path d="M6 4v32h38" />
      <path d="M3.5 7 6 4l2.5 3M41 33.5l3 2.5-3 2.5" />
      <path d="M9 31c6 0 8-20 15-20s9 14 18 14" />
      <circle cx="24" cy="11" r="1.6" />
    </>
  ),
  // Supply and demand crossing on axes.
  econ: (
    <>
      <path d="M6 4v32h38" />
      <path d="M10 10c10 4 18 12 30 22" />
      <path d="M10 32c10-4 18-12 30-22" />
      <circle cx="25" cy="21" r="2" />
      <path d="M25 23v13M6 21h17" strokeDasharray="2 3" />
    </>
  ),
  // Force vectors from one point.
  phys: (
    <>
      <circle cx="16" cy="24" r="3" />
      <path d="M19 24h22M37 20l4 4-4 4" />
      <path d="M16 21V5M12 9l4-4 4 4" />
      <path d="M18.2 26.2 30 36M24.6 36.4 30 36l-.4-5.4" />
    </>
  ),
  // Leaf with its midrib.
  svt: (
    <>
      <path d="M14 36C6 36 4 26 8 18 13 8 26 5 42 4c-1 16-4 28-14 31-5 1.6-10 1-14 1z" />
      <path d="M8 36c8-8 16-17 28-26" />
      <path d="M20 26l-2-8M27 19l6 1" />
    </>
  ),
  // Open book.
  neutral: (
    <>
      <path d="M24 9v27" />
      <path d="M4 7a3 3 0 0 1 3-3h13a4 4 0 0 1 4 4v28a3 3 0 0 0-3-3H4z" />
      <path d="M44 7a3 3 0 0 0-3-3H28a4 4 0 0 0-4 4v28a3 3 0 0 1 3-3h17z" />
    </>
  ),
};

/** YouTube serves a 120×90 grey "no image" picture for a missing still. */
const PLACEHOLDER_MAX_WIDTH = 120;

export default function SubjectFrame({
  subject,
  still,
  size = 'md',
  label,
  play = false,
  className = '',
  alt = '',
}: SubjectFrameProps): JSX.Element {
  const key = subjectKey(subject);
  const usable = !!still && !isWeakStill(still);
  const [failed, setFailed] = useState(false);
  // A new still gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [still]);
  const showStill = usable && !failed;

  return (
    <div
      className={`sf sf--${key} sf--${size} ${showStill ? 'sf--still' : 'sf--art'} ${className}`.trim()}
      data-subject={key}
      // Decorative unless the caller names it.
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <div className="sf__inner">
        {showStill ? (
          <img
            className="sf__img"
            src={still as string}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalWidth <= PLACEHOLDER_MAX_WIDTH) setFailed(true);
            }}
          />
        ) : (
          <svg
            className="sf__art"
            viewBox="0 0 48 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            aria-hidden="true"
          >
            {ART[key]}
          </svg>
        )}
        {label && size !== 'sm' ? <span className="sf__pill">{label}</span> : null}
        {play ? (
          <span className="sf__play" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M8 5.5v13l10.5-6.5z" /></svg>
          </span>
        ) : null}
      </div>
    </div>
  );
}
