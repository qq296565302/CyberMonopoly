"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsViewProvider = void 0;
const sina_1 = require("../api/sina");
class NewsViewProvider {
    constructor(state) {
        this.state = state;
        this.items = [];
        this.items = state.getNewsCache();
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.action === 'refresh') {
                await this.refresh();
            }
        });
    }
    async refresh() {
        try {
            const fresh = await (0, sina_1.get7x24News)(1, 50);
            const existingIds = new Set(this.items.map(n => n.id));
            const newItems = fresh.filter(n => !existingIds.has(n.id));
            this.items = [...newItems, ...this.items].slice(0, 200);
            this.state.saveNewsCache(this.items);
            this.updateView();
        }
        catch (e) {
            // 静默失败
        }
    }
    clear() {
        this.items = [];
        this.state.saveNewsCache([]);
        this.updateView();
    }
    updateView() {
        if (this._view) {
            this._view.webview.html = this.getHtml();
        }
    }
    getHtml() {
        const newsHtml = this.items.map(n => {
            const time = n.createTime || '';
            const content = n.content || '';
            const tag = n.tag ? `<span class="tag">${n.tag}</span>` : '';
            return `<div class="news-item">${tag}<span class="time">${time}</span><div class="content">${content}</div></div>`;
        }).join('');
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 12px; }
    .news-item { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .news-item:last-child { border-bottom: none; }
    .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 4px; border-radius: 2px; font-size: 10px; margin-right: 4px; }
    .time { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .content { margin-top: 2px; line-height: 1.5; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
    .empty { text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  ${newsHtml || '<div class="empty">暂无快讯</div>'}
</body>
</html>`;
    }
}
exports.NewsViewProvider = NewsViewProvider;
NewsViewProvider.viewType = 'cyberMonopolyNews';
//# sourceMappingURL=newsProvider.js.map