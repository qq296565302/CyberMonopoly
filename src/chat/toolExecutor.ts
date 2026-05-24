import * as vscode from 'vscode';
import { getFinanceData, getFullKlineData, searchStocks, getHotStocks, getStockNews, getResearchReports, FinanceIndicator } from '../api/eastmoney';
import { getIntradayData, getRealtimeQuote, getBatchQuotes, get7x24News, RealtimeQuote } from '../api/sina';
import { getIndexQuotes, getMarketDistribution, getIndustrySectors } from '../api/market';
import { DataPoint } from '../models/chart';

// ============================================================
// Prompt Injection 防护层 (SECURITY)
// ============================================================

/**
 * 常见的 prompt 注入模式（不区分大小写）
 * 用于检测外部数据中嵌入的恶意指令
 */
const INJECTION_PATTERNS: RegExp[] = [
  // 直接指令覆盖
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?|directives?)/i,
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?)/i,
  /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?)/i,
  /override\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?)/i,

  // 角色劫持
  /you\s+are\s+now\s+(a|an|the)/i,
  /from\s+now\s+on\s+you\s+are/i,
  /new\s+instructions?\s*:/i,
  /system\s*(prompt|message|override)\s*:/i,
  /\[system\]\s*:/i,
  /\[INST\]/i,
  /<<SYS>>/i,

  // 指令注入标记
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\/s>/i,
  /\[\/INST\]/i,
  /\[INST\]\s*\[\/INST\]/i,

  // 提示泄露
  /repeat\s+(the\s+)?(system\s+)?(prompt|instructions?|rules?)/i,
  /show\s+(me\s+)?(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /print\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /reveal\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /output\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,

  // 代码执行诱导
  /execute\s+(the\s+following|this)\s+(code|command|script)/i,
  /run\s+(the\s+following|this)\s+(code|command|script)/i,
  /eval\s*\(/i,

  // 中文注入模式
  /忽略(之前|上面|以上|先前)(的|所有)?(指令|提示|规则|指导|指南)/i,
  /从现在(开始|起)你是/i,
  /你(现在|现在开始)是一个/i,
  /(系统|system)\s*(提示|prompt|指令)\s*[:：]/i,
  /(重复|显示|输出|打印|告诉我)(你的|系统|上面的)(提示|指令|prompt)/i,
];

/**
 * 对注入到 system prompt 中的外部文本进行消毒
 *
 * 处理策略：
 * 1. 长度截断：防止通过超长文本淹没 system prompt
 * 2. 模式检测：识别已知的 prompt 注入模式并进行转义
 * 3. 特殊标记转义：将可能被解释为指令的标记替换为安全文本
 *
 * @param text 需要消毒的外部文本
 * @param maxLength 最大允许长度，默认 200 字符
 * @returns 消毒后的安全文本
 */
export function sanitizeForPrompt(text: string, maxLength: number = 200): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // 1. 截断过长的文本
  let sanitized = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  // 2. 检测并转义注入模式
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      // 将匹配到的注入标记用 Unicode 零宽空格打断，使其无法被 LLM 解析为指令
      // 同时保留原始文本的可读性
      sanitized = sanitized.replace(pattern, (match) => {
        // 在每个字符间插入零宽空格（U+200B），破坏指令的可解析性
        return match.split('').join('​');
      });
    }
  }

  // 3. 转义可能被误解为角色标记的特殊序列
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
 *
 * 处理策略：
 * 1. 长度截断：限制单个文本字段的最大长度
 * 2. 移除注入模式：将检测到的注入指令替换为 [已过滤] 标记
 * 3. 保留原始数据的可读性
 *
 * @param text 工具返回的文本字段
 * @param maxLength 最大允许长度，默认 500 字符
 * @returns 消毒后的安全文本
 */
export function sanitizeToolOutput(text: string, maxLength: number = 500): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // 截断
  let sanitized = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  // 检测并替换注入模式
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, '[内容已过滤]');
    }
  }

  return sanitized;
}

/**
 * 对工具返回结果对象中的文本字段批量消毒
 *
 * @param data 工具返回的数据对象
 * @param textFields 需要消毒的字段名列表
 * @returns 消毒后的数据副本
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

/**
 * 财务数据摘要返回结构
 */
export interface FinanceSummaryResult {
  code: string;
  indicators: FinanceIndicator[];
  error?: string;
}

/**
 * toolGetFinanceSummary - 获取股票财务数据摘要
 *
 * 调用东方财富 getFinanceData 接口，获取最近5期的核心财务指标，
 * 返回格式化 JSON 供 LLM tool 调用使用。
 *
 * @param code 股票代码，如 "600519"
 * @returns FinanceSummaryResult 格式化的财务摘要
 */
