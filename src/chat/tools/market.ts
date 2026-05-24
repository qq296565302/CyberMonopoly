import { ITool, ToolRegistry, ToolResult, ToolError } from './base';
import { IndexQuote, MarketDistribution, RankStock, SectorQuote, RankType } from '../../api/market';
import { getIndexQuotes, getMarketDistribution, getIndustrySectors, getConceptSectors, getRankStocks } from '../../api/market';
import { logger } from '../../utils/logger';

/**
 * 市场概览工具
 * 获取大盘指数行情和市场整体状况
 */
export class MarketOverviewTool implements ITool {
  name = 'get_market_overview';
  description = '获取市场概览信息，包括主要指数（上证指数、深证成指、创业板指等）的实时行情';
  
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          indices: {
            type: 'array',
            items: { type: 'string' },
            description: '指定要查询的指数代码列表，不传则返回所有主要指数'
          }
        }
      }
    }
  };

  async execute(params?: { indices?: string[] }): Promise<ToolResult> {
    try {
      logger.info('[MarketOverviewTool] 获取市场概览');
      
      const overview = await getIndexQuotes();
      
      if (!overview || overview.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: '未获取到市场指数数据'
          } as ToolError
        };
      }

      const formattedData = overview.map((index: IndexQuote) => ({
        code: index.code,
        name: index.name,
        price: index.price,
        changePercent: index.changePercent,
        changeAmount: index.changeAmount,
        market: index.market
      }));

      return {
        success: true,
        data: {
          count: formattedData.length,
          indices: formattedData,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('[MarketOverviewTool] 获取市场概览失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取市场概览失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 涨跌分布工具
 * 获取 A 股市场涨跌家数统计、涨停跌停数量等
 */
export class MarketDistributionTool implements ITool {
  name = 'get_market_distribution';
  description = '获取市场涨跌分布统计，包括上涨/下跌/平盘家数、涨停/跌停数量、炸板率等';
  
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          market: {
            type: 'string',
            description: '市场类型：sh(沪市), sz(深市), bj(北交所), 或不传表示全市场',
            enum: ['sh', 'sz', 'bj']
          }
        }
      }
    }
  };

  async execute(params?: { market?: string }): Promise<ToolResult> {
    try {
      logger.info(`[MarketDistributionTool] 获取涨跌分布，市场：${params?.market || '全市场'}`);

      const distribution = await getMarketDistribution();

      if (!distribution) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: '未获取到涨跌分布数据'
          } as ToolError
        };
      }

      return {
        success: true,
        data: {
          market: params?.market || 'all',
          upCount: distribution.upCount,
          downCount: distribution.downCount,
          flatCount: distribution.flatCount,
          limitUpCount: distribution.limitUpCount,
          limitDownCount: distribution.limitDownCount,
          turnover: distribution.turnover,
          turnoverDiff: distribution.turnoverDiff,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('[MarketDistributionTool] 获取涨跌分布失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取涨跌分布失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 热门股票工具
 * 获取涨幅榜、跌幅榜、成交额榜、换手率榜等热门股票排行
 */
export class HotStocksTool implements ITool {
  name = 'get_hot_stocks';
  description = '获取热门股票排行榜，支持涨幅榜、跌幅榜、换手率榜、资金净流入榜、资金净流出榜';

  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          rankType: {
            type: 'string',
            description: '排行榜类型',
            enum: ['topGainers', 'topLosers', 'topTurnover', 'topNetInflow', 'topNetOutflow'],
            default: 'topGainers'
          },
          limit: {
            type: 'number',
            description: '返回结果数量限制，默认 20',
            default: 20
          }
        },
        required: ['rankType']
      }
    }
  };

  async execute(params: { rankType: string; limit?: number }): Promise<ToolResult> {
    try {
      const typeMap: Record<string, string> = {
        topGainers: '涨幅榜',
        topLosers: '跌幅榜',
        topTurnover: '换手率榜',
        topNetInflow: '资金净流入榜',
        topNetOutflow: '资金净流出榜'
      };

      const rankType = params.rankType as RankType;
      const limit = params.limit || 20;

      logger.info(`[HotStocksTool] 获取${typeMap[rankType] || rankType}，限制：${limit}`);

      // 验证排行榜类型
      if (!typeMap[rankType]) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAM',
            message: `无效的排行榜类型：${rankType}，支持：topGainers, topLosers, topTurnover, topNetInflow, topNetOutflow`
          } as ToolError
        };
      }

      const stocks = await getRankStocks(rankType, limit);

      if (!stocks || stocks.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: `未获取到${typeMap[rankType]}数据`
          } as ToolError
        };
      }

      const formattedStocks = stocks.map((stock, index) => ({
        rank: index + 1,
        code: stock.code,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        changeAmount: stock.changeAmount,
        turnoverRate: stock.turnoverRate,
        netInflow: stock.netInflow,
        turnover: stock.turnover
      }));

      return {
        success: true,
        data: {
          type: rankType,
          typeName: typeMap[rankType],
          count: formattedStocks.length,
          stocks: formattedStocks,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('[HotStocksTool] 获取热门股票失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取热门股票失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 板块列表工具
 * 获取行业板块、概念板块信息及其行情
 */
export class SectorListTool implements ITool {
  name = 'get_sector_list';
  description = '获取板块列表，支持一级行业、二级行业、概念板块，可查询板块行情';

  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            description: '板块类型',
            enum: ['industry1', 'industry2', 'concept'],
            default: 'industry1'
          },
          limit: {
            type: 'number',
            description: '返回结果数量限制，默认 50',
            default: 50
          }
        }
      }
    }
  };

  async execute(params?: { type?: string; limit?: number }): Promise<ToolResult> {
    try {
      const typeMap: Record<string, string> = {
        industry1: '一级行业',
        industry2: '二级行业',
        concept: '概念板块'
      };

      const sectorType = params?.type || 'industry1';
      logger.info(`[SectorListTool] 获取${typeMap[sectorType]}，限制：${params?.limit || 50}`);

      let sectors: SectorQuote[];

      switch (sectorType) {
        case 'industry1':
          sectors = await getIndustrySectors(1);
          break;
        case 'industry2':
          sectors = await getIndustrySectors(2);
          break;
        case 'concept':
          sectors = await getConceptSectors();
          break;
        default:
          return {
            success: false,
            error: {
              code: 'INVALID_PARAM',
              message: `无效的板块类型：${sectorType}，支持：industry1, industry2, concept`
            } as ToolError
          };
      }

      // 按 limit 截断
      const limit = params?.limit || 50;
      const limitedSectors = sectors.slice(0, limit);

      if (!limitedSectors || limitedSectors.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: `未获取到${typeMap[sectorType]}数据`
          } as ToolError
        };
      }

      const formattedSectors = limitedSectors.map(sector => ({
        code: sector.code,
        name: sector.name,
        changePercent: sector.changePercent,
        changeAmount: sector.changeAmount,
        price: sector.price
      }));

      return {
        success: true,
        data: {
          type: sectorType,
          typeName: typeMap[sectorType],
          count: formattedSectors.length,
          sectors: formattedSectors,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('[SectorListTool] 获取板块列表失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取板块列表失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 注册市场相关工具
 */
export function registerMarketTools(registry: ToolRegistry): void {
  registry.register(new MarketOverviewTool());
  registry.register(new MarketDistributionTool());
  registry.register(new HotStocksTool());
  registry.register(new SectorListTool());
  logger.info('[MarketTools] 市场数据工具已注册');
}
