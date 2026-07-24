import React from 'react';
import { View, Image } from 'react-native';
import { useColors } from '../../theme/theme';

interface AvatarProps {
  name?: string;
  uri?: string | null;
  /** Stable per-user seed for the generated character (prefer uid; falls back to name) */
  seed?: string;
  size?: number;
}

// FNV-1a 32-bit hash — deterministic starting point for the identicon bits
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 5x5 horizontally mirrored pixel grid (3 unique columns), classic identicon style
function identiconRows(seed: string): boolean[][] {
  let h = fnv1a(seed) || 1;
  const next = () => {
    // xorshift32
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h;
  };
  const rows: boolean[][] = [];
  for (let r = 0; r < 5; r++) {
    const half = [0, 0, 0].map(() => next() % 2 === 0);
    rows.push([half[0], half[1], half[2], half[1], half[0]]);
  }
  return rows;
}

// Last-resort offline fallback: locally rendered deterministic pixel identicon
function PixelIdenticon({ seed, size }: { seed: string; size: number }) {
  const colors = useColors();
  const rows = React.useMemo(() => identiconRows(seed), [seed]);
  const cell = Math.round((size * 0.6) / 5);
  return (
    <View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((on, c) => (
            <View
              key={c}
              style={{ width: cell, height: cell, backgroundColor: on ? colors.azure : 'transparent' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// When a user has a real profile photo (Google/Apple `photoURL`) we show it.
// Otherwise everyone gets a deterministic pixel robot from RoboHash (set1 =
// robots), with a locally-drawn identicon as the last-resort offline fallback.
// Swap `set1` for set2 (monsters), set3 (robot heads), set4 (cats), or set5
// (humans) to restyle the generated fallback across the whole app.
const ROBOHASH_SET = 'set1';

export default function Avatar({ name = '', uri, seed, size = 48 }: AvatarProps) {
  const colors = useColors();
  const [characterFailed, setCharacterFailed] = React.useState(false);
  const [photoFailed, setPhotoFailed] = React.useState(false);

  const charSeed = seed || name || 'edlight';
  React.useEffect(() => setCharacterFailed(false), [charSeed]);

  // Only trust a real remote photo URL; blank/relative values fall through to
  // the generated character (and a broken photo retries as the robot on error).
  const photoUri = typeof uri === 'string' && /^https?:\/\//i.test(uri.trim()) ? uri.trim() : null;
  React.useEffect(() => setPhotoFailed(false), [photoUri]);

  const characterUri = `https://robohash.org/${encodeURIComponent(charSeed)}.png?set=${ROBOHASH_SET}&size=128x128`;

  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.azureSoft }}
    >
      {photoUri && !photoFailed ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size }}
          onError={() => setPhotoFailed(true)}
          accessibilityLabel={name || 'Avatar'}
        />
      ) : characterFailed ? (
        <PixelIdenticon seed={charSeed} size={size} />
      ) : (
        <Image
          source={{ uri: characterUri }}
          style={{ width: size, height: size }}
          onError={() => setCharacterFailed(true)}
          accessibilityLabel={name || 'Avatar'}
        />
      )}
    </View>
  );
}
