/**
 * FoodScreen - Medical Nutrition Guidance
 * Complete food management for patients with medical conditions
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { useTheme } from '../theme/useTheme';
import { useAppStore } from '../store/app.store';
import { useAuthStore } from '../store/auth.store';
import { spacing, radius } from '../theme';
import { translations } from '../constants/translations';

// ─── Types ───────────────────────────────────────────────────

type FoodCategory = 'healthy' | 'unhealthy' | 'recommended' | 'forbidden' | 'favorites';
type ConditionType = 'diabetes' | 'heart' | 'hypertension' | 'kidney' | 'all';

interface FoodItem {
  id: string;
  name: string;
  nameAr: string;
  category: 'fruits' | 'vegetables' | 'proteins' | 'grains' | 'dairy' | 'beverages' | 'snacks' | 'prepared';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  isHealthy: boolean;
  restrictions: string[];
  benefits: string[];
  warnings: string[];
  glycemicIndex?: number;
}

interface ForbiddenFood {
  id: string;
  foodName: string;
  nameAr?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  condition: string;
}

// ─── Sample Data (in production, this comes from Supabase) ───

const SAMPLE_FOODS: FoodItem[] = [
  // Healthy foods
  { id: '1', name: 'Broccoli', nameAr: 'بروكلي', category: 'vegetables', calories: 55, protein: 3.7, carbs: 11, fat: 0.4, fiber: 5.1, sugar: 2.2, isHealthy: true, restrictions: [], benefits: ['Rich in vitamins', 'Anti-inflammatory', 'Supports heart health'], warnings: [] },
  { id: '2', name: 'Salmon', nameAr: 'سمك السلمون', category: 'proteins', calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, sugar: 0, isHealthy: true, restrictions: [], benefits: ['High in omega-3', 'Heart health', 'Brain function'], warnings: [] },
  { id: '3', name: 'Spinach', nameAr: 'سبانخ', category: 'vegetables', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4, isHealthy: true, restrictions: [], benefits: ['Iron-rich', 'Bone health', 'Eye health'], warnings: ['Contains oxalates - limit if kidney issues'] },
  { id: '4', name: 'Oats', nameAr: 'شوفان', category: 'grains', calories: 389, protein: 16.9, carbs: 66, fat: 6.9, fiber: 10.6, sugar: 0, isHealthy: true, restrictions: [], benefits: ['Lowers cholesterol', 'Stabilizes blood sugar', 'Heart healthy'], warnings: [], glycemicIndex: 55 },
  { id: '5', name: 'Apple', nameAr: 'تفاح', category: 'fruits', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, isHealthy: true, restrictions: [], benefits: ['Rich in fiber', 'Heart health', 'Weight management'], warnings: ['Contains sugar - monitor for diabetes'], glycemicIndex: 36 },
  { id: '6', name: 'Greek Yogurt', nameAr: 'زبادي يوناني', category: 'dairy', calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2, isHealthy: true, restrictions: [], benefits: ['High protein', 'Probiotics', 'Bone health'], warnings: ['Check lactose tolerance'] },
  { id: '7', name: 'Almonds', nameAr: 'لوز', category: 'proteins', calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5, sugar: 4.4, isHealthy: true, restrictions: [], benefits: ['Heart healthy', 'Blood sugar control', 'Rich in vitamin E'], warnings: ['High in calories - watch portions'] },
  { id: '8', name: 'Avocado', nameAr: 'أفوكادو', category: 'fruits', calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7, sugar: 0.7, isHealthy: true, restrictions: [], benefits: ['Heart healthy fats', 'Potassium', 'Eye health'], warnings: [] },

  // Unhealthy foods
  { id: '9', name: 'French Fries', nameAr: 'بطاطس مقلية', category: 'prepared', calories: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, sugar: 0.3, isHealthy: false, restrictions: ['diabetes', 'heart', 'hypertension'], benefits: [], warnings: ['High sodium', 'High fat', 'Processed'] },
  { id: '10', name: 'Soda', nameAr: 'مشروبات غازية', category: 'beverages', calories: 41, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6, isHealthy: false, restrictions: ['diabetes', 'heart', 'hypertension'], benefits: [], warnings: ['High sugar', 'Empty calories', 'Bad for teeth'], glycemicIndex: 70 },
  { id: '11', name: 'White Bread', nameAr: 'خبز أبيض', category: 'grains', calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, sugar: 5, isHealthy: false, restrictions: ['diabetes'], benefits: [], warnings: ['High glycemic index', 'Low fiber', 'Blood sugar spike'], glycemicIndex: 75 },
  { id: '12', name: 'Candy', nameAr: 'حلوى', category: 'snacks', calories: 375, protein: 0, carbs: 95, fat: 0, fiber: 0, sugar: 75, isHealthy: false, restrictions: ['diabetes'], benefits: [], warnings: ['High sugar', 'No nutritional value', 'Bad for teeth'], glycemicIndex: 80 },
  { id: '13', name: 'Fried Chicken', nameAr: 'دجاج مقلي', category: 'prepared', calories: 247, protein: 19, carbs: 10, fat: 15, fiber: 0.5, sugar: 0, isHealthy: false, restrictions: ['heart', 'hypertension'], benefits: [], warnings: ['High saturated fat', 'High sodium', 'Processed breading'] },
  { id: '14', name: 'Ice Cream', nameAr: 'آيس كريم', category: 'dairy', calories: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0, sugar: 21, isHealthy: false, restrictions: ['diabetes', 'heart'], benefits: [], warnings: ['High sugar', 'High saturated fat', 'High calories'], glycemicIndex: 61 },
];

const SAMPLE_FORBIDDEN: ForbiddenFood[] = [
  { id: 'f1', foodName: 'Table Salt', nameAr: 'ملح الطعام', reason: 'Causes water retention and raises blood pressure', severity: 'high', condition: 'hypertension' },
  { id: 'f2', foodName: 'White Rice', nameAr: 'أرز أبيض', reason: 'High glycemic index - causes rapid blood sugar spikes', severity: 'high', condition: 'diabetes' },
  { id: 'f3', foodName: 'Red Meat', nameAr: 'لحم أحمر', reason: 'High in saturated fats - clogs arteries', severity: 'medium', condition: 'heart' },
  { id: 'f4', foodName: 'Banana', nameAr: 'موز', reason: 'High in potassium - may affect kidney function', severity: 'medium', condition: 'kidney' },
  { id: 'f5', foodName: 'Processed Foods', nameAr: 'أطعمة مصنعة', reason: 'High sodium and preservatives', severity: 'high', condition: 'hypertension' },
];

// ─── Condition Colors ──────────────────────────────────────────

const CONDITION_COLORS: Record<string, string> = {
  diabetes: '#EF4444',
  heart: '#F59E0B',
  hypertension: '#8B5CF6',
  kidney: '#10B981',
  general: '#6B7280',
};

const CONDITION_LABELS: Record<string, { ar: string; en: string }> = {
  diabetes: { ar: 'السكري', en: 'Diabetes' },
  heart: { ar: 'أمراض القلب', en: 'Heart Disease' },
  hypertension: { ar: 'ضغط الدم', en: 'Hypertension' },
  kidney: { ar: 'أمراض الكلى', en: 'Kidney Disease' },
  all: { ar: 'الجميع', en: 'All Conditions' },
};

// ─── Food Card Component ──────────────────────────────────────

function FoodCard({ item, onPress, colors, darkMode, isAr }: {
  item: FoodItem;
  onPress: () => void;
  colors: any;
  darkMode: boolean;
  isAr: boolean;
}) {
  const statusColor = item.isHealthy ? colors.success : colors.danger;
  const restrictions = item.restrictions.map(r => CONDITION_COLORS[r] || colors.textSecondary);

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}
      style={[styles.foodCard, { backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
      <View style={styles.foodCardHeader}>
        <View style={[styles.foodIconWrap, { backgroundColor: statusColor + '15' }]}>
          <Ionicons name={item.isHealthy ? 'checkmark-circle' : 'close-circle'} size={22} color={statusColor} />
        </View>
        <View style={styles.foodInfo}>
          <AppText style={[styles.foodName, { color: colors.textPrimary }]} numberOfLines={1}>
            {isAr ? item.nameAr : item.name}
          </AppText>
          <AppText style={[styles.foodCategory, { color: colors.textSecondary }]}>
            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
          </AppText>
        </View>
        <View style={[styles.calBadge, { backgroundColor: colors.primary + '12' }]}>
          <AppText style={[styles.calText, { color: colors.primary }]}>{item.calories}</AppText>
          <AppText style={[styles.calLabel, { color: colors.primary + '80' }]}>cal</AppText>
        </View>
      </View>

      {/* Macros Row */}
      <View style={styles.macrosRow}>
        {[
          { label: isAr ? 'بروتين' : 'Protein', val: `${item.protein}g` },
          { label: isAr ? 'كرب' : 'Carbs', val: `${item.carbs}g` },
          { label: isAr ? 'دهون' : 'Fat', val: `${item.fat}g` },
          { label: isAr ? 'ألياف' : 'Fiber', val: `${item.fiber}g` },
        ].map((m, i) => (
          <View key={i} style={[styles.macroItem, { borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <AppText style={[styles.macroVal, { color: colors.textPrimary }]}>{m.val}</AppText>
            <AppText style={[styles.macroLabel, { color: colors.textSecondary }]}>{m.label}</AppText>
          </View>
        ))}
      </View>

      {/* Restrictions */}
      {item.restrictions.length > 0 && (
        <View style={styles.restrictionsRow}>
          {item.restrictions.map((r, i) => (
            <View key={i} style={[styles.restrictionBadge, { backgroundColor: (CONDITION_COLORS[r] || colors.textSecondary) + '15' }]}>
              <AppText style={[styles.restrictionText, { color: CONDITION_COLORS[r] || colors.textSecondary }]}>
                {CONDITION_LABELS[r]?.[isAr ? 'ar' : 'en'] || r}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Food Detail Modal Content ─────────────────────────────────

function FoodDetail({ item, colors, darkMode, isAr, t }: {
  item: FoodItem;
  colors: any;
  darkMode: boolean;
  isAr: boolean;
  t: any;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.detailCard, { backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <View style={[styles.detailIcon, { backgroundColor: (item.isHealthy ? colors.success : colors.danger) + '15' }]}>
          <Ionicons name={item.isHealthy ? 'leaf' : 'warning'} size={28} color={item.isHealthy ? colors.success : colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={[styles.detailName, { color: colors.textPrimary }]}>{isAr ? item.nameAr : item.name}</AppText>
          <AppText style={[styles.detailCategory, { color: colors.textSecondary }]}>{item.category}</AppText>
        </View>
        <View style={[styles.detailStatus, { backgroundColor: (item.isHealthy ? colors.success : colors.danger) + '15' }]}>
          <AppText style={[styles.detailStatusText, { color: item.isHealthy ? colors.success : colors.danger }]}>
            {item.isHealthy ? (isAr ? 'صحي' : 'Healthy') : (isAr ? 'غير صحي' : 'Unhealthy')}
          </AppText>
        </View>
      </View>

      {/* Nutritional Info Grid */}
      <View style={styles.nutritionGrid}>
        {[
          { label: isAr ? 'السعرات' : 'Calories', value: item.calories, unit: 'kcal' },
          { label: isAr ? 'البروتين' : 'Protein', value: item.protein, unit: 'g' },
          { label: isAr ? 'الكربوهيدرات' : 'Carbs', value: item.carbs, unit: 'g' },
          { label: isAr ? 'الدهون' : 'Fat', value: item.fat, unit: 'g' },
          { label: isAr ? 'الألياف' : 'Fiber', value: item.fiber, unit: 'g' },
          { label: isAr ? 'السكر' : 'Sugar', value: item.sugar, unit: 'g' },
          ...(item.glycemicIndex ? [{ label: isAr ? 'مؤشر السكر' : 'GI', value: item.glycemicIndex, unit: '' }] : []),
        ].map((n, i) => (
          <View key={i} style={[styles.nutritionCell, { borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <AppText style={[styles.nutritionLabel, { color: colors.textSecondary }]}>{n.label}</AppText>
            <View style={styles.nutritionValueRow}>
              <AppText style={[styles.nutritionValue, { color: colors.textPrimary }]}>{n.value}</AppText>
              <AppText style={[styles.nutritionUnit, { color: colors.textSecondary }]}>{n.unit}</AppText>
            </View>
          </View>
        ))}
      </View>

      {/* Benefits */}
      {item.benefits.length > 0 && (
        <View style={styles.detailSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles" size={16} color={colors.success} />
            <AppText style={[styles.sectionTitle, { color: colors.success }]}>{t.aiRecommendation}</AppText>
          </View>
          {item.benefits.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.success }]} />
              <AppText style={[styles.bulletText, { color: colors.textSecondary }]}>{b}</AppText>
            </View>
          ))}
        </View>
      )}

      {/* Warnings */}
      {item.warnings.length > 0 && (
        <View style={styles.detailSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <AppText style={[styles.sectionTitle, { color: colors.warning }]}>{t.warnings || 'Warnings'}</AppText>
          </View>
          {item.warnings.map((w, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.warning }]} />
              <AppText style={[styles.bulletText, { color: colors.textSecondary }]}>{w}</AppText>
            </View>
          ))}
        </View>
      )}

      {/* Conditions */}
      {item.restrictions.length > 0 && (
        <View style={styles.detailSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="medkit" size={16} color={colors.danger} />
            <AppText style={[styles.sectionTitle, { color: colors.danger }]}>{t.basedOnConditions}</AppText>
          </View>
          <View style={styles.conditionsRow}>
            {item.restrictions.map((r, i) => (
              <View key={i} style={[styles.conditionBadge, { backgroundColor: (CONDITION_COLORS[r] || colors.textSecondary) + '15' }]}>
                <AppText style={[styles.conditionText, { color: CONDITION_COLORS[r] || colors.textSecondary }]}>
                  {CONDITION_LABELS[r]?.[isAr ? 'ar' : 'en'] || r}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Forbidden Food Card ────────────────────────────────────────

function ForbiddenCard({ item, colors, darkMode, isAr }: {
  item: ForbiddenFood;
  colors: any;
  darkMode: boolean;
  isAr: boolean;
}) {
  const severityColors = { low: colors.success, medium: colors.warning, high: colors.danger, critical: '#7C3AED' };

  return (
    <View style={[styles.forbiddenCard, { backgroundColor: colors.danger + '08', borderColor: colors.danger + '30' }]}>
      <View style={styles.forbiddenHeader}>
        <View style={[styles.forbiddenIcon, { backgroundColor: colors.danger + '15' }]}>
          <Ionicons name="warning" size={18} color={colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={[styles.forbiddenName, { color: colors.textPrimary }]}>{item.foodName}</AppText>
          <AppText style={[styles.forbiddenCondition, { color: colors.danger }]}>
            {CONDITION_LABELS[item.condition]?.[isAr ? 'ar' : 'en'] || item.condition}
          </AppText>
        </View>
        <View style={[styles.severityBadge, { backgroundColor: severityColors[item.severity] + '20' }]}>
          <AppText style={[styles.severityText, { color: severityColors[item.severity] }]}>{item.severity}</AppText>
        </View>
      </View>
      <View style={styles.reasonRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
        <AppText style={[styles.reasonText, { color: colors.textSecondary }]}>{item.reason}</AppText>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export function FoodScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const { colors, darkMode, isRTL } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language];
  const isAr = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FoodCategory>('healthy');
  const [activeCondition, setActiveCondition] = useState<ConditionType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);

  // Filter foods based on search and condition
  const filteredFoods = useMemo(() => {
    let foods = activeTab === 'healthy' || activeTab === 'unhealthy'
      ? SAMPLE_FOODS.filter(f => activeTab === 'healthy' ? f.isHealthy : !f.isHealthy)
      : SAMPLE_FOODS;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      foods = foods.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.nameAr.includes(q) ||
        f.category.includes(q)
      );
    }

    if (activeCondition !== 'all') {
      if (activeCondition === 'diabetes') {
        foods = foods.filter(f => !f.isHealthy || f.glycemicIndex === undefined || f.glycemicIndex < 55);
      } else {
        foods = foods.filter(f => !f.restrictions.includes(activeCondition));
      }
    }

    return foods;
  }, [activeTab, searchQuery, activeCondition]);

  const tabs: { key: FoodCategory; label: string; icon: string }[] = [
    { key: 'healthy', label: t.healthyFoods, icon: 'checkmark-circle' },
    { key: 'unhealthy', label: t.unhealthyFoods, icon: 'close-circle' },
    { key: 'recommended', label: t.recommendedFoods, icon: 'star' },
    { key: 'forbidden', label: t.forbiddenFoods, icon: 'alert-circle' },
    { key: 'favorites', label: t.favoriteFoods, icon: 'heart' },
  ];

  const conditions: ConditionType[] = ['all', 'diabetes', 'heart', 'hypertension', 'kidney'];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // In production: fetch from Supabase
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  return (
    <Screen style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title={t.foodTitle}
        onBack={() => navigation.goBack()}
      />
      {t.foodSubtitle && (
        <View style={[styles.subtitleRow, { borderBottomColor: colors.border }]}>
          <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>{t.foodSubtitle}</AppText>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.searchFood}
            placeholderTextColor={colors.textSecondary + '60'}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Condition Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.conditionsScroll}>
          {conditions.map((c) => (
            <TouchableOpacity
              key={c}
              activeOpacity={0.7}
              onPress={() => setActiveCondition(c)}
              style={[
                styles.conditionChip,
                {
                  backgroundColor: activeCondition === c
                    ? (CONDITION_COLORS[c] || colors.primary) + '20'
                    : darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: activeCondition === c
                    ? (CONDITION_COLORS[c] || colors.primary)
                    : 'transparent',
                },
              ]}
            >
              <AppText style={[
                styles.conditionChipText,
                { color: activeCondition === c ? (CONDITION_COLORS[c] || colors.primary) : colors.textSecondary },
              ]}>
                {CONDITION_LABELS[c]?.[isAr ? 'ar' : 'en'] || c}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              onPress={() => { setActiveTab(tab.key); setSelectedFood(null); }}
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === tab.key ? colors.primary : darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                },
              ]}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.key ? '#FFFFFF' : colors.textSecondary}
              />
              <AppText style={[
                styles.tabText,
                { color: activeTab === tab.key ? '#FFFFFF' : colors.textSecondary },
              ]}>
                {tab.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Food List */}
        {selectedFood ? (
          <FoodDetail item={selectedFood} colors={colors} darkMode={darkMode} isAr={isAr} t={t} />
        ) : (
          <View style={styles.foodGrid}>
            {filteredFoods.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search" size={48} color={colors.textSecondary + '40'} />
                <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {isAr ? 'لم يتم العثور على أطعمة' : 'No foods found'}
                </AppText>
              </View>
            ) : (
              filteredFoods.map((food) => (
                <FoodCard
                  key={food.id}
                  item={food}
                  onPress={() => setSelectedFood(food)}
                  colors={colors}
                  darkMode={darkMode}
                  isAr={isAr}
                />
              ))
            )}
          </View>
        )}

        {/* Forbidden Foods Section */}
        {(activeTab === 'forbidden' || activeCondition !== 'all') && (
          <View style={styles.forbiddenSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <AppText style={[styles.sectionHeaderText, { color: colors.danger }]}>{t.forbiddenFoods}</AppText>
            </View>
            {SAMPLE_FORBIDDEN
              .filter(f => activeCondition === 'all' || f.condition === activeCondition)
              .map((item) => (
                <ForbiddenCard key={item.id} item={item} colors={colors} darkMode={darkMode} isAr={isAr} />
              ))}
          </View>
        )}

        {/* AI Nutrition Tip */}
        <View style={[styles.aiTip, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <View style={styles.aiTipHeader}>
            <View style={[styles.aiIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="bulb" size={20} color={colors.primary} />
            </View>
            <AppText style={[styles.aiTipTitle, { color: colors.primary }]}>{t.aiRecommendation}</AppText>
          </View>
          <AppText style={[styles.aiTipText, { color: colors.textSecondary }]}>
            {isAr
              ? 'استشر طبيبك قبل إجراء أي تغييرات في نظامك الغذائي. النظام الغذائي المناسب يعتمد على حالتك الصحية وأدويتك.'
              : 'Always consult your doctor before making dietary changes. The right diet depends on your health conditions and medications.'}
          </AppText>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: 110,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  conditionsScroll: {
    gap: 8,
    marginBottom: spacing.md,
  },
  conditionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  conditionChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabsScroll: {
    gap: 8,
    marginBottom: spacing.md,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  foodGrid: {
    gap: spacing.md,
  },
  foodCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  foodCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  foodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '700',
  },
  foodCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  calBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  calText: {
    fontSize: 15,
    fontWeight: '800',
  },
  calLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  macroVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  restrictionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  restrictionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  restrictionText: {
    fontSize: 10,
    fontWeight: '600',
  },
  detailCard: {
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  detailIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  detailStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  nutritionCell: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  nutritionLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  nutritionValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  nutritionUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
  detailSection: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  conditionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  forbiddenSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  forbiddenCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  forbiddenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  forbiddenIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forbiddenName: {
    fontSize: 14,
    fontWeight: '700',
  },
  forbiddenCondition: {
    fontSize: 11,
    marginTop: 2,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 4,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiTip: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  aiTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  aiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTipTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  aiTipText: {
    fontSize: 13,
    lineHeight: 19,
    paddingLeft: 4,
  },
  subtitleRow: {
    marginHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
  },
});