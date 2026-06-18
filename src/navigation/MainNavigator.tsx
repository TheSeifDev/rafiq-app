import React, { useEffect } from "react";
import { AppState, BackHandler, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createNavigationContainerRef } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HomeScreen } from "../screens/HomeScreen";
import { EmergencyScreen } from "../screens/EmergencyScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { MedicationsScreen } from "../screens/MedicationsScreen";
import { EmergencyProfileScreen } from "../screens/EmergencyProfileScreen";
import { ChangePasswordScreen } from "../screens/ChangePasswordScreen";
import { PrivacyScreen } from "../screens/PrivacyScreen";
import { NotificationCenterScreen } from "../screens/NotificationCenterScreen";
import { NotificationSettingsScreen } from "../screens/NotificationSettingsScreen";
import { BottomTabBar } from "../components/ui/BottomTabBar";
import { useAppStore } from "../store/app.store";
import { translations } from "../constants/translations";
import { PrivacyPolicyScreen } from "../screens/PrivacyPolicyScreen";
import { TermsOfServiceScreen } from "../screens/TermsOfServiceScreen";
import { FoodScreen } from "../screens/FoodScreen";
import { notificationService } from "../services/notification.service";
import { patientService } from "../services/patient.service";
import { medicationService } from "../services/medication.service";
import { patientValidationService, type ProfileValidationResult } from "../services/patient/patientValidation.service";
import { useAuthStore } from "../store/auth.store";
import { useTheme } from "../theme/useTheme";
import { AppText } from "../components/ui/AppText";
import { spacing, radius } from "../theme";
import type {
  MainTabParamList,
  MainStackParamList,
  ProfileStackParamList,
} from "./types";

// ─── Module-level navigation ref ─────────────────────────────
export const navigationRef = createNavigationContainerRef<MainStackParamList>();

const Tab = createBottomTabNavigator<MainTabParamList>();
const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const DELIVERED_NOTIFICATION_KEYS = "rafiq_delivered_local_notifications_v1";
const PROFILE_REMINDER_LAST_SHOWN = "rafiq_profile_reminder_last_shown_v2";
const PROFILE_REMINDER_DISMISSED = "rafiq_profile_reminder_dismissed_v2";
const PROFILE_REMINDER_INTERVAL_MS = 5 * 60 * 1000;

async function markLocalNotificationDelivered(key: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(DELIVERED_NOTIFICATION_KEYS);
  let parsed: Record<string, string> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, string>;
    } catch {
      parsed = {};
    }
  }
  if (parsed[key]) return false;
  parsed[key] = new Date().toISOString();
  await AsyncStorage.setItem(DELIVERED_NOTIFICATION_KEYS, JSON.stringify(parsed));
  return true;
}

function navigateFromNotificationData(data: Record<string, unknown> | undefined): void {
  if (!navigationRef.isReady()) return;
  const screen = typeof data?.screen === "string" ? data.screen : "NotificationCenter";

  if (screen === "Medications") {
    navigationRef.navigate("MainTabs", { screen: "Medications" });
    return;
  }
  if (screen === "Emergency") {
    navigationRef.navigate("MainTabs", { screen: "Emergency" });
    return;
  }
  if (screen === "Chat") {
    navigationRef.navigate("MainTabs", { screen: "Chat" });
    return;
  }
  if (screen === "NotificationSettings") {
    navigationRef.navigate("NotificationSettings");
    return;
  }
  // Vitals removed — redirect to Home
  if (screen === "Vitals") {
    navigationRef.navigate("MainTabs", { screen: "Home" });
    return;
  }
  navigationRef.navigate("NotificationCenter");
}

// ─── Profile Stack (nested inside Profile tab) ──────────────
function ProfileStackNavigator(): React.JSX.Element {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStackNav.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="Medications"
        component={MedicationsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="EmergencyProfile"
        component={EmergencyProfileScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ animation: "slide_from_right" }}
      />
      <ProfileStackNav.Screen
        name="Food"
        component={FoodScreen}
        options={{ animation: "slide_from_right" }}
      />
    </ProfileStackNav.Navigator>
  );
}

// ─── Bottom Tabs ─────────────────────────────────────────────
// Tabs: Home · Emergency · Medications · Chat · Profile
function MainTabs(): React.JSX.Element {
  const language = useAppStore((s) => s.language);
  const t = translations[language];

  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t.home }}
      />
      <Tab.Screen
        name="Emergency"
        component={EmergencyScreen}
        options={{ title: t.emergency }}
      />
      <Tab.Screen
        name="Medications"
        component={MedicationsScreen}
        options={{ title: t.medications }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: t.chat }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ title: t.profile }}
      />
    </Tab.Navigator>
  );
}

