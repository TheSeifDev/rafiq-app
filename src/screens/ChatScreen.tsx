import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  Animated,
} from "react-native";
import { useAppStore } from "../store/app.store";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "../components/ui/Screen";
import { useLocale } from "../hooks/useLocale";
import { useAuthStore } from "../store/auth.store";
import { useAICHat, type ChatMessage } from "../lib/ai/hooks/useAICHat";
import { patientService } from "../services/patient.service";
import { vitalsService } from "../services/vitals.service";
import { medicationService } from "../services/medication.service";
import { parseMedicationTimes, formatMedicationTime } from "../lib/medications/medicationSchedule";
import { getChatTheme, type ChatTheme } from "../theme/chatTheme";
import { HealthContextData } from "../lib/ai/orchestration";
import { aiManager } from "../lib/ai/orchestration";
import { env, logStatus } from "../config/env";

const DEFAULT_HEALTH_CONTEXT: HealthContextData = {
  patientName: "User",
  latestVitals: {
    heartRate: 0,
    bloodPressureSys: 0,
    bloodPressureDia: 0,
    oxygenSaturation: 0,
    temperature: 0,
  },
  medications: [],
  recentAlerts: [],
  foodLogs: [],
  sleepRecords: [],
  conditions: [],
  allergies: [],
  hospital: {
    name: null,
    address: null,
    phone: null,
    hasMedicalFile: null,
    fileNumber: null,
  },
  reporter: {
    name: null,
    relationship: null,
    phone: null,
    isPrimaryContact: null,
  },
  address: {
    city: null,
    area: null,
    detailed: null,
    geocoded: null,
  },
  emergency: {
    contacts: [],
    primaryContact: null,
    profile: null,
  },
  profileCompletion: {
    percentage: 0,
    completedFields: [],
    missingFields: [],
    readinessScore: 0,
  },
  lastUpdated: new Date().toISOString(),
};

function PremiumHeader({ isRTL, theme }: { isRTL: boolean; theme: ChatTheme }) {
  return (
    <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.headerContent}>
        <View style={[styles.avatarCircle, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="heart" size={22} color={theme.primary} />
          <View style={[styles.onlineIndicator, { backgroundColor: theme.online }]} />
        </View>

        <View style={styles.headerTextContainer}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Rafiq</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: theme.online }]} />
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {isRTL ? '\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0637\u0628\u064a \u0627\u0644\u0630\u0643\u064a \u00b7 \u0645\u062a\u0635\u0644' : 'Medical AI Assistant \u00b7 Online'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const AIBubble = memo(function AIBubble({
  content,
  isStreaming,
  isRTL,
  theme,
}: {
  content: string;
  isStreaming?: boolean;
  isRTL: boolean;
  theme: ChatTheme;
}) {
  if (!content && isStreaming) return null;

  return (
    <View style={[styles.aiMessageRow, isRTL && styles.aiMessageRowRTL]}>
      <View style={[styles.aiAvatar, { backgroundColor: theme.primarySoft }]}>
        <Text style={styles.aiAvatarIcon}>{'\uD83C\uDFE5'}</Text>
      </View>

      <View style={[
        styles.aiBubble,
        { backgroundColor: theme.aiBubble, shadowColor: theme.shadowBubble },
        isRTL && styles.aiBubbleRTL,
      ]}>
        <Text style={[styles.aiText, { color: theme.aiBubbleText }]}>
          {content || '...'}
        </Text>
        {isStreaming && (
          <Animated.View style={[styles.cursorBlock, { backgroundColor: theme.primary }]} />
        )}
      </View>
    </View>
  );
});

const UserBubble = memo(function UserBubble({ content, isRTL, theme }: { content: string; isRTL: boolean; theme: ChatTheme }) {
  return (
    <View style={[styles.userMessageRow, isRTL && styles.userMessageRowRTL]}>
      <View style={[styles.userBubble, { backgroundColor: theme.userBubble }]}>
        <Text style={[styles.userText, { color: theme.userBubbleText }]}>
          {content}
        </Text>
      </View>
    </View>
  );
});

const ThinkingIndicator = memo(function ThinkingIndicator({ isRTL, theme }: { isRTL: boolean; theme: ChatTheme }) {
  const dot1 = React.useRef(new Animated.Value(0.3)).current;
  const dot2 = React.useRef(new Animated.Value(0.3)).current;
  const dot3 = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ])
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 160);
    const a3 = pulse(dot3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={[styles.thinkingRow, isRTL && styles.thinkingRowRTL]}>
      <View style={[styles.thinkingAvatar, { backgroundColor: theme.primarySoft }]}>
        <Text style={styles.thinkingIcon}>{'\uD83C\uDFE5'}</Text>
      </View>
      <View style={[styles.thinkingDots, { backgroundColor: theme.aiBubble }]}>
        <Animated.View style={[styles.thinkDot, { opacity: dot1, backgroundColor: theme.thinking }]} />
        <Animated.View style={[styles.thinkDot, { opacity: dot2, backgroundColor: theme.thinking }]} />
        <Animated.View style={[styles.thinkDot, { opacity: dot3, backgroundColor: theme.thinking }]} />
      </View>
    </View>
  );
});

