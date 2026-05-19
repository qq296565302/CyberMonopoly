# 赛博大富翁 智能体协作任务表

> **生成日期**: 2026-05-09 | **当前版本**: v1.1.5 | **目标**: 项目检查、问题修复、需求规划、开发执行、测试验收、安全检查

---

## 一、项目概况

| 项目属性 | 值 |
|---|---|
| 项目路径 | `D:\KaKaRoot\赛博大富翁VSCODE` |
| 当前版本 | `1.1.5` |
| 类型 | VSCode 扩展（A股行情工具） |
| 语言 | TypeScript |
| 核心模块 | 16 个 `.ts` 源文件 |
| 功能板块 | 自选股、行情、K线/分时图、快讯、AI助手、状态栏、老板键 |
| 构建工具 | tsc + vsce package |
| 数据源 | 新浪财经、东方财富、腾讯财经 |

---

## 二、团队角色与职责

| 角色 | 职责 | 输出物 |
|---|---|---|
| **产品经理（PM）** | 需求调研、产品设计、功能优先级排序 | 需求清单、功能说明、验收标准、版本计划 |
| **软件开发工程师（Dev）** | 代码阅读、问题定位、代码实现、编译验证 | 技术分析、代码修改、编译结果、开发说明 |
| **测试工程师（QA）** | 功能测试、回归测试、边界测试、异常测试 | 测试用例、测试结果、Bug清单、验收结论 |
| **安全工程师（Sec）** | 凭据安全、WebView安全、输入安全、依赖安全 | 安全检查报告、风险等级、修复建议、修复复测 |

---

## 三、产品经理（PM）任务清单

| 任务编号 | 任务名称 | 输入文件 | 具体工作内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| PM-01 | 现有功能清单梳理 | `README.md`、`package.json`（contributes 段） | 逐项对照 `contributes.commands`、`contributes.configuration`，列出所有已注册功能与文档描述的差异 | 功能差异对照表 | **P0** |
| PM-02 | 用户反馈问题归类 | 本次会话历史记录 | 将历史对话中所有用户反馈整理为结构化问题清单（现象/频率/影响程度） | 问题清单（含复现路径） | **P0** |
| PM-03 | 行情板块体验评估 | `src/provider/marketProvider.ts`（getChildren 部分） | 检查行情板块树形结构的信息密度和层级深度是否合理，是否有数据为空时的占位提示 | 行情板块优化建议文档 | **P1** |
| PM-04 | 搜索交互流程梳理 | `src/commands/watchlist.ts`（addToWatchlist） | 分析当前「输入框→列表→选择→添加」两步式流程的用户感受，确认是否有更流畅的替代方案 | 搜索流程优化方案 | **P1** |
| PM-05 | 自选股管理功能增强需求 | `src/provider/watchlistProvider.ts` | 调研同类产品（东方财富、同花顺），列出应补充的自选股功能（分组、备注、置顶、批量操作） | v1.2.0 自选股增强需求文档 | **P2** |
| PM-06 | AI助手能力边界定义 | `src/chat/llmClient.ts`、`src/webview/aiChatPanel.ts` | 明确 AI 助手当前能力（仅对话），定义未来增强方向（自动分析、策略回测、智能提醒） | AI 助手产品路线图 | **P2** |
| PM-07 | 版本发布计划制定 | PM-01 至 PM-06 全部输出 | 根据问题优先级和需求依赖关系，制定 v1.1.6（修bug）和 v1.2.0（新功能）两个迭代计划 | 版本发布计划表 | **P0** |

---

## 四、软件开发工程师（Dev）任务清单

