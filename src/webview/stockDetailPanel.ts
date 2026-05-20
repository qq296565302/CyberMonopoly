import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { getStockNews, getResearchReports, getFinanceData } from '../api/eastmoney';
import type { StockNewsItem, ResearchReport, FinanceIndicator } from '../api/eastmoney';
import { getRealtimeQuote } from '../api/sina';
import type { RealtimeQuote } from '../api/sina';
import { getNonce, buildCspContent } from '../utils/nonce';

export class StockDetailPanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentCode = '';
  private currentName = '';
  private newsCache = new Map<string, StockNewsItem[]>();
  private reportCache = new Map<string, ResearchReport[]>();
  private financeCache = new Map<string, FinanceIndicator[]>();
  private bossEnabled = true;
  private bossSaturation = 10;

  show(code: string, name: string, tab?: string) {
    this.currentCode = code;
    this.currentName = name;

    if (this.panel) {
      this.panel.title = `${name} (${code}) - 详情`;
      this.panel.reveal(vscode.ViewColumn.Active);
      this.panel.webview.postMessage({ type: 'switchStock', code, name, tab: tab || 'news' });
      // 重新应用老板模式状态
      this.applyBossMode();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyStockDetail',
      `${name} (${code}) - 详情`,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageHandler();
    this.panel.webview.postMessage({ type: 'switchStock', code, name, tab: tab || 'news' });
    // 应用老板模式状态
    this.applyBossMode();
  }

  private applyBossMode(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'bossMode', enabled: this.bossEnabled, saturation: this.bossSaturation });
    }
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'loadData') {
        await this.loadData(msg.code, msg.tab, msg.page || 1);
      } else if (msg.type === 'loadQuote') {
        await this.loadQuote(msg.code);
      } else if (msg.type === 'fetchNewsDetail') {
        await this.fetchNewsDetail(msg.url, msg.title, msg.source, msg.time);
      } else if (msg.type === 'openUrl') {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    });
  }

  private async loadQuote(code: string) {
    const panel = this.panel;
    if (!panel) return;

    try {
      const quote = await getRealtimeQuote(code);
      // 计算涨停跌停价
      const limitPrices = this.calculateLimitPrices(code, quote.prevClose);
      panel.webview.postMessage({
        type: 'quoteData',
        quote,
        limitPrices,
      });
    } catch (e: any) {
      panel.webview.postMessage({
        type: 'quoteError',
        message: String(e?.message || e),
      });
    }
  }

  private calculateLimitPrices(code: string, prevClose: number): {
    limitUp: number;
    limitDown: number;
    limitUp10: number;
    limitDown10: number;
    limitUp15: number;
    limitDown15: number;
    limitUp20: number;
    limitDown20: number;
    isGemOrStar: boolean;
  } {
    // 判断是否为创业板（300开头）或科创板（688开头）
    const isGemOrStar = code.startsWith('300') || code.startsWith('688');
    const limitRate = isGemOrStar ? 0.2 : 0.1;

    const limitUp = Math.round(prevClose * (1 + limitRate) * 100) / 100;
    const limitDown = Math.round(prevClose * (1 - limitRate) * 100) / 100;

    // +10% 和 -10% 的价格
    const limitUp10 = Math.round(prevClose * 1.1 * 100) / 100;
    const limitDown10 = Math.round(prevClose * 0.9 * 100) / 100;

    // +15% 和 -15% 的价格
    const limitUp15 = Math.round(prevClose * 1.15 * 100) / 100;
    const limitDown15 = Math.round(prevClose * 0.85 * 100) / 100;

    // +20% 和 -20% 的价格
    const limitUp20 = Math.round(prevClose * 1.2 * 100) / 100;
    const limitDown20 = Math.round(prevClose * 0.8 * 100) / 100;

    return {
      limitUp,
      limitDown,
      limitUp10,
      limitDown10,
      limitUp15,
      limitDown15,
      limitUp20,
      limitDown20,
      isGemOrStar,
    };
  }

  private async fetchNewsDetail(url: string, title: string, source: string, time: string) {
    const panel = this.panel;
    if (!panel) return;
    try {
      const html = await this.httpGet(url);
      const bodyMatch = html.match(/<div[^>]*class="[^"]*txtinfos[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<div[^>]*id="ContentBody"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

      let text = '';
      if (bodyMatch) {
        text = bodyMatch[1]
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      if (!text) {
        const fullText = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        const sentences = fullText.split(/[。！？]/);
        const meaningful = sentences.filter(s => s.length > 20).slice(0, 10);
        text = meaningful.join('。') + (meaningful.length > 0 ? '。' : '');
      }

      panel.webview.postMessage({
        type: 'newsDetail',
        title,
        source,
        time,
        content: text || '无法提取文章正文',
        url,
      });
    } catch (e: any) {
      panel.webview.postMessage({
        type: 'newsDetail',
        title,
        source,
        time,
        content: '文章正文加载失败: ' + String(e?.message || e),
        url,
      });
    }
  }

  private httpGet(url: string, timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https') ? https : http;
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error('请求超时'));
      }, timeoutMs);
      const req = transport.get(url, {
        headers: {
          'Referer': 'https://finance.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          clearTimeout(timer);
          const loc = res.headers.location;
          const nextUrl = loc.startsWith('http') ? loc : (url.startsWith('https') ? 'https://' : 'http://') + new URL(url).host + loc;
          this.httpGet(nextUrl, timeoutMs).then(resolve).catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
      });
      req.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }

  private async loadData(code: string, tab: string, page: number) {
    const panel = this.panel;
    if (!panel) return;

    try {
      if (tab === 'news') {
        const cacheKey = `${code}_${page}`;
        let items = this.newsCache.get(cacheKey);
        if (!items) {
          items = await getStockNews(code, page);
          this.newsCache.set(cacheKey, items);
        }
        panel.webview.postMessage({ type: 'newsData', data: items, page });
      } else if (tab === 'report') {
        const cacheKey = `${code}_${page}`;
        let items = this.reportCache.get(cacheKey);
        if (!items) {
          items = await getResearchReports(code, page);
          this.reportCache.set(cacheKey, items);
        }
        panel.webview.postMessage({ type: 'reportData', data: items, page });
      } else if (tab === 'finance') {
        let items = this.financeCache.get(code);
        if (!items) {
          items = await getFinanceData(code);
          this.financeCache.set(code, items);
        }
        panel.webview.postMessage({ type: 'financeData', data: items });
      }
    } catch (e: any) {
      panel.webview.postMessage({ type: 'error', message: String(e?.message || e), tab });
    }
  }

  setBossMode(enabled: boolean, saturation: number): void {
    this.bossEnabled = enabled;
    this.bossSaturation = saturation;
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
    }
  }

  private getWebviewContent(): string {
    const nonce = getNonce();
    const bossInitEnabled = this.bossEnabled;
    const bossInitSaturation = this.bossSaturation;
    return /*html*/ `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${buildCspContent(nonce)}">
  <style nonce="${nonce}">
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); display: flex; flex-direction: column; box-sizing: border-box; }
    #header { padding: 12px 16px 0; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
    #stock-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
    #quote-panel { display: none; margin-bottom: 12px; padding: 12px; border-radius: 6px; }
    #quote-panel.visible { display: block; }
    .quote-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
    .quote-price { font-size: 24px; font-weight: 700; }
    .quote-change { font-size: 14px; font-weight: 500; }
    .quote-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; font-size: 12px; }
    .quote-item { display: flex; justify-content: space-between; }
    .quote-label { color: var(--vscode-descriptionForeground); }
    .quote-value { font-weight: 500; }
    .price-up { color: #ef4444; }
    .price-down { color: #22c55e; }
    .price-flat { color: var(--vscode-foreground); }
    .limit-section { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border); }
    .limit-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
    .limit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; font-size: 12px; }
    #tabs { display: flex; gap: 0; }
    .tab { padding: 8px 20px; cursor: pointer; font-size: 13px; border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; color: var(--vscode-descriptionForeground); background: transparent; transition: all 0.15s; }
    .tab:hover { color: var(--vscode-foreground); background: var(--vscode-editor-inactiveSelectionBackground); }
    .tab.active { color: var(--vscode-foreground); background: var(--vscode-editor-background); border-color: var(--vscode-panel-border); border-bottom-color: var(--vscode-editor-background); font-weight: 500; position: relative; z-index: 1; margin-bottom: -1px; }
    #content { flex: 1; overflow-y: auto; padding: 16px; }
    .loading { text-align: center; color: var(--vscode-descriptionForeground); padding: 40px; font-size: 13px; }
    .error { color: var(--vscode-errorForeground); padding: 16px; text-align: center; }
    .empty { color: var(--vscode-descriptionForeground); text-align: center; padding: 40px; }

    .news-item { padding: 12px 0; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; transition: background 0.1s; border-radius: 4px; padding-left: 8px; padding-right: 8px; margin: 0 -8px; }
    .news-item:hover { background: var(--vscode-list-hoverBackground); }
    .news-item:last-child { border-bottom: none; }
    .news-item .title { font-size: 14px; font-weight: 500; margin-bottom: 4px; line-height: 1.5; color: var(--vscode-textLink-foreground, #3794ff); }
    .news-item .meta { font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 12px; }
    .news-item .digest { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 6px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .report-item { padding: 12px 8px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; transition: background 0.1s; border-radius: 4px; margin: 0 -8px; }
    .report-item:hover { background: var(--vscode-list-hoverBackground); }
    .report-item:last-child { border-bottom: none; }
    .report-item .title { font-size: 14px; font-weight: 500; margin-bottom: 6px; line-height: 1.5; color: var(--vscode-textLink-foreground, #3794ff); }
    .report-item .meta { font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; flex-wrap: wrap; gap: 8px 16px; }
    .report-item .rating-tag { display: inline-block; padding: 1px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; }
    .rating-buy { background: rgba(239,68,68,0.15); color: #ef4444; }
    .rating-hold { background: rgba(234,179,8,0.15); color: #eab308; }
    .rating-sell { background: rgba(34,197,94,0.15); color: #22c55e; }
    .report-item .predict { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 6px; }

    .detail-view { animation: fadeIn 0.15s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .detail-back { display: inline-flex; align-items: center; gap: 4px; color: var(--vscode-textLink-foreground, #3794ff); cursor: pointer; font-size: 13px; margin-bottom: 16px; padding: 4px 0; }
    .detail-back:hover { text-decoration: underline; }
    .detail-title { font-size: 18px; font-weight: 600; line-height: 1.5; margin-bottom: 10px; }
    .detail-meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px; }
    .detail-body { font-size: 14px; line-height: 1.8; color: var(--vscode-foreground); white-space: pre-wrap; word-break: break-word; }
    .detail-actions { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 12px; }
    .detail-actions button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .detail-actions button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }

    .detail-report .report-header { margin-bottom: 16px; }
    .detail-report .report-info-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13px; margin-bottom: 16px; }
    .detail-report .info-label { color: var(--vscode-descriptionForeground); font-weight: 500; }
    .detail-report .info-value { color: var(--vscode-foreground); }
    .detail-report .predict-box { background: var(--vscode-editor-inactiveSelectionBackground, rgba(0,0,0,0.05)); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
    .detail-report .predict-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .detail-report .predict-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 12px; }
    .detail-report .digest-text { font-size: 14px; line-height: 1.8; color: var(--vscode-foreground); white-space: pre-wrap; }

    table.fin-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.fin-table th { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 8px 6px; text-align: right; font-weight: 600; border-bottom: 2px solid var(--vscode-panel-border); color: var(--vscode-foreground); white-space: nowrap; }
    table.fin-table th:first-child { text-align: left; }
    table.fin-table td { padding: 6px; text-align: right; border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap; }
    table.fin-table td:first-child { text-align: left; color: var(--vscode-descriptionForeground); }
    table.fin-table tr:hover td { background: var(--vscode-list-hoverBackground); }
    .num-pos { color: #ef4444; }
    .num-neg { color: #22c55e; }

    #pager { display: flex; justify-content: center; gap: 8px; padding: 12px 0; align-items: center; }
    #pager button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 14px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    #pager button:disabled { opacity: 0.4; cursor: not-allowed; }
    #pager .page-num { font-size: 12px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="header">
    <div id="stock-name">--</div>
    <div id="quote-panel">
      <div class="quote-header">
        <span class="quote-price" id="q-price">--</span>
        <span class="quote-change" id="q-change">--</span>
      </div>
      <div class="quote-grid">
        <div class="quote-item"><span class="quote-label">今开</span><span class="quote-value" id="q-open">--</span></div>
        <div class="quote-item"><span class="quote-label">昨收</span><span class="quote-value" id="q-prev">--</span></div>
        <div class="quote-item"><span class="quote-label">最高</span><span class="quote-value" id="q-high">--</span></div>
        <div class="quote-item"><span class="quote-label">最低</span><span class="quote-value" id="q-low">--</span></div>
        <div class="quote-item"><span class="quote-label">成交量</span><span class="quote-value" id="q-vol">--</span></div>
        <div class="quote-item"><span class="quote-label">涨跌额</span><span class="quote-value" id="q-amount">--</span></div>
        <div class="quote-item"><span class="quote-label">换手率</span><span class="quote-value" id="q-turnover-rate">--</span></div>
        <div class="quote-item"><span class="quote-label">成交额</span><span class="quote-value" id="q-turnover">--</span></div>
        <div class="quote-item"><span class="quote-label">市盈(动)</span><span class="quote-value" id="q-pe">--</span></div>
        <div class="quote-item"><span class="quote-label">市净率</span><span class="quote-value" id="q-pb">--</span></div>
        <div class="quote-item"><span class="quote-label">总市值</span><span class="quote-value" id="q-total-cap">--</span></div>
        <div class="quote-item"><span class="quote-label">流通市值</span><span class="quote-value" id="q-float-cap">--</span></div>
      </div>
      <div class="limit-section">
        <div class="limit-title">涨跌停价格</div>
        <div class="limit-grid">
          <div class="quote-item"><span class="quote-label">涨停</span><span class="quote-value price-up" id="q-limit-up">--</span></div>
          <div class="quote-item"><span class="quote-label">跌停</span><span class="quote-value price-down" id="q-limit-down">--</span></div>
        </div>
      </div>
      <div class="limit-section" id="gem-star-section" style="display:none">
        <div class="limit-title">创业板/科创板涨跌幅参考</div>
        <div class="limit-grid">
          <div class="quote-item"><span class="quote-label">+10%</span><span class="quote-value price-up" id="q-up10">--</span></div>
          <div class="quote-item"><span class="quote-label">-10%</span><span class="quote-value price-down" id="q-down10">--</span></div>
          <div class="quote-item"><span class="quote-label">+15%</span><span class="quote-value price-up" id="q-up15">--</span></div>
          <div class="quote-item"><span class="quote-label">-15%</span><span class="quote-value price-down" id="q-down15">--</span></div>
          <div class="quote-item"><span class="quote-label">+20%</span><span class="quote-value price-up" id="q-up20">--</span></div>
          <div class="quote-item"><span class="quote-label">-20%</span><span class="quote-value price-down" id="q-down20">--</span></div>
        </div>
      </div>
    </div>
    <div id="tabs">
      <div class="tab active" data-tab="news">资讯</div>
      <div class="tab" data-tab="report">研报</div>
      <div class="tab" data-tab="finance">财报</div>
    </div>
  </div>
  <div id="content"><div class="loading">加载中...</div></div>

  <script nonce="${nonce}">
    var vscode = acquireVsCodeApi();
    var currentBossEnabled = ${bossInitEnabled};
    var currentBossSaturation = ${bossInitSaturation};
    if (currentBossEnabled) {
      document.body.style.filter = 'saturate(' + (currentBossSaturation / 100) + ')';
    }
    var currentCode = '';
    var currentName = '';
    var currentTab = 'news';
    var currentPage = 1;
    var cachedNews = [];
    var cachedReports = [];
    var cachedPage = 1;

    var \$tabs = document.querySelectorAll('.tab');
    var \$content = document.getElementById('content');
    var \$stockName = document.getElementById('stock-name');
    var \$quotePanel = document.getElementById('quote-panel');

    \$tabs.forEach(function(t) {
      t.addEventListener('click', function() {
        switchTab(t.getAttribute('data-tab'));
      });
    });

    function switchTab(tab) {
      currentTab = tab;
      currentPage = 1;
      \$tabs.forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
      \$content.innerHTML = '<div class="loading">加载中...</div>';
      vscode.postMessage({ type: 'loadData', code: currentCode, tab: tab, page: 1 });
    }

    function switchStock(code, name, tab) {
      currentCode = code;
      currentName = name;
      \$stockName.textContent = name + ' (' + code + ')';
      \$quotePanel.classList.remove('visible');
      vscode.postMessage({ type: 'loadQuote', code: code });
      switchTab(tab || 'news');
    }

    function goPage(p) {
      currentPage = p;
      vscode.postMessage({ type: 'loadData', code: currentCode, tab: currentTab, page: p });
      \$content.innerHTML = '<div class="loading">加载中...</div>';
    }

    function backToList() {
      if (currentTab === 'news') {
        renderNews(cachedNews, cachedPage);
      } else if (currentTab === 'report') {
        renderReports(cachedReports, cachedPage);
      }
    }

    function escHtml(s) {
      if (!s) return '';
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatVolume(vol) {
      if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿';
      if (vol >= 10000) return (vol / 10000).toFixed(0) + '万';
      return String(vol);
    }

    function formatMoney(amount) {
      if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿';
      if (amount >= 10000) return (amount / 10000).toFixed(0) + '万';
      return amount.toFixed(2);
    }

    function renderQuote(quote, limitPrices) {
      \$quotePanel.classList.add('visible');

      var price = quote.price;
      var prevClose = quote.prevClose;
      var changePercent = quote.changePercent;
      var changeAmount = quote.changeAmount;
      var sign = changePercent >= 0 ? '+' : '';
      var priceClass = changePercent > 0 ? 'price-up' : (changePercent < 0 ? 'price-down' : 'price-flat');

      document.getElementById('q-price').textContent = price.toFixed(2);
      document.getElementById('q-price').className = 'quote-price ' + priceClass;
      document.getElementById('q-change').innerHTML = sign + changePercent.toFixed(2) + '%  ' + sign + changeAmount.toFixed(2);
      document.getElementById('q-change').className = 'quote-change ' + priceClass;

      document.getElementById('q-open').textContent = quote.open.toFixed(2);
      document.getElementById('q-open').className = 'quote-value ' + (quote.open > prevClose ? 'price-up' : (quote.open < prevClose ? 'price-down' : 'price-flat'));
      document.getElementById('q-prev').textContent = prevClose.toFixed(2);
      document.getElementById('q-high').textContent = quote.high.toFixed(2);
      document.getElementById('q-high').className = 'quote-value ' + (quote.high > prevClose ? 'price-up' : (quote.high < prevClose ? 'price-down' : 'price-flat'));
      document.getElementById('q-low').textContent = quote.low.toFixed(2);
      document.getElementById('q-low').className = 'quote-value ' + (quote.low > prevClose ? 'price-up' : (quote.low < prevClose ? 'price-down' : 'price-flat'));
      document.getElementById('q-vol').textContent = formatVolume(quote.volume);
      document.getElementById('q-amount').innerHTML = '<span class="' + priceClass + '">' + sign + changeAmount.toFixed(2) + '</span>';
      document.getElementById('q-turnover-rate').textContent = quote.turnoverRate ? quote.turnoverRate.toFixed(2) + '%' : '--';
      document.getElementById('q-turnover').textContent = quote.turnover ? formatMoney(quote.turnover) : '--';
      document.getElementById('q-pe').textContent = quote.pe ? quote.pe.toFixed(2) : '--';
      document.getElementById('q-pb').textContent = quote.pb ? quote.pb.toFixed(2) : '--';
      document.getElementById('q-total-cap').textContent = quote.totalMarketCap ? formatMoney(quote.totalMarketCap) : '--';
      document.getElementById('q-float-cap').textContent = quote.floatMarketCap ? formatMoney(quote.floatMarketCap) : '--';

      document.getElementById('q-limit-up').textContent = limitPrices.limitUp.toFixed(2);
      document.getElementById('q-limit-down').textContent = limitPrices.limitDown.toFixed(2);

      if (limitPrices.isGemOrStar) {
        document.getElementById('gem-star-section').style.display = '';
        document.getElementById('q-up10').textContent = limitPrices.limitUp10.toFixed(2);
        document.getElementById('q-down10').textContent = limitPrices.limitDown10.toFixed(2);
        document.getElementById('q-up15').textContent = limitPrices.limitUp15.toFixed(2);
        document.getElementById('q-down15').textContent = limitPrices.limitDown15.toFixed(2);
        document.getElementById('q-up20').textContent = limitPrices.limitUp20.toFixed(2);
        document.getElementById('q-down20').textContent = limitPrices.limitDown20.toFixed(2);
      } else {
        document.getElementById('gem-star-section').style.display = 'none';
      }
    }

    function colorNum(val) {
      var n = parseFloat(val);
      if (isNaN(n)) return val;
      if (n > 0) return '<span class="num-pos">+' + val + '</span>';
      if (n < 0) return '<span class="num-neg">' + val + '</span>';
      return val;
    }

    function ratingClass(r) {
      if (!r) return '';
      if (r.indexOf('\u4e70') >= 0 || r.indexOf('\u589e') >= 0 || r.indexOf('\u5f3a') >= 0 || /buy/i.test(r)) return 'rating-buy';
      if (r.indexOf('\u5356') >= 0 || r.indexOf('\u51cf') >= 0 || /sell/i.test(r)) return 'rating-sell';
      return 'rating-hold';
    }

    function renderNews(items, page) {
      cachedNews = items;
      cachedPage = page;
      if (!items || items.length === 0) { \$content.innerHTML = '<div class="empty">\u6682\u65e0\u8d44\u8baf</div>'; return; }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var n = items[i];
        html += '<div class="news-item" data-idx="' + i + '">' +
          '<div class="title">' + escHtml(n.title) + '</div>' +
          '<div class="meta"><span>' + escHtml(n.source || '') + '</span><span>' + escHtml(n.time || '') + '</span></div>' +
          (n.digest ? '<div class="digest">' + escHtml(n.digest) + '</div>' : '') +
          '</div>';
      }
      html += '<div id="pager">' +
        '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="goPage(' + (page - 1) + ')">\u4e0a\u4e00\u9875</button>' +
        '<span class="page-num">\u7b2c ' + page + ' \u9875</span>' +
        '<button ' + (items.length < 20 ? 'disabled' : '') + ' onclick="goPage(' + (page + 1) + ')">\u4e0b\u4e00\u9875</button>' +
        '</div>';
      \$content.innerHTML = html;

      \$content.querySelectorAll('.news-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.getAttribute('data-idx'));
          var item = items[idx];
          if (item) {
            showNewsDetail(item);
          }
        });
      });
    }

    function showNewsDetail(item) {
      var html = '<div class="detail-view">' +
        '<div class="detail-back" onclick="backToList()">&larr; \u8fd4\u56de\u5217\u8868</div>' +
        '<div class="detail-title">' + escHtml(item.title) + '</div>' +
        '<div class="detail-meta">' +
          (item.source ? '<span>' + escHtml(item.source) + '</span>' : '') +
          (item.time ? '<span>' + escHtml(item.time) + '</span>' : '') +
        '</div>' +
        '<div class="detail-body">' + escHtml(item.digest || '\u52a0\u8f7d\u4e2d...') + '</div>' +
        (item.url ? '<div class="detail-actions"><button onclick="openUrl(\\'' + escHtml(item.url) + '\\')">\ud83d\udcc4 \u5728\u6d4f\u89c8\u5668\u4e2d\u67e5\u770b\u539f\u6587</button></div>' : '') +
        '</div>';
      \$content.innerHTML = html;

      if (item.url) {
        vscode.postMessage({ type: 'fetchNewsDetail', url: item.url, title: item.title, source: item.source, time: item.time });
      }
    }

    function openUrl(url) {
      vscode.postMessage({ type: 'openUrl', url: url });
    }

    function renderReports(items, page) {
      cachedReports = items;
      cachedPage = page;
      if (!items || items.length === 0) { \$content.innerHTML = '<div class="empty">\u6682\u65e0\u7814\u62a5</div>'; return; }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var r = items[i];
        var rc = ratingClass(r.rating);
        html += '<div class="report-item" data-idx="' + i + '">' +
          '<div class="title">' + escHtml(r.title) + '</div>' +
          '<div class="meta">' +
            '<span>' + escHtml(r.orgName) + '</span>' +
            (r.author ? '<span>' + escHtml(r.author) + '</span>' : '') +
            '<span>' + escHtml(r.publishDate) + '</span>' +
            (r.rating ? '<span class="rating-tag ' + rc + '">' + escHtml(r.rating) + '</span>' : '') +
          '</div>';
        var predicts = [];
        if (r.predictThisYearEps) predicts.push('\u4eca\u5e74EPS: ' + r.predictThisYearEps);
        if (r.predictThisYearPe) predicts.push('\u4eca\u5e74PE: ' + r.predictThisYearPe);
        if (r.predictNextYearEps) predicts.push('\u660e\u5e74EPS: ' + r.predictNextYearEps);
        if (r.predictNextYearPe) predicts.push('\u660e\u5e74PE: ' + r.predictNextYearPe);
        if (predicts.length > 0) {
          html += '<div class="predict">' + predicts.join('  |  ') + '</div>';
        }
        html += '</div>';
      }
      html += '<div id="pager">' +
        '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="goPage(' + (page - 1) + ')">\u4e0a\u4e00\u9875</button>' +
        '<span class="page-num">\u7b2c ' + page + ' \u9875</span>' +
        '<button ' + (items.length < 20 ? 'disabled' : '') + ' onclick="goPage(' + (page + 1) + ')">\u4e0b\u4e00\u9875</button>' +
        '</div>';
      \$content.innerHTML = html;

      \$content.querySelectorAll('.report-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.getAttribute('data-idx'));
          var item = items[idx];
          if (item) {
            showReportDetail(item);
          }
        });
      });
    }

    function showReportDetail(r) {
      var rc = ratingClass(r.rating);
      var html = '<div class="detail-view detail-report">' +
        '<div class="detail-back" onclick="backToList()">&larr; \u8fd4\u56de\u5217\u8868</div>' +
        '<div class="detail-title">' + escHtml(r.title) + '</div>' +
        '<div class="report-header"><div class="meta">' +
          (r.rating ? '<span class="rating-tag ' + rc + '" style="font-size:13px;padding:3px 12px;">' + escHtml(r.rating) + '</span>' : '') +
        '</div></div>' +
        '<div class="report-info-grid">' +
          '<span class="info-label">\u673a\u6784</span><span class="info-value">' + escHtml(r.orgName) + '</span>' +
          (r.author ? '<span class="info-label">\u4f5c\u8005</span><span class="info-value">' + escHtml(r.author) + '</span>' : '') +
          '<span class="info-label">\u65e5\u671f</span><span class="info-value">' + escHtml(r.publishDate) + '</span>' +
          (r.industry ? '<span class="info-label">\u884c\u4e1a</span><span class="info-value">' + escHtml(r.industry) + '</span>' : '') +
        '</div>';

      var hasPredict = r.predictThisYearEps || r.predictThisYearPe || r.predictNextYearEps || r.predictNextYearPe;
      if (hasPredict) {
        html += '<div class="predict-box"><div class="predict-title">\u76c8\u5229\u9884\u6d4b</div><div class="predict-grid">';
        if (r.predictThisYearEps) { html += '<span class="info-label">\u672c\u5e74 EPS</span><span class="info-value">' + escHtml(r.predictThisYearEps) + '</span>'; }
        if (r.predictThisYearPe) { html += '<span class="info-label">\u672c\u5e74 PE</span><span class="info-value">' + escHtml(r.predictThisYearPe) + '</span>'; }
        if (r.predictNextYearEps) { html += '<span class="info-label">\u660e\u5e74 EPS</span><span class="info-value">' + escHtml(r.predictNextYearEps) + '</span>'; }
        if (r.predictNextYearPe) { html += '<span class="info-label">\u660e\u5e74 PE</span><span class="info-value">' + escHtml(r.predictNextYearPe) + '</span>'; }
        html += '</div></div>';
      }

      if (r.digest) {
        html += '<div class="digest-text">' + escHtml(r.digest) + '</div>';
      }

      html += '</div>';
      \$content.innerHTML = html;
    }

    function renderFinance(items) {
      if (!items || items.length === 0) { \$content.innerHTML = '<div class="empty">\u6682\u65e0\u8d22\u52a1\u6570\u636e</div>'; return; }
      var cols = [
        { key: 'reportName', label: '\u62a5\u544a\u671f' },
        { key: 'eps', label: 'EPS' },
        { key: 'bvps', label: '\u6bcf\u80a1\u51c0\u8d44\u4ea7' },
        { key: 'roe', label: 'ROE(%)' },
        { key: 'revenue', label: '\u8425\u6536(\u4ebf)' },
        { key: 'netProfit', label: '\u51c0\u5229\u6da6(\u4ebf)' },
        { key: 'revenueYoy', label: '\u8425\u6536\u540c\u6bd4(%)' },
        { key: 'netProfitYoy', label: '\u51c0\u5229\u6da6\u540c\u6bd4(%)' },
        { key: 'grossMargin', label: '\u6bdb\u5229\u7387(%)' },
        { key: 'netMargin', label: '\u51c0\u5229\u7387(%)' },
        { key: 'debtRatio', label: '\u8d44\u4ea7\u8d1f\u503a\u7387(%)' },
      ];
      var html = '<table class="fin-table"><thead><tr>';
      for (var c = 0; c < cols.length; c++) { html += '<th>' + cols[c].label + '</th>'; }
      html += '</tr></thead><tbody>';
      for (var i = 0; i < items.length; i++) {
        var row = items[i];
        html += '<tr>';
        for (var c = 0; c < cols.length; c++) {
          var v = row[cols[c].key] || '--';
          var display = v;
          if (cols[c].key !== 'reportName' && v !== '--') {
            var n = parseFloat(v);
            if (!isNaN(n)) {
              if (cols[c].key === 'revenue' || cols[c].key === 'netProfit') {
                display = (n / 100000000).toFixed(2);
              } else {
                display = n.toFixed(2);
              }
              if (n > 0 && (cols[c].key.indexOf('Yoy') >= 0 || cols[c].key === 'roe' || cols[c].key === 'grossMargin' || cols[c].key === 'netMargin')) {
                display = '<span class="num-pos">+' + display + '</span>';
              } else if (n < 0) {
                display = '<span class="num-neg">' + display + '</span>';
              }
            }
          }
          html += '<td>' + display + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      \$content.innerHTML = html;
    }

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'switchStock') {
        switchStock(msg.code, msg.name, msg.tab);
      } else if (msg.type === 'quoteData') {
        renderQuote(msg.quote, msg.limitPrices);
      } else if (msg.type === 'quoteError') {
        \$quotePanel.classList.remove('visible');
      } else if (msg.type === 'newsData') {
        renderNews(msg.data, msg.page);
      } else if (msg.type === 'reportData') {
        renderReports(msg.data, msg.page);
      } else if (msg.type === 'financeData') {
        renderFinance(msg.data);
      } else if (msg.type === 'newsDetail') {
        var detailBody = \$content.querySelector('.detail-body');
        if (detailBody) {
          detailBody.textContent = msg.content;
        }
      } else if (msg.type === 'error') {
        \$content.innerHTML = '<div class="error">\u52a0\u8f7d\u5931\u8d25: ' + escHtml(msg.message) + '</div>';
      } else if (msg.type === 'bossMode') {
        currentBossEnabled = msg.enabled;
        currentBossSaturation = msg.saturation;
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
    });
  </script>
</body>
</html>`;
  }
}
