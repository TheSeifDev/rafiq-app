import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useAppStore } from '../store/app.store';
import { useAuthStore } from '../store/auth.store';
import { translations } from '../constants/translations';
import { patientService } from '../services/patient.service';
import { exportHealthData } from '../services/export.service';
import { dataService } from '../services/data.service';
import { safeRequestPermissions } from '../lib/notifications/notificationSafety';
import type { ProfileStackScreenProps } from '../navigation/types';

type Props = ProfileStackScreenProps<'Privacy'>;

// ── InfoRow (reusable UI row) ──
function InfoRow({
  icon, iconColor, title, description, rightContent, isLast, darkMode, colors,
}: {
  icon: string; iconColor: string; title: string; description?: string;
  rightContent?: React.ReactNode; isLast?: boolean; darkMode: boolean; colors: ReturnType<typeof import('../theme/useTheme').useTheme>['colors'];
}) {
  const dividerColor = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  return (
    <View style={[styles.infoRow, !isLast && { borderBottomWidth: 1, borderBottomColor: dividerColor }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: iconColor + '12' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.infoContent}>
        <AppText style={[styles.infoTitle, { color: colors.textPrimary }]}>{title}</AppText>
        {description && (
          <AppText style={[styles.infoDesc, { color: colors.textSecondary }]}>{description}</AppText>
        )}
      </View>
      {rightContent && <View style={styles.infoRight}>{rightContent}</View>}
    </View>
  );
}

// ── Main Screen ──
export function PrivacyScreen({ navigation }: Props): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language];

  // Type-safe accessor with fallback
  const tSafe = (key: string): string => {
    const val = (t as Record<string, string | undefined>)[key];
    return val ?? key;
  };
  const isAr = language === 'ar';
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  // ── Persisted health consent from zustand store ──
  const healthDataConsent = useAppStore((s) => s.healthDataConsent);
  const setHealthDataConsent = useAppStore((s) => s.setHealthDataConsent);

  // ── Permission states — synced with device on mount ──
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  // ── Loading states ──
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const surfaceBg = darkMode ? 'rgba(30, 41, 59, 0.80)' : 'rgba(255, 255, 255, 0.92)';
  const cardBorder = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  // ── Check real permission status on mount ──
  useEffect(() => {
    (async () => {
      try {
        const { status: locStatus } = await Location.getForegroundPermissionsAsync();
        setLocationEnabled(locStatus === 'granted');
      } catch { /* Expo Go safe */ }

      try {
        const perm = await safeRequestPermissions();
        setNotifEnabled(perm.granted);
      } catch { /* Expo Go safe */ }
    })();
  }, []);

  // ── Toggle Location Permission ──
  const handleLocationToggle = useCallback(async (val: boolean) => {
    if (val) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(
          isAr ? 'مرفوض' : 'Denied',
          isAr ? 'يرجى تفعيل الموقع من الإعدادات' : 'Please enable location in Settings',
        );
      }
    } else {
      Alert.alert(
        isAr ? 'ملاحظة' : 'Note',
        isAr ? 'لإيقاف الموقع، عطّله من إعدادات الجهاز' : 'To revoke, disable in device Settings',
      );
    }
  }, [isAr]);

  // ── Toggle Notification Permission ──
  const handleNotifToggle = useCallback(async (val: boolean) => {
    if (val) {
      const perm = await safeRequestPermissions();
      setNotifEnabled(perm.granted);
      if (!perm.granted) {
        Alert.alert(
          isAr ? 'مرفوض' : 'Denied',
          isAr ? 'يرجى تفعيل الإشعارات من الإعدادات' : 'Please enable notifications in Settings',
        );
      }
    } else {
      Alert.alert(
        isAr ? 'ملاحظة' : 'Note',
        isAr ? 'لإيقاف الإشعارات، عطّلها من إعدادات الجهاز' : 'To revoke, disable in device Settings',
      );
    }
  }, [isAr]);

  // ── Export Data (delegates to export.service.ts) ──
  const handleExport = useCallback(async () => {
    if (!session?.user.id) return;
    setExporting(true);
    try {
      const result = await exportHealthData(session.user.id, isAr);
      if (!result.success) {
        Alert.alert(isAr ? 'خطأ' : 'Error', result.error);
      }
    } catch (err: unknown) {
      Alert.alert(isAr ? 'خطأ' : 'Error', err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [session, isAr]);

  // ── Delete Account (real Supabase cascade) ──
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t.deleteAccount,
      isAr ? 'سيتم حذف جميع بياناتك نهائياً. هل أنت متأكد؟' : 'All your data will be permanently deleted. Are you sure?',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          style: 'destructive',
          onPress: async () => {
            if (!session?.user.id) return;
            setDeleting(true);
            try {
              const userId = session.user.id;
              await dataService.deleteAllUserData(userId);
              await signOut();

              Alert.alert(
                isAr ? 'تم الحذف' : 'Account Deleted',
                isAr ? 'تم حذف جميع بياناتك' : 'All your data has been removed',
              );
            } catch (err: unknown) {
              Alert.alert(isAr ? 'خطأ' : 'Error', err instanceof Error ? err.message : 'Delete failed');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [session, signOut, t, isAr]);

  // ── Switch factory ──
  const makeSwitch = (val: boolean, onChange: (v: boolean) => void) => (
    <Switch
      value={val}
      onValueChange={onChange}
      trackColor={{ false: '#D1D5DB', true: colors.primary + '50' }}
      thumbColor={val ? colors.primary : '#F3F4F6'}
    />
  );

  return (
    <Screen>
      <ScreenHeader title={t.privacyLabel} onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Data Usage ── */}
        <View style={styles.sectionWrap}>
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t.dataUsage}</AppText>
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <View style={styles.dataUsageContent}>
              <Ionicons name="shield-checkmark-outline" size={32} color={colors.success} />
              <AppText style={[styles.dataUsageText, { color: colors.textPrimary }]}>{t.dataUsageDesc}</AppText>
            </View>
          </View>
        </View>

        {/* ── Permissions ── */}
        <View style={styles.sectionWrap}>
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t.permissions}</AppText>
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <InfoRow
              icon="location-outline" iconColor="#00C2FF"
              title={t.locationPerm}
              description={locationEnabled ? (isAr ? 'مفعّل' : 'Granted') : (isAr ? 'غير مفعّل' : 'Not granted')}
              darkMode={darkMode} colors={colors}
              rightContent={makeSwitch(locationEnabled, handleLocationToggle)}
            />
            <InfoRow
              icon="heart-outline" iconColor="#FF3B3B"
              title={t.healthPerm}
              description={isAr ? 'الموافقة على تخزين بيانات صحية' : 'Consent to store health data'}
              darkMode={darkMode} colors={colors}
              rightContent={makeSwitch(healthDataConsent, setHealthDataConsent)}
            />
            <InfoRow
              icon="notifications-outline" iconColor="#F59E0B"
              title={t.notifPerm}
              description={notifEnabled ? (isAr ? 'مفعّل' : 'Granted') : (isAr ? 'غير مفعّل' : 'Not granted')}
              darkMode={darkMode} colors={colors} isLast
              rightContent={makeSwitch(notifEnabled, handleNotifToggle)}
            />
          </View>
        </View>

        {/* ── Data Actions ── */}
        <View style={styles.sectionWrap}>
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t.healthData}</AppText>
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            {/* Export */}
            <TouchableOpacity activeOpacity={0.6} style={styles.actionRow} onPress={handleExport} disabled={exporting}>
              <View style={[styles.infoIconWrap, { backgroundColor: colors.primary + '12' }]}>
                {exporting
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="download-outline" size={18} color={colors.primary} />}
              </View>
              <View style={styles.infoContent}>
                <AppText style={[styles.infoTitle, { color: colors.textPrimary }]}>{t.exportData}</AppText>
                <AppText style={[styles.infoDesc, { color: colors.textSecondary }]}>{t.exportDataDesc}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary + '60'} />
            </TouchableOpacity>

            {/* Delete Account */}
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={handleDeleteAccount}
              disabled={deleting}
              style={[styles.actionRow, { borderTopWidth: 1, borderTopColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
            >
              <View style={[styles.infoIconWrap, { backgroundColor: colors.danger + '12' }]}>
                {deleting
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <Ionicons name="trash-outline" size={18} color={colors.danger} />}
              </View>
              <View style={styles.infoContent}>
                <AppText style={[styles.infoTitle, { color: colors.danger }]}>{t.deleteAccount}</AppText>
                <AppText style={[styles.infoDesc, { color: colors.textSecondary }]}>{t.deleteAccountConfirm}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary + '60'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Legal ── */}
        <View style={styles.sectionWrap}>
          <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <TouchableOpacity activeOpacity={0.6} style={styles.legalRow} onPress={() => navigation.navigate('TermsOfService')}>
              <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
              <AppText style={[styles.legalText, { color: colors.textPrimary }]}>{t.termsOfService}</AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary + '60'} />
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
            <TouchableOpacity activeOpacity={0.6} style={styles.legalRow} onPress={() => navigation.navigate('PrivacyPolicy')}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
              <AppText style={[styles.legalText, { color: colors.textPrimary }]}>{t.privacyPolicy}</AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary + '60'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: spacing['2xl'] }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionWrap: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // ── Data usage ──
  dataUsageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  dataUsageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 22,
  },
  // ── Info rows ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoDesc: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  infoRight: {
    marginLeft: spacing.sm,
  },
  // ── Actions ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  // ── Legal ──
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  legalText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});
