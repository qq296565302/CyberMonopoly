import * as vscode from 'vscode';
import { WatchStock, detectMarket } from '../models/stock';
import { RealtimeQuote, getRealtimeQuote, getBatchQuotes } from '../api/sina';
import { getHotStocks, HotStock, HotStockRankType } from '../api/eastmoney';
import { StateManager } from '../storage/stateManager';

type TreeItem = StockTreeItem | CategoryTreeItem | RankCategoryTreeItem | HotStockTreeItem;

export class CategoryTreeItem extends vscode.TreeItem {
  constructor(public readonly categoryId: string, label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'category';
  }
}

export class RankCategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly rankType: HotStockRankType,
    label: string,
    icon: string,
    private count: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'rankCategory';
  }
}

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
    if (!this.quote) return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.lines'));
    if (this.quote.changePercent > 0) return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
    if (this.quote.changePercent < 0) return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
    return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
  }

  private buildTooltip(): vscode.MarkdownString {
    if (!this.quote) return new vscode.MarkdownString('加载中...');
    const sign = this.quote.changePercent >= 0 ? '+' : '';
    const emoji = this.quote.changePercent > 0 ? '📈' : this.quote.changePercent < 0 ? '📉' : '➡️';
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.isTrusted = true;
    tooltip.value = [
      `${emoji} **${this.quote.name}** (${this.quote.code})`,
      `---`,
      `| | |`,
      `|---|---|`,
      `| 当前价 | **${this.quote.price.toFixed(2)}** |`,
      `| 涨跌幅 | ${sign}${this.quote.changePercent.toFixed(2)}% |`,
      `| 涨跌额 | ${sign}${this.quote.changeAmount.toFixed(2)} |`,
      `| 今开 | ${this.quote.open.toFixed(2)} |`,
      `| 最高 | ${this.quote.high.toFixed(2)} |`,
      `| 最低 | ${this.quote.low.toFixed(2)} |`,
      `| 昨收 | ${this.quote.prevClose.toFixed(2)} |`,
      `| 成交量 | ${(this.quote.volume / 10000).toFixed(0)}万手 |`,
      `| 时间 | ${this.quote.date} ${this.quote.time} |`,
    ].join('\n');
    return tooltip;
  }
}

export class HotStockTreeItem extends vscode.TreeItem {
  constructor(
    public readonly hotStock: HotStock,
    public readonly displayRankType: HotStockRankType
  ) {
    super(`${hotStock.name} (${hotStock.code})`, vscode.TreeItemCollapsibleState.None);
    
    this.description = this.buildDescription();
    this.iconPath = this.getIcon();
    this.tooltip = this.buildTooltip();
    this.contextValue = 'hotstock';
    this.command = {
      command: 'cyberMonopoly.openChart',
      arguments: [hotStock.code, hotStock.name],
      title: '查看K线'
    };
  }

  private buildDescription(): string {
    if (this.displayRankType === 'topTurnover') {
      return `${this.hotStock.price.toFixed(2)}  换手${this.hotStock.turnoverRate.toFixed(1)}%`;
    }
    return `${this.hotStock.price.toFixed(2)}  ${this.hotStock.changePercent >= 0 ? '+' : ''}${this.hotStock.changePercent.toFixed(2)}%`;
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.displayRankType === 'topTurnover') {
      return new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.yellow'));
    }
    if (this.hotStock.changePercent > 0) return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
    if (this.hotStock.changePercent < 0) return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
    return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
  }

  private buildTooltip(): vscode.MarkdownString {
    const sign = this.hotStock.changePercent >= 0 ? '+' : '';
    const emoji = this.hotStock.changePercent > 0 ? '📈' : this.hotStock.changePercent < 0 ? '📉' : '➡️';
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.isTrusted = true;
    const lines = [
      `${emoji} **${this.hotStock.name}** (${this.hotStock.code})`,
      `---`,
      `| | |`,
      `|---|---|`,
      `| 当前价 | **${this.hotStock.price.toFixed(2)}** |`,
      `| 涨跌幅 | ${sign}${this.hotStock.changePercent.toFixed(2)}% |`,
      `| 涨跌额 | ${sign}${this.hotStock.changeAmount.toFixed(2)} |`,
      `| 换手率 | ${this.hotStock.turnoverRate.toFixed(2)}% |`,
    ];
    tooltip.value = lines.join('\n');
    return tooltip;
  }
}

