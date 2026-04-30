# 赛博大富翁 — VSCode 插件开发文档

> **产品**: VSCode Extension | **目标用户**: 上班摸鱼的程序员
> 
> 本文档是完整的插件开发规格书，AI 助手或开发者可据此独立完成开发。

---

## 一、产品定义

### 1.1 一句话描述

藏在 VSCode 编辑器里的 A 股行情工具。看起来像在写代码，实际上在看盘、聊 AI、刷快讯。

### 1.2 核心功能

| 功能 | 摸鱼场景 | 隐蔽性 |
|------|----------|--------|
| 自选股实时行情 | 侧边栏树形列表，像项目文件结构 | ⭐⭐⭐⭐⭐ |
| K线图 / 分时图 | Webview 面板，像预览窗口 | ⭐⭐⭐⭐ |
| 7x24 快讯滚动 | 侧边栏列表 + 状态栏 ticker | ⭐⭐⭐⭐⭐ |
| AI 助手聊天 | Webview 面板，像终端/输出 | ⭐⭐⭐⭐ |
| 价格异动 Toast | VSCode 原生通知，混在编译提示里 | ⭐⭐⭐⭐⭐ |

### 1.3 设计原则

1. **零外部依赖** — 不启动额外进程，纯 VSCode 扩展
2. **外观融入** — UI 风格与 VSCode 原生组件一致
3. **快捷键优先** — 所有操作可通过键盘完成，不用鼠标切面板
4. **数据本地缓存** — 断网也能看上次数据
5. **配置灵活** — LLM API、刷新间隔等均可自定义

---

## 二、技术选型

### 2.1 技术栈

| 层级 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js (VSCode 内置) | 无需额外安装 |
| 语言 | TypeScript | 类型安全，VSCode 扩展标准 |
| 构建工具 | esbuild / webpack | 官方推荐 |
| 框架 | 无 (原生 VSCode API) | 轻量，无运行时开销 |
| 图表库 | lightweight-charts (TradingView) | 专业K线库，体积小 (~100KB) |
| HTTP | Node.js fetch / axios | 调用新浪 API |
| 存储 | VSCode globalState / workspaceState | 跨会话持久化 |
| 测试 | @vscode/test-electron + mocha | 官方测试方案 |

### 2.2 为什么不选其他方案

| 方案 | 弊端 |
|------|------|
| React Webview | bundle 大(~500KB+)，加载慢 |
| Electron 独立应用 | 太显眼，老板一眼看出 |
| VSCode Webview 用 Vue/React | 过度工程化，这个场景不需要 |
| 纯 TUI (ratatui) | 终端模式不够隐蔽 |

---

## 三、项目结构

```
cyber-monopoly-vscode/
├── package.json                    # 插件清单 (命令/视图/配置/激活事件)
├── tsconfig.json
├── .vscodeignore
├── src/
│   ├── extension.ts                # activate/deactivate 入口
│   │
│   ├── api/
│   │   └── sina.ts                 # 新浪财经 API 客户端
│   │
│   ├── models/
│   │   ├── stock.ts                # WatchStock, Market, RealtimeQuote
│   │   ├── news.ts                 # NewsItem
│   │   └── chart.ts                # DataPoint, DataSeries
│   │
│   ├── provider/
│   │   ├── watchlistProvider.ts    # TreeDataProvider: 自选股侧边栏
│   │   ├── newsProvider.ts         # TreeDataProvider: 快讯侧边栏
│   │   └── quoteDecoration.ts      # DecorationProvider: 行情内联显示
│   │
│   ├── webview/
│   │   ├── overviewPanel.ts        # 行情概览面板
│   │   ├── chartPanel.ts           # K线/分时图面板
│   │   ├── newsPanel.ts            # 快讯详情面板
│   │   ├── aiChatPanel.ts          # AI聊天面板
│   │   └── settingsPanel.ts        # 设置面板
│   │
│   ├── webviews/                   # Webview HTML/CSS/JS (静态资源)
│   │   ├── overview/
│   │   │   ├── index.html
│   │   │   ├── style.css
│   │   │   └── index.js
│   │   ├── chart/
│   │   │   ├── index.html          # 引入 lightweight-charts CDN 或打包
│   │   │   ├── style.css
│   │   │   └── index.js
│   │   ├── ai-chat/
│   │   │   ├── index.html
│   │   │   ├── style.css
│   │   │   └── index.js
│   │   └── shared/
│   │       └── vscode-api.js       # acquireVsCodeApi bridge
│   │
│   ├── chat/
│   │   ├── llmClient.ts            # OpenAI 兼容 API 客户端
│   │   └── commandParser.ts        # 自然语言 → 操作解析
│   │
│   ├── commands/
│   │   ├── watchlist.ts            # add/remove/list/show 命令处理
│   │   ├── chart.ts               # 打开K线图命令
│   │   ├── news.ts                # 刷新快讯命令
│   │   └── ai.ts                  # AI 相关命令
│   │
│   ├── statusbar/
│   │   └── stockTicker.ts          # 状态栏股票行情滚动条
│   │
│   ├── notification/
│   │   └── alert.ts               # 价格异动检测 & 通知
│   │
│   └── storage/
│       └── stateManager.ts         # VSCode state 封装
│
├── assets/
│   ├── icon.svg                    # Activity Bar 图标
│   └── icons/                      # TreeItem 图标 (涨/跌/平)
│
├── .vscode/
│   ├── launch.json                 # 调试配置
│   └── tasks.json                  # 编译任务
│
├── test/
│   ├── suite/
│   │   ├── extension.test.ts
│   │   └── api/sina.test.ts
│   └── runTest.ts
│
└── README.md                       # 用户使用文档
```

---

## 四、数据源 API 文档

本插件所有数据来自 **新浪财经公开接口**（无需 API Key）。

### 4.1 实时行情

```
GET https://hq.sinajs.cn/list={sina_code}
Header: Referer: https://finance.sina.com.cn
```

**代码转换规则**:

```typescript
function toSinaCode(code: string): string {
  const prefix = code.substring(0, 2);
  if (/^(60|68|51|50|52|56|58)$/.test(prefix)) return `sh${code}`;
  if (/^(00|30|15|16|18)$/.test(prefix)) return `sz${code}`;
  if (/^(43|83|87|88|82)$/.test(prefix)) return `bj${code}`;
  return `sh${code}`; // 默认上海
}
```

**响应格式** (文本，非 JSON):
```
var hq_str_sh600519="贵州茅台,1688.00,1672.00,1690.00,1705.00,1660.00,1680.00,1690.00,...,2026-04-29,15:00:00";
```

**字段解析** (逗号分隔):

| Index | 字段名 | 类型 | 说明 |
|-------|--------|------|------|
| 0 | name | string | 股票名称 |
| 1 | open | float | 今开价 |
| 2 | prev_close | float | 昨收价 |
| 3 | price | float | 当前价 |
| 4 | high | float | 最高价 |
| 5 | low | float | 最低价 |
| 6 | bid | float | 买一价 |
| 7 | ask | float | 卖一价 |
| 8 | volume | float | 成交量(手) |
| 30 | date | string | 日期 "2026-04-29" |
| 31 | time | string | 时间 "15:00:00" |

**计算字段**:
```typescript
change_amount = price - prev_close;
change_percent = (change_amount / prev_close) * 100;  // 涨跌幅%
```

**TypeScript 解析实现**:

> **⚠️ 编码注意**: 新浪行情接口返回 **GBK 编码** 的文本，Node.js 中需要使用 `iconv-lite` 库转换，或在浏览器端使用 `TextDecoder('gbk')`。

```typescript
// 浏览器端 GBK 解码
function decodeGBK(buffer: ArrayBuffer): string {
  // 使用 TextDecoder (需要浏览器支持)
  return new TextDecoder('gbk').decode(buffer);
}

// Node.js 端 GBK 解码 (使用 iconv-lite)
import * as iconv from 'iconv-lite';
const text = iconv.decode(buffer, 'gbk');

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

export async function getRealtimeQuote(code: string): Promise<RealtimeQuote> {
  const url = `https://hq.sinajs.cn/list=${toSinaCode(code)}`;
  const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }});
  const text = await resp.text();
  
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
```

> **⚠️ 非交易时段注意**: 在开盘前 (9:15-9:25 集合竞价前)、午休 (11:30-13:00)、收盘后 (15:00+)，`当前价/今开/最高/最低/成交量` 等字段可能为 `0`。此时应使用 `昨收价` 作为参考价格，`买一价/卖一价` 可能仍有值。

### 4.1.1 批量行情查询

新浪接口支持逗号分隔多个代码一次性请求，大幅减少 HTTP 调用次数。

```typescript
// 批量获取多只股票行情
export async function getBatchQuotes(codes: string[]): Promise<RealtimeQuote[]> {
  if (codes.length === 0) return [];
  
  const sinaCodes = codes.map(toSinaCode).join(',');
  const url = `https://hq.sinajs.cn/list=${sinaCodes}`;
  const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }});
  const text = await resp.text();
  
  // 响应格式: 多行 var hq_str_xxx="...";
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
```

> **性能提示**: 10 只股票批量请求只需 1 次 HTTP 调用，比逐个请求快 10 倍。建议单次不超过 20 只。

### 4.2 K线数据 (日线)

```
GET https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={sina_code}&scale=240&ma=no&datalen={days}
Header: Referer: https://finance.sina.com.cn
```

**scale 参数**:

| scale | 含义 | 适用场景 |
|-------|------|----------|
| 240 | 日线 | 默认 |
| 60 | 60分钟线 | 分时 |
| 30 | 30分钟线 | 分时 |
| 15 | 15分钟线 | 分时 |
| 5 | 5分钟线 | 分时 |
| 1 | 1分钟线 | 分时 |

**datalen**: 最大 1023 条

**响应格式** (JSONP):
```
var _data=([{"day":"2026-04-29","open":"1680.00","high":"1705.00","low":"1660.00","close":"1690.00","volume":"123456"},{"day":"2026-04-28","open":"1670.00","high":"1685.00","low":"1665.00","close":"1672.00","volume":"98765"},...]);
```

> **注意**: 响应被 `var _data=(` 和 `);` 包裹，内部是标准 JSON 数组。括号 `()` 是 JSONP 包装，需剥离后才能解析。

**TypeScript 解析**:

```typescript
export interface DataPoint {
  date: Date;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  label: string;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color: [number, number, number];
  prevClose?: number;
  type: 'line' | 'candlestick';
}

