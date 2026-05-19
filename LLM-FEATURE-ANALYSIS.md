# 赛博大富翁 LLM 功能分析与多智能体协作开发文档

> **生成日期**: 2026-05-09 | **当前版本**: v1.1.5 | **目标**: LLM 功能检查、差距分析、开发规划、多角色协作

---

## 一、LLM 现有功能清单

### 1.1 涉及文件

| 文件 | 职责 | 代码行数 |
|---|---|---|
| `src/chat/llmClient.ts` | LLM API 客户端（OpenAI 兼容） | ~80 行 |
| `src/webview/aiChatPanel.ts` | AI 聊天 WebView 面板 | ~300 行 |
| `src/commands/ai.ts` | AI 相关命令注册 | ~70 行 |
| `src/webview/settingsPanel.ts` | 设置面板（含 LLM 配置） | ~127 行 |

### 1.2 已实现功能

| 功能 | 实现状态 | 说明 |
|---|---|---|
| OpenAI 兼容 API 调用 | ✅ 已实现 | 支持 `/chat/completions` 接口 |
| API Key 加密存储 | ✅ 已实现 | 通过 VSCode SecretStorage 存储 |
| API Key 脱敏处理 | ✅ 已实现 | 错误日志中 Key 替换为 `***` |
| 中止请求 | ✅ 已实现 | AbortController 支持 |
| 动态更新 Key | ✅ 已实现 | `updateApiKey` 方法 |
| 基础对话 | ✅ 已实现 | 用户输入→AI 回复 |
| 股票代码注入 | ✅ 已实现 | System Prompt 自动注入自选股代码表 |
| 对话历史 | ✅ 已实现 | 保留最近 50 条消息（globalState） |
| 清空对话 | ✅ 已实现 | 支持一键清空 |
| 老板键支持 | ✅ 已实现 | AI 面板支持老板键饱和度调节 |
| 气泡式 UI | ✅ 已实现 | 用户蓝色气泡、AI 灰色气泡 |
| 加载动画 | ✅ 已实现 | 三点弹跳动画 |
| 发送/停止按钮 | ✅ 已实现 | 可随时中断 AI 生成 |

### 1.3 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `cyberMonopoly.llmBaseUrl` | string | `https://api.openai.com/v1` | LLM API Base URL（OpenAI 兼容） |
| `cyberMonopoly.llmApiKey` | string | `""` | LLM API Key（通过 SecretStorage 加密存储） |
| `cyberMonopoly.llmModel` | string | `gpt-3.5-turbo` | LLM 模型名称 |

---

## 二、现有功能详细分析

### 2.1 LlmClient（LLM 客户端）

**文件**: `src/chat/llmClient.ts`

**现有能力**:
- OpenAI 兼容 API 调用（`/chat/completions`）
- 动态更新 API Key（`updateApiKey`）
- 中止请求（`abort` 使用 AbortController）
- API Key 脱敏处理（`sanitize` 方法，错误日志中替换 Key 为 `***`）

**现存问题**:

| 问题编号 | 问题描述 | 影响 | 优先级 |
|---|---|---|---|
| LLM-P01 | 无流式响应（SSE/streaming） | 长回答时用户需等待全部生成完毕，体验差 | **P0** |
| LLM-P02 | 无请求超时配置 | 网络异常时请求可能挂起 | **P1** |
| LLM-P03 | 无重试机制 | 网络抖动时直接报错 | **P1** |
| LLM-P04 | 不支持 function calling | 无法实现「帮我查茅台行情」等工具调用 | **P0** |
| LLM-P05 | 不支持多模态输入 | 无法发送截图、图片 | **P2** |
| LLM-P06 | temperature 不可配置 | 固定 0.7，无法通过设置面板调整 | **P2** |

### 2.2 AiChatPanel（AI 聊天面板）

**文件**: `src/webview/aiChatPanel.ts`

**现有能力**:
- WebView 对话界面（气泡式布局）
- 发送/停止按钮
- 加载中动画（三点弹跳）
- 历史消息持久化（globalState 最近 50 条）
- 清空对话功能
- System Prompt 自动注入自选股代码表

