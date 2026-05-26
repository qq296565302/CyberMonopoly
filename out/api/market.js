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
const logger_1 = require("../utils/logger");
const marketCache = new Map();
const marketBufCache = new Map();
const TRADING_CACHE_TTL = 15000;
const NON_TRADING_CACHE_TTL = 300000;
function isATradingTime() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
        return false;
    }
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    if (timeMinutes >= 9 * 60 + 15 && timeMinutes <= 11 * 60 + 30) {
        return true;
    }
    if (timeMinutes >= 13 * 60 && timeMinutes <= 15 * 60) {
        return true;
    }
    return false;
}
function isHKTradingTime() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
        return false;
    }
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    if (timeMinutes >= 9 * 60 + 30 && timeMinutes <= 12 * 60) {
        return true;
    }
    if (timeMinutes >= 13 * 60 && timeMinutes <= 16 * 60) {
        return true;
    }
    return false;
}
function getCacheTTL() {
    return (isATradingTime() || isHKTradingTime()) ? TRADING_CACHE_TTL : NON_TRADING_CACHE_TTL;
}
async function marketFetch(url, timeoutMs = 15000, retries = 2) {
    const cached = marketCache.get(url);
    const ttl = getCacheTTL();
    if (cached && Date.now() - cached.time < ttl) {
        return cached.data;
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const text = await new Promise((resolve, reject) => {
                let settled = false;
                const req = https.get(url, {
                    headers: {
                        'Referer': 'https://finance.sina.com.cn/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    },
                    timeout: timeoutMs,
                }, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const redirectUrl = res.headers.location;
                        res.resume();
                        marketFetch(redirectUrl, timeoutMs, 0).then(resolve, reject);
                        return;
                    }
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        res.resume();
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        settled = true;
                        resolve(Buffer.concat(chunks).toString('utf-8'));
                    });
                    res.on('error', (err) => {
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    });
                });
                req.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        reject(err);
                    }
                });
                req.on('timeout', () => {
                    if (!settled) {
                        settled = true;
                        req.destroy();
                        reject(new Error('请求超时'));
                    }
                });
            });
            marketCache.set(url, { data: text, time: Date.now() });
            return text;
        }
        catch (e) {
            const msg = e?.message || '';
            const isSocketError = msg.includes('socket hang up') ||
                msg.includes('ECONNRESET') ||
                msg.includes('ECONNREFUSED') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('请求超时');
            if (isSocketError && attempt < retries) {
                logger_1.logger.debug(`[marketFetch] retry ${attempt + 1}/${retries}: ${url} - ${msg}`);
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            throw e;
        }
    }
    throw new Error('marketFetch: exhausted retries');
}
async function marketFetchBuf(url, timeoutMs = 15000, retries = 2) {
    const cached = marketBufCache.get(url);
    const ttl = getCacheTTL();
    if (cached && Date.now() - cached.time < ttl) {
        return cached.data;
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const buf = await new Promise((resolve, reject) => {
                let settled = false;
                const req = https.get(url, {
                    headers: {
                        'Referer': 'https://finance.sina.com.cn/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    },
                    timeout: timeoutMs,
                }, (res) => {
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        res.resume();
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        settled = true;
                        resolve(Buffer.concat(chunks));
                    });
                    res.on('error', (err) => {
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    });
                });
                req.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        reject(err);
                    }
                });
                req.on('timeout', () => {
                    if (!settled) {
                        settled = true;
                        req.destroy();
                        reject(new Error('请求超时'));
                    }
                });
            });
            marketBufCache.set(url, { data: buf, time: Date.now() });
            return buf;
        }
        catch (e) {
            const msg = e?.message || '';
            const isSocketError = msg.includes('socket hang up') ||
                msg.includes('ECONNRESET') ||
                msg.includes('ECONNREFUSED') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('请求超时');
            if (isSocketError && attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            throw e;
        }
    }
    throw new Error('marketFetchBuf: exhausted retries');
}
const A_INDEX_CODES = [
    { code: '000001', sinaPrefix: 'sh', name: '上证指数' },
    { code: '399001', sinaPrefix: 'sz', name: '深证成指' },
    { code: '399006', sinaPrefix: 'sz', name: '创业板指' },
    { code: '000688', sinaPrefix: 'sh', name: '科创50' },
    { code: '000300', sinaPrefix: 'sh', name: '沪深300' },
    { code: '000510', sinaPrefix: 'sh', name: '中证A500' },
    { code: '899050', sinaPrefix: 'bj', name: '北证50' },
];
const HK_INDEX_CODES = [
    { code: 'HSI', tencentKey: 'r_hkHSI', name: '恒生指数' },
    { code: 'HSCEI', tencentKey: 'r_hkHSCEI', name: '恒生国企指数' },
    { code: 'HSTECH', tencentKey: 'r_hkHSTECH', name: '恒生科技指数' },
];
async function getIndexQuotes() {
    const results = [];
    try {
        const sinaCodes = A_INDEX_CODES.map(idx => `${idx.sinaPrefix}${idx.code}`).join(',');
        const url = `https://hq.sinajs.cn/list=${sinaCodes}`;
        const buf = await marketFetchBuf(url);
        const text = new TextDecoder('gbk').decode(buf);
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const m = line.match(/hq_str_(\w+)="(.*)"/);
            if (!m)
                continue;
            const sinaCode = m[1];
            const raw = m[2];
            if (!raw)
                continue;
            const f = raw.split(',');
            const name = f[0] || '';
            const price = parseFloat(f[3]) || 0;
            const prevClose = parseFloat(f[2]) || 0;
            const codeMatch = A_INDEX_CODES.find(idx => sinaCode === `${idx.sinaPrefix}${idx.code}`);
            if (!codeMatch)
                continue;
            const changeAmount = price > 0 && prevClose > 0 ? price - prevClose : 0;
            const changePercent = prevClose > 0 && price > 0 ? (changeAmount / prevClose * 100) : 0;
            results.push({
                code: codeMatch.code,
                name: name || codeMatch.name,
                price,
                changePercent,
                changeAmount,
                market: 'A',
            });
        }
    }
    catch (e) {
        logger_1.logger.error('[指数行情] 新浪A股接口失败', e);
    }
    try {
        const tencentKeys = HK_INDEX_CODES.map(idx => idx.tencentKey).join(',');
        const url = `https://qt.gtimg.cn/q=${tencentKeys}`;
        const text = await marketFetch(url);
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const m = line.match(/v_r_(\w+)="(.*)"/);
            if (!m)
                continue;
            const key = m[1];
            const raw = m[2];
            if (!raw)
                continue;
            const f = raw.split('~');
            const hkMatch = HK_INDEX_CODES.find(idx => idx.tencentKey === `r_hk${key}` || key === idx.tencentKey.replace('r_', ''));
            if (!hkMatch)
                continue;
            const price = parseFloat(f[3]) || 0;
            const prevClose = parseFloat(f[4]) || 0;
            const changePercent = parseFloat(f[32]) || 0;
            const changeAmount = parseFloat(f[31]) || 0;
            results.push({
                code: hkMatch.code,
                name: f[1] || hkMatch.name,
                price,
                changePercent,
                changeAmount,
                market: 'HK',
            });
        }
    }
    catch (e) {
        logger_1.logger.error('[指数行情] 腾讯港股接口失败', e);
    }
    return results;
}
function getLimitPct(code, name) {
    if (name.startsWith('ST') || name.startsWith('*ST'))
        return 5;
    if (code.startsWith('688'))
        return 20;
    if (code.startsWith('300'))
        return 20;
    if (code.startsWith('8') || code.startsWith('4'))
        return 30;
    return 10;
}
function isLimitUp(price, prevClose, code, name) {
    if (!prevClose || prevClose <= 0 || !price || price <= 0)
        return false;
    const limit = getLimitPct(code, name) / 100;
    const limitPrice = Math.round(prevClose * (1 + limit) * 100) / 100;
    return price >= limitPrice - 0.005;
}
function isLimitDown(price, prevClose, code, name) {
    if (!prevClose || prevClose <= 0 || !price || price <= 0)
        return false;
    const limit = getLimitPct(code, name) / 100;
    const limitPrice = Math.round(prevClose * (1 - limit) * 100) / 100;
    return price <= limitPrice + 0.005;
}
async function fetchSinaStockPage(node, page, num, sort, asc) {
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=${num}&sort=${sort}&asc=${asc}&node=${node}&_s_r_a=auto`;
    const text = await marketFetch(url);
    try {
        return JSON.parse(text);
    }
    catch {
        return [];
    }
}
async function getMarketDistribution() {
    let upCount = 0, downCount = 0, flatCount = 0;
    let limitUpCount = 0, limitDownCount = 0;
    let turnover = 0;
    try {
        const PAGE_SIZE = 80;
        const firstPage = await fetchSinaStockPage('hs_a', 1, PAGE_SIZE, 'changepercent', 0);
        if (firstPage.length === 0) {
            logger_1.logger.warn('[涨跌分布] 新浪接口返回空数据');
            return { upCount: 0, downCount: 0, flatCount: 0, limitUpCount: 0, limitDownCount: 0, turnover: 0, turnoverDiff: 0 };
        }
        const processItem = (item) => {
            const pct = item.changepercent || 0;
            const price = parseFloat(item.trade) || 0;
            const prevClose = parseFloat(item.settlement) || 0;
            const code = item.code || '';
            if (pct > 0)
                upCount++;
            else if (pct < 0)
                downCount++;
            else
                flatCount++;
            if (isLimitUp(price, prevClose, code, item.name))
                limitUpCount++;
            if (isLimitDown(price, prevClose, code, item.name))
                limitDownCount++;
            turnover += item.amount || 0;
        };
        for (const item of firstPage) {
            processItem(item);
        }
        const totalPages = Math.ceil(5500 / PAGE_SIZE);
        const pagePromises = [];
        for (let pn = 2; pn <= totalPages; pn++) {
            pagePromises.push(fetchSinaStockPage('hs_a', pn, PAGE_SIZE, 'changepercent', 0)
                .then(pageData => {
                for (const item of pageData) {
                    processItem(item);
                }
            })
                .catch(() => { }));
        }
        await Promise.allSettled(pagePromises);
        logger_1.logger.debug(`[涨跌分布] 新浪接口统计: up=${upCount} down=${downCount} flat=${flatCount} limitUp=${limitUpCount} limitDown=${limitDownCount} turnover=${turnover}`);
    }
    catch (e) {
        logger_1.logger.error('[涨跌分布] API调用失败', e);
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
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return 0;
        }
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const timeMinutes = hours * 60 + minutes;
        if (timeMinutes < 9 * 60 + 30)
            return 0;
        let elapsedTradingMinutes;
        if (timeMinutes <= 11 * 60 + 30) {
            elapsedTradingMinutes = timeMinutes - (9 * 60 + 30);
        }
        else if (timeMinutes <= 13 * 60) {
            elapsedTradingMinutes = 120;
        }
        else if (timeMinutes <= 15 * 60) {
            elapsedTradingMinutes = 120 + (timeMinutes - 13 * 60);
        }
        else {
            elapsedTradingMinutes = 240;
        }
        const timeProportion = elapsedTradingMinutes / 240;
        const indexCodes = ['sh000001', 'sz399001'];
        let todayIndexAmount = 0;
        let todayIndexVolume = 0;
        let yesterdayIndexVolume = 0;
        for (const code of indexCodes) {
            const minuteUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
            const buf = await marketFetchBuf(minuteUrl);
            const text = buf.toString('utf-8');
            const data = JSON.parse(text);
            const stockData = data.data?.[code];
            if (!stockData)
                continue;
            const minuteData = stockData.data?.data || [];
            if (minuteData.length > 0) {
                const lastParts = minuteData[minuteData.length - 1].split(' ');
                todayIndexVolume += parseFloat(lastParts[2]) || 0;
                todayIndexAmount += parseFloat(lastParts[3]) || 0;
            }
            const klineUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?code=${code}&_var=kline_day&param=${code},day,,,3,qfq`;
            const klineText = await marketFetch(klineUrl);
            const jsonMatch = klineText.match(/\{.*\}/s);
            if (jsonMatch) {
                const klineData = JSON.parse(jsonMatch[0]);
                const dayArr = klineData.data?.[code]?.day || klineData.data?.[code]?.qfqday;
                if (dayArr && dayArr.length >= 2) {
                    const yesterdayEntry = dayArr[dayArr.length - 2];
                    yesterdayIndexVolume += parseFloat(yesterdayEntry[5]) || 0;
                }
            }
        }
        if (todayIndexVolume === 0 || todayIndexAmount === 0)
            return 0;
        const avgPricePerVol = todayIndexAmount / todayIndexVolume;
        const yesterdayIndexAmount = yesterdayIndexVolume * avgPricePerVol;
        const yesterdayAmountAtSameTime = yesterdayIndexAmount * timeProportion;
        const ratio = currentTurnover / todayIndexAmount;
        return Math.round(currentTurnover - yesterdayAmountAtSameTime * ratio);
    }
    catch {
        return 0;
    }
}
function decodeGbkBuffer(buf) {
    try {
        return new TextDecoder('gbk').decode(buf);
    }
    catch {
        return buf.toString('utf-8');
    }
}
async function fetchSinaSectors(param) {
    const url = `https://money.finance.sina.com.cn/q/view/newFLJK.php?param=${param}`;
    const buf = await marketFetchBuf(url);
    const text = decodeGbkBuffer(buf);
    const varMatch = text.match(/=\s*(\{.*\})/s);
    if (!varMatch)
        return [];
    try {
        const obj = JSON.parse(varMatch[1]);
        const results = [];
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val !== 'string')
                continue;
            const parts = val.split(',');
            if (parts.length < 6)
                continue;
            const name = parts[1] || '';
            const avgPrice = parseFloat(parts[3]) || 0;
            const avgChange = parseFloat(parts[4]) || 0;
            const changePercent = parseFloat(parts[5]) || 0;
            results.push({
                code: key,
                name,
                changePercent,
                changeAmount: avgChange,
                price: avgPrice,
            });
        }
        return results.sort((a, b) => b.changePercent - a.changePercent);
    }
    catch {
        return [];
    }
}
async function getIndustrySectors(level = 1) {
    const param = level === 1 ? 'industry' : 'industry2';
    try {
        return await fetchSinaSectors(param);
    }
    catch (e) {
        logger_1.logger.error('[行业板块] API调用失败', e);
        return [];
    }
}
async function getConceptSectors() {
    try {
        return await fetchSinaSectors('class');
    }
    catch (e) {
        logger_1.logger.error('[概念板块] API调用失败', e);
        return [];
    }
}
async function getRankStocks(rankType, count = 20) {
    try {
        let sort;
        let asc;
        switch (rankType) {
            case 'topGainers':
                sort = 'changepercent';
                asc = 0;
                break;
            case 'topLosers':
                sort = 'changepercent';
                asc = 1;
                break;
            case 'topNetInflow':
            case 'topNetOutflow':
                sort = 'amount';
                asc = rankType === 'topNetOutflow' ? 1 : 0;
                break;
            case 'topTurnover':
                sort = 'amount';
                asc = 0;
                break;
        }
        const items = await fetchSinaStockPage('hs_a', 1, count, sort, asc);
        return items.map((item) => ({
            code: item.code || '',
            name: item.name || '',
            price: parseFloat(item.trade) || 0,
            changePercent: item.changepercent || 0,
            changeAmount: item.pricechange || 0,
            turnoverRate: item.turnoverratio || 0,
            netInflow: 0,
            turnover: item.amount || 0,
        }));
    }
    catch (e) {
        logger_1.logger.error('[排行] API调用失败', e);
        return [];
    }
}
//# sourceMappingURL=market.js.map