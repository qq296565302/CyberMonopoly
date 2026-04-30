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
exports.NewsPanel = void 0;
const vscode = __importStar(require("vscode"));
class NewsPanel {
    show(news) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            this.panel.webview.postMessage({ type: 'news', data: news });
            return;
        }
        this.panel = vscode.window.createWebviewPanel('cyberMonopolyNewsDetail', '快讯详情', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.html = this.getWebviewContent(news);
    }
    getWebviewContent(news) {
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
exports.NewsPanel = NewsPanel;
//# sourceMappingURL=newsPanel.js.map