import * as vscode from 'vscode';
import { WatchStock, detectMarket, isEtfOrFund } from '../models/stock';
import { RealtimeQuote, getRealtimeQuote, getBatchQuotes } from '../api/sina';
import { StateManager } from '../storage/stateManager';

type TreeItem = StockTreeItem | CategoryTreeItem;

function formatPrice(price: number, code: string): string {
  return price.toFixed(isEtfOrFund(code) ? 3 : 2);
}

export class CategoryTreeItem extends vscode.TreeItem {
  constructor(public readonly categoryId: string, label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'category';
  }
}

export class StockTreeItem extends vscode.TreeItem {
  constructor(
    public readonly stock: WatchStock,
    public quote?: RealtimeQuote
  ) {
    super(`${stock.name} (${stock.code})`, vscode.TreeItemCollapsibleState.None);

    this.description = quote ? `${formatPrice(quote.price, stock.code)}  ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '--';
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
    const code = this.stock.code;
    const decimals = isEtfOrFund(code) ? 3 : 2;
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.isTrusted = true;
    const lines = [
      `${emoji} **${this.quote.name}** (${this.quote.code})`,
      `---`,
      `| | |`,
      `|---|---|`,
      `| 当前价 | **${this.quote.price.toFixed(decimals)}** |`,
      `| 涨跌幅 | ${sign}${this.quote.changePercent.toFixed(2)}% |`,
      `| 涨跌额 | ${sign}${this.quote.changeAmount.toFixed(decimals)} |`,
      `| 今开 | ${this.quote.open.toFixed(decimals)} |`,
      `| 最高 | ${this.quote.high.toFixed(decimals)} |`,
      `| 最低 | ${this.quote.low.toFixed(decimals)} |`,
      `| 昨收 | ${this.quote.prevClose.toFixed(decimals)} |`,
      `| 成交量 | ${(this.quote.volume / 10000).toFixed(0)}万手 |`,
      `| 时间 | ${this.quote.date} ${this.quote.time} |`,
    ];
    if (this.stock.alertPrice) {
      const diff = ((this.stock.alertPrice - this.quote.price) / this.quote.price * 100);
      const diffStr = diff.toFixed(2);
      lines.push(`| 🎯 目标价 | ¥${this.stock.alertPrice.toFixed(decimals)} (${diff >= 0 ? '+' : ''}${diffStr}%) |`);
    }
    tooltip.value = lines.join('\n');
    return tooltip;
  }
}

export class WatchlistProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onAlertRulesChanged = new vscode.EventEmitter<void>();
  readonly onAlertRulesChanged = this._onAlertRulesChanged.event;

  private stocks: WatchStock[] = [];
  private quotes: Map<string, RealtimeQuote> = new Map();
  private currentSortMode: string = 'time-asc';

  constructor(private state: StateManager) {
    this.stocks = this.state.getWatchlist();
    this.currentSortMode = this.state.getSetting<string>('sortMode', 'time-asc');
  }

  async refresh(): Promise<void> {
    if (this.stocks.length > 0) {
      try {
        const codes = this.stocks.map(s => s.code);
        const quoteList = await getBatchQuotes(codes);
        this.quotes.clear();
        for (const q of quoteList) {
          this.quotes.set(q.code, q);
        }
        // 刷新行情后自动重新排序
        if (this.currentSortMode !== 'time-asc') {
          this.sortStocks(this.currentSortMode);
        } else {
          this._onDidChangeTreeData.fire(undefined);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`刷新行情失败: ${e}`);
      }
    }
  }

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      return Promise.resolve([
        new CategoryTreeItem('watchlist', `自选股 (${this.stocks.length})`, 'heart'),
      ]);
    }

    if (element instanceof CategoryTreeItem && element.categoryId === 'watchlist') {
      return Promise.resolve(
        this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code)))
      );
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

  async removeStock(code: string): Promise<void> {
    this.stocks = this.stocks.filter(s => s.code !== code);
    await this.state.saveWatchlist(this.stocks);
    this.quotes.delete(code);
    this._onDidChangeTreeData.fire(undefined);
  }

  async updateAlertPrice(code: string, alertPrice: number | undefined): Promise<void> {
    const stock = this.stocks.find(s => s.code === code);
    if (!stock) return;

    stock.alertPrice = alertPrice;
    await this.state.saveWatchlist(this.stocks);
    this._onDidChangeTreeData.fire(undefined);
    this._onAlertRulesChanged.fire();
  }

  sortStocks(mode: string): void {
    this.currentSortMode = mode;
    this.state.setSetting('sortMode', mode);

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
