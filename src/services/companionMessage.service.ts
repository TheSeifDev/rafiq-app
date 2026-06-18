/**
 * companionMessage.service.ts
 *
 * Generates a dynamic, warm AI companion message for the Home screen.
 *
 * Logic:
 * 1. Reads the last 5 user messages from the chat cache (AsyncStorage).
 * 2. Detects language: Arabic or English.
 * 3. Matches the last message to a topic pool (pain, stomach, mood, general).
 * 4. Returns a short, emotionally-aware follow-up message.
 * 5. Falls back gracefully when no chat history exists.
 *
 * No LLM call — fast, offline-safe, deterministic.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────

export interface CompanionMessage {
  message: string;
  isAr: boolean;
  icon: string; // Ionicons name
  topic: "pain" | "mood" | "general" | "medication" | "followup" | "greeting";
}

// ─── Chat cache key (must match ChatScreen storage) ──────────
const CHAT_CACHE_KEY = "rafiq_chat_messages";

// ─── Arabic letter detector ──────────────────────────────────
function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// ─── Topic detection from message text ───────────────────────
type Topic = CompanionMessage["topic"];

interface TopicRule {
  topic: Topic;
  ar: RegExp;
  en: RegExp;
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: "pain",
    ar: /وجع|ألم|بطن|رأس|ظهر|مؤلم|يؤلم|تعب|صداع/,
    en: /pain|ache|hurt|stomach|head|back|sore|cramp/i,
  },
  {
    topic: "mood",
    ar: /حزين|زهقت|مش كويس|تعبان|خايف|وحيد|مش مرتاح|ضايق|قلقان|تعب/,
    en: /sad|tired|anxious|worried|lonely|scared|bad|upset|stressed|not (well|good|okay|ok)/i,
  },
  {
    topic: "medication",
    ar: /دواء|حبة|جرعة|نسيت|أخدت|ما أخدت|دوا/,
    en: /medicine|medication|pill|dose|forgot|taken|skip/i,
  },
  {
    topic: "followup",
    ar: /أحسن|تحسنت|كويس|مرتاح|هادي|نوم|نمت/,
    en: /better|improved|good|fine|sleep|slept|great|well/i,
  },
];

function detectTopic(text: string): Topic {
  const lower = text.toLowerCase();
  for (const rule of TOPIC_RULES) {
    if (rule.ar.test(lower) || rule.en.test(lower)) {
      return rule.topic;
    }
  }
  return "general";
}

// ─── Message pools ────────────────────────────────────────────

type MessagePool = { ar: string[]; en: string[] };

const POOLS: Record<Topic, MessagePool> = {
  pain: {
    ar: [
      "الألم عامل إيه النهارده؟",
      "بطنك أحسن النهارده؟",
      "الصداع ما زال معاك؟",
      "جسمك أحسن من إمبارح؟",
      "عندك أي ألم النهارده؟",
    ],
    en: [
      "How's the pain today?",
      "Feeling better than yesterday?",
      "Is the discomfort still bothering you?",
      "How is your body feeling today?",
      "Any pain I should know about today?",
    ],
  },
  mood: {
    ar: [
      "عامل إيه النهارده؟ حابب نتكلم شوية؟",
      "إزيك النهارده؟ أنا هنا لو محتاج حاجة.",
      "روحك أحسن النهارده؟",
      "مزاجك عامل إيه؟",
      "النهارده أحسن من إمبارح إن شاء الله.",
    ],
    en: [
      "How are you feeling today?",
      "I'm here if you need to talk.",
      "Feeling any better today?",
      "Your well-being matters. How's today going?",
      "Hope today is kinder than yesterday.",
    ],
  },
  medication: {
    ar: [
      "ما تنساش دواءك النهارده.",
      "هاخدت دواءك؟",
      "تذكير ودود: جرعتك المهمة.",
      "الالتزام بالدواء بيحدث فرق كبير.",
      "دواءك اليومي جاهز؟",
    ],
    en: [
      "Don't forget your medication today.",
      "Have you taken your dose yet?",
      "A gentle reminder about your medication.",
      "Staying consistent with your medication makes a big difference.",
      "Your daily medication — all set?",
    ],
  },
  followup: {
    ar: [
      "سعيد إنك أحسن! يومك يكمل حلو.",
      "التحسن ده بسبب التزامك، برافو.",
      "بكرة أحسن وأحسن إن شاء الله.",
      "استمر كده وجسمك هيشكرك.",
      "ده اللي بحبه أسمعه، مبروك عليك.",
    ],
    en: [
      "Glad you're feeling better!",
      "That's great to hear. Keep it up!",
      "Your consistency is paying off.",
      "Looking forward to another good day for you.",
      "Progress — even small — matters. Well done.",
    ],
  },
  general: {
    ar: [
      "أتمنى يكون يومك هادئ النهارده.",
      "صباح نور! كيف صحتك؟",
      "يومك كله خير إن شاء الله.",
      "إزيك؟ فيه حاجة تحتاجها النهارده؟",
      "أنا هنا دايماً لو محتاج تتكلم.",
    ],
    en: [
      "Hope you're having a calm day.",
      "Good to see you! How are you feeling?",
      "Wishing you a peaceful and healthy day.",
      "Anything on your mind today?",
      "I'm here whenever you need me.",
    ],
  },
  greeting: {
    ar: [
      "صباح الخير! كيف حالك اليوم؟",
      "مساء النور! كيف يومك؟",
      "أهلاً بك! أتمنى أن تكون بخير.",
      "مرحباً! كيف صحتك اليوم؟",
      "ابدأ يومك بخير واهتم بصحتك.",
    ],
    en: [
      "Good morning! How are you feeling today?",
      "Welcome back! How is your day going?",
      "Hello! Hope you're doing well today.",
      "Hi there! Ready for a healthy day?",
      "Great to have you here. How are you?",
    ],
  },
};

function pickFromPool(pool: string[], seed: number): string {
  return pool[seed % pool.length] ?? pool[0] ?? "";
}

const TOPIC_ICONS: Record<Topic, string> = {
  pain: "bandage-outline",
  mood: "heart-outline",
  medication: "medical-outline",
  followup: "checkmark-circle-outline",
  general: "chatbubble-ellipses-outline",
  greeting: "sunny-outline",
};

// ─── Main export ──────────────────────────────────────────────

export async function getCompanionMessage(): Promise<CompanionMessage> {
  // Daily seed (changes message once per day)
  const today = new Date();
  const seed = today.getDate() + today.getMonth() * 31;

  try {
    const raw = await AsyncStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return buildFallback(seed);

    const parsed: Array<{ role: string; content: string }> = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return buildFallback(seed);

    // Get last few user messages only
    const userMessages = parsed
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .slice(-5);

    if (userMessages.length === 0) return buildFallback(seed);

    const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? "";
    const isAr = containsArabic(lastUserMsg);
    const topic = detectTopic(lastUserMsg);
    const pool = POOLS[topic][isAr ? "ar" : "en"];
    const message = pickFromPool(pool, seed);

    return { message, isAr, icon: TOPIC_ICONS[topic], topic };
  } catch {
    return buildFallback(seed);
  }
}

function buildFallback(seed: number): CompanionMessage {
  // Use greeting pool with time-of-day bias
  const hour = new Date().getHours();
  const isAr = true; // Default to Arabic; the HomeScreen overrides based on app language
  const topic: Topic = "greeting";
  const pool = hour < 12 ? POOLS.greeting.ar : POOLS.general.ar;
  return {
    message: pickFromPool(pool, seed),
    isAr,
    icon: TOPIC_ICONS[topic],
    topic,
  };
}

// Language-aware wrapper (overrides isAr from app language setting)
export async function getCompanionMessageForLanguage(
  appLanguage: "ar" | "en",
): Promise<CompanionMessage> {
  const base = await getCompanionMessage();
  const seed = new Date().getDate() + new Date().getMonth() * 31;

  // If app language differs from chat-detected language, use app language
  if ((appLanguage === "ar") !== base.isAr) {
    const pool = POOLS[base.topic][appLanguage];
    return {
      ...base,
      message: pickFromPool(pool, seed),
      isAr: appLanguage === "ar",
    };
  }
  return base;
}
