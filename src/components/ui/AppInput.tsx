import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  TextInputProps,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '../../theme/useTheme';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  isPassword?: boolean;
  onToggleSecure?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function AppInput({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  textContentType,
  isPassword,
  onToggleSecure,
  containerStyle,
  inputStyle,
  icon,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const { colors, darkMode, isRTL } = useTheme();

  const fieldBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const fieldBorder = colors.border;
  const focusBorder = colors.primary;
  const focusBg = colors.primarySoft;
  const labelColor = colors.textSecondary;
  const placeholderColor = colors.textSecondary + '80';
  const textAlign = isRTL ? 'right' as const : 'left' as const;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };
  const handleBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const animBorderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [fieldBorder, focusBorder],
  });

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <AppText style={[styles.label, { color: labelColor, textAlign }]}>
          {label}
        </AppText>
      )}
      <Animated.View
        style={[
          styles.field,
          { backgroundColor: focused ? focusBg : fieldBg, borderColor: animBorderColor },
        ]}
      >
        {icon && !isPassword && <View style={styles.leftIcon}>{icon}</View>}

        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary, textAlign },
            inputStyle,
            (icon && !isPassword) ? { paddingLeft: 8 } : {},
          ]}
          accessibilityLabel={label ?? placeholder ?? 'Text input'}
          accessibilityHint={isPassword ? 'Password field' : undefined}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          textContentType={textContentType}
          onFocus={handleFocus}
          onBlur={handleBlur}
          selectionColor={colors.primary}
          textAlign={textAlign}
          {...rest}
        />

        {isPassword && onToggleSecure && (
          <TouchableOpacity onPress={onToggleSecure} style={styles.icon} activeOpacity={0.7}>
            <Ionicons
              name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    height: '100%',
  },
  leftIcon: {
    marginRight: 8,
  },
  icon: {
    padding: 6,
    marginLeft: 4,
  },
});