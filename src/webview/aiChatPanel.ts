import * as vscode from 'vscode';
import { Marked } from 'marked';
import { LlmClient, LlmMessage } from '../chat/llmClient';
import { WatchlistProvider } from '../provider/watchlistProvider';
import { getNonce, buildCspContent } from '../utils/nonce';
import { getToolDefinitions, executeToolCalls, executeTool, ToolCall, sanitizeForPrompt } from '../chat/toolExecutor';

// ============================================================
// 快捷指令系统 (DEV-LLM-12)
// ============================================================

interface ShortcutCommand {
  name: string;
  aliases: string[];
  toolName: string;
  usage: string;
  description: string;
  requiresCode: boolean;
}

const SHORTCUT_COMMANDS: ShortcutCommand[] = [
  { name: '行情', aliases: ['行情', 'quote', 'hq'], toolName: 'get_stock_quote', usage: '/行情 600519', description: '查询股票实时行情', requiresCode: true },
  { name: '财报', aliases: ['财报', 'finance', 'cw'], toolName: 'get_finance_summary', usage: '/财报 300750', description: '查询股票财务指标摘要', requiresCode: true },
  { name: 'K线', aliases: ['K线', 'kline', 'k'], toolName: 'get_kline_summary', usage: '/K线 000001', description: '查询股票K线区间摘要', requiresCode: true },
  { name: '分时', aliases: ['分时', 'intraday', 'fs'], toolName: 'get_intraday_data', usage: '/分时 600519', description: '查询当日分时数据', requiresCode: true },
  { name: '大盘', aliases: ['大盘', 'market', 'dp'], toolName: 'get_market_overview', usage: '/大盘', description: '查看主要指数行情', requiresCode: false },
  { name: '涨跌分布', aliases: ['涨跌分布', 'distribution', 'zdfb'], toolName: 'get_market_distribution', usage: '/涨跌分布', description: '查看市场涨跌分布统计', requiresCode: false },
  { name: '热门', aliases: ['热门', 'hot', 'rm'], toolName: 'get_hot_stocks', usage: '/热门 [涨幅|跌幅|换手]', description: '查看热门股票排行榜', requiresCode: false },
  { name: '板块', aliases: ['板块', 'sector', 'bk'], toolName: 'get_sector_list', usage: '/板块', description: '查看行业板块行情', requiresCode: false },
  { name: '新闻', aliases: ['新闻', 'news', 'xw'], toolName: 'get_stock_news', usage: '/新闻 600519', description: '查询个股相关新闻', requiresCode: true },
  { name: '快讯', aliases: ['快讯', 'flash', 'kx'], toolName: 'get_7x24_news', usage: '/快讯', description: '查看7x24实时财经快讯', requiresCode: false },
  { name: '研报', aliases: ['研报', 'report', 'yb'], toolName: 'get_research_reports', usage: '/研报 600519', description: '查询个股券商研报', requiresCode: true },
  { name: '搜索', aliases: ['搜索', 'search', 'ss'], toolName: 'search_stock', usage: '/搜索 茅台', description: '搜索股票（支持代码和名称）', requiresCode: false },
  { name: '图表', aliases: ['图表', 'chart', 'tb'], toolName: 'open_chart', usage: '/图表 600519 [k线|分时]', description: '打开股票K线图或分时图', requiresCode: true },
  { name: '帮助', aliases: ['帮助', 'help', 'bz'], toolName: '__help__', usage: '/帮助', description: '显示所有可用指令', requiresCode: false },
];

function parseShortcutCommand(input: string): { command: ShortcutCommand; code: string; extraArgs: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) { return null; }
  const withoutSlash = trimmed.slice(1).trim();
  if (!withoutSlash) { return null; }
  const parts = withoutSlash.split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const argsStr = parts.slice(1).join(' ').trim();
  const command = SHORTCUT_COMMANDS.find(cmd => cmd.aliases.some(alias => alias.toLowerCase() === commandName));
  if (!command) { return null; }
  let code = '';
  let extraArgs = '';
  if (argsStr) {
    const codeMatch = argsStr.match(/\b(\d{6})\b/);
    if (codeMatch) { code = codeMatch[1]; extraArgs = argsStr.replace(codeMatch[0], '').trim(); }
    else { extraArgs = argsStr; }
  }
  return { command, code, extraArgs };
}

function formatVolume(vol: number): string {
  if (vol >= 100000000) { return (vol / 100000000).toFixed(2) + '亿'; }
  if (vol >= 10000) { return (vol / 10000).toFixed(2) + '万'; }
  return String(vol);
}