export async function toolGetFinanceSummary(code: string): Promise<FinanceSummaryResult> {
  // 参数校验：代码为空
  if (!code || typeof code !== 'string') {
    return {
      code: String(code || ''),
      indicators: [],
      error: '股票代码不能为空',
    };
  }

  // 参数校验：代码格式（6位数字）
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return {
      code: trimmed,
      indicators: [],
      error: `无效的股票代码: "${trimmed}"，应为6位数字`,
    };
  }

  try {
    const indicators = await getFinanceData(trimmed);

    // 数据缺失：接口返回空数组
    if (!indicators || indicators.length === 0) {
      return {
        code: trimmed,
        indicators: [],
        error: `未找到股票 ${trimmed} 的财务数据，可能该股票不存在或数据暂不可用`,
      };
    }

    return {
      code: trimmed,
      indicators,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      code: trimmed,
      indicators: [],
      error: `获取财务数据失败: ${message}`,
    };
  }
}

// ============================================================
// 行情查询工具 (DEV-LLM-05)
// ============================================================

/**
 * Tool 执行结果（通用）
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string | { code: string; message: string };
  info?: string;
}

/**
 * OpenAI 兼容的工具定义结构
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * LLM 返回的单个工具调用请求
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

/**
 * 工具执行结果（用于回传给 LLM）
 */
export interface ToolCallResult {
  tool_call_id: string;
  output: string; // JSON 字符串
}

/**
 * get_stock_quote 返回的完整行情结构
 */
export interface StockQuoteResult {
  name: string;
  code: string;
  price: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  changePercent: number;
  changeAmount: number;
  bid: number;
  ask: number;
  date: string;
  time: string;
}

/**
 * get_batch_quotes 返回的精简行情结构
 */
export interface BatchQuoteItem {
  name: string;
  code: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
}

/**
 * 验证股票代码是否合法（6位数字）
 */
function isValidStockCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * 价格保留两位小数
 */
function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 将 RealtimeQuote 映射为完整返回结构
 */
function toStockQuoteResult(quote: RealtimeQuote): StockQuoteResult {
  return {
    name: quote.name,
    code: quote.code,
    price: roundPrice(quote.price),
    open: roundPrice(quote.open),
    prevClose: roundPrice(quote.prevClose),
    high: roundPrice(quote.high),
    low: roundPrice(quote.low),
    volume: quote.volume,
    changePercent: roundPrice(quote.changePercent),
    changeAmount: roundPrice(quote.changeAmount),
    bid: roundPrice(quote.bid),
    ask: roundPrice(quote.ask),
    date: quote.date,
    time: quote.time,
  };
}

/**
 * 将 RealtimeQuote 映射为精简返回结构
 */
function toBatchQuoteItem(quote: RealtimeQuote): BatchQuoteItem {
  return {
    name: quote.name,
    code: quote.code,
    price: roundPrice(quote.price),
    changePercent: roundPrice(quote.changePercent),
    changeAmount: roundPrice(quote.changeAmount),
    volume: quote.volume,
  };
}

/**
 * toolGetStockQuote - 查询单只股票实时行情
 *
 * 调用新浪 getRealtimeQuote 接口，返回完整行情数据。
 * 错误处理：参数校验（空值/格式）、API 解析失败、网络超时
 *
 * @param code 股票代码，如 "600519"
 * @returns ToolResult 包含 StockQuoteResult 或错误信息
 */
