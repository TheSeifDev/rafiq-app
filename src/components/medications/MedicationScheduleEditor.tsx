import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui/AppText';
import { useTheme } from '../../theme/useTheme';
import { radius, spacing } from '../../theme';
import { formatMedicationTime, normalizeTime } from '../../lib/medications/medicationSchedule';

export type ScheduleDraft = {
  scheduleType: string;
  mealRule: string;
  times: string[];
  customDays?: number[];
  exactTime?: string;
};

const SCHEDULE_TYPES: Array<{ key: string; ar: string; en: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'once_daily', ar: 'مرة يومياً', en: 'Once daily', icon: 'sunny' },
  { key: 'twice_daily', ar: 'مرتين يومياً', en: 'Twice daily', icon: 'time' },
  { key: 'three_times_daily', ar: '3 مرات يومياً', en: '3× daily', icon: 'repeat' },
  { key: 'every_x_hours', ar: 'كل X ساعات', en: 'Every X hours', icon: 'timer' },
  { key: 'weekly', ar: 'أسبوعياً', en: 'Weekly', icon: 'calendar' },
  { key: 'custom', ar: 'مخصص', en: 'Custom', icon: 'options' },
];

const MEAL_RULES: Array<{ key: string; ar: string; en: string }> = [
  { key: 'after_food', ar: 'بعد الأكل', en: 'After food' },
  { key: 'before_food', ar: 'قبل الأكل', en: 'Before food' },
  { key: 'with_food', ar: 'مع الأكل', en: 'With food' },
  { key: 'before_sleep', ar: 'قبل النوم', en: 'Before sleep' },
  { key: 'after_waking', ar: 'بعد الاستيقاظ', en: 'After waking' },
  { key: 'exact', ar: 'وقت محدد', en: 'Exact time' },
];

const DAYS_OF_WEEK: Array<{ index: number; ar: string; en: string }> = [
  { index: 0, ar: 'الأحد', en: 'Sun' },
  { index: 1, ar: 'الاثنين', en: 'Mon' },
  { index: 2, ar: 'الثلاثاء', en: 'Tue' },
  { index: 3, ar: 'الأربعاء', en: 'Wed' },
  { index: 4, ar: 'الخميس', en: 'Thu' },
  { index: 5, ar: 'الجمعة', en: 'Fri' },
  { index: 6, ar: 'السبت', en: 'Sat' },
];

function ensureSlots(times: string[], scheduleType: string): string[] {
  const base = times.length ? [...times] : ['8:00 AM'];
  const need =
    scheduleType === 'once_daily' ? 1
    : scheduleType === 'twice_daily' ? 2
    : scheduleType === 'three_times_daily' ? 3
    : base.length;
  while (base.length < need) base.push('');
  return [...base.slice(0, Math.max(1, need))];
}

