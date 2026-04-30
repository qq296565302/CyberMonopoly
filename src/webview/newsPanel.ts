import * as vscode from 'vscode';
import { NewsItem } from '../models/news';

export class NewsPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(news: NewsItem) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.panel.webview.postMessage({ type: 'news', data: news });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyNewsDetail',
      '快讯详情',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent(news);
  }

  private getWebviewContent(news: NewsItem): string {
    const time = news.createTime || '';
    const tag = news.tag ? `<span class="tag">${news.tag}</span>` : '';
    
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    .meta { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    .content { line-height: 1.8; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="meta">
    <span>${time}</span>
    ${tag}
  </div>
  <div class="content" id="news-content">${news.content}</div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      if (event.data.type === 'news') {
        const n = event.data.data;
        document.getElementById('news-content').textContent = n.content;
        document.querySelector('.meta').innerHTML = 
          '<span>' + (n.createTime || '') + '</span>' +
          (n.tag ? '<span class="tag">' + n.tag + '</span>' : '');
      }
    });
  </script>
</body>
</html>`;
  }
}
