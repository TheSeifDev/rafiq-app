import React, { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/ui/Screen";
import { AppText } from "../components/ui/AppText";
import { spacing, radius } from "../theme";
import { useTheme } from "../theme/useTheme";
import { useAuthStore } from "../store/auth.store";
import { useAppStore } from "../store/app.store";
import {
  patientService,
  type PatientProfile,
} from "../services/patient.service";
import { translations } from "../constants/translations";
import type { ProfileStackScreenProps } from "../navigation/types";

type Props = ProfileStackScreenProps<"ProfileMain">;

// ─── Bottom safe spacing (above floating tab bar) ─────────────
const BOTTOM_SAFE_SPACING = 110;

/* ── Section Card ── */
function SectionCard({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={st.sectionWrap}>
      <AppText style={[st.sectionLabel, { color: colors.textSecondary }]}>
        {title}
      </AppText>
      <View style={[st.sectionCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

/* ── Settings Row ── */
function SettingsRow({
  icon,
  iconColor,
  label,
  onPress,
  rightContent,
  showChevron = true,
  isDestructive = false,
  isLast = false,
  colors,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
  showChevron?: boolean;
  isDestructive?: boolean;
  isLast?: boolean;
  colors: any;
}) {
  const textColor = isDestructive ? colors.danger : colors.textPrimary;
  const resolvedIcon = isDestructive ? colors.danger : (iconColor ?? colors.primary);

  const content = (
    <View style={[st.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={[st.rowIconWrap, { backgroundColor: resolvedIcon + "12" }]}>
        <Ionicons name={icon as any} size={18} color={resolvedIcon} />
      </View>
      <AppText style={[st.rowLabel, { color: textColor }]}>{label}</AppText>
      <View style={st.rowRight}>
        {rightContent}
        {showChevron && !rightContent && (
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary + "60"} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

/* ════════ MAIN PROFILE SCREEN ════════ */
export function ProfileScreen({ navigation }: Props): React.JSX.Element {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const { colors, darkMode } = useTheme();
  const { language, darkMode: isDark, setDarkMode, setLanguage } = useAppStore();
  const t = translations[language] as any;
  const isAr = language === "ar";

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!session?.user.id) return;
    const data = await patientService.getProfile(session.user.id);
    setProfile(data);
  }, [session?.user.id]);

  useEffect(() => { loadProfile().catch(() => undefined); }, [loadProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t.logout,
      isAr ? "هل تريد تسجيل الخروج؟" : "Do you want to sign out?",
      [
        { text: t.cancel, style: "cancel" },
        { text: t.confirm, style: "destructive", onPress: () => signOut() },
      ],
    );
  }, [signOut, t, isAr]);

  const avatarInitial = (profile?.full_name ?? session?.user.email ?? "?")[0]?.toUpperCase();
  const cardBorder = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.scroll, { paddingBottom: BOTTOM_SAFE_SPACING }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ════════ PROFILE HEADER ════════ */}
        <View style={[st.profileHeader, { backgroundColor: darkMode ? "rgba(26,35,50,0.85)" : "rgba(255,255,255,0.92)", borderColor: cardBorder }]}>
          <View style={[st.avatar, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}>
            <AppText style={[st.avatarText, { color: colors.primary }]}>{avatarInitial}</AppText>
          </View>
          <AppText style={[st.userName, { color: colors.textPrimary }]}>{profile?.full_name ?? "—"}</AppText>
          <AppText style={[st.userEmail, { color: colors.textSecondary }]}>{session?.user.email ?? "—"}</AppText>
          {profile?.phone && (
            <AppText style={[st.userPhone, { color: colors.textSecondary }]}>{profile.phone}</AppText>
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate("EmergencyProfile")}
            style={[st.editBtn, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "25" }]}
          >
            <Ionicons name="pencil-outline" size={15} color={colors.primary} />
            <AppText style={[st.editBtnText, { color: colors.primary }]}>{t.editProfile}</AppText>
          </TouchableOpacity>
        </View>

        {/* ════════ PREFERENCES ════════ */}
        <SectionCard title={t.preferences} colors={colors}>
          <SettingsRow
            icon="moon-outline" iconColor="#7C3AED" label={t.darkMode}
            colors={colors} showChevron={false}
            rightContent={
              <Switch value={isDark} onValueChange={setDarkMode}
                trackColor={{ false: "#D1D5DB", true: colors.primary + "50" }}
                thumbColor={isDark ? colors.primary : "#F3F4F6"} />
            }
          />
          <SettingsRow
            icon="language-outline" iconColor="#00C2FF" label={t.language}
            colors={colors} showChevron={false}
            rightContent={
              <View style={st.langToggle}>
                <TouchableOpacity onPress={() => setLanguage("ar")}
                  style={[st.langBtn, language === "ar" && { backgroundColor: colors.primary + "15" }]}>
                  <AppText style={[st.langBtnText, { color: language === "ar" ? colors.primary : colors.textSecondary }]}>عربي</AppText>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLanguage("en")}
                  style={[st.langBtn, language === "en" && { backgroundColor: colors.primary + "15" }]}>
                  <AppText style={[st.langBtnText, { color: language === "en" ? colors.primary : colors.textSecondary }]}>EN</AppText>
                </TouchableOpacity>
              </View>
            }
          />
          <SettingsRow icon="notifications-outline" iconColor="#F59E0B" label={t.notificationsLabel}
            onPress={() => (navigation as any).navigate("NotificationSettings")} colors={colors} isLast />
        </SectionCard>

        {/* ════════ HEALTH DATA ════════ */}
        <SectionCard title={t.healthData} colors={colors}>
          <SettingsRow icon="medical-outline" iconColor="#10B981" label={t.medications}
            onPress={() => navigation.navigate("Medications")} colors={colors} />
          <SettingsRow icon="restaurant-outline" iconColor="#F97316" label={t.foodTitle || (isAr ? "التغذية" : "Nutrition")}
            onPress={() => navigation.navigate("Food")} colors={colors} isLast />
        </SectionCard>

        {/* ════════ SECURITY ════════ */}
        <SectionCard title={t.securitySection} colors={colors}>
          <SettingsRow icon="lock-closed-outline" iconColor="#7C3AED" label={t.changePassword}
            onPress={() => navigation.navigate("ChangePassword")} colors={colors} />
          <SettingsRow icon="shield-outline" iconColor="#00C2FF" label={t.privacyLabel}
            onPress={() => navigation.navigate("Privacy")} colors={colors} isLast />
        </SectionCard>

        {/* ════════ LOGOUT ════════ */}
        <View style={st.logoutSection}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleSignOut}
            style={[st.logoutBtn, { backgroundColor: colors.danger + "0A", borderColor: colors.danger + "20" }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <AppText style={[st.logoutText, { color: colors.danger }]}>{t.logout}</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ────────── STYLES ────────── */
const st = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  // Profile Header
  profileHeader: {
    alignItems: "center",
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 30,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  avatarText: { fontSize: 34, fontWeight: "800" },
  userName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  userEmail: { fontSize: 14, fontWeight: "500" },
  userPhone: { fontSize: 13, fontWeight: "500" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  editBtnText: { fontSize: 13, fontWeight: "700" },

  // Sections
  sectionWrap: { marginBottom: spacing.lg },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: spacing.sm, marginLeft: spacing.xs },
  sectionCard: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },

  // Rows
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm },
  rowIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  rowRight: { flexDirection: "row", alignItems: "center" },

  // Language toggle
  langToggle: { flexDirection: "row", gap: 4 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  langBtnText: { fontSize: 13, fontWeight: "700" },

  // Logout
  logoutSection: { marginBottom: spacing.lg },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: radius.lg, borderWidth: 1 },
  logoutText: { fontSize: 16, fontWeight: "700" },
});