**现存问题**:

| 问题编号 | 问题描述 | 影响 | 优先级 |
|---|---|---|---|
| LLM-P07 | 无 Markdown 渲染 | AI 返回的代码块、表格、加粗等格式全部显示为纯文本 | **P0** |
| LLM-P08 | 无代码高亮 | 返回的代码无法语法高亮 | **P1** |
| LLM-P09 | 无流式打字效果 | 非流式 API + 无动画，体验割裂 | **P1** |
| LLM-P10 | 无上下文长度管理 | 发送最近 20 条消息，超出 token limit 时会报错 | **P1** |
| LLM-P11 | 无对话导出功能 | 无法保存或分享对话内容 | **P2** |
| LLM-P12 | 无多轮对话上下文摘要 | 长对话场景下历史消息过长 | **P2** |
| LLM-P13 | System Prompt 不可自定义 | 用户无法修改 AI 角色设定 | **P2** |
| LLM-P14 | 无输入建议/快捷指令 | 新用户不知道该问什么 | **P2** |

### 2.3 SettingsPanel（设置面板）

**文件**: `src/webview/settingsPanel.ts`

**现有能力**:
- 刷新间隔配置
- LLM API Base URL 配置
- LLM API Key 配置（加密存储）
- LLM 模型名称配置

**现存问题**:

| 问题编号 | 问题描述 | 影响 | 优先级 |
|---|---|---|---|
| LLM-P15 | 无 API Key 验证功能 | 用户输入错误的 Key 无法立即知道 | **P1** |
| LLM-P16 | 无模型列表自动获取 | 用户需手动输入模型名，不知道可用模型 | **P2** |
| LLM-P17 | 无 Temperature 配置 | 设置面板缺少温度调节滑块 | **P2** |

---

## 三、功能差距分析（对比同类产品）

| 功能维度 | 赛博大富翁 | 东方财富 AI 助手 | 同花顺 i问财 | 差距等级 |
|---|---|---|---|---|
| **基础对话** | ✅ | ✅ | ✅ | 持平 |
| **流式响应** | ❌ | ✅ | ✅ | 🔴 差距大 |
| **Markdown 渲染** | ❌ | ✅ | ✅ | 🔴 差距大 |
| **代码高亮** | ❌ | ✅ | N/A | 🟡 差距中 |
| **股票行情查询** | ❌ 仅提供代码表 | ✅ 实时调用 | ✅ 实时调用 | 🔴 差距大 |
| **K线技术分析** | ❌ | ✅ | ✅ | 🔴 差距大 |
| **财务数据查询** | ❌ | ✅ | ✅ | 🔴 差距大 |
| **新闻资讯整合** | ❌ | ✅ | ✅ | 🟡 差距中 |
| **投资建议/策略** | ❌ | ✅ | ✅ | 🟡 差距中 |
| **上下文记忆** | ✅ 20 条 | ✅ | ✅ | 持平 |
| **多模态（截图）** | ❌ | ✅ | ❌ | 🟡 差距中 |
| **语音输入** | ❌ | ✅ | ✅ | 🟢 可选 |

---

## 四、缺失功能清单

### 4.1 核心缺失功能（Must Have）

| 功能编号 | 功能名称 | 功能描述 | 涉及模块 | 优先级 |
|---|---|---|---|---|
| F-01 | 流式响应（Streaming） | 使用 SSE 实现逐字输出，提升用户体验 | `llmClient.ts`、`aiChatPanel.ts` | **P0** |
| F-02 | Markdown 渲染 | 支持标题、加粗、列表、代码块、表格等格式 | `aiChatPanel.ts` | **P0** |
| F-03 | Function Calling - 行情查询 | 用户说「茅台今天涨了多少」，AI 自动调用行情 API 返回数据 | `llmClient.ts`、新建 `tools.ts` | **P0** |
| F-04 | Function Calling - K线数据 | 用户说「看看茅台的K线」，AI 自动调用 K线 API 并触发图表展示 | `llmClient.ts`、`chartPanel.ts` | **P0** |
| F-05 | Function Calling - 财务数据 | 用户说「茅台的财报怎么样」，AI 调用财务 API 返回数据 | `llmClient.ts`、新建 `tools.ts` | **P0** |

