import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { useTheme } from '../theme/useTheme';
import { useAppStore } from '../store/app.store';
import { useAuthStore } from '../store/auth.store';
import { notificationService, type AppNotification } from '../services/notification.service';
import { translations } from '../constants/translations';
import { spacing } from '../theme';
import type { MainStackParamList } from '../navigation/types';

// ─── Types ───────────────────────────────────────────────────

type NotifCategory = 'medication' | 'low_stock' | 'emergency' | 'chat' | 'general';
type FilterType = 'all' | 'unread' | 'emergency' | 'medication' | 'chat' | 'other';

interface EnrichedNotification extends Omit<AppNotification, 'category'> {
  category: NotifCategory;
}

interface DateGroup {
  title: string;
  data: EnrichedNotification[];
}

// ─── Category helpers ────────────────────────────────────────

const CATEGORY_CONFIG: Record<NotifCategory, { icon: string; color: string }> = {
  medication: { icon: 'medkit', color: '#10B981' },
  low_stock: { icon: 'alert-circle', color: '#F59E0B' },
  emergency: { icon: 'shield-checkmark', color: '#FF3B3B' },
  chat: { icon: 'chatbubbles', color: '#00C2FF' },
  general: { icon: 'notifications', color: '#94A3B8' },
};

function categorize(type: string | null): NotifCategory {
  if (!type) return 'general';
  if (type.includes('medication') || type === 'med_missed_check') return 'medication';
  if (type.includes('low_stock') || type === 'med_low_stock') return 'low_stock';
  if (type.includes('emergency') || type === 'critical_alert' || type === 'critical') return 'emergency';
  if (type.includes('chat') || type === 'chat_message') return 'chat';
  return 'general';
}

function relativeTime(iso: string, isAr: boolean): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((now - then) / 60_000);

  if (diffMin < 1) return isAr ? 'الآن' : 'Just now';
  if (diffMin < 60) return isAr ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isAr ? `منذ ${diffHr} ساعة` : `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return isAr ? 'أمس' : 'Yesterday';
  if (diffDay < 7) return isAr ? `منذ ${diffDay} أيام` : `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
}

function groupByDate(items: EnrichedNotification[], isAr: boolean): DateGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map<string, EnrichedNotification[]>();

  for (const n of items) {
    const d = new Date(n.created_at);
    d.setHours(0, 0, 0, 0);
    let key: string;
    if (d.getTime() === today.getTime()) {
      key = isAr ? 'اليوم' : 'Today';
    } else if (d.getTime() === yesterday.getTime()) {
      key = isAr ? 'أمس' : 'Yesterday';
    } else {
      key = d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long' });
    }
    const arr = groups.get(key) ?? [];
    arr.push(n);
    groups.set(key, arr);
  }

  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

// ─── Filter chip ─────────────────────────────────────────────