export async function toolGetStockQuote(code: string): Promise<ToolResult> {
  // 参数校验：空值
  if (!code || typeof code !== 'string') {
    return { success: false, error: '缺少股票代码参数，请提供6位数字股票代码（如 600519）' };
  }

  const trimmed = code.trim();

  // 参数校验：格式
  if (!isValidStockCode(trimmed)) {
    return { success: false, error: `无效的股票代码: "${trimmed}"，请输入6位数字代码（如 600519、000001）` };
  }

  try {
    const quote = await getRealtimeQuote(trimmed);

    // 数据有效性检查：名称为空通常意味着代码不存在或已停牌
    if (!quote.name || quote.name === '') {
      return { success: false, error: `未找到股票代码 "${trimmed}" 对应的股票，请确认代码是否正确` };
    }

    return { success: true, data: toStockQuoteResult(quote) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    // 网络超时
    if (msg.includes('超时')) {
      return { success: false, error: `查询 ${trimmed} 超时，请稍后重试` };
    }
    // 新浪接口解析失败（代码不存在或数据异常）
    if (msg.includes('解析失败')) {
      return { success: false, error: `股票代码 "${trimmed}" 数据解析失败，可能该代码不存在或已停牌` };
    }
    // 其他网络/系统错误
    return { success: false, error: `查询 ${trimmed} 行情失败: ${msg}` };
  }
}

/**
 * toolGetBatchQuotes - 批量查询多只股票实时行情
 *
 * 调用新浪 getBatchQuotes 接口，返回精简行情数据。
 * 错误处理：参数校验、无效代码过滤、网络异常
 *
 * @param codes 股票代码数组，如 ["600519", "000001"]
 * @returns ToolResult 包含 BatchQuoteItem[] 或错误信息
 */
export async function toolGetBatchQuotes(codes: string[]): Promise<ToolResult> {
  // 参数校验：非数组
  if (!codes || !Array.isArray(codes)) {
    return { success: false, error: '缺少股票代码列表，请提供股票代码数组（如 ["600519", "000001"]）' };
  }

  // 参数校验：空数组
  if (codes.length === 0) {
    return { success: false, error: '股票代码列表不能为空' };
  }

  // 分离有效代码和无效代码
  const validCodes: string[] = [];
  const invalidCodes: string[] = [];
  for (const c of codes) {
    const trimmed = String(c).trim();
    if (isValidStockCode(trimmed)) {
      validCodes.push(trimmed);
    } else {
      invalidCodes.push(trimmed);
    }
  }

  // 所有代码均无效
  if (validCodes.length === 0) {
    return {
      success: false,
      error: `所有股票代码均无效: [${invalidCodes.join(', ')}]，请使用6位数字代码`,
    };
  }

  try {
    const quotes = await getBatchQuotes(validCodes);

    // 过滤掉名称为空的无效数据
    const result: BatchQuoteItem[] = quotes
      .filter(q => q.name && q.name !== '')
      .map(toBatchQuoteItem);

    // 构建附加提示信息
    const hints: string[] = [];
    if (result.length === 0) {
      hints.push('未查询到任何有效数据');
    }
    if (invalidCodes.length > 0) {
      hints.push(`已忽略无效代码: [${invalidCodes.join(', ')}]`);
    }
    if (quotes.length > result.length) {
      hints.push(`${quotes.length - result.length} 只股票数据无效（可能已退市或停牌）`);
    }

    return {
      success: true,
      data: result,
      ...(hints.length > 0 ? { info: hints.join('；') } : {}),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    // 网络超时
    if (msg.includes('超时')) {
      return { success: false, error: '批量查询超时，请减少查询数量或稍后重试' };
    }
    // 其他错误
    return { success: false, error: `批量查询行情失败: ${msg}` };
  }
}

/**
 * Tool 定义（供 LLM function calling 使用）
 */
export const STOCK_QUOTE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_stock_quote',
      description: '查询单只股票的实时行情，返回完整数据包含当前价、开盘价、昨收、最高、最低、成交量、涨跌幅、买卖盘等',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string' as const,
            description: '6位股票代码，如 600519（贵州茅台）、000001（平安银行）',
          },
        },
        required: ['code' as const],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_batch_quotes',
      description: '批量查询多只股票的实时行情，返回精简数据包含名称、代码、当前价、涨跌幅、涨跌额、成交量',
      parameters: {
        type: 'object' as const,
        properties: {
          codes: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: '股票代码数组，如 ["600519", "000001", "300750"]',
          },
        },
        required: ['codes' as const],
      },
    },
  },
];

/**
 * 根据 tool name 分发执行行情查询工具
 * @param toolName 工具名称
 * @param args 工具参数（JSON 对象）
 * @returns ToolResult
 */
export async function executeQuoteTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (toolName) {
    case 'get_stock_quote': {
      const code = String(args.code || '');
      return toolGetStockQuote(code);
    }
    case 'get_batch_quotes': {
      const codes = Array.isArray(args.codes) ? args.codes.map(String) : [];
      return toolGetBatchQuotes(codes);
    }
    default:
      return { success: false, error: `未知的行情工具: ${toolName}` };
  }
}

// ============================================================
// 歧义代码检测 (BUGFIX-000001)
// ============================================================

/**
 * 歧义代码映射表
 *
 * 某些6位代码同时对应指数和个股，例如：
 * - 000001：上证指数（1.000001）vs 平安银行（0.000001）
 *
 * 当用户输入这些代码时，工具默认查询个股数据，
 * 并在 info 字段中提示用户该代码存在歧义。
 */
const AMBIGUOUS_CODES: Record<string, { indexName: string; stockName: string; hint: string }> = {
  '000001': {
    indexName: '上证指数',
    stockName: '平安银行',
    hint: '代码 000001 同时对应上证指数和平安银行，当前已返回平安银行的数据。如需查看上证指数，请使用「大盘」指令或直接查看大盘指数面板。',
  },
};

