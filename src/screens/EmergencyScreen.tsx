import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Platform,
  Share,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { AppText } from "../components/ui/AppText";
import { Screen } from "../components/ui/Screen";
import { useTheme } from "../theme/useTheme";
import { useAppStore } from "../store/app.store";
import { useAuthStore } from "../store/auth.store";
import { patientService } from "../services/patient.service";
import { notificationService } from "../services/notification.service";
import { checkProfileCompleteness } from "../services/profileCompletionChecker";
import { spacing, radius } from "../theme";
import { translations, type AppLanguage } from "../constants/translations";

const BOTTOM_SAFE_SPACING = 110;

type EmergencyCategory = "general" | "medical" | "helpline" | "utility";

interface EmergencyNumber {
  number: string;
  nameKey: keyof typeof translations.en;
  category: EmergencyCategory;
  icon: string;
  color: string;
}

const EGYPTIAN_EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { number: "112", nameKey: "emgNum_112", category: "general", icon: "alert-circle", color: "#ef4444" },
  { number: "123", nameKey: "emgNum_123", category: "general", icon: "shield-checkmark", color: "#eab308" },
  { number: "125", nameKey: "emgNum_125", category: "medical", icon: "medkit", color: "#ef4444" },
  { number: "126", nameKey: "emgNum_126", category: "medical", icon: "flame", color: "#f97316" },
  { number: "153", nameKey: "emgNum_153", category: "medical", icon: "car", color: "#3b82f6" },
  { number: "920033333", nameKey: "emgNum_920033333", category: "medical", icon: "call", color: "#06b6d4" },
  { number: "37717173", nameKey: "emgNum_37717173", category: "medical", icon: "flask", color: "#dc2626" },
  { number: "23624543", nameKey: "emgNum_23624543", category: "medical", icon: "medkit", color: "#ef4444" },
  { number: "27928585", nameKey: "emgNum_27928585", category: "medical", icon: "medkit", color: "#ef4444" },
  { number: "25240054", nameKey: "emgNum_25240054", category: "medical", icon: "medkit", color: "#ef4444" },
  { number: "16000", nameKey: "emgNum_16000", category: "helpline", icon: "people", color: "#8b5cf6" },
  { number: "15555", nameKey: "emgNum_15555", category: "helpline", icon: "medical", color: "#10b981" },
  { number: "15000", nameKey: "emgNum_15000", category: "helpline", icon: "heart", color: "#6366f1" },
  { number: "109", nameKey: "emgNum_109", category: "helpline", icon: "happy", color: "#f472b6" },
  { number: "15200", nameKey: "emgNum_15200", category: "helpline", icon: "person", color: "#ec4899" },
  { number: "28007777", nameKey: "emgNum_28007777", category: "helpline", icon: "shield", color: "#14b8a6" },
  { number: "121", nameKey: "emgNum_121", category: "utility", icon: "flame", color: "#f97316" },
  { number: "128", nameKey: "emgNum_128", category: "utility", icon: "water", color: "#0ea5e9" },
  { number: "122", nameKey: "emgNum_122", category: "utility", icon: "flash", color: "#eab308" },
  { number: "129", nameKey: "emgNum_129", category: "utility", icon: "trash", color: "#64748b" },
  { number: "19888", nameKey: "emgNum_19888", category: "utility", icon: "leaf", color: "#78716c" },
];

const CATEGORY_KEYS: Record<EmergencyCategory, keyof typeof translations.en> = {
  general: "catGeneral",
  medical: "catMedical",
  helpline: "catHelpline",
  utility: "catUtility",
};

const CATEGORY_COLORS: Record<EmergencyCategory, string> = {
  general: "#ef4444",
  medical: "#f97316",
  helpline: "#8b5cf6",
  utility: "#0ea5e9",
};

const CATEGORY_ORDER: EmergencyCategory[] = ["general", "medical", "helpline", "utility"];

interface QuickCallItem {
  number: string;
  nameKey: keyof typeof translations.en;
  icon: string;
  color: string;
}

