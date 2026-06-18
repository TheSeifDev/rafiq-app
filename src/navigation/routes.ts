export const Routes = {
  // Auth screens
  Welcome: 'Welcome',
  Login: 'Login',
  SignUp: 'SignUp',
  TermsOfService: 'TermsOfService',
  PrivacyPolicy: 'PrivacyPolicy',

  // Main tabs
  Home: 'Home',
  Emergency: 'Emergency',
  Medications: 'Medications',
  Chat: 'Chat',
  Profile: 'Profile',

  // Profile stack
  ProfileMain: 'ProfileMain',
  Settings: 'Settings',
  EmergencyProfile: 'EmergencyProfile',
  Food: 'Food',
} as const;

export type RouteName = (typeof Routes)[keyof typeof Routes];
