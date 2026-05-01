import * as https from 'https';
import { detectMarket } from '../models/stock';

const emCache = new Map<string, { data: Buffer; time: number }>();
const CACHE_TTL = 10000;

function emFetch(url: string, timeoutMs = 10000): Promise<Buffer> {
  const cached = emCache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Referer': 'https://emweb.securities.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    };
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`请求超时 (${timeoutMs}ms)`));
    }, timeoutMs);
    const req = https.get(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        const data = Buffer.concat(chunks);
        emCache.set(url, { data, time: Date.now() });
        resolve(data);
      });
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

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
  const buffer = await emFetch(url);
  const text = buffer.toString('utf-8');

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
  const buffer = await emFetch(url);
  const data = JSON.parse(buffer.toString('utf-8'));

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
  const buffer = await emFetch(url);
  const data = JSON.parse(buffer.toString('utf-8'));

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
  const buffer = await emFetch(url);
  const data = JSON.parse(buffer.toString('utf-8'));

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
  const buffer = await emFetch(url);
  const data = JSON.parse(buffer.toString('utf-8'));

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