function FilterChip({
  label,
  active,
  count,
  onPress,
  colors,
  darkMode,
}: {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
  colors: any;
  darkMode: boolean;
}) {
  const bg = active ? colors.primary : (darkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9');
  const textColor = active ? '#FFFFFF' : colors.textSecondary;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg }]}
    >
      <AppText style={[styles.chipText, { color: textColor }]}>{label}</AppText>
      {count != null && count > 0 && (
        <View style={[styles.chipBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : (darkMode ? '#2A2F3D' : '#E2E8F0') }]}>
          <AppText style={[styles.chipBadgeText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
            {count > 99 ? '99+' : count}
          </AppText>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Notification card ───────────────────────────────────────

function NotificationCard({
  notification,
  onPress,
  colors,
  darkMode,
  isAr,
}: {
  notification: EnrichedNotification;
  onPress: () => void;
  colors: any;
  darkMode: boolean;
  isAr: boolean;
}) {
  const cfg = CATEGORY_CONFIG[notification.category];
  const surfaceBg = darkMode ? 'rgba(30, 41, 59, 0.80)' : 'rgba(255, 255, 255, 0.92)';
  const unreadBg = !notification.is_read
    ? (darkMode ? 'rgba(0, 194, 255, 0.06)' : 'rgba(0, 194, 255, 0.04)')
    : 'transparent';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.card, { backgroundColor: surfaceBg, borderLeftColor: cfg.color + '60' }, !notification.is_read && { backgroundColor: unreadBg }]}
    >
      <View style={styles.cardRow}>
        {/* Category icon */}
        <View style={[styles.cardIconWrap, { backgroundColor: cfg.color + '15' }]}>
          <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <AppText
              style={[styles.cardTitle, { color: colors.textPrimary, fontWeight: notification.is_read ? '500' : '700' }]}
              numberOfLines={1}
            >
              {notification.title}
            </AppText>
            <AppText style={[styles.cardTime, { color: colors.textSecondary }]}>
              {relativeTime(notification.created_at, isAr)}
            </AppText>
          </View>
          <AppText style={[styles.cardBody, { color: colors.textSecondary }]} numberOfLines={2}>
            {notification.body}
          </AppText>
        </View>

        {/* Unread dot */}
        {!notification.is_read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────

export function NotificationCenterScreen(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const session = useAuthStore((s) => s.session);
  const isAr = language === 'ar';
  const t = translations[language];

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // ── Load ──
  const load = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const data = await notificationService.getNotifications(session.user.id);
      setNotifications(data);
    } catch (err) {
      console.warn('[NotificationCenter] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Real-time subscription ──
  useEffect(() => {
    if (!session?.user.id) return;
    const unsubscribe = notificationService.subscribe(session.user.id, (n) => {
      setNotifications((prev) => [n, ...prev]);
    });
    return unsubscribe;
  }, [session?.user.id]);

  // ── Enrich + filter ──
  const enriched = useMemo<EnrichedNotification[]>(
    () => notifications.map((n) => ({ ...n, category: categorize(n.type) })),
    [notifications],
  );

  const unreadCount = useMemo(() => enriched.filter((n) => !n.is_read).length, [enriched]);

  const filtered = useMemo<EnrichedNotification[]>(() => {
    switch (filter) {
      case 'unread': return enriched.filter((n) => !n.is_read);
      case 'medication': return enriched.filter((n) => n.category === 'medication' || n.category === 'low_stock');
      case 'emergency': return enriched.filter((n) => n.category === 'emergency');
      case 'chat': return enriched.filter((n) => n.category === 'chat');
      case 'other': return enriched.filter((n) => n.category === 'general');
      default: return enriched;
    }
  }, [enriched, filter]);

  const sections = useMemo(() => groupByDate(filtered, isAr), [filtered, isAr]);

  // ── Category counts ──
  const counts = useMemo(() => ({
    unread: unreadCount,
    medication: enriched.filter((n) => n.category === 'medication' || n.category === 'low_stock').length,
    emergency: enriched.filter((n) => n.category === 'emergency').length,
    chat: enriched.filter((n) => n.category === 'chat').length,
    other: enriched.filter((n) => n.category === 'general').length,
  }), [enriched, unreadCount]);

  // ── Actions ──
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      console.warn('[NotificationCenter] markRead failed:', err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      await notificationService.markAllRead(session.user.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.warn('[NotificationCenter] markAllRead failed:', err);
    }
  }, [session?.user.id]);

  const handleNotificationPress = useCallback((n: EnrichedNotification) => {
    if (!n.is_read) markRead(n.id);

    // Navigate to related screen based on category
    switch (n.category) {
      case 'medication':
      case 'low_stock':
        navigation.navigate('MainTabs', { screen: 'Medications' });
        break;
      case 'emergency':
        navigation.navigate('MainTabs', { screen: 'Emergency' });
        break;
      case 'chat':
        navigation.navigate('MainTabs', { screen: 'Chat' });
        break;
      default:
        break;
    }
  }, [navigation, markRead]);

  // ── Filter labels ──
  const filterLabels: Record<FilterType, string> = {
    all: isAr ? 'الكل' : 'All',
    unread: isAr ? 'غير مقروء' : 'Unread',
    emergency: isAr ? 'طوارئ' : 'Emergency',
    medication: isAr ? 'أدوية' : 'Medication',
    chat: isAr ? 'محادثة' : 'Chat',
    other: isAr ? 'أخرى' : 'Other',
  };

  // ── Render ──

  const renderHeader = () => (
    <View>
      {/* Unread banner */}
      {unreadCount > 0 && (
        <View style={[styles.banner, { backgroundColor: colors.primary + '10' }]}>
          <Ionicons name="mail-unread-outline" size={18} color={colors.primary} />
          <AppText style={[styles.bannerText, { color: colors.primary }]}>
            {isAr ? `لديك ${unreadCount} إشعارات غير مقروءة` : `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`}
          </AppText>
        </View>
      )}

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {(Object.keys(filterLabels) as FilterType[]).map((key) => (
          <FilterChip
            key={key}
            label={filterLabels[key]}
            active={filter === key}
            count={key === 'all' ? enriched.length : counts[key as keyof typeof counts]}
            onPress={() => setFilter(key)}
            colors={colors}
            darkMode={darkMode}
          />
        ))}
      </ScrollView>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary + '40'} />
      <AppText style={[styles.emptyText, { color: colors.textSecondary }]}>
        {isAr ? 'لا توجد إشعارات' : 'No notifications'}
      </AppText>
    </View>
  );

  return (
    <Screen>
      <ScreenHeader
        title={isAr ? 'الإشعارات' : 'Notifications'}
        onBack={() => navigation.goBack()}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {unreadCount > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={markAllRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="checkmark-done" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('NotificationSettings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? renderEmpty : null}
        renderSectionHeader={({ section }) => (
          <AppText style={[styles.sectionDate, { color: colors.textSecondary }]}>
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) => (
          <NotificationCard
            notification={item}
            onPress={() => handleNotificationPress(item)}
            colors={colors}
            darkMode={darkMode}
            isAr={isAr}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Chips
  chipsContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Section date
  sectionDate: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  // Card
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 16,
    borderLeftWidth: 3,
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    flex: 1,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },

  // List
  listContent: {
    paddingBottom: 110,
  },
});