| 任务编号 | 任务名称 | 输入文件 | 具体工作内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| DEV-01 | 行情接口稳定性加固 | `src/api/market.ts`（marketFetch 函数） | 检查当前重试机制是否引入了资源泄露（每次重试创建新 req 但未清理旧的 timeout）。补充 HTTP 状态码校验（当前只有 error/timeout 两个失败路径，未判断 4xx/5xx） | 修复后的 marketFetch 函数 | **P0** |
| DEV-02 | 行情缓存 TTL 过短问题 | `src/api/market.ts`（CACHE_TTL=10000） | 当前缓存 TTL 仅 10 秒，非交易时间数据不会变化，TTL 可延长到 5 分钟。同时分离内存缓存（热缓存）和 globalState 缓存（冷缓存），避免扩展重启后数据丢失 | 修改后的缓存策略代码 | **P0** |
| DEV-03 | 成交额差额计算修正 | `src/api/market.ts`（getTurnoverDiff） | 当前实现用 `trends2` 接口获取昨日分时数据，时间比较用字符串 `time <= currentTime`，跨日时逻辑可能错误。需补充边界条件处理 | 修正后的 getTurnoverDiff | **P0** |
| DEV-04 | 指数 K 线图适配 | `src/api/eastmoney.ts`（getFullKlineData） | 当前 `getFullKlineData` 用 `detectMarket` 判断 SH/SZ，但港股指数（HSI/HSCEI/HSTECH）和北证（899050）会被错误分类，导致 secid 拼接错误，K线图无法打开 | 指数 secid 映射表及修改代码 | **P0** |
| DEV-05 | 行情刷新耗时优化 | `src/api/market.ts`（getIndexQuotes） | 当前 getIndexQuotes 顺序请求 10 个指数（含 3 个港股），每个含重试，耗时可达 30+ 秒。应改为分批并行（每批 3-4 个）或用 `Promise.allSettled` 并发 | 并发优化后的 getIndexQuotes | **P1** |
| DEV-06 | WebView CSP 安全加固 | `src/webview/chartPanel.ts`（getWebviewContent） | 当前 CSP 允许 `style-src 'unsafe-inline'`，可改为使用 nonce；`overviewPanel.ts` 直接使用 `'unsafe-inline'` 的 script-src，有 XSS 风险 | 加固后的 CSP 策略 | **P1** |
| DEV-07 | LLM API Key 保护 | `src/chat/llmClient.ts` | 当前 LLM API Key 通过 `vscode.workspace.getConfiguration` 读取后直接拼入请求头，日志中可能泄露。需检查所有日志点并确保 Key 不被输出 | 安全的 Key 处理代码 | **P1** |
| DEV-08 | 自选股数据持久化可靠性 | `src/provider/watchlistProvider.ts` | 检查 `StateManager` 是否在扩展 deactiviate 时正确保存数据，是否有数据丢失风险（globalState vs workspaceState 选择） | 数据持久化加固方案 | **P1** |
| DEV-09 | 港股指数行情展示优化 | `src/provider/marketProvider.ts`、`src/api/market.ts` | 港股交易时间与 A 股不同，需单独判断港股交易时间；当前港股指数用 A 股的字段格式解析（price/100），需确认港股数据格式是否一致 | 港股适配代码 | **P1** |
| DEV-10 | 异常统一处理中间层 | `src/extension.ts`（startAutoRefresh） | 当前 refreshTimer 中 try-catch 静默吞掉错误，无法追踪问题。需统一错误上报（如 VSCode Output Channel） | 错误上报机制代码 | **P1** |
| DEV-11 | 新增「行情加载中」占位状态 | `src/provider/marketProvider.ts` | 当前行情数据为空时（首次启动、API 全部失败），TreeView 显示空白。应增加「加载中...」或「数据暂不可用」占位项 | 占位状态 TreeItem 代码 | **P2** |
| DEV-12 | 分时图成交量柱状图 | `src/webview/chartPanel.ts` | 检查分时图模式下成交量是否正确渲染（历史对话提到分时图缺失成交量），需确保 intraday 数据的 volume 字段被正确传入 volumeSeries | 修复后的分时图成交量渲染 | **P2** |

---

## 五、测试工程师（QA）任务清单

