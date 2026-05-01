import * as vscode from 'vscode';
import { NewsItem } from '../models/news';
import { get7x24News } from '../api/sina';
import { StateManager } from '../storage/stateManager';

export class NewsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cyberMonopolyNews';

  private _view?: vscode.WebviewView;
  private items: NewsItem[] = [];
  private initialized = false;
  private bossEnabled = false;
  private bossSaturation = 10;

  constructor(private state: StateManager) {
    this.items = state.getNewsCache();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
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

  async refresh(): Promise<void> {
    try {
      const fresh = await get7x24News(1, 50);
      const existingIds = new Set(this.items.map(n => n.id));
      const newItems = fresh.filter(n => !existingIds.has(n.id));
      this.items = [...newItems, ...this.items].slice(0, 200);
      this.state.saveNewsCache(this.items);
      this.updateView(newItems);
    } catch (e) {
      // 静默失败
    }
  }

  clear(): void {
    this.items = [];
    this.state.saveNewsCache([]);
    if (this._view) {
      this._view.webview.html = this.getHtml();
      this.initialized = false;
    }
  }

  setBossMode(enabled: boolean, saturation: number): void {
    this.bossEnabled = enabled;
    this.bossSaturation = saturation;
    if (this._view) {
      this._view.webview.postMessage({ type: 'bossMode', enabled, saturation });
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private updateView(newItems?: NewsItem[]): void {
    if (!this._view) return;

    if (!this.initialized) {
      this._view.webview.html = this.getHtml();
      this.initialized = true;
      return;
    }

    if (newItems && newItems.length > 0) {
      const fontSize = vscode.workspace.getConfiguration('cyberMonopoly').get<number>('chartFontSize', 14);
      const itemsHtml = newItems.map(n => {
        const time = this.escapeHtml(n.createTime || '');
        const content = this.escapeHtml(n.content || '');
        const tag = n.tag ? `<span class="tag">${this.escapeHtml(n.tag)}</span>` : '';
        return `<div class="news-item">${tag}<span class="time">${time}</span><div class="content">${content}</div></div>`;
      }).join('');
      this._view.webview.postMessage({ type: 'prepend', html: itemsHtml, fontSize });
    }
  }

  private getHtml(): string {
    const fontSize = vscode.workspace.getConfiguration('cyberMonopoly').get<number>('chartFontSize', 14);
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
