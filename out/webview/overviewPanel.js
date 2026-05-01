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
exports.OverviewPanel = void 0;
const vscode = __importStar(require("vscode"));
class OverviewPanel {
    constructor(provider) {
        this.provider = provider;
        this.refreshListener = provider.onDidChangeTreeData(() => {
            this.refreshContent();
        });
    }
    dispose() {
        this.refreshListener?.dispose();
    }
    show(context) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            this.refreshContent();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('cyberMonopolyOverview', '行情概览', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandler();
        this.refreshContent();
    }
    getWebviewContent() {
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    h2 { margin: 0 0 12px 0; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-weight: normal; }
    td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .up { color: #ef4444; }
    .down { color: #22c55e; }
    .flat { color: var(--vscode-descriptionForeground); }
    .loading { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h2>行情概览</h2>
  <div id="content"><div class="loading">加载中...</div></div>
  <script>
    const vscode = acquireVsCodeApi();
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'quotes') {
        let html = '<table><tr><th>名称</th><th>代码</th><th>当前价</th><th>涨跌幅</th><th>涨跌额</th></tr>';
        for (const q of msg.data) {
          const cls = q.changePercent > 0 ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
          const sign = q.changePercent >= 0 ? '+' : '';
          html += '<tr>' +
            '<td>' + esc(q.name) + '</td>' +
            '<td>' + esc(q.code) + '</td>' +
            '<td>' + q.price.toFixed(2) + '</td>' +
            '<td class="' + cls + '">' + sign + q.changePercent.toFixed(2) + '%</td>' +
            '<td class="' + cls + '">' + sign + q.changeAmount.toFixed(2) + '</td>' +
            '</tr>';
        }
        html += '</table>';
        document.getElementById('content').innerHTML = html;
      } else if (msg.type === 'bossMode') {
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
    });
  </script>
</body>
</html>`;
    }
    setupMessageHandler() {
        this.panel.webview.onDidReceiveMessage((msg) => {
            if (msg.action === 'refresh') {
                this.refreshContent();
            }
        });
    }
    refreshContent() {
        if (!this.panel)
            return;
        const quotes = this.provider.getQuotes();
        const quoteList = Array.from(quotes.values());
        this.panel.webview.postMessage({ type: 'quotes', data: quoteList });
    }
    setBossMode(enabled, saturation) {
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
        }
    }
}
exports.OverviewPanel = OverviewPanel;
//# sourceMappingURL=overviewPanel.js.map