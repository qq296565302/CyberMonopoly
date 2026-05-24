import { ITool, ToolRegistry, ToolResult, ToolError } from './base';
import { NewsItem, QuickNews } from '../../models';
import { eastmoney } from '../../api/eastmoney';
import { sina } from '../../api/sina';
import { logger } from '../../utils/logger';

/**
 * 个股资讯工具
 * 获取指定股票的最新新闻和公告
 */
export class StockNewsTool implements ITool {
  name = 'get_stock_news';
  description = '获取个股的最新新闻资讯，包括公司公告、媒体报道、行业动态等';
  
  parameters = {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: '股票代码'
      },
      limit: {
        type: 'number',
        description: '返回结果数量限制，默认 20',
        default: 20
      }
    },
    required: ['symbol']
  };

  async execute(params: { symbol: string; limit?: number }): Promise<ToolResult> {
    try {
      logger.info(`[StockNewsTool] 获取个股新闻：${params.symbol}, 限制：${params.limit || 20}`);
      
      const newsList = await eastmoney.getStockNews(params.symbol, params.limit || 20);
      
      if (!newsList || newsList.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: `未找到股票 ${params.symbol} 的新闻资讯`
          } as ToolError
        };
      }

      const formattedNews = newsList.map(news => ({
        title: news.title,
        summary: news.summary,
        source: news.source,
        publishTime: news.publishTime,
        url: news.url,
        type: news.type
      }));

      return {
        success: true,
        data: {
          symbol: params.symbol,
          count: formattedNews.length,
          news: formattedNews
        }
      };
    } catch (error) {
      logger.error('[StockNewsTool] 获取个股新闻失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取个股新闻失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 7x24 小时快讯工具
 * 获取实时财经快讯，包括宏观经济、政策解读、市场动态等
 */
export class QuickNewsTool implements ITool {
  name = 'get_7x24_news';
  description = '获取 7x24 小时实时财经快讯，滚动更新的市场消息、政策解读、宏观经济数据等';
  
  parameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: '返回结果数量限制，默认 30',
        default: 30
      },
      category: {
        type: 'string',
        description: '快讯分类：all(全部), stock(股票), finance(金融), macro(宏观)',
        enum: ['all', 'stock', 'finance', 'macro'],
        default: 'all'
      }
    }
  };

  async execute(params?: { limit?: number; category?: string }): Promise<ToolResult> {
    try {
      const limit = params?.limit || 30;
      const category = params?.category || 'all';
      
      logger.info(`[QuickNewsTool] 获取 7x24 快讯，分类：${category}, 限制：${limit}`);
      
      const newsList = await sina.get7x24News(limit, category);
      
      if (!newsList || newsList.length === 0) {
        return {
          success: false,
          error: {
            code: 'DATA_NOT_FOUND',
            message: '未获取到实时快讯数据'
          } as ToolError
        };
      }

      const formattedNews = newsList.map(news => ({
        id: news.id,
        content: news.content,
        title: news.title,
        source: news.source,
        publishTime: news.publishTime,
        importance: news.importance,
        tags: news.tags
      }));

      return {
        success: true,
        data: {
          category,
          count: formattedNews.length,
          news: formattedNews,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('[QuickNewsTool] 获取 7x24 快讯失败', error);
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: `获取 7x24 快讯失败：${error instanceof Error ? error.message : String(error)}`
        } as ToolError
      };
    }
  }
}

/**
 * 注册资讯相关工具
 */
export function registerNewsTools(registry: ToolRegistry): void {
  registry.register(new StockNewsTool());
  registry.register(new QuickNewsTool());
  logger.info('[NewsTools] 资讯工具已注册');
}
