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
exports.ChartViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const sina_1 = require("../api/sina");
function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
class ChartViewProvider {
    constructor(context) {
        this.context = context;
        this.currentCode = '';
        this.currentName = '';
        this.isCandlestick = true;
        this.currentDays = 30;
        this.bossEnabled = false;
        this.bossSaturation = 10;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'assets'))],
        };
        webviewView.webview.html = this.getWebviewContent(webviewView.webview);
        this.setupMessageHandler();
        if (this.bossEnabled) {
            this.view.webview.postMessage({ type: 'bossMode', enabled: true, saturation: this.bossSaturation });
        }
    }
    async show(code, name) {
        this.currentCode = code;
        this.currentName = name;
        if (this.view) {
            this.view.title = `${name} (${code})`;
            this.view.show(true);
            await this.loadKline(this.currentDays);
        }
    }
    getWebviewContent(webview) {
        const nonce = getNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'assets', 'lightweight-charts.standalone.production.js')));
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .toolbar { display: flex; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); align-items: center; flex-wrap: wrap; }
    .toolbar button {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 3px 8px; cursor: pointer; border-radius: 2px; font-size: 11px; opacity: 0.8;
    }
    .toolbar button:hover { opacity: 1; }
    .toolbar button.active { opacity: 1; outline: 1px solid var(--vscode-focusBorder); }
    .toolbar .title { flex: 1; font-weight: bold; font-size: 13px; min-width: 100px; }
    .toolbar .sep { width: 1px; height: 14px; background: var(--vscode-panel-border); }
    #chart-area { height: calc(100% - 36px); width: 100%; display: flex; flex-direction: column; }
    #price-container { flex: 7; width: 100%; position: relative; }
    #volume-container { flex: 3; width: 100%; position: relative; border-top: 1px solid rgba(128,128,128,0.2); }
    #volume-container .vol-label { position: absolute; top: 4px; left: 10px; z-index: 10; font-size: 10px; color: var(--vscode-descriptionForeground); pointer-events: none; }
    .loading { display: flex; justify-content: center; align-items: center; height: 200px; color: var(--vscode-descriptionForeground); }
    #info-panel {
      position: absolute; top: 8px; left: 10px; z-index: 10;
      font-size: 11px; line-height: 1.7; pointer-events: none;
      background: rgba(0,0,0,0.6); color: #fff; padding: 6px 10px; border-radius: 4px;
      display: none; min-width: 160px;
    }
    #info-panel .label { color: #aaa; margin-right: 4px; }
    #info-panel .up { color: #ef4444; }
    #info-panel .down { color: #22c55e; }
    #info-panel .flat { color: #aaa; }
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
  <div id="chart-area">
    <div id="price-container"><div class="loading">加载中...</div><div id="info-panel"></div></div>
    <div id="volume-container"><span class="vol-label">成交量</span></div>
  </div>

  <script src="${scriptUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let priceChart = null;
    let volChart = null;
    let mainSeries = null;
    let volumeSeries = null;
    let chartType = 'candlestick';
    let currentRawData = [];
    let prevClose = 0;
    let syncingTimeScale = false;
    let $infoPanel = document.getElementById('info-panel');

    function getLayoutOpts() {
      var bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim();
      var fg = getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim();
      return { background: { type: 'solid', color: bg }, textColor: fg };
    }

    function getGridOpts() {
      return {
        vertLines: { color: 'rgba(128,128,128,0.1)' },
        horzLines: { color: 'rgba(128,128,128,0.1)' },
      };
    }

    function syncTimeScales(fromChart, toChart) {
      if (syncingTimeScale) return;
      syncingTimeScale = true;
      try {
        var logical = fromChart.timeScale().getVisibleLogicalRange();
        if (logical) {
          toChart.timeScale().setVisibleLogicalRange(logical);
        }
      } catch (e) {}
      syncingTimeScale = false;
    }

    function syncCrosshair(fromChart, toChart) {
      fromChart.subscribeCrosshairMove(function(param) {
        if (!param || !param.time) return;
        if (toChart) {
          try {
            toChart.timeScale().scrollToPosition(
              fromChart.timeScale().scrollPosition(), false
            );
          } catch (e) {}
        }
      });
    }

    function ensureCharts() {
      var priceContainer = document.getElementById('price-container');
      var volContainer = document.getElementById('volume-container');

      if (!priceChart) {
        priceContainer.innerHTML = '';
        var panel = document.createElement('div');
        panel.id = 'info-panel';
        priceContainer.appendChild(panel);
        $infoPanel = panel;

        if (typeof LightweightCharts === 'undefined') {
          priceContainer.innerHTML = '<div class="loading">图表库加载失败，请检查网络</div>';
          return false;
        }

        priceChart = LightweightCharts.createChart(priceContainer, {
          layout: getLayoutOpts(),
          grid: getGridOpts(),
          rightPriceScale: { borderColor: 'rgba(128,128,128,0.3)' },
          timeScale: { borderColor: 'rgba(128,128,128,0.3)', timeVisible: false, secondsVisible: false },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
          handleScroll: { vertTouchDrag: false },
        });
      }

      if (!volChart) {
        volContainer.innerHTML = '';
        var label = document.createElement('span');
        label.className = 'vol-label';
        label.textContent = '成交量';
        volContainer.appendChild(label);

        volChart = LightweightCharts.createChart(volContainer, {
          layout: getLayoutOpts(),
          grid: getGridOpts(),
          rightPriceScale: { borderColor: 'rgba(128,128,128,0.3)', scaleMargins: { top: 0.1, bottom: 0 } },
          timeScale: { borderColor: 'rgba(128,128,128,0.3)', timeVisible: false, secondsVisible: false, visible: false },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
          handleScroll: { vertTouchDrag: false },
        });

        priceChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
          if (volChart) syncTimeScales(priceChart, volChart);
        });
        volChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
          if (priceChart) syncTimeScales(volChart, priceChart);
        });
      }

      window.addEventListener('resize', function() {
        if (priceChart) {
          priceChart.applyOptions({ width: priceContainer.clientWidth, height: priceContainer.clientHeight });
        }
        if (volChart) {
          volChart.applyOptions({ width: volContainer.clientWidth, height: volContainer.clientHeight });
        }
      });

      priceChart.subscribeCrosshairMove(function(param) {
        if (!param || !param.time || !param.seriesData || param.seriesData.size === 0) {
          $infoPanel.style.display = 'none';
          return;
        }
        var entry = null;
        for (var pair of param.seriesData) {
          entry = pair[1]; break;
        }
        if (!entry) { $infoPanel.style.display = 'none'; return; }
        $infoPanel.style.display = 'block';

        var volText = '';
        if (param.seriesData.size > 1) {
          for (var pair of param.seriesData) {
            var v = pair[1];
            if (v && v.value !== undefined && v !== entry) {
              volText = '<div><span class="label">量</span>' + formatVolume(v.value) + '</div>';
            }
          }
        } else {
          var volVal = findVolumeForTime(param.time);
          if (volVal !== null) {
            volText = '<div><span class="label">量</span>' + formatVolume(volVal) + '</div>';
          }
        }

        if (chartType === 'candlestick') {
          var o = entry.open, h = entry.high, l = entry.low, c = entry.close;
          var chg = o ? ((c - o) / o * 100) : 0;
          var cls = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
          var sign = chg >= 0 ? '+' : '';
          $infoPanel.innerHTML =
            '<div><span class="label">开</span>' + o.toFixed(2) + '</div>' +
            '<div><span class="label">高</span>' + h.toFixed(2) + '</div>' +
            '<div><span class="label">低</span>' + l.toFixed(2) + '</div>' +
            '<div><span class="label">收</span>' + c.toFixed(2) + '</div>' +
            '<div><span class="label">幅</span><span class="' + cls + '">' + sign + chg.toFixed(2) + '%</span></div>' +
            volText;
        } else {
          var val = entry.value || entry.close;
          var base = prevClose || (currentRawData.length > 0 ? currentRawData[0].value : val);
          var chg = base ? ((val - base) / base * 100) : 0;
          var chgAbs = val - base;
          var cls = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
          var sign = chg >= 0 ? '+' : '';
          $infoPanel.innerHTML =
            '<div><span class="label">价</span>' + val.toFixed(2) + '</div>' +
            '<div><span class="label">涨跌</span><span class="' + cls + '">' + sign + chgAbs.toFixed(2) + '</span></div>' +
            '<div><span class="label">幅</span><span class="' + cls + '">' + sign + chg.toFixed(2) + '%</span></div>' +
            volText;
        }
      });

      return true;
    }

    function formatVolume(v) {
      if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿';
      if (v >= 10000) return (v / 10000).toFixed(1) + '万';
      return String(Math.round(v));
    }

    function findVolumeForTime(time) {
      for (var i = 0; i < currentRawData.length; i++) {
        var d = currentRawData[i];
        var t = null;
        if (chartType === 'line') {
          var dt = d.date;
          if (dt instanceof Date) t = Math.floor(dt.getTime() / 1000);
          else t = Math.floor(new Date(dt).getTime() / 1000);
        } else {
          var dt = d.date;
          if (dt instanceof Date) {
            t = dt.getFullYear() + '-' +
              String(dt.getMonth() + 1).padStart(2, '0') + '-' +
              String(dt.getDate()).padStart(2, '0');
          } else {
            var dd = new Date(dt);
            t = dd.getFullYear() + '-' +
              String(dd.getMonth() + 1).padStart(2, '0') + '-' +
              String(dd.getDate()).padStart(2, '0');
          }
        }
        if (t === time) return d.volume || 0;
      }
      return null;
    }

    function setActiveBtn(id) {
      document.querySelectorAll('.toolbar button').forEach(function(b) { b.classList.remove('active'); });
      var el = document.getElementById('btn-' + id);
      if (el) el.classList.add('active');
    }

    function renderCandlestick(data) {
      if (!ensureCharts()) return;
      if (mainSeries) { priceChart.removeSeries(mainSeries); mainSeries = null; }
      if (volumeSeries) { volChart.removeSeries(volumeSeries); volumeSeries = null; }
      chartType = 'candlestick';
      currentRawData = data;

      priceChart.applyOptions({
        timeScale: {
          timeVisible: false,
          secondsVisible: false,
          barSpacing: 3,
          tickMarkFormatter: function(time) {
            if (typeof time === 'string') return time.slice(5);
            if (typeof time === 'object' && time !== null) {
              return String(time.month).padStart(2, '0') + '/' + String(time.day).padStart(2, '0');
            }
            return '';
          },
        },
        localization: {
          timeFormatter: function(time) {
            if (typeof time === 'string') return time;
            if (typeof time === 'object' && time !== null) {
              return time.year + '-' + String(time.month).padStart(2, '0') + '-' + String(time.day).padStart(2, '0');
            }
            return String(time);
          },
        },
      });

      mainSeries = priceChart.addCandlestickSeries({
        upColor: '#ef4444', downColor: '#22c55e',
        borderUpColor: '#ef4444', borderDownColor: '#22c55e',
        wickUpColor: '#ef4444', wickDownColor: '#22c55e',
      });

      var formatted = data.map(function(d) {
        var dt = new Date(d.date);
        var timeStr = dt.getFullYear() + '-' +
          String(dt.getMonth() + 1).padStart(2, '0') + '-' +
          String(dt.getDate()).padStart(2, '0');
        return { time: timeStr, open: d.open, high: d.high, low: d.low, close: d.close };
      }).filter(function(d) { return d.open != null && d.open > 0; });
      mainSeries.setData(formatted);

      var volData = data.map(function(d) {
        var dt = new Date(d.date);
        var timeStr = dt.getFullYear() + '-' +
          String(dt.getMonth() + 1).padStart(2, '0') + '-' +
          String(dt.getDate()).padStart(2, '0');
        var isUp = d.close >= d.open;
        return { time: timeStr, value: d.volume || 0, color: isUp ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)' };
      }).filter(function(d) { return d.value > 0; });

      volumeSeries = volChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });
      volChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
      volChart.applyOptions({ timeScale: { barSpacing: 3 } });
      volumeSeries.setData(volData);

      priceChart.timeScale().fitContent();
      volChart.timeScale().fitContent();
      syncTimeScales(priceChart, volChart);
    }

    function renderLine(data, prevCloseVal) {
      if (!ensureCharts()) return;
      if (mainSeries) { priceChart.removeSeries(mainSeries); mainSeries = null; }
      if (volumeSeries) { volChart.removeSeries(volumeSeries); volumeSeries = null; }
      chartType = 'line';
      currentRawData = data;
      prevClose = prevCloseVal || 0;

      priceChart.applyOptions({
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 2,
          tickMarkFormatter: function(time) {
            if (typeof time === 'number') {
              var d = new Date(time * 1000);
              return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            }
            return '';
          },
        },
        localization: {
          timeFormatter: function(time) {
            if (typeof time === 'number') {
              var d = new Date(time * 1000);
              return String(d.getMonth() + 1).padStart(2, '0') + '/' +
                String(d.getDate()).padStart(2, '0') + ' ' +
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0');
            }
            return String(time);
          },
        },
      });

      mainSeries = priceChart.addLineSeries({
        color: '#3b82f6', lineWidth: 2,
        lastValueVisible: true, priceLineVisible: true,
        baseValue: { type: 'price', price: prevClose || (data.length > 0 ? data[0].value : 0) },
      });

      var formatted = data.map(function(d) {
        var dt = new Date(d.date);
        return { time: Math.floor(dt.getTime() / 1000), value: d.value };
      }).filter(function(d) { return d.value != null && d.value > 0; });
      mainSeries.setData(formatted);

      var basePrice = prevClose || (data.length > 0 ? data[0].value : 0);
      var volData = [];
      var prevVol = 0;
      var prevVal = basePrice;
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        var cumVol = d.volume || 0;
        var incVol = i === 0 ? cumVol : cumVol - prevVol;
        if (incVol < 0) incVol = cumVol;
        prevVol = cumVol;
        var dt = new Date(d.date);
        var ts = Math.floor(dt.getTime() / 1000);
        var isUp = d.value >= prevVal;
        prevVal = d.value;
        if (incVol > 0) {
          volData.push({ time: ts, value: incVol, color: isUp ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)' });
        }
      }

      volumeSeries = volChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });
      volChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
      volChart.applyOptions({ timeScale: { barSpacing: 2 } });
      volumeSeries.setData(volData);

      priceChart.timeScale().fitContent();
      volChart.timeScale().fitContent();
      syncTimeScales(priceChart, volChart);
    }

    window.addEventListener('message', function(event) {
      var msg = event.data;
      document.getElementById('stock-title').textContent = msg.title || '';

      if (msg.type === 'candlestick') {
        renderCandlestick(msg.data);
      } else if (msg.type === 'line') {
        renderLine(msg.data, msg.prevClose);
      } else if (msg.type === 'error') {
        document.getElementById('price-container').innerHTML =
          '<div class="loading">加载失败: ' + (msg.message || '未知错误') + '</div>';
        priceChart = null;
        mainSeries = null;
        volChart = null;
        volumeSeries = null;
      } else if (msg.type === 'bossMode') {
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
    });

    document.querySelectorAll('.toolbar button[id^="btn-"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.id.replace('btn-', '');
        if (action === 'kline') { setActiveBtn('kline'); }
        else if (action === 'intraday') { setActiveBtn('intraday'); }
        else if (action.startsWith('d')) { setActiveBtn('kline'); setActiveBtn(action); }
        vscode.postMessage({ action: action });
      });
    });
  </script>
