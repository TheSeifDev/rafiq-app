import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui/Screen';
import { AppText } from '../components/ui/AppText';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useAuthStore } from '../store/auth.store';
import { useAppStore } from '../store/app.store';
import { medicationService, type Medication } from '../services/medication.service';
import { patientService } from '../services/patient.service';
import { translations } from '../constants/translations';
import { MedicationDashboardRow, type MedicationDashboardStat } from '../components/medications/MedicationDashboardRow';
import { MedicationExpandableCard } from '../components/medications/MedicationExpandableCard';
import { MedicationSearchBar } from '../components/medications/MedicationSearchBar';
import { MedicationFilterSheet, type MedicationFilters } from '../components/medications/MedicationFilterSheet';
import { classifyStock } from '../lib/medications/medicationMath';
import { estimateDosesPerDay } from '../lib/medications/medicationSchedule';
import { MedicationFormSheet } from '../components/medications/MedicationFormSheet';
import { syncMedicationReminders, syncSingleMedicationNotifications, computeMissedDosesForToday } from '../lib/notifications/medicationReminders';
import { cancelAllRemindersForMedication } from '../lib/notifications/notificationService';

// MedicationsScreen is used as both a main tab and inside ProfileStack.
// Flexible navigation type avoids prop conflicts in both contexts.
type Props = { navigation: any };


