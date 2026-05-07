# 赛博大富翁 🎰

A-share market tool hidden in your editor. Perfect for... coding.

把 A 股行情藏进你的编辑器，摸鱼不被发现。

## ✨ 功能特性

### 📊 自选股管理
- 添加/移除自选股，支持按代码或名称搜索
- 实时行情刷新，涨跌一目了然
- 自选股排序（按代码、名称、价格、涨跌幅）
- 状态栏滚动显示自选股行情

### 📈 K线图 & 分时图
- 日K线图（支持 15/30/60/120 日周期切换）
- 分时图（完整显示 9:30-15:00 交易时段）
- 成交量柱状图
- 十字光标悬浮显示详细数据
- 浮动信息面板

### 🔥 热门股排行
- 涨幅榜 / 跌幅榜 / 换手率榜
- 一键加入自选股

### 📰 财经快讯
- 7×24 小时实时快讯
- 个股资讯 / 研报评级 / 财务数据

### 🤖 AI 助手
- 接入 OpenAI 兼容 API
- 智能分析个股行情
- 支持自定义 LLM 模型

### 🕵️ 老板键
- `Alt+Shift+B` 一键切换隐蔽模式
- 降低界面饱和度，假装在写代码
- 可自定义饱和度参数

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+Q` | 查看行情概览 |
| `Ctrl+Shift+A` | 打开 AI 助手 |
| `Alt+Shift+B` | 老板键（切换隐蔽模式） |
| `F5` | 刷新行情 |

## ⚙️ 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `cyberMonopoly.refreshInterval` | `10` | 行情刷新间隔（秒） |
| `cyberMonopoly.enableStatusBar` | `true` | 是否显示状态栏行情 |
| `cyberMonopoly.enableAlert` | `true` | 是否启用价格异动提醒 |
| `cyberMonopoly.defaultAlertPercent` | `5` | 涨跌幅异动提醒阈值（%） |
| `cyberMonopoly.llmBaseUrl` | `""` | LLM API Base URL（OpenAI 兼容） |
| `cyberMonopoly.llmApiKey` | `""` | LLM API Key |
| `cyberMonopoly.llmModel` | `gpt-3.5-turbo` | LLM 模型名称 |
| `cyberMonopoly.colorTheme` | `a-stock` | 涨跌颜色主题（a-stock / us-stock / custom） |
| `cyberMonopoly.chartFontSize` | `14` | 界面字体大小（px） |
| `cyberMonopoly.bossKeyEnabled` | `true` | 是否启用老板键 |
| `cyberMonopoly.bossKeySaturation` | `10` | 老板键激活时饱和度（%） |

## 🚀 使用方法

1. 安装扩展后，侧边栏会出现「赛博大富翁」图标
2. 点击图标，在自选股面板中点击 **+** 添加股票
3. 输入股票代码（如 `600519`）或名称（如 `茅台`）搜索
4. 点击股票查看 K 线图，右键查看资讯/研报/财务数据
5. 按 `Alt+Shift+B` 随时切换隐蔽模式

## 📄 License

MIT
