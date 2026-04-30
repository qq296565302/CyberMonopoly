import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';

export class OverviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private provider: WatchlistProvider) {}

  show(context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.refreshContent();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyOverview',
      '行情概览',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageHandler();
    this.refreshContent();
  }

  private getWebviewContent(): string {
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'quotes') {
        let html = '<table><tr><th>名称</th><th>代码</th><th>当前价</th><th>涨跌幅</th><th>涨跌额</th></tr>';
        for (const q of msg.data) {
          const cls = q.changePercent > 0 ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
          const sign = q.changePercent >= 0 ? '+' : '';
          html += '<tr>' +
            '<td>' + q.name + '</td>' +
            '<td>' + q.code + '</td>' +
            '<td>' + q.price.toFixed(2) + '</td>' +
            '<td class="' + cls + '">' + sign + q.changePercent.toFixed(2) + '%</td>' +
            '<td class="' + cls + '">' + sign + q.changeAmount.toFixed(2) + '</td>' +
            '</tr>';
        }
        html += '</table>';
        document.getElementById('content').innerHTML = html;
      }
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage((msg) => {
      if (msg.action === 'refresh') {
        this.refreshContent();
      }
    });
  }

  private refreshContent() {
    const quotes = this.provider.getQuotes();
    const quoteList = Array.from(quotes.values());
    this.panel!.webview.postMessage({ type: 'quotes', data: quoteList });
  }
}