function formatToolResult(toolName: string, resultJson: string): string {
  let result: any;
  try { result = JSON.parse(resultJson); } catch { return '工具返回数据解析失败'; }
  if (!result.success) { return `**错误**: ${result.error || '未知错误'}`; }
  const data = result.data;
  if (!data) { return '查询完成，无数据返回'; }
  let formatted: string;
  switch (toolName) {
    case 'get_stock_quote': {
      const q = data; const cs = q.changePercent >= 0 ? '+' : ''; const t = q.changePercent >= 0 ? '涨' : '跌';
      formatted = [`**${q.name}** (${q.code}) - ${t}`, '', `| 指标 | 数值 |`, `|------|------|`, `| 当前价 | **${q.price}** |`, `| 涨跌幅 | ${cs}${q.changePercent}% |`, `| 涨跌额 | ${cs}${q.changeAmount} |`, `| 今开 | ${q.open} |`, `| 昨收 | ${q.prevClose} |`, `| 最高 | ${q.high} |`, `| 最低 | ${q.low} |`, `| 成交量 | ${formatVolume(q.volume)} |`, `| 买一 | ${q.bid} |`, `| 卖一 | ${q.ask} |`, '', `> ${q.date} ${q.time}`].join('\n');
      break;
    }
    case 'get_finance_summary': {
      if (!Array.isArray(data) || data.length === 0) { return '未找到财务数据'; }
      const lines = [`**财务指标摘要**`, '', `| 报告期 | EPS | ROE | 营收增长 | 净利增长 | 毛利率 | 净利率 | 负债率 |`, `|--------|-----|-----|----------|----------|--------|--------|--------|`];
      for (const r of data.slice(0, 5)) { lines.push(`| ${r.reportDate} | ${r.eps} | ${r.roe} | ${r.revenueYoy} | ${r.netProfitYoy} | ${r.grossMargin} | ${r.netMargin} | ${r.debtRatio} |`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_kline_summary': {
      const s = data; const tm: Record<string, string> = { increasing: '放量', decreasing: '缩量', stable: '平稳' }; const cs = s.summary.periodChangePercent >= 0 ? '+' : '';
      formatted = [`**${s.name}** (${s.code}) K线摘要 - 最近${s.days}个交易日`, '', `| 指标 | 数值 |`, `|------|------|`, `| 区间最高 | ${s.summary.highest} |`, `| 区间最低 | ${s.summary.lowest} |`, `| 最新收盘 | ${s.summary.latestClose} |`, `| 区间涨跌 | ${cs}${s.summary.periodChangePercent}% |`, `| 平均成交量 | ${formatVolume(s.summary.avgVolume)} |`, `| 成交量趋势 | ${tm[s.summary.volumeTrend] || s.summary.volumeTrend} |`].join('\n');
      break;
    }
    case 'get_intraday_data': {
      const d = data; const cs = d.changePercent >= 0 ? '+' : '';
      const lines = [`**${d.name}** (${d.code}) 分时数据`, '', `| 指标 | 数值 |`, `|------|------|`, `| 最新价 | **${d.latestPrice}** |`, `| 昨收 | ${d.prevClose} |`, `| 涨跌幅 | ${cs}${d.changePercent}% |`, `| 日内最高 | ${d.high} |`, `| 日内最低 | ${d.low} |`, `| 数据点数 | ${d.dataPoints} |`];
      if (d.tradingDate) { lines.push('', `> 交易日期: ${d.tradingDate}`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_market_overview': {
      if (!Array.isArray(data) || data.length === 0) { return '未获取到大盘数据'; }
      const lines = [`**大盘指数行情**`, '', `| 指数 | 价格 | 涨跌幅 | 涨跌额 | 市场 |`, `|------|------|--------|--------|------|`];
      for (const q of data) { lines.push(`| ${q.name} | ${q.price} | ${q.changePercent} | ${q.changeAmount} | ${q.market} |`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_market_distribution': {
      formatted = [`**市场涨跌分布**`, '', `| 指标 | 数值 |`, `|------|------|`, `| 上涨家数 | ${data.upCount} |`, `| 下跌家数 | ${data.downCount} |`, `| 平盘家数 | ${data.flatCount} |`, `| 涨停家数 | ${data.limitUpCount} |`, `| 跌停家数 | ${data.limitDownCount} |`, `| 成交额 | ${data.turnover} |`, `| 较昨日差额 | ${data.turnoverDiff} |`].join('\n');
      break;
    }
    case 'get_hot_stocks': {
      if (!Array.isArray(data) || data.length === 0) { return '未获取到热门股票数据'; }
      const lines = [`**热门股票排行**`, '', `| 代码 | 名称 | 价格 | 涨跌幅 | 换手率 |`, `|------|------|------|--------|--------|`];
      for (const s of data) { lines.push(`| ${s.code} | ${s.name} | ${s.price} | ${s.changePercent} | ${s.turnoverRate} |`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_sector_list': {
      if (!Array.isArray(data) || data.length === 0) { return '未获取到板块数据'; }
      const lines = [`**行业板块行情**`, '', `| 板块 | 价格 | 涨跌幅 | 涨跌额 |`, `|------|------|--------|--------|`];
      for (const s of data) { lines.push(`| ${s.name} | ${s.price} | ${s.changePercent} | ${s.changeAmount} |`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_stock_news': {
      if (!Array.isArray(data) || data.length === 0) { return '未找到相关新闻'; }
      const lines = ['**个股新闻**', '']; for (const n of data) { lines.push(`- **${n.title}** (${n.source} ${n.time})`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_7x24_news': {
      if (!Array.isArray(data) || data.length === 0) { return '未获取到快讯'; }
      const lines = ['**7x24 实时快讯**', ''];
      for (const n of data) { const tag = n.tag ? `[${n.tag}]` : ''; lines.push(`- ${tag} ${n.content} _${n.createTime}_`); }
      formatted = lines.join('\n');
      break;
    }
    case 'get_research_reports': {
      if (!Array.isArray(data) || data.length === 0) { return '未找到研报数据'; }
      const lines = ['**券商研报**', ''];
      for (const r of data) { lines.push(`- **${r.title}**`, `  ${r.orgName} | ${r.author} | ${r.publishDate} | 评级: ${r.rating}`); }
      formatted = lines.join('\n');
      break;
    }
    case 'search_stock': {
      if (!Array.isArray(data) || data.length === 0) { return '未找到匹配的股票'; }
      const lines = [`**搜索结果**`, '', `| 代码 | 名称 | 市场 | 类型 |`, `|------|------|------|------|`];
      for (const s of data) { lines.push(`| ${s.code} | ${s.name} | ${s.market} | ${s.type} |`); }
      formatted = lines.join('\n');
      break;
    }
    case 'open_chart': { formatted = data.message || '已打开图表'; break; }
    default: formatted = `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  // 如果存在 info 提示（如歧义代码提示），追加到结果末尾
  if (result.info) {
    formatted += `\n\n> 💡 ${result.info}`;
  }
  return formatted;
}

function getHelpText(): string {
  const lines = ['**快捷指令列表**', '', '以下指令以 `/` 开头，输入后直接执行，无需等待 AI 回复：', '', '| 指令 | 用法 | 说明 |', `|------|------|------|`];
  const seen = new Set<string>();
  for (const cmd of SHORTCUT_COMMANDS) {
    if (cmd.name === '帮助' || seen.has(cmd.name)) { continue; }
    seen.add(cmd.name);
    const aliases = cmd.aliases.map(a => `\`/${a}\``).join(' / ');
    lines.push(`| ${aliases} | \`${cmd.usage}\` | ${cmd.description} |`);
  }
  lines.push('', '> 输入 `/帮助` 查看此帮助信息');
  return lines.join('\n');
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  /** 仅 role='assistant' 且包含工具调用时有值 */
  toolCalls?: ToolCall[];
  /** 仅 role='tool' 时有值，关联对应的工具调用 */
  toolCallId?: string;
}

/**
 * 轻量级 HTML 消毒函数（防御性安全措施）
 * 移除可能绕过 marked 配置的危险标签、事件属性和脚本 URL
 */
function sanitizeHtml(html: string): string {
  // 移除危险标签及其内容
  html = html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  html = html.replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '');
  html = html.replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, '');
  html = html.replace(/<\s*embed[^>]*[\s\/]*>/gi, '');
  html = html.replace(/<\s*form[^>]*>[\s\S]*?<\s*\/\s*form\s*>/gi, '');
  html = html.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  html = html.replace(/<\s*(link|meta|base)[^>]*[\s\/]*>/gi, '');
  // 移除事件处理属性（on*）
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // 移除 javascript:/vbscript: URL
  html = html.replace(/(href|src|action)\s*=\s*(['"]?)\s*javascript\s*:/gi, '$1=$2#');
  html = html.replace(/(href|src|action)\s*=\s*(['"]?)\s*vbscript\s*:/gi, '$1=$2#');
  return html;
}

/** 创建独立的 marked 实例，配置 GFM 和安全渲染器 */
const mdRenderer = new Marked();
mdRenderer.use({
  gfm: true,
  breaks: false,
  renderer: {
    /** 剥离原始 HTML 标签，防止 XSS 注入 */
    html(): string {
      return '';
    },
    /** 安全的链接渲染：过滤危险 URL，添加 target="_blank" */
    link(this: any, { href, title, tokens }: any): string {
      const text = this.parser.parseInline(tokens) as string;
      if (/^(javascript|vbscript|data):/i.test(href)) {
        return text;
      }
      const safeHref = href.replace(/"/g, '&quot;');
      const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    /** 安全的图片渲染：限制最大宽度 */
    image({ href, title, text }: any): string {
      if (/^(javascript|vbscript):/i.test(href)) {
        return String(text);
      }
      const safeHref = href.replace(/"/g, '&quot;');
      const safeAlt = String(text).replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
      return `<img src="${safeHref}" alt="${safeAlt}"${titleAttr} style="max-width:100%">`;
    },
    /** 代码块渲染：仅转义 HTML 实体，不做语法高亮 */
    code({ text }: any): string {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre><code>${escaped}</code></pre>`;
    }
  }
});

export class AiChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messages: ChatMessage[] = [];
  private llm: LlmClient;
  private state: vscode.Memento;
  private context: vscode.ExtensionContext | undefined;
  private watchlistProvider: WatchlistProvider | undefined;
  private bossEnabled = true;
  private bossSaturation = 10;
  private readonly STORAGE_KEY = 'cyberMonopoly.chatHistory';
  private readonly MAX_TOKENS = 4096;

  constructor(llm: LlmClient, state: vscode.Memento) {
    this.llm = llm;
    this.state = state;
    const saved = state.get<ChatMessage[]>(this.STORAGE_KEY, []);
    this.messages = saved.slice(-50);
  }

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  setWatchlistProvider(provider: WatchlistProvider): void {
    this.watchlistProvider = provider;
  }

  /**
   * 粗略估算文本的 token 数量
   * - 中文字符：约 2 token/字符
   * - 英文/数字/标点等 ASCII 字符：约 0.25 token/字符
   * 这是基于 BPE 分词器的常见经验比例
   */
  private estimateTokens(text: string): number {
    let chineseChars = 0;
    let otherChars = 0;
    for (const ch of text) {
      if (ch.charCodeAt(0) > 0x7f) {
        chineseChars++;
      } else {
        otherChars++;
      }
    }
    return Math.ceil(chineseChars * 2 + otherChars * 0.25);
  }

  private saveHistory(): void {
    this.state.update(this.STORAGE_KEY, this.messages.slice(-50));
  }

  /**
   * 将 Markdown 文本渲染为安全的 HTML
   * 使用 marked 解析 Markdown，再经 sanitizeHtml 消毒
   */
  private renderMarkdown(content: string): string {
    try {
      const html = mdRenderer.parse(content) as string;
      return sanitizeHtml(html);
    } catch {
      // 解析失败时回退为纯文本（转义 HTML 实体）
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }

  show(_context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      // 重新应用老板模式状态
      this.applyBossMode();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyAiChat',
      'AI助手',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageHandler();

    // 检查API Key是否已配置，通知webview显示相应界面
    this.checkApiKeyAndNotify();

    if (this.messages.length > 0) {
      // 只显示 user 和 assistant 消息（过滤掉内部的 tool 消息）
      const displayMessages = this.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role,
          content: m.role === 'assistant' ? this.renderMarkdown(m.content) : m.content,
        }));
      this.panel.webview.postMessage({
        type: 'history',
        messages: displayMessages,
      });
    }

    // 应用老板模式状态
    this.applyBossMode();
  }

  private applyBossMode(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'bossMode', enabled: this.bossEnabled, saturation: this.bossSaturation });
    }
  }

  private async openConfigPanel(): Promise<void> {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const baseUrl = config.get<string>('llmBaseUrl', '');
    const model = config.get<string>('llmModel', 'gpt-3.5-turbo');
    this.panel?.webview.postMessage({
      type: 'showConfig',
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-3.5-turbo',
    });
  }

  private async checkApiKeyAndNotify(): Promise<void> {
    if (!this.context) return;
    const apiKey = await this.context.secrets.get('cyberMonopoly.llm.apiKey');
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const baseUrl = config.get<string>('llmBaseUrl', '');
    const model = config.get<string>('llmModel', 'gpt-3.5-turbo');

    this.panel?.webview.postMessage({
      type: 'configStatus',
      configured: !!apiKey,
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-3.5-turbo',
    });
  }

  private getWebviewContent(): string {
    const nonce = getNonce();
    const bossInitEnabled = this.bossEnabled;
    const bossInitSaturation = this.bossSaturation;
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${buildCspContent(nonce)}">
  <style nonce="${nonce}">
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); display: flex; flex-direction: column; box-sizing: border-box; }
    #toolbar { display: flex; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); gap: 8px; align-items: center; }
    #clear-btn, #config-btn { background: none; border: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); padding: 2px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
    #clear-btn:hover, #config-btn:hover { color: var(--vscode-foreground); border-color: var(--vscode-foreground); }
    #messages { flex: 1; overflow-y: auto; padding: 16px; scroll-behavior: smooth; }
    .msg-wrapper { margin-bottom: 16px; }
    .msg-wrapper.user { text-align: right; }
    .msg-wrapper.ai { text-align: left; }
    .msg-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; padding: 0 4px; }
    .msg { display: inline-block; max-width: 85%; padding: 10px 14px; border-radius: 10px; line-height: 1.6; font-size: 13px; white-space: pre-wrap; word-break: break-word; text-align: left; }
    .msg-wrapper.user .msg { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-bottom-right-radius: 3px; }
    .msg-wrapper.ai .msg { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); color: var(--vscode-editorWidget-foreground); border-bottom-left-radius: 3px; }
    /* Markdown 渲染样式 */
    .msg.msg-html { white-space: normal; }
    .msg-html h1, .msg-html h2, .msg-html h3, .msg-html h4, .msg-html h5, .msg-html h6 { margin: 12px 0 6px; font-weight: 600; line-height: 1.3; }
    .msg-html h1 { font-size: 1.35em; } .msg-html h2 { font-size: 1.2em; } .msg-html h3 { font-size: 1.1em; }
    .msg-html p { margin: 6px 0; } .msg-html p:first-child { margin-top: 0; } .msg-html p:last-child { margin-bottom: 0; }
    .msg-html ul, .msg-html ol { margin: 6px 0; padding-left: 20px; }
    .msg-html li { margin: 2px 0; }
    .msg-html pre { background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2)); border-radius: 4px; padding: 10px; overflow-x: auto; margin: 8px 0; }
    .msg-html code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15)); padding: 1px 4px; border-radius: 3px; }
    .msg-html pre code { background: none; padding: 0; display: block; }
    .msg-html blockquote { border-left: 3px solid var(--vscode-textBlockQuote-border, var(--vscode-panel-border)); padding-left: 10px; margin: 8px 0; color: var(--vscode-descriptionForeground); }
    .msg-html table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 12px; }
    .msg-html th, .msg-html td { border: 1px solid var(--vscode-panel-border); padding: 6px 10px; text-align: left; }
    .msg-html th { background: var(--vscode-editorWidget-background); font-weight: 600; }
    .msg-html a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
    .msg-html a:hover { text-decoration: underline; }
    .msg-html hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 12px 0; }
    .msg-html img { max-width: 100%; border-radius: 4px; }
    .msg-html strong { font-weight: 600; } .msg-html em { font-style: italic; }
    .typing-dots { display: inline-flex; gap: 4px; align-items: center; padding: 12px 14px; }
    .typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-descriptionForeground); animation: bounce 1.2s infinite ease-in-out; }
    .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-6px); opacity: 1; } }
    #input-area { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--vscode-panel-border); align-items: flex-end; }
    #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 10px 12px; font-size: 13px; font-family: inherit; outline: none; resize: none; min-height: 38px; max-height: 120px; line-height: 1.4; }
    #input:focus { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .btn-group { display: flex; gap: 4px; }
    #send-btn, #stop-btn {
      border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; transition: opacity 0.15s;
    }
    #send-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    #send-btn:hover { opacity: 0.9; }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #stop-btn { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-foreground); display: none; border: 1px solid var(--vscode-inputValidation-errorBorder, transparent); }
    #stop-btn:hover { opacity: 0.8; }
    #empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); gap: 12px; }
    #empty-hint .icon { font-size: 40px; opacity: 0.3; }
    #empty-hint .text { font-size: 13px; }
    /* LLM配置表单样式 */
    #config-panel { display: none; padding: 24px; overflow-y: auto; height: 100%; box-sizing: border-box; }
    #config-panel.visible { display: block; }
    #config-panel h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: 600; }
    #config-panel .desc { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; line-height: 1.5; }
    .config-field { margin-bottom: 16px; }
    .config-field label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
    .config-field input { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none; box-sizing: border-box; }
    .config-field input:focus { border-color: var(--vscode-focusBorder); }
    .config-field .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .config-actions { display: flex; gap: 8px; margin-top: 20px; }
    .config-btn { padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; border: none; font-weight: 500; }
    .config-btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .config-btn.primary:hover { background: var(--vscode-button-hoverBackground); }
    .config-btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .config-btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .config-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #config-status { margin-top: 12px; padding: 8px 12px; border-radius: 4px; font-size: 12px; display: none; }
    #config-status.success { display: block; background: var(--vscode-testing-passIcon-foreground, #73c991); color: #fff; }
    #config-status.error { display: block; background: var(--vscode-testing-failIcon-foreground, #f14c4c); color: #fff; }
    #config-status.testing { display: block; background: var(--vscode-input-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-input-border); }
    .skip-link { margin-top: 16px; text-align: center; }
    .skip-link a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; font-size: 12px; cursor: pointer; }
    .skip-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div id="config-panel">
    <h2>🤖 AI助手配置</h2>
    <p class="desc">首次使用AI功能需要配置LLM信息。请填写以下配置项，配置完成后即可开始对话。</p>
    <div class="config-field">
      <label>API Base URL</label>
      <input type="text" id="cfg-base-url" placeholder="https://api.openai.com/v1">
      <div class="hint">LLM服务的API地址，支持OpenAI兼容接口</div>
    </div>
    <div class="config-field">
      <label>API Key</label>
      <input type="password" id="cfg-api-key" placeholder="sk-...">
      <div class="hint">您的API密钥，保存后加密存储不会明文显示</div>
    </div>
    <div class="config-field">
      <label>模型</label>
      <input type="text" id="cfg-model" placeholder="gpt-3.5-turbo">
      <div class="hint">使用的模型名称，如 gpt-4、claude-3-sonnet 等</div>
    </div>
    <div class="config-actions">
      <button class="config-btn primary" id="cfg-save-btn">保存配置</button>
      <button class="config-btn secondary" id="cfg-test-btn">测试连接</button>
    </div>
    <div id="config-status"></div>
    <div class="skip-link"><a id="cfg-skip-link">稍后配置，先看看功能 →</a></div>
  </div>
  <div id="toolbar"><button id="clear-btn">清空对话</button><button id="config-btn">⚙️ 配置</button></div>
  <div id="messages">
    <div id="empty-hint"><span class="icon">🤖</span><span class="text">输入消息开始对话</span></div>
  </div>
  <div id="input-area">
    <textarea id="input" placeholder="输入消息... (Enter发送, Shift+Enter换行)" rows="1"></textarea>
    <div class="btn-group">
      <button id="send-btn">发送</button>
      <button id="stop-btn">停止</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentBossEnabled = ${bossInitEnabled};
    let currentBossSaturation = ${bossInitSaturation};
    if (currentBossEnabled) {
      document.body.style.filter = 'saturate(' + (currentBossSaturation / 100) + ')';
    }
    const $messages = document.getElementById('messages');
    const $input = document.getElementById('input');
    const $sendBtn = document.getElementById('send-btn');
    const $stopBtn = document.getElementById('stop-btn');
    const $emptyHint = document.getElementById('empty-hint');
    const $toolbar = document.getElementById('toolbar');
    const $clearBtn = document.getElementById('clear-btn');
    const $configBtn = document.getElementById('config-btn');
    const $configPanel = document.getElementById('config-panel');
    const $cfgBaseUrl = document.getElementById('cfg-base-url');
    const $cfgApiKey = document.getElementById('cfg-api-key');
    const $cfgModel = document.getElementById('cfg-model');
    const $cfgSaveBtn = document.getElementById('cfg-save-btn');
    const $cfgTestBtn = document.getElementById('cfg-test-btn');
    const $cfgStatus = document.getElementById('config-status');
    const $cfgSkipLink = document.getElementById('cfg-skip-link');
    let isWaiting = false;
    let configShown = false;

    function addMsg(role, content, isHtml) {
      if ($emptyHint) $emptyHint.remove();
      const wrapper = document.createElement('div');
      wrapper.className = 'msg-wrapper ' + role;
      const label = document.createElement('div');
      label.className = 'msg-label';
      label.textContent = role === 'user' ? '你' : 'AI助手';
      const div = document.createElement('div');
      div.className = 'msg' + (isHtml ? ' msg-html' : '');
      if (isHtml) {
        div.innerHTML = content;
      } else {
        div.textContent = content;
      }
      wrapper.appendChild(label);
      wrapper.appendChild(div);
      $messages.appendChild(wrapper);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function showTyping() {
      isWaiting = true;
      $sendBtn.style.display = 'none';
      $stopBtn.style.display = 'inline-block';
      if ($emptyHint) $emptyHint.remove();
      const wrapper = document.createElement('div');
      wrapper.id = 'typing-indicator';
      wrapper.className = 'msg-wrapper ai';
      const label = document.createElement('div');
      label.className = 'msg-label';
      label.textContent = 'AI助手';
      const dots = document.createElement('div');
      dots.className = 'typing-dots';
      dots.innerHTML = '<span></span><span></span><span></span>';
      wrapper.appendChild(label);
      wrapper.appendChild(dots);
      $messages.appendChild(wrapper);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function hideTyping() {
      isWaiting = false;
      $sendBtn.style.display = 'inline-block';
      $stopBtn.style.display = 'none';
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }

    function send() {
      const text = $input.value.trim();
      if (!text || isWaiting) return;
      $input.value = '';
      autoResize();
      addMsg('user', text);
      vscode.postMessage({ type: 'chat', content: text });
    }

    function stop() {
      vscode.postMessage({ type: 'abort' });
    }

    function autoResize() {
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    }

    $sendBtn.addEventListener('click', send);
    $stopBtn.addEventListener('click', stop);
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $input.addEventListener('input', autoResize);
    $clearBtn.addEventListener('click', () => {
      $messages.innerHTML = '';
      $messages.innerHTML = '<div id="empty-hint"><span class="icon">🤖</span><span class="text">输入消息开始对话</span></div>';
      vscode.postMessage({ type: 'clearHistory' });
    });

    $configBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openConfig' });
    });

    // 配置面板逻辑
    function showConfigPanel(baseUrl, model) {
      $configPanel.classList.add('visible');
      $messages.style.display = 'none';
      $input.parentElement.style.display = 'none';
      $toolbar.style.display = 'none';
      $cfgBaseUrl.value = baseUrl || 'https://api.openai.com/v1';
      $cfgModel.value = model || 'gpt-3.5-turbo';
      configShown = true;
    }

    function hideConfigPanel() {
      $configPanel.classList.remove('visible');
      $messages.style.display = '';
      $input.parentElement.style.display = '';
      configShown = false;
    }

    $cfgSaveBtn.addEventListener('click', () => {
      const baseUrl = $cfgBaseUrl.value.trim();
      const apiKey = $cfgApiKey.value.trim();
      const model = $cfgModel.value.trim();
      if (!apiKey) {
        $cfgStatus.className = 'error';
        $cfgStatus.style.display = 'block';
        $cfgStatus.textContent = '请填写API Key';
        return;
      }
      vscode.postMessage({
        type: 'saveConfig',
        baseUrl: baseUrl,
        apiKey: apiKey,
        model: model,
      });
    });

    $cfgTestBtn.addEventListener('click', () => {
      const baseUrl = $cfgBaseUrl.value.trim();
      const apiKey = $cfgApiKey.value.trim();
      const model = $cfgModel.value.trim();
      if (!apiKey) {
        $cfgStatus.className = 'error';
        $cfgStatus.style.display = 'block';
        $cfgStatus.textContent = '请先填写API Key';
        return;
      }
      $cfgTestBtn.disabled = true;
      $cfgTestBtn.textContent = '测试中...';
      $cfgStatus.className = 'testing';
      $cfgStatus.style.display = 'block';
      $cfgStatus.textContent = '正在连接LLM服务...';
      vscode.postMessage({
        type: 'testConfig',
        baseUrl: baseUrl,
        apiKey: apiKey,
        model: model,
      });
    });

    $cfgSkipLink.addEventListener('click', () => {
      hideConfigPanel();
    });

    // 流式输出相关状态
    let streamDiv = null;
    let streamContent = '';

    function startStream() {
      isWaiting = true;
      $sendBtn.style.display = 'none';
      $stopBtn.style.display = 'inline-block';
      if ($emptyHint) $emptyHint.remove();
      $toolbar.classList.add('has-history');

      streamContent = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'msg-wrapper ai';
      const label = document.createElement('div');
      label.className = 'msg-label';
      label.textContent = 'AI助手';
      const div = document.createElement('div');
      div.className = 'msg';
      // 打字光标
      const cursor = document.createElement('span');
      cursor.id = 'stream-cursor';
      cursor.style.cssText = 'display:inline-block;width:2px;height:1em;background:var(--vscode-foreground);margin-left:2px;animation:blink 0.8s step-end infinite;vertical-align:text-bottom;';
      div.appendChild(cursor);
      wrapper.appendChild(label);
      wrapper.appendChild(div);
      $messages.appendChild(wrapper);
      streamDiv = div;
      $messages.scrollTop = $messages.scrollHeight;
    }

    function appendChunk(text) {
      if (!streamDiv) return;
      const cursor = document.getElementById('stream-cursor');
      // 在光标前插入文本
      const textNode = document.createTextNode(text);
      if (cursor) {
        streamDiv.insertBefore(textNode, cursor);
      } else {
        streamDiv.appendChild(textNode);
      }
      streamContent += text;
      $messages.scrollTop = $messages.scrollHeight;
    }

    function endStream() {
      isWaiting = false;
      $sendBtn.style.display = 'inline-block';
      $stopBtn.style.display = 'none';
      const cursor = document.getElementById('stream-cursor');
      if (cursor) cursor.remove();
      streamDiv = null;
      streamContent = '';
    }

    // 添加闪烁光标的 keyframes
    const styleSheet = document.createElement('style');
    styleSheet.textContent = '@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }';
    document.head.appendChild(styleSheet);

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'history') {
        for (const m of msg.messages) {
          addMsg(m.role, m.content, m.role === 'ai');
        }
        return;
      }
      if (msg.type === 'bossMode') {
        currentBossEnabled = msg.enabled;
        currentBossSaturation = msg.saturation;
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
        return;
      }
      if (msg.type === 'streamStart') {
        startStream();
        return;
      }
      if (msg.type === 'streamChunk') {
        appendChunk(msg.content);
        return;
      }
      if (msg.type === 'streamEnd') {
        // 将流式累积的纯文本替换为渲染后的 Markdown HTML
        if (streamDiv && msg.content) {
          streamDiv.innerHTML = msg.content;
          streamDiv.classList.add('msg-html');
        }
        endStream();
        // 清除工具状态提示
        const toolStatusEl = document.getElementById('tool-status');
        if (toolStatusEl) toolStatusEl.remove();
        return;
      }
      if (msg.type === 'toolStatus') {
        // 显示或移除工具执行状态提示
        let toolStatusEl = document.getElementById('tool-status');
        if (msg.status === 'executing') {
          if (!toolStatusEl) {
            const wrapper = document.createElement('div');
            wrapper.id = 'tool-status';
            wrapper.className = 'msg-wrapper ai';
            const label = document.createElement('div');
            label.className = 'msg-label';
            label.textContent = '系统';
            const div = document.createElement('div');
            div.className = 'msg';
            div.style.opacity = '0.7';
            div.style.fontSize = '12px';
            div.textContent = msg.message;
            wrapper.appendChild(label);
            wrapper.appendChild(div);
            $messages.appendChild(wrapper);
            $messages.scrollTop = $messages.scrollHeight;
          } else {
            toolStatusEl.querySelector('.msg').textContent = msg.message;
          }
        } else if (msg.status === 'done' && toolStatusEl) {
          toolStatusEl.remove();
        }
        return;
      }
      if (msg.type === 'aborted') {
        endStream();
        addMsg('ai', '(已停止)', false);
        return;
      }
      if (msg.type === 'error') {
        endStream();
        addMsg('ai', '错误: ' + msg.content, false);
        return;
      }
      // 兼容非流式响应
      if (msg.type === 'response') {
        endStream();
        addMsg('ai', msg.content, true);
      }
      // 配置状态消息
      if (msg.type === 'configStatus') {
        if (!msg.configured && !configShown) {
          showConfigPanel(msg.baseUrl, msg.model);
        }
        return;
      }
      // 显示配置面板
      if (msg.type === 'showConfig') {
        showConfigPanel(msg.baseUrl, msg.model);
        return;
      }
      // 配置保存结果
      if (msg.type === 'saveConfigResult') {
        if (msg.success) {
          $cfgStatus.className = 'success';
          $cfgStatus.style.display = 'block';
          $cfgStatus.textContent = '配置保存成功！';
          setTimeout(() => hideConfigPanel(), 1000);
        } else {
          $cfgStatus.className = 'error';
          $cfgStatus.style.display = 'block';
          $cfgStatus.textContent = '保存失败: ' + (msg.error || '未知错误');
        }
        return;
      }
      // 测试连接结果
      if (msg.type === 'testConfigResult') {
        $cfgTestBtn.disabled = false;
        $cfgTestBtn.textContent = '测试连接';
        if (msg.success) {
          $cfgStatus.className = 'success';
          $cfgStatus.style.display = 'block';
          $cfgStatus.textContent = '连接成功！模型: ' + (msg.model || '未知') + ', 耗时: ' + (msg.duration || '') + 'ms';
        } else {
          $cfgStatus.className = 'error';
          $cfgStatus.style.display = 'block';
          $cfgStatus.textContent = '连接失败: ' + (msg.error || '未知错误');
        }
        return;
      }
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'abort') {
        this.llm.abort();
        this.panel!.webview.postMessage({ type: 'aborted' });
        return;
      }
      if (msg.type === 'clearHistory') {
        this.messages = [];
        this.saveHistory();
        return;
      }
      if (msg.type === 'openConfig') {
        await this.openConfigPanel();
        return;
      }
      if (msg.type === 'saveConfig') {
        await this.handleSaveConfig(msg);
        return;
      }
      if (msg.type === 'testConfig') {
        await this.handleTestConfig(msg);
        return;
      }
      if (msg.type !== 'chat') return;

      this.messages.push({ role: 'user', content: msg.content, timestamp: Date.now() });

      // 快捷指令拦截：以 / 开头的输入直接执行工具，不经过 LLM
      const shortcut = parseShortcutCommand(msg.content);
      if (shortcut) {
        try {
          await this.executeShortcutCommand(shortcut);
        } catch (e: any) {
          this.panel!.webview.postMessage({ type: 'error', content: String(e) });
        }
        return;
      }

      // 获取所有工具定义
      const tools = getToolDefinitions();

      try {
        await this.streamWithToolLoop(tools);
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          this.panel!.webview.postMessage({ type: 'aborted' });
        } else {
          this.panel!.webview.postMessage({ type: 'error', content: String(e) });
        }
      }
    });
  }

  /**
   * 执行快捷指令
   *
   * 流程：
   * 1. 判断是否为 /帮助 指令，直接返回帮助文本
   * 2. 校验需要股票代码的指令是否提供了代码
   * 3. 调用 executeTool 执行对应的工具
   * 4. 将工具返回的 JSON 格式化为可读的 Markdown
   * 5. 将结果作为 assistant 消息存入历史并发送给前端
   */
  private async executeShortcutCommand(shortcut: { command: ShortcutCommand; code: string; extraArgs: string }) {
    const { command, code, extraArgs } = shortcut;

    // /帮助 指令：直接返回帮助文本
    if (command.toolName === '__help__') {
      const helpText = getHelpText();
      this.messages.push({ role: 'assistant', content: helpText, timestamp: Date.now() });
      this.saveHistory();
      this.panel!.webview.postMessage({
        type: 'response',
        content: this.renderMarkdown(helpText),
      });
      return;
    }

    // 校验需要股票代码的指令
    if (command.requiresCode && !code) {
      const errorMsg = `请提供股票代码，用法: \`${command.usage}\``;
      this.messages.push({ role: 'assistant', content: errorMsg, timestamp: Date.now() });
      this.saveHistory();
      this.panel!.webview.postMessage({
        type: 'response',
        content: this.renderMarkdown(errorMsg),
      });
      return;
    }

    // 构建工具参数
    const args: Record<string, unknown> = {};
    if (code) { args.code = code; }

    // 特殊处理：搜索股票的 keyword 参数
    // 搜索指令不需要 code 字段，extraArgs 或 code 均应作为 keyword 传入
    if (command.toolName === 'search_stock') {
      args.keyword = extraArgs || code;
    }

    // 特殊处理：热门排行榜的 rank_type 参数
    if (command.toolName === 'get_hot_stocks' && extraArgs) {
      const rankMap: Record<string, string> = {
        '跌幅': 'topLosers', '跌': 'topLosers', loser: 'topLosers',
        '换手': 'topTurnover', '换手率': 'topTurnover', turnover: 'topTurnover',
        '涨幅': 'topGainers', '涨': 'topGainers', gainer: 'topGainers',
      };
      args.rank_type = rankMap[extraArgs] || 'topGainers';
    }

    // 特殊处理：图表的 chart_type 参数
    if (command.toolName === 'open_chart' && extraArgs) {
      if (extraArgs.includes('分时')) {
        args.chart_type = 'intraday';
      } else {
        args.chart_type = 'kline';
      }
    }

    // 通知前端正在执行
    this.panel!.webview.postMessage({
      type: 'toolStatus',
      status: 'executing',
      message: `正在执行: /${command.name}${code ? ' ' + code : ''}`,
    });

    // 执行工具
    const resultJson = await executeTool(command.toolName, args);

    // 通知前端工具执行完成
    this.panel!.webview.postMessage({
      type: 'toolStatus',
      status: 'done',
      message: '',
    });

    // 格式化结果
    const formattedResult = formatToolResult(command.toolName, resultJson);

    // 存入历史并发送给前端
    this.messages.push({ role: 'assistant', content: formattedResult, timestamp: Date.now() });
    this.saveHistory();
    this.panel!.webview.postMessage({
      type: 'response',
      content: this.renderMarkdown(formattedResult),
    });
  }

  /**
   * 将 ChatMessage 转换为 LlmMessage（供 LLM API 调用）
   *
   * 关键映射：
   * - 'tool' 角色消息必须携带 tool_call_id
   * - 'assistant' 角色消息如果包含 toolCalls 则携带 tool_calls 字段
   * - 'user' 角色消息只有 role + content
   *
   * 截断逻辑（基于 token 预算，替代原按条数截断）：
   * 1. 从最新消息向旧方向遍历，在 token 预算内选择消息（优先保留新消息）
   * 2. 保证工具调用消息链完整性——如果截断边界切断了
   *    assistant(tool_calls) 与 tool 回复的配对，会同时丢弃不完整的链
   */
  private toLlmMessages(): LlmMessage[] {
    const systemPrompt = this.getSystemPrompt();
    const systemTokens = this.estimateTokens(systemPrompt);
    const remainingBudget = this.MAX_TOKENS - systemTokens;

    if (remainingBudget <= 0) {
      return [{ role: 'system', content: systemPrompt }];
    }

    // Phase 1: 从最新消息向旧方向遍历，在 token 预算内选择消息
    let totalTokens = 0;
    const selected: ChatMessage[] = [];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      // 估算时包含 toolCalls JSON 和 toolCallId 的开销
      const contentToMeasure = m.content
        + (m.toolCalls ? JSON.stringify(m.toolCalls) : '')
        + (m.toolCallId || '');
      const msgTokens = this.estimateTokens(contentToMeasure);

      if (totalTokens + msgTokens > remainingBudget) {
        break;
      }
      totalTokens += msgTokens;
      selected.unshift(m);
    }

    // Phase 2: 保证工具调用消息链完整性
    // 循环处理直到链完整：移除开头的孤立 tool 消息和不完整的 assistant+tool_calls 块
    let changed = true;
    while (changed && selected.length > 0) {
      changed = false;

      // 2a: 移除开头的孤立 tool 消息（其父 assistant 不在 selected 中）
      while (selected.length > 0 && selected[0].role === 'tool') {
        selected.shift();
        changed = true;
      }

      // 2b: 如果第一条消息是 assistant+tool_calls，检查其 tool 回复是否完整
      if (selected.length > 0 && selected[0].role === 'assistant' && selected[0].toolCalls?.length) {
        const requiredIds = new Set(selected[0].toolCalls.map(tc => tc.id));
        const foundIds = new Set<string>();

        for (let j = 1; j < selected.length; j++) {
          const candidate = selected[j];
          if (candidate.role === 'tool' && candidate.toolCallId) {
            if (requiredIds.has(candidate.toolCallId)) {
              foundIds.add(candidate.toolCallId);
            }
          }
          // 只检查紧跟 assistant 后面的连续 tool 消息
          if (candidate.role !== 'tool') {
            break;
          }
        }

        // 如果 tool 回复不完整，移除该 assistant 及其关联的 tool 消息
        if (foundIds.size < requiredIds.size) {
          selected.shift(); // 移除 assistant
          // 移除紧跟其后的属于该 assistant 的 tool 消息
          while (selected.length > 0) {
            const head = selected[0];
            if (head.role !== 'tool' || !head.toolCallId || !requiredIds.has(head.toolCallId)) {
              break;
            }
            selected.shift();
          }
          changed = true;
        }
      }
    }

    // Phase 3: 构建最终的 LlmMessage 数组
    const llmMsgs: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const m of selected) {
      const msg: LlmMessage = { role: m.role, content: m.content };
      if (m.toolCalls) {
        msg.tool_calls = m.toolCalls;
      }
      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }
      llmMsgs.push(msg);
    }

    return llmMsgs;
  }

  /**
   * 解析AI回复中的工具调用格式
   * 格式：```tool\n工具名: 参数\n```
   */
  private parseToolCalls(content: string): { toolCalls: { name: string; args: string }[]; cleanedContent: string } {
    const toolCalls: { name: string; args: string }[] = [];
    const toolRegex = /```tool\s*\n([^`]+)```/g;
    let match;

    const knownTools = [
      'get_stock_quote', 'get_kline_summary', 'get_intraday_data', 'get_finance_summary',
      'get_stock_news', 'get_research_reports', 'search_stock', 'get_market_overview',
      'get_market_distribution', 'get_hot_stocks', 'get_sector_list', 'get_7x24_news', 'open_chart'
    ];

    while ((match = toolRegex.exec(content)) !== null) {
      const toolBlock = match[1].trim();
      const lines = toolBlock.split('\n').map(l => l.trim()).filter(l => l);

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const name = line.substring(0, colonIdx).trim();
          const args = line.substring(colonIdx + 1).trim();
          toolCalls.push({ name, args });
        } else {
          // 没有冒号，尝试按空格分割
          const parts = line.split(/\s+/);
          const name = parts[0];
          const args = parts.slice(1).join(' ');
          toolCalls.push({ name, args });
        }
      }
    }

    // 移除工具调用块，保留其他内容
    const cleanedContent = content.replace(toolRegex, '').trim();
    return { toolCalls, cleanedContent };
  }

  /**
   * 带工具调用循环的流式对话
   *
   * 流程（兼容不支持 Function Calling 的服务端）：
   * 1. 发送消息给 LLM（不带 tools 参数）
   * 2. 解析回复中的工具调用格式（```tool ... ```）
   * 3. 如果有工具调用，执行工具并将结果作为用户消息发送
   * 4. 重复直到 LLM 返回纯文本（无工具调用）
   */
  private async streamWithToolLoop(_tools: ReturnType<typeof getToolDefinitions>) {
    this.panel!.webview.postMessage({ type: 'streamStart' });

    const MAX_TOOL_ROUNDS = 3; // 防止无限循环
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      let fullContent = '';

      // 构建消息列表（不带 tools 参数）
      const llmMsgs = this.toLlmMessages().map(m => {
        // 移除 tool_calls 和 tool_call_id 字段，简化消息
        const simplified: LlmMessage = { role: m.role, content: m.content };
        return simplified;
      });

      const stream = this.llm.chatStream(llmMsgs);

      for await (const chunk of stream) {
        fullContent += chunk;
        this.panel!.webview.postMessage({ type: 'streamChunk', content: chunk });
      }

      // 解析工具调用
      const { toolCalls, cleanedContent } = this.parseToolCalls(fullContent);

      // 没有工具调用 -> 正常结束
      if (toolCalls.length === 0) {
        this.messages.push({ role: 'assistant', content: fullContent, timestamp: Date.now() });
        this.saveHistory();
        this.panel!.webview.postMessage({ type: 'streamEnd', content: this.renderMarkdown(fullContent) });
        return;
      }

      // === 有工具调用 ===

      // 1. 存储 assistant 消息
      this.messages.push({
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      });

      // 2. 通知前端正在执行工具
      const toolNames = toolCalls.map(tc => tc.name).join(', ');
      this.panel!.webview.postMessage({
        type: 'toolStatus',
        status: 'executing',
        message: `正在执行工具: ${toolNames}`,
      });

      // 3. 执行所有工具调用
      const toolResults: string[] = [];
      for (const tc of toolCalls) {
        try {
          const args: Record<string, unknown> = {};
          if (tc.args) {
            // 解析参数（简单格式：key=value 或直接是值）
            if (tc.args.includes('=')) {
              const [key, ...rest] = tc.args.split('=');
              args[key.trim()] = rest.join('=').trim();
            } else {
              // 对于没有key的参数，根据工具名推断
              if (tc.name === 'get_stock_quote' || tc.name === 'get_kline_summary' ||
                tc.name === 'get_intraday_data' || tc.name === 'get_finance_summary' ||
                tc.name === 'get_stock_news' || tc.name === 'get_research_reports' ||
                tc.name === 'open_chart') {
                args.code = tc.args.split(/\s+/)[0];
                if (tc.name === 'open_chart' && tc.args.includes('intraday')) {
                  args.chart_type = 'intraday';
                } else if (tc.name === 'open_chart') {
                  args.chart_type = 'kline';
                }
              } else if (tc.name === 'search_stock') {
                args.keyword = tc.args;
              } else if (tc.name === 'get_hot_stocks') {
                const rankMap: Record<string, string> = {
                  '跌幅': 'topLosers', '跌': 'topLosers',
                  '换手': 'topTurnover', '换手率': 'topTurnover',
                  '涨幅': 'topGainers', '涨': 'topGainers',
                };
                args.rank_type = rankMap[tc.args] || 'topGainers';
              }
            }
          }

          const result = await executeTool(tc.name, args);
          const parsed = JSON.parse(result);
          if (parsed.success) {
            toolResults.push(`【${tc.name}结果】\n${JSON.stringify(parsed.data, null, 2)}`);
          } else {
            toolResults.push(`【${tc.name}错误】${parsed.error}`);
          }
        } catch (e: any) {
          toolResults.push(`【${tc.name}错误】${String(e)}`);
        }
      }

      // 4. 通知前端工具执行完成
      this.panel!.webview.postMessage({
        type: 'toolStatus',
        status: 'done',
        message: '工具执行完成，正在生成回复...',
      });

      // 5. 将工具结果作为用户消息添加，让LLM基于结果生成回复
      const toolResultMessage = `以下是工具执行结果，请基于这些数据回答用户的问题：\n\n${toolResults.join('\n\n')}`;
      this.messages.push({
        role: 'user',
        content: toolResultMessage,
        timestamp: Date.now(),
      });

      // 6. 继续循环，让 LLM 根据工具结果生成最终回复
    }

    // 超过最大轮次，结束流
    this.panel!.webview.postMessage({ type: 'streamEnd', content: this.renderMarkdown('') });
  }

  private getSystemPrompt(): string {
    let stockList = '贵州茅台=600519, 平安银行=000001, 宁德时代=300750';
    if (this.watchlistProvider) {
      const stocks = this.watchlistProvider.getStocks();
      if (stocks.length > 0) {
        // 对自选股名称进行消毒，防止通过股票名称注入恶意指令
        stockList = stocks.map(s => {
          const safeName = sanitizeForPrompt(s.name, 50);
          const safeCode = sanitizeForPrompt(s.code, 10);
          return `${safeName}=${safeCode}`;
        }).join(', ');
      }
    }

    return `你是A股智能投资助手。

# 自选股
${stockList}

# 重要规则
- 用户提到股票时，你只能输出一行工具调用，格式如下，不要输出任何其他内容：
\`\`\`tool
get_stock_quote: 300444
\`\`\`
- 收到工具结果后，用Markdown表格展示数据，加1-2句分析
- 绝对不要输出思考过程、规则说明、格式说明等无关内容

# 工具列表
- get_stock_quote: 代码 → 行情
- get_kline_summary: 代码 → K线
- get_intraday_data: 代码 → 分时
- get_finance_summary: 代码 → 财务
- get_stock_news: 代码 → 新闻
- get_research_reports: 代码 → 研报
- search_stock: 关键词 → 搜索
- get_market_overview → 大盘
- get_market_distribution → 涨跌分布
- get_hot_stocks: topGainers/topLosers/topTurnover → 热门
- get_sector_list → 板块
- get_7x24_news → 快讯
- open_chart: 代码 kline/intraday → 图表`;
  }

  private async handleSaveConfig(msg: { baseUrl: string; apiKey: string; model: string }): Promise<void> {
    if (!this.context) {
      this.panel?.webview.postMessage({ type: 'saveConfigResult', success: false, error: '扩展上下文不可用' });
      return;
    }
    try {
      const config = vscode.workspace.getConfiguration('cyberMonopoly');
      await config.update('llmBaseUrl', msg.baseUrl, vscode.ConfigurationTarget.Global);
      await config.update('llmModel', msg.model, vscode.ConfigurationTarget.Global);
      await this.context.secrets.store('cyberMonopoly.llm.apiKey', msg.apiKey);
      this.llm.updateConfig(msg.baseUrl || 'https://api.openai.com/v1', msg.apiKey, msg.model);
      this.panel?.webview.postMessage({ type: 'saveConfigResult', success: true });
    } catch (e: any) {
      this.panel?.webview.postMessage({ type: 'saveConfigResult', success: false, error: String(e) });
    }
  }

  private async handleTestConfig(msg: { baseUrl: string; apiKey: string; model: string }): Promise<void> {
    const testClient = new LlmClient({
      apiEndpoint: msg.baseUrl || 'https://api.openai.com/v1',
      apiKey: msg.apiKey,
      model: msg.model || 'gpt-3.5-turbo',
      temperature: 0,
    });
    const startTime = Date.now();
    try {
      await testClient.chat([['user', 'hi']]);
      const duration = Date.now() - startTime;
      this.panel?.webview.postMessage({
        type: 'testConfigResult',
        success: true,
        model: msg.model,
        duration: duration,
      });
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.panel?.webview.postMessage({
        type: 'testConfigResult',
        success: false,
        error: errorMsg,
        duration: duration,
      });
    }
  }

  setBossMode(enabled: boolean, saturation: number): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
    }
  }
}
