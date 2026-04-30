import * as vscode from 'vscode';
import { getKlineData, getIntradayData } from '../api/sina';

export class ChartPanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentCode = '';
  private currentName = '';
  private isCandlestick = true;
  private currentDays = 30;

  constructor() {}

  async show(code: string, name: string, context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.currentCode = code;
      this.currentName = name;
      this.panel.title = `${name} (${code})`;
      await this.loadKline(this.currentDays);
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

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent(context);
    this.setupMessageHandler();
    this.loadKline(30);
  }

  private getWebviewContent(_context: vscode.ExtensionContext): string {
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .toolbar { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); align-items: center; flex-wrap: wrap; }
    .toolbar button {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 4px 10px; cursor: pointer; border-radius: 2px; font-size: 12px; opacity: 0.8;
    }
    .toolbar button:hover { opacity: 1; }
    .toolbar button.active { opacity: 1; outline: 1px solid var(--vscode-focusBorder); }
    .toolbar .title { flex: 1; font-weight: bold; font-size: 14px; min-width: 120px; }
    .toolbar .sep { width: 1px; height: 16px; background: var(--vscode-panel-border); }
    #chart-container { height: calc(100vh - 44px); width: 100%; }
    .loading { display: flex; justify-content: center; align-items: center; height: 300px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="title" id="stock-title">--</span>
    <button id="btn-kline" class="active">K线</button>
    <button id="btn-intraday">分时</button>
    <span class="sep"></span>
    <button id="btn-d15">15日</button>
    <button id="btn-d30" class="active">30日</button>
    <button id="btn-d60">60日</button>
    <button id="btn-d120">120日</button>
    <span class="sep"></span>
    <button id="btn-refresh">↻ 刷新</button>
  </div>
  <div id="chart-container"><div class="loading">加载中...</div></div>

  <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
  <script>
    const vscode = acquireVsCodeApi();
    let chart = null;
    let mainSeries = null;
    let chartType = 'candlestick';

    function ensureChart() {
      const container = document.getElementById('chart-container');
      if (!chart) {
        container.innerHTML = '';
        if (typeof LightweightCharts === 'undefined') {
          container.innerHTML = '<div class="loading">图表库加载失败，请检查网络</div>';
          return false;
        }
        chart = LightweightCharts.createChart(container, {
          layout: {
            background: { type: 'solid', color: getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim() },
            textColor: getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim(),
          },
          grid: {
            vertLines: { color: 'rgba(128,128,128,0.1)' },
            horzLines: { color: 'rgba(128,128,128,0.1)' },
          },
          rightPriceScale: { borderColor: 'rgba(128,128,128,0.3)' },
          timeScale: { borderColor: 'rgba(128,128,128,0.3)', timeVisible: true },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        });
        window.addEventListener('resize', () => {
          if (chart) {
            chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
          }
        });
      }
      return true;
    }

    function setActiveBtn(id) {
      document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
      const el = document.getElementById('btn-' + id);
      if (el) el.classList.add('active');
    }

    function renderCandlestick(data) {
      if (!ensureChart()) return;
      if (mainSeries) { chart.removeSeries(mainSeries); mainSeries = null; }
      chartType = 'candlestick';
      mainSeries = chart.addCandlestickSeries({
        upColor: '#ef4444', downColor: '#22c55e',
        borderUpColor: '#ef4444', borderDownColor: '#22c55e',
        wickUpColor: '#ef4444', wickDownColor: '#22c55e',
      });
      const formatted = data.map(d => {
        const dt = new Date(d.date);
        const timeStr = dt.getFullYear() + '-' +
          String(dt.getMonth() + 1).padStart(2, '0') + '-' +
          String(dt.getDate()).padStart(2, '0');
        return {
          time: timeStr,
          open: d.open, high: d.high, low: d.low, close: d.close,
        };
      }).filter(d => d.open != null && d.open > 0);
      mainSeries.setData(formatted);
      chart.timeScale().fitContent();
    }

    function renderLine(data, prevClose) {
      if (!ensureChart()) return;
      if (mainSeries) { chart.removeSeries(mainSeries); mainSeries = null; }
      chartType = 'line';
      mainSeries = chart.addLineSeries({
        color: '#3b82f6', lineWidth: 2,
        lastValueVisible: true, priceLineVisible: true,
        baseValue: { type: 'price', price: prevClose || (data.length > 0 ? data[0].value : 0) },
      });
      const formatted = data.map(d => {
        const dt = new Date(d.date);
        return {
          time: Math.floor(dt.getTime() / 1000),
          value: d.value,
        };
      }).filter(d => d.value != null && d.value > 0);
      mainSeries.setData(formatted);
      chart.timeScale().fitContent();
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      document.getElementById('stock-title').textContent = msg.title || '';

      if (msg.type === 'candlestick') {
        renderCandlestick(msg.data);
      } else if (msg.type === 'line') {
        renderLine(msg.data, msg.prevClose);
      } else if (msg.type === 'error') {
        document.getElementById('chart-container').innerHTML =
          '<div class="loading">加载失败: ' + (msg.message || '未知错误') + '</div>';
        chart = null;
        mainSeries = null;
      }
    });

    document.querySelectorAll('.toolbar button[id^="btn-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.id.replace('btn-', '');
        if (action === 'kline') { setActiveBtn('kline'); setActiveBtn('d30'); }
        else if (action === 'intraday') { setActiveBtn('intraday'); }
        else if (action.startsWith('d')) { setActiveBtn(action); }
        vscode.postMessage({ action });
      });
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.action) {
        case 'kline':
          this.isCandlestick = true;
          this.currentDays = 30;
          await this.loadKline(30);
          break;
        case 'intraday':
          this.isCandlestick = false;
          await this.loadIntraday();
          break;
        case 'd15':
          this.currentDays = 15;
          if (this.isCandlestick) await this.loadKline(15);
          break;
        case 'd30':
          this.currentDays = 30;
          if (this.isCandlestick) await this.loadKline(30);
          break;
        case 'd60':
          this.currentDays = 60;
          if (this.isCandlestick) await this.loadKline(60);
          break;
        case 'd120':
          this.currentDays = 120;
          if (this.isCandlestick) await this.loadKline(120);
          break;
        case 'refresh':
          if (this.isCandlestick) await this.loadKline(this.currentDays);
          else await this.loadIntraday();
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
        title: `${series.name} (${this.currentCode})`,
      });
    } catch (e) {
      this.panel!.webview.postMessage({ type: 'error', message: String(e) });
    }
  }

  private async loadIntraday() {
    try {
      const series = await getIntradayData(this.currentCode);
      this.panel!.webview.postMessage({
        type: 'line',
        data: series.data,
        prevClose: series.prevClose,
        title: series.name,
      });
    } catch (e) {
      this.panel!.webview.postMessage({ type: 'error', message: String(e) });
    }
  }
}