const QUICK_CALLS_TOP: QuickCallItem[] = [
  { number: "125", nameKey: "quickCallAmbulance", icon: "medkit", color: "#FF3B3B" },
  { number: "123", nameKey: "quickCallPolice", icon: "shield-checkmark", color: "#F59E0B" },
  { number: "126", nameKey: "quickCallFireDept", icon: "flame", color: "#FF6B6B" },
  { number: "920033333", nameKey: "quickCallHealthLine", icon: "call", color: "#00C2FF" },
];

interface FirstAidCard {
  titleKey: keyof typeof translations.en;
  icon: string;
  color: string;
  steps: [keyof typeof translations.en, keyof typeof translations.en, keyof typeof translations.en];
}

const FIRST_AID_CARDS: FirstAidCard[] = [
  { titleKey: "cpr", icon: "heart", color: "#FF3B3B", steps: ["cprStep1", "cprStep2", "cprStep3"] },
  { titleKey: "bleeding", icon: "water", color: "#EF4444", steps: ["bleedingStep1", "bleedingStep2", "bleedingStep3"] },
  { titleKey: "faint", icon: "person", color: "#A78BFA", steps: ["faintStep1", "faintStep2", "faintStep3"] },
  { titleKey: "burn", icon: "flame", color: "#F59E0B", steps: ["burnStep1", "burnStep2", "burnStep3"] },
];

function SectionHeader({ title, icon, iconColor, colors }: {
  title: string; icon: string; iconColor: string; colors: any;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <AppText style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {title}
      </AppText>
    </View>
  );
}

function StatusCard({ icon, iconColor, label, sublabel, isOk, colors }: {
  icon: string; iconColor: string; label: string; sublabel: string; isOk: boolean; colors: any;
}) {
  const dotColor = isOk ? colors.success : colors.danger;
  return (
    <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statusIconWrap, { backgroundColor: iconColor + "14" }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={styles.statusText}>
        <AppText style={[styles.statusLabel, { color: colors.textPrimary }]}>{label}</AppText>
        <AppText style={[styles.statusSub, { color: colors.textSecondary }]}>{sublabel}</AppText>
      </View>
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
    </View>
  );
}

