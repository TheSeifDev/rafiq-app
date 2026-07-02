/**
 * chat.service.ts
 *
 * Uses supabase.functions.invoke() instead of raw fetch.
 * This automatically attaches the correct Authorization header.
 *
 * FIX #7: Properly extract error body from 429 and other non-2xx responses.
 * The old code checked `error.status === 429` BEFORE reading `error.context?.reply`,
 * so the helpful Arabic message from the edge function was never shown.
 */

import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type EdgeFunctionBody = {
  messages: ChatMessage[];
  vitals: string;
};

type EdgeFunctionResponse = {
  reply?: string;
  error?: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const INVOKE_TIMEOUT_MS = 45_000;

// ─── Main export ──────────────────────────────────────────────────────────────

export async function sendChat(
  messages: ChatMessage[],
  vitalsSummary: string,
): Promise<string> {
  console.log("[chat.service] → invoking chat-ai", `(${messages.length} messages)`);

  const body: EdgeFunctionBody = {
    messages,
    vitals: vitalsSummary,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

  let data: EdgeFunctionResponse | null = null;
  let error: { message?: string; status?: number; context?: { reply?: string } } | null = null;

  try {
    const result = await supabase.functions.invoke<EdgeFunctionResponse>(
      "chat-ai",
      { body, signal: controller.signal },
    );
    data = result.data;
    error = result.error;
  } catch (invokeErr) {
    const msg = invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
    console.error("[chat.service] invoke network error:", msg);

    if (msg.includes('AbortError') || msg.includes('abort') || msg.includes('timeout')) {
      return "انتهت مهلة الاتصال بالذكاء الاصطناعي. حاول مجدداً.";
    }
    return "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مجدداً.";
  } finally {
    clearTimeout(timeoutId);
  }

  // ── Invocation error ───────────────────────────────────────────────
  if (error) {
    console.error("[chat.service] invoke error:", error.message, "status:", error.status);

    const status = error.status;

    // FIX #7: ALWAYS try to read the reply from the error body first.
    // The edge function ALWAYS returns 200 with { reply: "..." } for handled errors,
    // but for 429 it returns a non-200 status with the Arabic message in the body.
    const bodyReply = error.context?.reply;
    if (bodyReply) {
      console.log('[chat.service] Recovered reply from error body:', bodyReply.slice(0, 80));
      return bodyReply;
    }

    // Fallback to status-mapped Arabic strings
    if (status === 429) return "الخدمة مشغولة حالياً، حاول بعد قليل.";
    if (status === 401) return "غير مصرح بالوصول. تحقق من إعدادات التطبيق.";
    if (status === 500) return "حدث خطأ في الخادم. حاول مجدداً لاحقاً.";
    if (status === 503 || status === 504) return "انتهت مهلة الاتصال. تحقق من اتصالك.";

    // If we have a data object from the error (some Supabase versions)
    if (data?.reply) return data.reply;

    // Network error (no status)
    if (!status || status === 0) {
      return "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مجدداً.";
    }

    return "تعذّر الاتصال بالخادم. تحقق من اتصالك.";
  }

  console.log("[chat.service] ← reply:", data?.reply?.slice(0, 80) ?? "(empty)");

  return data?.reply?.trim() || "لم أتمكن من فهم الرد. حاول مجدداً.";
}