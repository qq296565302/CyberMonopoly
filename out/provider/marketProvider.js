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
exports.MarketProvider = exports.RankStockItem = exports.SectorItem = exports.DistributionDetailItem = exports.DistributionItem = exports.IndexItem = exports.PlaceholderItem = exports.MarketCategoryItem = void 0;
const vscode = __importStar(require("vscode"));
const market_1 = require("../api/market");
class MarketCategoryItem extends vscode.TreeItem {
    constructor(categoryId, label, icon, collapsible = vscode.TreeItemCollapsibleState.Collapsed) {
        super(label, collapsible);
        this.categoryId = categoryId;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'marketCategory';
    }
}
exports.MarketCategoryItem = MarketCategoryItem;
/**
 * 占位项：用于数据加载中或数据不可用时显示
 */
class PlaceholderItem extends vscode.TreeItem {
    constructor(label, icon = 'loading~spin', tooltip) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'placeholder';
        if (tooltip) {
            this.tooltip = tooltip;
        }
    }
}
exports.PlaceholderItem = PlaceholderItem;
class IndexItem extends vscode.TreeItem {
    constructor(index) {
        const sign = index.changePercent >= 0 ? '+' : '';
        const desc = `${index.price.toFixed(2)}  ${sign}${index.changePercent.toFixed(2)}%`;
        super(index.name, vscode.TreeItemCollapsibleState.None);
        this.index = index;
        this.description = desc;
        this.iconPath = this.getIcon();
        this.contextValue = 'indexItem';
        this.tooltip = this.buildTooltip();
        this.command = {
            command: 'cyberMonopoly.openChart',
            arguments: [index.code, index.name],
            title: '查看K线',
        };
    }
    getIcon() {
        if (this.index.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
        if (this.index.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
        return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
    }
    buildTooltip() {
        const q = this.index;
        const sign = q.changePercent >= 0 ? '+' : '';
        const emoji = q.changePercent > 0 ? '📈' : q.changePercent < 0 ? '📉' : '➡️';
        const marketLabel = q.market === 'HK' ? '港股' : 'A股';
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        tooltip.value = [
            `${emoji} **${q.name}** (${q.code}) [${marketLabel}]`,
            `---`,
            `| | |`,
            `|---|---|`,
            `| 点位 | **${q.price.toFixed(2)}** |`,
            `| 涨跌幅 | ${sign}${q.changePercent.toFixed(2)}% |`,
            `| 涨跌额 | ${sign}${q.changeAmount.toFixed(2)} |`,
        ].join('\n');
        return tooltip;
    }
}
exports.IndexItem = IndexItem;
class DistributionItem extends vscode.TreeItem {
    constructor(dist, isClosed = false) {
        super('A股涨跌分布', vscode.TreeItemCollapsibleState.Expanded);
        this.dist = dist;
        this.isClosed = isClosed;
        const total = dist.upCount + dist.downCount + dist.flatCount;
        const upPct = total > 0 ? ((dist.upCount / total) * 100).toFixed(1) : '0.0';
        const downPct = total > 0 ? ((dist.downCount / total) * 100).toFixed(1) : '0.0';
        const closedTag = isClosed ? ' ⏸收盘' : '';
        this.description = `↑${dist.upCount}(${upPct}%) ↓${dist.downCount}(${downPct}%)${closedTag}`;
        this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.lines'));
        this.contextValue = 'distribution';
        this.tooltip = this.buildTooltip();
    }
    buildTooltip() {
        const d = this.dist;
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        const turnoverYi = (d.turnover / 1e8).toFixed(2);
        const diffYi = (d.turnoverDiff / 1e8).toFixed(2);
        const diffSign = d.turnoverDiff >= 0 ? '+' : '';
        const total = d.upCount + d.downCount + d.flatCount;
        const upBar = '█'.repeat(Math.round(d.upCount / total * 20));
        const downBar = '█'.repeat(Math.round(d.downCount / total * 20));
        const flatBar = '░'.repeat(Math.round(d.flatCount / total * 20));
        tooltip.value = [
            '**A股涨跌分布**',
            `---`,
            `📈 上涨 **${d.upCount}**  ${upBar}`,
            `📉 下跌 **${d.downCount}**  ${downBar}`,
            `➡️ 平盘 **${d.flatCount}**  ${flatBar}`,
            `🔴 涨停 **${d.limitUpCount}**  🟢 跌停 **${d.limitDownCount}**`,
            `---`,
            `💰 成交额 **${turnoverYi}亿**`,
            `📊 较昨日此时 **${diffSign}${diffYi}亿**`,
        ].join('\n');
        return tooltip;
    }
}
exports.DistributionItem = DistributionItem;
class DistributionDetailItem extends vscode.TreeItem {
    constructor(label, description, icon, color) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        if (color) {
            this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
        }
        else {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    }
}
exports.DistributionDetailItem = DistributionDetailItem;
function formatWan(num) {
    if (num >= 1e8) {
        return (num / 1e8).toFixed(0) + '亿';
    }
    if (num >= 1e4) {
        return (num / 1e4).toFixed(0) + '万';
    }
    return num.toString();
}
function buildDistributionChildren(dist) {
    const total = dist.upCount + dist.downCount + dist.flatCount;
    const items = [];
    items.push(new DistributionDetailItem('上涨', `${dist.upCount} 家 (${total > 0 ? ((dist.upCount / total) * 100).toFixed(1) : '0.0'}%)`, 'arrow-up', 'charts.red'));
    items.push(new DistributionDetailItem('下跌', `${dist.downCount} 家 (${total > 0 ? ((dist.downCount / total) * 100).toFixed(1) : '0.0'}%)`, 'arrow-down', 'charts.green'));
    items.push(new DistributionDetailItem('平盘', `${dist.flatCount} 家 (${total > 0 ? ((dist.flatCount / total) * 100).toFixed(1) : '0.0'}%)`, 'dash', 'charts.yellow'));
    items.push(new DistributionDetailItem('涨停', `${dist.limitUpCount} 家`, 'flame', 'charts.red'));
    items.push(new DistributionDetailItem('跌停', `${dist.limitDownCount} 家`, 'flame', 'charts.green'));
    const turnoverStr = formatWan(dist.turnover);
    items.push(new DistributionDetailItem('成交额', `${turnoverStr}`, 'pulse', 'charts.lines'));
    const diffSign = dist.turnoverDiff >= 0 ? '+' : '';
    const diffStr = formatWan(Math.abs(dist.turnoverDiff));
    const diffColor = dist.turnoverDiff >= 0 ? 'charts.red' : 'charts.green';
    items.push(new DistributionDetailItem('较昨日此时', `${diffSign}${diffStr}`, 'git-compare', diffColor));
    return items;
}
class SectorItem extends vscode.TreeItem {
    constructor(sector, sectorType) {
        const sign = sector.changePercent >= 0 ? '+' : '';
        super(sector.name, vscode.TreeItemCollapsibleState.None);
        this.sector = sector;
        this.sectorType = sectorType;
        this.description = `${sign}${sector.changePercent.toFixed(2)}%`;
        this.iconPath = this.getIcon();
        this.contextValue = 'sectorItem';
        this.tooltip = this.buildTooltip();
        this.command = {
            command: 'cyberMonopoly.openChart',
            arguments: [sector.code, sector.name],
            title: '查看K线',
        };
    }
    getIcon() {
        if (this.sector.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
        if (this.sector.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
        return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
    }
    buildTooltip() {
        const s = this.sector;
        const sign = s.changePercent >= 0 ? '+' : '';
        const emoji = s.changePercent > 0 ? '📈' : s.changePercent < 0 ? '📉' : '➡️';
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        tooltip.value = [
            `${emoji} **${s.name}** (${s.code})`,
            `---`,
            `| | |`,
            `|---|---|`,
            `| 涨跌幅 | ${sign}${s.changePercent.toFixed(2)}% |`,
            `| 涨跌额 | ${sign}${s.changeAmount.toFixed(2)} |`,
        ].join('\n');
        return tooltip;
    }
}
exports.SectorItem = SectorItem;
class RankStockItem extends vscode.TreeItem {
    constructor(stock, rankType) {
        const sign = stock.changePercent >= 0 ? '+' : '';
        super(`${stock.name} (${stock.code})`, vscode.TreeItemCollapsibleState.None);
        this.stock = stock;
        this.rankType = rankType;
        this.description = this.buildDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'rankStock';
        this.tooltip = this.buildTooltip();
        this.command = {
            command: 'cyberMonopoly.openChart',
            arguments: [stock.code, stock.name],
            title: '查看K线',
        };
    }
    buildDescription() {
        const sign = this.stock.changePercent >= 0 ? '+' : '';
        switch (this.rankType) {
            case 'topGainers':
            case 'topLosers':
                return `${this.stock.price.toFixed(2)}  ${sign}${this.stock.changePercent.toFixed(2)}%`;
            case 'topNetInflow':
            case 'topNetOutflow': {
                const flowYi = (this.stock.netInflow / 100000000).toFixed(2);
                const flowSign = this.stock.netInflow >= 0 ? '+' : '';
                return `${flowSign}${flowYi}亿  ${sign}${this.stock.changePercent.toFixed(2)}%`;
            }
            case 'topTurnover': {
                const turnoverYi = (this.stock.turnover / 100000000).toFixed(2);
                return `${turnoverYi}亿  ${sign}${this.stock.changePercent.toFixed(2)}%`;
            }
        }
    }
    getIcon() {
        if (this.stock.changePercent > 0)
            return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.red'));
        if (this.stock.changePercent < 0)
            return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.green'));
        return new vscode.ThemeIcon('dash', new vscode.ThemeColor('charts.yellow'));
    }
    buildTooltip() {
        const s = this.stock;
        const sign = s.changePercent >= 0 ? '+' : '';
        const emoji = s.changePercent > 0 ? '📈' : s.changePercent < 0 ? '📉' : '➡️';
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;
        const lines = [
            `${emoji} **${s.name}** (${s.code})`,
            `---`,
            `| | |`,
            `|---|---|`,
            `| 当前价 | **${s.price.toFixed(2)}** |`,
            `| 涨跌幅 | ${sign}${s.changePercent.toFixed(2)}% |`,
            `| 涨跌额 | ${sign}${s.changeAmount.toFixed(2)} |`,
            `| 换手率 | ${s.turnoverRate.toFixed(2)}% |`,
        ];
        if (this.rankType === 'topNetInflow' || this.rankType === 'topNetOutflow') {
            const flowYi = (s.netInflow / 100000000).toFixed(2);
            const flowSign = s.netInflow >= 0 ? '+' : '';
            lines.push(`| 净流入 | ${flowSign}${flowYi}亿 |`);
        }
        if (this.rankType === 'topTurnover') {
            const turnoverYi = (s.turnover / 100000000).toFixed(2);
            lines.push(`| 成交额 | ${turnoverYi}亿 |`);
        }
        tooltip.value = lines.join('\n');
        return tooltip;
    }
}
exports.RankStockItem = RankStockItem;
class MarketProvider {
    constructor(memento) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.indexQuotes = [];
        this.distribution = null;
        this.industry1Sectors = [];
        this.industry2Sectors = [];
        this.conceptSectors = [];
        this.rankGainers = [];
        this.rankLosers = [];
        this.rankNetInflow = [];
        this.rankNetOutflow = [];
        this.rankTurnover = [];
        this.isMarketClosed = false;
        this.isHKMarketClosed = false;
        this.loading = true; // 初始状态为加载中
        this.hasLoadedOnce = false; // 标记是否已完成至少一次加载
        this.memento = memento;
        this.loadFromCache();
        // 如果缓存中有指数数据，说明不是首次启动，无需显示 loading
        if (this.indexQuotes.length > 0) {
            this.loading = false;
            this.hasLoadedOnce = true;
        }
    }
    loadFromCache() {
        const cached = this.memento.get('cyberMonopolyMarketCache', {});
        if (cached.indexQuotes && cached.indexQuotes.length > 0)
            this.indexQuotes = cached.indexQuotes;
        if (cached.distribution)
            this.distribution = cached.distribution;
        if (cached.industry1Sectors && cached.industry1Sectors.length > 0)
            this.industry1Sectors = cached.industry1Sectors;
        if (cached.industry2Sectors && cached.industry2Sectors.length > 0)
            this.industry2Sectors = cached.industry2Sectors;
        if (cached.conceptSectors && cached.conceptSectors.length > 0)
            this.conceptSectors = cached.conceptSectors;
        if (cached.rankGainers && cached.rankGainers.length > 0)
            this.rankGainers = cached.rankGainers;
        if (cached.rankLosers && cached.rankLosers.length > 0)
            this.rankLosers = cached.rankLosers;
        if (cached.rankNetInflow && cached.rankNetInflow.length > 0)
            this.rankNetInflow = cached.rankNetInflow;
        if (cached.rankNetOutflow && cached.rankNetOutflow.length > 0)
            this.rankNetOutflow = cached.rankNetOutflow;
        if (cached.rankTurnover && cached.rankTurnover.length > 0)
            this.rankTurnover = cached.rankTurnover;
    }
    async saveToCache() {
        await this.memento.update('cyberMonopolyMarketCache', {
            indexQuotes: this.indexQuotes,
            distribution: this.distribution,
            industry1Sectors: this.industry1Sectors,
            industry2Sectors: this.industry2Sectors,
            conceptSectors: this.conceptSectors,
            rankGainers: this.rankGainers,
            rankLosers: this.rankLosers,
            rankNetInflow: this.rankNetInflow,
            rankNetOutflow: this.rankNetOutflow,
            rankTurnover: this.rankTurnover,
        });
    }
    async refresh() {
        try {
            this.isMarketClosed = !(0, market_1.isATradingTime)();
            this.isHKMarketClosed = !(0, market_1.isHKTradingTime)();
            this.loading = true;
            this._onDidChangeTreeData.fire(undefined); // 通知树视图刷新以显示 loading 状态
            const [indices, dist, ind1, ind2, concepts, gainers, losers, netInflow, netOutflow, turnover,] = await Promise.all([
                (0, market_1.getIndexQuotes)().catch(e => { console.warn('[赛博大富翁] 指数API失败:', e?.message || e); return []; }),
                (0, market_1.getMarketDistribution)().catch(e => { console.warn('[赛博大富翁] 涨跌分布API失败:', e?.message || e); return null; }),
                (0, market_1.getIndustrySectors)(1).catch(e => { console.warn('[赛博大富翁] 一级行业API失败:', e?.message || e); return []; }),
                (0, market_1.getIndustrySectors)(2).catch(e => { console.warn('[赛博大富翁] 二级行业API失败:', e?.message || e); return []; }),
                (0, market_1.getConceptSectors)().catch(e => { console.warn('[赛博大富翁] 概念板块API失败:', e?.message || e); return []; }),
                (0, market_1.getRankStocks)('topGainers', 20).catch(e => { console.warn('[赛博大富翁] 涨幅榜API失败:', e?.message || e); return []; }),
                (0, market_1.getRankStocks)('topLosers', 20).catch(e => { console.warn('[赛博大富翁] 跌幅榜API失败:', e?.message || e); return []; }),
                (0, market_1.getRankStocks)('topNetInflow', 20).catch(e => { console.warn('[赛博大富翁] 净流入API失败:', e?.message || e); return []; }),
                (0, market_1.getRankStocks)('topNetOutflow', 20).catch(e => { console.warn('[赛博大富翁] 净流出API失败:', e?.message || e); return []; }),
                (0, market_1.getRankStocks)('topTurnover', 20).catch(e => { console.warn('[赛博大富翁] 成交额API失败:', e?.message || e); return []; }),
            ]);
            console.log(`[赛博大富翁] 行情数据: 指数=${indices.length} 分布=${dist ? 'ok' : 'null'} 一级行业=${ind1.length} 二级行业=${ind2.length} 概念=${concepts.length} 涨幅=${gainers.length} 跌幅=${losers.length} 净流入=${netInflow.length} 净流出=${netOutflow.length} 成交额=${turnover.length}`);
            if (indices.length > 0)
                this.indexQuotes = indices;
            if (dist && (dist.upCount > 0 || dist.downCount > 0 || dist.flatCount > 0)) {
                this.distribution = dist;
            }
            if (ind1.length > 0)
                this.industry1Sectors = ind1;
            if (ind2.length > 0)
                this.industry2Sectors = ind2;
            if (concepts.length > 0)
                this.conceptSectors = concepts;
            if (gainers.length > 0)
                this.rankGainers = gainers;
            if (losers.length > 0)
                this.rankLosers = losers;
            if (netInflow.length > 0)
                this.rankNetInflow = netInflow;
            if (netOutflow.length > 0)
                this.rankNetOutflow = netOutflow;
            if (turnover.length > 0)
                this.rankTurnover = turnover;
            await this.saveToCache();
            this.loading = false;
            this.hasLoadedOnce = true;
            this._onDidChangeTreeData.fire(undefined);
        }
        catch (e) {
            console.warn('[赛博大富翁] 行情刷新失败:', e);
            this.loading = false;
            this.hasLoadedOnce = true;
            this._onDidChangeTreeData.fire(undefined); // 失败时也要刷新，显示"数据暂不可用"
        }
    }
    /**
     * 生成占位项：根据 loading 状态返回"加载中"或"数据暂不可用"
     */
    getPlaceholder() {
        if (this.loading) {
            return new PlaceholderItem('加载中...', 'loading~spin', '正在获取行情数据，请稍候...');
        }
        return new PlaceholderItem('数据暂不可用', 'warning', '未能获取到数据，请检查网络后重试');
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const closedTag = this.isMarketClosed ? ' A股收盘' : '';
            const hkTag = this.isHKMarketClosed ? ' 港股收盘' : '';
            const rootItems = [
                new MarketCategoryItem('indices', `大盘指数${closedTag}${hkTag}`, 'graph', vscode.TreeItemCollapsibleState.Expanded),
            ];
            if (this.distribution) {
                rootItems.push(new DistributionItem(this.distribution, this.isMarketClosed));
            }
            else {
                rootItems.push(new MarketCategoryItem('distribution', 'A股涨跌分布', 'graph', vscode.TreeItemCollapsibleState.Expanded));
            }
            rootItems.push(new MarketCategoryItem('industry1', `申万一级行业 (${this.industry1Sectors.length})`, 'layers'), new MarketCategoryItem('industry2', `申万二级行业 (${this.industry2Sectors.length})`, 'list-tree'), new MarketCategoryItem('concept', `概念板块 (${this.conceptSectors.length})`, 'symbol-color'), new MarketCategoryItem('rankGainers', `涨幅榜 (前${this.rankGainers.length})`, 'arrow-up'), new MarketCategoryItem('rankLosers', `跌幅榜 (前${this.rankLosers.length})`, 'arrow-down'), new MarketCategoryItem('rankNetInflow', `净流入榜 (前${this.rankNetInflow.length})`, 'sign-in'), new MarketCategoryItem('rankNetOutflow', `净流出榜 (前${this.rankNetOutflow.length})`, 'sign-out'), new MarketCategoryItem('rankTurnover', `成交额榜 (前${this.rankTurnover.length})`, 'pulse'));
            return Promise.resolve(rootItems);
        }
        if (element instanceof DistributionItem) {
            return Promise.resolve(buildDistributionChildren(element.dist));
        }
        if (element instanceof MarketCategoryItem) {
            switch (element.categoryId) {
                case 'distribution':
                    // distribution 为 null 时通过分类节点展开显示占位项
                    return Promise.resolve([this.getPlaceholder()]);
                case 'indices':
                    return Promise.resolve(this.indexQuotes.length > 0
                        ? this.indexQuotes.map(i => new IndexItem(i))
                        : [this.getPlaceholder()]);
                case 'industry1':
                    return Promise.resolve(this.industry1Sectors.length > 0
                        ? this.industry1Sectors.map(s => new SectorItem(s, 'industry1'))
                        : [this.getPlaceholder()]);
                case 'industry2':
                    return Promise.resolve(this.industry2Sectors.length > 0
                        ? this.industry2Sectors.map(s => new SectorItem(s, 'industry2'))
                        : [this.getPlaceholder()]);
                case 'concept':
                    return Promise.resolve(this.conceptSectors.length > 0
                        ? this.conceptSectors.map(s => new SectorItem(s, 'concept'))
                        : [this.getPlaceholder()]);
                case 'rankGainers':
                    return Promise.resolve(this.rankGainers.length > 0
                        ? this.rankGainers.map(s => new RankStockItem(s, 'topGainers'))
                        : [this.getPlaceholder()]);
                case 'rankLosers':
                    return Promise.resolve(this.rankLosers.length > 0
                        ? this.rankLosers.map(s => new RankStockItem(s, 'topLosers'))
                        : [this.getPlaceholder()]);
                case 'rankNetInflow':
                    return Promise.resolve(this.rankNetInflow.length > 0
                        ? this.rankNetInflow.map(s => new RankStockItem(s, 'topNetInflow'))
                        : [this.getPlaceholder()]);
                case 'rankNetOutflow':
                    return Promise.resolve(this.rankNetOutflow.length > 0
                        ? this.rankNetOutflow.map(s => new RankStockItem(s, 'topNetOutflow'))
                        : [this.getPlaceholder()]);
                case 'rankTurnover':
                    return Promise.resolve(this.rankTurnover.length > 0
                        ? this.rankTurnover.map(s => new RankStockItem(s, 'topTurnover'))
                        : [this.getPlaceholder()]);
            }
        }
        return Promise.resolve([]);
    }
}
exports.MarketProvider = MarketProvider;
//# sourceMappingURL=marketProvider.js.map