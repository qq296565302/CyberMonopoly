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
      const quickPick = vscode.window.createQuickPick();
      quickPick.placeholder = '输入股票代码或中文名称搜索';
      quickPick.title = '添加自选股';
      quickPick.items = [];
      quickPick.busy = false;

      let debounceTimer: NodeJS.Timeout | undefined;

      quickPick.onDidChangeValue((value) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        const keyword = value.trim();
        if (!keyword) {
          quickPick.items = [];
          return;
        }

        quickPick.busy = true;
        debounceTimer = setTimeout(async () => {
          try {
            const results = await searchStocks(keyword);
            quickPick.items = results.map(r => ({
              label: `$(search) ${r.name}`,
              description: r.code,
              detail: `${r.type || '股票'}  ${r.market || ''}`,
              _stock: r,
            } as any));

            if (quickPick.items.length === 0 && /^\d{6}$/.test(keyword)) {
              quickPick.items = [{
                label: `$(add) 直接添加 ${keyword}`,
                description: '',
                detail: '未找到匹配名称，按代码直接添加',
                _stock: { code: keyword, name: '' },
              } as any];
            }
          } catch {
            if (/^\d{6}$/.test(keyword)) {
              quickPick.items = [{
                label: `$(add) 直接添加 ${keyword}`,
                description: '',
                detail: '搜索失败，按代码直接添加',
                _stock: { code: keyword, name: '' },
              } as any];
            }
          } finally {
            quickPick.busy = false;
          }
        }, 300);
      });

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0] as any;
        if (selected && selected._stock) {
          const s = selected._stock;
          quickPick.hide();
          await provider.addStock(s.code, s.name || undefined);
        }
      });

      quickPick.onDidHide(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        quickPick.dispose();
      });

      quickPick.show();
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
