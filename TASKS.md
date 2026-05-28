# 赛博大富翁 - 代码改进任务清单

> 基于代码审查结果，按优先级排列的改进任务。

---

## 一、高优先级

### TASK-001: 统一 HTTP 请求模块，消除连接/内存泄漏

**问题描述：** 三个 API 文件各自实现了几乎相同的 HTTP 请求逻辑，且响应流在重定向/错误时未 drain，导致 socket 泄漏和内存持续增长。

**涉及文件：**
- `src/api/sina.ts` (fetchWithReferer, fetchOnce, requestCache)
- `src/api/eastmoney.ts` (emFetch, fetchOnce, emCache)
- `src/api/market.ts` (marketFetch, marketFetchBuf, marketCache, marketBufCache)

**完成内容：**

- [x] 创建 `src/utils/httpClient.ts` 统一 HTTP 客户端模块
  - 实现 `HttpClient` 类，支持：请求缓存（带 TTL 和 LRU 上限）、自动重试（指数退避）、超时控制、重定向跟随、Referer/User-Agent 头设置
  - 缓存策略：非交易时段 TTL 5 分钟，交易时段 TTL 15 秒，最大缓存条目数 200
  - 提供 `fetchText(url, options)`、`fetchBuffer(url, options)`、`fetchGbk(url, options)` 三个方法
- [x] 修复响应流 drain 问题
  - 重定向时调用 `res.resume()` 消费剩余数据
  - 非 2xx 响应读取 body 后确保连接正确关闭
  - 请求错误时确保 `req.destroy()` 被调用
- [x] 改造 `src/api/sina.ts`
  - 删除 `fetchWithReferer`、`fetchOnce`、`requestCache` 及所有内部 HTTP 实现
  - 所有内部函数改用 `httpClient` 实例
  - 导出的公开函数签名不变
- [x] 改造 `src/api/eastmoney.ts`
  - 删除 `emFetch`、`fetchOnce`、`emCache` 及所有内部 HTTP 实现
  - 改用 `httpClient` 实例
- [x] 改造 `src/api/market.ts`
  - 删除 `marketFetch`、`marketFetchBuf`、`marketCache`、`marketBufCache` 及所有内部 HTTP 实现
  - 改用 `httpClient` 实例
  - `isATradingTime` / `isHKTradingTime` 迁移至 `httpClient.ts` 并通过 re-export 保持兼容
  - 涨跌分布的并发请求改用 `parallelLimit` 限制为 5 并发
- [x] 验证：TypeScript 编译通过，所有 API 函数行为不变

**预计工作量：** 1-2 天

---

### TASK-002: 重构工具执行体系，合并两套并行架构

**问题描述：** `src/chat/toolExecutor.ts`（1467 行）包含 14 个工具的完整实现，而 `src/chat/tools/` 目录下有基于 `ToolRegistry` 的另一套工具系统，两者并存但互不关联。

**涉及文件：**
- `src/chat/toolExecutor.ts`
- `src/chat/tools/base.ts`
- `src/chat/tools/quote.ts`
- `src/chat/tools/kline.ts`
- `src/chat/tools/finance.ts`
- `src/chat/tools/market.ts`
- `src/chat/tools/news.ts`
- `src/chat/tools/index.ts`
- `src/webview/aiChatPanel.ts`

**完成内容：**

- [x] 确定目标架构：以 `src/chat/tools/` 目录下的 `ToolRegistry` 为准
- [x] 将 `toolExecutor.ts` 中的 14 个工具实现迁移到 `tools/` 子模块
  - `get_stock_quote` / `get_batch_quotes` -> `tools/quote.ts`（已有，修复了循环引用）
  - `get_kline_summary` / `get_intraday_data` -> `tools/kline.ts`（已有）
  - `get_finance_summary` -> `tools/finance.ts`（已有）
  - `get_market_overview` / `get_market_distribution` / `get_hot_stocks` / `get_sector_list` -> `tools/market.ts`（已有）
  - `get_stock_news` / `get_7x24_news` / `get_research_reports` -> `tools/news.ts`（已有）
  - `open_chart` / `search_stock` -> 新建 `tools/action.ts`（已完成）