| 任务编号 | 任务名称 | 输入文件 | 具体工作内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| QA-01 | 自选股 CRUD 测试 | `src/commands/watchlist.ts`、`src/provider/watchlistProvider.ts` | 测试场景：添加股票→显示→删除→重启后是否保留；重复添加同一只股票；添加无效代码（如 999999）；添加港股代码 | 自选股测试报告 | **P0** |
| QA-02 | K线图/分时图加载测试 | `src/webview/chartPanel.ts` | 测试场景：正常 A 股代码、港股指数、北证股票、无效代码、网络断开时的图表加载行为；切换日 K/分时后数据是否正确 | K线图测试报告 | **P0** |
| QA-03 | 行情板块数据完整性 | `src/provider/marketProvider.ts` | 测试场景：交易时间 vs 非交易时间；API 全部失败 vs 部分失败；缓存是否正确展示；各子板块（指数/分布/行业/概念/排行榜）是否都正常渲染 | 行情板块测试报告 | **P0** |
| QA-04 | 命令注册完整性 | `src/extension.ts` | 验证 `package.json` 中注册的所有命令是否都能在 VSCode 命令面板中找到并正常执行，包括 `cyberMonopoly.refreshMarket`、`cyberMonopoly.toggleBossKey` 等 | 命令测试清单 | **P0** |
| QA-05 | 自动刷新机制测试 | `src/extension.ts`（startAutoRefresh） | 修改 `refreshInterval` 配置值，验证定时器是否正确重启；快速切换配置是否导致多个定时器并行 | 定时器测试报告 | **P1** |
| QA-06 | 老板键功能测试 | `src/extension.ts`（toggleBossKey）、所有 WebView | 测试各 WebView 面板（图表、概览、设置、AI、新闻、详情）的老板键效果是否一致；禁用老板键后快捷键是否有正确提示 | 老板键测试报告 | **P1** |
| QA-07 | 搜索框边界测试 | `src/commands/watchlist.ts`（addToWatchlist） | 测试场景：空输入、超长输入、特殊字符（`<script>`）、快速连续输入、输入后取消再输入 | 搜索框安全测试报告 | **P1** |
| QA-08 | AI 助手功能测试 | `src/chat/llmClient.ts`、`src/webview/aiChatPanel.ts` | 测试场景：无 API Key 时的提示；API 超时/错误时的行为；长对话上下文管理 | AI 助手测试报告 | **P2** |
| QA-09 | 性能与内存测试 | 全部 | 检查扩展启动后内存占用；长时间运行（1小时+）是否有内存泄露（重点关注 marketCache 和 requestCache）；大量自选股（50+）时刷新性能 | 性能测试报告 | **P2** |
| QA-10 | 多窗口/多实例测试 | `src/extension.ts` | 打开多个 VSCode 窗口时，扩展是否正常工作；状态是否隔离 | 多实例测试报告 | **P2** |

---

## 六、安全工程师（Sec）任务清单