/**
 * 获取歧义代码的提示信息
 * @param code 股票代码
 * @returns 提示字符串，若非歧义代码则返回 undefined
 */
function getAmbiguousHint(code: string): string | undefined {
  return AMBIGUOUS_CODES[code]?.hint;
}

// ============================================================
// K线数据工具 (DEV-LLM-06)
// ============================================================

/**
 * 计算成交量趋势
 *
 * 将数据按时间顺序等分为前半段和后半段，
 * 比较两段的平均成交量：
 * - 后半段均量比前半段增长超过 20% -> increasing
 * - 后半段均量比前半段减少超过 20% -> decreasing
 * - 否则 -> stable
 * - 数据不足 4 条时返回 stable
 */
function calcVolumeTrend(points: DataPoint[]): 'increasing' | 'decreasing' | 'stable' {
  const volumes = points.filter(p => p.volume != null && p.volume > 0).map(p => p.volume!);
  if (volumes.length < 4) {
    return 'stable';
  }

  const mid = Math.floor(volumes.length / 2);
  const firstHalf = volumes.slice(0, mid);
  const secondHalf = volumes.slice(mid);

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  if (avgFirst === 0) {
    return 'stable';
  }

  const changeRate = (avgSecond - avgFirst) / avgFirst;

  if (changeRate > 0.2) {
    return 'increasing';
  }
  if (changeRate < -0.2) {
    return 'decreasing';
  }
  return 'stable';
}

export interface KlineSummaryResult {
  name: string;
  code: string;
  days: number;
  dataPoints: number;
  summary: {
    highest: number;
    lowest: number;
    latestClose: number;
    periodChangePercent: number;
    avgVolume: number;
    volumeTrend: 'increasing' | 'decreasing' | 'stable';
  };
  klines: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
}

/**
 * toolGetKlineSummary - 获取K线摘要统计
 *
 * 调用东方财富 getFullKlineData 获取全量日K数据，
 * 截取最近 N 个交易日，计算区间统计摘要。
 *
 * 摘要统计计算逻辑：
 * 1. highest / lowest：遍历区间内所有 K 线，取 high 的最大值和 low 的最小值
 * 2. latestClose：最后一根 K 线的收盘价（close 字段，回退到 value）
 * 3. periodChangePercent：(最新收盘价 - 区间首日收盘价) / 区间首日收盘价 * 100
 * 4. avgVolume：区间内所有 K 线成交量（volume > 0）的算术平均值
 * 5. volumeTrend：将区间按时间前后等分，比较前/后半段均量变化率，
 *    超过 +20% 判定 increasing，低于 -20% 判定 decreasing，否则 stable
 *
 * @param code 股票代码，如 "600519"
 * @param days 截取最近 N 个交易日，默认 30
 * @returns KlineSummaryResult
 */
export async function toolGetKlineSummary(code: string, days: number = 30): Promise<ToolResult> {
  // 参数校验
  if (!code || typeof code !== 'string') {
    return { success: false, error: '缺少股票代码参数' };
  }

  const trimmed = code.trim();
  if (!isValidStockCode(trimmed)) {
    return { success: false, error: `无效的股票代码: "${trimmed}"，请输入6位数字代码` };
  }

  try {
    // 歧义代码处理：若代码同时对应指数和个股，优先返回个股数据
    const ambiguousHint = getAmbiguousHint(trimmed);
    const isAmbiguous = !!ambiguousHint;

    const series = await getFullKlineData(trimmed, isAmbiguous);

    // 截取最近 N 天的数据
    const allPoints = series.data;
    const recentPoints = allPoints.slice(-days);

    if (recentPoints.length === 0) {
      return {
        success: true,
        data: {
          name: series.name,
          code: trimmed,
          days,
          dataPoints: 0,
          summary: {
            highest: 0,
            lowest: 0,
            latestClose: 0,
            periodChangePercent: 0,
            avgVolume: 0,
            volumeTrend: 'stable',
          },
          klines: [],
        },
        ...(ambiguousHint ? { info: ambiguousHint } : {}),
      };
    }

    // 计算区间最高价、最低价
    let highest = -Infinity;
    let lowest = Infinity;
    let totalVolume = 0;
    let volumeCount = 0;

    for (const p of recentPoints) {
      if (p.high != null && p.high > highest) {
        highest = p.high;
      }
      if (p.low != null && p.low < lowest) {
        lowest = p.low;
      }
      if (p.volume != null && p.volume > 0) {
        totalVolume += p.volume;
        volumeCount++;
      }
    }

    const latestClose = recentPoints[recentPoints.length - 1].close ?? recentPoints[recentPoints.length - 1].value;
    const firstClose = recentPoints[0].close ?? recentPoints[0].value;

    // 涨跌幅 = (最新收盘 - 区间首日收盘) / 区间首日收盘 * 100
    const periodChangePercent = firstClose > 0
      ? ((latestClose - firstClose) / firstClose) * 100
      : 0;

    const avgVolume = volumeCount > 0 ? totalVolume / volumeCount : 0;
    const volumeTrend = calcVolumeTrend(recentPoints);

    // 构造精简的 K 线数据
    const klines = recentPoints.map(p => ({
      date: p.date instanceof Date
        ? `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}-${String(p.date.getDate()).padStart(2, '0')}`
        : String(p.date),
      open: roundPrice(p.open ?? 0),
      high: roundPrice(p.high ?? 0),
      low: roundPrice(p.low ?? 0),
      close: roundPrice(p.close ?? p.value),
      volume: p.volume ?? 0,
    }));

    const result: KlineSummaryResult = {
      name: series.name,
      code: trimmed,
      days: recentPoints.length,
      dataPoints: recentPoints.length,
      summary: {
        highest: roundPrice(highest),
        lowest: roundPrice(lowest),
        latestClose: roundPrice(latestClose),
        periodChangePercent: roundPrice(periodChangePercent),
        avgVolume: Math.round(avgVolume),
        volumeTrend,
      },
      klines,
    };

    return { success: true, data: result, ...(ambiguousHint ? { info: ambiguousHint } : {}) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('超时')) {
      return { success: false, error: `查询 ${trimmed} K线数据超时，请稍后重试` };
    }
    return { success: false, error: `获取 ${trimmed} K线数据失败: ${msg}` };
  }
}

