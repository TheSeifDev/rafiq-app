import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { useTheme } from '../theme/useTheme';
import { useAppStore, type NotificationPrefs } from '../store/app.store';
import { useAuthStore } from '../store/auth.store';
import { spacing, radius } from '../theme';
import { sendTestNotification as sendTestNotif } from '../lib/notifications/notificationService';
import { notificationService } from '../services/notification.service';

// ─── Translations (inline — keeps the file self-contained) ───
const T = {
  ar: {
    title: 'إعدادات الإشعارات',
    alertTypes: 'أنواع التنبيهات',
    medicationReminders: 'تذكيرات الأدوية',
    medicationRemindersDesc: 'تنبيه عند حلول موعد الجرعة',
    lowStockAlerts: 'تنبيه نفاد المخزون',
    lowStockAlertsDesc: 'تنبيه عند انخفاض كمية الدواء',
    emergencyAlerts: 'تنبيهات الطوارئ',
    emergencyAlertsDesc: 'إشعارات الحالات الحرجة',
    chatAlerts: 'إشعارات المحادثة',
    chatAlertsDesc: 'رسائل جديدة من المحادثة',
    vitalsAlerts: 'تنبيهات المؤشرات الحيوية',
    vitalsAlertsDesc: 'قراءات غير طبيعية من الأجهزة',
    behavior: 'السلوك',
    sound: 'الصوت',
    soundDesc: 'تشغيل صوت عند وصول الإشعار',
    vibration: 'الاهتزاز',
    vibrationDesc: 'اهتزاز الجهاز عند الإشعار',
    quietHours: 'ساعات الهدوء',
    quietHoursDesc: 'كتم الإشعارات خلال فترة محددة',
    quietFrom: 'من',
    quietTo: 'إلى',
    testing: 'الاختبار',
    testNotification: 'إرسال إشعار تجريبي',
    testSent: 'تم إرسال الإشعار التجريبي',
    testFailed: 'فشل إرسال الإشعار التجريبي',
    expoGoWarning: 'الإشعارات المحلية غير مدعومة في بيئة Expo Go',
    enableAll: 'تفعيل الكل',
    disableAll: 'تعطيل الكل',
  },
  en: {
    title: 'Notification Settings',
    alertTypes: 'Alert Types',
    medicationReminders: 'Medication Reminders',
    medicationRemindersDesc: 'Alert when it\'s time for a dose',
    lowStockAlerts: 'Low Stock Alerts',
    lowStockAlertsDesc: 'Alert when medication supply is running low',
    emergencyAlerts: 'Emergency Alerts',
    emergencyAlertsDesc: 'Critical condition notifications',
    chatAlerts: 'Chat Notifications',
    chatAlertsDesc: 'New messages from conversations',
    vitalsAlerts: 'Vitals Alerts',
    vitalsAlertsDesc: 'Abnormal readings from connected devices',
    behavior: 'Behavior',
    sound: 'Sound',
    soundDesc: 'Play a sound on notification',
    vibration: 'Vibration',
    vibrationDesc: 'Vibrate the device on notification',
    quietHours: 'Quiet Hours',
    quietHoursDesc: 'Mute notifications during a set period',
    quietFrom: 'From',
    quietTo: 'To',
    testing: 'Testing',
    testNotification: 'Send Test Notification',
    testSent: 'Test notification sent',
    testFailed: 'Failed to send test notification',
    expoGoWarning: 'Local notifications are not supported in Expo Go',
    enableAll: 'Enable All',
    disableAll: 'Disable All',
  },
} as const;

// ─── Toggle Row ──────────────────────────────────────────────

interface ToggleRowProps {
  icon: string;
  iconColor: string;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  darkMode: boolean;
  colors: any;
  isLast?: boolean;
}