- [x] 保留 `toolExecutor.ts` 中的安全层
  - `sanitizeForPrompt` / `sanitizeToolOutput` / `sanitizeToolData` 迁移到 `src/utils/security.ts`
  - prompt 注入防护的正则模式迁移过去
- [x] 保留 `toolExecutor.ts` 中的类型定义
  - `ToolResult` / `ToolDefinition` / `ToolCall` / `ToolCallResult` 移至 `tools/base.ts` 为单一来源
- [x] 更新 `aiChatPanel.ts` 的 import 路径
  - `aiChatPanel.ts` 仍从 `toolExecutor.ts` 导入，`toolExecutor.ts` 作为薄代理层 re-export 所有接口
  - import 路径无需变更，保持向后兼容
- [x] 删除 `toolExecutor.ts` 中已迁移的代码，仅保留 re-export
  - 原 1467 行缩减为约 30 行的 re-export 代理
- [x] 确保 `tools/index.ts` 的 `initializeTools()` 在首次调用 `getToolDefinitions()` 时自动执行
- [x] 修复 `tools/quote.ts` 对 `toolExecutor.ts` 的循环引用
- [x] 验证：TypeScript 编译通过，所有 import 链路正确

**预计工作量：** 2-3 天

---

### TASK-003: 优化 AlertManager 频繁写入问题

**问题描述：** `syncAlertRules` 每次自选股刷新都全量重建所有规则，触发 `persistAlertData` 执行 5 次独立的 `state.update`。自动刷新间隔 10 秒，意味着每 10 秒就有 5 次不必要的状态写入。

**涉及文件：**
- `src/notification/alert.ts`
- `src/extension.ts`

**完成内容：**

- [x] 合并 `persistAlertData` 的 5 次 `state.update` 为 1 次
  - 将 5 个独立的 storage key 合并为一个 JSON 对象 `cyberMonopoly.alertState`
  - 结构：`{ times: {}, percents: {}, directions: {}, priceTimes: {}, priceTriggered: {} }`
  - 更新 `addRule` 中的读取逻辑（通过 `loadState()` 带缓存读取）
  - 更新 `persistAlertData` 为单次写入
- [x] 优化 `syncAlertRules` 为增量更新
  - 新增 `syncRules(stocks)` 方法，维护 `lastSyncedStocks` 快照
  - 比较当前 stocks 与快照，仅对新增/修改/删除的股票调用 `addRule`/`removeRule`
  - `alertPrice` 或 `alertPercent` 变更时才更新对应规则
  - `extension.ts` 中 `syncAlertRules` 改为调用 `alertManager.syncRules()`
- [x] 降低 `persistAlertData` 调用频率
  - 使用 debounce 机制，1 秒内的多次调用合并为一次
  - `check()` 方法中所有 alert 处理完毕后统一调用 `persistAlertData()`
- [x] 迁移旧数据
  - `migrateOldKeys()` 在构造时自动执行
  - 检查旧的 5 个 key 是否存在，存在则合并到新 key 并删除旧 key
- [x] 验证：TypeScript 编译通过

**预计工作量：** 0.5-1 天

---

## 二、中优先级

### TASK-005: 消除 hashColor / isEtfOrFund 代码重复

**问题描述：** `hashColor` 在 `sina.ts` 和 `eastmoney.ts` 中重复定义；`isEtfOrFund` 在 `watchlistProvider.ts` 和 `stockTicker.ts` 中重复定义。

**涉及文件：**
- `src/api/sina.ts`
- `src/api/eastmoney.ts`
- `src/provider/watchlistProvider.ts`
- `src/statusbar/stockTicker.ts`
- `src/models/stock.ts`

**完成内容：**

- [x] 在 `src/models/stock.ts` 中新增 `isEtfOrFund(code: string): boolean`
- [x] 在 `src/models/stock.ts` 中新增 `hashColor(str: string): [number, number, number]`
- [x] 更新 `src/api/sina.ts`：删除本地 `hashColor`，改为 import
- [x] 更新 `src/api/eastmoney.ts`：删除本地 `hashColor`，改为 import
- [x] 更新 `src/provider/watchlistProvider.ts`：删除本地 `isEtfOrFund`，改为从 `models/stock.ts` import
- [x] 更新 `src/statusbar/stockTicker.ts`：删除本地 `isEtfOrFund`，改为从 `models/stock.ts` import
- [x] 验证：TypeScript 编译通过，全项目仅 `models/stock.ts` 保留这两个函数定义

