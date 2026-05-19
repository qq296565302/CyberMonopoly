import * as vscode from 'vscode';
import { WatchStock } from '../models/stock';
import { NewsItem } from '../models/news';

const KEY_WATCHLIST = 'cyberMonopoly.watchlist';
const KEY_NEWS_CACHE = 'cyberMonopoly.newsCache';
const KEY_SETTINGS = 'cyberMonopoly.settings';

export class StateManager {
  private pendingSave: Thenable<void> | undefined;
  private dirty = false;

  constructor(private globalState: vscode.Memento) {}

  getWatchlist(): WatchStock[] {
    return this.globalState.get<WatchStock[]>(KEY_WATCHLIST, []);
  }

  saveWatchlist(stocks: WatchStock[]): Thenable<void> {
    this.dirty = true;
    this.pendingSave = this.globalState.update(KEY_WATCHLIST, stocks);
    this.pendingSave.then(() => { this.dirty = false; });
    return this.pendingSave;
  }

  getNewsCache(): NewsItem[] {
    return this.globalState.get<NewsItem[]>(KEY_NEWS_CACHE, []);
  }

  saveNewsCache(news: NewsItem[]): Thenable<void> {
    this.dirty = true;
    this.pendingSave = this.globalState.update(KEY_NEWS_CACHE, news);
    this.pendingSave.then(() => { this.dirty = false; });
    return this.pendingSave;
  }

  getSetting<T>(key: string, defaultValue: T): T {
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    return settings[key] ?? defaultValue;
  }

  setSetting(key: string, value: any): Thenable<void> {
    this.dirty = true;
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    settings[key] = value;
    this.pendingSave = this.globalState.update(KEY_SETTINGS, settings);
    this.pendingSave.then(() => { this.dirty = false; });
    return this.pendingSave;
  }

  /**
   * 在扩展停用(deactivate)前调用，确保所有待保存的数据已写入。
   * VS Code 的 globalState.update 本身是同步写入内存映射并异步刷盘，
   * 此方法确保最后一个 Promise 被等待。
   */
  async flush(): Promise<void> {
    if (this.pendingSave) {
      try {
        await this.pendingSave;
      } catch (e) {
        console.error('[StateManager] flush 失败:', e);
      }
    }
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }
}
