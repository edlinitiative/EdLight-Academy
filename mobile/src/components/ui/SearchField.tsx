/**
 * SearchField — the web's search pill: 56 tall, fully rounded, opaque
 * `surface` with a 1px `border` ring, a muted search icon, 16pt input.
 */

import React, { forwardRef } from 'react';
import { View, TextInput, TextInputProps, StyleProp, ViewStyle } from 'react-native';
import { Search, X } from 'lucide-react-native';
import PressableScale from './PressableScale';
import { useTheme } from '../../theme/theme';

export interface SearchFieldProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Shows a clear (×) button while there is text. Label it in the caller's language. */
  clearLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, placeholder, clearLabel, style, ...rest },
  ref,
) {
  const { colors, fonts, radius } = useTheme();
  return (
    <View
      style={[
        {
          height: 56, borderRadius: radius.pill, backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, gap: 10,
        },
        style,
      ]}
    >
      <Search color={colors.muted} size={20} strokeWidth={2.2} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        // The field is a fixed 56pt pill: cap growth so the typed query never clips.
        maxFontSizeMultiplier={1.5}
        style={{ flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 0 }}
        {...rest}
      />
      {clearLabel && value.length > 0 ? (
        <PressableScale
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
        >
          <X color={colors.muted} size={18} strokeWidth={2.4} />
        </PressableScale>
      ) : null}
    </View>
  );
});

export default SearchField;
