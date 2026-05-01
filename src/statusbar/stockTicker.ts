import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';

export class StockTicker {
  private statusBar: vscode.StatusBarItem;
  private currentIndex = 0;
  private intervalId: NodeJS.Timeout | undefined;

  constructor(private provider: WatchlistProvider) {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBar.command = 'cyberMonopoly.showOverview';
    this.startTicking();
  }

  dispose() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.statusBar.dispose();
  }

  setVisible(visible: boolean) {
    if (visible) {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  private startTicking() {
    this.updateDisplay();
    this.intervalId = setInterval(() => {
      this.updateDisplay();
    }, 5000);
  }

  private updateDisplay() {
    const stocks = this.provider.getStocks();
    const quotes = this.provider.getQuotes();

    if (stocks.length === 0) {
      this.statusBar.text = '$(heart) 赛博';
      this.statusBar.tooltip = '添加自选股开始追踪';
      this.statusBar.show();
      return;
    }

    if (this.currentIndex >= stocks.length) {
      this.currentIndex = 0;
    }

    const stock = stocks[this.currentIndex];
    const quote = quotes.get(stock.code);

    if (quote) {
      const sign = quote.changePercent >= 0 ? '↑' : '↓';
      this.statusBar.text = `$(${quote.changePercent >= 0 ? 'trending-up' : 'trending-down'}) ${stock.name} ${quote.price.toFixed(2)} ${sign}${Math.abs(quote.changePercent).toFixed(2)}%`;
      this.statusBar.tooltip = `${stock.name}(${stock.code}): ${quote.price} (${sign}${quote.changePercent.toFixed(2)}%)`;
    } else {
      this.statusBar.text = `$(sync~spin) ${stock.name} ...`;
      this.statusBar.tooltip = `${stock.name} 加载中...`;
    }

    this.statusBar.show();
    this.currentIndex++;
  }
}
