import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppText } from "../components/ui/AppText";
import { Screen } from "../components/ui/Screen";
import { spacing, radius } from "../theme";
import { useTheme } from "../theme/useTheme";
import { useAuthStore } from "../store/auth.store";
import { useAppStore } from "../store/app.store";
import { patientService, type PatientProfile } from "../services/patient.service";
import { medicationService, type Medication } from "../services/medication.service";
import { notificationService } from "../services/notification.service";
import { formatMedicationTime, parseMedicationTimes } from "../lib/medications/medicationSchedule";
import { patientContextAggregator, type PatientContext } from "../services/ai/PatientContextAggregator";
import type { MainTabParamList, MainStackParamList } from "../navigation/types";
import { aiManager } from "../lib/ai/orchestration";
import { HomeScreenSkeleton } from '../components/ui/SkeletonBox';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Home">,
  NativeStackScreenProps<MainStackParamList>
>;

const BOTTOM_SAFE_SPACING = 110;

function getGreeting(isAr: boolean): string {
  const hour = new Date().getHours();
  if (isAr) return hour < 12 ? "صباح الخير" : hour < 18 ? "مساء الخير" : "تصبح على صحة";
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function getMedicationTimes(med: Medication): string {
  const parsed = parseMedicationTimes(med.times, med.time_of_day)
    .filter((dose) => dose.kind === "time")
    .map((dose) => dose.kind === "time" ? formatMedicationTime(dose.time) : "");
  return parsed.length > 0 ? parsed.join(", ") : "--";
}

function buildNutritionAdvice(profile: PatientProfile | null, meds: Medication[], isAr: boolean): string[] {
  const hasMeds = meds.length > 0;
  const hasConditions = Boolean(profile?.condition_type || profile?.risk_level);

  if (isAr) {
    return [
      hasConditions ? "اختر وجبات منتظمة ومتوازنة تناسب حالتك الطبية المسجلة." : "حافظ على وجبات متوازنة من البروتين والخضار والحبوب الكاملة.",
      hasMeds ? "راجع تعليمات الدواء قبل الوجبات أو بعدها كما سجلها الطبيب." : "أضف وجبة خفيفة صحية إذا كانت فتراتك بين الوجبات طويلة.",
      "اشرب الماء على مدار اليوم، وزد الكمية مع الحرارة أو النشاط.",
    ];
  }

  return [
    hasConditions ? "Choose steady, balanced meals that match your recorded medical profile." : "Build meals around protein, vegetables, and whole grains.",
    hasMeds ? "Check each medication's meal instructions before taking a dose." : "Use a healthy snack when long gaps between meals affect your energy.",
    "Keep water nearby and increase intake during heat or activity.",
  ];
}

function buildHealthTips(profile: PatientProfile | null, meds: Medication[], isAr: boolean): string[] {
  const tips: string[] = [];
  if (meds.length > 0) {
    tips.push(isAr ? "ثبت أوقات الدواء اليومية لتقليل الجرعات الفائتة." : "Keep medication times consistent to reduce missed doses.");
  }
  if (profile?.blood_type) {
    tips.push(isAr ? "تأكد أن فصيلة الدم محدثة في ملف الطوارئ." : "Make sure your blood type stays current in the emergency profile.");
  }
  if (profile?.birth_date || profile?.age) {
    tips.push(isAr ? "راجع بياناتك الطبية بعد أي زيارة للطبيب." : "Review your medical profile after each doctor visit.");
  }
  tips.push(isAr ? "احتفظ بجهة اتصال طوارئ محدثة وسهلة الوصول." : "Keep an emergency contact updated and easy to reach.");
  return tips;
}

const SectionCard = memo(function SectionCard({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.section}>
      <AppText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</AppText>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
});

const MedicationRow = memo(function MedicationRow({
  med,
  colors,
  isAr,
}: {
  med: Medication;
  colors: ReturnType<typeof useTheme>["colors"];
  isAr: boolean;
}) {
  return (
    <View style={[styles.medRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.medIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="medical-outline" size={18} color={colors.primary} />
      </View>
      <View style={styles.medBody}>
        <AppText style={[styles.medName, { color: colors.textPrimary }]} numberOfLines={1}>
          {med.name}
        </AppText>
        <AppText style={[styles.medMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {[med.dosage, getMedicationTimes(med)].filter(Boolean).join(" • ")}
        </AppText>
      </View>
      <View style={[styles.statusPill, { backgroundColor: colors.success_soft }]}>
        <AppText style={[styles.statusText, { color: colors.success }]}>
          {isAr ? "نشط" : "Active"}
        </AppText>
      </View>
    </View>
  );
});

export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const session = useAuthStore((s) => s.session);
  const { colors } = useTheme();
  const language = useAppStore((s) => s.language);
  const isAr = language === "ar";

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [patientContext, setPatientContextState] = useState<PatientContext | null>(null);

  const loadData = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    const nextProfile = await patientService.getProfile(userId);
    setProfile(nextProfile);
    if (!nextProfile) {
      setMedications([]);
      setUnreadCount(0);
      setPatientContextState(null);
      aiManager.setPatientContext(null);
      return;
    }
    const [meds, notifications] = await Promise.all([
      medicationService.getMedications(nextProfile.id).catch(() => []),
      notificationService.getNotifications(userId).catch(() => []),
    ]);
    setMedications(meds.filter((med) => (med.active ?? med.is_active) !== false));
    setUnreadCount(notifications.filter((item) => !item.is_read).length);

    // *** FIX #3: Isolate patientContextAggregator failure ***
    // Previously, if aggregate() threw (e.g. due to data issues), the entire
    // loadData() would crash and the HomeScreen would show an error.
    // Now it's isolated so the HomeScreen still shows medications & notifications.
    try {
      const pc = await patientContextAggregator.aggregate(nextProfile.id);
      setPatientContextState(pc);
      aiManager.setPatientContext(pc);
    } catch (err) {
      console.warn('[HomeScreen] Patient context aggregation failed (non-fatal):', err);
      aiManager.setPatientContext(null);
    }
  }, [session?.user.id]);

  useEffect(() => {
    loadData()
      .catch(() => undefined)
      .finally(() => setInitialLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const displayName = profile?.full_name?.trim() || session?.user.email?.split("@")[0] || "Rafiq";
  const nutritionAdvice = useMemo(() => buildNutritionAdvice(profile, medications, isAr), [profile, medications, isAr]);
  const healthTips = useMemo(() => buildHealthTips(profile, medications, isAr), [profile, medications, isAr]);
  const insight = useMemo(() => {
    if (medications.length > 0) {
      return isAr
        ? "بناء على أدويتك المسجلة، حافظ على الماء قريباً وتابع مواعيد الجرعات اليوم."
        : "Based on your current medications, keep water nearby and stay on track with today's doses.";
    }
    return isAr
      ? "أكمل ملفك الطبي لتصبح توصيات رفيق أدق وأكثر فائدة."
      : "Complete your medical profile so Rafiq can make guidance more personal and useful.";
  }, [medications.length, isAr]);

  if (initialLoading) {
    return (
      <Screen>
        <View style={[styles.scroll, { backgroundColor: colors.background }]}>
          <HomeScreenSkeleton />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText style={[styles.greeting, { color: colors.textSecondary }]}>
              {getGreeting(isAr)}
            </AppText>
            <AppText style={[styles.heroName, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </AppText>
            <AppText style={[styles.question, { color: colors.textSecondary }]}>
              {isAr ? "كيف تشعر اليوم؟" : "How are you feeling today?"}
            </AppText>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => navigation.navigate("NotificationCenter")}
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <AppText style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</AppText>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <SectionCard title={isAr ? "رؤية رفيق" : "AI Insight"} colors={colors}>
          <View style={styles.insightRow}>
            <View style={[styles.insightIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            </View>
            <AppText style={[styles.insightText, { color: colors.textPrimary }]}>
              {insight}
            </AppText>
          </View>
        </SectionCard>

        <SectionCard title={isAr ? "أدوية اليوم" : "Today's Medications"} colors={colors}>
          {medications.length > 0 ? (
            medications.slice(0, 4).map((med) => (
              <MedicationRow key={med.id} med={med} colors={colors} isAr={isAr} />
            ))
          ) : (
            <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isAr ? "لا توجد أدوية نشطة مسجلة." : "No active medications recorded."}
            </AppText>
          )}
          <TouchableOpacity onPress={() => navigation.navigate("Medications")} style={styles.linkRow}>
            <AppText style={[styles.linkText, { color: colors.primary }]}>
              {isAr ? "إدارة الأدوية" : "Manage medications"}
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </SectionCard>

        <SectionCard title={isAr ? "دليل التغذية" : "Nutrition Guide"} colors={colors}>
          {nutritionAdvice.map((item, idx) => (
            <View key={`nutrition-${idx}`} style={styles.bulletRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <AppText style={[styles.bulletText, { color: colors.textPrimary }]}>{item}</AppText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title={isAr ? "نصائح صحية" : "Health Tips"} colors={colors}>
          {healthTips.map((item, idx) => (
            <View key={`tip-${idx}`} style={styles.bulletRow}>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <AppText style={[styles.bulletText, { color: colors.textPrimary }]}>{item}</AppText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title={isAr ? "إجراءات طوارئ سريعة" : "Emergency Quick Actions"} colors={colors}>
          <View style={styles.quickActions}>
            <TouchableOpacity onPress={() => navigation.navigate("Emergency")} style={[styles.quickButton, { borderColor: colors.border }]}>
              <Ionicons name="call-outline" size={20} color={colors.danger} />
              <AppText style={[styles.quickText, { color: colors.textPrimary }]}>
                {isAr ? "جهات الطوارئ" : "Emergency Contacts"}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate("MainTabs", { screen: "Profile", params: { screen: "EmergencyProfile" } })} style={[styles.quickButton, { borderColor: colors.border }]}>
              <Ionicons name="id-card-outline" size={20} color={colors.primary} />
              <AppText style={[styles.quickText, { color: colors.textPrimary }]}>
                {isAr ? "ملف الطوارئ" : "Emergency Profile"}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate("MainTabs", { screen: "Chat" })} style={[styles.quickButton, { borderColor: colors.border }]}>
              <Ionicons name="help-buoy-outline" size={20} color={colors.warning} />
              <AppText style={[styles.quickText, { color: colors.textPrimary }]}>
                {isAr ? "اسأل رفيق" : "Ask Rafiq"}
              </AppText>
            </TouchableOpacity>
          </View>
        </SectionCard>

        <View style={{ height: BOTTOM_SAFE_SPACING }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1, gap: 3 },
  greeting: { fontSize: 14, fontWeight: "600" },
  heroName: { fontSize: 28, fontWeight: "800", letterSpacing: 0 },
  question: { fontSize: 15, fontWeight: "500" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: spacing.sm },
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  insightText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  medIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  medBody: { flex: 1 },
  medName: { fontSize: 15, fontWeight: "800" },
  medMeta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: "800" },
  emptyText: { fontSize: 14, lineHeight: 20 },
  linkRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2 },
  linkText: { fontSize: 14, fontWeight: "800" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "600" },
  quickActions: { gap: spacing.sm },
  quickButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  quickText: { flex: 1, fontSize: 14, fontWeight: "800" },
});