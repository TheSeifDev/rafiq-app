import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiManager, type AIResponse, type HealthContextData, type StreamChunk } from '../orchestration';
import { patientContextAggregator, type PatientContext } from '../../../services/ai/PatientContextAggregator';
import { sanitizeForAI } from '../security/sanitizeForAI';

const STORAGE_KEY = '@rafiq_ai_state';

const getUserId = async (): Promise<string | null> => {
  try {
    const userId = await AsyncStorage.getItem('@rafiq_userId');
    return userId;
  } catch (err) {
    console.warn('[AI Chat] Failed to get userId:', err);
    return null;
  }
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoningDetails?: string;
  timestamp: Date;
  isStreaming?: boolean;
  isReasoning?: boolean;
  suggestedReplies?: string[];
  healthInsights?: any[];
  tokensPerSecond?: number;
}

export interface AIChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  isReasoning: boolean;
  error: string | null;
  provider: string;
  tokensPerSecond: number;
}

interface UseAICHatOptions {
  userId?: string | null;
  isRTL?: boolean;
  onError?: (error: string) => void;
  onProviderChange?: (provider: string) => void;
}

const convertPatientContextToHealthContext = (pc: PatientContext): HealthContextData => {
  return {
    patientName: pc.fullName || 'User',
    latestVitals: {
      heartRate: undefined,
      bloodPressureSys: undefined,
      bloodPressureDia: undefined,
      oxygenSaturation: undefined,
      temperature: undefined,
    },
    medications: pc.medications.active.map(m => ({
      name: m.name,
      dosage: m.dosage ?? undefined,
      time: m.time_of_day?.join(', ') ?? undefined,
      active: m.is_active,
    })),
    recentAlerts: [],
    foodLogs: [],
    sleepRecords: [],
    conditions: pc.conditions.list.map(c => ({
      name: c.name,
      severity: c.severity,
      diagnosedDate: c.diagnosedDate,
      notes: c.notes,
      isActive: c.isActive,
    })),
    allergies: pc.allergies.list,
    hospital: {
      name: pc.hospital.name,
      address: pc.hospital.data.address,
      phone: pc.hospital.data.phone,
      hasMedicalFile: pc.hospital.data.hasMedicalFile,
      fileNumber: pc.hospital.data.fileNumber,
    },
    reporter: {
      name: pc.reporter.data.name,
      relationship: pc.reporter.relation,
      phone: pc.reporter.data.phone,
      isPrimaryContact: pc.reporter.data.isPrimaryContact,
    },
    address: {
      city: pc.address.city,
      area: pc.address.area,
      detailed: pc.address.detailed,
      geocoded: pc.address.geocoded,
    },
    emergency: {
      contacts: pc.emergency.contacts.map(c => ({
        name: c.name,
        relation: c.relation,
        phone: c.phone,
        isPrimary: !!c.is_primary,
      })),
      primaryContact: pc.emergency.primaryContact
        ? {
          name: pc.emergency.primaryContact.name,
          relation: pc.emergency.primaryContact.relation,
          phone: pc.emergency.primaryContact.phone,
          isPrimary: !!pc.emergency.primaryContact.is_primary,
        }
        : null,
      profile: pc.emergency.profile,
    },
    profileCompletion: {
      percentage: pc.profileCompletion.percentage,
      completedFields: pc.profileCompletion.completedFields,
      missingFields: pc.profileCompletion.missingFields,
      readinessScore: pc.profileCompletion.readinessScore,
    },
    lastUpdated: new Date().toISOString(),
  };
};