interface KlineRaw {
  day: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

export async function getKlineData(code: string, days: number): Promise<DataSeries> {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${toSinaCode(code)}&scale=240&ma=no&datalen=${Math.min(days, 1023)}`;
  const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }});
  const text = await resp.text();
  
  // K线 API 直接返回纯 JSON 数组，无需剥离 JSONP
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
```

### 4.3 7x24 快讯

```
GET https://zhibo.sina.com.cn/api/zhibo/feed?page={page}&page_size={size}&zhibo_id=152&tag_id=0&dire=b&dpc=1&_={timestamp}
Headers:
  Referer: https://finance.sina.com.cn/7x24/
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

**响应格式** (jQuery callback 包装):
```
jQuery0({"result":{"data":{"feed":{"list":[{"id":"xxx","rich_text":"<p>内容</p>","create_time":"2026-04-29 14:30:00","tag":"重要"}]}}}})
```

**TypeScript 解析**:

```typescript
export interface NewsItem {
  id: string;
  title: string;
  content: string;
  createTime: string;
  tag?: string; // 从 tag 数组中提取第一个 name
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
  const resp = await fetch(url, {
    headers: {
      'Referer': 'https://finance.sina.com.cn/7x24/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }
  });
  const text = await resp.text();
  
  // 提取 JSON 对象
  const jsonMatch = text.match(/\{.*\}/s);
  if (!jsonMatch) throw new Error('解析快讯失败');
  
  const data = JSON.parse(jsonMatch[0]);
  const list = data.result?.data?.feed?.list || [];
  
  return list.map((item: any) => {
    const content = cleanHtml(item.rich_text || '');
    // tag 是数组格式: [{"id":"3","name":"公司"}]，取第一个 name
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
```

---

## 五、数据模型

### 5.1 自选股

```typescript
// models/stock.ts

export enum Market {
  SH = 'SH',   // 上海 (60xxxx, 68xxxx, 51xxxx...)
  SZ = 'SZ',   // 深圳 (00xxxx, 30xxxx, 15xxxx...)
  BJ = 'BJ',   // 北交所 (43xxxx, 83xxxx, 87xxxx...)
  HK = 'HK',   // 港股
  US = 'US',   // 美股
}

export function detectMarket(code: string): Market {
  const p = code.substring(0, 2);
  if (/^(60|68|51|50|52|56|58|11)$/.test(p)) return Market.SH;
  if (/^(00|30|12|15|16|18)$/.test(p)) return Market.SZ;
  if (/^(43|83|87|88|82|4|8)$/.test(p)) return Market.BJ;
  if (/^[a-zA-Z]/.test(code.charAt(0))) return Market.US;
  return Market.SH;
}

export interface WatchStock {
  code: string;          // 纯数字代码 "600519"
  name: string;          // 名称 "贵州茅台"
  market: Market;        // 自动推断
  addedAt: number;       // 添加时间戳
  notes?: string;        // 备注
  alertPrice?: number;   // 预警价格 (可选)
  alertPercent?: number; // 预警涨跌幅% (可选)
}
```

### 5.2 快讯

```typescript
// models/news.ts

export interface NewsItem {
  id: string;
  title: string;         // 前100字符
  content: string;       // 完整内容 (HTML已清理)
  createTime: string;    // "2026-04-29 14:30:00"
  tag?: string;          // 标签
  fetchedAt?: number;    // 本地抓取时间戳
  read?: boolean;        // 是否已读
}
```

### 5.3 图表数据

```typescript
// models/chart.ts

export interface DataPoint {
  date: Date;
  value: number;
  open?: number;         // 开盘价 (K线用)
  high?: number;         // 最高价 (K线用)
  low?: number;          // 最低价 (K线用)
  close?: number;        // 收盘价 (K线用)
  volume?: number;       // 成交量
  label: string;
}

export interface DataSeries {
  name: string;          // "贵州茅台 600519"
  data: DataPoint[];
  color: [number, number, number];  // RGB
  prevClose?: number;
  type: 'line' | 'candlestick';     // 折线 or K线
}
```

---

## 六、package.json 完整配置

```json
{
  "name": "cyber-monopoly",
  "displayName": "赛博大富翁",
  "description": "A-share market tool hidden in your editor. Perfect for... coding.",
  "version": "1.0.0",
  "publisher": "your-publisher-name",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [
    "onView:cyberMonopolyWatchlist",
    "onView:cyberMonopolyNews",
    "onCommand:cyberMonopoly.showOverview",
    "onCommand:cyberMonopoly.openChart",
    "onCommand:cyberMonopoly.openAiChat",
    "onCommand:cyberMonopoly.addToWatchlist",
    "onCommand:cyberMonopoly.refreshQuotes",
    "onCommand:cyberMonopoly.refreshNews",
    "onCommand:cyberMonopoly.toggleStatusBar",
    "onCommand:cyberMonopoly.openSettings"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "cyberMonopoly.showOverview",
        "title": "查看行情概览",
        "category": "赛博大富翁",
        "icon": "$(chart-line)"
      },
      {
        "command": "cyberMonopoly.openChart",
        "title": "打开K线图",
        "category": "赛博大富翁",
        "icon": "$(graph)"
      },
      {
        "command": "cyberMonopoly.refreshQuotes",
        "title": "刷新行情",
        "category": "赛博大富翁",
        "icon": "$(refresh)"
      },
      {
        "command": "cyberMonopoly.addToWatchlist",
        "title": "添加自选股...",
        "category": "赛博大富翁",
        "icon": "$(add)"
      },
      {
        "command": "cyberMonopoly.removeFromWatchlist",
        "title": "移除自选股",
        "category": "赛博大富翁"
      },
      {
        "command": "cyberMonopoly.refreshNews",
        "title": "刷新快讯",
        "category": "赛博大富翁",
        "icon": "$(refresh)"
      },
      {
        "command": "cyberMonopoly.openAiChat",
        "title": "AI助手",
        "category": "赛博大富翁",
        "icon": "$(comment-discussion)"
      },
      {
        "command": "cyberMonopoly.openSettings",
        "title": "设置",
        "category": "赛博大富翁",
        "icon": "$(settings-gear)"
      },
      {
        "command": "cyberMonopoly.toggleStatusBar",
        "title": "切换状态栏行情",
        "category": "赛博大富翁"
      }
    ],

    "keybindings": [
      {
        "command": "cyberMonopoly.showOverview",
        "key": "ctrl+shift+q",
        "mac": "cmd+shift+q"
      },
      {
        "command": "cyberMonopoly.openAiChat",
        "key": "ctrl+shift+a",
        "mac": "cmd+shift+a"
      },
      {
        "command": "cyberMonopoly.refreshQuotes",
        "key": "f5",
        "when": "cyberMonopoly:focus"
      }
    ],

    "menus": {
      "view/title": [
        {
          "command": "cyberMonopoly.refreshQuotes",
          "when": "view == cyberMonopolyWatchlist",
          "group": "navigation"
        },
        {
          "command": "cyberMonopoly.addToWatchlist",
          "when": "view == cyberMonopolyWatchlist",
          "group": "navigation"
        },
        {
          "command": "cyberMonopoly.refreshNews",
          "when": "view == cyberMonopolyNews",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "cyberMonopoly.openChart",
          "when": "view == cyberMonopolyWatchlist && viewItem == stock",
          "group": "inline"
        },
        {
          "command": "cyberMonopoly.removeFromWatchlist",
          "when": "view == cyberMonopolyWatchlist && viewItem == stock",
          "group": "inline"
        }
      ]
    },

    "viewsContainers": {
      "activitybar": [{
        "id": "cyberMonopoly-sidebar",
        "title": "赛博",
        "icon": "assets/icon.svg"
      }]
    },

    "views": {
      "cyberMonopoly-sidebar": [
        {
          "type": "tree",
          "id": "cyberMonopolyWatchlist",
          "name": "自选股",
          "icon": "$(heart)",
          "contextualTitle": "自选股",
          "when": "cyberMonopoly:enabled"
        },
        {
          "type": "tree",
          "id": "cyberMonopolyNews",
          "name": "快讯",
          "icon": "$(rss)",
          "contextualTitle": "7x24快讯",
          "when": "cyberMonopoly:enabled"
        }
      ]
    },

    "configuration": {
      "title": "赛博大富翁",
      "properties": {
        "cyberMonopoly.llm.apiEndpoint": {
          "type": "string",
          "default": "https://api.edgefn.net/v1",
          "description": "LLM API 地址 (OpenAI兼容格式)"
        },
        "cyberMonopoly.llm.apiKey": {
          "type": "string",
          "default": "",
          "description": "LLM API 密钥"
        },
        "cyberMonopoly.llm.model": {
          "type": "string",
          "default": "DeepSeek-R1-0528-Qwen3-8B",
          "description": "LLM 模型名称"
        },
        "cyberMonopoly.llm.temperature": {
          "type": "number",
          "default": 0.7,
          "minimum": 0,
          "maximum": 2,
          "description": "LLM 温度参数"
        },
        "cyberMonopoly.refreshInterval": {
          "type": "number",
          "default": 30,
          "minimum": 5,
          "maximum": 300,
          "description": "自动刷新间隔 (秒)"
        },
        "cyberMonopoly.newsRefreshInterval": {
          "type": "number",
          "default": 120,
          "minimum": 30,
          "maximum": 600,
          "description": "快讯刷新间隔 (秒)"
        },
        "cyberMonopoly.showStatusBar": {
          "type": "boolean",
          "default": true,
          "description": "是否显示状态栏行情滚动条"
        },
        "cyberMonopoly.defaultStocks": {
          "type": "array",
          "default": ["600519", "000001"],
          "items": { "type": "string" },
          "description": "默认自选股列表"
        },
        "cyberMonopoly.colorTheme": {
          "type": "string",
          "enum": ["red-up-green-down", "green-up-red-down"],
          "default": "red-up-green-down",
          "description": "涨跌颜色 (A股红涨绿跌 / 国际绿涨红跌)"
        }
      }
    }
  }
}
```

---

## 七、核心模块实现规范

### 7.1 扩展入口 (extension.ts)

```typescript
import * as vscode from 'vscode';
import { WatchlistProvider } from './provider/watchlistProvider';
import { NewsProvider } from './provider/newsProvider';
import { StockTicker } from './statusbar/stockTicker';
import { StateManager } from './storage/stateManager';

let watchlistProvider: WatchlistProvider;
let newsProvider: NewsProvider;
let stockTicker: StockTicker;
let refreshTimer: NodeJS.Timer;
let newsTimer: NodeJS.Timer;

export async function activate(context: vscode.ExtensionContext) {
  const stateManager = new StateManager(context.globalState);

  // 初始化 providers
  watchlistProvider = new WatchlistProvider(stateManager);
  newsProvider = new NewsProvider(stateManager);

  // 注册侧边栏
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'cyberMonopolyWatchlist',
      watchlistProvider
    ),
    vscode.window.registerTreeDataProvider(
      'cyberMonopolyNews',
      newsProvider
    )
  );

  // 注册命令
  registerCommands(context, stateManager);

  // 状态栏
  stockTicker = new StockTicker(watchlistProvider);
  context.subscriptions.push(stockTicker);

  // 设置上下文条件
  await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);

  // 定时刷新
  startAutoRefresh(context);

  // 初始加载数据
  await watchlistProvider.refresh();
  await newsProvider.refresh();

  console.log('[赛博大富翁] 已激活');
}

export function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (newsTimer) clearInterval(newsTimer);
  console.log('[赛博大富翁] 已停活');
}

