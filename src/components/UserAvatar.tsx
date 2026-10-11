import React, { useEffect, useState } from 'react';
import { PixelAvatar } from './PixelAvatar';

/**
 * A person's avatar — the SAME picture the mobile app shows
 * (mobile/src/components/ui/Avatar.tsx), so a student looks like themselves
 * on both:
 *
 *   1. a real photo URL, when the caller passes one (leaderboards do)
 *   2. otherwise the RoboHash robot (set1) seeded by their uid
 *   3. offline / blocked: the local pixel face, same seed
 *
 * Seed rule matches the app: `seed || name || 'edlight'`. Pass the uid as
 * the seed wherever the app does.
 */
const ROBOHASH_SET = 'set1';

export default function UserAvatar({
  seed, name = '', uri = null, size = 40, radius, className = '',
}: {
  seed?: string | null;
  name?: string | null;
  uri?: string | null;
  size?: number;
  /** Corner radius in px; defaults to a circle, like the app. */
  radius?: number;
  className?: string;
}) {
  const charSeed = seed || name || 'edlight';
  const photo = typeof uri === 'string' && /^https?:\/\//i.test(uri.trim()) ? uri.trim() : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const [robotFailed, setRobotFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [photo]);
  useEffect(() => setRobotFailed(false), [charSeed]);

  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: radius ?? size / 2,
    overflow: 'hidden', display: 'inline-grid', placeItems: 'center', flexShrink: 0,
    background: '#E8F1FE',
  };
  return (
    <span className={`user-avatar ${className}`.trim()} style={style} aria-hidden="true">
      {photo && !photoFailed ? (
        <img src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer"
          style={{ width: size, height: size, objectFit: 'cover' }} onError={() => setPhotoFailed(true)} />
      ) : robotFailed ? (
        <PixelAvatar seed={charSeed} size={size} />
      ) : (
        <img
          src={`https://robohash.org/${encodeURIComponent(charSeed)}.png?set=${ROBOHASH_SET}&size=128x128`}
          alt="" width={size} height={size} loading="lazy"
          style={{ width: size, height: size, objectFit: 'cover' }}
          onError={() => setRobotFailed(true)}
        />
      )}
    </span>
  );
}