export function EmergencyScreen(): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const session = useAuthStore((s) => s.session);
  const isAr = language === "ar";
  const lang: AppLanguage = isAr ? "ar" : "en";
  const t = translations[lang];
  const insets = useSafeAreaInsets();

  let tabH = 0;
  try { tabH = useBottomTabBarHeight(); } catch { tabH = Platform.OS === "ios" ? 83 : 62; }
  const bottomSpacing = tabH + insets.bottom + 16;

  const [refreshing, setRefreshing] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const profile = await patientService.getProfile(session.user.id);
      if (profile) {
        const [contacts, notifications] = await Promise.all([
          patientService.getEmergencyContacts(profile.id),
          notificationService.getNotifications(session.user.id),
        ]);
        setEmergencyContacts(contacts ?? []);

        const emergencyNotifs = notifications
          .filter((n: any) => n.category === "emergency" || n.severity === "critical")
          .slice(0, 3);
        setRecentAlerts(emergencyNotifs);

        const result = checkProfileCompleteness(
          { profile, emergencyContacts: contacts ?? [] },
          lang,
        );
        setProfileComplete(result.isComplete);
      }
    } catch {
    }
  }, [session?.user.id, lang]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleCall = useCallback((num: string) => {
    Vibration.vibrate(Platform.OS === "ios" ? [0, 40] : 40);
    Linking.openURL(`tel:${num}`);
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const Location = require("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t.validationError, t.locationDenied);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      await Share.share({
        message: isAr
          ? `🚨 موقعي الحالي للطوارئ\n\n📍 ${mapsUrl}`
          : `🚨 My Emergency Location\n\n📍 ${mapsUrl}`,
        url: mapsUrl,
      });
    } catch {
      try {
        await Share.share({
          message: isAr ? "أحتاج مساعدة طبية عاجلة!" : "I need urgent medical help!",
        });
      } catch {
      }
      Alert.alert(t.cancel, t.locationFailed);
    }
  }, [isAr, t]);

  const cardBg = darkMode ? "rgba(26,35,50,0.85)" : colors.surface;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomSpacing }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.danger} />
        }
      >
        {}
        <View style={styles.header}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.danger + "14" }]}>
            <Ionicons name="shield-checkmark" size={26} color={colors.danger} />
          </View>
          <View style={styles.headerText}>
            <AppText style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {t.emergencyCenterTitle}
            </AppText>
            <AppText style={[styles.headerSub, { color: colors.textSecondary }]}>
              {t.emergencyCenterSubtitle}
            </AppText>
          </View>
        </View>

        {}
        <TouchableOpacity activeOpacity={0.88} onPress={() => handleCall("997")} style={styles.sosBtn}>
          <View style={styles.sosInner}>
            <View style={styles.sosIconWrap}>
              <Ionicons name="alert-circle" size={38} color="#fff" />
            </View>
            <View style={styles.sosTextWrap}>
              <AppText style={styles.sosTitle}>{t.sosEmergency}</AppText>
              <AppText style={styles.sosDesc}>{t.sosEmergencyDesc}</AppText>
            </View>
            <View style={styles.sosChevron}>
              <Ionicons
                name={isAr ? "chevron-back" : "chevron-forward"}
                size={20}
                color="rgba(255,255,255,0.6)"
              />
            </View>
          </View>
        </TouchableOpacity>

        {}
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.75}
          style={[styles.shareBtn, { borderColor: colors.primary + "30", backgroundColor: colors.primary + "08" }]}
        >
          <Ionicons name="location-sharp" size={16} color={colors.primary} />
          <AppText style={[styles.shareText, { color: colors.primary }]}>{t.shareMyLocation}</AppText>
        </TouchableOpacity>

        {}
        <View style={styles.grid}>
          {QUICK_CALLS_TOP.map((item) => (
            <TouchableOpacity
              key={item.number}
              activeOpacity={0.82}
              onPress={() => handleCall(item.number)}
              style={[styles.gridCell, { backgroundColor: cardBg, borderColor: colors.border }]}
            >
              <View style={[styles.gridIcon, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <AppText style={[styles.gridNumber, { color: item.color }]}>{item.number}</AppText>
              <AppText style={[styles.gridLabel, { color: colors.textPrimary }]}>
                {t[item.nameKey] as string}
              </AppText>
              <View style={[styles.callPill, { backgroundColor: item.color + "14" }]}>
                <Ionicons name="call" size={11} color={item.color} />
                <AppText style={[styles.callPillText, { color: item.color }]}>{t.call}</AppText>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {}
        {CATEGORY_ORDER.map((cat) => {
          const items = EGYPTIAN_EMERGENCY_NUMBERS.filter((n) => n.category === cat);
          return (
            <View key={cat}>
              <View style={[styles.categoryHeader, { backgroundColor: CATEGORY_COLORS[cat] + "14" }]}>
                <AppText style={[styles.categoryLabel, { color: CATEGORY_COLORS[cat] }]}>
                  {t[CATEGORY_KEYS[cat]] as string}
                </AppText>
              </View>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
                {items.map((item, idx) => (
                  <TouchableOpacity
                    key={item.number}
                    activeOpacity={0.7}
                    onPress={() => handleCall(item.number)}
                    style={[
                      styles.emergencyRow,
                      idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.emergencyIcon, { backgroundColor: item.color + "14" }]}>
                      <Ionicons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={styles.emergencyInfo}>
                      <AppText style={[styles.emergencyName, { color: colors.textPrimary }]}>
                        {t[item.nameKey] as string}
                      </AppText>
                      <AppText style={[styles.emergencyNumber, { color: item.color }]}>
                        {item.number}
                      </AppText>
                    </View>
                    <View style={[styles.callCircle, { backgroundColor: item.color + "14" }]}>
                      <Ionicons name="call" size={16} color={item.color} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {}
        <SectionHeader title={t.emergencyContacts} icon="people" iconColor={colors.primary} colors={colors} />
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          {emergencyContacts.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="person-add-outline" size={22} color={colors.textSecondary + "60"} />
              <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noEmergencyContacts}</AppText>
            </View>
          ) : (
            emergencyContacts.map((contact: any, idx: number) => (
              <TouchableOpacity
                key={contact.id ?? idx}
                activeOpacity={0.7}
                onPress={() => contact.phone && handleCall(contact.phone)}
                style={[
                  styles.contactRow,
                  idx < emergencyContacts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.contactAvatar, { backgroundColor: colors.primary + "14" }]}>
                  <AppText style={[styles.contactInitial, { color: colors.primary }]}>
                    {(contact.name ?? "?")[0]?.toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.contactInfo}>
                  <AppText style={[styles.contactName, { color: colors.textPrimary }]}>
                    {contact.name ?? "—"}
                  </AppText>
                  <AppText style={[styles.contactRelation, { color: colors.textSecondary }]}>
                    {contact.relationship ?? contact.relation ?? "—"}
                    {contact.phone ? ` · ${contact.phone}` : ""}
                  </AppText>
                </View>
                {contact.phone && (
                  <View style={[styles.callCircle, { backgroundColor: colors.success + "14" }]}>
                    <Ionicons name="call" size={16} color={colors.success} />
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {}
        <SectionHeader title={t.activeAlerts} icon="notifications" iconColor={colors.danger} colors={colors} />
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          {recentAlerts.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success + "80"} />
              <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noActiveAlerts}</AppText>
            </View>
          ) : (
            recentAlerts.map((alert: any, idx: number) => (
              <View
                key={alert.id ?? idx}
                style={[
                  styles.alertRow,
                  idx < recentAlerts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.alertDot, { backgroundColor: colors.danger }]} />
                <View style={styles.alertText}>
                  <AppText style={[styles.alertTitle, { color: colors.textPrimary }]}>{alert.title}</AppText>
                  <AppText style={[styles.alertBody, { color: colors.textSecondary }]} numberOfLines={2}>
                    {alert.body}
                  </AppText>
                </View>
              </View>
            ))
          )}
        </View>

        {}
        <SectionHeader title={t.gasDetectionStatus} icon="flame" iconColor="#F59E0B" colors={colors} />
        <StatusCard
          icon="flame-outline"
          iconColor="#F59E0B"
          label={t.gasDetectionStatus}
          sublabel={t.noGasLeaks}
          isOk
          colors={colors}
        />

        {}
        <SectionHeader title={t.fallDetectionStatus} icon="body" iconColor={colors.primary} colors={colors} />
        <StatusCard
          icon="body-outline"
          iconColor={colors.primary}
          label={t.fallDetectionStatus}
          sublabel={t.noFallIncidents}
          isOk
          colors={colors}
        />

        {}
        <SectionHeader title={t.emergencyProtocolStatus} icon="shield-checkmark" iconColor={colors.success} colors={colors} />
        {profileComplete === null ? null : profileComplete ? (
          <StatusCard
            icon="checkmark-circle"
            iconColor={colors.success}
            label={t.emergencyProtocolStatus}
            sublabel={t.medicalProfileComplete}
            isOk
            colors={colors}
          />
        ) : (
          <View style={[styles.protocolIncomplete, { backgroundColor: colors.danger + "10", borderColor: colors.danger + "25" }]}>
            <View style={[styles.protocolIcon, { backgroundColor: colors.danger + "18" }]}>
              <Ionicons name="warning-outline" size={22} color={colors.danger} />
            </View>
            <View style={styles.protocolText}>
              <AppText style={[styles.protocolLabel, { color: colors.danger }]}>{t.medicalProfileIncomplete}</AppText>
              <AppText style={[styles.protocolSub, { color: colors.textSecondary }]}>
                {t.completeProfileForProtection}
              </AppText>
            </View>
          </View>
        )}

        {}
        <SectionHeader title={t.firstAidGuide} icon="medical" iconColor={colors.success} colors={colors} />
        <View style={styles.firstAidList}>
          {FIRST_AID_CARDS.map((item) => (
            <View
              key={item.titleKey}
              style={[styles.firstAidCard, { backgroundColor: cardBg, borderColor: colors.border }]}
            >
              <View style={styles.firstAidHeader}>
                <View style={[styles.firstAidIcon, { backgroundColor: item.color + "14" }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <AppText style={[styles.firstAidTitle, { color: item.color }]}>
                  {t[item.titleKey] as string}
                </AppText>
              </View>
              <View style={[styles.stepsDivider, { borderTopColor: colors.border }]}>
                <AppText style={[styles.stepsLabel, { color: colors.textSecondary }]}>{t.steps}</AppText>
                <View style={styles.stepsCol}>
                  {item.steps.map((stepKey, i) => (
                    <View key={stepKey} style={styles.stepRow}>
                      <View style={[styles.stepBadge, { backgroundColor: item.color + "18" }]}>
                        <AppText style={[styles.stepNum, { color: item.color }]}>{i + 1}</AppText>
                      </View>
                      <AppText style={[styles.stepText, { color: colors.textPrimary }]}>
                        {t[stepKey] as string}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 24, fontWeight: "900", letterSpacing: -0.4 },
  headerSub: { fontSize: 13, fontWeight: "500" },

  sosBtn: {
    backgroundColor: "#FF3B3B",
    borderRadius: radius.xl,
    padding: spacing.lg,
    shadowColor: "#FF3B3B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  sosInner: { flexDirection: "row", alignItems: "center", gap: 14 },
  sosIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  sosTextWrap: { flex: 1, gap: 2 },
  sosTitle: { color: "#fff", fontSize: 19, fontWeight: "900" },
  sosDesc: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  sosChevron: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  shareText: { fontSize: 13, fontWeight: "700" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  gridCell: {
    width: "48%",
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 6,
    alignItems: "flex-start",
  },
  gridIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  gridNumber: { fontSize: 17, fontWeight: "800", letterSpacing: 0.5 },
  gridLabel: { fontSize: 13, fontWeight: "700" },
  callPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  callPillText: { fontSize: 12, fontWeight: "800" },

  categoryHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  categoryLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  emergencyRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  emergencyIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyInfo: { flex: 1, gap: 2 },
  emergencyName: { fontSize: 14, fontWeight: "700" },
  emergencyNumber: { fontSize: 12, fontWeight: "600" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },

  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },

  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    justifyContent: "center",
  },
  emptyText: { fontSize: 13, fontWeight: "500" },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitial: { fontSize: 16, fontWeight: "800" },
  contactInfo: { flex: 1, gap: 2 },
  contactName: { fontSize: 14, fontWeight: "700" },
  contactRelation: { fontSize: 12, fontWeight: "500" },
  callCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  alertText: { flex: 1, gap: 2 },
  alertTitle: { fontSize: 14, fontWeight: "600" },
  alertBody: { fontSize: 12, fontWeight: "500", lineHeight: 18 },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { flex: 1, gap: 2 },
  statusLabel: { fontSize: 14, fontWeight: "700" },
  statusSub: { fontSize: 12, fontWeight: "500" },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  protocolIncomplete: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  protocolIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  protocolText: { flex: 1, gap: 2 },
  protocolLabel: { fontSize: 14, fontWeight: "700" },
  protocolSub: { fontSize: 12, fontWeight: "500" },

  firstAidList: { gap: spacing.sm },
  firstAidCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    padding: spacing.md,
    gap: spacing.sm,
  },
  firstAidHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  firstAidIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  firstAidTitle: { fontSize: 15, fontWeight: "800", flex: 1 },
  stepsDivider: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  stepsLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  stepsCol: { gap: 6 },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontSize: 11, fontWeight: "900" },
  stepText: { flex: 1, fontSize: 13, lineHeight: 20 },
});

export default EmergencyScreen;