function startAutoRefresh(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const interval = config.get<number>('refreshInterval', 30) * 1000;

  refreshTimer = setInterval(async () => {
    try {
      await watchlistProvider.refresh();
    } catch (e) { /* silent */ }
  }, interval);

  const newsInterval = config.get<number>('newsRefreshInterval', 120) * 1000;
  newsTimer = setInterval(async () => {
    try {
      await newsProvider.refresh();
    } catch (e) { /* silent */ }
  }, newsInterval);
}

function registerCommands(context: vscode.ExtensionContext, state: StateManager) {
  // ... 注册所有命令的 handler
}
```

### 7.2 自选股 Provider (watchlistProvider.ts)

这是最核心的模块——侧边栏展示自选股列表。

```typescript
import * as vscode from 'vscode';
import { WatchStock, detectMarket } from '../models/stock';
import { RealtimeQuote, getRealtimeQuote, getBatchQuotes } from '../api/sina';
import { StateManager } from '../storage/stateManager';

export class StockTreeItem extends vscode.TreeItem {
  constructor(
    public readonly stock: WatchStock,
    public quote?: RealtimeQuote
  ) {
    super(`${stock.name} (${stock.code})`, vscode.TreeItemCollapsibleState.None);
    
    this.description = quote ? `${quote.price.toFixed(2)}` : '--';
    this.iconPath = this.getIcon();
    this.tooltip = this.buildTooltip();
    this.contextValue = 'stock';
    this.command = {
      command: 'cyberMonopoly.openChart',
      arguments: [stock.code, stock.name],
      title: '查看K线'
    };
  }

  private getIcon(): vscode.ThemeIcon | vscode.Uri {
    if (!this.quote) return new vscode.ThemeIcon('circle-outline');
    if (this.quote.changePercent > 0) return new vscode.ThemeIcon('arrow-up');
    if (this.quote.changePercent < 0) return new vscode.ThemeIcon('arrow-down');
    return new vscode.ThemeIcon('minus');
  }

  private buildTooltip(): vscode.MarkdownString {
    if (!this.quote) return new vscode.MarkdownString('加载中...');
    const sign = this.quote.changePercent >= 0 ? '+' : '';
    return new vscode.MarkdownString(`
**${this.quote.name}** (${this.quote.code})
---
当前价: **${this.quote.price.toFixed(2)}**
今开: ${this.quote.open.toFixed(2)}
最高: ${this.quote.high.toFixed(2)}
最低: ${this.quote.low.toFixed(2)}
昨收: ${this.quote.prevClose.toFixed(2)}
涨跌幅: ${sign}${this.quote.changePercent.toFixed(2)}%
涨跌额: ${sign}${this.quote.changeAmount.toFixed(2)}
成交量: ${(this.quote.volume / 10000).toFixed(0)}万手
时间: ${this.quote.date} ${this.quote.time}
    `.trim());
  }
}

export class WatchlistProvider implements vscode.TreeDataProvider<StockTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StockTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stocks: WatchStock[] = [];
  private quotes: Map<string, RealtimeQuote> = new Map();

  constructor(private state: StateManager) {
    this.stocks = this.state.getWatchlist();
  }

  async refresh(): Promise<void> {
    if (this.stocks.length === 0) return;
    
    try {
      const codes = this.stocks.map(s => s.code);
      const quoteList = await getBatchQuotes(codes);
      
      this.quotes.clear();
      for (const q of quoteList) {
        this.quotes.set(q.code, q);
      }

      // 检查价格预警
      this.checkAlerts(quoteList);
      
      this._onDidChangeTreeData.fire(undefined);
    } catch (e) {
      vscode.window.showErrorMessage(`刷新行情失败: ${e}`);
    }
  }

  getTreeItem(element: StockTreeItem): StockTreeItem {
    return element;
  }

  getChildren(element?: StockTreeItem): Thenable<StockTreeItem[]> {
    if (element) return Promise.resolve([]);
    
    return Promise.resolve(
      this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code)))
    );
  }

  async addStock(code: string, name?: string): Promise<void> {
    if (this.stocks.some(s => s.code === code)) {
      vscode.window.showWarningMessage(`股票 ${code} 已在自选股中`);
      return;
    }

    let stockName = name;
    if (!stockName) {
      // 通过API获取名称
      try {
        const quote = await getRealtimeQuote(code);
        stockName = quote.name;
      } catch {
        stockName = `股票${code}`;
      }
    }

    const stock: WatchStock = {
      code,
      name: stockName,
      market: detectMarket(code),
      addedAt: Date.now(),
    };

    this.stocks.push(stock);
    this.state.saveWatchlist(this.stocks);
    this._onDidChangeTreeData.fire(undefined);
    
    // 立即获取行情
    try {
      const quote = await getRealtimeQuote(code);
      this.quotes.set(code, quote);
      this._onDidChangeTreeData.fire(undefined);
    } catch {}
  }

  removeStock(code: string): void {
    this.stocks = this.stocks.filter(s => s.code !== code);
    this.state.saveWatchlist(this.stocks);
    this.quotes.delete(code);
    this._onDidChangeTreeData.fire(undefined);
  }

  private checkAlerts(quotes: RealtimeQuote[]): void {
    for (const q of quotes) {
      const stock = this.stocks.find(s => s.code === q.code);
      if (!stock?.alertPrice && !stock?.alertPercent) continue;
      
      let shouldAlert = false;
      let msg = '';
      
      if (stock.alertPrice && Math.abs(q.price - stock.alertPrice) < 0.01) {
        shouldAlert = true;
        msg = `${stock.name} 到达目标价 ${stock.alertPrice}, 当前 ${q.price.toFixed(2)}`;
      }
      if (stock.alertPercent && Math.abs(q.changePercent) >= stock.alertPercent) {
        shouldAlert = true;
        const sign = q.changePercent >= 0 ? '▲' : '▼';
        msg = `${stock.name} 异动 ${sign}${Math.abs(q.changePercent).toFixed(2)}%, 当前 ${q.price.toFixed(2)}`;
      }
      
      if (shouldAlert) {
        vscode.window.showInformationMessage(`📊 ${msg}`, '查看').then(action => {
          if (action === '查看') {
            vscode.commands.executeCommand('cyberMonopoly.openChart', q.code, q.name);
          }
        });
      }
    }
  }
}
```

### 7.3 K线图面板 (chartPanel.ts)

使用 TradingView 的 **lightweight-charts** 库渲染专业K线。

```typescript
import * as vscode from 'vscode';
import { getKlineData, getIntradayData, DataSeries } from '../api/sina';

