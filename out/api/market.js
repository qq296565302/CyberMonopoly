"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isATradingTime = isATradingTime;
exports.isHKTradingTime = isHKTradingTime;
exports.getIndexQuotes = getIndexQuotes;
exports.getMarketDistribution = getMarketDistribution;
exports.getIndustrySectors = getIndustrySectors;
exports.getConceptSectors = getConceptSectors;
exports.getRankStocks = getRankStocks;
const https = __importStar(require("https"));
const marketCache = new Map();
/** 交易时间缓存 TTL：15 秒 */
const TRADING_CACHE_TTL = 15000;
/** 非交易时间缓存 TTL：5 分钟 */
const NON_TRADING_CACHE_TTL = 300000;
/**
 * 判断当前是否为 A 股交易时间
 * 交易时段：工作日 9:15-11:30, 13:00-15:00
 */
function isATradingTime() {
    const now = new Date();
    const day = now.getDay();
    // 周末不交易
    if (day === 0 || day === 6) {
        return false;
    }
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    // 上午交易时段 9:15 - 11:30（含集合竞价）
    if (timeMinutes >= 9 * 60 + 15 && timeMinutes <= 11 * 60 + 30) {
        return true;
    }
    // 下午交易时段 13:00 - 15:00
    if (timeMinutes >= 13 * 60 && timeMinutes <= 15 * 60) {
        return true;
    }
    return false;
}
/**
 * 判断当前是否为港股交易时间
 * 交易时段：工作日 9:30-12:00（上午）, 13:00-16:00（下午）
 */
