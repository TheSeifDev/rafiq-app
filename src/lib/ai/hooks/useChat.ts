/**
 * Chat Hook
 * Manages chat state, AsyncStorage persistence, and AI interactions.
 *
 * STREAMING REMOVED: providerManager.generateStreaming() falls back to
 * non-streaming on Expo SDK 54 React Native.
 *
 * SAVE BUG FIXED: saveMessages() is called with explicit list, not
 * stale closure state. Persistence is isolated from generation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { providerManager } from '../providers/manager';
import { AIMessage, HealthContext } from '../providers/types';

const STORAGE_KEY = '@rafiq_chat_history';
const MAX_MESSAGES = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  suggestedReplies?: string[];
}

interface UseChatOptions {
  healthContext: HealthContext;
  isRTL?: boolean;
  onError?: (error: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat({ healthContext, isRTL = false, onError }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load persisted messages on mount
  useEffect(() => {
    loadMessages();
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────

  const loadMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: any[] = JSON.parse(stored);
        const restored: ChatMessage[] = parsed.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp),
          isStreaming: false,
        }));
        setMessages(restored);
      }
    } catch (err) {
      console.warn('[Chat] Failed to load messages:', (err as Error).message);
    }
  };

  /**
   * Persist messages to AsyncStorage.
   * Receives explicit list to avoid stale closures.
   * Failure is isolated — never propagates to caller.
   */
  const saveMessages = async (msgs: ChatMessage[]): Promise<void> => {
    try {
      const toSave = msgs.slice(-MAX_MESSAGES).map(m => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        isStreaming: false,
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('[Chat] Persistence failed (non-fatal):', {
        message: (err as Error).message,
        location: 'saveMessages',
      });
    }
  };

  // ── Clear ─────────────────────────────────────────────────────────────────

  const clearHistory = useCallback(async () => {
    setMessages([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[Chat] Failed to clear history:', (err as Error).message);
    }
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────

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

      setMessages(prev => [...prev, userMessage, assistantPlaceholder]);
      setIsLoading(true);
      setError(null);

      // Build AI message history from current state before this message
      // Note: do NOT capture `messages` in the closure — use the functional
      // form of setMessages or capture explicitly from the latest rendered list.
      // Here we snapshot via the setter's updater pattern in a ref.
      let historySnapshot: AIMessage[] = [];
      setMessages(prev => {
        historySnapshot = prev
          .filter(m => !m.isStreaming && m.id !== assistantId)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        return prev; // No-op update, just to read latest state
      });

      try {
        const response = await providerManager.generateStreaming(
          historySnapshot,
          healthContext,
          // onChunk — called once with full content (non-streaming on RN)
          (chunk: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, content: chunk } : m
              )
            );
          },
          abortControllerRef.current.signal
        );

        const suggestedReplies = generateSuggestedReplies(content, response.content, isRTL);

        setMessages(prev => {
          const updated = prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: response.content,
                  suggestedReplies,
                }
              : m
          );
          // Isolated persistence
          saveMessages(updated);
          return updated;
        });

        console.log('[Chat] Response from:', response.provider, response.model);
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message?.includes('Aborted')) {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId ? { ...m, isStreaming: false } : m
            )
          );
          setIsLoading(false);
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

        console.error('[Chat] Generation failed:', {
          message: err?.message ?? String(err),
          isRateLimit,
          stack: err?.stack,
        });

        setError(errorMessage);
        onError?.(errorMessage);

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: isRateLimit
                    ? (isRTL
                      ? 'تم تجاوز حد الطلبات، حاول بعد قليل ⏳'
                      : 'Rate limit exceeded, please try again in a moment. ⏳')
                    : (isRTL
                      ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'
                      : 'Sorry, something went wrong. Please try again.'),
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [healthContext, isRTL, onError]
  );

  // ── Cancel ────────────────────────────────────────────────────────────────

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setMessages(prev => prev.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m)));
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancelRequest,
    clearHistory,
  };
}

// ── Suggested replies ─────────────────────────────────────────────────────────

function generateSuggestedReplies(
  userMessage: string,
  _response: string,
  isRTL: boolean
): string[] {
  const lowerUser = userMessage.toLowerCase();

  if (lowerUser.includes('heart') || lowerUser.includes('نبض') || lowerUser.includes('heart rate')) {
    return isRTL
      ? ['ما هو المعدل الطبيعي للنبض؟', 'كيف أخفض معدل نبضاتي؟']
      : ['What is a normal heart rate?', 'How can I lower my heart rate?'];
  }
  if (lowerUser.includes('medication') || lowerUser.includes('دواء')) {
    return isRTL
      ? ['تذكيرني بأدويتي', 'ما هي الآثار الجانبية؟']
      : ['Remind me to take my meds', 'What are the side effects?'];
  }
  if (lowerUser.includes('blood pressure') || lowerUser.includes('ضغط')) {
    return isRTL
      ? ['ما هو الضغط الطبيعي؟', 'كيف أتحكم بضغط الدم؟']
      : ['What is normal blood pressure?', 'How to manage blood pressure?'];
  }
  if (lowerUser.includes('sleep') || lowerUser.includes('نوم')) {
    return isRTL
      ? ['نصائح للنوم أفضل', 'كم ساعة أنام؟']
      : ['Tips for better sleep', 'How many hours should I sleep?'];
  }
  if (lowerUser.includes('food') || lowerUser.includes('طعام')) {
    return isRTL
      ? ['وجبات صحية', 'أطعمة يجب تجنبها']
      : ['Healthy meal plans', 'Foods to avoid'];
  }
  if (lowerUser.includes('exercise') || lowerUser.includes('رياضة')) {
    return isRTL
      ? ['تمارين مناسبة', 'كم مرة أسبوعياً؟']
      : ['Suitable exercises', 'How often per week?'];
  }

  return isRTL
    ? ['أخبرني أكثر', 'نصائح صحية', 'ما أدويتي؟']
    : ['Tell me more', 'Give me health tips', 'What about my medications?'];
}

export default useChat;