| 任务编号 | 任务名称 | 输入文件 | 具体工作内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| SEC-01 | 凭据硬编码检查 | `src/api/eastmoney.ts` | 发现 `searchStocks` 中硬编码了 `token=D43BF722C8E33BDC906FB84D85E326E8`（第 296 行附近），以及 `getFinanceData` 中使用固定 client 参数。需评估泄露风险并提出脱敏方案 | 凭据检查报告及修复方案 | **P0** |
| SEC-02 | WebView XSS 审查 | `src/webview/overviewPanel.ts`、`src/webview/chartPanel.ts` | `overviewPanel.ts` CSP 允许 `script-src 'unsafe-inline'`，任意注入脚本可执行；`chartPanel.ts` 使用 nonce 保护 script 但允许 `style-src 'unsafe-inline'`。需评估 `postMessage` 数据是否经过 HTML 转义 | XSS 修复方案 | **P0** |
| SEC-03 | 依赖安全审计 | `package.json`、`package-lock.json` | 检查所有第三方依赖（主要是 `vscode` engine 依赖）是否有已知漏洞；确认 `lightweight-charts` 是否从可信 CDN 获取（当前是本地 assets） | 依赖安全报告 | **P1** |
| SEC-04 | 网络通信安全 | `src/api/sina.ts`、`src/api/eastmoney.ts`、`src/api/market.ts` | 检查所有 HTTP 请求是否强制 HTTPS；评估伪造响应风险（东方财富/新浪 API 均使用 HTTPS，但未验证证书）；检查 User-Agent/Referer 伪造是否违反使用条款 | 网络安全评估报告 | **P1** |
| SEC-05 | 输入校验审查 | `src/commands/watchlist.ts`、`src/api/sina.ts`（toSinaCode） | 股票代码通过字符串拼接直接嵌入 URL，未做 URL 编码或注入检查；需评估恶意输入（如包含 `&`、`#` 的字符串）是否能被利用进行 SSRF | 输入校验修复方案 | **P1** |
| SEC-06 | 数据存储安全 | `src/storage/stateManager.ts`、`src/provider/marketProvider.ts` | 检查 `globalState` 中存储的缓存数据是否包含敏感信息；评估缓存数据量是否有上限（防止无限增长） | 数据存储安全报告 | **P1** |
| SEC-07 | LLM 通信安全 | `src/chat/llmClient.ts` | API Key 通过 Bearer Token 明文传输；需评估是否支持 API Key 加密存储（VSCode SecretStorage）；检查请求 body 是否会泄露用户对话内容 | LLM 安全加固方案 | **P1** |
| SEC-08 | CSP 最终加固方案 | 所有 `src/webview/*.ts` | 统一所有 WebView 的 CSP 策略：移除 `'unsafe-inline'`，全部使用 nonce；style 部分考虑使用 `nonce` 或 `hash` 替代 `unsafe-inline` | 统一 CSP 模板代码 | **P1** |
| SEC-09 | Content-Security-Policy 审查报告 | 所有 `src/webview/*.ts` | 逐个审查 6 个 WebView 面板的 CSP 配置，列出每个面板的 CSP 风险等级和修复优先级 | CSP 审查明细表 | **P1** |
| SEC-10 | 扩展发布安全检查 | `package.json`、所有构建产物 | 检查打包的 `.vsix` 文件中是否包含敏感文件（如 `test_api.js`、`.env`、本地配置）；确认 `vscodeignore` 配置 | 发布前安全检查清单 | **P2** |

---

## 七、任务依赖关系与执行顺序

```
阶段一（并行启动 — 项目摸底）
┌──────────────────────────────────────────────┐
│  PM-01  PM-02  SEC-01  SEC-02  QA-04         │
└──────────────────────────────────────────────┘
        ↓
阶段二（修复高优问题）
┌──────────────────────────────────────────────┐
│  DEV-01  DEV-02  DEV-03  DEV-04  SEC-03      │
│  SEC-04  SEC-05                              │
└──────────────────────────────────────────────┘
        ↓
阶段三（修复验证）
┌──────────────────────────────────────────────┐
│  QA-01  QA-02  QA-03  QA-05  QA-06  QA-07   │
└──────────────────────────────────────────────┘
        ↓
阶段四（需求规划与安全加固）
┌──────────────────────────────────────────────┐
│  PM-03  PM-04  PM-05  PM-06  PM-07           │
│  SEC-06  SEC-07  SEC-08                      │
└──────────────────────────────────────────────┘
        ↓
阶段五（优化开发）
┌──────────────────────────────────────────────┐
│  DEV-05  DEV-06  DEV-07  DEV-08  DEV-09      │
│  DEV-10  DEV-11  DEV-12                      │
└──────────────────────────────────────────────┘
        ↓
阶段六（最终验收）
┌──────────────────────────────────────────────┐
│  QA-08  QA-09  QA-10  SEC-09  SEC-10         │
└──────────────────────────────────────────────┘
```

---

## 八、已发现的关键问题速查表

| 问题编号 | 问题描述 | 涉及文件 | 风险等级 | 对应任务 |
|---|---|---|---|---|
| BUG-01 | 东方财富 `ulist.np` API 间歇性 socket hang up | `src/api/market.ts` | 🔴 高 | DEV-01 |
| BUG-02 | 指数顺序请求导致行情刷新耗时 30 秒+ | `src/api/market.ts`（getIndexQuotes） | 🟡 中 | DEV-05 |
| BUG-03 | 港股指数 secid 在 K 线图中拼接错误 | `src/api/eastmoney.ts`（getFullKlineData） | 🔴 高 | DEV-04 |
| BUG-04 | 成交额差额跨日时计算可能错误 | `src/api/market.ts`（getTurnoverDiff） | 🟡 中 | DEV-03 |
| SEC-01 | 搜索 API Token 硬编码 | `src/api/eastmoney.ts` 第 296 行 | 🟡 中 | SEC-01 |
| SEC-02 | overviewPanel CSP 允许 unsafe-inline script | `src/webview/overviewPanel.ts` | 🔴 高 | SEC-02 |
| PERF-01 | 内存缓存无上限，长时间运行可能内存泄露 | `src/api/market.ts`、`src/api/sina.ts` | 🟢 低 | SEC-06 |