export class ChartPanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentCode = '';
  private currentName = '';
  private isCandlestick = true;

  constructor() {}

  async show(code: string, name: string, context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.loadChart(code);
      return;
    }

    this.currentCode = code;
    this.currentName = name;

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyChart',
      `${name} (${code})`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.getWebviewContent(context);
    this.setupMessageHandler();
    this.loadChart(code);
  }

  private getWebviewContent(context: vscode.ExtensionContext): string {
    // 使用 lightweight-charts CDN
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .toolbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); align-items: center; }
    .toolbar button { 
      background: var(--vscode-button-background); color: var(--vscode-button-foreground); 
      border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px; font-size: 12px;
    }
    .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    .toolbar button.active { background: var(--vscode-button-secondaryBackground); outline: 1px solid var(--vscode-focusBorder); }
    .toolbar .title { flex: 1; font-weight: bold; font-size: 14px; }
    .toolbar .spacer { width: 16px; }
    #chart-container { height: calc(100vh - 90px); width: 100%; }
    .loading { display: flex; justify-content: center; align-items: center; height: 300px; color: var(--vscode-descriptionForeground); }
  </style>
  <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
</head>
<body>
  <div class="toolbar">
    <span class="title" id="stock-title">--</span>
    <span class="spacer"></span>
    <button id="btn-kline" class="active">K线</button>
    <button id="btn-intraday">分时</button>
    <span class="spacer"></span>
    <button id="btn-d15">15日</button>
    <button id="btn-d30" class="active">30日</button>
    <button id="btn-d60">60日</button>
    <button id="btn-d120">120日</button>
    <span class="spacer"></span>
    <button id="btn-refresh">↻ 刷新</button>
  </div>
  <div id="chart-container"><div class="loading">加载中...</div></div>

  <script>
    const vscode = acquireVsCodeApi();
    let chart = null;
    let candleSeries = null;
    let lineSeries = null;

    function createChart(container) {
      chart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') } },
        grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'var(--vscode-panel-border)' } },
        rightPriceScale: { borderColor: 'var(--vscode-panel-border)' },
        timeScale: { borderColor: 'var(--vscode-panel-border)', timeVisible: true },
        crosshair: { mode: 0 },
      });
    }

    function renderCandlestick(data) {
      if (candleSeries) chart.removeSeries(candleSeries);
      candleSeries = chart.addCandlestickSeries({
        upColor: '#ef4444', downColor: '#22c55e',
        borderUpColor: '#ef4444', borderDownColor: '#22c55e',
        wickUpColor: '#ef4444', wickDownColor: '#22c55e',
      });
      candleSeries.setData(data.map(d => ({
        time: Math.floor(new Date(d.date).getTime() / 1000),
        open: d.open ?? d.value, high: d.high ?? d.value,
        low: d.low ?? d.value, close: d.close ?? d.value,
      })));
      chart.timeScale().fitContent();
    }

    function renderLine(data, prevClose) {
      if (lineSeries) chart.removeSeries(lineSeries);
      lineSeries = chart.addLineSeries({
        color: '#3b82f6', lineWidth: 2,
        priceLineColor: 'var(--vscode-focusBorder)',
        lastValueVisible: true,
        priceLineVisible: true,
        baseValue: { type: 'price', price: prevClose || data[0]?.value },
        topColor: 'rgba(239, 68, 68, 0.2)', bottomColor: 'rgba(34, 197, 94, 0.2)',
      });
      lineSeries.setData(data.map(d => ({
        time: Math.floor(new Date(d.date).getTime() / 1000), value: d.value,
      })));
      chart.timeScale().fitContent();
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      const container = document.getElementById('chart-container');
      container.innerHTML = '';
      createChart(container);
      document.getElementById('stock-title').textContent = msg.title || '';

      if (msg.type === 'candlestick') renderCandlestick(msg.data);
      else if (msg.type === 'line') renderLine(msg.data, msg.prevClose);
    });

    document.querySelectorAll('.toolbar button[id^="btn-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ action: btn.id.replace('btn-', '') });
      });
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      // Webview 按钮 id 格式: btn-xxx → action: 'xxx'
      switch (msg.action) {
        case 'kline':
          this.isCandlestick = true;
          await this.loadKline(30);
          break;
        case 'intraday':
          this.isCandlestick = false;
          await this.loadIntraday(1);
          break;
        case 'd15': await this.loadKline(15); break;
        case 'd30': await this.loadKline(30); break;
        case 'd60': await this.loadKline(60); break;
        case 'd120': await this.loadKline(120); break;
        case 'refresh':
          if (this.isCandlestick) await this.loadKline(30);
          else await this.loadIntraday(1);
          break;
        default:
          console.warn('[赛博大富翁] 未知图表 action:', msg.action);
      }
    });
  }

  private async loadKline(days: number) {
    try {
      const series = await getKlineData(this.currentCode, days);
      this.panel!.webview.postMessage({
        type: 'candlestick',
        data: series.data,
        title: `${series.name}`,
      });
    } catch (e) {
      this.panel!.webview.postMessage({ type: 'error', message: String(e) });
    }
  }

  private async loadIntraday(interval: number) {
    try {
      const series = await getIntradayData(this.currentCode, interval);
      this.panel!.webview.postMessage({
        type: 'line',
        data: series.data,
        prevClose: series.prevClose,
        title: `${series.name}`,
      });
    } catch (e) {
      this.panel!.webview.postMessage({ type: 'error', message: String(e) });
    }
  }

  private loadChart(code: string) {
    this.currentCode = code;
    this.loadKline(30);
  }
}
```

### 7.4 AI 聊天面板 (aiChatPanel.ts)

```typescript
import * as vscode from 'vscode';
import { LlmClient } from '../chat/llmClient';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class AiChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messages: ChatMessage[] = [];
  private llm: LlmClient;
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.chatHistory';

  constructor(llm: LlmClient, state: vscode.Memento) {
    this.llm = llm;
    this.state = state;
    // 从持久化存储恢复历史消息 (最多保留 50 条)
    const saved = state.get<ChatMessage[]>(this.STORAGE_KEY, []);
    this.messages = saved.slice(-50);
  }

  private saveHistory(): void {
    this.state.update(this.STORAGE_KEY, this.messages.slice(-50));
  }

  show(context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyAiChat',
      'AI助手',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageHandler();
  }

  private getWebviewContent(): string {
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root { --user-bg: var(--vscode-button-background); --ai-bg: var(--vscode-editor-inactiveSelectionBackground); }
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; }
    #messages { flex: 1; overflow-y: auto; padding: 12px; }
    .msg { margin-bottom: 12px; max-width: 85%; padding: 8px 12px; border-radius: 8px; line-height: 1.5; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
    .msg.user { background: var(--user-bg); margin-left: auto; border-bottom-right-radius: 2px; }
    .msg.ai { background: var(--ai-bg); border-bottom-left-radius: 2px; }
    .msg .time { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    #input-area { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--vscode-panel-border); }
    #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px 12px; font-size: 13px; outline: none; resize: none; min-height: 36px; max-height: 120px; }
    #input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .typing { color: var(--vscode-descriptionForeground); font-style: italic; padding: 8px 12px; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" placeholder="输入消息... (Enter发送, Shift+Enter换行)" rows="1"></textarea>
    <button id="send-btn">发送</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const $messages = document.getElementById('messages');
    const $input = document.getElementById('input');
    const $sendBtn = document.getElementById('send-btn');

    function addMsg(role, content) {
      const div = document.createElement('div');
      div.className = \`msg \${role}\`;
      div.textContent = content;
      const time = document.createElement('div');
      time.className = 'time';
      time.textContent = new Date().toLocaleTimeString();
      div.appendChild(time);
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.id = 'typing-indicator';
      div.className = 'msg ai typing';
      div.textContent = '思考中...';
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function hideTyping() {
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }

    async function send() {
      const text = $input.value.trim();
      if (!text) return;
      $input.value = '';
      addMsg('user', text);
      showTyping();
      $sendBtn.disabled = true;
      vscode.postMessage({ type: 'chat', content: text });
    }

    $sendBtn.addEventListener('click', send);
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    window.addEventListener('message', event => {
      hideTyping();
      $sendBtn.disabled = false;
      const msg = event.data;
      if (msg.type === 'response') addMsg('ai', msg.content);
      if (msg.type === 'error') addMsg('ai', '错误: ' + msg.content);
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'chat') return;

      this.messages.push({ role: 'user', content: msg.content, timestamp: Date.now() });

      try {
        const response = await this.llm.chat([
          ['system', this.getSystemPrompt()],
          ...this.messages.slice(-20).map(m => [m.role, m.content] as [string, string]),
        ]);

        this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
        this.saveHistory(); // 持久化到 globalState
        this.panel!.webview.postMessage({ type: 'response', content: response });
      } catch (e) {
        this.panel!.webview.postMessage({ type: 'error', content: String(e) });
      }
    });
  }

  private getSystemPrompt(watchlist: {code: string, name: string}[] = []): string {
    // 动态生成股票对照表 (从自选股列表)
    const stockList = watchlist.length > 0
      ? watchlist.map(s => `${s.name}=${s.code}`).join(', ')
      : '贵州茅台=600519, 平安银行=000001, 宁德时代=300750';

    return `你是赛博大富翁的AI助手，帮助用户查询A股信息。

# 用户自选股代码对照表
${stockList}

# 你的能力
1. 回答股市相关问题（技术分析、基本面、行业动态）
2. 解释财经术语
3. 帮助制定投资策略参考
4. 聊天闲谈

# 规则
- 如果用户问的是股票相关，尽量给出有依据的分析
- 如果无法确定，明确说明"仅供参考，不构成投资建议"
- 保持简洁，不要长篇大论
- 用中文回答`;
  }
}
```

### 7.5 LLM 客户端 (llmClient.ts)

```typescript
// chat/llmClient.ts

export interface LlmConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export class LlmClient {
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async chat(messages: [string, string][]): Promise<string> {
    const body = {
      model: this.config.model,
      messages: messages.map(([role, content]) => ({ role, content })),
      temperature: this.config.temperature,
    };

    const resp = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LLM请求失败 (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '无响应';
  }
}
```

### 7.6 状态栏行情滚动条 (stockTicker.ts)

```typescript
// statusbar/stockTicker.ts

import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';

export class StockTicker {
  private statusBar: vscode.StatusBarItem;
  private currentIndex = 0;

  constructor(private provider: WatchlistProvider) {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBar.command = 'cyberMonopoly.showOverview';
    this.startTicking();
  }

  dispose() {
    this.statusBar.dispose();
  }

  setVisible(visible: boolean) {
    this.statusBar.visible = visible;
  }

  private startTicking() {
    setInterval(() => {
      this.updateDisplay();
    }, 3000); // 每3秒滚动一只股票
    this.updateDisplay();
  }

  private updateDisplay() {
    const stocks = this.provider.getStocks();
    const quotes = this.provider.getQuotes();

    if (stocks.length === 0) {
      this.statusBar.text = '$(heart) 赛博';
      this.statusBar.tooltip = '添加自选股开始追踪';
      this.statusBar.show();
      return;
    }

    // 防止空数组时 currentIndex % 0 导致 NaN
    if (this.currentIndex >= stocks.length) {
      this.currentIndex = 0;
    }
    const stock = stocks[this.currentIndex];
    const quote = quotes.get(stock.code);

    if (quote) {
      const sign = quote.changePercent >= 0 ? '↑' : '↓';
      const color = quote.changePercent >= 0 ? 'red' : 'green'; // A股风格
      this.statusBar.text = `$(${quote.changePercent >= 0 ? 'trending-up' : 'trending-down'}) ${stock.name} ${quote.price.toFixed(2)} ${sign}${Math.abs(quote.changePercent).toFixed(2)}%`;
      this.statusBar.tooltip = `${stock.name}(${stock.code}): ${quote.price} (${sign}${quote.changePercent.toFixed(2)}%)`;
    } else {
      this.statusBar.text = `$(sync~spin) ${stock.name} ...`;
      this.statusBar.tooltip = `${stock.name} 加载中...`;
    }

    this.statusBar.show();
    this.currentIndex++;
  }
}
```

### 7.7 存储管理 (stateManager.ts)

```typescript
// storage/stateManager.ts

import * as vscode from 'vscode';
import { WatchStock } from '../models/stock';
import { NewsItem } from '../models/news';

const KEY_WATCHLIST = 'cyberMonopoly.watchlist';
const KEY_NEWS_CACHE = 'cyberMonopoly.newsCache';
const KEY_SETTINGS = 'cyberMonopoly.settings';

export class StateManager {
  constructor(private globalState: vscode.Memento) {}

  // ===== 自选股 =====
  getWatchlist(): WatchStock[] {
    return this.globalState.get<WatchStock[]>(KEY_WATCHLIST, []);
  }

  saveWatchlist(stocks: WatchStock[]): Thenable<void> {
    return this.globalState.update(KEY_WATCHLIST, stocks);
  }

  // ===== 快讯缓存 =====
  getNewsCache(): NewsItem[] {
    return this.globalState.get<NewsItem[]>(KEY_NEWS_CACHE, []);
  }

  saveNewsCache(news: NewsItem[]): Thenable<void> {
    return this.globalState.update(KEY_NEWS_CACHE, news);
  }

  // ===== 通用设置 =====
  getSetting<T>(key: string, defaultValue: T): T {
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    return settings[key] ?? defaultValue;
  }

  setSetting(key: string, value: any): Thenable<void> {
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    settings[key] = value;
    return this.globalState.update(KEY_SETTINGS, settings);
  }
}
```

### 7.8 快讯 Provider (newsProvider.ts)

```typescript
import * as vscode from 'vscode';
import { NewsItem } from '../models/news';
import { get7x24News } from '../api/sina';
import { StateManager } from '../storage/stateManager';

export class NewsTreeItem extends vscode.TreeItem {
  constructor(public readonly news: NewsItem) {
    super(news.title, vscode.TreeItemCollapsibleState.None);
    this.tooltip = news.content;
    this.description = news.createTime ? news.createTime.split(' ')[1] : '';
    this.iconPath = news.tag ? new vscode.ThemeIcon('tag') : new vscode.ThemeIcon('file-text');
    this.contextValue = 'news';
  }
}

export class NewsProvider implements vscode.TreeDataProvider<NewsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NewsTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: NewsItem[] = [];

  constructor(private state: StateManager) {
    this.items = state.getNewsCache();
  }

  async refresh(): Promise<void> {
    try {
      const fresh = await get7x24News(1, 50);
      const existingIds = new Set(this.items.map(n => n.id));
      const newItems = fresh.filter(n => !existingIds.has(n.id));
      this.items = [...newItems, ...this.items].slice(0, 200);
      this.state.saveNewsCache(this.items);
      this._onDidChangeTreeData.fire(undefined);
    } catch (e) {
      // 静默失败，使用缓存
    }
  }

  clear(): void {
    this.items = [];
    this.state.saveNewsCache([]);
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: NewsTreeItem): NewsTreeItem {
    return element;
  }

  getChildren(): Thenable<NewsTreeItem[]> {
    return Promise.resolve(this.items.map(n => new NewsTreeItem(n)));
  }
}
```

### 7.9 快讯详情面板 (newsPanel.ts)

侧边栏快讯列表仅展示前 100 字标题，双击条目时打开详情面板查看完整内容。

```typescript
import * as vscode from 'vscode';
import { NewsItem } from '../models/news';

export class NewsPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(news: NewsItem) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.panel.webview.postMessage({ type: 'news', data: news });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyNewsDetail',
      '快讯详情',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getWebviewContent(news);
  }

  private getWebviewContent(news: NewsItem): string {
    const time = news.createTime || '';
    const tag = news.tag ? `<span class="tag">${news.tag}</span>` : '';
    
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .meta { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    .content { line-height: 1.8; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="meta">
    <span>${time}</span>
    ${tag}
  </div>
  <div class="content" id="news-content">${news.content}</div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      if (event.data.type === 'news') {
        const n = event.data.data;
        document.getElementById('news-content').textContent = n.content;
        document.querySelector('.meta').innerHTML = 
          '<span>' + (n.createTime || '') + '</span>' +
          (n.tag ? '<span class="tag">' + n.tag + '</span>' : '');
      }
    });
  </script>
</body>
</html>`;
  }
}
```

**在 NewsTreeItem 中添加点击命令**:
```typescript
// NewsTreeItem constructor 中添加
this.command = {
  command: 'cyberMonopoly.openNewsDetail',
  arguments: [news],
  title: '查看详情',
};
```

**注册命令**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('cyberMonopoly.openNewsDetail', (news: NewsItem) => {
    if (news) newsPanel.show(news);
  })
);
```

---

## 八、命令注册与交互流程

### 8.1 命令注册汇总 (commands/*.ts)

```typescript
// commands/watchlist.ts
import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';
import { ChartPanel } from '../webview/chartPanel';

export function registerWatchlistCommands(
  context: vscode.ExtensionContext,
  provider: WatchlistProvider,
  chartPanel: ChartPanel
) {
  // 添加自选股
  context.subscriptions.push(
    vscode.commands.registerCommand('cyberMonopoly.addToWatchlist', async () => {
      const code = await vscode.window.showInputBox({
        prompt: '输入股票代码',
        placeHolder: '如: 600519, 000001, 300750',
        validateInput: val => /^\d{4,6}$/.test(val) ? null : '请输入有效的股票代码',
      });
      if (code) await provider.addStock(code);
    })
  );

  // 移除自选股
  context.subscriptions.push(
    vscode.commands.registerCommand('cyberMonopoly.removeFromWatchlist', (item) => {
      const code = item?.stock?.code;
      if (code) {
        provider.removeStock(code);
      }
    })
  );

  // 打开K线图
  context.subscriptions.push(
    vscode.commands.registerCommand('cyberMonopoly.openChart', (code, name) => {
      if (typeof code === 'string') {
        chartPanel.show(code, name, context);
      }
    })
  );
}
```

### 8.2 完整用户交互流程

```
用户操作                          系统响应
─────────                        ─────────
点击 Activity Bar 图标             → 展开 sidebar，显示自选股树 + 快讯树
点击自选股项                      → 打开 K线图 Webview (Beside)
右键自选股                        → Context Menu: 查看K线 / 移除
Ctrl+Shift+Q                     → 显示/聚焦行情概览面板
Ctrl+Shift+A                     → 显示/聚焦 AI 聊天面板
F5 (sidebar聚焦时)                → 刷新当前行情
点击 "+" 按钮                     → InputBox 输入代码 → 调API获名称 → 加入列表
状态栏滚动条                      → 每3秒轮播一只股票行情
价格触发预警                      → VSCode Notification + 可跳转K线
AI面板输入消息                    → 发送至 LLM API → 渲染回复气泡
```

---

## 九、UI 设计规范

### 9.1 配色方案 (A股惯例)

```css
/* 涨 */
--color-up: #ef4444;        /* 红色 */
--color-up-light: rgba(239, 68, 68, 0.1);

/* 跌 */
--color-down: #22c55e;      /* 绿色 */
--color-down-light: rgba(34, 197, 94, 0.1);

/* 平 */
--color-flat: #94a3b8;      /* 灰色 */

/* 背景 (跟随 VSCode 主题) */
--bg-primary: var(--vscode-sideBar-background);
--bg-panel: var(--vscode-editor-background);
--text-primary: var(--vscode-foreground);
--text-secondary: var(--vscode-descriptionForeground);
--border: var(--vscode-panel-border);
```

### 9.2 侧边栏树节点样式

```
┌─────────────────────────────┐
│ ❤ 自选股              ↻ +  │  ← toolbar
├─────────────────────────────┤
│ ↑ 贵州茅台 (600519)  1688.00│  ← 涨: 红色箭头
│ ↓ 平安银行 (000001)   12.34 │  ← 跌: 绿色箭头
│ ─ 宁德时代 (300750)  215.60 │  ← 平: 灰色横线
│ ○ 双杰电气 (300444)   --.-- │  ← 加载中
└─────────────────────────────┘
```

### 9.3 状态栏样式

```
[↑ 贵州茅台 1688.00 ↑2.35%] [↓ 平安银行 12.34 ↓0.52%] [↑ 宁德时代 215.60 ↑1.20%]
  ← 循环滚动显示，每3秒切换
```

### 9.4 Webview 资源加载建议

**开发阶段**可以使用内联 HTML 字符串（如本文档示例），但**生产环境强烈建议**将 HTML/CSS/JS 拆到独立文件：

```typescript
// 推荐方式: 使用 webview.asWebviewUri 加载本地文件
const scriptUri = panel.webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'webviews', 'chart', 'index.js')
);
const styleUri = panel.webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'webviews', 'chart', 'style.css')
);

// HTML 中引用
<script src="${scriptUri}"></script>
<link rel="stylesheet" href="${styleUri}">
```

**优势**:
- 避免字符串模板转义地狱
- 支持 IDE 语法高亮和自动补全
- 更好的 CSP 安全策略
- 便于调试（Source Map 支持）

**内联模板注意事项**: 如果使用内联模板字符串，确保:
- 使用 `` ` `` 反引号包裹整个 HTML
- Webview 中的 JS 变量使用 `\${var}` 转义（在模板字符串中输出 `${var}`）
- 不要在 HTML 内联 JS 中直接使用 TypeScript 变量

---

## 十、错误处理策略

| 场景 | 处理方式 | 用户体验 |
|------|----------|----------|
| API 请求超时 | 重试1次，仍失败则用缓存 | 显示缓存数据 + 灰色标记 |
| API 返回空 | 不更新，保留上一次数据 | 静默 |
| 网络断开 | 全部走缓存 | 正常显示，tooltip 提示"离线模式" |
| LLM API 失败 | 在聊天区显示错误消息 | 用户可见，不影响其他功能 |
| 数据解析异常 | 记录日志，跳过该条数据 | 单只股票异常不影响整体 |
| VSCode state 写入失败 | fallback 到内存 | 下次启动可能丢失 |

---

## 十一、性能要求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 激活耗时 | < 200ms | 不阻塞 VSCode 启动 |
| 侧边栏刷新 | < 500ms | 10只股票批量请求 |
| K线图加载 | < 1s | 120天日线数据 |
| 内存占用 | < 50MB | 不含 Webview |
| Webview 内存 | < 80MB | 单个面板 |
| CPU 空闲 | < 1% | 定时器间隔期间 |

**优化要点**:
- 批量行情请求用 `Promise.allSettled` 并行
- Webview 用 `retainContextWhenHidden` 避免重建
- 图表数据做前端分页/采样，不超过 1024 点
- 快讯缓存去重用 Set(id)，避免重复存储

---

## 十二、测试策略

### 12.1 单元测试

```typescript
// test/api/sina.test.ts
import * as assert from 'assert';
import { toSinaCode } from '../../src/api/sina';

suite('Sina API Utils', () => {
  test('上海股票代码转换', () => {
    assert.strictEqual(toSinaCode('600519'), 'sh600519');
    assert.strictEqual(toSinaCode('688001'), 'sh688001');
  });

  test('深圳股票代码转换', () => {
    assert.strictEqual(toSinaCode('000001'), 'sz000001');
    assert.strictEqual(toSinaCode('300750'), 'sz300750');
  });

  test('北交所股票代码转换', () => {
    assert.strictEqual(toSinaCode('430047'), 'bj430047');
  });
});

// test/provider/watchlistProvider.test.ts
suite('WatchlistProvider', () => {
  test('添加重复股票应拒绝', () => { /* ... */ });
  test('移除不存在股票应忽略', () => { /* ... */ });
  test('空列表应返回空数组', () => { /* ... */ });
});
```

### 12.2 集成测试

- Mock 新浪 API 响应，验证完整数据流
- 测试 Webview 消息收发
- 测试 VSCode state 读写

### 12.3 手动测试清单

- [ ] 安装后侧边栏正常显示
- [ ] 添加/删除自选股正常
- [ ] 行情数据正确显示（颜色、数值）
- [ ] K线图正常渲染（日线/分时切换）
- [ ] 快讯正常加载和刷新
- [ ] AI 聊天能正常对话
- [ ] 状态栏滚动条正常工作
- [ ] 快捷键正常响应
- [ ] VSCode 重启后数据保持
- [ ] 离线模式下显示缓存数据
- [ ] 多个 VSCode 窗口互不干扰

---

## 十三、发布与分发

### 13.1 发布到 VSCode Marketplace

```bash
# 安装发布工具
npm install -g @vscode/vsce

# 打包
vsce package

# 发布 (需要 Azure DevOps token)
vsce publish
```

### 13.2 package.json 必填字段检查

```json
{
  "name": "cyber-monopoly",           // 唯一ID
  "displayName": "赛博大富翁",        // 显示名
  "description": "...",               // 描述
  "version": "1.0.0",                 // 语义版本
  "publisher": "your-id",             // 发布者
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "license": "MIT"
}
```

### 13.3 推荐的 README 结构

```markdown
# 赛博大富翁 🎮💰

> 藏在编辑器里的A股行情工具

## ✨ Features
- 📊 自选股实时行情 (侧边栏)
- 📈 K线图 / 分时图 (TradingView引擎)
- 📰 7x24 快讯推送
- 🤖 AI 助手 (OpenAI兼容)
- 🔔 价格预警通知
- 📊 状态栏行情滚动条

## ⌨️ Shortcuts
| 快捷键 | 功能 |
|--------|------|
| Ctrl+Shift+Q | 行情概览 |
| Ctrl+Shift+A | AI助手 |
| F5 | 刷新行情 |

## ⚙️ Settings
...

## 📸 Screenshots
...
```

---

## 附录 A: 工具函数

```typescript
// utils/color.ts
export function hashColor(str: string): [number, number, number] {
  const colors: [number, number, number][] = [
    [86, 180, 233], [230, 159, 0], [0, 158, 115],
    [204, 121, 167], [213, 94, 0], [240, 228, 66],
  ];
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return colors[sum % colors.length];
}

export function formatNumber(n: number, decimals = 2): string {
  if (n >= 1e8) return (n / 1e8).toFixed(decimals) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(decimals) + '万';
  return n.toFixed(decimals);
}

// utils/time.ts
export function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false; // 周末
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  return (time >= 9 * 60 + 25 && time <= 11 * 60 + 30) ||
         (time >= 13 * 60 && time <= 15 * 60);
}
```

---

## 附录 C: 实时行情完整 API 字段索引

新浪财经实时行情接口返回约 50+ 个字段，以下为完整映射表：

```typescript
// 响应格式: var hq_str_sh600519="字段0,字段1,...,字段N"