// ─── Main Navigator (Tabs + modal/stack screens) ─────────────
function ProfileCompletionReminder(): React.JSX.Element | null {
  const session = useAuthStore((s) => s.session);
  const language = useAppStore((s) => s.language);
  const { colors } = useTheme();
  const [result, setResult] = React.useState<ProfileValidationResult | null>(null);
  const [visible, setVisible] = React.useState(false);

  const runValidation = React.useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    if ((await AsyncStorage.getItem(PROFILE_REMINDER_DISMISSED)) === "true") return;

    const lastShownRaw = await AsyncStorage.getItem(PROFILE_REMINDER_LAST_SHOWN);
    const lastShown = lastShownRaw ? Number(lastShownRaw) : 0;
    if (Date.now() - lastShown < PROFILE_REMINDER_INTERVAL_MS) return;

    const profile = await patientService.getProfile(userId);
    if (!profile) return;

    const [contacts, meds, conditions] = await Promise.all([
      patientService.getEmergencyContacts(profile.id).catch(() => []),
      medicationService.getMedications(profile.id).catch(() => []),
      patientService.getConditions(profile.id).catch(() => []),
    ]);

    const validation = patientValidationService.validatePatientProfile({
      ...profile,
      emergency_contact: contacts.length > 0 ? contacts : profile.emergency_contact,
      medications: meds,
      conditions,
    });

    if (!validation.isComplete) {
      setResult(validation);
      setVisible(true);
      await AsyncStorage.setItem(PROFILE_REMINDER_LAST_SHOWN, String(Date.now()));
    }
  }, [session?.user.id]);

  useEffect(() => {
    runValidation().catch(() => undefined);
    const interval = setInterval(() => {
      if (AppState.currentState === "active") runValidation().catch(() => undefined);
    }, PROFILE_REMINDER_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runValidation().catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [runValidation]);

  if (!result) return null;

  const isAr = language === "ar";
  const close = async () => {
    setVisible(false);
    await AsyncStorage.setItem(PROFILE_REMINDER_DISMISSED, "true");
  };
  const completeNow = () => {
    setVisible(false);
    navigationRef.navigate("MainTabs", { screen: "Profile", params: { screen: "EmergencyProfile" } });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={reminderStyles.backdrop}>
        <View style={[reminderStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={[reminderStyles.title, { color: colors.textPrimary }]}>
            {isAr ? "أكمل ملفك الطبي" : "Complete your medical profile"}
          </AppText>
          <AppText style={[reminderStyles.body, { color: colors.textSecondary }]}>
            {isAr
              ? `ملفك الطبي مكتمل بنسبة ${result.completionPercentage}%.`
              : `Your medical profile is only ${result.completionPercentage}% complete.`}
          </AppText>
          <View style={reminderStyles.missingList}>
            {result.missingFields.slice(0, 5).map((field) => (
              <AppText key={field} style={[reminderStyles.missing, { color: colors.textPrimary }]}>
                {`\u2022 ${field}`}
              </AppText>
            ))}
          </View>
          <View style={reminderStyles.actions}>
            <TouchableOpacity onPress={close} style={[reminderStyles.secondaryButton, { borderColor: colors.border }]}>
              <AppText style={[reminderStyles.secondaryText, { color: colors.textSecondary }]}>
                {isAr ? "لاحقا" : "Later"}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={completeNow} style={[reminderStyles.primaryButton, { backgroundColor: colors.primary }]}>
              <AppText style={reminderStyles.primaryText}>
                {isAr ? "أكمل الآن" : "Complete Now"}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function MainNavigator(): React.JSX.Element {
  useEffect(() => {
    async function lockOrientation() {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      } catch (error) {
        console.log("Orientation lock failed:", error);
      }
    }
    lockOrientation();
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, []);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const kind = typeof data?.kind === "string" ? data.kind : undefined;
        const userId = typeof data?.userId === "string" ? data.userId : undefined;
        const notificationKey =
          typeof data?.notificationKey === "string"
            ? data.notificationKey
            : notification.request.identifier;

        if (kind !== "medication_reminder" || !userId) return;

        markLocalNotificationDelivered(notificationKey)
          .then((shouldCreate) => {
            if (!shouldCreate) return;
            return notificationService.createNotification({
              user_id: userId,
              title: notification.request.content.title ?? "Medication reminder",
              body: notification.request.content.body ?? "Time for your medication.",
              type: "medication_reminder",
            });
          })
          .catch(() => undefined);
      },
    );

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        navigateFromNotificationData(response.notification.request.content.data as Record<string, unknown> | undefined);
      },
    );
    return () => {
      receivedSub.remove();
      sub.remove();
    };
  }, []);

  return (
    <>
      <MainStack.Navigator
        screenOptions={{ headerShown: false, orientation: "portrait" }}
      >
        <MainStack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ orientation: "portrait" }}
        />
        <MainStack.Screen
          name="NotificationCenter"
          component={NotificationCenterScreen}
          options={{ animation: "slide_from_right", orientation: "portrait" }}
        />
        <MainStack.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
          options={{ animation: "slide_from_right", orientation: "portrait" }}
        />
      </MainStack.Navigator>
      <ProfileCompletionReminder />
    </>
  );
}

const reminderStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800" },
  body: { fontSize: 14, lineHeight: 20 },
  missingList: { gap: spacing.xs },
  missing: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "700" },
});
