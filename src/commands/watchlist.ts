import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';
import { ChartViewProvider } from '../webview/chartPanel';
import { StockDetailPanel } from '../webview/stockDetailPanel';
import { searchStocks } from '../api/eastmoney';

function extractStockInfo(itemOrCode: any, name?: string): { code: string; name: string } | null {
  if (typeof itemOrCode === 'string') {
    return { code: itemOrCode, name: name || '' };
  }
  if (itemOrCode?.stock) {
    return { code: itemOrCode.stock.code, name: itemOrCode.stock.name };
  }
  if (itemOrCode?.hotStock) {
    return { code: itemOrCode.hotStock.code, name: itemOrCode.hotStock.name };
  }
  return null;
}

export function registerWatchlistCommands(
  context: vscode.ExtensionContext,
  provider: WatchlistProvider,
  chartView: ChartViewProvider,
  detailPanel?: StockDetailPanel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.addToWatchlist', async () => {
      while (true) {
        const keyword = await vscode.window.showInputBox({
          prompt: '输入股票代码或中文名称搜索（Esc退出）',
          placeHolder: '例如: 600519 或 茅台',
          title: '添加自选股',
          ignoreFocusOut: true,
        });
        if (!keyword || !keyword.trim()) return;

        let results: { code: string; name: string; market: string; type: string }[] = [];
        try {
          results = await searchStocks(keyword.trim());
        } catch (e) {
          vscode.window.showErrorMessage(`搜索失败: ${e}`);
          continue;
        }

        const picks: vscode.QuickPickItem[] = results.map(r => ({
          label: r.name,
          description: r.code,
          detail: `${r.type || '股票'}  ${r.market || ''}`,
        }));

        if (picks.length === 0 && /^\d{6}$/.test(keyword.trim())) {
          picks.push({
            label: `直接添加 ${keyword.trim()}`,
            description: keyword.trim(),
            detail: '未找到匹配名称，按代码直接添加',
          });
        }

        if (picks.length === 0) {
          vscode.window.showWarningMessage('未找到匹配的股票，请重新输入');
          continue;
        }

        const selected = await vscode.window.showQuickPick(picks, {
          title: '添加自选股 - 选择股票（Esc返回搜索）',
          placeHolder: '选择要添加的股票',
          ignoreFocusOut: true,
        });

        if (!selected) continue;

        const code = selected.description || keyword.trim();
        const name = selected.label.includes('直接添加') ? '' : selected.label;
        await provider.addStock(code, name || undefined);
        return;
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.removeFromWatchlist', async (item) => {
      if (item && item.stock) {
        provider.removeStock(item.stock.code);
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.refreshQuotes', async () => {
      await provider.refresh();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openChart', async (itemOrCode: any, name?: string) => {
      let code: string;
      let stockName: string;

      if (itemOrCode?.stock) {
        code = itemOrCode.stock.code;
        stockName = itemOrCode.stock.name;
      } else if (itemOrCode?.hotStock) {
        code = itemOrCode.hotStock.code;
        stockName = itemOrCode.hotStock.name;
      } else if (typeof itemOrCode === 'string') {
        code = itemOrCode;
        stockName = name || '未知';
      } else {
        const input = await vscode.window.showInputBox({
          prompt: '输入股票代码',
          placeHolder: '例如: 600519',
        });
        if (input) {
          code = input.trim();
          stockName = '';
        } else {
          return;
        }
      }
      await chartView.show(code, stockName || '未知');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.sortWatchlist', async () => {
      const items = [
        { label: '按涨跌幅排序 (高→低)', value: 'percent-desc' },
        { label: '按涨跌幅排序 (低→高)', value: 'percent-asc' },
        { label: '按添加时间排序', value: 'time-asc' },
      ];
      const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择排序方式' });
      if (!picked) return;
      provider.sortStocks(picked.value);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.addHotToWatchlist', async (item) => {
      if (item?.hotStock) {
        await provider.addStock(item.hotStock.code, item.hotStock.name);
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openStockNews', (itemOrCode: any, name?: string) => {
      if (!detailPanel) return;
      const info = extractStockInfo(itemOrCode, name);
      if (info) detailPanel.show(info.code, info.name, 'news');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openStockReport', (itemOrCode: any, name?: string) => {
      if (!detailPanel) return;
      const info = extractStockInfo(itemOrCode, name);
      if (info) detailPanel.show(info.code, info.name, 'report');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openStockFinance', (itemOrCode: any, name?: string) => {
      if (!detailPanel) return;
      const info = extractStockInfo(itemOrCode, name);
      if (info) detailPanel.show(info.code, info.name, 'finance');
    })
  );

  return disposables;
}