function PremiumInput({
  onSend,
  isRTL,
  theme,
  disabled,
}: {
  onSend: (msg: string) => void;
  isRTL: boolean;
  theme: ChatTheme;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const sendAnim = useRef(new Animated.Value(1)).current;
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;

    Animated.sequence([
      Animated.spring(sendAnim, { toValue: 0.75, useNativeDriver: true, speed: 120 }),
      Animated.spring(sendAnim, { toValue: 1, useNativeDriver: true, speed: 80, bounciness: 8 }),
    ]).start();

    onSend(text.trim());
    setText('');
  };

  return (
    <View style={[styles.inputContainer, { borderTopColor: theme.border }]}>
      <View style={[
        styles.inputWrapper,
        {
          backgroundColor: theme.inputBackground,
          borderColor: theme.inputBorder,
        },
      ]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isRTL ? '\u0631\u0633\u0627\u0644\u0629...' : 'Message...'}
          placeholderTextColor={theme.inputPlaceholder}
          multiline
          maxLength={1000}
          editable={!disabled}
          style={[
            styles.textInput,
            { color: theme.inputText },
            isRTL && styles.textInputRTL,
          ]}
          returnKeyType="default"
          blurOnSubmit={false}
        />

        <Animated.View style={{ transform: [{ scale: sendAnim }] }}>
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            hitSlop={8}
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? theme.primary : 'transparent' },
            ]}
          >
            <Ionicons
              name={isRTL ? "arrow-back" : "send"}
              size={17}
              color={canSend ? '#fff' : theme.textTertiary}
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function EmptyState({ onSelect, isRTL, theme }: { onSelect: (msg: string) => void; isRTL: boolean; theme: ChatTheme }) {
  const suggestions = isRTL
    ? ['\u062a\u0630\u0643\u064a\u0631 \u0628\u0627\u0644\u0623\u062f\u0648\u064a\u0629', '\u0646\u0628\u0636 \u0627\u0644\u0642\u0644\u0628', '\u0642\u064a\u0627\u0633 \u0627\u0644\u062d\u0631\u0627\u0631\u0629', '\u0648\u062c\u0628\u0627\u062a \u0635\u062d\u064a\u0629']
    : ['Med reminder', 'Heart rate', 'Check fever', 'Healthy meals'];

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrapper, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name="heart" size={40} color={theme.primary} />
      </View>

      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
        {isRTL ? '\u0645\u0633\u0627\u0639\u062f\u0643 \u0627\u0644\u0635\u062d\u064a \u0627\u0644\u0630\u0643\u064a' : 'Your Health Assistant'}
      </Text>

      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {isRTL ? '\u0627\u0633\u0623\u0644\u0646\u064a \u0639\u0646 \u0635\u062d\u062a\u0643...' : 'Ask me about your health...'}
      </Text>

      <View style={[styles.suggestionGrid, isRTL && styles.suggestionGridRTL]}>
        {suggestions.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => onSelect(item)}
            style={[styles.suggestionChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[styles.suggestionText, { color: theme.primary }]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ChatScreen(): React.JSX.Element {
  const { isRTL } = useLocale();
  const session = useAuthStore((s) => s.session);
  const insets = useSafeAreaInsets();
  const darkMode = useAppStore((s) => s.darkMode);
  const theme = getChatTheme(darkMode);

  let tabH = 0;
  try {
    tabH = useBottomTabBarHeight();
  } catch {
    tabH = Platform.OS === "ios" ? 83 : 62;
  }
  const bottomOffset = Math.max(tabH, Platform.OS === 'ios' ? 83 : 62) + insets.bottom;

  const [healthContext, setHealthContext] = useState<HealthContextData>(DEFAULT_HEALTH_CONTEXT);

  const listRef = useRef<FlatList>(null);

  useEffect(() => { logStatus(); }, []);

  useEffect(() => {
    let alive = true;

    async function loadHealthContext() {
      if (!session?.user.id) return;
      try {
        const profile = await patientService.getProfile(session.user.id);
        if (!profile || !alive) return;

        let latestVitals: Awaited<ReturnType<typeof vitalsService.getLatestVitals>> = null;
        let meds: Awaited<ReturnType<typeof medicationService.getMedications>> = [];

        const results = await Promise.allSettled([
          vitalsService.getLatestVitals(profile.id),
          medicationService.getMedications(profile.id),
        ]);

        if (results[0].status === 'fulfilled') latestVitals = results[0].value;
        else console.warn('[Chat] Failed to load vitals:', results[0].reason);

        if (results[1].status === 'fulfilled') meds = results[1].value;
        else console.warn('[Chat] Failed to load medications:', results[1].reason);

        const medications = meds
          .filter((m) => (m.active ?? m.is_active) !== false)
          .map((m) => {
            const firstTime = parseMedicationTimes(m.times, m.time_of_day).find((dose) => dose.kind === "time");
            const time = firstTime?.kind === "time" ? formatMedicationTime(firstTime.time) : undefined;
            return { name: m.name, dosage: m.dosage, time, active: true };
          });

        if (alive) {
          setHealthContext({
            patientName: profile.full_name || "User",
            latestVitals: {
              heartRate: latestVitals?.heart_rate ?? 0,
              bloodPressureSys: latestVitals?.blood_pressure_systolic ?? 0,
              bloodPressureDia: latestVitals?.blood_pressure_diastolic ?? 0,
              oxygenSaturation: latestVitals?.oxygen_saturation ?? 0,
              temperature: latestVitals?.temperature ?? 0,
            },
            medications,
            recentAlerts: [],
            foodLogs: [],
            sleepRecords: [],
            conditions: [],
            allergies: [],
            hospital: {
              name: null,
              address: null,
              phone: null,
              hasMedicalFile: null,
              fileNumber: null,
            },
            reporter: {
              name: null,
              relationship: null,
              phone: null,
              isPrimaryContact: null,
            },
            address: {
              city: null,
              area: null,
              detailed: null,
              geocoded: null,
            },
            emergency: {
              contacts: [],
              primaryContact: null,
              profile: null,
            },
            profileCompletion: {
              percentage: 0,
              completedFields: [],
              missingFields: [],
              readinessScore: 0,
            },
            lastUpdated: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn("[Chat] Failed to load health context (non-fatal):", err);
      }
    }

    loadHealthContext();
    return () => { alive = false; };
  }, [session?.user.id]);

  useEffect(() => {
    aiManager.updateHealthContext(healthContext);
    if (!aiManager.isInitialized()) {
      aiManager.initialize(healthContext);
    }
  }, [healthContext]);

  const { messages, isLoading, isStreaming, sendMessage } = useAICHat({
    isRTL,
    userId: session?.user.id,
    onError: (err) => console.log("[Chat] Error:", err),
  });

  const lastMsg = messages[messages.length - 1];
  const showThinking =
    (isLoading || isStreaming) &&
    messages.length > 0 &&
    !lastMsg?.content;

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      return <UserBubble content={item.content} isRTL={isRTL} theme={theme} />;
    }
    return (
      <AIBubble
        content={item.content}
        isStreaming={item.isStreaming}
        isRTL={isRTL}
        theme={theme}
      />
    );
  }, [isRTL, theme]);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <Screen style={{ backgroundColor: theme.background }}>

      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: theme.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <PremiumHeader isRTL={isRTL} theme={theme} />

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={[styles.listContent, { paddingBottom: 16 }]}
          ListEmptyComponent={
            <EmptyState onSelect={sendMessage} isRTL={isRTL} theme={theme} />
          }
          showsVerticalScrollIndicator={false}
        />

        {showThinking && (
          <View style={styles.thinkingContainer}>
            <ThinkingIndicator isRTL={isRTL} theme={theme} />
          </View>
        )}

        <View style={{ paddingBottom: bottomOffset }}>
          <PremiumInput
            onSend={sendMessage}
            isRTL={isRTL}
            theme={theme}
            disabled={isLoading}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  onlineIndicator: {
    position: 'absolute', bottom: 2, right: 2,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: '#fff',
  },
  headerTextContainer: { marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 12 },

  listContent: { paddingTop: 16, paddingHorizontal: 16, flexGrow: 1 },

  aiMessageRow: { flexDirection: 'row', marginBottom: 12 },
  aiMessageRowRTL: { flexDirection: 'row-reverse' },
  aiAvatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10, marginTop: 4,
  },
  aiAvatarIcon: { fontSize: 16 },
  aiBubble: {
    flex: 1, maxWidth: '78%',
    borderRadius: 18, borderTopLeftRadius: 4,
    padding: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  aiBubbleRTL: {
    borderTopLeftRadius: 18, borderTopRightRadius: 4,
    marginRight: 10, marginLeft: 0,
  },
  aiText: { fontSize: 15, lineHeight: 22 },
  cursorBlock: { width: 2, height: 16, borderRadius: 1, marginTop: 4 },

  userMessageRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  userMessageRowRTL: { justifyContent: 'flex-start' },
  userBubble: {
    maxWidth: '78%', borderRadius: 18, borderBottomRightRadius: 4,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  userText: { fontSize: 15, lineHeight: 22 },

  thinkingContainer: { paddingBottom: 4 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  thinkingRowRTL: { flexDirection: 'row-reverse' },
  thinkingAvatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  thinkingIcon: { fontSize: 16 },
  thinkingDots: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16,
  },
  thinkDot: { width: 7, height: 7, borderRadius: 3.5, marginHorizontal: 3 },

  inputContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 26,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
    maxHeight: 120,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    maxHeight: 100,
  },
  textInputRTL: { textAlign: 'right' },
  sendButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },

  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 100, paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginBottom: 24, textAlign: 'center' },
  suggestionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestionGridRTL: { flexDirection: 'row-reverse' },
  suggestionChip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
  suggestionText: { fontSize: 13, fontWeight: '500' },
});