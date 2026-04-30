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
exports.getRealtimeQuote = getRealtimeQuote;
exports.getBatchQuotes = getBatchQuotes;
exports.getIntradayData = getIntradayData;
exports.getKlineData = getKlineData;
exports.get7x24News = get7x24News;
const https = __importStar(require("https"));
const iconv = __importStar(require("iconv-lite"));
function toSinaCode(code) {
    const prefix = code.substring(0, 2);
    if (/^(60|68|51|50|52|56|58)$/.test(prefix))
        return `sh${code}`;
    if (/^(00|30|15|16|18)$/.test(prefix))
        return `sz${code}`;
    if (/^(43|83|87|88|82)$/.test(prefix))
        return `bj${code}`;
    return `sh${code}`;
}
function fetchWithReferer(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Referer': 'https://finance.sina.com.cn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            }
        };
        https.get(url, options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}
async function getRealtimeQuote(code) {
    const url = `https://hq.sinajs.cn/list=${toSinaCode(code)}`;
    const buffer = await fetchWithReferer(url);
    const text = iconv.decode(buffer, 'gbk');
    const match = text.match(/"([^"]+)"/);
    if (!match)
        throw new Error(`解析失败: ${text}`);
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
async function getBatchQuotes(codes) {
    if (codes.length === 0)
        return [];
    const sinaCodes = codes.map(toSinaCode).join(',');
    const url = `https://hq.sinajs.cn/list=${sinaCodes}`;
    const buffer = await fetchWithReferer(url);
    const text = iconv.decode(buffer, 'gbk');
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const results = [];
    for (const line of lines) {
        const match = line.match(/hq_str_(\w+)="([^"]+)"/);
        if (!match)
            continue;
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
async function getIntradayData(code) {
    const tencentCode = toSinaCode(code);
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`;
    const buffer = await fetchWithReferer(url);
    const text = buffer.toString('utf-8');
    const data = JSON.parse(text);
    const stockData = data.data?.[tencentCode] || data.data;
    const prevClose = stockData?.info?.prevclose || data.data?.info?.prevclose || 0;
    const name = stockData?.info?.name || data.data?.info?.name || code;
    const minuteData = stockData?.data?.data || [];
    const points = Array.isArray(minuteData) ? minuteData.map((item) => {
        const parts = item.split(' ');
        const timeStr = parts[0];
        const price = parseFloat(parts[1]) || 0;
        const volume = parseFloat(parts[2]) || 0;
        const hour = timeStr.substring(0, 2);
        const minute = timeStr.substring(2, 4);
        const dateStr = `2025-01-01T${hour}:${minute}:00.000Z`;
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
async function getKlineData(code, days, scale = 240) {
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${toSinaCode(code)}&scale=${scale}&ma=no&datalen=${Math.min(days, 1023)}`;
    const buffer = await fetchWithReferer(url);
    const text = buffer.toString('utf-8');
    const raw = JSON.parse(text);
    const points = raw.map(item => ({
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
function hashColor(str) {
    const colors = [
        [86, 180, 233], [230, 159, 0], [0, 158, 115],
        [204, 121, 167], [213, 94, 0], [240, 228, 66],
    ];
    let sum = 0;
    for (let i = 0; i < str.length; i++)
        sum += str.charCodeAt(i);
    return colors[sum % colors.length];
}
function cleanHtml(html) {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}
async function get7x24News(page = 1, pageSize = 30) {
    const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${page}&page_size=${pageSize}&zhibo_id=152&tag_id=0&dire=b&dpc=1&_=${Date.now()}`;
    const buffer = await fetchWithReferer(url);
    const text = buffer.toString('utf-8');
    const jsonMatch = text.match(/\{.*\}/s);
    if (!jsonMatch)
        throw new Error('解析快讯失败');
    const data = JSON.parse(jsonMatch[0]);
    const list = data.result?.data?.feed?.list || [];
    return list.map((item) => {
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
//# sourceMappingURL=sina.js.map