interface SinaQuoteRaw {
  // [0-8] 基础行情
  name: string;           // 0: 股票名称
  open: number;           // 1: 今开价
  prevClose: number;      // 2: 昨收价
  price: number;          // 3: 当前价
  high: number;           // 4: 最高价
  low: number;            // 5: 最低价
  bid: number;            // 6: 竞买价(买一)
  ask: number;            // 7: 竞卖价(卖一)
  volume: number;         // 8: 成交量(手)

  // [9-18] 盘口五档
  bid1Price: number;      // 9: 买一价
  bid1Volume: number;     // 10: 买一量
  bid2Price: number;      // 11: 买二价
  bid2Volume: number;     // 12: 买二量
  bid3Price: number;      // 13: 买三价
  bid3Volume: number;     // 14: 买三量
  bid4Price: number;      // 15: 买四价
  bid4Volume: number;     // 16: 买四量
  bid5Price: number;      // 17: 买五价
  bid5Volume: number;     // 18: 买五量

  ask1Price: number;      // 19: 卖一价
  ask1Volume: number;     // 20: 卖一量
  ask2Price: number;      // 21: 卖二价
  ask2Volume: number;     // 22: 卖二量
  ask3Price: number;      // 23: 卖三价
  ask3Volume: number;     // 24: 卖三量
  ask4Price: number;      // 25: 卖四价
  ask4Volume: number;     // 26: 卖四量
  ask5Price: number;      // 27: 卖五价
  ask5Volume: number;     // 28: 卖五量