**预计工作量：** 0.5 天

---

### TASK-006: 封装 extension.ts 中的模块级变量为 AppState

**问题描述：** `extension.ts` 顶部有 17 个模块级变量（第 21-39 行），状态分散，不利于测试和维护。

**涉及文件：**
- `src/extension.ts`

**完成内容：**

- [x] 创建 `src/appState.ts`，定义 `AppState` 类
  - 封装所有核心服务（WatchlistProvider、NewsViewProvider、MarketProvider 等）
  - 封装可选组件（StockTicker、StreamProxy）
  - 封装定时器和状态标志
- [x] 将 `doActivateSync` 和 `doActivateAsync` 中的变量赋值改为操作 `AppState` 实例
  - `extension.ts` 从 323 行缩减为约 120 行
  - 仅保留 `activate`、`deactivate`、`migrateApiKeyToSecretStorage` 三个顶层函数
- [x] 将 `applyBossMode`、`startAutoRefresh`、`syncAlertRules` 改为 `AppState` 的方法
  - 新增 `toggleBossMode()`、`showRadio()`、`onConfigurationChanged()` 等方法
- [x] 将 `deactivate` 中的清理逻辑改为调用 `AppState.dispose()`
- [x] 导出 `AppState` 供需要的地方访问
- [x] 验证：TypeScript 编译通过

**预计工作量：** 1 天

---

### TASK-007: 限制涨跌分布的并发请求数

**问题描述：** `market.ts:392-404` 使用 `Promise.allSettled` 并发请求约 69 页数据（5500 / 80），无并发限制，短时间内产生大量 HTTP 连接。

**涉及文件：**
- `src/api/market.ts`

**完成内容：**

- [x] 实现简单的并发控制函数（或使用已有的 utils）
  ```
  async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]>
  ```
- [x] 将 `getMarketDistribution` 中的 `Promise.allSettled` 改为 `parallelLimit`，并发数限制为 5
- [x] 添加单页超时：每页请求 10 秒超时，失败不影响其他页
- [x] 验证：涨跌分布数据正常加载，网络请求不再瞬间爆发

> 注：此任务已在 TASK-001 中一并完成。

**预计工作量：** 0.5 天

---

### TASK-008: 加强安全防护

**问题描述：** Prompt 注入防护使用正则匹配，容易被变体绕过；HTML 消毒过于简单；NewsViewProvider 使用 `innerHTML`。

**涉及文件：**
- `src/chat/toolExecutor.ts`（或迁移后的 `src/utils/security.ts`）
- `src/webview/aiChatPanel.ts`
- `src/provider/newsProvider.ts`

**完成内容：**

- [x] 增强 prompt 注入检测
  - 添加 Unicode 同形字检测（Cyrillic а→a 等 14 组映射）
  - `sanitizeForPrompt` 和 `sanitizeToolOutput` 均支持同形字归一化后二次检测
  - 新增 15+ 注入模式（角色劫持、代码执行、中文变体等）
- [x] 修复 NewsViewProvider 的 innerHTML
  - `updateView()` 改为传递数据对象（`{ time, content, tag }`）而非 HTML 字符串
  - webview 端用 `buildNewsNode()` 辅助函数通过 DOM API 安全构建节点
  - `getHtml()` 中的初始渲染同样改为数据对象 + DOM 构建
  - 移除不再需要的 `escapeHtml()` 方法
- [x] 验证：TypeScript 编译通过，新闻内容不再通过 innerHTML 注入

**预计工作量：** 1-2 天

---

### TASK-009: 修复不支持港股/美股行情查询

**问题描述：** `detectMarket` 能识别 HK/US 市场，但 `sina.ts` 的 `toSinaCode` 和 `getBatchQuotes` 不处理这些代码，实际查询会失败或返回错误数据。

**涉及文件：**
- `src/api/sina.ts`
- `src/models/stock.ts`

**完成内容：**

