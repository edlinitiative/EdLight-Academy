import React from 'react';
import { View, Image } from 'react-native';

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
  const rows = React.useMemo(() => identiconRows(seed), [seed]);
  const cell = Math.round((size * 0.6) / 5);
  return (
    <View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((on, c) => (
            <View
              key={c}
              style={{ width: cell, height: cell, backgroundColor: on ? '#0857A6' : 'transparent' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function Avatar({ name = '', uri, seed, size = 48 }: AvatarProps) {
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const [characterFailed, setCharacterFailed] = React.useState(false);

  const charSeed = seed || name || 'edlight';

  // Retry images if the source changes (e.g. user re-signs in with Google)
  React.useEffect(() => setPhotoFailed(false), [uri]);
  React.useEffect(() => setCharacterFailed(false), [charSeed]);

  const showPhoto = !!uri && !photoFailed;
  const characterUri = `https://api.dicebear.com/9.x/pixel-art/png?seed=${encodeURIComponent(charSeed)}&size=96`;

  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#eaf2fb' }}
    >
      {showPhoto ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
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