  // [29-31] 时间与成交额
  amount: number;         // 29: 成交额(元)
  date: string;           // 30: 日期
  time: string;           // 31: 时间
}
```

**盘口五档展示示例** (可用于后续增强):
```
买五 1675.00 × 12    ← index 17-18
买四 1676.00 × 8     ← index 15-16
买三 1677.00 × 15    ← index 13-14
买二 1678.00 × 20    ← index 11-12
买一 1679.00 × 25    ← index 9-10
────────────────
卖一 1680.00 × 18    ← index 19-20
卖二 1681.00 × 22    ← index 21-22
卖三 1682.00 × 10    ← index 23-24
卖四 1683.00 × 5     ← index 25-26
卖五 1684.00 × 30    ← index 27-28
```

---

## 附录 D: K线数据完整 OHLCV 格式

新浪 K线接口返回的数据包含完整的 OHLCV (开高低收量) 信息：

> **✅ API 实测验证**: K线 API 直接返回纯 JSON 数组，**不是 JSONP 格式**。无需剥离 `var _data=` 包装。

**日线响应格式**:
```json
[
  {
    "day": "2026-04-29",
    "open": "1680.00",
    "high": "1705.00",
    "low": "1660.00",
    "close": "1690.00",
    "volume": "123456",
    "ma5": "1685.00",
    "ma10": "1670.00",
    "ma20": "1650.00",
    "ma30": "1640.00"
  }
]
```

**完整解析实现**:
```typescript
interface KlineRaw {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  ma5?: string;
  ma10?: string;
  ma20?: string;
  ma30?: string;
}

