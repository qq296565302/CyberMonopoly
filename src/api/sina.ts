import * as https from 'https';
import { detectMarket, Market } from '../models/stock';
import { NewsItem } from '../models/news';
import { DataPoint, DataSeries } from '../models/chart';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
export { DataPoint, DataSeries } from '../models/chart';

function toSinaCode(code: string): string {
  if (typeof code !== 'string') code = String(code || '');
  const prefix = code.substring(0, 2);
  if (/^(60|68|51|50|52|56|58)$/.test(prefix)) return `sh${code}`;
  if (/^(00|30|15|16|18)$/.test(prefix)) return `sz${code}`;
  if (/^(43|83|87|88|82)$/.test(prefix)) return `bj${code}`;
  return `sh${code}`;
}

export interface RealtimeQuote {
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
  turnover: number;        // 成交额（元）
  turnoverRate: number;    // 换手率（%）
  pe: number;              // 市盈率(动)
  pb: number;              // 市净率
  totalMarketCap: number;  // 总市值（元）
  floatMarketCap: number;  // 流通市值（元）
}

const requestCache = new Map<string, { data: Buffer; time: number }>();
const CACHE_TTL = 3000;

async function fetchWithReferer(url: string, timeoutMs = 15000, retries = 2): Promise<Buffer> {
  const cached = requestCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchOnce(url, timeoutMs);
      requestCache.set(url, { data, time: Date.now() });
      return data;
    } catch (err: any) {
      lastError = err;
      const isSocketError = err.message?.includes('socket hang up') || 
                           err.message?.includes('ECONNRESET') ||
                           err.message?.includes('ECONNREFUSED');
      
      if (isSocketError && attempt < retries) {
        logger.warn(`fetchWithReferer socket error, retrying (${attempt + 1}/${retries}): ${url}`, err.message);
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      
      if (isSocketError) {
        throw AppError.network(
          '网络连接中断，请检查网络或稍后重试',
          { url, attempt },
          true
        );
      }
      throw err;
    }
  }
  
  throw lastError || new Error('未知错误');
}

function fetchOnce(url: string, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: timeoutMs,
    };

    const req = https.get(url, options, (res) => {
      const chunks: Buffer[] = [];
      
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve(data);
      });
      
      res.on('error', (err) => {
        reject(err);
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`请求超时 (${timeoutMs}ms)`));
    });
  });
}

