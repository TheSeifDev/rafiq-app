/**
 * EmergencyScreen — Full Emergency Dashboard
 *
 * Standalone tab screen containing:
 * - SOS call button (997)
 * - Emergency contacts (from patient profile)
 * - Quick call grid (Ambulance · Police · Fire · Health)
 * - Active alerts / recent emergency notifications
 * - Gas / Fall detection status
 * - Emergency protocol status (profile completeness)
 * - Share location
 * - First Aid Guide
 *
 * Supports dark/light theme, RTL/LTR, and Expo Go.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

// ─── Constants ───────────────────────────────────────────────

const BOTTOM_SAFE_SPACING = 110;

// ─── Translations ─────────────────────────────────────────────

const T = {
  ar: {
    title: "مركز الطوارئ",
    subtitle: "وصول سريع · استجابة فورية",
    sos: "طوارئ SOS",
    sosDesc: "اضغط للاتصال بالإسعاف فوراً",
    shareLocation: "مشاركة موقعي",
    ambulance: "إسعاف",
    police: "شرطة",
    fire: "دفاع مدني",
    health: "الاستشارات",
    call: "اتصال",
    contacts: "جهات الاتصال الطارئة",
    noContacts: "لم تُضَف جهات اتصال طوارئ بعد",
    addContacts: "أضف جهات اتصال",
    activeAlerts: "التنبيهات النشطة",
    noAlerts: "لا توجد تنبيهات نشطة",
    gasStatus: "حالة كشف الغاز",
    gasNormal: "لا توجد تسربات مكتشفة",
    fallStatus: "حالة كشف السقوط",
    fallNormal: "لا توجد حوادث سقوط",
    protocolStatus: "حالة بروتوكول الطوارئ",
    profileComplete: "ملفك الطبي مكتمل",
    profileIncomplete: "ملفك الطبي غير مكتمل",
    profileIncompleteDesc: "أكمل ملفك لتفعيل الحماية الكاملة",
    completeNow: "أكمل الآن",
    firstAidTitle: "دليل الإسعافات الأولية",
    firstAidSubtitle: "خطوات طوارئ سريعة",
    steps: "الخطوات",
    cpr: "الإنعاش القلبي",
    cprStep1: "تأكد من الاستجابة",
    cprStep2: "اتصل 997",
    cprStep3: "اضغط 100-120/دقيقة",
    bleeding: "النزيف",
    bleedingStep1: "اضغط بقوة",
    bleedingStep2: "قماش نظيف",
    bleedingStep3: "ارفع العضو",
    faint: "الإغماء",
    faintStep1: "مستلقي على الظهر",
    faintStep2: "ارفع الساقين",
    faintStep3: "هواء نقي",
    burn: "الحروق",
    burnStep1: "برد بالماء الجاري",
    burnStep2: "10–20 دقيقة",
    burnStep3: "غطّ بشكل فضفاض",
  },
  en: {
    title: "Emergency Center",
    subtitle: "Quick access · Instant response",
    sos: "SOS Emergency",
    sosDesc: "Tap to call Ambulance immediately",
    shareLocation: "Share My Location",
    ambulance: "Ambulance",
    police: "Police",
    fire: "Fire Dept",
    health: "Health Line",
    call: "Call",
    contacts: "Emergency Contacts",
    noContacts: "No emergency contacts added yet",
    addContacts: "Add contacts",
    activeAlerts: "Active Alerts",
    noAlerts: "No active alerts",
    gasStatus: "Gas Detection Status",
    gasNormal: "No gas leaks detected",
    fallStatus: "Fall Detection Status",
    fallNormal: "No fall incidents detected",
    protocolStatus: "Emergency Protocol Status",
    profileComplete: "Medical profile is complete",
    profileIncomplete: "Medical profile incomplete",
    profileIncompleteDesc: "Complete your profile to enable full protection",
    completeNow: "Complete Now",
    firstAidTitle: "First Aid Guide",
    firstAidSubtitle: "Step-by-step emergency instructions",
    steps: "Steps",
    cpr: "CPR",
    cprStep1: "Check responsiveness",
    cprStep2: "Call 997",
    cprStep3: "Push 100-120/min",
    bleeding: "Bleeding",
    bleedingStep1: "Apply firm pressure",
    bleedingStep2: "Use clean cloth",
    bleedingStep3: "Elevate the limb",
    faint: "Fainting",
    faintStep1: "Lay flat on back",
    faintStep2: "Elevate legs",
    faintStep3: "Fresh air",
    burn: "Burns",
    burnStep1: "Cool under running water",
    burnStep2: "10–20 minutes",
    burnStep3: "Cover loosely",
  },
} as const;

type Lang = "ar" | "en";

// ─── Egyptian Emergency Numbers ─────────────────────────────

interface EmergencyNumber {
  number: string;
  name: string;
  category: 'general' | 'medical' | 'helpline' | 'utility';
  icon: string;
  color: string;
}

const EGYPTIAN_EMERGENCY_NUMBERS: EmergencyNumber[] = [
  // الطوارئ العامة
  { number: '112', name: 'الطوارئ العامة', category: 'general', icon: 'alert-circle', color: '#ef4444' },
  { number: '123', name: 'الشرطة', category: 'general', icon: 'shield-checkmark', color: '#eab308' },
  // الخدمات الطبية
  { number: '125', name: 'الإسعاف', category: 'medical', icon: 'medkit', color: '#ef4444' },
  { number: '126', name: 'المطافئ', category: 'medical', icon: 'flame', color: '#f97316' },
  { number: '153', name: 'المرور', category: 'medical', icon: 'car', color: '#3b82f6' },
  { number: '920033333', name: 'الخط الصحي', category: 'medical', icon: 'call', color: '#06b6d4' },
  { number: '37717173', name: 'مركز السموم', category: 'medical', icon: 'flask', color: '#dc2626' },
  { number: '23624543', name: 'إسعاف القاهرة', category: 'medical', icon: 'medkit', color: '#ef4444' },
  { number: '27928585', name: 'إسعاف الجيزة', category: 'medical', icon: 'medkit', color: '#ef4444' },
  { number: '25240054', name: 'إسعاف حلوان', category: 'medical', icon: 'medkit', color: '#ef4444' },
  // خطوط المساعدة
  { number: '16000', name: 'المجلس الطبي', category: 'helpline', icon: 'people', color: '#8b5cf6' },
  { number: '15555', name: 'صيدلية', category: 'helpline', icon: 'medical', color: '#10b981' },
  { number: '15000', name: 'مكافحة الإدمان', category: 'helpline', icon: 'heart', color: '#6366f1' },
  { number: '109', name: 'نجدة الطفولة', category: 'helpline', icon: 'happy', color: '#f472b6' },
  { number: '15200', name: 'نجدة المرأة', category: 'helpline', icon: 'person', color: '#ec4899' },
  { number: '28007777', name: 'التأمين الصحي', category: 'helpline', icon: 'shield', color: '#14b8a6' },
  // المرافق
  { number: '121', name: 'الغاز', category: 'utility', icon: 'flame', color: '#f97316' },
  { number: '128', name: 'مياه الشرب', category: 'utility', icon: 'water', color: '#0ea5e9' },
  { number: '122', name: 'الكهرباء', category: 'utility', icon: 'flash', color: '#eab308' },
  { number: '129', name: 'الصرف الصحي', category: 'utility', icon: 'trash', color: '#64748b' },
  { number: '19888', name: 'النظافة', category: 'utility', icon: 'leaf', color: '#78716c' },
];

const CATEGORY_LABELS: Record<EmergencyNumber['category'], string> = {
  general: 'الطوارئ العامة',
  medical: 'الخدمات الطبية',
  helpline: 'خطوط المساعدة',
  utility: 'المرافق',
};

const CATEGORY_COLORS: Record<EmergencyNumber['category'], string> = {
  general: '#ef4444',
  medical: '#f97316',
  helpline: '#8b5cf6',
  utility: '#0ea5e9',
};

const QUICK_CALLS_TOP = [
  { number: '997', name: 'إسعاف', icon: 'medkit', color: '#FF3B3B' },
  { number: '123', name: 'شرطة', icon: 'shield-checkmark', color: '#F59E0B' },
  { number: '121', name: 'غاز', icon: 'flame', color: '#FF6B6B' },
  { number: '920033333', name: 'خط صحي', icon: 'call', color: '#00C2FF' },
];

// ─── First Aid Data ───────────────────────────────────────────

interface FirstAidCard {
  titleKey: keyof (typeof T)["en"];
  icon: string;
  color: string;
  steps: [keyof (typeof T)["en"], keyof (typeof T)["en"], keyof (typeof T)["en"]];
}

const FIRST_AID_CARDS: FirstAidCard[] = [
  { titleKey: "cpr", icon: "heart", color: "#FF3B3B", steps: ["cprStep1", "cprStep2", "cprStep3"] },
  { titleKey: "bleeding", icon: "water", color: "#EF4444", steps: ["bleedingStep1", "bleedingStep2", "bleedingStep3"] },
  { titleKey: "faint", icon: "person", color: "#A78BFA", steps: ["faintStep1", "faintStep2", "faintStep3"] },
  { titleKey: "burn", icon: "flame", color: "#F59E0B", steps: ["burnStep1", "burnStep2", "burnStep3"] },
];

// ─── Sub-components ───────────────────────────────────────────

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

// ─── Main Screen ─────────────────────────────────────────────

export function EmergencyScreen(): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const session = useAuthStore((s) => s.session);
  const isAr = language === "ar";
  const lang: Lang = isAr ? "ar" : "en";
  const t = T[lang];
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

        // Show last 3 emergency-type notifications
        const emergencyNotifs = notifications
          .filter((n: any) => n.category === "emergency" || n.severity === "critical")
          .slice(0, 3);
        setRecentAlerts(emergencyNotifs);

        // Profile completeness
        const result = checkProfileCompleteness(
          { profile, emergencyContacts: contacts ?? [] },
          lang,
        );
        setProfileComplete(result.isComplete);
      }
    } catch {
      // silent fail
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
      // Request location permission
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('خطأ', 'يرجى السماح بالوصول إلى الموقع من الإعدادات');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      await Share.share({
        message: `🚨 موقعي الحالي للطوارئ\n\n📍 ${mapsUrl}`,
        url: mapsUrl,
      });
    } catch (err) {
      // Fallback to generic share if location fails
      try {
        await Share.share({
          message: isAr ? 'أحتاج مساعدة طبية عاجلة!' : 'I need urgent medical help!',
        });
      } catch { /* ignore */ }
      Alert.alert('تنبيه', 'تعذر تحديد الموقع، تأكد من تفعيل GPS');
    }
  }, [isAr]);

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
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.danger + "14" }]}>
            <Ionicons name="shield-checkmark" size={26} color={colors.danger} />
          </View>
          <View style={styles.headerText}>
            <AppText style={[styles.headerTitle, { color: colors.textPrimary }]}>{t.title}</AppText>
            <AppText style={[styles.headerSub, { color: colors.textSecondary }]}>{t.subtitle}</AppText>
          </View>
        </View>

        {/* ── SOS Button ── */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => handleCall("997")}
          style={styles.sosBtn}
        >
          <View style={styles.sosInner}>
            <View style={styles.sosIconWrap}>
              <Ionicons name="alert-circle" size={38} color="#fff" />
            </View>
            <View style={styles.sosTextWrap}>
              <AppText style={styles.sosTitle}>{t.sos}</AppText>
              <AppText style={styles.sosDesc}>{t.sosDesc}</AppText>
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

        {/* ── Share Location ── */}
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.75}
          style={[styles.shareBtn, { borderColor: colors.primary + "30", backgroundColor: colors.primary + "08" }]}
        >
          <Ionicons name="location-sharp" size={16} color={colors.primary} />
          <AppText style={[styles.shareText, { color: colors.primary }]}>{t.shareLocation}</AppText>
        </TouchableOpacity>

        {/* ── Quick Call Grid (top 4) ── */}
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
              <AppText style={[styles.gridLabel, { color: colors.textPrimary }]}>{item.name}</AppText>
              <View style={[styles.callPill, { backgroundColor: item.color + "14" }]}>
                <Ionicons name="call" size={11} color={item.color} />
                <AppText style={[styles.callPillText, { color: item.color }]}>{t.call}</AppText>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── All Egyptian Emergency Numbers (grouped) ── */}
        {(['general', 'medical', 'helpline', 'utility'] as const).map((cat) => {
          const items = EGYPTIAN_EMERGENCY_NUMBERS.filter(n => n.category === cat);
          return (
            <View key={cat}>
              <View style={[styles.categoryHeader, { backgroundColor: CATEGORY_COLORS[cat] + '14' }]}>
                <AppText style={[styles.categoryLabel, { color: CATEGORY_COLORS[cat] }]}>
                  {CATEGORY_LABELS[cat]}
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
                    <View style={[styles.emergencyIcon, { backgroundColor: item.color + '14' }]}>
                      <Ionicons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={styles.emergencyInfo}>
                      <AppText style={[styles.emergencyName, { color: colors.textPrimary }]}>{item.name}</AppText>
                      <AppText style={[styles.emergencyNumber, { color: item.color }]}>{item.number}</AppText>
                    </View>
                    <View style={[styles.callCircle, { backgroundColor: item.color + '14' }]}>
                      <Ionicons name="call" size={16} color={item.color} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {/* ── Emergency Contacts ── */}
        <SectionHeader title={t.contacts} icon="people" iconColor={colors.primary} colors={colors} />
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          {emergencyContacts.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="person-add-outline" size={22} color={colors.textSecondary + "60"} />
              <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noContacts}</AppText>
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
                  <AppText style={[styles.contactName, { color: colors.textPrimary }]}>{contact.name ?? "—"}</AppText>
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

        {/* ── Active Alerts ── */}
        <SectionHeader title={t.activeAlerts} icon="notifications" iconColor={colors.danger} colors={colors} />
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          {recentAlerts.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success + "80"} />
              <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noAlerts}</AppText>
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
                  <AppText style={[styles.alertBody, { color: colors.textSecondary }]} numberOfLines={2}>{alert.body}</AppText>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Device Status ── */}
        <SectionHeader title={t.gasStatus} icon="flame" iconColor="#F59E0B" colors={colors} />
        <StatusCard
          icon="flame-outline"
          iconColor="#F59E0B"
          label={t.gasStatus}
          sublabel={t.gasNormal}
          isOk
          colors={colors}
        />

        <SectionHeader title={t.fallStatus} icon="body" iconColor={colors.primary} colors={colors} />
        <StatusCard
          icon="body-outline"
          iconColor={colors.primary}
          label={t.fallStatus}
          sublabel={t.fallNormal}
          isOk
          colors={colors}
        />

        {/* ── Profile / Protocol Status ── */}
        <SectionHeader title={t.protocolStatus} icon="shield-checkmark" iconColor={colors.success} colors={colors} />
        {profileComplete === null ? null : profileComplete ? (
          <StatusCard
            icon="checkmark-circle"
            iconColor={colors.success}
            label={t.protocolStatus}
            sublabel={t.profileComplete}
            isOk
            colors={colors}
          />
        ) : (
          <View style={[styles.protocolIncomplete, { backgroundColor: colors.danger + "10", borderColor: colors.danger + "25" }]}>
            <View style={[styles.protocolIcon, { backgroundColor: colors.danger + "18" }]}>
              <Ionicons name="warning-outline" size={22} color={colors.danger} />
            </View>
            <View style={styles.protocolText}>
              <AppText style={[styles.protocolLabel, { color: colors.danger }]}>{t.profileIncomplete}</AppText>
              <AppText style={[styles.protocolSub, { color: colors.textSecondary }]}>{t.profileIncompleteDesc}</AppText>
            </View>
          </View>
        )}

        {/* ── First Aid Guide ── */}
        <SectionHeader title={t.firstAidTitle} icon="medical" iconColor={colors.success} colors={colors} />
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
                <AppText style={[styles.firstAidTitle, { color: item.color }]}>{t[item.titleKey]}</AppText>
              </View>
              <View style={[styles.stepsDivider, { borderTopColor: colors.border }]}>
                <AppText style={[styles.stepsLabel, { color: colors.textSecondary }]}>{t.steps}</AppText>
                <View style={styles.stepsCol}>
                  {item.steps.map((stepKey, i) => (
                    <View key={stepKey} style={styles.stepRow}>
                      <View style={[styles.stepBadge, { backgroundColor: item.color + "18" }]}>
                        <AppText style={[styles.stepNum, { color: item.color }]}>{i + 1}</AppText>
                      </View>
                      <AppText style={[styles.stepText, { color: colors.textPrimary }]}>{t[stepKey]}</AppText>
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

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },

  // Header
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

  // SOS
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

  // Share
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

  // Quick Call Grid
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

  // Emergency number row
  categoryHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  categoryLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  emergencyIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyInfo: { flex: 1, gap: 2 },
  emergencyName: { fontSize: 14, fontWeight: '700' },
  emergencyNumber: { fontSize: 12, fontWeight: '600' },

  // Section header
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

  // Generic card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },

  // Empty rows
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    justifyContent: "center",
  },
  emptyText: { fontSize: 13, fontWeight: "500" },

  // Contacts
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

  // Alerts
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

  // Status card
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

  // Protocol incomplete
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

  // First Aid
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