export class WatchlistProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stocks: WatchStock[] = [];
  private quotes: Map<string, RealtimeQuote> = new Map();
  private hotStocksGainers: HotStock[] = [];
  private hotStocksLosers: HotStock[] = [];
  private hotStocksTurnover: HotStock[] = [];

  constructor(private state: StateManager) {
    this.stocks = this.state.getWatchlist();
    this.loadAllHotStocks();
  }

  private async loadAllHotStocks(): Promise<void> {
    try {
      const [gainers, losers, turnover] = await Promise.all([
        getHotStocks(20, 'topGainers'),
        getHotStocks(20, 'topLosers'),
        getHotStocks(20, 'topTurnover'),
      ]);
      this.hotStocksGainers = gainers;
      this.hotStocksLosers = losers;
      this.hotStocksTurnover = turnover;
    } catch {
      this.hotStocksGainers = [];
      this.hotStocksLosers = [];
      this.hotStocksTurnover = [];
    }
  }

  async refresh(): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (this.stocks.length > 0) {
      tasks.push(
        (async () => {
          const codes = this.stocks.map(s => s.code);
          const quoteList = await getBatchQuotes(codes);
          this.quotes.clear();
          for (const q of quoteList) {
            this.quotes.set(q.code, q);
          }
        })()
      );
    }

    tasks.push(this.loadAllHotStocks());

    try {
      await Promise.all(tasks);
      this._onDidChangeTreeData.fire(undefined);
    } catch (e) {
      vscode.window.showErrorMessage(`刷新行情失败: ${e}`);
    }
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      return Promise.resolve([
        new CategoryTreeItem('watchlist', `自选股 (${this.stocks.length})`, 'heart'),
        new CategoryTreeItem('hot', '热门股', 'flame'),
      ]);
    }

    if (element instanceof CategoryTreeItem) {
      if (element.categoryId === 'watchlist') {
        return Promise.resolve(
          this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code)))
        );
      }
      if (element.categoryId === 'hot') {
        return Promise.resolve([
          new RankCategoryTreeItem('topGainers', `涨幅榜 (${this.hotStocksGainers.length})`, 'arrow-up', this.hotStocksGainers.length),
          new RankCategoryTreeItem('topLosers', `跌幅榜 (${this.hotStocksLosers.length})`, 'arrow-down', this.hotStocksLosers.length),
          new RankCategoryTreeItem('topTurnover', `换手率榜 (${this.hotStocksTurnover.length})`, 'sync', this.hotStocksTurnover.length),
        ]);
      }
    }

    if (element instanceof RankCategoryTreeItem) {
      let list: HotStock[] = [];
      switch (element.rankType) {
        case 'topGainers': list = this.hotStocksGainers; break;
        case 'topLosers': list = this.hotStocksLosers; break;
        case 'topTurnover': list = this.hotStocksTurnover; break;
      }
      return Promise.resolve(list.map(h => new HotStockTreeItem(h, element.rankType)));
    }

    return Promise.resolve([]);
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

  sortStocks(mode: string): void {
    if (mode === 'percent-desc') {
      this.stocks.sort((a, b) => {
        const pa = this.quotes.get(a.code)?.changePercent ?? -Infinity;
        const pb = this.quotes.get(b.code)?.changePercent ?? -Infinity;
        return pb - pa;
      });
    } else if (mode === 'percent-asc') {
      this.stocks.sort((a, b) => {
        const pa = this.quotes.get(a.code)?.changePercent ?? Infinity;
        const pb = this.quotes.get(b.code)?.changePercent ?? Infinity;
        return pa - pb;
      });
    } else {
      this.stocks.sort((a, b) => a.addedAt - b.addedAt);
    }
    this.state.saveWatchlist(this.stocks);
    this._onDidChangeTreeData.fire(undefined);
  }
}
