import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../../theme/useTheme';

interface LoadingOverlayProps {
  text?: string;
}

export function LoadingOverlay({ text }: LoadingOverlayProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessible
      accessibilityLabel={text ?? 'Loading'}
    >
      <ActivityIndicator
        color={colors.primary}
        size="large"
        accessibilityLabel="Loading indicator"
      />
      {text && (
        <AppText style={[styles.text, { color: colors.textSecondary }]}>
          {text}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000055',
    gap: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
