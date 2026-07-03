import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui/AppText';
import { useTheme } from '../../theme/useTheme';
import { radius, spacing } from '../../theme';
import { MedicationScheduleEditor, type ScheduleDraft } from './MedicationScheduleEditor';
import { MedicationStockEditor, type StockDraft } from './MedicationStockEditor';
import type { Medication } from '../../services/medication.service';
import { validateMedicationDraft, type MedicationFormDraft, type MedicationFormErrors } from '../../lib/medications/medicationValidation';
import { formatMedicationTime } from '../../lib/medications/medicationSchedule';
import type { ThemeColors } from '../../theme';

export type MedicationFormResult = ReturnType<typeof validateMedicationDraft>['normalized'];

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  error?: string;
  multiline?: boolean;
  isRTL: boolean;
  colors: ThemeColors;
  fieldBg: string;
  fieldBorder: string;
  placeholderColor: string;
}

function Field(props: FieldProps): React.JSX.Element {
  const {
    label,
    value,
    onChangeText,
    placeholder,
    error,
    multiline,
    isRTL,
    colors,
    fieldBg,
    fieldBorder,
    placeholderColor,
  } = props;
  const bad = !!error;
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={[styles.fieldLabelRow, isRTL && styles.rowRTL]}>
        <AppText style={{ fontSize: 12, fontWeight: '900', color: colors.textSecondary, opacity: 0.9 }}>{label}</AppText>
        {!!error && <InlineError text={error} />}
      </View>
      <View style={[styles.field, { backgroundColor: fieldBg, borderColor: bad ? `${colors.danger}55` : fieldBorder }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          style={[
            styles.input,
            { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' },
            multiline && { height: 88, textAlignVertical: 'top', paddingTop: 12 },
          ]}
          multiline={multiline}
        />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const { colors, isRTL } = useTheme();
  return (
    <View style={styles.section}>
      <AppText style={[styles.sectionTitle, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{title}</AppText>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function InlineError({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <AppText style={{ fontSize: 11, fontWeight: '900', color: colors.danger }} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
}

export function MedicationFormSheet({
  visible,
  onClose,
  initialMedication,
  onSubmit,
  saving,
  labels,
}: {
  visible: boolean;
  onClose: () => void;
  initialMedication: Medication | null;
  saving: boolean;
  onSubmit: (result: MedicationFormResult) => void;
  labels: {
    titleAdd: string;
    titleEdit: string;
    save: string;
    cancel: string;
    sections: {
      basics: string;
      schedule: string;
      stock: string;
    };
    fields: {
      name: string;
      strength: string;
      category: string;
      reason: string;
      form: string;
      notes: string;
      doctorName: string;
    };
    placeholders: {
      name: string;
      strength: string;
      category: string;
      reason: string;
      form: string;
      notes: string;
      doctorName: string;
    };
    schedule: { title: string; scheduleType: string; mealRule: string; times: string; addTime: string; hhmm: string };
    stock: { title: string; quantityType: string; total: string; remaining: string; threshold: string; daysLeft: string };
  };
}): React.JSX.Element {
  const { colors, darkMode, isRTL } = useTheme();
  const overlay = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const prevVisible = useRef(false);

  const [draft, setDraft] = React.useState<MedicationFormDraft>(() => toDraft(initialMedication));
  const [errors, setErrors] = React.useState<MedicationFormErrors>({});

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setDraft(toDraft(initialMedication));
      setErrors({});
      overlay.setValue(0);
      slide.setValue(0);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
    prevVisible.current = visible;
  }, [visible, initialMedication, overlay, slide]);

  const surface = darkMode ? 'rgba(30,41,59,0.98)' : 'rgba(255,255,255,0.98)';
  const border = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const fieldBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const fieldBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const placeholderColor = darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)';

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  const scheduleDraft: ScheduleDraft = useMemo(
    () => ({ scheduleType: draft.scheduleType, mealRule: draft.mealRule, times: draft.times }),
    [draft.scheduleType, draft.mealRule, draft.times],
  );
  const stockDraft: StockDraft = useMemo(
    () => ({
      quantityType: draft.quantityType,
      totalQuantity: draft.totalQuantity,
      remainingQuantity: draft.remainingQuantity,
      refillThreshold: draft.refillThreshold,
    }),
    [draft.quantityType, draft.totalQuantity, draft.remainingQuantity, draft.refillThreshold],
  );

  function submit() {
    const v = validateMedicationDraft(draft, { isRTL });
    setErrors(v.errors);
    if (!v.ok) return;
    onSubmit(v.normalized);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%' }}
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY }], backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.header, isRTL && styles.rowRTL]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                  {initialMedication ? labels.titleEdit : labels.titleAdd}
                </AppText>
                <AppText style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {isRTL ? 'تحقق من الجدول والمخزون بعناية' : 'Review schedule & stock carefully'}
                </AppText>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
            >
              <Section title={labels.sections.basics}>
                <Field
                  label={labels.fields.name}
                  value={draft.name}
                  onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
                  placeholder={labels.placeholders.name}
                  error={errors.name}
                  isRTL={isRTL}
                  colors={colors}
                  fieldBg={fieldBg}
                  fieldBorder={fieldBorder}
                  placeholderColor={placeholderColor}
                />
                <View style={[styles.row, isRTL && styles.rowRTL]}>
                  <Field
                    label={labels.fields.strength}
                    value={draft.strength}
                    onChangeText={(v) => setDraft((d) => ({ ...d, strength: v }))}
                    placeholder={labels.placeholders.strength}
                    error={errors.strength}
                    isRTL={isRTL}
                    colors={colors}
                    fieldBg={fieldBg}
                    fieldBorder={fieldBorder}
                    placeholderColor={placeholderColor}
                  />
                  <Field
                    label={labels.fields.form}
                    value={draft.form}
                    onChangeText={(v) => setDraft((d) => ({ ...d, form: v }))}
                    placeholder={labels.placeholders.form}
                    error={errors.form}
                    isRTL={isRTL}
                    colors={colors}
                    fieldBg={fieldBg}
                    fieldBorder={fieldBorder}
                    placeholderColor={placeholderColor}
                  />
                </View>
                <View style={[styles.row, isRTL && styles.rowRTL]}>
                  <Field
                    label={labels.fields.category}
                    value={draft.category}
                    onChangeText={(v) => setDraft((d) => ({ ...d, category: v }))}
                    placeholder={labels.placeholders.category}
                    error={errors.category}
                    isRTL={isRTL}
                    colors={colors}
                    fieldBg={fieldBg}
                    fieldBorder={fieldBorder}
                    placeholderColor={placeholderColor}
                  />
                  <Field
                    label={labels.fields.reason}
                    value={draft.reason}
                    onChangeText={(v) => setDraft((d) => ({ ...d, reason: v }))}
                    placeholder={labels.placeholders.reason}
                    error={errors.reason}
                    isRTL={isRTL}
                    colors={colors}
                    fieldBg={fieldBg}
                    fieldBorder={fieldBorder}
                    placeholderColor={placeholderColor}
                  />
                </View>
              </Section>

              <Section title={labels.sections.schedule}>
                <MedicationScheduleEditor
                  value={scheduleDraft}
                  onChange={(next) => setDraft((d) => ({ ...d, scheduleType: next.scheduleType, mealRule: next.mealRule, times: next.times }))}
                  labels={labels.schedule}
                  error={errors.times}
                />
              </Section>

              <Section title={labels.sections.stock}>
                <MedicationStockEditor
                  value={stockDraft}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      quantityType: next.quantityType,
                      totalQuantity: next.totalQuantity,
                      remainingQuantity: next.remainingQuantity,
                      refillThreshold: next.refillThreshold,
                    }))
                  }
                  labels={labels.stock}
                  schedule={{ scheduleType: draft.scheduleType, times: draft.times, frequencyText: draft.scheduleType }}
                />
                {!!errors.remainingQuantity && <InlineError text={errors.remainingQuantity} />}
                {!!errors.totalQuantity && <InlineError text={errors.totalQuantity} />}
                {!!errors.refillThreshold && <InlineError text={errors.refillThreshold} />}
              </Section>

              <Section title={isRTL ? 'ملاحظات' : 'Notes'}>
                <Field
                  label={labels.fields.notes}
                  value={draft.notes}
                  onChangeText={(v) => setDraft((d) => ({ ...d, notes: v }))}
                  placeholder={labels.placeholders.notes}
                  multiline
                  isRTL={isRTL}
                  colors={colors}
                  fieldBg={fieldBg}
                  fieldBorder={fieldBorder}
                  placeholderColor={placeholderColor}
                />
                <Field
                  label={labels.fields.doctorName}
                  value={draft.doctorName}
                  onChangeText={(v) => setDraft((d) => ({ ...d, doctorName: v }))}
                  placeholder={labels.placeholders.doctorName}
                  isRTL={isRTL}
                  colors={colors}
                  fieldBg={fieldBg}
                  fieldBorder={fieldBorder}
                  placeholderColor={placeholderColor}
                />
              </Section>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={[styles.footer, isRTL && styles.rowRTL]}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.footerBtn, { borderColor: border }]}
                activeOpacity={0.85}
                disabled={saving}
              >
                <AppText style={[styles.footerBtnText, { color: colors.textPrimary }]}>{labels.cancel}</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={submit}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                activeOpacity={0.85}
                disabled={saving}
              >
                {saving ? <Ionicons name="sync" size={18} color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <AppText style={styles.primaryBtnText}>{labels.save}</AppText>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

function toDraft(med: Medication | null): MedicationFormDraft {
  const rawTimes = Array.isArray(med?.times) ? (med?.times as any[]) : [];
  const times = rawTimes
    .map((x) => (typeof x === 'string' ? x : typeof x?.time === 'string' ? x.time : ''))
    .map((x) => formatMedicationTime(x))
    .filter(Boolean);

  return {
    name: med?.name ?? '',
    strength: (med?.strength ?? med?.dosage ?? '') as string,
    category: med?.category ?? '',
    reason: med?.reason ?? '',
    form: med?.form ?? '',
    scheduleType: (med?.schedule_type ?? med?.frequency ?? 'once_daily') as string,
    mealRule: med?.meal_rule ?? 'after_food',
    times: times.length > 0 ? times : ['08:00'],
    quantityType: med?.quantity_type ?? 'pills',
    totalQuantity: typeof med?.total_quantity === 'number' && Number.isFinite(med.total_quantity) ? String(med.total_quantity) : '',
    remainingQuantity:
      typeof med?.remaining_quantity === 'number' && Number.isFinite(med.remaining_quantity) ? String(med.remaining_quantity) : '',
    refillThreshold:
      typeof med?.refill_threshold === 'number' && Number.isFinite(med.refill_threshold) ? String(med.refill_threshold) : '',
    notes: med?.notes ?? '',
    doctorName: med?.doctor_name ?? '',
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.9,
  },
  scroll: {
    paddingBottom: 6,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  field: {
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  input: {
    height: 48,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 0,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  footerBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