export async function getKlineData(code: string, days: number): Promise<DataSeries> {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${toSinaCode(code)}&scale=240&ma=no&datalen=${Math.min(days, 1023)}`;
  const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }});
  const text = await resp.text();
  
  // K线 API 直接返回纯 JSON 数组，无需剥离 JSONP
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
```

**分时数据接口** (用于分时图):
```typescript
// 分时数据使用实时行情 + 当日分钟线
// 新浪分时接口: https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=1&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=auto
// 但更简单的方式是从 K线接口获取当日分钟数据

export async function getIntradayData(code: string, days = 1): Promise<DataSeries> {
  // 使用 5 分钟线模拟分时图
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${toSinaCode(code)}&scale=5&ma=no&datalen=${days * 48}`;
  const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' }});
  const text = await resp.text();
  
  const jsonStr = text.replace(/var\s+_data=\(/, '').replace(/\);$/, '');
  const raw: KlineRaw[] = JSON.parse(jsonStr);
  
  const points: DataPoint[] = raw.map(item => ({
    date: new Date(item.day),
    value: parseFloat(item.close || '0'),
    label: `${code} ${item.day}`,
  }));
  
  const realtime = await getRealtimeQuote(code).catch(() => null);
  
  return {
    name: `${realtime?.name || code} ${code}`,
    data: points,
    color: [59, 130, 246], // 蓝色
    prevClose: realtime?.prevClose,
    type: 'line',
  };
}
```

---

## 附录 E: Webview 通信协议

Extension 与 Webview 之间通过 `postMessage` 进行双向通信。

### E.1 Extension → Webview 消息格式

```typescript
// extension.ts 中发送消息
panel.webview.postMessage({
  type: 'candlestick' | 'line' | 'error' | 'update',
  data?: any[],
  title?: string,
  message?: string,
  prevClose?: number,
});
```

| type | 字段 | 说明 |
|------|------|------|
| `candlestick` | data, title | K线数据，用于蜡烛图渲染 |
| `line` | data, title, prevClose | 折线数据，用于分时图渲染 |
| `error` | message | 错误信息 |
| `update` | data | 实时行情更新 |

### E.2 Webview → Extension 消息格式

```typescript
// Webview 中发送消息
vscode.postMessage({
  action: string,
  payload?: any,
});
```

| action | payload | 说明 |
|--------|---------|------|
| `kline` | - | 切换到 K线图 |
| `intraday` | - | 切换到分时图 |
| `d15` / `d30` / `d60` / `d120` | - | 切换 K线周期 |
| `refresh` | - | 刷新当前图表 |
| `chat` | content: string | AI 聊天消息 |

### E.3 消息处理模板

```typescript
// Extension 端接收
panel.webview.onDidReceiveMessage((msg) => {
  switch (msg.action) {
    case 'kline':
    case 'intraday':
    case 'd15':
    case 'd30':
    case 'd60':
    case 'd120':
    case 'refresh':
      // 图表操作
      break;
    case 'chat':
      // AI 聊天
      break;
    default:
      console.warn('[赛博大富翁] 未知消息 action:', msg.action);
  }
});
```

---

## 附录 F: 港股/美股 API 说明

### F.1 港股

```
GET https://hq.sinajs.cn/list={sina_code}
```

**代码规则**: `rt_hk` + 港股代码 (5位数字)

```typescript
function toHkCode(code: string): string {
  // 腾讯控股: 00700 → rt_hk00700
  return `rt_hk${code.padStart(5, '0')}`;
}
```

**响应格式** (与 A 股类似，字段略有不同):
```
var hq_str_rt_hk00700="腾讯控股,388.000,385.000,390.000,392.000,380.000,388.000,...,2026/04/29,16:08";
```

### F.2 美股

```
GET https://hq.sinajs.cn/list={sina_code}
```

**代码规则**: `gb_` + 美股代码 (大写英文)

```typescript
function toUsCode(code: string): string {
  // 英伟达: NVDA → gb_nvda
  return `gb_${code.toLowerCase()}`;
}
```

**响应格式**:
```
var hq_str_gb_nvda="英伟达,135.40,134.20,136.80,138.00,133.50,135.40,...,2026/04/29,16:00";
```

### F.3 统一代码转换

```typescript
export function toSinaCode(code: string, market?: string): string {
  const m = market || detectMarket(code);
  
  switch (m) {
    case 'HK':
      return `rt_hk${code.padStart(5, '0')}`;
    case 'US':
      return `gb_${code.toLowerCase()}`;
    case 'SH':
      return `sh${code}`;
    case 'SZ':
      return `sz${code}`;
    case 'BJ':
      return `bj${code}`;
    default:
      return `sh${code}`;
  }
}
```

---

## 附录 G: 价格异动检测模块 (alert.ts)

### G.1 检测逻辑

```typescript
// notification/alert.ts

import * as vscode from 'vscode';
import { RealtimeQuote } from '../api/sina';
import { WatchStock } from '../models/stock';

