import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Centers content in a capped-width column on tablets, full-bleed on phones
 * (iPad / large-screen support, 1.2.0). Drop this inside a screen's ScrollView
 * content (or as a FlatList's contentContainerStyle wrapper) so cards and text
 * stop stretching edge-to-edge on iPad.
 *
 * On phones `maxWidth` resolves to Infinity → behaves like a plain full-width
 * View, so existing phone layouts are untouched.
 */
export default function ContentContainer({
  children,
  kind = 'readable',
  style,
}: {
  children: React.ReactNode;
  kind?: 'readable' | 'form';
  style?: StyleProp<ViewStyle>;
}) {
  const { contentMaxWidth } = useResponsive();
  const maxWidth = contentMaxWidth(kind);
  return (
    <View style={[{ width: '100%', alignSelf: 'center', maxWidth }, style]}>
      {children}
    </View>
  );
}

/**
 * Style-only variant for FlatList `contentContainerStyle` (which takes a style,
 * not a wrapper component). Centers the list column on tablets. Combine with the
 * list's existing padding via an array.
 */
export function useContentContainerStyle(kind: 'readable' | 'form' = 'readable'): ViewStyle {
  const { contentMaxWidth } = useResponsive();
  const maxWidth = contentMaxWidth(kind);
  return maxWidth === Infinity
    ? {}
    : { width: '100%', maxWidth, alignSelf: 'center' };
}