</body>
</html>`;
    }
    setupMessageHandler() {
        if (!this.view)
            return;
        this.view.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.action) {
                case 'kline':
                    this.isCandlestick = true;
                    await this.loadKline(this.currentDays);
                    break;
                case 'intraday':
                    this.isCandlestick = false;
                    await this.loadIntraday();
                    break;
                case 'd15':
                    this.currentDays = 15;
                    this.isCandlestick = true;
                    await this.loadKline(15);
                    break;
                case 'd30':
                    this.currentDays = 30;
                    this.isCandlestick = true;
                    await this.loadKline(30);
                    break;
                case 'd60':
                    this.currentDays = 60;
                    this.isCandlestick = true;
                    await this.loadKline(60);
                    break;
                case 'd120':
                    this.currentDays = 120;
                    this.isCandlestick = true;
                    await this.loadKline(120);
                    break;
                case 'refresh':
                    if (this.isCandlestick)
                        await this.loadKline(this.currentDays);
                    else
                        await this.loadIntraday();
                    break;
                default:
                    console.warn('[赛博大富翁] 未知图表 action:', msg.action);
            }
        });
    }
    async loadKline(days) {
        if (!this.view)
            return;
        try {
            const series = await (0, sina_1.getKlineData)(this.currentCode, days);
            this.view.webview.postMessage({
                type: 'candlestick',
                data: series.data,
                title: `${series.name} (${this.currentCode})`,
            });
        }
        catch (e) {
            this.view.webview.postMessage({ type: 'error', message: String(e) });
        }
    }
    async loadIntraday() {
        if (!this.view)
            return;
        try {
            const series = await (0, sina_1.getIntradayData)(this.currentCode);
            this.view.webview.postMessage({
                type: 'line',
                data: series.data,
                prevClose: series.prevClose,
                title: series.name,
            });
        }
        catch (e) {
            this.view.webview.postMessage({ type: 'error', message: String(e) });
        }
    }
    setBossMode(enabled, saturation) {
        this.bossEnabled = enabled;
        this.bossSaturation = saturation;
        if (this.view) {
            this.view.webview.postMessage({ type: 'bossMode', enabled, saturation });
        }
    }
}
exports.ChartViewProvider = ChartViewProvider;
//# sourceMappingURL=chartPanel.js.map