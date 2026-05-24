/**
 * 工具函数索引文件
 * 统一导出所有工具类和注册函数
 */

import { registry } from './base';
import { StockQuoteTool, BatchQuoteTool } from './quote';
import { KlineSummaryTool, IntradayDataTool } from './kline';
import { FinanceSummaryTool, ResearchReportsTool } from './finance';
import { MarketOverviewTool, MarketDistributionTool, HotStocksTool, SectorListTool } from './market';
import { StockNewsTool, QuickNewsTool } from './news';

// 导出基础接口和类
export { ITool, ToolContext, ToolRegistry, registry as toolRegistry } from './base';

// 导出具体工具类
export { StockQuoteTool, BatchQuoteTool } from './quote';
export { KlineSummaryTool, IntradayDataTool } from './kline';
export { FinanceSummaryTool, ResearchReportsTool } from './finance';
export { MarketOverviewTool, MarketDistributionTool, HotStocksTool, SectorListTool } from './market';
export { StockNewsTool, QuickNewsTool } from './news';

/**
 * 初始化并注册所有内置工具
 */
export function initializeTools(): void {
    const tools = [
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
        new QuickNewsTool()
    ];
    
    registry.registerAll(tools);
}

/**
 * 获取所有已注册的工具定义（供 LLM 使用）
 */
export function getToolDefinitions() {
    return registry.getAllDefinitions();
}

/**
 * 执行单个工具调用
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    context?: any
) {
    return registry.execute(name, args, context);
}
