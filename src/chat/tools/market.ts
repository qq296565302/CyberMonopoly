import { ITool, ToolRegistry, ToolResult } from './base';
import { IndexQuote, MarketDistribution as MarketDist, RankStock, SectorQuote } from '../../api/market';
import { getIndexQuotes, getMarketDistribution as getMktDist, getIndustrySectors, getConceptSectors, getRankStocks } from '../../api/market';
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
          error: '未获取到市场指数数据'
        };
      }

      const formattedData = overview.map((index: IndexQuote) => ({
        code: index.code,
        name: index.name,
        price: index.price,
        change: index.change,
        changePercent: index.changePercent,
        volume: index.volume,
        turnover: index.turnover,
        high: index.high,
        low: index.low,
        open: index.open,
        prevClose: index.prevClose
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
        error: `获取市场概览失败：${error instanceof Error ? error.message : String(error)}`
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
      
      const distribution = await getMktDist();
      
      if (!distribution) {
        return {
          success: false,
          error: '未获取到涨跌分布数据'
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
        error: `获取涨跌分布失败：${error instanceof Error ? error.message : String(error)}`
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
  description = '获取热门股票排行榜，支持涨幅榜、跌幅榜、成交额榜、换手率榜、资金流向榜';
  
  definition = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '排行榜类型',
        enum: ['gain', 'loss', 'turnover', 'amount', 'inflow', 'outflow'],
        default: 'gain'
      },
      limit: {
        type: 'number',
        description: '返回结果数量限制，默认 20',
        default: 20
      }
    },
    required: ['type']
  };

  async execute(params: { type: string; limit?: number }): Promise<ToolResult> {
    try {
      const typeMap: Record<string, string> = {
        gain: '涨幅榜',
        loss: '跌幅榜',
        turnover: '换手率榜',
        amount: '成交额榜',
        inflow: '资金净流入榜',
        outflow: '资金净流出榜'
      };

      logger.info(`[HotStocksTool] 获取${typeMap[params.type] || params.type}，限制：${params.limit || 20}`);
      
      let stocks: HotStock[];
      
      switch (params.type) {
        case 'gain':
          stocks = await market.getTopGainers(params.limit || 20);
          break;
        case 'loss':
          stocks = await market.getTopLosers(params.limit || 20);
          break;
        case 'turnover':
          stocks = await market.getHighTurnoverStocks(params.limit || 20);
          break;
        case 'amount':
          stocks = await market.getHighAmountStocks(params.limit || 20);
          break;
        case 'inflow':
          stocks = await market.getTopMoneyInflow(params.limit || 20);
          break;
        case 'outflow':
          stocks = await market.getTopMoneyOutflow(params.limit || 20);
          break;
        default:
          return {
            success: false,
            error: {
              code: 'INVALID_PARAM',
              message: `无效的排行榜类型：${params.type}，支持：gain, loss, turnover, amount, inflow, outflow`
            } as ToolError
          };
      }

      if (!stocks || stocks.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: `未获取到${typeMap[params.type]}数据`
          } as ToolError
        };
      }

      const formattedStocks = stocks.map(stock => ({
        code: stock.code,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        change: stock.change,
        volume: stock.volume,
        turnover: stock.turnover,
        amount: stock.amount,
        rank: stock.rank
      }));

      return {
        success: true,
        data: {
          type: params.type,
          typeName: typeMap[params.type],
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
  description = '获取板块列表，支持一级行业、二级行业、概念板块，可查询板块行情和成分股';
  
  parameters = {
    type: 'object',
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
      
      let sectors: SectorInfo[];
      
      switch (sectorType) {
        case 'industry1':
          sectors = await market.getIndustrySectors('1', params?.limit || 50);
          break;
        case 'industry2':
          sectors = await market.getIndustrySectors('2', params?.limit || 50);
          break;
        case 'concept':
          sectors = await market.getConceptSectors(params?.limit || 50);
          break;
        default:
          return {
            success: false,
            error: {
              code: 'INVALID_PARAM',
              message: `无效的板块类型：${sectorType}`
            } as ToolError
          };
      }

      if (!sectors || sectors.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: `未获取到${typeMap[sectorType]}数据`
          } as ToolError
        };
      }

      const formattedSectors = sectors.map(sector => ({
        code: sector.code,
        name: sector.name,
        changePercent: sector.changePercent,
        change: sector.change,
        volume: sector.volume,
        amount: sector.amount,
        stockCount: sector.stockCount,
        leadingStock: sector.leadingStock
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
