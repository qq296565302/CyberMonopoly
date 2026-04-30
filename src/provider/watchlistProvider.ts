import * as vscode from 'vscode';
import { WatchStock, detectMarket } from '../models/stock';
import { RealtimeQuote, getRealtimeQuote, getBatchQuotes } from '../api/sina';
import { StateManager } from '../storage/stateManager';

export class StockTreeItem extends vscode.TreeItem {
  constructor(
    public readonly stock: WatchStock,
    public quote?: RealtimeQuote
  ) {
    super(`${stock.name} (${stock.code})`, vscode.TreeItemCollapsibleState.None);
    
    this.description = quote ? `${quote.price.toFixed(2)}  ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '--';
    this.iconPath = this.getIcon();
    this.tooltip = this.buildTooltip();
    this.contextValue = 'stock';
    this.command = {
      command: 'cyberMonopoly.openChart',
      arguments: [stock.code, stock.name],
      title: '查看K线'
    };
  }

  private getIcon(): vscode.ThemeIcon {
    if (!this.quote) return new vscode.ThemeIcon('circle-outline');
    if (this.quote.changePercent > 0) return new vscode.ThemeIcon('arrow-up');
    if (this.quote.changePercent < 0) return new vscode.ThemeIcon('arrow-down');
    return new vscode.ThemeIcon('minus');
  }

  private buildTooltip(): vscode.MarkdownString {
    if (!this.quote) return new vscode.MarkdownString('加载中...');
    const sign = this.quote.changePercent >= 0 ? '+' : '';
    return new vscode.MarkdownString(`
**${this.quote.name}** (${this.quote.code})
---
当前价: **${this.quote.price.toFixed(2)}**
今开: ${this.quote.open.toFixed(2)}
最高: ${this.quote.high.toFixed(2)}
最低: ${this.quote.low.toFixed(2)}
昨收: ${this.quote.prevClose.toFixed(2)}
涨跌幅: ${sign}${this.quote.changePercent.toFixed(2)}%
涨跌额: ${sign}${this.quote.changeAmount.toFixed(2)}
成交量: ${(this.quote.volume / 10000).toFixed(0)}万手
时间: ${this.quote.date} ${this.quote.time}
    `.trim());
  }
}

export class WatchlistProvider implements vscode.TreeDataProvider<StockTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StockTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stocks: WatchStock[] = [];
  private quotes: Map<string, RealtimeQuote> = new Map();

  constructor(private state: StateManager) {
    this.stocks = this.state.getWatchlist();
  }

  async refresh(): Promise<void> {
    if (this.stocks.length === 0) return;
    
    try {
      const codes = this.stocks.map(s => s.code);
      const quoteList = await getBatchQuotes(codes);
      
      this.quotes.clear();
      for (const q of quoteList) {
        this.quotes.set(q.code, q);
      }
      
      this._onDidChangeTreeData.fire(undefined);
    } catch (e) {
      vscode.window.showErrorMessage(`刷新行情失败: ${e}`);
    }
  }

  getTreeItem(element: StockTreeItem): StockTreeItem {
    return element;
  }

  getChildren(element?: StockTreeItem): Thenable<StockTreeItem[]> {
    if (element) return Promise.resolve([]);
    
    return Promise.resolve(
      this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code)))
    );
  }

  getStocks(): WatchStock[] {
    return this.stocks;
  }

  getQuotes(): Map<string, RealtimeQuote> {
    return this.quotes;
  }

  async addStock(code: string, name?: string): Promise<void> {
    if (this.stocks.some(s => s.code === code)) {
      vscode.window.showWarningMessage(`股票 ${code} 已在自选股中`);
      return;
    }

    let stockName = name;
    if (!stockName) {
      try {
        const quote = await getRealtimeQuote(code);
        stockName = quote.name;
      } catch {
        stockName = `股票${code}`;
      }
    }

    const stock: WatchStock = {
      code,
      name: stockName,
      market: detectMarket(code),
      addedAt: Date.now(),
    };

    this.stocks.push(stock);
    await this.state.saveWatchlist(this.stocks);
    this._onDidChangeTreeData.fire(undefined);
    
    try {
      const quote = await getRealtimeQuote(code);
      this.quotes.set(code, quote);
      this._onDidChangeTreeData.fire(undefined);
    } catch {}
  }

  removeStock(code: string): void {
    this.stocks = this.stocks.filter(s => s.code !== code);
    this.state.saveWatchlist(this.stocks);
    this.quotes.delete(code);
    this._onDidChangeTreeData.fire(undefined);
  }
}