export function MedicationScheduleEditor({
  value,
  onChange,
  labels,
  error,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  labels: { title: string; scheduleType: string; mealRule: string; times: string; addTime: string; hhmm: string };
  error?: string;
}): React.JSX.Element {
  const { colors, darkMode, isRTL } = useTheme();
  const bg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const border = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  const times = useMemo(() => ensureSlots(value.times, value.scheduleType), [value.times, value.scheduleType]);

  const [customDays, setCustomDays] = useState<number[]>(value.customDays ?? []);
  const [exactTime, setExactTime] = useState(value.exactTime ?? '');

  function toggleDay(dayIndex: number) {
    const next = customDays.includes(dayIndex)
      ? customDays.filter((d) => d !== dayIndex)
      : [...customDays, dayIndex].sort((a, b) => a - b);
    setCustomDays(next);
    onChange({ ...value, customDays: next });
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.titleRow, isRTL && styles.rowRTL]}>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>{labels.title}</AppText>
        {!!error && (
          <View style={[styles.errorPill, { backgroundColor: `${colors.danger}14`, borderColor: `${colors.danger}33` }]}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <AppText style={[styles.errorText, { color: colors.danger }]} numberOfLines={1}>
              {error}
            </AppText>
          </View>
        )}
      </View>

      <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{labels.scheduleType}</AppText>
      <View style={[styles.chipGrid, isRTL && styles.rowRTL]}>
        {SCHEDULE_TYPES.map((s) => (
          <Chip
            key={s.key}
            label={isRTL ? s.ar : s.en}
            icon={s.icon}
            selected={value.scheduleType === s.key}
            onPress={() => onChange({ ...value, scheduleType: s.key, times: ensureSlots(times, s.key) })}
          />
        ))}
      </View>

      {}
      {value.scheduleType === 'custom' && (
        <View style={{ gap: spacing.sm }}>
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {isRTL ? 'اختر الأيام' : 'Select days'}
          </AppText>
          <View style={[styles.chipGrid, isRTL && styles.rowRTL]}>
            {DAYS_OF_WEEK.map((day) => {
              const selected = customDays.includes(day.index);
              return (
                <TouchableOpacity
                  key={day.index}
                  onPress={() => toggleDay(day.index)}
                  activeOpacity={0.85}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: selected ? 'rgba(0,194,255,0.15)' : bg,
                      borderColor: selected ? 'rgba(0,194,255,0.4)' : border,
                    },
                  ]}
                >
                  <AppText
                    style={[styles.dayChipText, { color: selected ? colors.primary : colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {isRTL ? day.ar : day.en}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{labels.mealRule}</AppText>
      <View style={[styles.chipGrid, isRTL && styles.rowRTL]}>
        {MEAL_RULES.map((m) => (
          <Chip
            key={m.key}
            label={isRTL ? m.ar : m.en}
            selected={value.mealRule === m.key}
            onPress={() => onChange({ ...value, mealRule: m.key })}
          />
        ))}
      </View>

      {}
      {value.mealRule === 'exact' && (() => {
        const valid = !!normalizeTime(exactTime);
        const bad = exactTime.trim().length > 0 && !valid;
        return (
          <View style={{ gap: spacing.sm }}>
            <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {isRTL ? 'الوقت المحدد' : 'Exact time'}
            </AppText>
            <View style={[styles.timeCell, { backgroundColor: bg, borderColor: bad ? `${colors.danger}55` : border }]}>
              <Ionicons name="alarm" size={16} color={bad ? colors.danger : colors.textSecondary} />
              <TextInput
                value={exactTime}
                onChangeText={(v) => {
                  setExactTime(v);
                  onChange({ ...value, exactTime: v });
                }}
                placeholder="HH:MM"
                placeholderTextColor={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)'}
                keyboardType="numbers-and-punctuation"
                style={[styles.timeInput, { color: colors.textPrimary, textAlign: 'center' }]}
              />
              {valid && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
              {bad && <Ionicons name="alert-circle" size={16} color={colors.danger} />}
            </View>
          </View>
        );
      })()}

      <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>{labels.times}</AppText>
      <View style={[styles.timesGrid, isRTL && styles.rowRTL]}>
        {times.map((t, idx) => {
          const normalized = t.trim() ? normalizeTime(t) : null;
          const isBad = t.trim().length > 0 && !normalized;
          return (
            <View
              key={idx}
              style={[
                styles.timeCell,
                { backgroundColor: bg, borderColor: isBad ? `${colors.danger}55` : border },
              ]}
            >
              <Ionicons name="alarm" size={16} color={isBad ? colors.danger : colors.textSecondary} />
              <TextInput
                value={t}
                onChangeText={(v) => {
                  const next = [...times];
                  next[idx] = v;
                  onChange({ ...value, times: next });
                }}
                onBlur={() => {
                  if (!normalized) return;
                  const next = [...times];
                  next[idx] = formatMedicationTime(normalized);
                  onChange({ ...value, times: next });
                }}
                placeholder={labels.hhmm}
                placeholderTextColor={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)'}
                style={[styles.timeInput, { color: colors.textPrimary, textAlign: 'center' }]}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                onPress={() => {
                  const next = [...times];
                  next[idx] = '';
                  onChange({ ...value, times: next });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={!t}
                style={{ opacity: t ? 1 : 0.35 }}
              >
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onChange({ ...value, times: [...times, ''] })}
        style={[styles.addTimeBtn, { borderColor: border }]}
      >
        <Ionicons name="add" size={16} color={colors.primary} />
        <AppText style={[styles.addTimeText, { color: colors.textPrimary }]}>{labels.addTime}</AppText>
      </TouchableOpacity>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const bg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const border = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        { backgroundColor: selected ? `${colors.primary}1A` : bg, borderColor: selected ? `${colors.primary}55` : border },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.primary : colors.textSecondary} />}
      <AppText style={[styles.chipText, { color: selected ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.9,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.button,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  timesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.button,
    borderWidth: 1,
    minWidth: 130,
    flexGrow: 1,
  },
  timeInput: {
    flex: 1,
    minWidth: 60,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
    paddingVertical: 0,
  },
  addTimeBtn: {
    height: 46,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addTimeText: {
    fontSize: 13,
    fontWeight: '900',
  },
  errorPill: {
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '900',
    opacity: 0.95,
  },
});
