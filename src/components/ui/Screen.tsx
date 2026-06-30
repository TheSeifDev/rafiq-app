import React from 'react';
import { StatusBar, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';

export function Screen({ style, ...props }: ViewProps): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
      <View
        {...props}
        style={[{ flex: 1, backgroundColor: colors.background }, style]}
        accessible
      />
    </SafeAreaView>
  );
}