import React from 'react';
import { View, Text, Image } from 'react-native';

interface AvatarProps {
  name?: string;
  uri?: string | null;
  size?: number;
}

function initialsOf(name: string): string {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'EL'
  );
}

export default function Avatar({ name = '', uri, size = 48 }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);

  // Retry the image if the uri changes (e.g. user re-signs in with Google)
  React.useEffect(() => setFailed(false), [uri]);

  const showImage = !!uri && !failed;

  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#eaf2fb' }}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
          accessibilityLabel={name || 'Avatar'}
        />
      ) : (
        <Text style={{ color: '#0857A6', fontWeight: '800', fontSize: Math.round(size / 3) }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