export function useAICHat({
  isRTL = false,
  onError,
  onProviderChange,
  userId,
}: UseAICHatOptions) {
  const [state, setState] = useState<AIChatState>({
    messages: [],
    isLoading: false,
    isStreaming: false,
    isReasoning: false,
    error: null,
    provider: 'none',
    tokensPerSecond: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    loadPersistedState();
  }, []);

  const loadPersistedState = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const messages: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          isStreaming: false,
          isReasoning: false,
        }));
        setState(prev => ({ ...prev, messages }));
      }
    } catch (err) {
      console.warn('[AI Chat] Failed to load persisted state:', (err as Error).message);
    }
  };

  const persistMessages = async (messages: ChatMessage[]): Promise<void> => {
    try {
      const toSave = messages.slice(-50).map(m => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        isStreaming: false,
        isReasoning: false,
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: toSave }));
    } catch (err) {
      console.error('[AI Chat] Persistence failed (non-fatal):', {
        message: (err as Error).message,
        location: 'persistMessages',
      });
    }
  };

  const clearMemory = useCallback(async () => {
    aiManager.clearMemory();
    setState(prev => ({
      ...prev,
      messages: [],
      provider: 'none',
      tokensPerSecond: 0,
    }));
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[AI Chat] Failed to clear storage:', (err as Error).message);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const userMessage: ChatMessage = {
        id: `${Date.now()}_user`,
        role: 'user',
        content,
        timestamp: new Date(),
      };

      const assistantId = `${Date.now()}_assistant`;
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage, assistantPlaceholder],
        isLoading: true,
        isStreaming: true,
        isReasoning: false,
        error: null,
      }));

      try {
        const effectiveUserId = userId || await getUserId();
        let healthContextToUse: HealthContextData | undefined;
        if (effectiveUserId) {
          try {
            const patientContext = await patientContextAggregator.aggregate(effectiveUserId);

            aiManager.setPatientContext(patientContext);

            const existingContext = aiManager.getExistingHealthContext?.();
            const converted = convertPatientContextToHealthContext(patientContext);
            healthContextToUse = {
              ...converted,
              latestVitals: {
                heartRate:       existingContext?.latestVitals?.heartRate       ?? converted.latestVitals?.heartRate,
                bloodPressureSys:existingContext?.latestVitals?.bloodPressureSys ?? converted.latestVitals?.bloodPressureSys,
                bloodPressureDia:existingContext?.latestVitals?.bloodPressureDia ?? converted.latestVitals?.bloodPressureDia,
                oxygenSaturation:existingContext?.latestVitals?.oxygenSaturation ?? converted.latestVitals?.oxygenSaturation,
                temperature:     existingContext?.latestVitals?.temperature     ?? converted.latestVitals?.temperature,
              },
              recentAlerts: existingContext?.recentAlerts ?? converted.recentAlerts,
              foodLogs:     existingContext?.foodLogs     ?? converted.foodLogs,
              sleepRecords: existingContext?.sleepRecords ?? converted.sleepRecords,
            };
          } catch (ctxErr) {
            console.warn('[AI Chat] Health context aggregation failed (non-fatal):', ctxErr);
          }
        }

        if (healthContextToUse) {
          if (!initializedRef.current) {
            aiManager.initialize(healthContextToUse);
            initializedRef.current = true;
          } else {
            aiManager.updateHealthContext(healthContextToUse);
          }
        }

        const sanitizedContent = sanitizeForAI(content);

        const response: AIResponse = await aiManager.generate(
          sanitizedContent,
          (_chunk: StreamChunk) => { },
          abortControllerRef.current?.signal,
        );

        const suggestedReplies = generateSuggestions(content, response.content, isRTL);

        const finalAssistant: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: response.content,
          reasoningDetails: response.reasoningDetails,
          timestamp: new Date(),
          isStreaming: false,
          isReasoning: false,
          suggestedReplies,
          healthInsights: response.insights,
          tokensPerSecond: response.tokensPerSecond,
        };

        setState(prev => {
          const updatedMessages = prev.messages.map(m =>
            m.id === assistantId ? finalAssistant : m
          );

          persistMessages(updatedMessages);

          return {
            ...prev,
            isLoading: false,
            isStreaming: false,
            isReasoning: false,
            provider: response.provider,
            tokensPerSecond: response.tokensPerSecond ?? 0,
            messages: updatedMessages,
          };
        });

        onProviderChange?.(response.provider);
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message?.includes('Aborted')) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            isStreaming: false,
            isReasoning: false,
            messages: prev.messages.map(m =>
              m.id === assistantId ? { ...m, isStreaming: false, content: '...' } : m
            ),
          }));
          return;
        }

        const isRateLimit =
          err?.name === 'AIRateLimitError' ||
          err?.statusCode === 429 ||
          err?.isRateLimitError === true ||
          (typeof err?.message === 'string' && (
            err.message.startsWith('RateLimitError') ||
            err.message.includes('429') ||
            err.message.toLowerCase().includes('rate limit')
          ));

        const errorMessage: string = isRateLimit
          ? (isRTL
            ? 'تم تجاوز حد الطلبات، حاول بعد قليل'
            : 'Rate limit exceeded, please try again in a moment.')
          : (err?.message ?? 'Failed to get response');

        console.error('[AI Chat] Generation failed:', {
          message: err?.message ?? String(err),
          isRateLimit,
          stack: err?.stack,
        });

        setState(prev => ({
          ...prev,
          isLoading: false,
          isStreaming: false,
          isReasoning: false,
          error: errorMessage,
          messages: prev.messages.map(m =>
            m.id === assistantId
              ? {
                ...m,
                isStreaming: false,
                content: isRateLimit
                  ? (isRTL
                    ? 'تم تجاوز حد الطلبات، حاول بعد قليل ⏳'
                    : 'Rate limit exceeded, please try again in a moment. ⏳')
                  : (isRTL
                    ? 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.'
                    : 'Sorry, there was a connection error. Please try again.'),
              }
              : m
          ),
        }));

        onError?.(errorMessage);
      }
    },
    [isRTL, onError, onProviderChange]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        isReasoning: false,
        messages: prev.messages.map(m =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        ),
      }));
    }
  }, []);

  const selectSuggestion = useCallback(
    async (suggestion: string) => {
      await sendMessage(suggestion);
    },
    [sendMessage]
  );

  return {
    ...state,
    sendMessage,
    cancelRequest,
    clearMemory,
    selectSuggestion,
  };
}

