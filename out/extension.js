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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const watchlistProvider_1 = require("./provider/watchlistProvider");
const newsProvider_1 = require("./provider/newsProvider");
const stockTicker_1 = require("./statusbar/stockTicker");
const stateManager_1 = require("./storage/stateManager");
const alert_1 = require("./notification/alert");
const chartPanel_1 = require("./webview/chartPanel");
const aiChatPanel_1 = require("./webview/aiChatPanel");
const overviewPanel_1 = require("./webview/overviewPanel");
const settingsPanel_1 = require("./webview/settingsPanel");
const llmClient_1 = require("./chat/llmClient");
const watchlist_1 = require("./commands/watchlist");
const news_1 = require("./commands/news");
const ai_1 = require("./commands/ai");
let watchlistProvider;
let newsProvider;
let stockTicker;
let refreshTimer;
let newsTimer;
let isActivated = false;
let alertManager;
let bossMode = false;
let chartViewProviderRef;
let newsProviderRef;
let overviewPanelRef;
let settingsPanelRef;
let aiChatPanelRef;
async function activate(context) {
    isActivated = true;
    const stateManager = new stateManager_1.StateManager(context.globalState);
    watchlistProvider = new watchlistProvider_1.WatchlistProvider(stateManager);
    newsProvider = new newsProvider_1.NewsViewProvider(stateManager);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('cyberMonopolyWatchlist', watchlistProvider), vscode.window.registerWebviewViewProvider('cyberMonopolyNews', newsProvider));
    const chartViewProvider = new chartPanel_1.ChartViewProvider(context);
    const overviewPanel = new overviewPanel_1.OverviewPanel(watchlistProvider);
    const settingsPanel = new settingsPanel_1.SettingsPanel();
    chartViewProviderRef = chartViewProvider;
    newsProviderRef = newsProvider;
    overviewPanelRef = overviewPanel;
    settingsPanelRef = settingsPanel;
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('cyberMonopolyChart', chartViewProvider));
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const llmBaseUrl = config.get('llmBaseUrl', '');
    const llmApiKey = config.get('llmApiKey', '');
    const llmModel = config.get('llmModel', 'gpt-3.5-turbo');
    const llm = new llmClient_1.LlmClient({
        apiEndpoint: llmBaseUrl || 'https://api.openai.com/v1',
        apiKey: llmApiKey,
        model: llmModel,
        temperature: 0.7,
    });
    const aiChatPanel = new aiChatPanel_1.AiChatPanel(llm, context.globalState);
    aiChatPanel.setWatchlistProvider(watchlistProvider);
    aiChatPanelRef = aiChatPanel;
    alertManager = new alert_1.AlertManager(context.globalState);
    context.subscriptions.push(...(0, watchlist_1.registerWatchlistCommands)(context, watchlistProvider, chartViewProvider), ...(0, news_1.registerNewsCommands)(context, newsProvider), ...(0, ai_1.registerAiCommands)(context, llm, aiChatPanel), ...(0, ai_1.registerSettingsCommands)(context, settingsPanel), ...(0, ai_1.registerOverviewCommands)(context, overviewPanel), ...(0, ai_1.registerStatusBarCommands)(context), vscode.commands.registerCommand('cyberMonopoly.toggleBossKey', () => {
        const cfg = vscode.workspace.getConfiguration('cyberMonopoly');
        if (!cfg.get('bossKeyEnabled', true)) {
            vscode.window.showInformationMessage('老板键未启用，请在设置中开启');
            return;
        }
        bossMode = !bossMode;
        const saturation = cfg.get('bossKeySaturation', 10);
        applyBossMode(saturation);
        vscode.window.showInformationMessage(bossMode ? '老板键已激活 - 隐蔽模式' : '老板键已关闭 - 正常模式');
    }));
    const enableStatusBar = config.get('enableStatusBar', true);
    if (enableStatusBar) {
        stockTicker = new stockTicker_1.StockTicker(watchlistProvider);
        context.subscriptions.push(stockTicker);
    }
    await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);
    startAutoRefresh();
    context.subscriptions.push({ dispose: () => { if (refreshTimer)
            clearInterval(refreshTimer); if (newsTimer)
            clearInterval(newsTimer); } });
    await watchlistProvider.refresh();
    syncAlertRules();
    await newsProvider.refresh();
    const bossKeyEnabled = config.get('bossKeyEnabled', true);
    if (bossKeyEnabled) {
        bossMode = true;
        const sat = config.get('bossKeySaturation', 10);
        applyBossMode(sat);
    }
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (!isActivated)
            return;
        if (e.affectsConfiguration('cyberMonopoly.enableStatusBar')) {
            const newEnable = vscode.workspace.getConfiguration('cyberMonopoly').get('enableStatusBar', true);
            if (newEnable && !stockTicker) {
                stockTicker = new stockTicker_1.StockTicker(watchlistProvider);
                context.subscriptions.push(stockTicker);
            }
            else if (!newEnable && stockTicker) {
                stockTicker.dispose();
                stockTicker = undefined;
            }
        }
        if (e.affectsConfiguration('cyberMonopoly.refreshInterval')) {
            startAutoRefresh();
        }
    });
    context.subscriptions.push(configChangeListener);
    console.log('[赛博大富翁] 已激活');
}
function deactivate() {
    isActivated = false;
    if (refreshTimer)
        clearInterval(refreshTimer);
    if (newsTimer)
        clearInterval(newsTimer);
    if (stockTicker) {
        stockTicker.dispose();
        stockTicker = undefined;
    }
    console.log('[赛博大富翁] 已停活');
}
function syncAlertRules() {
    for (const stock of watchlistProvider.getStocks()) {
        alertManager.addRule(stock);
    }
}
function applyBossMode(saturation) {
    chartViewProviderRef?.setBossMode(bossMode, saturation);
    newsProviderRef?.setBossMode(bossMode, saturation);
    overviewPanelRef?.setBossMode(bossMode, saturation);
    settingsPanelRef?.setBossMode(bossMode, saturation);
    aiChatPanelRef?.setBossMode(bossMode, saturation);
}
function startAutoRefresh() {
    if (refreshTimer)
        clearInterval(refreshTimer);
    if (newsTimer)
        clearInterval(newsTimer);
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const interval = config.get('refreshInterval', 10) * 1000;
    refreshTimer = setInterval(async () => {
        if (!isActivated)
            return;
        try {
            await watchlistProvider.refresh();
            syncAlertRules();
            const quotes = Array.from(watchlistProvider.getQuotes().values());
            if (quotes.length > 0) {
                alertManager.check(quotes);
            }
        }
        catch (e) { /* silent */ }
    }, interval);
    const newsInterval = 60 * 1000;
    newsTimer = setInterval(async () => {
        if (!isActivated)
            return;
        try {
            await newsProvider.refresh();
        }
        catch (e) { /* silent */ }
    }, newsInterval);
}
//# sourceMappingURL=extension.js.map