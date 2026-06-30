import React, { useRef } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Animated,
  Pressable,
} from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../../theme/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'inverted' | 'outlined';

interface Props {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: Props) {
  const { darkMode, colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  const textColor: Record<ButtonVariant, string> = {
    primary: '#0A0F1C',
    secondary: '#FFFFFF',
    tertiary: '#FFFFFF',
    inverted: colors.textPrimary,
    outlined: colors.textPrimary,
  };

  const outlinedBorder = darkMode ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.15)';
  const invertedBg = darkMode ? '#FFFFFF' : colors.surface;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={[
          styles.button,
          styles[variant],
          variant === 'outlined' && { borderColor: outlinedBorder },
          variant === 'inverted' && { backgroundColor: invertedBg },
          (disabled || loading) && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor[variant]} />
        ) : (
          <AppText
            style={[
              styles.text,
              { color: textColor[variant] },
              textStyle,
            ]}
          >
            {title}
          </AppText>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#00C2FF',
  },
  secondary: {
    backgroundColor: '#1E3A8A',
  },
  tertiary: {
    backgroundColor: '#FF3B3B',
  },
  inverted: {
    backgroundColor: '#FFFFFF',
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});