function isHKTradingTime() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
        return false;
    }
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    // 上午交易时段 9:30 - 12:00
    if (timeMinutes >= 9 * 60 + 30 && timeMinutes <= 12 * 60) {
        return true;
    }
    // 下午交易时段 13:00 - 16:00
    if (timeMinutes >= 13 * 60 && timeMinutes <= 16 * 60) {
        return true;
    }
    return false;
}
/** 获取当前应使用的缓存 TTL（A 股或港股任一处于交易时间即使用短缓存） */
function getCacheTTL() {
    return (isATradingTime() || isHKTradingTime()) ? TRADING_CACHE_TTL : NON_TRADING_CACHE_TTL;
}
function marketFetch(url, timeoutMs = 10000, retries = 3) {
    const cached = marketCache.get(url);
    const ttl = getCacheTTL();
    if (cached && Date.now() - cached.time < ttl) {
        return Promise.resolve(cached.data);
    }
    return new Promise((resolve, reject) => {
        // 用闭包变量追踪当前活跃的 timeout，避免重试时旧 timer 泄露
        let activeTimer = null;
        const attempt = (remaining) => {
            const options = {
                headers: {
                    'Referer': 'https://emweb.securities.eastmoney.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                }
            };
            const req = https.get(url, options, (res) => {
                // HTTP 状态码校验：4xx/5xx 视为请求失败，触发重试
                const statusCode = res.statusCode || 0;
                if (statusCode >= 400) {
                    res.resume(); // 消费响应体以释放 socket
                    if (activeTimer) {
                        clearTimeout(activeTimer);
                        activeTimer = null;
                    }
                    if (remaining > 0) {
                        setTimeout(() => attempt(remaining - 1), 500);
                    }
                    else {
                        reject(new Error(`HTTP ${statusCode}`));
                    }
                    return;
                }
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    if (activeTimer) {
                        clearTimeout(activeTimer);
                        activeTimer = null;
                    }
                    const data = Buffer.concat(chunks);
                    marketCache.set(url, { data, time: Date.now() });
                    resolve(data);
                });
            });
            // 清理上一次重试遗留的 timer，再设置新的
            if (activeTimer) {
                clearTimeout(activeTimer);
            }
            activeTimer = setTimeout(() => {
                activeTimer = null;
                req.destroy();
                if (remaining > 0) {
                    setTimeout(() => attempt(remaining - 1), 500);
                }
                else {
                    reject(new Error(`请求超时 (${timeoutMs}ms)`));
                }
            }, timeoutMs);
            req.on('error', (err) => {
                if (activeTimer) {
                    clearTimeout(activeTimer);
                    activeTimer = null;
                }
                if (remaining > 0) {
                    setTimeout(() => attempt(remaining - 1), 500);
                }
                else {
                    reject(err);
                }
            });
        };
        attempt(retries);
    });
}
const INDEX_CODES = [
    { code: '000001', secid: '1.000001', name: '上证指数' },
    { code: '399001', secid: '0.399001', name: '深证指数' },
    { code: '399006', secid: '0.399006', name: '创业板指' },
    { code: '000688', secid: '1.000688', name: '科创综指' },
    { code: '000300', secid: '1.000300', name: '沪深300' },
    { code: '000510', secid: '1.000510', name: '中证A500' },
    { code: '899050', secid: '0.899050', name: '北证50' },
    { code: 'HSI', secid: '100.HSI', name: '恒生指数' },
    { code: 'HSCEI', secid: '100.HSCEI', name: '恒生国企指数' },
    { code: 'HSTECH', secid: '100.HSTECH', name: '恒生科技指数' },
];
async function getIndexQuotes() {
    const fetchOne = async (idx) => {
        const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${idx.secid}&fields=f43,f169,f170,f57,f58&_=${Date.now()}`;
        const buffer = await marketFetch(url);
        const data = JSON.parse(buffer.toString('utf-8'));
        const d = data?.data;
        if (!d) {
            return null;
        }
        const price = Number(d.f43) || 0;
        const changeAmount = Number(d.f169) || 0;
        const changePercent = Number(d.f170) || 0;
        if (price <= 0 && changePercent === 0 && changeAmount === 0) {
            return null;
        }
        // secid 以 '100.' 开头为港股，其余为 A 股
        // 东方财富 API 不带 fltt 参数时，A 股和港股均返回整数值（*100），统一除以 100
        const market = idx.secid.startsWith('100.') ? 'HK' : 'A';
        return {
            code: idx.code,
            name: idx.name,
            price: price / 100,
            changePercent: changePercent / 100,
            changeAmount: changeAmount / 100,
            market,
        };
    };
    const settled = await Promise.allSettled(INDEX_CODES.map(idx => fetchOne(idx)));
    const results = [];
    for (const item of settled) {
        if (item.status === 'fulfilled' && item.value !== null) {
            results.push(item.value);
        }
    }
    return results;
}
async function getMarketDistribution() {
    // 使用 ulist.np 接口获取涨跌分布（stock/get 接口的 f104-f108 已失效）
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f6,f104,f105,f106,f107,f108&secids=1.000001,0.399106&_=${Date.now()}`;
    let upCount = 0, downCount = 0, flatCount = 0;
    let limitUpCount = 0, limitDownCount = 0;
    let turnover = 0;
    try {
        const buffer = await marketFetch(url);
        const data = JSON.parse(buffer.toString('utf-8'));
        const list = data?.data?.diff || [];
        for (const d of list) {
            upCount += Number(d.f104) || 0;
            downCount += Number(d.f105) || 0;
            flatCount += Number(d.f106) || 0;
            limitUpCount += Number(d.f107) || 0;
            const ld = d.f108;
            if (typeof ld === 'number') {
                limitDownCount += ld;
            }
            turnover += Number(d.f6) || 0;
        }
    }
    catch {
        // skip
    }
    const turnoverDiff = await getTurnoverDiff(turnover);
    return {
        upCount,
        downCount,
        flatCount,
        limitUpCount,
        limitDownCount,
        turnover,
        turnoverDiff,
    };
}
async function getTurnoverDiff(currentTurnover) {
    try {
        const now = new Date();
        const dayOfWeek = now.getDay();
        // 周末不计算差额
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return 0;
        }
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hh}:${mm}`;
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const secids = ['1.000001', '0.399001'];
        let yesterdayTurnoverAtSameTime = 0;
        let hasYesterdayData = false;
        for (const secid of secids) {
            const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=2&_=${Date.now()}`;
            const buffer = await marketFetch(url);
            const data = JSON.parse(buffer.toString('utf-8'));
            const trends = data?.data?.trends || [];
            if (trends.length === 0)
                continue;
            // 按日期分组，避免跨日数据混淆
            const dateGroups = new Map();
            for (const t of trends) {
                const dateStr = t.split(',')[0].split(' ')[0];
                const group = dateGroups.get(dateStr);
                if (group) {
                    group.push(t);
                }
                else {
                    dateGroups.set(dateStr, [t]);
                }
            }
            const dates = Array.from(dateGroups.keys()).sort();
            if (dates.length < 2)
                continue;
            // ndays=2 返回最近2个交易日数据
            // 最后一个日期应为今天（交易日），倒数第二个为昨日
            const todayDate = dates[dates.length - 1];
            const yesterdayDate = dates[dates.length - 2];
            // 仅在今天有数据时才计算差额（节假日后/盘前数据不匹配时跳过）
            if (todayDate !== todayStr)
                continue;
            const yesterdayTrends = dateGroups.get(yesterdayDate);
            if (yesterdayTrends.length === 0)
                continue;
            // 获取同一时刻的昨日成交额
            const yAtSameTime = yesterdayTrends.filter(t => {
                const time = t.split(',')[0].split(' ')[1];
                return time <= currentTime;
            });
            if (yAtSameTime.length === 0)
                continue;
            const yLastParts = yAtSameTime[yAtSameTime.length - 1].split(',');
            yesterdayTurnoverAtSameTime += Number(yLastParts[4]) || 0;
            hasYesterdayData = true;
        }
        if (!hasYesterdayData)
            return 0;
        return currentTurnover - yesterdayTurnoverAtSameTime;
    }
    catch {
        return 0;
    }
}
async function getIndustrySectors(level = 1) {
    const fs = level === 1 ? 'm:90+t:2' : 'm:90+t:3';
    const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=200&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}&fields=f2,f3,f4,f12,f14&_=${Date.now()}`;
    const buffer = await marketFetch(url);
    const data = JSON.parse(buffer.toString('utf-8'));
    const list = data?.data?.diff || [];
    return list.map((item) => ({
        code: String(item.f12 || ''),
        name: String(item.f14 || ''),
        changePercent: Number(item.f3) || 0,
        changeAmount: Number(item.f4) || 0,
        price: Number(item.f2) || 0,
    }));
}
async function getConceptSectors() {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=500&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f2,f3,f4,f12,f14&_=${Date.now()}`;
    const buffer = await marketFetch(url);
    const data = JSON.parse(buffer.toString('utf-8'));
    const list = data?.data?.diff || [];
    return list.map((item) => ({
        code: String(item.f12 || ''),
        name: String(item.f14 || ''),
        changePercent: Number(item.f3) || 0,
        changeAmount: Number(item.f4) || 0,
        price: Number(item.f2) || 0,
    }));
}
async function getRankStocks(rankType, count = 20) {
    let fid;
    let po;
    let extraFields = '';
    switch (rankType) {
        case 'topGainers':
            fid = 'f3';
            po = '1';
            break;
        case 'topLosers':
            fid = 'f3';
            po = '0';
            break;
        case 'topNetInflow':
            fid = 'f62';
            po = '1';
            extraFields = ',f62';
            break;
        case 'topNetOutflow':
            fid = 'f62';
            po = '0';
            extraFields = ',f62';
            break;
        case 'topTurnover':
            fid = 'f6';
            po = '1';
            extraFields = ',f6';
            break;
    }
    const url = `https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=${count}&po=${po}&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=${fid}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f4,f8,f12,f14${extraFields}&_=${Date.now()}`;
    const buffer = await marketFetch(url);
    const data = JSON.parse(buffer.toString('utf-8'));
    const list = data?.data?.diff || [];
    return list.map((item) => ({
        code: String(item.f12 || ''),
        name: String(item.f14 || ''),
        price: Number(item.f2) || 0,
        changePercent: Number(item.f3) || 0,
        changeAmount: Number(item.f4) || 0,
        turnoverRate: Number(item.f8) || 0,
        netInflow: Number(item.f62) || 0,
        turnover: Number(item.f6) || 0,
    }));
}
//# sourceMappingURL=market.js.map