### 4.2 重要增强功能（Should Have）

| 功能编号 | 功能名称 | 功能描述 | 涉及模块 | 优先级 |
|---|---|---|---|---|
| F-06 | 代码高亮 | 返回的代码块使用语法高亮渲染 | `aiChatPanel.ts`（引入 highlight.js 或 Prism） | **P1** |
| F-07 | 请求超时与重试 | LLM 请求超时 30 秒，失败自动重试 1 次 | `llmClient.ts` | **P1** |
| F-08 | Token 上下文管理 | 自动估算 token 数，超出时截断或摘要旧消息 | `aiChatPanel.ts` | **P1** |
| F-09 | API Key 连通性测试 | 设置面板增加「测试连接」按钮 | `settingsPanel.ts` | **P1** |
| F-10 | 快捷指令 | 输入 `/` 触发预设指令（如 `/行情 600519`、`/财报 300750`） | `aiChatPanel.ts` | **P1** |
| F-11 | 打字动画效果 | 非流式模式下，逐字显示 AI 回复，模拟打字效果 | `aiChatPanel.ts` | **P1** |

### 4.3 未来增强功能（Nice to Have）

| 功能编号 | 功能名称 | 功能描述 | 涉及模块 | 优先级 |
|---|---|---|---|---|
| F-12 | 多模型切换 | 支持在对话中快速切换不同 LLM 模型 | `aiChatPanel.ts`、`llmClient.ts` | **P2** |
| F-13 | System Prompt 自定义 | 允许用户编辑 System Prompt | `settingsPanel.ts` | **P2** |
| F-14 | 对话导出 | 将对话历史导出为 Markdown 或 JSON 文件 | `aiChatPanel.ts` | **P2** |
| F-15 | 智能提醒集成 | AI 分析行情数据后，主动推送异动提醒 | `alert.ts`、`llmClient.ts` | **P2** |
| F-16 | 投资策略回测 | 用户输入策略条件，AI 结合历史 K 线数据进行回测 | 新建 `strategy/` | **P2** |
| F-17 | 研报摘要 | AI 自动摘要最新研报，推送关键观点 | `eastmoney.ts`、`llmClient.ts` | **P2** |
| F-18 | 图片/截图理解 | 支持发送 K 线截图，AI 分析技术形态 | `aiChatPanel.ts`、`llmClient.ts` | **P2** |

---

## 五、多智能体团队职责分工

### 5.1 产品经理（PM）

| 任务编号 | 任务名称 | 具体工作 | 输出物 | 优先级 |
|---|---|---|---|---|
| PM-LLM-01 | AI 助手功能对标分析 | 对比东方财富、同花顺、通达信的 AI 功能，明确差距和机会点 | 竞品 AI 功能对比报告 | **P0** |
| PM-LLM-02 | 用户场景梳理 | 定义 10 个核心用户使用场景（如「快速查行情」「分析财报」「解释术语」） | 用户场景文档 | **P0** |
| PM-LLM-03 | 快捷指令设计 | 设计 `/` 开头的快捷指令列表（10-20 个），定义触发条件和返回格式 | 快捷指令需求文档 | **P1** |
| PM-LLM-04 | Function Calling 需求定义 | 定义 AI 可调用的工具列表、参数格式、返回格式 | Function Calling 需求文档 | **P0** |
| PM-LLM-05 | System Prompt 优化 | 优化 System Prompt，提升 AI 在股票分析场景下的回答质量 | 优化后的 System Prompt | **P1** |
| PM-LLM-06 | AI 交互体验设计 | 设计流式响应、Markdown 渲染、错误提示等交互细节 | AI 交互规范文档 | **P1** |
| PM-LLM-07 | v1.2.0 AI 功能迭代计划 | 整合所有 AI 需求，制定迭代版本计划 | 版本计划表 | **P0** |

### 5.2 软件开发工程师（Dev）

