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
exports.WatchlistProvider = exports.StockTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const stock_1 = require("../models/stock");
const sina_1 = require("../api/sina");
class StockTreeItem extends vscode.TreeItem {
    constructor(stock, quote) {
        super(`${stock.name} (${stock.code})`, vscode.TreeItemCollapsibleState.None);
        this.stock = stock;
        this.quote = quote;
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
    getIcon() {
        if (!this.quote)
            return new vscode.ThemeIcon('circle-outline');
        if (this.quote.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up');
        if (this.quote.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down');
        return new vscode.ThemeIcon('minus');
    }
    buildTooltip() {
        if (!this.quote)
            return new vscode.MarkdownString('加载中...');
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
exports.StockTreeItem = StockTreeItem;
class WatchlistProvider {
    constructor(state) {
        this.state = state;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.stocks = [];
        this.quotes = new Map();
        this.stocks = this.state.getWatchlist();
    }
    async refresh() {
        if (this.stocks.length === 0)
            return;
        try {
            const codes = this.stocks.map(s => s.code);
            const quoteList = await (0, sina_1.getBatchQuotes)(codes);
            this.quotes.clear();
            for (const q of quoteList) {
                this.quotes.set(q.code, q);
            }
            this._onDidChangeTreeData.fire(undefined);
        }
        catch (e) {
            vscode.window.showErrorMessage(`刷新行情失败: ${e}`);
        }
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element)
            return Promise.resolve([]);
        return Promise.resolve(this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code))));
    }
    getStocks() {
        return this.stocks;
    }
    getQuotes() {
        return this.quotes;
    }
    async addStock(code, name) {
        if (this.stocks.some(s => s.code === code)) {
            vscode.window.showWarningMessage(`股票 ${code} 已在自选股中`);
            return;
        }
        let stockName = name;
        if (!stockName) {
            try {
                const quote = await (0, sina_1.getRealtimeQuote)(code);
                stockName = quote.name;
            }
            catch {
                stockName = `股票${code}`;
            }
        }
        const stock = {
            code,
            name: stockName,
            market: (0, stock_1.detectMarket)(code),
            addedAt: Date.now(),
        };
        this.stocks.push(stock);
        await this.state.saveWatchlist(this.stocks);
        this._onDidChangeTreeData.fire(undefined);
        try {
            const quote = await (0, sina_1.getRealtimeQuote)(code);
            this.quotes.set(code, quote);
            this._onDidChangeTreeData.fire(undefined);
        }
        catch { }
    }
    removeStock(code) {
        this.stocks = this.stocks.filter(s => s.code !== code);
        this.state.saveWatchlist(this.stocks);
        this.quotes.delete(code);
        this._onDidChangeTreeData.fire(undefined);
    }
}
exports.WatchlistProvider = WatchlistProvider;
//# sourceMappingURL=watchlistProvider.js.map