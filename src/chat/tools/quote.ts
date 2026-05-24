/**
 * 行情查询工具 - 获取个股实时行情
 */

import { ITool, ToolContext } from './base';
import { ToolDefinition, ToolResult } from '../toolExecutor';
import { getRealtimeQuote } from '../../api/sina';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class StockQuoteTool implements ITool {
    public readonly name = 'get_stock_quote';
    public readonly description = '获取单只股票的实时行情数据，包括最新价、涨跌幅、成交量、成交额等';

    public readonly definition: ToolDefinition = {
        type: 'function',
        function: {
            name: this.name,
            description: this.description,
            parameters: {
                type: 'object',
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

    async execute(args: Record<string, unknown>, _context?: ToolContext): Promise<ToolResult> {
        const code = String(args.code || '').trim();

        // 参数校验
        if (!code) {
            return { success: false, error: '股票代码不能为空' };
        }

        if (!/^\d{6}$/.test(code)) {
            return { success: false, error: `无效的股票代码："${code}"，应为 6 位数字` };
        }

        try {
            const quote = await getRealtimeQuote(code);
            
            if (!quote) {
                return { 
                    success: false, 
                    error: `未找到股票 ${code} 的行情数据，可能该股票不存在或已退市` 
                };
            }

            return {
                success: true,
                data: {
                    code: quote.code,
                    name: quote.name,
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    open: quote.open,
                    high: quote.high,
                    low: quote.low,
                    prevClose: quote.prevClose,
                    volume: quote.volume,
                    amount: quote.amount,
                    bid: quote.bid,
                    ask: quote.ask,
                    timestamp: quote.timestamp
                }
            };
        } catch (error) {
            logger.error(`行情查询失败：${code}`, 'StockQuoteTool', error as Error);
            
            if (error instanceof AppError) {
                return { success: false, error: `获取行情失败：${error.message}` };
            }
            
            return { 
                success: false, 
                error: `获取行情失败：${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }
}

/**
 * 批量行情查询工具
 */
export class BatchQuoteTool implements ITool {
    public readonly name = 'get_batch_quotes';
    public readonly description = '批量获取多只股票的实时行情数据';

    public readonly definition: ToolDefinition = {
        type: 'function',
        function: {
            name: this.name,
            description: this.description,
            parameters: {
                type: 'object',
                properties: {
                    codes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '股票代码数组，如 ["600519", "000858"]'
                    }
                },
                required: ['codes']
            }
        }
    };

    async execute(args: Record<string, unknown>, _context?: ToolContext): Promise<ToolResult> {
        const codes = Array.isArray(args.codes) 
            ? args.codes.map(c => String(c).trim()).filter(c => /^\d{6}$/.test(c))
            : [];

        if (codes.length === 0) {
            return { success: false, error: '请提供有效的股票代码列表' };
        }

        if (codes.length > 50) {
            return { success: false, error: '单次查询最多支持 50 只股票' };
        }

        try {
            const quotes = await getRealtimeQuote(codes.join(',')) as any;
            
            // 处理批量返回结果
            const results = Array.isArray(quotes) ? quotes : [quotes];
            
            return {
                success: true,
                data: results.map((q: any) => ({
                    code: q.code,
                    name: q.name,
                    price: q.price,
                    change: q.change,
                    changePercent: q.changePercent,
                    volume: q.volume,
                    amount: q.amount
                }))
            };
        } catch (error) {
            logger.error('批量行情查询失败', 'BatchQuoteTool', error as Error);
            return { 
                success: false, 
                error: `批量查询失败：${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }
}