| 任务编号 | 任务名称 | 输入文件 | 具体工作 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| DEV-LLM-01 | 流式响应实现 | `src/chat/llmClient.ts` | 改造 `chat` 方法支持 `stream: true`，返回 `AsyncGenerator<string>` 或通过回调逐步输出 | 改造后的 llmClient.ts | **P0** |
| DEV-LLM-02 | 流式响应前端适配 | `src/webview/aiChatPanel.ts` | WebView 逐步接收文本并追加显示，实现逐字打字效果 | 改造后的 aiChatPanel.ts | **P0** |
| DEV-LLM-03 | Markdown 渲染集成 | `src/webview/aiChatPanel.ts` | 在 WebView 中引入 `marked` 库（或类似轻量库），渲染 AI 返回的 Markdown 内容 | 支持 Markdown 的聊天面板 | **P0** |
| DEV-LLM-04 | Function Calling 基础框架 | `src/chat/llmClient.ts`、新建 `src/chat/tools.ts` | 实现 Function Calling 的请求构造、响应解析、工具执行框架 | tools.ts 及改造后的 llmClient.ts | **P0** |
| DEV-LLM-05 | 行情查询 Tool | 新建 `src/chat/tools.ts` | 实现 `get_stock_quote` 工具，调用 `sina.ts` 的 `getRealtimeQuote`，返回格式化数据 | 行情查询工具代码 | **P0** |
| DEV-LLM-06 | K线数据 Tool | 新建 `src/chat/tools.ts` | 实现 `get_kline_data` 工具，调用 K线 API，返回近 N 日数据摘要 | K线查询工具代码 | **P0** |
| DEV-LLM-07 | 财务数据 Tool | 新建 `src/chat/tools.ts` | 实现 `get_finance_data` 工具，调用 `eastmoney.ts` 的 `getFinanceData`，返回格式化财务指标 | 财务查询工具代码 | **P0** |
| DEV-LLM-08 | 图表触发 Tool | 新建 `src/chat/tools.ts` | 实现 `open_chart` 工具，AI 判断需要查看 K 线时，发送消息给 WebView 打开图表 | 图表触发工具代码 | **P1** |
| DEV-LLM-09 | 代码高亮支持 | `src/webview/aiChatPanel.ts` | 在 Markdown 渲染后，对 `<pre><code>` 块应用语法高亮（使用 highlight.js CDN 或内联） | 代码高亮支持 | **P1** |
| DEV-LLM-10 | 请求超时与重试 | `src/chat/llmClient.ts` | 添加 30 秒超时、1 次重试、指数退避 | 改造后的请求逻辑 | **P1** |
| DEV-LLM-11 | Token 上下文管理 | `src/webview/aiChatPanel.ts` | 实现 token 估算（按字符数粗算），超出 4096 token 时自动截断早期消息 | 上下文管理代码 | **P1** |
| DEV-LLM-12 | 快捷指令系统 | `src/webview/aiChatPanel.ts` | 实现 `/` 开头的指令解析，预定义指令映射到 Function Call | 快捷指令代码 | **P1** |
| DEV-LLM-13 | API Key 连通性测试 | `src/webview/settingsPanel.ts`、`src/chat/llmClient.ts` | 添加「测试连接」按钮，发送一个简单请求验证 Key 是否有效 | 测试连接功能代码 | **P1** |
| DEV-LLM-14 | 打字动画效果 | `src/webview/aiChatPanel.ts` | 非流式模式下，将 AI 回复按字符逐个显示，间隔 30ms | 打字动画代码 | **P1** |
| DEV-LLM-15 | 多模型切换 | `src/webview/aiChatPanel.ts`、`src/webview/settingsPanel.ts` | 在聊天面板顶部添加模型选择下拉框 | 多模型切换 UI | **P2** |
| DEV-LLM-16 | System Prompt 自定义 | `src/webview/settingsPanel.ts` | 设置面板添加 System Prompt 编辑区域（多行文本框） | System Prompt 配置 UI | **P2** |
| DEV-LLM-17 | 对话导出 | `src/webview/aiChatPanel.ts` | 添加「导出」按钮，将对话历史导出为 Markdown 文件 | 导出功能代码 | **P2** |