- [ ] 扩展 `toSinaCode` 支持港股代码
  - 港股代码（如 `00700`）映射为 `rt_hk00700`
  - 或在 `getRealtimeQuote` / `getBatchQuotes` 中检测市场类型，对港股使用不同的 API
- [ ] 评估是否支持美股
  - 如果支持，需要确定数据源（新浪美股 API 或其他）
  - 新浪美股代码格式为 `gb_aapl` 等
- [ ] 对不支持的市场给出明确的错误提示
  - 在 `getRealtimeQuote` 开头检测市场类型
  - 对 HK/US 返回明确的"暂不支持该市场"错误信息
- [ ] 验证：添加港股代码时能正确提示或返回数据

**预计工作量：** 1 天（仅错误提示）或 2-3 天（完整支持港股）

---

### TASK-010: 修复自选股排序状态持久化问题

**问题描述：** 排序后调用 `saveWatchlist` 保存了排序后的顺序，但下次启动时行情未加载，`sortStocks` 依赖实时数据排序，实际顺序可能不符预期。

**涉及文件：**
- `src/provider/watchlistProvider.ts`

**完成内容：**

- [ ] 方案 A：保存排序模式而非排序后的数组
  - `saveWatchlist` 仅在增删股票时调用
  - 排序操作不改变持久化的数组顺序
  - 每次刷新行情后自动按当前排序模式重新排序
  - 排序模式已通过 `state.setSetting('sortMode', mode)` 持久化，只需在 `refresh()` 中始终调用 `sortStocks`
- [ ] 方案 B：保存排序索引
  - 在 WatchStock 中增加 `sortIndex` 字段
  - 排序后更新 `sortIndex` 并保存
  - 启动时按 `sortIndex` 排序
- [ ] 推荐方案 A，改动最小
- [ ] 修改 `refresh()` 方法：移除 `if (this.currentSortMode !== 'time-asc')` 的条件判断，始终在行情更新后调用 `sortStocks(this.currentSortMode)`
- [ ] 修改 `sortStocks` 中对 `time-asc` 模式的处理：不调用 `saveWatchlist`
- [ ] 验证：设置按涨跌幅排序后重启扩展，排序模式保持

**预计工作量：** 0.5 天

---

## 三、低优先级

### TASK-011: 添加全局未捕获异常处理

**问题描述：** 扩展没有注册 `unhandledRejection` 处理器，异步错误可能导致静默失败。

**涉及文件：**
- `src/extension.ts`
- `src/utils/logger.ts`

**完成内容：**

- [ ] 在 `activate` 函数开头添加：
  ```
  process.on('unhandledRejection', (reason) => {
    logger.error('未处理的 Promise 拒绝', reason);
  });
  ```
- [ ] 在 `deactivate` 中移除监听器
- [ ] 验证：故意制造一个未捕获的 Promise rejection，确认 Logger 输出了错误日志

**预计工作量：** 0.5 天

---

### TASK-012: 统一 MarketProvider 中的日志使用

**问题描述：** `marketProvider.ts` 使用 `console.warn` 和 `console.log`，而项目有统一的 `Logger` 模块。

**涉及文件：**
- `src/provider/marketProvider.ts`

**完成内容：**

- [ ] 添加 `import { logger } from '../utils/logger'`
- [ ] 将所有 `console.warn('[赛博大富翁]...')` 替换为 `logger.warn('...')`
- [ ] 将所有 `console.log('[赛博大富翁]...')` 替换为 `logger.debug('...')` 或 `logger.info('...')`
- [ ] 验证：Output Channel 中能看到行情刷新日志

**预计工作量：** 0.5 天

---

### TASK-013: 缓存工具定义，避免重复创建

**问题描述：** `getToolDefinitions()` 每次调用都重新构建 14 个工具定义对象。

**涉及文件：**
- `src/chat/toolExecutor.ts`（或迁移后的 `src/chat/tools/index.ts`）

**完成内容：**

- [ ] 在模块顶层缓存工具定义：
  ```
  let _cachedDefinitions: ToolDefinition[] | null = null;
  export function getToolDefinitions(): ToolDefinition[] {
    if (!_cachedDefinitions) {
      _cachedDefinitions = [/* ... */];
    }
    return _cachedDefinitions;
  }
  ```
