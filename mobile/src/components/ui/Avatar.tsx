import React from 'react';
import { View, Image } from 'react-native';
import { useColors } from '../../theme/theme';
import GeneratedFace from '../arena/art/avatars/Avatar';

interface AvatarProps {
  name?: string;
  uri?: string | null;
  /** Stable per-user seed for the generated character (prefer uid; falls back to name) */
  seed?: string;
  size?: number;
  /** Corner radius. Defaults to a full circle (size / 2); pass e.g. 14 for a rounded square. */
  radius?: number;
}

// When a user has a real profile photo (Google/Apple `photoURL`) we show it.
// Otherwise everyone gets their generated Arène face (seeded by uid). The
// RoboHash robots are retired: they failed offline and rendered as a black X.

export default function Avatar({ name = '', uri, seed, size = 48, radius }: AvatarProps) {
  const colors = useColors();
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const corner = radius ?? size / 2;

  const charSeed = seed || name || 'edlight';

  // Only trust a real remote photo URL; blank/relative values fall through to
  // the generated character (and a broken photo retries as the robot on error).
  const photoUri = typeof uri === 'string' && /^https?:\/\//i.test(uri.trim()) ? uri.trim() : null;
  React.useEffect(() => setPhotoFailed(false), [photoUri]);

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: corner, backgroundColor: colors.azureSoft }}
    >
      {photoUri && !photoFailed ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size }}
          onError={() => setPhotoFailed(true)}
          accessibilityLabel={name || 'Avatar'}
        />
      ) : (
        // The Arène's generated face (same seed → same student everywhere,
        // matching the web). Drawn locally: no network, no broken image.
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GeneratedFace seed={charSeed} size={size} still framed={false} />
        </View>
      )}
    </View>
  );
}
