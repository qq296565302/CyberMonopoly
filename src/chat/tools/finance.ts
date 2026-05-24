import { ITool, ToolContext, ToolRegistry, ToolResult } from './base';
import { FinanceIndicator, ResearchReport } from '../../api/eastmoney';
import { getFinanceData, getResearchReports as fetchResearchReports } from '../../api/eastmoney';
import { logger } from '../../utils/logger';

/**
 * 财务数据摘要工具
 * 获取个股的财务指标摘要（PE、PB、ROE、营收、净利润等）
 */
export class FinanceSummaryTool implements ITool {
  name = 'get_finance_summary';
  description = '获取个股的财务数据摘要，包括市盈率、市净率、ROE、营收、净利润等关键指标';
  
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          symbol: {
            type: 'string',
            description: '股票代码，例如 "000001" 或 "sh600519"'
          }
        },
        required: ['symbol']
      }
    }
  };

  async execute(args: { symbol: string }): Promise<ToolResult> {
    try {
      logger.info(`[FinanceSummaryTool] 获取财务数据：${args.symbol}`);
      
      const code = args.symbol.trim();
      if (!/^\d{6}$/.test(code)) {
        return {
          success: false,
          error: `无效的股票代码："${code}"，应为 6 位数字`
        };
      }
      
      const indicators = await getFinanceData(code);
      
      if (!indicators || indicators.length === 0) {
        return {
          success: false,
          error: `未找到股票 ${code} 的财务数据`
        };
      }

      // 返回最近 5 期数据
      const recentIndicators = indicators.slice(0, 5).map(ind => ({
        reportDate: ind.reportDate,
        eps: ind.eps,
        roe: ind.roe,
        revenueYoy: ind.revenueYoy,
        netProfitYoy: ind.netProfitYoy,
        grossMargin: ind.grossMargin,
        netMargin: ind.netMargin,
        debtRatio: ind.debtRatio
      }));
      
      return {
        success: true,
        data: {
          code: code,
          indicators: recentIndicators
        }
      };
    } catch (error) {
      logger.error('[FinanceSummaryTool] 获取财务数据失败', error);
      return {
        success: false,
        error: `获取财务数据失败：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

/**
 * 研报评级工具
 * 获取个股的分析师研报和评级信息
 */
export class ResearchReportsTool implements ITool {
  name = 'get_research_reports';
  description = '获取个股的分析师研报和评级信息，包括机构名称、评级、目标价等';
  
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          symbol: {
            type: 'string',
            description: '股票代码'
          },
          limit: {
            type: 'number',
            description: '返回结果数量限制，默认 10',
            default: 10
          }
        },
        required: ['symbol']
      }
    }
  };

  async execute(args: { symbol: string; limit?: number }): Promise<ToolResult> {
    try {
      const code = args.symbol.trim();
      const limit = typeof args.limit === 'number' ? Math.min(args.limit, 20) : 10;
      
      logger.info(`[ResearchReportsTool] 获取研报：${code}, 限制：${limit}`);
      
      if (!/^\d{6}$/.test(code)) {
        return {
          success: false,
          error: `无效的股票代码："${code}"，应为 6 位数字`
        };
      }
      
      const reports = await fetchResearchReports(code, 1, limit);
      
      if (!reports || reports.length === 0) {
        return {
          success: false,
          error: `未找到股票 ${code} 的研报数据`
        };
      }

      const formattedReports = reports.map((report: ResearchReport) => ({
        orgName: report.orgName,
        analystName: report.author || '未知',
        rating: report.rating,
        targetPrice: report.targetPrice,
        publishDate: report.publishDate,
        title: report.title,
        summary: report.digest?.slice(0, 200)
      }));

      return {
        success: true,
        data: {
          code: code,
          count: formattedReports.length,
          reports: formattedReports
        }
      };
    } catch (error) {
      logger.error('[ResearchReportsTool] 获取研报失败', error);
      return {
        success: false,
        error: `获取研报失败：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

/**
 * 注册财务相关工具
 */
export function registerFinanceTools(registry: ToolRegistry): void {
  registry.register(new FinanceSummaryTool());
  registry.register(new ResearchReportsTool());
  logger.info('[FinanceTools] 财务数据工具已注册');
}