function generateSuggestions(
  userMessage: string,
  _response: string,
  isRTL: boolean
): string[] {
  const lower = userMessage.toLowerCase();

  if (lower.includes('heart') || lower.includes('\u0646\u0628\u0636') || lower.includes('pulse')) {
    return isRTL
      ? ['\u0645\u0627 \u0647\u0648 \u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0637\u0628\u064a\u0639\u064a\u061f', '\u0643\u064a\u0641 \u0623\u0642\u064a\u0633 \u0646\u0628\u0636\u064a\u061f', '\u0645\u062a\u0649 \u0623\u0642\u0644\u0642\u061f']
      : ['What is normal rate?', 'How do I measure?', 'When to worry?'];
  }
  if (lower.includes('medication') || lower.includes('\u062f\u0648\u0627\u0621') || lower.includes('medicine')) {
    return isRTL
      ? ['\u062a\u0630\u0643\u064a\u0631 \u0628\u0627\u0644\u0623\u062f\u0648\u064a\u0629', '\u0627\u0644\u0622\u062b\u0627\u0631 \u0627\u0644\u062c\u0627\u0646\u0628\u064a\u0629', '\u0647\u0644 \u064a\u0645\u0643\u0646\u0646\u064a \u0627\u0644\u062a\u0648\u0642\u0641\u061f']
      : ['Remind me', 'Side effects?', 'Can I stop?'];
  }
  if (lower.includes('blood pressure') || lower.includes('\u0636\u063a\u0637')) {
    return isRTL
      ? ['\u0645\u0627 \u0647\u0648 \u0627\u0644\u0636\u063a\u0637 \u0627\u0644\u0637\u0628\u064a\u0639\u064a\u061f', '\u0643\u064a\u0641 \u0623\u062a\u062d\u0643\u0645 \u0628\u0627\u0644\u0636\u063a\u0637\u061f', '\u0647\u0644 \u0623\u062d\u062a\u0627\u062c \u062f\u0648\u0627\u0621\u061f']
      : ['What is normal?', 'How to manage?', 'Do I need medicine?'];
  }
  if (lower.includes('sleep') || lower.includes('\u0646\u0648\u0645')) {
    return isRTL
      ? ['\u0646\u0635\u0627\u0626\u062d \u0644\u0644\u0646\u0648\u0645', '\u0643\u0645 \u0633\u0627\u0639\u0629 \u0623\u0646\u0627\u0645\u061f', '\u0645\u0627 \u0623\u0633\u0628\u0627\u0628 \u0627\u0644\u0623\u0631\u0642\u061f']
      : ['Sleep tips', 'Hours needed?', 'Causes of insomnia?'];
  }
  if (lower.includes('food') || lower.includes('\u0637\u0639\u0627\u0645')) {
    return isRTL
      ? ['\u0648\u062c\u0628\u0627\u062a \u0635\u062d\u064a\u0629', '\u0623\u0637\u0639\u0645\u0629 \u064a\u062c\u0628 \u062a\u062c\u0646\u0628\u0647\u0627', '\u0646\u0635\u0627\u0626\u062d \u063a\u0630\u0627\u0626\u064a\u0629']
      : ['Healthy meals', 'Foods to avoid', 'Nutrition tips'];
  }
  if (lower.includes('fever') || lower.includes('\u062d\u0631\u0627\u0631\u0629') || lower.includes('\u062d\u0645\u0649')) {
    return isRTL
      ? ['\u0645\u0627\u0630\u0627 \u0623\u0641\u0639\u0644\u061f', '\u0645\u062a\u0649 \u0623\u0630\u0647\u0628 \u0644\u0644\u0637\u0628\u064a\u0628\u061f', '\u0643\u064a\u0641 \u0623\u062e\u0641\u0636 \u0627\u0644\u062d\u0631\u0627\u0631\u0629\u061f']
      : ['What to do?', 'When to see doctor?', 'How to reduce fever?'];
  }

  return isRTL
    ? ['\u0623\u062e\u0628\u0631\u0646\u064a \u0623\u0643\u062b\u0631', '\u0646\u0635\u0627\u0626\u062d \u0635\u062d\u064a\u0629', '\u0623\u062f\u0648\u064a\u062a\u064a\u061f']
    : ['Tell me more', 'Health tips', 'My medications?'];
}

export default useAICHat;
