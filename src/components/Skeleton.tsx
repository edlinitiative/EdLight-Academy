import React from 'react';

/**
 * Tiny, dependency-free skeleton primitives.
 *
 * Every skeleton in the app reuses the same `.skeleton` shimmer defined in
 * index.css (@keyframes skeleton-sweep) so loading states look identical and
 * theme-aware (light + dark) everywhere. These are presentational placeholders
 * only — always aria-hidden, never carrying user-facing text.
 *
 * Compose page-shaped skeletons directly from these primitives so the shape of
 * the loading state mirrors the real layout and there's minimal layout shift
 * when the data arrives.
 */

type SkeletonVariant = 'text' | 'rect' | 'circle';

type SkeletonProps = {
  /** 'text' → a thin line; 'rect' → a block; 'circle' → a round chip/avatar. */
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  /** Corner radius override (ignored for circles, which are always round). */
  radius?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({
  variant = 'rect',
  width,
  height,
  radius,
  className = '',
  style,
}: SkeletonProps) {
  const isCircle = variant === 'circle';
  const resolved: React.CSSProperties = {
    width,
    height: height ?? (variant === 'text' ? '0.9rem' : undefined),
    borderRadius: isCircle ? '999px' : radius,
    ...style,
  };
  return (
    <div
      className={`skeleton ${className}`.trim()}
      aria-hidden="true"
      style={resolved}
    />
  );
}

type SkeletonTextProps = {
  /** Number of lines to render. */
  lines?: number;
  /** Width of the final (usually shorter) line. */
  lastWidth?: number | string;
  gap?: number | string;
  className?: string;
};

/** A stack of text lines; the last one is shortened for a natural paragraph shape. */
export function SkeletonText({
  lines = 3,
  lastWidth = '60%',
  gap,
  className = '',
}: SkeletonTextProps) {
  return (
    <div
      className={`skeleton-lines ${className}`.trim()}
      aria-hidden="true"
      style={gap != null ? { gap } : undefined}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 && lines > 1 ? lastWidth : '100%'}
        />
      ))}
    </div>
  );
}

export default Skeleton;
