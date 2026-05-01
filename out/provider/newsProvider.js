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
exports.NewsViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const sina_1 = require("../api/sina");
class NewsViewProvider {
    constructor(state) {
        this.state = state;
        this.items = [];
        this.initialized = false;
        this.bossEnabled = false;
        this.bossSaturation = 10;
        this.items = state.getNewsCache();
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = this.getHtml();
        this.initialized = false;
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.action === 'refresh') {
                await this.refresh();
            }
        });
        if (this.bossEnabled) {
            this._view.webview.postMessage({ type: 'bossMode', enabled: true, saturation: this.bossSaturation });
        }
    }
    async refresh() {
        try {
            const fresh = await (0, sina_1.get7x24News)(1, 50);
            const existingIds = new Set(this.items.map(n => n.id));
            const newItems = fresh.filter(n => !existingIds.has(n.id));
            this.items = [...newItems, ...this.items].slice(0, 200);
            this.state.saveNewsCache(this.items);
            this.updateView(newItems);
        }
        catch (e) {
            // 静默失败
        }
    }
    clear() {
        this.items = [];
        this.state.saveNewsCache([]);
        if (this._view) {
            this._view.webview.html = this.getHtml();
            this.initialized = false;
        }
    }
    setBossMode(enabled, saturation) {
        this.bossEnabled = enabled;
        this.bossSaturation = saturation;
        if (this._view) {
            this._view.webview.postMessage({ type: 'bossMode', enabled, saturation });
        }
    }
    escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    updateView(newItems) {
        if (!this._view)
            return;
        if (!this.initialized) {
            this._view.webview.html = this.getHtml();
            this.initialized = true;
            return;
        }
        if (newItems && newItems.length > 0) {
            const fontSize = vscode.workspace.getConfiguration('cyberMonopoly').get('chartFontSize', 14);
            const itemsHtml = newItems.map(n => {
                const time = this.escapeHtml(n.createTime || '');
                const content = this.escapeHtml(n.content || '');
                const tag = n.tag ? `<span class="tag">${this.escapeHtml(n.tag)}</span>` : '';
                return `<div class="news-item">${tag}<span class="time">${time}</span><div class="content">${content}</div></div>`;
            }).join('');
            this._view.webview.postMessage({ type: 'prepend', html: itemsHtml, fontSize });
        }
    }
    getHtml() {
        const fontSize = vscode.workspace.getConfiguration('cyberMonopoly').get('chartFontSize', 14);
        const newsHtml = this.items.map(n => {
            const time = this.escapeHtml(n.createTime || '');
            const content = this.escapeHtml(n.content || '');
            const tag = n.tag ? `<span class="tag">${this.escapeHtml(n.tag)}</span>` : '';
            return `<div class="news-item">${tag}<span class="time">${time}</span><div class="content">${content}</div></div>`;
        }).join('');
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: ${fontSize}px; }
    .news-item { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .news-item:last-child { border-bottom: none; }
    .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 4px; border-radius: 2px; font-size: ${Math.max(fontSize - 2, 8)}px; margin-right: 4px; }
    .time { color: var(--vscode-descriptionForeground); font-size: ${Math.max(fontSize - 1, 8)}px; }
    .content { margin-top: 2px; line-height: 1.5; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
    .empty { text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="news-list">${newsHtml || '<div class="empty">暂无快讯</div>'}</div>
  <script>
    const list = document.getElementById('news-list');
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'prepend') {
        const empty = list.querySelector('.empty');
        if (empty) empty.remove();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = msg.html;
        while (wrapper.firstChild) {
          list.insertBefore(wrapper.firstChild, list.firstChild);
        }
        while (list.children.length > 200) {
          list.removeChild(list.lastChild);
        }
      } else if (msg.type === 'bossMode') {
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
    });
  </script>
</body>
</html>`;
    }
}
exports.NewsViewProvider = NewsViewProvider;
NewsViewProvider.viewType = 'cyberMonopolyNews';
//# sourceMappingURL=newsProvider.js.map