export interface IntradayDataResult {
  name: string;
  code: string;
  tradingDate: string;
  prevClose: number;
  latestPrice: number;
  changePercent: number;
  dataPoints: number;
  high: number;
  low: number;
}

/**
 * toolGetIntradayData - 获取日内分时数据统计
 *
 * 调用新浪 getIntradayData 接口获取当日分时数据，
 * 返回统计摘要（最高价、最低价、最新价、涨跌幅等）。
 *
 * @param code 股票代码，如 "600519"
 * @returns ToolResult 包含 IntradayDataResult
 */
export async function toolGetIntradayData(code: string): Promise<ToolResult> {
  // 参数校验
  if (!code || typeof code !== 'string') {
    return { success: false, error: '缺少股票代码参数' };
  }

  const trimmed = code.trim();
  if (!isValidStockCode(trimmed)) {
    return { success: false, error: `无效的股票代码: "${trimmed}"，请输入6位数字代码` };
  }

  try {
    const series = await getIntradayData(trimmed);
    const points = series.data;

    if (points.length === 0) {
      const nameMatch = series.name.match(/^(.+?)\s*\(/);
      const name = nameMatch ? nameMatch[1] : series.name;

      return {
        success: true,
        data: {
          name,
          code: trimmed,
          tradingDate: '',
          prevClose: roundPrice(series.prevClose ?? 0),
          latestPrice: 0,
          changePercent: 0,
          dataPoints: 0,
          high: 0,
          low: 0,
        },
      };
    }

    // 计算日内最高、最低
    let high = -Infinity;
    let low = Infinity;

    for (const p of points) {
      const price = p.value;
      if (price > high) {
        high = price;
      }
      if (price < low) {
        low = price;
      }
    }

    const latestPrice = points[points.length - 1].value;
    const prevClose = series.prevClose ?? 0;

    // 涨跌幅 = (最新价 - 昨收) / 昨收 * 100
    const changePercent = prevClose > 0
      ? ((latestPrice - prevClose) / prevClose) * 100
      : 0;

    // 提取交易日期
    const firstDate = points[0].date;
    let tradingDate = '';
    if (firstDate instanceof Date) {
      tradingDate = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}-${String(firstDate.getDate()).padStart(2, '0')}`;
    }

    // 提取名称
    const nameMatch = series.name.match(/^(.+?)\s*\(/);
    const name = nameMatch ? nameMatch[1] : series.name;

    const result: IntradayDataResult = {
      name,
      code: trimmed,
      tradingDate,
      prevClose: roundPrice(prevClose),
      latestPrice: roundPrice(latestPrice),
      changePercent: roundPrice(changePercent),
      dataPoints: points.length,
      high: roundPrice(high),
      low: roundPrice(low),
    };

    return { success: true, data: result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('超时')) {
      return { success: false, error: `查询 ${trimmed} 分时数据超时，请稍后重试` };
    }
    return { success: false, error: `获取 ${trimmed} 分时数据失败: ${msg}` };
  }
}

/**
 * K线数据相关 Tool 定义（供 LLM function calling 使用）
 */
export const KLINE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_kline_summary',
      description: '获取股票K线区间摘要统计，包含区间最高价、最低价、最新收盘价、涨跌幅、平均成交量、成交量趋势，以及逐日K线数据',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string' as const,
            description: '6位股票代码，如 600519（贵州茅台）',
          },
          days: {
            type: 'number' as const,
            description: '截取最近N个交易日，默认30，最大不超过数据源限制',
          },
        },
        required: ['code' as const],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_intraday_data',
      description: '获取股票当日分时数据统计摘要，包含最新价、昨收、涨跌幅、日内最高最低价、分时数据点数',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string' as const,
            description: '6位股票代码，如 600519（贵州茅台）',
          },
        },
        required: ['code' as const],
      },
    },
  },
];

/**
 * 根据 tool name 分发执行 K 线数据工具
 * @param toolName 工具名称
 * @param args 工具参数（JSON 对象）
 * @returns ToolResult
 */
export async function executeKlineTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (toolName) {
    case 'get_kline_summary': {
      const code = String(args.code || '');
      const days = typeof args.days === 'number' ? args.days : 30;
      return toolGetKlineSummary(code, days);
    }
    case 'get_intraday_data': {
      const code = String(args.code || '');
      return toolGetIntradayData(code);
    }
    default:
      return { success: false, error: `未知的K线工具: ${toolName}` };
  }
}

// ============================================================
// 框架函数：工具定义 + 统一执行路由 (DEV-LLM-04)
// ============================================================

/**
 * 返回所有 14 个工具的定义列表（OpenAI Function Calling 格式）
 */
export function getToolDefinitions(): ToolDefinition[] {
  return [
    ...STOCK_QUOTE_TOOLS,
    ...KLINE_TOOLS,
    {
      type: 'function',
      function: {
        name: 'get_finance_summary',
        description: '获取股票财务指标摘要（EPS、ROE、营收增长率、净利润增长率、毛利率、净利率、资产负债率等），返回最近5期数据',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '股票代码，如 600519' },
          },
          required: ['code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'open_chart',
        description: '在编辑器中打开股票的 K 线图或分时图',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '股票代码' },
            chart_type: {
              type: 'string',
              enum: ['kline', 'intraday'],
              description: '图表类型：kline=K线图，intraday=分时图，默认 kline',
            },
          },
          required: ['code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_stock',
        description: '根据关键词搜索股票（支持代码和名称模糊搜索）',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词，如 "茅台" 或 "600519"' },
          },
          required: ['keyword'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_market_overview',
        description: '获取 A 股和港股主要指数的实时行情（上证指数、深证成指、创业板指、沪深300、恒生指数等）',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_market_distribution',
        description: '获取 A 股市场涨跌分布统计（上涨/下跌/平盘家数、涨停/跌停家数、成交额及较昨日差额）',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_hot_stocks',
        description: '获取热门股票排行榜（涨幅榜、跌幅榜、换手率榜）',
        parameters: {
          type: 'object',
          properties: {
            rank_type: {
              type: 'string',
              enum: ['topGainers', 'topLosers', 'topTurnover'],
              description: '排行类型：topGainers=涨幅榜，topLosers=跌幅榜，topTurnover=换手率榜，默认 topGainers',
            },
            count: { type: 'number', description: '返回数量，默认 10' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_sector_list',
        description: '获取行业板块行情列表（按涨跌幅排序，返回前20个板块）',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_stock_news',
        description: '获取某只股票的最新相关新闻资讯',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '股票代码' },
          },
          required: ['code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_7x24_news',
        description: '获取 7x24 小时实时财经快讯',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_research_reports',
        description: '获取某只股票的最新券商研究报告和评级',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '股票代码' },
          },
          required: ['code'],
        },
      },
    },
  ];
}

/**
 * 执行单个工具调用
 *
 * @param name         工具名称
 * @param args         工具参数（已解析为对象）
 * @param cmdExecutor  可选的 VS Code 命令执行器（方便测试注入）
 * @returns            工具执行结果的 JSON 字符串
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cmdExecutor?: (command: string, ...cmdArgs: unknown[]) => Thenable<unknown>
): Promise<string> {
  try {
    let result: ToolResult;
    switch (name) {
      // --- 行情工具 ---
      case 'get_stock_quote':
        result = await toolGetStockQuote(String(args.code || ''));
        break;
      case 'get_batch_quotes':
        result = await toolGetBatchQuotes(Array.isArray(args.codes) ? args.codes.map(String) : []);
        break;
      // --- K线/分时工具 ---
      case 'get_kline_summary':
        result = await toolGetKlineSummary(String(args.code || ''), Number(args.days) || 30);
        break;
      case 'get_intraday_data':
        result = await toolGetIntradayData(String(args.code || ''));
        break;
      // --- 财务工具 ---
      case 'get_finance_summary':
        result = await executeFinanceSummary(String(args.code || ''));
        break;
      // --- 图表工具 ---
      case 'open_chart':
        result = await executeOpenChart(String(args.code || ''), String(args.chart_type || 'kline'), cmdExecutor);
        break;
      // --- 搜索工具 ---
      case 'search_stock':
        result = await executeSearchStock(String(args.keyword || ''));
        break;
      // --- 大盘工具 ---
      case 'get_market_overview':
        result = await executeMarketOverview();
        break;
      case 'get_market_distribution':
        result = await executeMarketDistribution();
        break;
      // --- 排行/板块工具 ---
      case 'get_hot_stocks':
        result = await executeHotStocks(String(args.rank_type || 'topGainers'), Number(args.count) || 10);
        break;
      case 'get_sector_list':
        result = await executeSectorList();
        break;
      // --- 资讯工具 ---
      case 'get_stock_news':
        result = await executeStockNews(String(args.code || ''));
        break;
      case 'get_7x24_news':
        result = await execute7x24News();
        break;
      case 'get_research_reports':
        result = await executeResearchReports(String(args.code || ''));
        break;
      default:
        result = { success: false, error: `未知工具: ${name}` };
    }
    return JSON.stringify(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, error: `工具 ${name} 执行异常: ${message}` });
  }
}

/**
 * 批量执行工具调用
 *
 * @param toolCalls    工具调用列表（来自 LLM 的 tool_calls 响应）
 * @param cmdExecutor  可选的 VS Code 命令执行器
 * @returns            工具执行结果数组
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  cmdExecutor?: (command: string, ...cmdArgs: unknown[]) => Thenable<unknown>
): Promise<ToolCallResult[]> {
  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        // arguments 解析失败时使用空对象
      }
      const output = await executeTool(tc.function.name, parsedArgs, cmdExecutor);
      return {
        tool_call_id: tc.id,
        output,
      };
    })
  );
  return results;
}

// ============================================================
// 剩余工具实现（9 个）
// ============================================================

/**
 * 为百分比字段追加 % 后缀
 * 如果值为 '--'、空字符串或纯空白，则保持原样不追加
 *
 * @param value 原始字符串值
 * @returns 格式化后的字符串
 */
function formatPercent(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '--') {
    return value;
  }
  return trimmed + '%';
}

/**
 * get_finance_summary — 获取财务指标摘要
 * 复用已有 toolGetFinanceSummary，转换为统一 ToolResult 格式
 */
async function executeFinanceSummary(code: string): Promise<ToolResult> {
  if (!code || !isValidStockCode(code)) {
    return { success: false, error: `无效的股票代码: "${code}"，请输入6位数字代码` };
  }
  const trimmed = code.trim();
  const summary = await toolGetFinanceSummary(trimmed);
  if (summary.error) {
    return { success: false, error: summary.error };
  }
  return {
    success: true,
    data: summary.indicators.map(item => ({
      reportDate: item.reportDate,
      eps: item.eps,
      bvps: item.bvps,
      roe: formatPercent(item.roe),
      revenue: item.revenue,
      netProfit: item.netProfit,
      revenueYoy: formatPercent(item.revenueYoy),
      netProfitYoy: formatPercent(item.netProfitYoy),
      grossMargin: formatPercent(item.grossMargin),
      netMargin: formatPercent(item.netMargin),
      debtRatio: formatPercent(item.debtRatio),
    })),
  };
}

/**
 * open_chart — 打开图表
 */
async function executeOpenChart(
  code: string,
  chartType: string,
  cmdExecutor?: (command: string, ...cmdArgs: unknown[]) => Thenable<unknown>
): Promise<ToolResult> {
  if (!code || !isValidStockCode(code)) {
    return { success: false, error: `无效的股票代码: "${code}"` };
  }
  const trimmed = code.trim();
  try {
    const executor = cmdExecutor || ((cmd: string, ...a: unknown[]) => vscode.commands.executeCommand(cmd, ...a));
    await executor('cyberMonopoly.openChart', trimmed);
    return {
      success: true,
      data: {
        code: trimmed,
        chartType: chartType === 'intraday' ? 'intraday' : 'kline',
        message: `已打开 ${trimmed} 的${chartType === 'intraday' ? '分时图' : 'K线图'}`,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `打开图表失败: ${msg}` };
  }
}

/**
 * search_stock — 搜索股票
 */
async function executeSearchStock(keyword: string): Promise<ToolResult> {
  if (!keyword || keyword.trim().length === 0) {
    return { success: false, error: '搜索关键词不能为空' };
  }
  try {
    const results = await searchStocks(keyword.trim());
    if (results.length === 0) {
      return { success: true, data: { keyword, message: '未找到匹配的股票' } };
    }
    return {
      success: true,
      data: results.slice(0, 10).map(r => ({
        code: r.code,
        name: r.name,
        market: r.market,
        type: r.type,
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `搜索失败: ${msg}` };
  }
}

/**
 * get_market_overview — 大盘指数
 */
async function executeMarketOverview(): Promise<ToolResult> {
  try {
    const quotes = await getIndexQuotes();
    return {
      success: true,
      data: quotes.map(q => ({
        name: q.name,
        code: q.code,
        price: roundPrice(q.price),
        changePercent: roundPrice(q.changePercent) + '%',
        changeAmount: roundPrice(q.changeAmount),
        market: q.market,
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取大盘指数失败: ${msg}` };
  }
}