- [ ] 如果工具注册是动态的（支持插件），提供 `invalidateCache()` 方法
- [ ] 验证：功能无变化，减少 GC 压力

**预计工作量：** 0.5 天

---

### TASK-014: 修复 get7x24News 使用正则解析 JSON

**问题描述：** `sina.ts:428` 使用 `text.match(/\{.*\}/s)` 提取 JSON，不够健壮。

**涉及文件：**
- `src/api/sina.ts`

**完成内容：**

- [ ] 改为直接 `JSON.parse(text)`，因为 API 返回的就是纯 JSON
- [ ] 如果 API 返回的是 JSONP 格式，使用 JSONP 提取模式（类似 `eastmoney.ts:176` 的 `jQuery(...)` 匹配）
- [ ] 添加 try-catch 包裹，解析失败时返回空数组并记录警告
- [ ] 验证：快讯功能正常加载

**预计工作量：** 0.5 天

---

### TASK-015: 清理废弃配置项 llmApiKey

**问题描述：** `package.json` 中 `llmApiKey` 标记为已废弃但仍保留在 schema 中。

**涉及文件：**
- `package.json`
- `src/extension.ts`

**完成内容：**

- [ ] 确认迁移逻辑 `migrateApiKeyToSecretStorage` 已覆盖所有场景
- [ ] 从 `package.json` 的 `contributes.configuration.properties` 中删除 `cyberMonopoly.llmApiKey`
- [ ] 保留 `extension.ts` 中的迁移代码（兼容旧版本用户），添加注释说明何时可以移除
- [ ] 验证：新安装用户不会看到废弃配置项，旧用户升级后 API Key 自动迁移

**预计工作量：** 0.5 天

---

### TASK-016: 补充单元测试

**问题描述：** 项目配置了测试框架但没有任何测试文件。

**涉及文件：**
- 新建 `src/test/` 目录

**完成内容：**

- [ ] 创建基础测试结构
  ```
  src/test/
    utils/
      security.test.ts      // sanitizeForPrompt, sanitizeToolOutput 测试
      httpClient.test.ts     // HTTP 客户端测试（mock）
    models/
      stock.test.ts          // detectMarket, isEtfOrFund 测试
    chat/
      toolExecutor.test.ts   // 工具执行路由测试
    api/
      sina.test.ts           // API 解析逻辑测试
  ```
- [ ] 优先为以下函数编写测试：
  - `detectMarket()`：覆盖 SH/SZ/BJ/HK/US 各市场
  - `sanitizeForPrompt()`：覆盖已知注入模式
  - `isEtfOrFund()`：覆盖 ETF/基金/普通股票
  - `parseShortcutCommand()`：覆盖各种快捷指令格式
  - `getPercentBucket()` / `getCoolingTime()`：覆盖涨跌幅区间逻辑
- [ ] 配置 `npm test` 命令可正常运行
- [ ] 目标：核心工具函数测试覆盖率 > 80%

**预计工作量：** 2-3 天

---

## 四、任务依赖关系

```
TASK-001 (HTTP模块)  ──┐
                       ├──> TASK-002 (工具架构) ──> TASK-013 (缓存工具定义)
TASK-005 (消除重复) ──┘

TASK-003 (Alert优化) ── 独立
TASK-004 (老板键修复) ── 独立
TASK-006 (AppState) ── 独立，但建议在 TASK-001/002 之后
TASK-007 (并发限制) ── 独立
TASK-008 (安全防护) ── 依赖 TASK-002（security.ts 迁移后）
TASK-009 (港股支持) ── 依赖 TASK-001（统一 HTTP 后更易扩展）
TASK-010 (排序修复) ── 独立
TASK-011~016 ── 均可独立执行
```

## 五、建议执行顺序

1. **第一批（第 1-2 周）：** TASK-004, TASK-003, TASK-005, TASK-010, TASK-012 — 改动小、风险低、收益明确
2. **第二批（第 3-4 周）：** TASK-001, TASK-007, TASK-011, TASK-014, TASK-015 — 基础设施改进
3. **第三批（第 5-6 周）：** TASK-002, TASK-006, TASK-008 — 架构重构，影响面大
4. **第四批（第 7-8 周）：** TASK-009, TASK-013, TASK-016 — 功能扩展和质量保障
