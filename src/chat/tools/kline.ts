/**
 * K 线与分时数据工具
 */

import { ITool, ToolContext, ToolRegistry, ToolResult } from './base';
import { getFullKlineData } from '../../api/eastmoney';
import { getIntradayData } from '../../api/sina';
import { logger } from '../../utils/logger';

export class KlineSummaryTool implements ITool {
  name = 'get_kline_summary';
  description = '获取股票 K 线区间摘要统计，包含区间最高价、最低价、最新收盘价、涨跌幅、平均成交量等';
  
  definition = {
    type: 'function' as const,
    function: {
      name: 'get_kline_summary',
      description: '获取股票 K 线区间摘要统计，包含区间最高价、最低价、最新收盘价、涨跌幅、平均成交量等',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: '6 位股票代码，如 600519（贵州茅台）'
          },
          days: {
            type: 'number',
            description: '截取最近 N 个交易日，默认 30',
            default: 30
          }
        },
        required: ['code']
      }
    }
  };

  async execute(args: { code: string; days?: number }): Promise<ToolResult> {
    try {
      const code = String(args.code || '').trim();
      const days = typeof args.days === 'number' ? Math.min(args.days, 120) : 30;

      logger.info(`[KlineSummaryTool] 获取 K 线数据：${code}, 天数：${days}`);

      // 参数校验
      if (!code) {
        return {
          success: false,
          error: '股票代码不能为空'
        };
      }

      if (!/^\d{6}$/.test(code)) {
        return {
          success: false,
          error: `无效的股票代码："${code}"，应为 6 位数字`
        };
      }

      const klineData = await getFullKlineData(code);
      
      if (!klineData || klineData.length === 0) {
        return { 
          success: false, 
          error: `未找到股票 ${code} 的 K 线数据`
        };
      }

      // 截取指定天数
      const recentData = klineData.slice(-days);
      
      if (recentData.length === 0) {
        return { 
          success: false, 
          error: `股票 ${code} 没有最近${days}天的数据`
        };
      }

      // 计算统计数据
      const prices = recentData.map(d => d.close);
      const volumes = recentData.map(d => d.volume);
      const highs = recentData.map(d => d.high);
      const lows = recentData.map(d => d.low);

      const startPrice = prices[0];
      const endPrice = prices[prices.length - 1];
      const changePercent = ((endPrice - startPrice) / startPrice) * 100;

      return {
        success: true,
        data: {
          code,
          days: recentData.length,
          startDate: recentData[0].date,
          endDate: recentData[recentData.length - 1].date,
          startPrice: startPrice.toFixed(2),
          endPrice: endPrice.toFixed(2),
          changePercent: changePercent.toFixed(2) + '%',
          highestPrice: Math.max(...highs).toFixed(2),
          lowestPrice: Math.min(...lows).toFixed(2),
          avgVolume: (volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(0),
          totalTradingDays: recentData.length,
          klineData: recentData.map(d => ({
            date: d.date,
            open: d.open.toFixed(2),
            high: d.high.toFixed(2),
            low: d.low.toFixed(2),
            close: d.close.toFixed(2),
            volume: d.volume
          }))
        }
      };
    } catch (error) {
      logger.error('[KlineSummaryTool] K 线数据查询失败', error);
      return { 
        success: false, 
        error: `获取 K 线数据失败：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

export class IntradayDataTool implements ITool {
  name = 'get_intraday_data';
  description = '获取股票当日分时数据统计摘要，包含最新价、昨收、涨跌幅、日内最高最低价等';
  
  definition = {
    type: 'function' as const,
    function: {
      name: 'get_intraday_data',
      description: '获取股票当日分时数据统计摘要，包含最新价、昨收、涨跌幅、日内最高最低价等',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: '6 位股票代码，如 600519（贵州茅台）'
          }
        },
        required: ['code']
      }
    }
  };

  async execute(args: { code: string }): Promise<ToolResult> {
    try {
      const code = String(args.code || '').trim();

      logger.info(`[IntradayDataTool] 获取分时数据：${code}`);

      // 参数校验
      if (!code) {
        return {
          success: false,
          error: '股票代码不能为空'
        };
      }

      if (!/^\d{6}$/.test(code)) {
        return {
          success: false,
          error: `无效的股票代码："${code}"，应为 6 位数字`
        };
      }

      const intradayData = await getIntradayData(code);
      
      if (!intradayData || !intradayData.data || intradayData.data.length === 0) {
        return { 
          success: false, 
          error: `未找到股票 ${code} 的分时数据，可能尚未开盘或已收盘`
        };
      }

      const points = intradayData.data;
      const prices = points.map(p => p.price);
      const latestPoint = points[points.length - 1];

      return {
        success: true,
        data: {
          code,
          name: intradayData.name,
          tradingDate: intradayData.tradingDate,
          prevClose: intradayData.prevClose.toFixed(2),
          latestPrice: latestPoint.price.toFixed(2),
          changePercent: intradayData.changePercent.toFixed(2) + '%',
          high: Math.max(...prices).toFixed(2),
          low: Math.min(...prices).toFixed(2),
          dataPoints: points.length,
          latestTime: latestPoint.time
        }
      };
    } catch (error) {
      logger.error('[IntradayDataTool] 分时数据查询失败', error);
      return { 
        success: false, 
        error: `获取分时数据失败：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

/**
 * 注册 K 线相关工具
 */
export function registerKlineTools(registry: ToolRegistry): void {
  registry.register(new KlineSummaryTool());
  registry.register(new IntradayDataTool());
  logger.info('[KlineTools] K 线工具已注册');
}
