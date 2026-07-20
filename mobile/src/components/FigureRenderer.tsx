import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'lucide-react-native';
import { useColors } from '../theme/theme';

interface FigureRendererProps {
  description: string;
}

export default function FigureRenderer({ description }: FigureRendererProps) {
  const colors = useColors();
  return (
    <View style={{ marginTop: 12, marginBottom: 4 }}>
      {/* Label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Image color={colors.muted} size={12} />
        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Figure
        </Text>
      </View>

      {/* Description box */}
      <View
        style={{
          backgroundColor: colors.azureSoft,
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.azureBorder,
          borderLeftWidth: 3,
          borderLeftColor: colors.azure,
        }}
      >
        <Text style={{ fontSize: 13, color: colors.azure, lineHeight: 20 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}
