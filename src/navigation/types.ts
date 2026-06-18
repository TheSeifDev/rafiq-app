import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from "@react-navigation/native";

// ─── Auth Stack ──────────────────────────────────────────────
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  TermsOfService: undefined;
  PrivacyPolicy: undefined;
};

// ─── Main Tab Navigator ──────────────────────────────────────
// Tabs: Home · Emergency · Medications · Chat · Profile
export type MainTabParamList = {
  Home: undefined;
  Emergency: undefined;
  Medications: undefined;
  Chat: undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

// ─── Main Stack (wraps tabs + modal screens) ─────────────────
export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  NotificationCenter: undefined;
  NotificationSettings: undefined;
};

// ─── Profile Stack (nested inside Profile tab) ──────────────
export type ProfileStackParamList = {
  ProfileMain: undefined;
  Settings: undefined;
  Medications: undefined;
  EmergencyProfile: undefined;
  ChangePassword: undefined;
  Privacy: undefined;
  TermsOfService: undefined;
  PrivacyPolicy: undefined;
  Food: undefined;
};

// ─── Screen-prop helpers ────────────────────────────────────
export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type MainStackScreenProps<T extends keyof MainStackParamList> =
  NativeStackScreenProps<MainStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<MainStackParamList>
  >;

export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ProfileStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabParamList>,
      NativeStackScreenProps<MainStackParamList>
    >
  >;