interface AlertRule {
  code: string;
  name: string;
  alertPrice?: number;      // 目标价
  alertPercent?: number;    // 涨跌幅阈值%
  lastAlertTime: number;    // 上次通知时间 (防重复)
}

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private cooldownMs = 5 * 60 * 1000; // 5分钟冷却
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.alertLastTime';

  constructor(state: vscode.Memento) {
    this.state = state;
    // 从持久化存储恢复上次提醒时间
    const saved = state.get<Record<string, number>>(this.STORAGE_KEY, {});
    for (const [code, time] of Object.entries(saved)) {
      const rule = this.rules.get(code);
      if (rule) rule.lastAlertTime = time;
    }
  }

  addRule(stock: WatchStock): void {
    if (stock.alertPrice || stock.alertPercent) {
      const saved = this.state.get<Record<string, number>>(this.STORAGE_KEY, {});
      this.rules.set(stock.code, {
        code: stock.code,
        name: stock.name,
        alertPrice: stock.alertPrice,
        alertPercent: stock.alertPercent,
        lastAlertTime: saved[stock.code] || 0,
      });
    }
  }

  removeRule(code: string): void {
    this.rules.delete(code);
  }

  private persistAlertTimes(): void {
    const saved: Record<string, number> = {};
    for (const [code, rule] of this.rules) {
      if (rule.lastAlertTime > 0) {
        saved[code] = rule.lastAlertTime;
      }
    }
    this.state.update(this.STORAGE_KEY, saved);
  }

  check(quotes: RealtimeQuote[]): void {
    const now = Date.now();
    
    for (const q of quotes) {
      const rule = this.rules.get(q.code);
      if (!rule) continue;
      
      // 冷却检查
      if (now - rule.lastAlertTime < this.cooldownMs) continue;
      
      let shouldAlert = false;
      let message = '';
      
      // 价格预警
      if (rule.alertPrice) {
        const diff = Math.abs(q.price - rule.alertPrice);
        const threshold = rule.alertPrice * 0.005; // 0.5% 容差
        if (diff <= threshold) {
          shouldAlert = true;
          message = `📊 ${rule.name} 到达目标价 ¥${rule.alertPrice.toFixed(2)}，当前 ¥${q.price.toFixed(2)}`;
        }
      }
      
      // 涨跌幅预警
      if (rule.alertPercent && Math.abs(q.changePercent) >= rule.alertPercent) {
        shouldAlert = true;
        const sign = q.changePercent >= 0 ? '📈' : '📉';
        message = `${sign} ${rule.name} 异动 ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%，当前 ¥${q.price.toFixed(2)}`;
      }
      
      if (shouldAlert) {
        rule.lastAlertTime = now;
        this.persistAlertTimes(); // 持久化到 globalState
        this.notify(message, q.code);
      }
    }
  }

  private notify(message: string, code: string): void {
    vscode.window.showInformationMessage(message, '查看K线', '忽略').then(action => {
      if (action === '查看K线') {
        vscode.commands.executeCommand('cyberMonopoly.openChart', code);
      }
    });
  }
}
```

### G.2 在 extension.ts 中集成

```typescript
import { AlertManager } from './notification/alert';

const alertManager = new AlertManager();

// 在 watchlistProvider.refresh() 之后调用
async function startAutoRefresh(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const interval = config.get<number>('refreshInterval', 30) * 1000;

  refreshTimer = setInterval(async () => {
    try {
      const quotes = await watchlistProvider.refreshAndGetQuotes();
      alertManager.check(quotes);
    } catch (e) { /* silent */ }
  }, interval);
}
```

---

## 附录 H: QuoteDecoration 内联行情显示

在编辑器中选中股票代码时，在行尾显示实时行情。

```typescript
// provider/quoteDecoration.ts

import * as vscode from 'vscode';
import { getRealtimeQuote } from '../api/sina';

export class QuoteDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 2em',
        color: new vscode.ThemeColor('descriptionForeground'),
        fontWeight: 'normal',
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => this.update()),
      vscode.workspace.onDidChangeTextDocument(() => this.update())
    );
  }

  private async update() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = editor.document.getText();
    const stockCodeRegex = /\b(60\d{4}|00\d{4}|30\d{4}|68\d{4}|43\d{4}|83\d{4})\b/g;
    
    const decorations: vscode.DecorationOptions[] = [];
    let match;

    while ((match = stockCodeRegex.exec(text)) !== null) {
      const code = match[1];
      const pos = editor.document.positionAt(match.index);
      const range = new vscode.Range(pos, pos.translate(0, code.length));

      try {
        const quote = await getRealtimeQuote(code);
        const sign = quote.changePercent >= 0 ? '+' : '';
        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: `  ${quote.name} ¥${quote.price} (${sign}${quote.changePercent.toFixed(2)}%)`,
              color: quote.changePercent >= 0 ? '#ef4444' : '#22c55e',
            },
          },
        });
      } catch {
        // 忽略解析失败
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  dispose() {
    this.decorationType.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
```

---

## 附录 I: 构建/测试/发布流程

### I.1 项目初始化

```bash
# 使用官方脚手架
npm install -g yo generator-code
yo code

# 选择:
# - New Extension (TypeScript)
# - Extension name: cyber-monopoly
# - Identifier: cyber-monopoly
# - Description: A-share market tool
# - Enable JavaScript: No
# - Setup testing: Yes
```

### I.2 开发脚本 (package.json scripts)

```json
{
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile",
    "test": "node ./out/test/runTest.js",
    "lint": "eslint src --ext ts",
    "package": "vsce package",
    "publish": "vsce publish"
  }
}
```

### I.3 tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020", "DOM"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", ".vscode-test", "out"]
}
```

### I.4 .vscodeignore

```
.vscode/**
.vscode-test/**
src/**
tsconfig.json
.eslintrc.json
.gitignore
**/*.ts
**/*.ts.map
node_modules/**
```

### I.5 运行测试

```bash
# 单元测试
npm test

# 集成测试 (启动 VSCode 实例)
npm run test

# 手动测试
# 1. F5 启动 Extension Host
# 2. 在调试窗口中测试所有功能
# 3. 检查 Developer Tools 控制台无报错
```

### I.6 打包与发布

```bash
# 安装 vsce
npm install -g @vscode/vsce

# 登录 (需要 Azure DevOps PAT)
vsce login your-publisher-name

# 打包 (生成 .vsix 文件)
vsce package

# 本地安装测试
code --install-extension cyber-monopoly-1.0.0.vsix

# 发布到 Marketplace
vsce publish

# 发布到 OpenVSX (可选)
npx ovsx publish
```

### I.7 CI/CD (GitHub Actions 示例)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run compile
      - run: npm test
      - run: npm run lint
```

---

## 附录 J: 安全最佳实践

### J.1 API 密钥存储

**不要**将 API Key 明文存储在配置中，使用 VSCode SecretStorage:

```typescript
// 存储密钥
async function saveApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
  await context.secrets.store('cyberMonopoly.llm.apiKey', apiKey);
}

// 读取密钥
async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return await context.secrets.get('cyberMonopoly.llm.apiKey');
}

// 删除密钥
async function deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete('cyberMonopoly.llm.apiKey');
}
```

### J.2 网络请求安全

```typescript
// 所有外部请求添加超时控制
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
```

### J.3 Webview 安全

```typescript
// Webview 配置
{
  enableScripts: true,           // 仅必要时开启
  retainContextWhenHidden: true, // 保持状态
  localResourceRoots: [          // 限制本地资源范围
    vscode.Uri.joinPath(context.extensionUri, 'webviews'),
  ],
  portMapping: [],               // 不映射端口
}

// 使用 CSP (Content Security Policy)
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} https://unpkg.com; style-src ${webview.cspSource} 'unsafe-inline'; connect-src https:;">
```

---

## 附录 K: 限流与退避策略

### K.1 API 请求限流

新浪 API 有频率限制，需要实现客户端限流:

```typescript
// api/rateLimiter.ts

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private minIntervalMs = 1000; // 最小请求间隔
  private lastRequestTime = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const wait = this.minIntervalMs - (now - this.lastRequestTime);
      if (wait > 0) {
        await new Promise(r => setTimeout(r, wait));
      }
      
      const fn = this.queue.shift()!;
      await fn();
      this.lastRequestTime = Date.now();
    }
    
    this.processing = false;
  }
}
```

### K.2 指数退避重试

```typescript
// api/retry.ts

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      const delay = baseDelayMs * Math.pow(2, i);
      console.warn(`[赛博大富翁] 请求失败，${delay}ms 后重试 (${i + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError!;
}
```

### K.3 在 API 调用中使用

```typescript
const rateLimiter = new RateLimiter();

export async function getRealtimeQuote(code: string): Promise<RealtimeQuote> {
  return rateLimiter.add(() =>
    fetchWithRetry(async () => {
      const url = `https://hq.sinajs.cn/list=${toSinaCode(code)}`;
      const resp = await fetchWithTimeout(url);
      // ... 解析逻辑
    })
  );
}
```

---

## 附录 B: 常见问题排查

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 侧边栏不显示 | activationEvents 未触发 | 检查 `onStartupFinished` |
| 行情全是 "--" | API 请求失败 | 检查网络/Referer header |
| K线图空白 | lightweight-charts 未加载 | 检查 CDN URL / enableScripts |
| AI 回复报错 | API Key 无效 | 检查 Settings 配置 |
| 状态栏不显示 | showStatusBar=false | 检查配置 |
| 数据重启丢失 | globalState 未写入 | 检查 dispose 前是否保存 |