---

## 九、版本规划建议

### v1.1.6（稳定性修复版本）

| 任务 | 内容 |
|---|---|
| DEV-01 ~ DEV-04 | 修复高优 bug（接口稳定性、缓存、计算错误、港股适配） |
| SEC-01, SEC-02 | 修复高优安全问题（硬编码 Token、CSP XSS） |
| QA-01 ~ QA-04 | 回归验证 |

**发布条件**：
- 所有 P0 任务完成
- 行情板块在交易时间和非交易时间均能正常展示
- K线图支持所有指数类型（A股/港股/北证）
- 无高危安全漏洞

### v1.2.0（体验优化版本）

| 任务 | 内容 |
|---|---|
| DEV-05 ~ DEV-10 | 性能与健壮性优化 |
| PM-03 ~ PM-05 | 需求驱动的功能增强（搜索优化、自选股增强） |
| SEC-03 ~ SEC-08 | 全面安全加固 |
| QA-05 ~ QA-07 | 回归验证 |

**发布条件**：
- 所有 P1 任务完成
- 行情刷新耗时 < 5 秒
- WebView CSP 全面加固
- 用户体验有明显提升

---

## 十、各智能体协作规则

### 10.1 通用规则

- 不凭空假设功能存在，必须基于代码事实
- 不重复造轮子，优先复用已有实现
- 修改代码前先阅读相关上下文
- 不引入项目未使用的依赖
- 不主动提交或泄露任何密钥

### 10.2 产品经理规则

- 需求必须可实现、可验证
- 避免空泛描述（如"提升体验"必须拆成可执行项）
- 优先级定义清晰（P0 必修、P1 重要、P2 可选）

### 10.3 开发工程师规则

- 修改时保持代码风格一致（参照现有 TypeScript 风格）
- 优先编辑现有文件，避免新增无意义文件
- 保持模块职责清晰
- 每次修改后必须执行 `npm run compile` 验证编译

### 10.4 测试工程师规则

- 必须区分"已修复"和"待验证"
- 测试结果必须基于功能逻辑，不靠猜测
- 每个测试场景必须包含：前置条件、操作步骤、预期结果、实际结果

### 10.5 安全工程师规则

- 所有安全建议必须给出具体修复方式
- 风险不能只描述问题，必须给出落地方案
- 风险等级定义：🔴 高（可被利用造成数据泄露/代码执行）、🟡 中（潜在风险，需条件触发）、🟢 低（最佳实践偏离，风险较低）

---

## 十一、最终交付物清单

| 序号 | 交付物 | 负责角色 | 状态 |
|---|---|---|---|
| 1 | 项目检查报告（当前状态/主要问题/风险） | PM + Dev | ⬜ 待完成 |
| 2 | 问题修复记录（问题描述/根因/修复方案/验证结论） | Dev | ⬜ 待完成 |
| 3 | 需求清单（P0/P1/P2 分层，含验收标准） | PM | ⬜ 待完成 |
| 4 | 开发任务清单（任务名/负责角色/模块/优先级/输出） | Dev | ⬜ 待完成 |
| 5 | 测试报告（测试范围/测试结果/遗留问题） | QA | ⬜ 待完成 |
| 6 | 安全检查报告（风险点/等级/修复建议/修复结果） | Sec | ⬜ 待完成 |
| 7 | v1.1.6 稳定版发布包 | Dev | ⬜ 待完成 |
| 8 | v1.2.0 版本计划 | PM | ⬜ 待完成 |
