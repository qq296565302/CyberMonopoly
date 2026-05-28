/**
 * 工具注册中心 - 统一入口
 *
 * 所有工具通过 ToolRegistry 注册，本模块提供：
 * - initializeTools(): 注册所有内置工具（扩展激活时调用）
 * - getToolDefinitions(): 返回 OpenAI Function Calling 格式的工具定义
 * - executeTool(): 执行单个工具调用，返回 JSON 字符串
 * - executeToolCalls(): 批量执行工具调用
 */

import * as vscode from 'vscode';
import { registry, ToolDefinition, ToolCall, ToolCallResult, ToolResult, ToolContext } from './base';
import { StockQuoteTool, BatchQuoteTool } from './quote';
import { KlineSummaryTool, IntradayDataTool } from './kline';
import { FinanceSummaryTool, ResearchReportsTool } from './finance';
import { MarketOverviewTool, MarketDistributionTool, HotStocksTool, SectorListTool } from './market';
import { StockNewsTool, QuickNewsTool } from './news';
import { OpenChartTool, SearchStockTool } from './action';
import { sanitizeToolOutput } from '../../utils/security';
import { getHotStocks } from '../../api/eastmoney';
import { getIndexQuotes, getMarketDistribution, getIndustrySectors } from '../../api/market';
import { getStockNews, getResearchReports, getFinanceData } from '../../api/eastmoney';
import { get7x24News } from '../../api/sina';

// 重新导出类型，保持向后兼容
export { ToolDefinition, ToolCall, ToolCallResult, ToolResult, ToolContext, registry } from './base';
export { sanitizeForPrompt, sanitizeToolOutput, sanitizeToolData } from '../../utils/security';

// ============================================================
// 工具初始化
// ============================================================

let initialized = false;

/**
 * 注册所有内置工具（幂等，重复调用无副作用）
 */
export function initializeTools(): void {
  if (initialized) return;
  registry.registerAll([
    new StockQuoteTool(),
    new BatchQuoteTool(),
    new KlineSummaryTool(),
    new IntradayDataTool(),
    new FinanceSummaryTool(),
    new ResearchReportsTool(),
    new MarketOverviewTool(),
    new MarketDistributionTool(),
    new HotStocksTool(),
    new SectorListTool(),
    new StockNewsTool(),
    new QuickNewsTool(),
    new OpenChartTool(),
    new SearchStockTool(),
  ]);
  initialized = true;
}

// ============================================================
// 工具定义与执行（供 aiChatPanel.ts 使用）
// ============================================================

let _cachedDefinitions: ToolDefinition[] | null = null;

/**
 * 返回所有工具的 OpenAI Function Calling 定义
 */
export function getToolDefinitions(): ToolDefinition[] {
  initializeTools();
  if (!_cachedDefinitions) {
    _cachedDefinitions = registry.getAllDefinitions();
  }
  return _cachedDefinitions;
}

/**
 * 将 registry 返回的 ToolResult 转为 JSON 字符串（兼容 toolExecutor 接口）
 */
function resultToJson(result: ToolResult): string {
  // 规范化 error 字段为字符串
  if (result.error && typeof result.error === 'object') {
    return JSON.stringify({ ...result, error: result.error.message });
  }
  return JSON.stringify(result);
}

/**
 * 执行单个工具调用
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cmdExecutor?: (command: string, ...cmdArgs: unknown[]) => Thenable<unknown>
): Promise<string> {
  initializeTools();

  const context: ToolContext | undefined = cmdExecutor
    ? { cmdExecutor }
    : undefined;

  // 对于需要特殊处理的工具，直接调用对应的 execute 逻辑
  // 以保持与原 toolExecutor 一致的返回格式
  const result = await executeWithFallback(name, args, context);
  return resultToJson(result);
}

/**
 * 带格式兼容的工具执行
 *
 * 部分工具在 registry 中的返回格式与原 toolExecutor 不同，
 * 此函数对这些工具做格式适配。
 */
async function executeWithFallback(
  name: string,
  args: Record<string, unknown>,
  context?: ToolContext
): Promise<ToolResult> {
  try {
    // 优先使用 registry 中的工具
    const tool = registry.get(name);
    if (tool) {
      const rawResult = await tool.execute(args, context);
      // 如果工具返回成功，对特定工具做格式适配
      if (rawResult.success) {
        return adaptResult(name, rawResult);
      }
      return rawResult;
    }
    return { success: false, error: `未知工具: ${name}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `工具 ${name} 执行异常: ${message}` };
  }
}

/**
 * 对特定工具的返回格式做适配
 *
 * registry 中的工具返回的是结构化数据，但 aiChatPanel.ts 的 formatToolResult
 * 期望特定的字段名。此函数将 registry 格式转为 formatToolResult 期望的格式。
 */
function adaptResult(name: string, result: ToolResult): ToolResult {
  const data = result.data as any;
  if (!data) return result;

  switch (name) {
    case 'get_market_overview': {
      // registry 返回 { indices: [...] }，formatToolResult 期望 [...]
      if (data.indices) return { ...result, data: data.indices };
      return result;
    }
    case 'get_market_distribution': {
      // registry 返回带 timestamp 的对象，formatToolResult 期望扁平结构
      const { timestamp, ...rest } = data;
      return { ...result, data: rest };
    }
    case 'get_hot_stocks': {
      // registry 返回 { stocks: [...] }，formatToolResult 期望 [...]
      if (data.stocks) return { ...result, data: data.stocks };
      return result;
    }
    case 'get_sector_list': {
      // registry 返回 { sectors: [...] }，formatToolResult 期望 [...]
      if (data.sectors) return { ...result, data: data.sectors };
      return result;
    }
    case 'get_stock_news': {
      // registry 返回 { news: [...] }，formatToolResult 期望 [...]
      if (data.news) return { ...result, data: data.news };
      return result;
    }
    case 'get_7x24_news': {
      // registry 返回 { news: [...] }，formatToolResult 期望 [...]
      if (data.news) return { ...result, data: data.news };
      return result;
    }
    case 'get_research_reports': {
      // registry 返回 { reports: [...] }，formatToolResult 期望 [...]
      if (data.reports) return { ...result, data: data.reports };
      return result;
    }
    case 'get_finance_summary': {
      // registry 返回 { indicators: [...] }，formatToolResult 期望 [...]
      if (data.indicators) return { ...result, data: data.indicators };
      return result;
    }
    case 'open_chart': {
      // registry 返回 { message: '...' }，formatToolResult 期望 data.message
      return result;
    }
    default:
      return result;
  }
}

/**
 * 批量执行工具调用
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
      } catch {}
      const output = await executeTool(tc.function.name, parsedArgs, cmdExecutor);
      return {
        tool_call_id: tc.id,
        output,
      };
    })
  );
  return results;
}
