import * as https from 'https';
import * as iconv from 'iconv-lite';
import { detectMarket, Market } from '../models/stock';
import { NewsItem } from '../models/news';
import { DataPoint, DataSeries } from '../models/chart';
export { DataPoint, DataSeries } from '../models/chart';

function toSinaCode(code: string): string {
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
}

const requestCache = new Map<string, { data: Buffer; time: number }>();
const CACHE_TTL = 3000;

function fetchWithReferer(url: string, timeoutMs = 10000): Promise<Buffer> {
  const cached = requestCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    };

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`请求超时 (${timeoutMs}ms): ${url}`));
    }, timeoutMs);

    const req = https.get(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        const data = Buffer.concat(chunks);
        requestCache.set(url, { data, time: Date.now() });
        resolve(data);
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function getRealtimeQuote(code: string): Promise<RealtimeQuote> {
  const url = `https://hq.sinajs.cn/list=${toSinaCode(code)}`;
  const buffer = await fetchWithReferer(url);
  const text = iconv.decode(buffer, 'gbk');
  
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error(`解析失败: ${text}`);
  
  const f = match[1].split(',');
  const price = parseFloat(f[3]) || 0;
  const prevClose = parseFloat(f[2]) || 0;
  
  return {
    name: f[0].trim(),
    code,
    price,
    open: parseFloat(f[1]) || 0,
    prevClose,
    high: parseFloat(f[4]) || 0,
    low: parseFloat(f[5]) || 0,
    volume: parseFloat(f[8]) || 0,
    changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
    changeAmount: price - prevClose,
    bid: parseFloat(f[6]) || 0,
    ask: parseFloat(f[7]) || 0,
    date: f[30] || '',
    time: f[31] || '',
  };
}

export async function getBatchQuotes(codes: string[]): Promise<RealtimeQuote[]> {
  if (codes.length === 0) return [];
  
  const sinaCodes = codes.map(toSinaCode).join(',');
  const url = `https://hq.sinajs.cn/list=${sinaCodes}`;
  const buffer = await fetchWithReferer(url);
  const text = iconv.decode(buffer, 'gbk');
  
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
    
    results.push({
      name: f[0].trim(),
      code,
      price,
      open: parseFloat(f[1]) || 0,
      prevClose,
      high: parseFloat(f[4]) || 0,
      low: parseFloat(f[5]) || 0,
      volume: parseFloat(f[8]) || 0,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0,
      changeAmount: price - prevClose,
      bid: parseFloat(f[6]) || 0,
      ask: parseFloat(f[7]) || 0,
      date: f[30] || '',
      time: f[31] || '',
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
  const name = stockData?.info?.name || data.data?.info?.name || code;

  try {
    const quote = await getRealtimeQuote(code);
    if (quote.prevClose > 0) {
      prevClose = quote.prevClose;
    }
    if (!name || name === code) {
      (stockData as any)._name = quote.name;
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
  
  const raw: KlineRaw[] = JSON.parse(text);
  
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