export async function getRealtimeQuote(code: string): Promise<RealtimeQuote> {
  const url = `https://hq.sinajs.cn/list=${toSinaCode(code)}`;
  const buffer = await fetchWithReferer(url);
  const text = new TextDecoder('gbk').decode(buffer);

  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error(`解析失败: ${text}`);

  const f = match[1].split(',');
  const price = parseFloat(f[3]) || 0;
  const prevClose = parseFloat(f[2]) || 0;
  const open = parseFloat(f[1]) || 0;
  const bid = parseFloat(f[6]) || 0;
  const ask = parseFloat(f[7]) || 0;
  const effectivePrice = price > 0 ? price : (bid > 0 ? bid : (ask > 0 ? ask : 0));

  let turnoverRate = 0, pe = 0, pb = 0, totalMarketCap = 0, floatMarketCap = 0;
  try {
    const tencentCode = toSinaCode(code);
    const extraUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`;
    const extraBuffer = await fetchWithReferer(extraUrl);
    const extraData = JSON.parse(extraBuffer.toString('utf-8'));
    const qtData = extraData?.data?.[tencentCode]?.qt?.[tencentCode];
    if (qtData && Array.isArray(qtData)) {
      turnoverRate = parseFloat(qtData[39]) || 0;
      pe = parseFloat(qtData[52]) || 0;
      pb = parseFloat(qtData[46]) || 0;
      totalMarketCap = (parseFloat(qtData[45]) || 0) * 1e8;
      floatMarketCap = (parseFloat(qtData[44]) || 0) * 1e8;
    }
  } catch {
  }

  return {
    name: f[0].trim(),
    code,
    price: effectivePrice > 0 ? effectivePrice : prevClose,
    open,
    prevClose,
    high: parseFloat(f[4]) || 0,
    low: parseFloat(f[5]) || 0,
    volume: parseFloat(f[8]) || 0,
    changePercent: (prevClose > 0 && effectivePrice > 0) ? ((effectivePrice - prevClose) / prevClose * 100) : 0,
    changeAmount: effectivePrice > 0 ? (effectivePrice - prevClose) : 0,
    bid,
    ask,
    date: f[30] || '',
    time: f[31] || '',
    turnover: parseFloat(f[9]) || 0,
    turnoverRate,
    pe,
    pb,
    totalMarketCap,
    floatMarketCap,
  };
}

export async function getBatchQuotes(codes: string[]): Promise<RealtimeQuote[]> {
  if (codes.length === 0) return [];

  const sinaCodes = codes.map(toSinaCode).join(',');
  const url = `https://hq.sinajs.cn/list=${sinaCodes}`;
  const buffer = await fetchWithReferer(url);
  const text = new TextDecoder('gbk').decode(buffer);

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const results: RealtimeQuote[] = [];

  for (const line of lines) {
    const match = line.match(/hq_str_(\w+)="([^"]+)"/);
    if (!match) continue;

    const sinaCode = match[1];
    const code = sinaCode.replace(/^(sh|sz|bj|rt_hk|gb_)/, '');
    const f = match[2].split(',');

    const price = parseFloat(f[3]) || 0;
    const prevClose = parseFloat(f[2]) || 0;
    const open = parseFloat(f[1]) || 0;
    const bid = parseFloat(f[6]) || 0;
    const ask = parseFloat(f[7]) || 0;
    const effectivePrice = price > 0 ? price : (bid > 0 ? bid : (ask > 0 ? ask : 0));

    results.push({
      name: f[0].trim(),
      code,
      price: effectivePrice > 0 ? effectivePrice : prevClose,
      open,
      prevClose,
      high: parseFloat(f[4]) || 0,
      low: parseFloat(f[5]) || 0,
      volume: parseFloat(f[8]) || 0,
      changePercent: (prevClose > 0 && effectivePrice > 0) ? ((effectivePrice - prevClose) / prevClose * 100) : 0,
      changeAmount: effectivePrice > 0 ? (effectivePrice - prevClose) : 0,
      bid,
      ask,
      date: f[30] || '',
      time: f[31] || '',
      turnover: parseFloat(f[9]) || 0,
      turnoverRate: 0,
      pe: 0,
      pb: 0,
      totalMarketCap: 0,
      floatMarketCap: 0,
    });
  }
  
  return results;
}