### 5.3 测试工程师（QA）

| 任务编号 | 任务名称 | 输入文件 | 具体测试内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| QA-LLM-01 | 流式响应测试 | `llmClient.ts`、`aiChatPanel.ts` | 测试场景：正常流式输出、网络中断时流式中断处理、超长回复显示、取消流式 | 流式响应测试报告 | **P0** |
| QA-LLM-02 | Markdown 渲染测试 | `aiChatPanel.ts` | 测试场景：标题、加粗、列表、代码块、表格、链接、图片、嵌套格式 | Markdown 测试报告 | **P0** |
| QA-LLM-03 | Function Calling 测试 | `tools.ts`、`llmClient.ts` | 测试场景：「茅台今天涨了多少」「看看宁德时代的K线」「比亚迪财报怎么样」「帮我查300750的行情」 | Function Calling 测试报告 | **P0** |
| QA-LLM-04 | 快捷指令测试 | `aiChatPanel.ts` | 测试场景：`/行情 600519`、`/财报 300750`、`/K线 000001`、未知指令处理 | 快捷指令测试报告 | **P1** |
| QA-LLM-05 | API Key 配置测试 | `settingsPanel.ts` | 测试场景：空 Key 提示、错误 Key 提示、修改 Key 后立即生效、Key 加密存储验证 | API Key 测试报告 | **P1** |
| QA-LLM-06 | 长对话稳定性测试 | `aiChatPanel.ts` | 测试场景：100+ 条消息后的行为、token 超限处理、历史消息截断 | 长对话测试报告 | **P1** |
| QA-LLM-07 | 错误处理测试 | `llmClient.ts` | 测试场景：网络断开、API 返回 401/429/500、超时、JSON 解析失败 | 错误处理测试报告 | **P1** |
| QA-LLM-08 | 多模型兼容性测试 | `llmClient.ts` | 测试场景：GPT-3.5、GPT-4、Claude、通义千问、文心一言等兼容接口 | 多模型测试报告 | **P2** |
| QA-LLM-09 | WebView 安全测试 | `aiChatPanel.ts` | 测试场景：AI 返回含 `<script>` 的内容、XSS 注入、CSP 拦截验证 | WebView 安全测试报告 | **P1** |
| QA-LLM-10 | 性能测试 | 全部 LLM 相关模块 | 测试场景：流式响应延迟、内存占用、WebView 渲染大消息性能 | 性能测试报告 | **P2** |

### 5.4 安全工程师（Sec）

| 任务编号 | 任务名称 | 输入文件 | 具体检查内容 | 输出物 | 优先级 |
|---|---|---|---|---|---|
| SEC-LLM-01 | API Key 存储安全 | `settingsPanel.ts`、`extension.ts` | 检查 API Key 是否通过 SecretStorage 加密存储，是否有明文泄露路径（配置文件、日志、错误信息） | API Key 安全报告 | **P0** |
| SEC-LLM-02 | LLM 响应 XSS 防护 | `aiChatPanel.ts` | 检查 AI 返回内容在 WebView 中的渲染是否经过 HTML 转义，Markdown 渲染是否使用 DOMPurify 清洗 | XSS 防护报告 | **P0** |
| SEC-LLM-03 | Prompt Injection 防护 | `aiChatPanel.ts`（getSystemPrompt） | 评估用户是否能通过注入 prompt 绕过系统限制（如「忽略之前的指令」） | Prompt Injection 防护报告 | **P1** |
| SEC-LLM-04 | Function Calling 安全 | `tools.ts`（待开发） | 评估 Function Calling 的工具调用权限，防止 AI 执行危险操作（如删除自选股、修改配置） | Function Calling 安全规范 | **P0** |
| SEC-LLM-05 | 网络通信安全 | `llmClient.ts` | 检查 LLM API 请求是否强制 HTTPS，是否有证书验证，请求/响应日志是否泄露敏感信息 | 网络安全报告 | **P1** |
| SEC-LLM-06 | 第三方库安全 | `package.json`（待引入 marked/highlight.js） | 评估引入的 Markdown/代码高亮库的安全性，是否有已知漏洞 | 第三方库安全报告 | **P1** |
| SEC-LLM-07 | 数据隐私审查 | `aiChatPanel.ts` | 检查用户对话内容是否会被发送到外部服务（除 LLM API 外），globalState 中的对话记录是否加密 | 数据隐私报告 | **P1** |