export function MedicationsScreen({ navigation }: Props): React.JSX.Element {
  const session = useAuthStore((s) => s.session);
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const notificationPrefs = useAppStore((s) => s.notificationPrefs);
  const t = translations[language] as any;
  const isAr = language === 'ar';
  const isRTL = language === 'ar';

  const [items, setItems] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MedicationFilters>({
    onlyActive: false,
    lowStockOnly: false,
    forms: [],
    reasons: [],
  });
  const [showFilters, setShowFilters] = useState(false);

  const [todayTakenCount, setTodayTakenCount] = useState(0);
  const [todayScheduledCount, setTodayScheduledCount] = useState(0);
  const [todayMissedCount, setTodayMissedCount] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);

  const [refillMed, setRefillMed] = useState<Medication | null>(null);
  const [refillValue, setRefillValue] = useState('');
  const [refilling, setRefilling] = useState(false);

  const [historyMed, setHistoryMed] = useState<Medication | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ taken_at: string; skipped: boolean; note: string | null }>>([]);

  // Use theme tokens — no hardcoded colors
  const surfaceBg = colors.surface;
  const cardBorder = colors.border;

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const profile = await patientService.getProfile(session.user.id);
      if (!profile) return;
      const data = await medicationService.getMedications(profile.id);

      // Today logs (real doses taken / missed estimation)
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const logs = await medicationService.listLogsForPatientRange(profile.id, start.toISOString(), end.toISOString());
      const taken = logs.filter((l) => !l.skipped).length;

      const scheduled = data
        .filter((m) => (m.active ?? m.is_active) !== false)
        .reduce((sum, m) => {
          const perDay = estimateDosesPerDay({
            scheduleType: m.schedule_type ?? null,
            times: m.times,
            timeOfDay: m.time_of_day,
            frequencyText: m.frequency ?? null,
          });
          return sum + Math.max(0, perDay);
        }, 0);

      const missed = Math.max(0, scheduled - taken);

      setItems(data);
      setTodayTakenCount(taken);
      setTodayScheduledCount(scheduled);
      setTodayMissedCount(missed);

      // Sync device reminders + generate low stock / missed-dose checks (deduped)
      syncMedicationReminders({
        patientId: profile.id,
        userId: session.user.id,
        enabled: Boolean(notificationPrefs.medicationReminders),
        medications: data,
        language,
        prefs: notificationPrefs,
      }).catch(() => undefined);

      // Stronger missed-dose computation (used to keep dashboard correct if schedule is time-based)
      const missedCalc = computeMissedDosesForToday({ medications: data, logsToday: logs, graceMinutes: 60 });
      if (missedCalc.missedCount !== missed) setTodayMissedCount(missedCalc.missedCount);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [session?.user.id, language, notificationPrefs.medicationReminders]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitForm = useCallback(
    async (result: {
      name: string;
      strength: string | null;
      category: string | null;
      reason: string | null;
      form: string | null;
      schedule_type: string | null;
      meal_rule: string | null;
      times: Array<{ time: string; meal_rule?: string | null }>;
      quantity_type: string | null;
      total_quantity: number | null;
      remaining_quantity: number | null;
      refill_threshold: number | null;
      notes: string | null;
      doctor_name: string | null;
    }) => {
      if (!session?.user.id) return;
      setSaving(true);
      try {
        const profile = await patientService.getProfile(session.user.id);
        if (!profile) return;

        if (editing) {
          await medicationService.updateMedication(editing.id, {
            name: result.name,
            dosage: (result.strength ?? '').trim(),
            strength: result.strength,
            category: result.category,
            reason: result.reason,
            form: result.form,
            schedule_type: result.schedule_type,
            frequency: result.schedule_type ?? editing.frequency,
            times: result.times,
            meal_rule: result.meal_rule,
            quantity_type: result.quantity_type,
            total_quantity: result.total_quantity,
            remaining_quantity: result.remaining_quantity,
            refill_threshold: result.refill_threshold,
            notes: result.notes,
            doctor_name: result.doctor_name,
            active: (editing.active ?? editing.is_active) !== false,
            is_active: (editing.active ?? editing.is_active) !== false,
          });
        } else {
          await medicationService.addMedication({
            patient_id: profile.id,
            name: result.name,
            dosage: (result.strength ?? '').trim(),
            strength: result.strength,
            category: result.category,
            reason: result.reason,
            form: result.form,
            schedule_type: result.schedule_type,
            frequency: result.schedule_type ?? 'once_daily',
            times: result.times,
            meal_rule: result.meal_rule,
            quantity_type: result.quantity_type,
            total_quantity: result.total_quantity,
            remaining_quantity: result.remaining_quantity,
            refill_threshold: result.refill_threshold,
            notes: result.notes,
            doctor_name: result.doctor_name,
            active: true,
            is_active: true,
            time_of_day: [],
            start_date: new Date().toISOString().slice(0, 10),
            end_date: null,
            instructions: null,
          });
        }

        setShowForm(false);
        setEditing(null);
        await load();

        // ✅ Schedule notifications immediately after save
        // load() triggers syncMedicationReminders but we also sync this specific med
        // to guarantee the new/updated schedule takes effect right away.
        const freshList = await medicationService.getMedications((await patientService.getProfile(session.user.id))?.id ?? '');
        const savedMed = freshList.find((m) => m.name === result.name);
        if (savedMed) {
          syncSingleMedicationNotifications(savedMed, language).catch(() => undefined);
        }
      } catch {
        Alert.alert(isAr ? 'تعذر الحفظ' : 'Save failed', isAr ? 'تحقق من البيانات المدخلة.' : 'Please check the entered data.');
      } finally {
        setSaving(false);
      }
    },
    [editing, isAr, language, load, session?.user.id],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const derived = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((m) => {
      const active = (m.active ?? m.is_active) !== false;
      if (filters.onlyActive && !active) return false;

      if (filters.forms.length > 0) {
        const f = (m.form ?? '').toLowerCase();
        if (!filters.forms.includes(f)) return false;
      }

      if (filters.reasons.length > 0) {
        const r = (m.category ?? m.reason ?? '').toLowerCase();
        if (!filters.reasons.some((x) => r.includes(x))) return false;
      }

      if (filters.lowStockOnly) {
        const stock = classifyStock({ remainingQuantity: m.remaining_quantity ?? null, refillThreshold: m.refill_threshold ?? null });
        if (stock.severity === 'safe') return false;
      }

      if (!q) return true;
      const hay = `${m.name} ${m.strength ?? ''} ${m.dosage ?? ''} ${m.reason ?? ''}`.toLowerCase();
      return hay.includes(q);
    });

    const total = items.length;
    const activeCount = items.filter((m) => (m.active ?? m.is_active) !== false).length;
    const lowStock = items.filter((m) => classifyStock({ remainingQuantity: m.remaining_quantity ?? null, refillThreshold: m.refill_threshold ?? null }).severity !== 'safe').length;

    return { filtered, total, activeCount, lowStock };
  }, [items, query, filters]);

  const stats: MedicationDashboardStat[] = React.useMemo(
    () => [
      { key: 'total', label: isAr ? 'الإجمالي' : 'Total', value: derived.total, icon: 'medkit' as const, tone: 'primary' },
      { key: 'active', label: isAr ? 'النشطة' : 'Active', value: derived.activeCount, icon: 'pulse' as const, tone: 'success' },
      { key: 'today', label: isAr ? 'جرعات اليوم' : 'Doses today', value: todayScheduledCount, icon: 'calendar' as const, tone: 'primary' },
      { key: 'low', label: isAr ? 'نقص مخزون' : 'Low stock', value: derived.lowStock, icon: 'alert-circle' as const, tone: 'warning' },
      { key: 'missed', label: isAr ? 'فائتة اليوم' : 'Missed', value: todayMissedCount, icon: 'close-circle' as const, tone: 'danger' },
    ],
    [derived.total, derived.activeCount, derived.lowStock, todayScheduledCount, todayMissedCount, isAr],
  );

  const filterActive = filters.onlyActive || filters.lowStockOnly || filters.forms.length > 0 || filters.reasons.length > 0;

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.topBar, isRTL && styles.rowRTL]}>
        {navigation.canGoBack?.() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
          >
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}

        <View style={styles.titleWrap}>
          <AppText style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {isAr ? 'الأدوية' : t.medications}
          </AppText>
          <AppText style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {isAr ? 'إدارة آمنة للجرعات والمخزون' : 'Safe dosing & stock management'}
          </AppText>
        </View>

        <TouchableOpacity
          onPress={() => {
            setEditing(null);
            setShowForm(true);
          }}
          activeOpacity={0.8}
          style={[styles.addBtn, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}55` }]}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <MedicationSearchBar
        value={query}
        onChange={setQuery}
        placeholder={isAr ? 'ابحث عن دواء…' : 'Search medications…'}
        onPressFilter={() => setShowFilters(true)}
        filterActive={filterActive}
      />

      <MedicationDashboardRow stats={stats} />
    </View>
  );

  const handleToggleActive = useCallback(
    async (med: Medication) => {
      const next = !((med.active ?? med.is_active) !== false);
      try {
        await medicationService.setActive(med.id, next);
        // ✅ Immediately sync notifications for this med
        const updatedMed = { ...med, active: next, is_active: next };
        syncSingleMedicationNotifications(updatedMed, language).catch(() => undefined);
        await load();
      } catch {
        Alert.alert(isAr ? 'تعذر التحديث' : 'Update failed');
      }
    },
    [language, load, isAr],
  );

  const handleDelete = useCallback(
    (med: Medication) => {
      Alert.alert(
        isAr ? 'حذف الدواء؟' : 'Delete medication?',
        isAr ? 'لن يمكن التراجع عن هذا الإجراء.' : 'This action cannot be undone.',
        [
          { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
          {
            text: isAr ? 'حذف' : 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // ✅ Cancel reminders before deleting
                await cancelAllRemindersForMedication(med.id).catch(() => undefined);
                await medicationService.deleteMedication(med.id);
                await load();
              } catch {
                Alert.alert(isAr ? 'تعذر الحذف' : 'Delete failed');
              }
            },
          },
        ],
      );
    },
    [isAr, load],
  );

  const handleTakeNow = useCallback(
    async (med: Medication) => {
      try {
        await medicationService.addLog({ medication_id: med.id, skipped: false, taken_at: new Date().toISOString() });

        const remaining = typeof med.remaining_quantity === 'number' && Number.isFinite(med.remaining_quantity) ? med.remaining_quantity : null;
        const qtyType = (med.quantity_type ?? 'pills').toLowerCase();
        const canAutoDecrement = qtyType === 'pills' || qtyType === 'uses' || qtyType === 'strip' || qtyType === 'box';
        if (remaining !== null && canAutoDecrement) {
          await medicationService.updateMedication(med.id, { remaining_quantity: Math.max(0, remaining - 1) });
        }
        await load();
      } catch {
        Alert.alert(isAr ? 'تعذر التسجيل' : 'Could not log dose');
      }
    },
    [isAr, load],
  );

  const handleRefill = useCallback(
    (med: Medication) => {
      setRefillMed(med);
      setRefillValue(
        typeof med.remaining_quantity === 'number' && Number.isFinite(med.remaining_quantity) ? String(med.remaining_quantity) : '',
      );
    },
    [isAr],
  );

  const handleEdit = useCallback(
    (med: Medication) => {
      setEditing(med);
      setShowForm(true);
    },
    [isAr],
  );

  const handleHistory = useCallback(
    async (med: Medication) => {
      setHistoryMed(med);
      setHistoryLoading(true);
      try {
        const logs = await medicationService.listLogs(med.id, 120);
        setHistoryItems(logs.map((l) => ({ taken_at: l.taken_at, skipped: l.skipped, note: l.note ?? null })));
      } catch {
        setHistoryItems([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [isAr],
  );

  return (
    <Screen>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={derived.filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <MedicationExpandableCard
              medication={item}
              isRTL={isRTL}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              onTakeNow={handleTakeNow}
              onRefill={handleRefill}
              onEdit={handleEdit}
              onViewHistory={handleHistory}
            />
          )}
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
              <Ionicons name="medical-outline" size={44} color={colors.textSecondary + '40'} />
              <AppText style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {isAr ? 'لا توجد أدوية بعد' : 'No medications yet'}
              </AppText>
              <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>
                {isAr ? 'أضف دواءً وفعّل الجدول والمخزون بأمان.' : 'Add a medication and enable safe scheduling & stock.'}
              </AppText>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowForm(true)}
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <AppText style={styles.emptyBtnText}>{isAr ? 'إضافة دواء' : 'Add medication'}</AppText>
              </TouchableOpacity>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <MedicationFilterSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        value={filters}
        onChange={setFilters}
        labels={{
          title: isAr ? 'تصفية' : 'Filters',
          onlyActive: isAr ? 'النشطة فقط' : 'Only active',
          lowStockOnly: isAr ? 'نقص المخزون فقط' : 'Low stock only',
          forms: isAr ? 'الشكل الدوائي' : 'Form',
          reasons: isAr ? 'السبب' : 'Reason',
          reset: isAr ? 'إعادة' : 'Reset',
          done: isAr ? 'تم' : 'Done',
          formLabels: {
            tablet: isAr ? 'أقراص' : 'Tablet',
            capsule: isAr ? 'كبسولات' : 'Capsule',
            syrup: isAr ? 'شراب' : 'Syrup',
            injection: isAr ? 'حقن' : 'Injection',
            spray: isAr ? 'بخاخ' : 'Spray',
            drops: isAr ? 'قطرات' : 'Drops',
            cream: isAr ? 'كريم' : 'Cream',
            inhaler: isAr ? 'استنشاق' : 'Inhaler',
          },
          reasonLabels: {
            pain: isAr ? 'ألم' : 'Pain',
            blood_pressure: isAr ? 'ضغط' : 'Blood pressure',
            diabetes: isAr ? 'سكري' : 'Diabetes',
            memory: isAr ? 'ذاكرة' : 'Memory',
            heart: isAr ? 'قلب' : 'Heart',
            sleep: isAr ? 'نوم' : 'Sleep',
            digestion: isAr ? 'هضم' : 'Digestion',
            vitamin: isAr ? 'فيتامين' : 'Vitamin',
            other: isAr ? 'أخرى' : 'Other',
          },
        }}
      />

      <MedicationFormSheet
        visible={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        initialMedication={editing}
        saving={saving}
        onSubmit={handleSubmitForm}
        labels={{
          titleAdd: isAr ? 'إضافة دواء' : 'Add medication',
          titleEdit: isAr ? 'تعديل دواء' : 'Edit medication',
          save: t.save,
          cancel: isAr ? 'إلغاء' : 'Cancel',
          sections: {
            basics: isAr ? 'البيانات الأساسية' : 'Basics',
            schedule: isAr ? 'الجدول' : 'Schedule',
            stock: isAr ? 'المخزون' : 'Stock',
          },
          fields: {
            name: isAr ? 'اسم الدواء' : 'Name',
            strength: isAr ? 'التركيز' : 'Strength',
            category: isAr ? 'التصنيف' : 'Category',
            reason: isAr ? 'سبب الاستخدام' : 'Reason',
            form: isAr ? 'الشكل الدوائي' : 'Form',
            notes: isAr ? 'ملاحظات' : 'Notes',
            doctorName: isAr ? 'اسم الطبيب (اختياري)' : 'Doctor name (optional)',
          },
          placeholders: {
            name: isAr ? 'مثال: كونكور' : 'e.g. Concor',
            strength: isAr ? 'مثال: 5mg' : 'e.g. 5mg',
            category: isAr ? 'مثال: ضغط' : 'e.g. Blood pressure',
            reason: isAr ? 'مثال: تنظيم ضغط الدم' : 'e.g. Control blood pressure',
            form: isAr ? 'tablet / syrup / …' : 'tablet / syrup / …',
            notes: isAr ? 'أي تعليمات إضافية…' : 'Any additional instructions…',
            doctorName: isAr ? 'اختياري' : 'Optional',
          },
          schedule: {
            title: isAr ? 'الجدولة' : 'Scheduling',
            scheduleType: isAr ? 'التكرار' : 'Frequency',
            mealRule: isAr ? 'قاعدة الطعام' : 'Meal rule',
            times: isAr ? 'الأوقات' : 'Times',
            addTime: isAr ? 'إضافة وقت' : 'Add time',
            hhmm: 'h:mm AM',
          },
          stock: {
            title: isAr ? 'المخزون' : 'Stock',
            quantityType: isAr ? 'نوع الكمية' : 'Quantity type',
            total: isAr ? 'الإجمالي' : 'Total',
            remaining: isAr ? 'المتبقي' : 'Remaining',
            threshold: isAr ? 'حد التنبيه' : 'Refill threshold',
            daysLeft: isAr ? 'أيام متبقية:' : 'Days left:',
          },
        }}
      />

      <Modal visible={!!refillMed} transparent animationType="fade" onRequestClose={() => setRefillMed(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
              <AppText style={[styles.modalTitle, { color: colors.textPrimary }]}>{isAr ? 'تعبئة المخزون' : 'Refill stock'}</AppText>
              <TouchableOpacity onPress={() => setRefillMed(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <LabeledField label={isAr ? 'الكمية المتبقية الآن' : 'Remaining quantity now'}>
              <TextInput
                value={refillValue}
                onChangeText={setRefillValue}
                style={[styles.modalInput, { color: colors.textPrimary, textAlign: 'center' }]}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)'}
              />
            </LabeledField>

            <View style={[styles.modalFooter, isRTL && styles.rowRTL]}>
              <TouchableOpacity
                onPress={() => setRefillMed(null)}
                style={[styles.modalBtn, { borderColor: darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)' }]}
              >
                <AppText style={[styles.modalBtnText, { color: colors.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!refillMed) return;
                  const n = Number(refillValue.trim());
                  if (!Number.isFinite(n) || n < 0) {
                    Alert.alert(isAr ? 'قيمة غير صالحة' : 'Invalid value');
                    return;
                  }
                  setRefilling(true);
                  try {
                    await medicationService.updateMedication(refillMed.id, { remaining_quantity: n, quantity_type: 'pills' });
                    setRefillMed(null);
                    await load();
                  } catch {
                    Alert.alert(isAr ? 'تعذر التحديث' : 'Update failed');
                  } finally {
                    setRefilling(false);
                  }
                }}
                style={[styles.modalPrimary, { backgroundColor: colors.primary, opacity: refilling ? 0.6 : 1 }]}
                disabled={refilling}
              >
                {refilling ? <ActivityIndicator size="small" color="#fff" /> : <AppText style={styles.modalPrimaryText}>{isAr ? 'حفظ' : 'Save'}</AppText>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!historyMed} transparent animationType="fade" onRequestClose={() => setHistoryMed(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
              <AppText style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {isAr ? 'سجل الجرعات' : 'Dose history'}
              </AppText>
              <TouchableOpacity onPress={() => setHistoryMed(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : historyItems.length === 0 ? (
              <AppText style={{ color: colors.textSecondary, fontWeight: '700' }}>
                {isAr ? 'لا توجد جرعات مسجلة بعد.' : 'No doses logged yet.'}
              </AppText>
            ) : (
              <View style={{ gap: 10 }}>
                {historyItems.slice(0, 10).map((h, idx) => (
                  <View
                    key={`${h.taken_at}-${idx}`}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
                      backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText style={{ fontWeight: '900', fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
                        {new Date(h.taken_at).toLocaleString()}
                      </AppText>
                      {!!h.note && (
                        <AppText style={{ fontWeight: '700', fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                          {h.note}
                        </AppText>
                      )}
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: `${h.skipped ? colors.warning : colors.success}14`,
                      }}
                    >
                      <AppText style={{ fontSize: 11, fontWeight: '900', color: h.skipped ? colors.warning : colors.success }}>
                        {h.skipped ? (isAr ? 'تخطي' : 'Skipped') : (isAr ? 'تم' : 'Taken')}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 6 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AppText style={{ fontSize: 12, fontWeight: '900', color: colors.textSecondary, opacity: 0.9 }}>{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 110,
  },
  loadingWrap: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  headerWrap: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.9,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    opacity: 0.95,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing.lg,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  modalInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeInput: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    fontSize: 14,
    fontWeight: '900',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  modalPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