/**
 * get_market_distribution — 涨跌分布
 */
async function executeMarketDistribution(): Promise<ToolResult> {
  try {
    const data = await getMarketDistribution();
    return {
      success: true,
      data: {
        upCount: data.upCount,
        downCount: data.downCount,
        flatCount: data.flatCount,
        limitUpCount: data.limitUpCount,
        limitDownCount: data.limitDownCount,
        turnover: roundPrice(data.turnover / 100000000) + '亿',
        turnoverDiff: roundPrice(data.turnoverDiff / 100000000) + '亿',
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取涨跌分布失败: ${msg}` };
  }
}

/**
 * get_hot_stocks — 热门股票
 */
async function executeHotStocks(rankType: string, count: number): Promise<ToolResult> {
  try {
    const validType = (['topGainers', 'topLosers', 'topTurnover'].includes(rankType)
      ? rankType
      : 'topGainers') as 'topGainers' | 'topLosers' | 'topTurnover';
    const data = await getHotStocks(count, validType);
    return {
      success: true,
      data: data.map(s => ({
        code: s.code,
        name: s.name,
        price: s.price,
        changePercent: roundPrice(s.changePercent) + '%',
        changeAmount: roundPrice(s.changeAmount),
        turnoverRate: roundPrice(s.turnoverRate) + '%',
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取热门股票失败: ${msg}` };
  }
}

/**
 * get_sector_list — 板块行情
 */
async function executeSectorList(): Promise<ToolResult> {
  try {
    const sectors = await getIndustrySectors(1);
    return {
      success: true,
      data: sectors.slice(0, 20).map(s => ({
        name: s.name,
        code: s.code,
        changePercent: roundPrice(s.changePercent) + '%',
        changeAmount: roundPrice(s.changeAmount),
        price: roundPrice(s.price),
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取板块行情失败: ${msg}` };
  }
}

/**
 * get_stock_news — 个股新闻
 */
async function executeStockNews(code: string): Promise<ToolResult> {
  if (!code || !isValidStockCode(code)) {
    return { success: false, error: `无效的股票代码: "${code}"` };
  }
  try {
    const news = await getStockNews(code.trim(), 1, 5);
    return {
      success: true,
      data: news.map(n => ({
        title: sanitizeToolOutput(n.title, 200),
        source: n.source,
        time: n.time,
        url: n.url,
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取个股新闻失败: ${msg}` };
  }
}

/**
 * get_7x24_news — 快讯
 */
async function execute7x24News(): Promise<ToolResult> {
  try {
    const news = await get7x24News(1, 10);
    return {
      success: true,
      data: news.map(n => ({
        content: sanitizeToolOutput(n.content, 300),
        createTime: n.createTime,
        tag: n.tag,
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取快讯失败: ${msg}` };
  }
}

/**
 * get_research_reports — 研报
 */
async function executeResearchReports(code: string): Promise<ToolResult> {
  if (!code || !isValidStockCode(code)) {
    return { success: false, error: `无效的股票代码: "${code}"` };
  }
  try {
    const reports = await getResearchReports(code.trim(), 1, 5);
    return {
      success: true,
      data: reports.map(r => ({
        title: sanitizeToolOutput(r.title, 200),
        orgName: sanitizeToolOutput(r.orgName, 50),
        author: sanitizeToolOutput(r.author, 30),
        publishDate: r.publishDate,
        rating: r.rating,
        predictThisYearEps: r.predictThisYearEps,
        predictThisYearPe: r.predictThisYearPe,
        industry: r.industry,
      })),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取研报失败: ${msg}` };
  }
}
