import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'lucide-react-native';

interface FigureRendererProps {
  description: string;
}

export default function FigureRenderer({ description }: FigureRendererProps) {
  return (
    <View style={{ marginTop: 12, marginBottom: 4 }}>
      {/* Label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Image color="#6b7280" size={12} />
        <Text style={{ fontSize: 10, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Figure
        </Text>
      </View>

      {/* Description box */}
      <View
        style={{
          backgroundColor: '#eff6ff',
          borderRadius: 12,
          padding: 12,
          borderLeftWidth: 3,
          borderLeftColor: '#0857A6',
        }}
      >
        <Text style={{ fontSize: 13, color: '#1e40af', lineHeight: 20 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}
