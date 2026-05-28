/**
 * Prompt Injection 防护与文本消毒工具
 */

/**
 * 常见的 prompt 注入模式（不区分大小写）
 */
const INJECTION_PATTERNS: RegExp[] = [
  // 直接指令覆盖
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?|directives?)/i,
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?)/i,
  /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?)/i,
  /override\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?)/i,
  /stop\s+(being|following)\s+(your|the)\s+(instructions?|rules?|guidelines?)/i,
  // 角色劫持
  /you\s+are\s+now\s+(a|an|the)/i,
  /from\s+now\s+on\s+you\s+are/i,
  /new\s+instructions?\s*:/i,
  /system\s*(prompt|message|override)\s*:/i,
  /\[system\]\s*:/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /act\s+as\s+(a|an|the)\s+/i,
  /pretend\s+(you|to)\s+(are|be)\s+/i,
  /role\s*:\s*(system|admin|developer)/i,
  // 指令注入标记
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\/s>/i,
  /\[\/INST\]/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  // 提示泄露
  /repeat\s+(the\s+)?(system\s+)?(prompt|instructions?|rules?)/i,
  /show\s+(me\s+)?(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /print\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /reveal\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /output\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /tell\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /display\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  // 代码执行诱导
  /execute\s+(the\s+following|this)\s+(code|command|script)/i,
  /run\s+(the\s+following|this)\s+(code|command|script)/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /import\s+os/i,
  /subprocess\./i,
  /__import__\s*\(/i,
  // 中文注入模式
  /忽略(之前|上面|以上|先前)(的|所有)?(指令|提示|规则|指导|指南)/i,
  /从现在(开始|起)你是/i,
  /你(现在|现在开始)是一个/i,
  /(系统|system)\s*(提示|prompt|指令)\s*[:：]/i,
  /(重复|显示|输出|打印|告诉我)(你的|系统|上面的)(提示|指令|prompt)/i,
  /不要(遵守|遵循|听从|理会)(之前|上面|原来)(的|你的)?(指令|规则|提示)/i,
  /你的(新|真正|真正)身份是/i,
  /进入(开发者|调试|管理)模式/i,
];

/**
 * Unicode 同形字映射表
 * 将常见西里尔字母等替换为拉丁字母后检测
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  'а': 'a', // Cyrillic а
  'е': 'e', // Cyrillic е
  'о': 'o', // Cyrillic о
  'р': 'p', // Cyrillic р
  'с': 'c', // Cyrillic с
  'у': 'y', // Cyrillic у
  'х': 'x', // Cyrillic х
  'А': 'A', // Cyrillic А
  'Е': 'E', // Cyrillic Е
  'О': 'O', // Cyrillic О
  'Р': 'P', // Cyrillic Р
  'С': 'C', // Cyrillic С
  'У': 'Y', // Cyrillic У
  'Х': 'X', // Cyrillic Х
};

/**
 * 将文本中的 Unicode 同形字替换为拉丁字母
 */
function normalizeHomoglyphs(text: string): string {
  let result = '';
  for (const ch of text) {
    result += HOMOGLYPH_MAP[ch] || ch;
  }
  return result;
}

/**
 * 检测文本是否包含注入模式
 */
function containsInjection(text: string): boolean {
  if (!text) return false;

  // 1. 直接检测
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // 2. 同形字归一化后检测
  const normalized = normalizeHomoglyphs(text);
  if (normalized !== text) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(normalized)) return true;
    }
  }

  return false;
}

/**
 * 对注入到 system prompt 中的外部文本进行消毒
 */
export function sanitizeForPrompt(text: string, maxLength: number = 200): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  // 检测并转义注入模式
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, (match) => match.split('').join('​'));
    }
  }

  // 同形字归一化后再次检测
  const normalized = normalizeHomoglyphs(sanitized);
  if (normalized !== sanitized) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(normalized)) {
        // 在原始文本中找到对应位置并转义
        sanitized = sanitized.replace(pattern, (match) => match.split('').join('​'));
      }
    }
  }

  // 转义特殊标记
  sanitized = sanitized
    .replace(/<\|im_start\|>/g, '[已过滤]')
    .replace(/<\|im_end\|>/g, '[已过滤]')
    .replace(/\[INST\]/g, '[已过滤]')
    .replace(/\[\/INST\]/g, '[已过滤]')
    .replace(/<<SYS>>/g, '[已过滤]')
    .replace(/<\/SYS>>/g, '[已过滤]')
    .replace(/<\/s>/g, '[已过滤]');

  return sanitized;
}

/**
 * 对工具返回结果中的文本字段进行消毒
 */
export function sanitizeToolOutput(text: string, maxLength: number = 500): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  if (containsInjection(sanitized)) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '[内容已过滤]');
      }
    }
    // 同形字检测
    const normalized = normalizeHomoglyphs(sanitized);
    if (normalized !== sanitized) {
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(normalized)) {
          sanitized = sanitized.replace(pattern, '[内容已过滤]');
        }
      }
    }
  }

  return sanitized;
}

/**
 * 对工具返回结果对象中的文本字段批量消毒
 */
export function sanitizeToolData<T extends Record<string, unknown>>(
  data: T,
  textFields: string[]
): T {
  const sanitized = { ...data };
  for (const field of textFields) {
    if (typeof sanitized[field] === 'string') {
      (sanitized as Record<string, unknown>)[field] = sanitizeToolOutput(sanitized[field] as string);
    }
  }
  return sanitized;
}