---

## 六、开发计划

### 6.1 Phase 1 — 核心体验升级（v1.2.0）

**目标**: 解决最影响用户体验的三个问题：无流式响应、无 Markdown 渲染、AI 无法查询实时数据。

```
DEV-LLM-01  流式响应（llmClient）     ──┐
DEV-LLM-02  流式响应（前端适配）       ──┤── 同一个 PR
DEV-LLM-14  打字动画（非流式降级）     ──┘
        ↓
DEV-LLM-03  Markdown 渲染             ── 独立 PR
        ↓
DEV-LLM-04  Function Calling 框架     ──┐
DEV-LLM-05  行情查询 Tool             ──┤── 同一个 PR
DEV-LLM-06  K线数据 Tool              ──┤
DEV-LLM-07  财务数据 Tool             ──┘
        ↓
QA-LLM-01 ~ QA-LLM-03  核心功能测试
SEC-LLM-01, SEC-LLM-02, SEC-LLM-04  安全审查
```

**预计交付**:
- AI 回复支持流式逐字输出
- AI 回复支持 Markdown 格式渲染
- 用户可通过自然语言查询行情、K线、财报
- 安全审查通过

### 6.2 Phase 2 — 体验打磨（v1.2.1）

**目标**: 完善细节体验，提升可靠性和可用性。

```
DEV-LLM-09   代码高亮
DEV-LLM-10   请求超时与重试
DEV-LLM-11   Token 上下文管理
DEV-LLM-12   快捷指令系统
DEV-LLM-13   API Key 连通性测试
DEV-LLM-08   图表触发 Tool
        ↓
QA-LLM-04 ~ QA-LLM-07  增强功能测试
SEC-LLM-03, SEC-LLM-05, SEC-LLM-06  安全审查
```

**预计交付**:
- 代码高亮显示
- 请求超时自动重试
- 快捷指令 `/` 菜单
- API Key 测试连接功能
- Token 上下文自动管理

### 6.3 Phase 3 — 智能化（v1.3.0）

**目标**: 从「对话工具」进化为「智能投资助手」。

```
DEV-LLM-15   多模型切换
DEV-LLM-16   System Prompt 自定义
DEV-LLM-17   对话导出
PM-LLM-05    System Prompt 优化
        ↓
QA-LLM-08 ~ QA-LLM-10  全面测试
SEC-LLM-07   数据隐私审查
```

**预计交付**:
- 多模型切换
- 自定义 System Prompt
- 对话导出为 Markdown
- 全面安全审查通过

---

## 七、Function Calling 工具设计

### 7.1 工具列表

| 工具名称 | 功能描述 | 参数 | 调用的内部 API |
|---|---|---|---|
| `get_stock_quote` | 获取股票实时行情 | `code: string` | `sina.ts → getRealtimeQuote` |
| `get_kline_summary` | 获取 K 线数据摘要 | `code: string, days: number` | `eastmoney.ts → getFullKlineData` |
| `get_finance_summary` | 获取财务指标摘要 | `code: string` | `eastmoney.ts → getFinanceData` |
| `open_kline_chart` | 打开 K 线/分时图 | `code: string, type: 'kline'\|'intraday'` | `commands/watchlist.ts → openChart` |
| `get_market_distribution` | 获取涨跌分布 | 无参数 | `market.ts → getMarketDistribution` |
| `search_stock` | 搜索股票 | `keyword: string` | `eastmoney.ts → searchStocks` |

