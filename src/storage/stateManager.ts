import * as vscode from 'vscode';
import { WatchStock } from '../models/stock';
import { NewsItem } from '../models/news';

const KEY_WATCHLIST = 'cyberMonopoly.watchlist';
const KEY_NEWS_CACHE = 'cyberMonopoly.newsCache';
const KEY_SETTINGS = 'cyberMonopoly.settings';

export class StateManager {
  constructor(private globalState: vscode.Memento) {}

  getWatchlist(): WatchStock[] {
    return this.globalState.get<WatchStock[]>(KEY_WATCHLIST, []);
  }

  saveWatchlist(stocks: WatchStock[]): Thenable<void> {
    return this.globalState.update(KEY_WATCHLIST, stocks);
  }

  getNewsCache(): NewsItem[] {
    return this.globalState.get<NewsItem[]>(KEY_NEWS_CACHE, []);
  }

  saveNewsCache(news: NewsItem[]): Thenable<void> {
    return this.globalState.update(KEY_NEWS_CACHE, news);
  }

  getSetting<T>(key: string, defaultValue: T): T {
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    return settings[key] ?? defaultValue;
  }

  setSetting(key: string, value: any): Thenable<void> {
    const settings = this.globalState.get<Record<string, any>>(KEY_SETTINGS, {});
    settings[key] = value;
    return this.globalState.update(KEY_SETTINGS, settings);
  }
}
