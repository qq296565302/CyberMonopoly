import * as vscode from 'vscode';
import { WatchlistProvider } from '../provider/watchlistProvider';
import { ChartViewProvider } from '../webview/chartPanel';

export function registerWatchlistCommands(
  context: vscode.ExtensionContext,
  provider: WatchlistProvider,
  chartView: ChartViewProvider
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.addToWatchlist', async () => {
      const input = await vscode.window.showInputBox({
        prompt: '输入股票代码',
        placeHolder: '例如: 600519',
        validateInput: (value) => {
          if (!value || !/^\d{6}$/.test(value.trim())) {
            return '请输入6位数字股票代码';
          }
          return null;
        },
      });

      if (input) {
        await provider.addStock(input.trim());
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
    vscode.commands.registerCommand('cyberMonopoly.openChart', async (code: string, name: string) => {
      if (!code) {
        const input = await vscode.window.showInputBox({
          prompt: '输入股票代码',
          placeHolder: '例如: 600519',
        });
        if (input) {
          code = input.trim();
          name = '';
        } else {
          return;
        }
      }
      await chartView.show(code, name || '未知');
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

  return disposables;
}