interface KlineRaw {
  day: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

interface TencentMinuteData {
  time: string;
  price: number;
  avg_price: number;
  volume: number;
}

export async function getIntradayData(code: string): Promise<DataSeries> {
  const tencentCode = toSinaCode(code);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`;
  const buffer = await fetchWithReferer(url);
  const text = buffer.toString('utf-8');

  const data = JSON.parse(text);
  const stockData = data.data?.[tencentCode] || data.data;
  let prevClose = stockData?.info?.prevclose || data.data?.info?.prevclose || 0;
  let name = stockData?.info?.name || data.data?.info?.name || code;

  let realtimeQuote: RealtimeQuote | null = null;
  try {
    realtimeQuote = await getRealtimeQuote(code);
    if (realtimeQuote.prevClose > 0) {
      prevClose = realtimeQuote.prevClose;
    }
    if (realtimeQuote.name && (!name || name === code)) {
      name = realtimeQuote.name;
    }
  } catch {}

  const minuteData: string[] = stockData?.data?.data || [];

  let tradingDate = stockData?.data?.date || '';
  if (/^\d{8}$/.test(tradingDate)) {
    tradingDate = `${tradingDate.slice(0, 4)}-${tradingDate.slice(4, 6)}-${tradingDate.slice(6, 8)}`;
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)) {
    const d = new Date();
    tradingDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const points: DataPoint[] = Array.isArray(minuteData) ? minuteData.map((item: string) => {
    const parts = item.split(' ');
    const timeStr = parts[0];
    const price = parseFloat(parts[1]) || 0;
    const volume = parseFloat(parts[2]) || 0;
    const hour = timeStr.substring(0, 2);
    const minute = timeStr.substring(2, 4);
    const dateStr = `${tradingDate}T${hour}:${minute}:00`;
    return {
      date: new Date(dateStr),
      value: price,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
      label: `${code} ${timeStr}`,
    };
  }) : [];

  if (points.length === 0 && prevClose > 0 && realtimeQuote) {
    const livePrice = realtimeQuote.price > 0 ? realtimeQuote.price : (realtimeQuote.bid > 0 ? realtimeQuote.bid : (realtimeQuote.ask > 0 ? realtimeQuote.ask : 0));
    if (livePrice > 0) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      points.push({
        date: new Date(dateStr),
        value: livePrice,
        open: realtimeQuote.open > 0 ? realtimeQuote.open : livePrice,
        high: realtimeQuote.high > 0 ? realtimeQuote.high : livePrice,
        low: realtimeQuote.low > 0 ? realtimeQuote.low : livePrice,
        close: livePrice,
        volume: realtimeQuote.volume || 0,
        label: `${code} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`,
      });
    }
  }

  return {
    name: `${name} (${code})`,
    data: points,
    color: hashColor(code),
    prevClose,
    type: 'line',
  };
}

export async function getKlineData(code: string, days: number, scale: number = 240): Promise<DataSeries> {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${toSinaCode(code)}&scale=${scale}&ma=no&datalen=${Math.min(days, 1023)}`;
  const buffer = await fetchWithReferer(url);
  const text = buffer.toString('utf-8');
  
  const raw: KlineRaw[] | null = JSON.parse(text);
  
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    const realtime = await getRealtimeQuote(code).catch(() => null);
    return {
      name: `${realtime?.name || code} ${code}`,
      data: [],
      color: hashColor(code),
      prevClose: realtime?.prevClose,
      type: 'candlestick',
    };
  }
  
  const points: DataPoint[] = raw.map(item => ({
    date: new Date(item.day),
    value: parseFloat(item.close || '0'),
    open: parseFloat(item.open || '0'),
    high: parseFloat(item.high || '0'),
    low: parseFloat(item.low || '0'),
    close: parseFloat(item.close || '0'),
    volume: parseFloat(item.volume || '0'),
    label: `${code} ${item.day}`,
  }));
  
  const realtime = await getRealtimeQuote(code).catch(() => null);
  
  return {
    name: `${realtime?.name || code} ${code}`,
    data: points,
    color: hashColor(code),
    prevClose: realtime?.prevClose,
    type: 'candlestick',
  };
}

function hashColor(str: string): [number, number, number] {
  const colors: [number, number, number][] = [
    [86, 180, 233], [230, 159, 0], [0, 158, 115],
    [204, 121, 167], [213, 94, 0], [240, 228, 66],
  ];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return colors[sum % colors.length];
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function get7x24News(page = 1, pageSize = 30): Promise<NewsItem[]> {
  const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${page}&page_size=${pageSize}&zhibo_id=152&tag_id=0&dire=b&dpc=1&_=${Date.now()}`;
  const buffer = await fetchWithReferer(url);
  const text = buffer.toString('utf-8');
  
  const jsonMatch = text.match(/\{.*\}/s);
  if (!jsonMatch) throw new Error('解析快讯失败');
  
  const data = JSON.parse(jsonMatch[0]);
  const list = data.result?.data?.feed?.list || [];
  
  return list.map((item: any) => {
    const content = cleanHtml(item.rich_text || '');
    const tag = Array.isArray(item.tag) && item.tag.length > 0 ? item.tag[0].name : undefined;
    return {
      id: item.id,
      title: content.length > 100 ? content.slice(0, 100) + '...' : content,
      content,
      createTime: item.create_time || '',
      tag,
    };
  });
}
