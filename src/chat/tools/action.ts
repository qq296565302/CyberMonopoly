/**
 * 操作类工具 - open_chart / search_stock
 */

import * as vscode from 'vscode';
import { ITool, ToolContext, ToolResult, ToolError, ToolRegistry } from './base';
import { searchStocks } from '../../api/eastmoney';
import { logger } from '../../utils/logger';

export class OpenChartTool implements ITool {
  name = 'open_chart';
  description = '在编辑器中打开股票的 K 线图或分时图';

  definition = {
    type: 'function' as const,
    function: {
      name: 'open_chart',
      description: '在编辑器中打开股票的 K 线图或分时图',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: '股票代码',
          },
          chart_type: {
            type: 'string',
            enum: ['kline', 'intraday'],
            description: '图表类型：kline=K线图，intraday=分时图，默认 kline',
          },
        },
        required: ['code'],
      },
    },
  };

  async execute(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
    const code = String(args.code || '').trim();
    const chartType = String(args.chart_type || 'kline');

    if (!code || !/^\d{6}$/.test(code)) {
      return {
        success: false,
        error: { code: 'INVALID_PARAM', message: `无效的股票代码: "${code}"` } as ToolError,
      };
    }

    try {
      const executor = context?.cmdExecutor
        ?? ((cmd: string, ...a: unknown[]) => vscode.commands.executeCommand(cmd, ...a));
      await executor('cyberMonopoly.openChart', code);
      return {
        success: true,
        data: {
          code,
          chartType: chartType === 'intraday' ? 'intraday' : 'kline',
          message: `已打开 ${code} 的${chartType === 'intraday' ? '分时图' : 'K线图'}`,
        },
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: { code: 'EXECUTION_ERROR', message: `打开图表失败: ${msg}` } as ToolError };
    }
  }
}

export class SearchStockTool implements ITool {
  name = 'search_stock';
  description = '根据关键词搜索股票（支持代码和名称模糊搜索）';

  definition = {
    type: 'function' as const,
    function: {
      name: 'search_stock',
      description: '根据关键词搜索股票（支持代码和名称模糊搜索）',
      parameters: {
        type: 'object' as const,
        properties: {
          keyword: {
            type: 'string',
            description: '搜索关键词，如 "茅台" 或 "600519"',
          },
        },
        required: ['keyword'],
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const keyword = String(args.keyword || '').trim();
    if (!keyword) {
      return {
        success: false,
        error: { code: 'INVALID_PARAM', message: '搜索关键词不能为空' } as ToolError,
      };
    }

    try {
      const results = await searchStocks(keyword);
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
      return { success: false, error: { code: 'EXECUTION_ERROR', message: `搜索失败: ${msg}` } as ToolError };
    }
  }
}

export function registerActionTools(registry: ToolRegistry): void {
  registry.register(new OpenChartTool());
  registry.register(new SearchStockTool());
  logger.info('[ActionTools] 操作工具已注册');
}
