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
        while (true) {
            const keyword = await vscode.window.showInputBox({
                prompt: '输入股票代码或中文名称搜索（Esc退出）',
                placeHolder: '例如: 600519 或 茅台',
                title: '添加自选股',
                ignoreFocusOut: true,
            });
            if (!keyword || !keyword.trim())
                return;
            let results = [];
            try {
                results = await (0, eastmoney_1.searchStocks)(keyword.trim());
            }
            catch (e) {
                vscode.window.showErrorMessage(`搜索失败: ${e}`);
                continue;
            }
            const picks = results.map(r => ({
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
            if (!selected)
                continue;
            const code = selected.description || keyword.trim();
            const name = selected.label.includes('直接添加') ? '' : selected.label;
            await provider.addStock(code, name || undefined);
            return;
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.removeFromWatchlist', async (item) => {
        if (item && item.stock) {
            provider.removeStock(item.stock.code);
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.refreshQuotes', async () => {
        await provider.refresh();
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openChart', async (code, name) => {
        if (!code) {
            const input = await vscode.window.showInputBox({
                prompt: '输入股票代码',
                placeHolder: '例如: 600519',
            });
            if (input) {
                code = input.trim();
                name = '';
            }
            else {
                return;
            }
        }
        await chartView.show(code, name || '未知');
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
    return disposables;
}
//# sourceMappingURL=watchlist.js.map