import { detectMarket, hashColor } from '../models/stock';
import { DataSeries, DataPoint } from './sina';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';
import { httpClient } from '../utils/httpClient';

function toEmCode(code: string): string {
  const market = detectMarket(code);
  return `${code}.${market}`;
}

function cleanEmHtml(html: string): string {
  return html
    .replace(/<em>/g, '')
    .replace(/<\/em>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export interface StockNewsItem {
  id: string;
  title: string;
  digest: string;
  url: string;
  time: string;
  source: string;
}

export async function getStockNews(code: string, page = 1, pageSize = 20): Promise<StockNewsItem[]> {
  const param = JSON.stringify({
    uid: '',
    keyword: code,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    clientVersion: 'curr',
    param: {
      cmsArticleWebOld: {
        searchScope: 'default',
        sort: 'default',
        pageIndex: page,
        pageSize,
        preTag: '<em>',
        postTag: '</em>',
      }
    }
  });

  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=${encodeURIComponent(param)}`;
  const text = await httpClient.fetchText(url, {
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });

  const jsonMatch = text.match(/jQuery\(([\s\S]*)\)/);
  if (!jsonMatch) return [];

  const data = JSON.parse(jsonMatch[1]);
  const list: any[] = data?.result?.cmsArticleWebOld || [];

  return list.map((item: any) => ({
    id: String(item.code || Math.random()),
    title: cleanEmHtml(item.title || ''),
    digest: cleanEmHtml(item.content || ''),
    url: item.url || '',
    time: item.date || '',
    source: item.mediaName || '',
  }));
}

export interface ResearchReport {
  id: string;
  title: string;
  orgName: string;
  author: string;
  publishDate: string;
  rating: string;
  targetPrice: string;
  predictThisYearEps: string;
  predictThisYearPe: string;
  predictNextYearEps: string;
  predictNextYearPe: string;
  industry: string;
  digest: string;
}

export async function getResearchReports(code: string, page = 1, pageSize = 20): Promise<ResearchReport[]> {
  const now = new Date();
  const endTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const beginYear = now.getFullYear() - 1;
  const beginTime = `${beginYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const url = `https://reportapi.eastmoney.com/report/list?industryCode=*&pageSize=${pageSize}&industry=*&rating=*&ratingChange=*&beginTime=${beginTime}&endTime=${endTime}&pageNo=${page}&fields=&qType=0&orgCode=&code=${code}`;
  const text = await httpClient.fetchText(url, {
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });
  const data = JSON.parse(text);

  const list: any[] = data?.data || [];

  return list.map((item: any) => {
    let authors = '';
    if (Array.isArray(item.author)) {
      authors = item.author.map((a: string) => {
        const dotIdx = a.indexOf('.');
        return dotIdx >= 0 ? a.substring(dotIdx + 1) : a;
      }).join(', ');
    } else if (typeof item.author === 'string') {
      authors = item.author;
    }
    return {
      id: String(item.infoCode || item.title),
      title: item.title || '',
      orgName: item.orgSName || item.orgName || '',
      author: authors || item.researcher || '',
      publishDate: item.publishDate ? String(item.publishDate).substring(0, 10) : '',
      rating: item.emRatingName || item.sRatingName || '',
      targetPrice: '',
      predictThisYearEps: item.predictThisYearEps || '',
      predictThisYearPe: item.predictThisYearPe || '',
      predictNextYearEps: item.predictNextYearEps || '',
      predictNextYearPe: item.predictNextYearPe || '',
      industry: item.indvInduName || item.industryName || '',
      digest: item.content || item.digest || '',
    };
  });
}

export interface FinanceIndicator {
  reportDate: string;
  reportName: string;
  eps: string;
  bvps: string;
  roe: string;
  revenue: string;
  netProfit: string;
  revenueYoy: string;
  netProfitYoy: string;
  grossMargin: string;
  netMargin: string;
  debtRatio: string;
}

export async function getFinanceData(code: string): Promise<FinanceIndicator[]> {
  const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=REPORT_DATE_NAME,EPSJB,BPS,ROEJQ,TOTALOPERATEREVE,PARENTNETPROFIT,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,XSMLL,XSJLL,ZCFZL&filter=(SECURITY_CODE%3D%22${code}%22)&pageNumber=1&pageSize=5&sortTypes=-1&sortColumns=REPORT_DATE&source=HSF10&client=PC&_=${Date.now()}`;
  const text = await httpClient.fetchText(url, {
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });
  const data = JSON.parse(text);

  const list: any[] = data?.result?.data || [];
  return list.map((item: any) => ({
    reportDate: item['REPORT_DATE_NAME'] || '',
    reportName: item['REPORT_DATE_NAME'] || '',
    eps: item['EPSJB'] != null ? String(item['EPSJB']) : '--',
    bvps: item['BPS'] != null ? String(item['BPS']) : '--',
    roe: item['ROEJQ'] != null ? String(item['ROEJQ']) : '--',
    revenue: item['TOTALOPERATEREVE'] != null ? String(item['TOTALOPERATEREVE']) : '--',
    netProfit: item['PARENTNETPROFIT'] != null ? String(item['PARENTNETPROFIT']) : '--',
    revenueYoy: item['TOTALOPERATEREVETZ'] != null ? String(item['TOTALOPERATEREVETZ']) : '--',
    netProfitYoy: item['PARENTNETPROFITTZ'] != null ? String(item['PARENTNETPROFITTZ']) : '--',
    grossMargin: item['XSMLL'] != null ? String(item['XSMLL']) : '--',
    netMargin: item['XSJLL'] != null ? String(item['XSJLL']) : '--',
    debtRatio: item['ZCFZL'] != null ? String(item['ZCFZL']) : '--',
  }));
}

export interface StockSearchResult {
  code: string;
  name: string;
  market: string;
  type: string;
}

export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=20`;
  const text = await httpClient.fetchText(url, {
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });
  const data = JSON.parse(text);

  const list: any[] = data?.QuotationCodeTable?.Data || [];

  return list
    .filter((item: any) => {
      const code = String(item.Code || '');
      return /^\d{6}$/.test(code);
    })
    .map((item: any) => ({
      code: String(item.Code || ''),
      name: String(item.Name || ''),
      market: String(item.MarketType || ''),
      type: String(item.SecurityTypeName || ''),
    }));
}

export interface HotStock {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  turnoverRate: number;
}

export type HotStockRankType = 'topGainers' | 'topLosers' | 'topTurnover';

export async function getHotStocks(count = 20, rankType: HotStockRankType = 'topGainers'): Promise<HotStock[]> {
  let fid: string;
  let po: string;
  let fields: string;

  switch (rankType) {
    case 'topLosers':
      fid = 'f3';
      po = '0';
      fields = 'f2,f3,f4,f8,f12,f14';
      break;
    case 'topTurnover':
      fid = 'f8';
      po = '1';
      fields = 'f2,f3,f4,f8,f12,f14';
      break;
    case 'topGainers':
    default:
      fid = 'f3';
      po = '1';
      fields = 'f2,f3,f4,f8,f12,f14';
      break;
  }

  const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=${count}&po=${po}&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=${fid}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=${fields}&_=${Date.now()}`;
  const text = await httpClient.fetchText(url, {
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });
  const data = JSON.parse(text);

  const list: any[] = data?.data?.diff || [];
  return list.map((item: any) => ({
    code: String(item.f12 || ''),
    name: String(item.f14 || ''),
    price: Number(item.f2) || 0,
    changePercent: Number(item.f3) || 0,
    changeAmount: Number(item.f4) || 0,
    turnoverRate: Number(item.f8) || 0,
  }));
}

// 指数 secid 映射表：code -> eastmoney secid
const INDEX_SECID_MAP: Record<string, string> = {
  // A股指数
  '000001': '1.000001',   // 上证指数
  '399001': '0.399001',   // 深证成指
  '399006': '0.399006',   // 创业板指
  '000300': '1.000300',   // 沪深300
  '000016': '1.000016',   // 上证50
  '000905': '1.000905',   // 中证500
  '000852': '1.000852',   // 中证1000
  '399005': '0.399005',   // 中小100
  // 港股指数
  'HSI':    '100.HSI',    // 恒生指数
  'HSCEI':  '100.HSCEI',  // 恒生国企指数
  'HSTECH': '100.HSTECH', // 恒生科技指数
  // 北证指数
  '899050': '0.899050',   // 北证50
};

export async function getFullKlineData(code: string, preferStock?: boolean): Promise<DataSeries> {
  let secid: string;
  if (!preferStock && INDEX_SECID_MAP[code]) {
    secid = INDEX_SECID_MAP[code];
  } else {
    const market = detectMarket(code);
    const emMarket = market === 'SH' ? '1' : '0';
    secid = `${emMarket}.${code}`;
  }

  try {
    return await fetchKlineByRange(secid, code, '19900101', '20500101', 60000);
  } catch (firstErr) {
    logger.warn(`getFullKlineData full request failed, splitting into ranges`, (firstErr as Error).message);
  }

  const now = new Date();
  const y = now.getFullYear();
  const ranges: [string, string][] = [
    ['19900101', `${y - 10}1231`],
    [`${y - 9}0101`, `${y - 3}1231`],
    [`${y - 2}0101`, '20500101'],
  ];

  const allPoints: DataPoint[] = [];
  let stockName = code;
  let prevClose = 0;

  for (const [beg, end] of ranges) {
    try {
      const series = await fetchKlineByRange(secid, code, beg, end, 30000);
      if (series.data.length > 0) {
        allPoints.push(...series.data);
        stockName = series.name;
        prevClose = series.prevClose ?? 0;
      }
    } catch (rangeErr) {
      logger.warn(`getFullKlineData range ${beg}-${end} failed`, (rangeErr as Error).message);
    }
  }

  const seen = new Set<string>();
  const deduped = allPoints.filter(p => {
    const key = p.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (deduped.length === 0) {
    throw AppError.network('无法加载完整K线数据，请稍后重试', { code, secid }, true);
  }

  return {
    name: stockName,
    data: deduped,
    color: hashColor(code),
    prevClose,
    type: 'candlestick',
  };
}

async function fetchKlineByRange(secid: string, code: string, beg: string, end: string, timeoutMs: number): Promise<DataSeries> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${beg}&end=${end}&lmt=100000&ut=fa5fd1943c7b386f172d6893dbfba10b&secid=${secid}&_=${Date.now()}`;
  const text = await httpClient.fetchText(url, {
    timeoutMs,
    headers: { 'Referer': 'https://emweb.securities.eastmoney.com' },
  });
  const data = JSON.parse(text);

  const klines: string[] = data?.data?.klines || [];

  if (klines.length === 0) {
    return {
      name: `${data?.data?.name || code} ${code}`,
      data: [],
      color: hashColor(code),
      prevClose: data?.data?.prePrice || 0,
      type: 'candlestick',
    };
  }

  const points: DataPoint[] = klines.map(item => {
    const parts = item.split(',');
    const date = new Date(parts[0]);
    return {
      date,
      value: parseFloat(parts[2] || '0'),
      open: parseFloat(parts[1] || '0'),
      high: parseFloat(parts[3] || '0'),
      low: parseFloat(parts[4] || '0'),
      close: parseFloat(parts[2] || '0'),
      volume: parseFloat(parts[5] || '0'),
      label: `${code} ${parts[0]}`,
    };
  });

  return {
    name: `${data?.data?.name || code} ${code}`,
    data: points,
    color: hashColor(code),
    prevClose: data?.data?.prePrice || 0,
    type: 'candlestick',
  };
}

