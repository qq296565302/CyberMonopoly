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
exports.WatchlistProvider = exports.HotStockTreeItem = exports.StockTreeItem = exports.RankCategoryTreeItem = exports.CategoryTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const stock_1 = require("../models/stock");
const sina_1 = require("../api/sina");
const eastmoney_1 = require("../api/eastmoney");
class CategoryTreeItem extends vscode.TreeItem {
    constructor(categoryId, label, icon) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.categoryId = categoryId;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'category';
    }
}
exports.CategoryTreeItem = CategoryTreeItem;
class RankCategoryTreeItem extends vscode.TreeItem {
    constructor(rankType, label, icon, count) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.rankType = rankType;
        this.count = count;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'rankCategory';
    }
}
exports.RankCategoryTreeItem = RankCategoryTreeItem;
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
            return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.lines'));
        if (this.quote.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
        if (this.quote.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
        return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
    }
    buildTooltip() {
        if (!this.quote)
            return new vscode.MarkdownString('加载中...');
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
exports.StockTreeItem = StockTreeItem;
class HotStockTreeItem extends vscode.TreeItem {
    constructor(hotStock, displayRankType) {
        super(`${hotStock.name} (${hotStock.code})`, vscode.TreeItemCollapsibleState.None);
        this.hotStock = hotStock;
        this.displayRankType = displayRankType;
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
    buildDescription() {
        if (this.displayRankType === 'topTurnover') {
            return `${this.hotStock.price.toFixed(2)}  换手${this.hotStock.turnoverRate.toFixed(1)}%`;
        }
        return `${this.hotStock.price.toFixed(2)}  ${this.hotStock.changePercent >= 0 ? '+' : ''}${this.hotStock.changePercent.toFixed(2)}%`;
    }
    getIcon() {
        if (this.displayRankType === 'topTurnover') {
            return new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.yellow'));
        }
        if (this.hotStock.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
        if (this.hotStock.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
        return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
    }
    buildTooltip() {
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
exports.HotStockTreeItem = HotStockTreeItem;
class WatchlistProvider {
    constructor(state) {
        this.state = state;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.stocks = [];
        this.quotes = new Map();
        this.hotStocksGainers = [];
        this.hotStocksLosers = [];
        this.hotStocksTurnover = [];
        this.stocks = this.state.getWatchlist();
        this.loadAllHotStocks();
    }
    async loadAllHotStocks() {
        try {
            const [gainers, losers, turnover] = await Promise.all([
                (0, eastmoney_1.getHotStocks)(20, 'topGainers'),
                (0, eastmoney_1.getHotStocks)(20, 'topLosers'),
                (0, eastmoney_1.getHotStocks)(20, 'topTurnover'),
            ]);
            this.hotStocksGainers = gainers;
            this.hotStocksLosers = losers;
            this.hotStocksTurnover = turnover;
        }
        catch {
            this.hotStocksGainers = [];
            this.hotStocksLosers = [];
            this.hotStocksTurnover = [];
        }
    }
    async refresh() {
        const tasks = [];
        if (this.stocks.length > 0) {
            tasks.push((async () => {
                const codes = this.stocks.map(s => s.code);
                const quoteList = await (0, sina_1.getBatchQuotes)(codes);
                this.quotes.clear();
                for (const q of quoteList) {
                    this.quotes.set(q.code, q);
                }
            })());
        }
        tasks.push(this.loadAllHotStocks());
        try {
            await Promise.all(tasks);
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
        if (!element) {
            return Promise.resolve([
                new CategoryTreeItem('watchlist', `自选股 (${this.stocks.length})`, 'heart'),
                new CategoryTreeItem('hot', '热门股', 'flame'),
            ]);
        }
        if (element instanceof CategoryTreeItem) {
            if (element.categoryId === 'watchlist') {
                return Promise.resolve(this.stocks.map(s => new StockTreeItem(s, this.quotes.get(s.code))));
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
            let list = [];
            switch (element.rankType) {
                case 'topGainers':
                    list = this.hotStocksGainers;
                    break;
                case 'topLosers':
                    list = this.hotStocksLosers;
                    break;
                case 'topTurnover':
                    list = this.hotStocksTurnover;
                    break;
            }
            return Promise.resolve(list.map(h => new HotStockTreeItem(h, element.rankType)));
        }
        return Promise.resolve([]);
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
    sortStocks(mode) {
        if (mode === 'percent-desc') {
            this.stocks.sort((a, b) => {
                const pa = this.quotes.get(a.code)?.changePercent ?? -Infinity;
                const pb = this.quotes.get(b.code)?.changePercent ?? -Infinity;
                return pb - pa;
            });
        }
        else if (mode === 'percent-asc') {
            this.stocks.sort((a, b) => {
                const pa = this.quotes.get(a.code)?.changePercent ?? Infinity;
                const pb = this.quotes.get(b.code)?.changePercent ?? Infinity;
                return pa - pb;
            });
        }
        else {
            this.stocks.sort((a, b) => a.addedAt - b.addedAt);
        }
        this.state.saveWatchlist(this.stocks);
        this._onDidChangeTreeData.fire(undefined);
    }
}
exports.WatchlistProvider = WatchlistProvider;
//# sourceMappingURL=watchlistProvider.js.map