function ToggleRow({ icon, iconColor, label, description, value, onValueChange, darkMode, colors, isLast }: ToggleRowProps) {
  return (
    <View style={[rowStyles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
      <View style={[rowStyles.iconWrap, { backgroundColor: iconColor + '14' }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={rowStyles.textCol}>
        <AppText style={[rowStyles.label, { color: colors.textPrimary }]}>{label}</AppText>
        <AppText style={[rowStyles.desc, { color: colors.textSecondary }]} numberOfLines={2}>{description}</AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: darkMode ? '#374151' : '#D1D5DB', true: colors.primary + '50' }}
        thumbColor={value ? colors.primary : darkMode ? '#6B7280' : '#F3F4F6'}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  desc: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});

// ─── Section Card ────────────────────────────────────────────

function SectionCard({ title, children, darkMode, colors, rightContent }: {
  title: string;
  children: React.ReactNode;
  darkMode: boolean;
  colors: any;
  rightContent?: React.ReactNode;
}) {
  return (
    <View style={[sectionStyles.card, { backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
      <View style={sectionStyles.titleRow}>
        <AppText style={[sectionStyles.title, { color: colors.textSecondary }]}>{title}</AppText>
        {rightContent}
      </View>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

// ─── Quiet Hours Time Input ──────────────────────────────────

function TimeInput({ label, value, onChange, darkMode, colors, isAr }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  darkMode: boolean;
  colors: any;
  isAr: boolean;
}) {
  return (
    <View style={timeStyles.wrap}>
      <AppText style={[timeStyles.label, { color: colors.textSecondary }]}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={(text) => {
          // Auto-format: allow only HH:MM
          const clean = text.replace(/[^0-9:]/g, '');
          if (clean.length <= 5) onChange(clean);
        }}
        style={[timeStyles.input, {
          color: colors.textPrimary,
          backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          textAlign: isAr ? 'right' : 'left',
        }]}
        placeholder="00:00"
        placeholderTextColor={colors.textSecondary + '60'}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
    </View>
  );
}

const timeStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

// ─── Main Screen ─────────────────────────────────────────────

export function NotificationSettingsScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const { colors, darkMode, language } = useTheme();
  const t = T[language];
  const prefs = useAppStore((s) => s.notificationPrefs);
  const setPrefs = useAppStore((s) => s.setNotificationPrefs);
  const session = useAuthStore((s) => s.session);
  const [testLoading, setTestLoading] = useState(false);

  const isAr = language === 'ar';

  const togglePref = useCallback(
    (key: keyof NotificationPrefs, value: boolean) => {
      setPrefs({ [key]: value });
    },
    [setPrefs],
  );

  const toggleAll = useCallback(
    (enabled: boolean) => {
      setPrefs({
        medicationReminders: enabled,
        lowStockAlerts: enabled,
        emergencyAlerts: enabled,
        chatAlerts: enabled,
        vitalsAlerts: enabled,
      });
    },
    [setPrefs],
  );

  const handleSendTestNotification = useCallback(async () => {
    setTestLoading(true);
    try {
      await sendTestNotif(isAr ? 'ar' : 'en');
      if (session?.user.id) {
        await notificationService.createNotification({
          user_id: session.user.id,
          title: isAr ? 'إشعار تجريبي' : 'Test notification',
          body: isAr ? 'إشعارات رفيق تعمل بنجاح!' : 'Rafiq notifications are working!',
          type: 'test',
        });
      }
      Alert.alert('', t.testSent);
    } catch {
      Alert.alert('', t.testFailed);
    } finally {
      setTestLoading(false);
    }
  }, [isAr, session?.user.id, t]);

  const allEnabled = prefs.medicationReminders && prefs.lowStockAlerts && prefs.emergencyAlerts && prefs.chatAlerts && prefs.vitalsAlerts;

  return (
    <Screen>
      <ScreenHeader title={t.title} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Expo Go Banner (local notifications work, banner removed) ── */}

        {/* ── Alert Types ── */}
        <SectionCard
          title={t.alertTypes}
          darkMode={darkMode}
          colors={colors}
          rightContent={
            <TouchableOpacity onPress={() => toggleAll(!allEnabled)} activeOpacity={0.7}>
              <AppText style={[styles.toggleAllText, { color: colors.primary }]}>
                {allEnabled ? t.disableAll : t.enableAll}
              </AppText>
            </TouchableOpacity>
          }
        >
          <ToggleRow
            icon="medical-outline"
            iconColor="#00C2FF"
            label={t.medicationReminders}
            description={t.medicationRemindersDesc}
            value={prefs.medicationReminders}
            onValueChange={(v) => togglePref('medicationReminders', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="cube-outline"
            iconColor="#F59E0B"
            label={t.lowStockAlerts}
            description={t.lowStockAlertsDesc}
            value={prefs.lowStockAlerts}
            onValueChange={(v) => togglePref('lowStockAlerts', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="alert-circle-outline"
            iconColor="#FF3B3B"
            label={t.emergencyAlerts}
            description={t.emergencyAlertsDesc}
            value={prefs.emergencyAlerts}
            onValueChange={(v) => togglePref('emergencyAlerts', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="chatbubble-outline"
            iconColor="#8B5CF6"
            label={t.chatAlerts}
            description={t.chatAlertsDesc}
            value={prefs.chatAlerts}
            onValueChange={(v) => togglePref('chatAlerts', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="pulse-outline"
            iconColor="#10B981"
            label={t.vitalsAlerts}
            description={t.vitalsAlertsDesc}
            value={prefs.vitalsAlerts}
            onValueChange={(v) => togglePref('vitalsAlerts', v)}
            darkMode={darkMode}
            colors={colors}
            isLast
          />
        </SectionCard>

        {/* ── Behavior ── */}
        <SectionCard title={t.behavior} darkMode={darkMode} colors={colors}>
          <ToggleRow
            icon="volume-high-outline"
            iconColor="#00C2FF"
            label={t.sound}
            description={t.soundDesc}
            value={prefs.sound}
            onValueChange={(v) => togglePref('sound', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="phone-portrait-outline"
            iconColor="#7C3AED"
            label={t.vibration}
            description={t.vibrationDesc}
            value={prefs.vibration}
            onValueChange={(v) => togglePref('vibration', v)}
            darkMode={darkMode}
            colors={colors}
          />
          <ToggleRow
            icon="moon-outline"
            iconColor="#6366F1"
            label={t.quietHours}
            description={t.quietHoursDesc}
            value={prefs.quietHoursEnabled}
            onValueChange={(v) => togglePref('quietHoursEnabled', v)}
            darkMode={darkMode}
            colors={colors}
            isLast={!prefs.quietHoursEnabled}
          />
          {prefs.quietHoursEnabled && (
            <View style={[styles.quietRow, { borderTopColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
              <TimeInput
                label={t.quietFrom}
                value={prefs.quietHoursStart}
                onChange={(v) => setPrefs({ quietHoursStart: v })}
                darkMode={darkMode}
                colors={colors}
                isAr={isAr}
              />
              <View style={styles.quietDash}>
                <AppText style={{ color: colors.textSecondary, fontSize: 18 }}>—</AppText>
              </View>
              <TimeInput
                label={t.quietTo}
                value={prefs.quietHoursEnd}
                onChange={(v) => setPrefs({ quietHoursEnd: v })}
                darkMode={darkMode}
                colors={colors}
                isAr={isAr}
              />
            </View>
          )}
        </SectionCard>

        {/* ── Testing ── */}
        <SectionCard title={t.testing} darkMode={darkMode} colors={colors}>
          <TouchableOpacity
            onPress={handleSendTestNotification}
            disabled={testLoading}
            activeOpacity={0.7}
            style={[styles.testBtn, { backgroundColor: colors.primary + '12' }]}
          >
            <View style={[styles.testIconWrap, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="paper-plane-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.testLabel, { color: colors.primary }]}>
                {testLoading ? '...' : t.testNotification}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary + '60'} />
          </TouchableOpacity>
        </SectionCard>

        <View style={{ height: 110 }} />
      </ScrollView>
    </Screen>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  toggleAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: 14,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  quietDash: {
    paddingBottom: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  testIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