### 7.2 工具 JSON Schema

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_stock_quote",
      "description": "获取股票实时行情数据（价格、涨跌幅、成交量等）",
      "parameters": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "description": "股票代码，如 600519、000001、300750"
          }
        },
        "required": ["code"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_kline_summary",
      "description": "获取股票近 N 日 K 线数据摘要（最高价、最低价、涨跌幅、成交量趋势）",
      "parameters": {
        "type": "object",
        "properties": {
          "code": { "type": "string", "description": "股票代码" },
          "days": { "type": "number", "description": "天数，默认 30" }
        },
        "required": ["code"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_finance_summary",
      "description": "获取股票财务指标摘要（EPS、ROE、营收增长、净利润增长等）",
      "parameters": {
        "type": "object",
        "properties": {
          "code": { "type": "string", "description": "股票代码" }
        },
        "required": ["code"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "open_kline_chart",
      "description": "打开股票的 K 线图或分时图",
      "parameters": {
        "type": "object",
        "properties": {
          "code": { "type": "string", "description": "股票代码" },
          "type": {
            "type": "string",
            "enum": ["kline", "intraday"],
            "description": "图表类型：kline=K线图，intraday=分时图"
          }
        },
        "required": ["code"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_market_distribution",
      "description": "获取 A 股市场涨跌分布（上涨/下跌/平盘家数、涨停/跌停家数、成交额）",
      "parameters": { "type": "object", "properties": {} }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_stock",
      "description": "根据关键词搜索股票（支持代码和名称）",
      "parameters": {
        "type": "object",
        "properties": {
          "keyword": { "type": "string", "description": "搜索关键词" }
        },
        "required": ["keyword"]
      }
    }
  }
]
```

### 7.3 工具执行器设计

```typescript
// src/chat/toolExecutor.ts（待新建）

interface ToolResult {
  tool_call_id: string;
  output: string;
}

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'get_stock_quote':
      return await toolGetStockQuote(args.code);
    case 'get_kline_summary':
      return await toolGetKlineSummary(args.code, args.days || 30);
    case 'get_finance_summary':
      return await toolGetFinanceSummary(args.code);
    case 'open_kline_chart':
      return toolOpenChart(args.code, args.type || 'kline');
    case 'get_market_distribution':
      return await toolGetMarketDistribution();
    case 'search_stock':
      return await toolSearchStock(args.keyword);
    default:
      return `未知工具: ${name}`;
  }
}
```

---

## 八、System Prompt 优化建议

### 8.1 当前 System Prompt（现有）

```
你是赛博大富翁的AI助手，帮助用户查询A股信息。

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
- 用中文回答
```

### 8.2 优化后 System Prompt（建议）

```
你是「赛博大富翁」VSCode 扩展的 AI 投资助手。

## 角色定位
你是一个专业的 A 股市场分析助手，集成在用户的代码编辑器中。你能够：
- 实时查询股票行情（通过工具调用）
- 分析 K 线走势和技术指标
- 解读财务报表和基本面数据
- 提供市场热点和行业分析

## 用户自选股
${stockList}
当用户提到股票名称时，优先从自选股中匹配代码。

## 工具使用规则
1. 当用户询问某只股票的实时价格/涨跌幅时，必须调用 get_stock_quote
2. 当用户询问 K 线/走势/技术分析时，必须调用 get_kline_summary
3. 当用户询问财务/业绩/财报时，必须调用 get_finance_summary
4. 当用户要求查看图表时，调用 open_kline_chart
5. 当用户询问大盘/涨跌分布时，调用 get_market_distribution
6. 当用户不确定代码时，调用 search_stock

## 回答规范
- 使用 Markdown 格式组织回答
- 数据引用需注明来源（如「根据最新行情数据...」）
- 涉及投资建议时，必须附带免责声明
- 保持简洁专业，避免冗长

## 免责声明
当涉及买卖建议、目标价、投资策略时，在回答末尾添加：
> ⚠️ 以上分析仅供参考，不构成投资建议。投资有风险，入市需谨慎。
```

---

## 九、任务依赖关系与执行顺序

### 9.1 Phase 1（核心体验升级）

```
PM-LLM-04  Function Calling 需求定义
        ↓
DEV-LLM-01 + DEV-LLM-02 + DEV-LLM-14  流式响应
        ↓
DEV-LLM-03  Markdown 渲染
        ↓
DEV-LLM-04~07  Function Calling + Tools
        ↓
QA-LLM-01~03  核心测试
SEC-LLM-01,02,04  安全审查
```

### 9.2 Phase 2（体验打磨）

```
DEV-LLM-08~13  增强功能（并行开发）
PM-LLM-03,05  快捷指令设计 + System Prompt 优化
        ↓
QA-LLM-04~07  增强测试
SEC-LLM-03,05,06  安全审查
```

### 9.3 Phase 3（智能化）

```
DEV-LLM-15~17  多模型/自定义/导出
PM-LLM-06,07  交互设计 + 版本计划
        ↓
QA-LLM-08~10  全面测试
SEC-LLM-07  数据隐私审查
```

---

## 十、交付物清单

| 序号 | 交付物 | 负责角色 | Phase | 状态 |
|---|---|---|---|---|
| 1 | 竞品 AI 功能对比报告 | PM | 1 | ⬜ 待完成 |
| 2 | 用户场景文档 | PM | 1 | ⬜ 待完成 |
| 3 | Function Calling 需求文档 | PM | 1 | ⬜ 待完成 |
| 4 | 流式响应代码 | Dev | 1 | ⬜ 待完成 |
| 5 | Markdown 渲染代码 | Dev | 1 | ⬜ 待完成 |
| 6 | Function Calling 框架 + 6 个工具 | Dev | 1 | ⬜ 待完成 |
| 7 | 核心功能测试报告 | QA | 1 | ⬜ 待完成 |
| 8 | 安全审查报告（API Key/XSS/FC） | Sec | 1 | ⬜ 待完成 |
| 9 | 快捷指令设计文档 | PM | 2 | ⬜ 待完成 |
| 10 | System Prompt 优化版本 | PM | 2 | ⬜ 待完成 |
| 11 | 增强功能代码（6 项） | Dev | 2 | ⬜ 待完成 |
| 12 | 增强功能测试报告 | QA | 2 | ⬜ 待完成 |
| 13 | Prompt Injection 防护报告 | Sec | 2 | ⬜ 待完成 |
| 14 | 交互规范文档 | PM | 3 | ⬜ 待完成 |
| 15 | v1.3.0 版本计划 | PM | 3 | ⬜ 待完成 |
| 16 | 多模型切换/导出代码 | Dev | 3 | ⬜ 待完成 |
| 17 | 全面测试报告 | QA | 3 | ⬜ 待完成 |
| 18 | 数据隐私审查报告 | Sec | 3 | ⬜ 待完成 |

---

## 十一、各智能体协作规则

### 11.1 通用规则

- 不凭空假设 API 能力，必须基于代码实际实现
- 引入新库前先检查 `package.json` 是否已有类似依赖
- 修改代码前先阅读相关上下文
- 不在日志或错误信息中泄露 API Key
- WebView 中所有用户/AI 内容必须经过 HTML 转义

### 11.2 产品经理规则

- 需求必须可实现、可验证
- 快捷指令和工具定义必须给出完整的参数格式
- System Prompt 修改需提供 A/B 对比说明

### 11.3 开发工程师规则

- 流式响应必须兼容非流式降级（部分 LLM provider 不支持 stream）
- Function Calling 必须有 try-catch 保护，工具调用失败不影响对话继续
- 引入第三方库（marked/highlight.js）必须使用 CDN + 完整性校验（integrity hash）
- 每次修改后必须执行 `npm run compile` 验证编译

### 11.4 测试工程师规则

- 流式响应测试必须覆盖：正常流、中断流、超时流、空响应
- Markdown 测试必须覆盖所有格式元素和嵌套组合
- Function Calling 测试必须覆盖：正常调用、参数缺失、工具返回错误、AI 误调用

### 11.5 安全工程师规则

- Prompt Injection 测试必须包含至少 10 种攻击向量
- Function Calling 权限必须遵循最小权限原则（只读数据查询，不执行写操作）
- 所有安全建议必须给出具体修复方式和代码示例
- 风险等级：🔴 高（可被利用造成数据泄露/代码执行）、🟡 中（潜在风险）、🟢 低（最佳实践偏离）
