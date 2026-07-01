import React from 'react';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { useTheme } from '../theme/useTheme';
import { useAppStore } from '../store/app.store';
import { translations } from '../constants/translations';
import type { ProfileStackScreenProps } from '../navigation/types';

type Props = ProfileStackScreenProps<'Settings'>;

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language] as any;

  return (
    <Screen style={{ flex: 1 }}>
      <ScreenHeader title={t.preferences} onBack={() => navigation.goBack()} />
      <AppText style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary, fontSize: 15 }}>
        {language === 'ar' ? 'الإعدادات متاحة في صفحة الملف الشخصي' : 'Settings are available on the Profile page'}
      </AppText>
    </Screen>
  );
}
