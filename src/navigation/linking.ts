import type { LinkingOptions } from '@react-navigation/native';
import type { MainStackParamList } from './types';

export const linking: LinkingOptions<MainStackParamList> = {
  prefixes: ['rafiq://', 'https://rafiq.app'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: 'home',
          Emergency: 'emergency',
          Medications: 'medications',
          Chat: 'chat',
          Profile: 'profile',
        },
      },
      NotificationCenter: 'notifications',
      NotificationSettings: 'notification-settings',
    },
  },
};
