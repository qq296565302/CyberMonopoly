"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWatchlistCommands = registerWatchlistCommands;
const vscode = __importStar(require("vscode"));
const eastmoney_1 = require("../api/eastmoney");
function extractStockInfo(itemOrCode, name) {
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
function registerWatchlistCommands(context, provider, chartView, detailPanel) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.addToWatchlist', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = '添加自选股';
        quickPick.placeholder = '输入股票代码或中文名称搜索（支持模糊搜索）';
        quickPick.ignoreFocusOut = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        let searchTimeout;
        quickPick.onDidChangeValue((value) => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            if (!value || !value.trim()) {
                quickPick.items = [];
                return;
            }
            // 防抖：300ms后触发搜索
            searchTimeout = setTimeout(async () => {
                quickPick.busy = true;
                try {
                    const results = await (0, eastmoney_1.searchStocks)(value.trim());
                    const picks = results.map(r => ({
                        label: r.name,
                        description: r.code,
                        detail: `${r.type || '股票'}  ${r.market || ''}`,
                    }));
                    if (picks.length === 0 && /^\d{6}$/.test(value.trim())) {
                        picks.push({
                            label: `直接添加 ${value.trim()}`,
                            description: value.trim(),
                            detail: '未找到匹配名称，按代码直接添加',
                        });
                    }
                    quickPick.items = picks;
                }
                catch (e) {
                    quickPick.items = [{
                            label: '搜索失败',
                            description: `${e}`,
                            detail: '请重试',
                        }];
                }
                finally {
                    quickPick.busy = false;
                }
            }, 300);
        });
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (!selected)
                return;
            const code = selected.description || quickPick.value.trim();
            const name = selected.label.includes('直接添加') ? '' : selected.label;
            await provider.addStock(code, name || undefined);
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            quickPick.dispose();
        });
        quickPick.show();
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.removeFromWatchlist', async (item) => {
        if (item && item.stock) {
            await provider.removeStock(item.stock.code);
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.refreshQuotes', async () => {
        await provider.refresh();
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openChart', async (itemOrCode, name) => {
        let code;
        let stockName;
        if (itemOrCode?.stock) {
            code = itemOrCode.stock.code;
            stockName = itemOrCode.stock.name;
        }
        else if (itemOrCode?.hotStock) {
            code = itemOrCode.hotStock.code;
            stockName = itemOrCode.hotStock.name;
        }
        else if (typeof itemOrCode === 'string') {
            code = itemOrCode;
            stockName = name || '未知';
        }
        else {
            const input = await vscode.window.showInputBox({
                prompt: '输入股票代码',
                placeHolder: '例如: 600519',
            });
            if (input) {
                code = input.trim();
                stockName = '';
            }
            else {
                return;
            }
        }
        await chartView.show(code, stockName || '未知');
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.sortWatchlist', async () => {
        const items = [
            { label: '按涨跌幅排序 (高→低)', value: 'percent-desc' },
            { label: '按涨跌幅排序 (低→高)', value: 'percent-asc' },
            { label: '按添加时间排序', value: 'time-asc' },
        ];
        const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择排序方式' });
        if (!picked)
            return;
        provider.sortStocks(picked.value);
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.addHotToWatchlist', async (item) => {
        if (item?.hotStock) {
            await provider.addStock(item.hotStock.code, item.hotStock.name);
        }
        else if (item?.stock) {
            await provider.addStock(item.stock.code, item.stock.name);
        }
        else if (item?.index) {
            await provider.addStock(item.index.code, item.index.name);
        }
        else if (item?.sector) {
            await provider.addStock(item.sector.code, item.sector.name);
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openStockNews', (itemOrCode, name) => {
        if (!detailPanel)
            return;
        const info = extractStockInfo(itemOrCode, name);
        if (info)
            detailPanel.show(info.code, info.name, 'news');
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openStockReport', (itemOrCode, name) => {
        if (!detailPanel)
            return;
        const info = extractStockInfo(itemOrCode, name);
        if (info)
            detailPanel.show(info.code, info.name, 'report');
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openStockFinance', (itemOrCode, name) => {
        if (!detailPanel)
            return;
        const info = extractStockInfo(itemOrCode, name);
        if (info)
            detailPanel.show(info.code, info.name, 'finance');
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.setAlertPrice', async (item) => {
        const info = extractStockInfo(item);
        if (!info)
            return;
        const stocks = provider.getStocks();
        const stock = stocks.find(s => s.code === info.code);
        const currentPrice = stock?.alertPrice;
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `设置 ${info.name} (${info.code}) 目标价提醒`;
        quickPick.placeholder = currentPrice
            ? `当前目标价: ¥${currentPrice.toFixed(2)}，输入新价格或输入 0 清除`
            : '输入目标价格，例如 180.50';
        quickPick.ignoreFocusOut = true;
        quickPick.onDidAccept(async () => {
            const value = quickPick.value.trim();
            quickPick.hide();
            if (!value)
                return;
            const price = parseFloat(value);
            if (isNaN(price)) {
                vscode.window.showWarningMessage('请输入有效的数字价格');
                return;
            }
            if (price === 0) {
                await provider.updateAlertPrice(info.code, undefined);
                vscode.window.showInformationMessage(`已清除 ${info.name} 的目标价提醒`);
            }
            else if (price > 0) {
                await provider.updateAlertPrice(info.code, price);
                vscode.window.showInformationMessage(`已设置 ${info.name} 目标价: ¥${price.toFixed(2)}`);
            }
            else {
                vscode.window.showWarningMessage('价格必须大于 0');
            }
        });
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }));
    return disposables;
}
//# sourceMappingURL=watchlist.js.map