export interface SanitizationOptions {
  maxLength?: number;
  escapeSpecialChars?: boolean;
  removeInjectionPatterns?: boolean;
  trim?: boolean;
  customPatterns?: (RegExp | string)[];
}

export function sanitizeForAI(input: unknown, options: SanitizationOptions = {}): string {
  if (input === null || input === undefined) {
    return '';
  }

  // Narrow to string — if not a string, convert once and reassign with correct type
  let sanitized: string;
  if (typeof input !== 'string') {
    try {
      sanitized = String(input);
    } catch (_e) {
      return '';
    }
  } else {
    sanitized = input;
  }

  const {
    maxLength = 1000,
    escapeSpecialChars = true,
    removeInjectionPatterns = true,
    trim = true,
    customPatterns = [],
  } = options;

  if (trim) {
    sanitized = sanitized.trim();
  }

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  if (removeInjectionPatterns) {
    const injectionPatterns: RegExp[] = [
      /^(?:\s*)?(?:ignore|ignore\s+previous|ignore\s+all\s+previous|ignore\s+the\s+above|disregard\s+previous|forget\s+previous|forget\s+everything|forget\s+the\s+above|ignore\s+all\s+instructions|ignore\s+these\s+instructions)/i,
      /^(?:\s*)?(?:you\s+are\s+now|you\s+will\s+act\s+as|you\s+will\s+behave\s+as|from\s+now\s+on\s+you\+are|you\s+are\s+to\s+act\s+as|you\s+must\s+pretend\s+to\s+be)/i,
      /^(?:\s*)?(?:system\s*:|assistant\s*:|developer\s*:|admin\s*:|root\s*:|sudo\s*:)/i,
      /(?:\x60\x60\x60|\~\~\~|\|\|\||\+\+\+|\<\<\<|\>\>\>)/g,
      /(?:\b(?:DAN|JAILBREAK|SAM|ANYTHING\s+NOW)\b)/i,
      /(?:\b(?:new\s+instruction|new\s+rule|forget\s+everything|ignore\s+prior|disregard\s+prior)\b)/i,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }

    for (const pattern of customPatterns) {
      if (pattern instanceof RegExp) {
        sanitized = sanitized.replace(pattern, '');
      } else {
        sanitized = sanitized.split(pattern).join('');
      }
    }
  }

  if (escapeSpecialChars) {
    const escapeMap: [string, string][] = [
      ['\\', '\\\\'],
      ['"', '\\"'],
      ["'", "\\'"],
      ['\n', '\\n'],
      ['\r', '\\r'],
      ['\t', '\\t'],
      ['\b', '\\b'],
      ['\f', '\\f'],
      ['\v', '\\v'],
      ['\0', '\\0'],
      ['\x1b', '\\e'],
      ['\x85', '\\x85'],
      ['\u2028', '\\u2028'],
      ['\u2029', '\\u2029'],
    ];

    for (const [char, escape] of escapeMap) {
      sanitized = sanitized.split(char).join(escape);
    }
  }

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

export function sanitizeObjectForAI<T extends Record<string, any>>(
  obj: T,
  options: SanitizationOptions = {}
): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (typeof obj !== 'object') {
    return typeof obj === 'string' ? (sanitizeForAI(obj, options) as unknown as T) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForAI(item, options)) as unknown as T;
  }

  const sanitizedObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitizedObj[key] = sanitizeObjectForAI(value, options);
  }

  return sanitizedObj as T;
}

export function createSafePrompt(
  systemPrompt: string,
  userInput: unknown,
  options: SanitizationOptions = {}
): string {
  const sanitizedInput = sanitizeForAI(userInput, options);
  return `${systemPrompt}\n\nUser Input:\n${sanitizedInput}`;
}

export function isInputSafe(input: unknown): boolean {
  if (input === null || input === undefined) {
    return true;
  }

  let str: string;
  if (typeof input !== 'string') {
    try {
      str = String(input);
    } catch (_e) {
      return true;
    }
  } else {
    str = input;
  }

  const suspiciousPatterns = [
    /ignore\s+previous/i,
    /ignore\s+all\s+instructions/i,
    /you\s+are\s+now/i,
    /system\s*:/i,
    /DAN\s+/i,
    /JAILBREAK/i,
    /forget\s+everything/i,
    /disregard\s+prior/i,
    /new\s+instruction/i,
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(str));
}
