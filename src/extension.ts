import * as vscode from 'vscode';
import { WatchlistProvider } from './provider/watchlistProvider';
import { NewsViewProvider } from './provider/newsProvider';
import { StockTicker } from './statusbar/stockTicker';
import { StateManager } from './storage/stateManager';
import { AlertManager } from './notification/alert';
import { ChartViewProvider } from './webview/chartPanel';
import { AiChatPanel } from './webview/aiChatPanel';
import { OverviewPanel } from './webview/overviewPanel';
import { SettingsPanel } from './webview/settingsPanel';
import { StockDetailPanel } from './webview/stockDetailPanel';
import { LlmClient } from './chat/llmClient';
import { registerWatchlistCommands } from './commands/watchlist';
import { registerNewsCommands } from './commands/news';
import { registerAiCommands, registerSettingsCommands, registerOverviewCommands, registerStatusBarCommands } from './commands/ai';

let watchlistProvider: WatchlistProvider;
let newsProvider: NewsViewProvider;
let stockTicker: StockTicker | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let newsTimer: NodeJS.Timeout | undefined;
let isActivated = false;
let alertManager: AlertManager;
let bossMode = false;
let chartViewProviderRef: ChartViewProvider;
let newsProviderRef: NewsViewProvider;
let overviewPanelRef: OverviewPanel;
let settingsPanelRef: SettingsPanel;
let aiChatPanelRef: AiChatPanel;
let stockDetailPanelRef: StockDetailPanel;

export async function activate(context: vscode.ExtensionContext) {
  isActivated = true;
  const stateManager = new StateManager(context.globalState);

  watchlistProvider = new WatchlistProvider(stateManager);
  newsProvider = new NewsViewProvider(stateManager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'cyberMonopolyWatchlist',
      watchlistProvider
    ),
    vscode.window.registerWebviewViewProvider(
      'cyberMonopolyNews',
      newsProvider
    )
  );

  const chartViewProvider = new ChartViewProvider(context);
  const overviewPanel = new OverviewPanel(watchlistProvider);
  const settingsPanel = new SettingsPanel();
  const stockDetailPanel = new StockDetailPanel();
  chartViewProviderRef = chartViewProvider;
  newsProviderRef = newsProvider;
  overviewPanelRef = overviewPanel;
  settingsPanelRef = settingsPanel;
  stockDetailPanelRef = stockDetailPanel;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'cyberMonopolyChart',
      chartViewProvider
    )
  );

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const llmBaseUrl = config.get<string>('llmBaseUrl', '');
  const llmApiKey = config.get<string>('llmApiKey', '');
  const llmModel = config.get<string>('llmModel', 'gpt-3.5-turbo');

  const llm = new LlmClient({
    apiEndpoint: llmBaseUrl || 'https://api.openai.com/v1',
    apiKey: llmApiKey,
    model: llmModel,
    temperature: 0.7,
  });

  const aiChatPanel = new AiChatPanel(llm, context.globalState);
  aiChatPanel.setWatchlistProvider(watchlistProvider);
  aiChatPanelRef = aiChatPanel;

  alertManager = new AlertManager(context.globalState);

  context.subscriptions.push(
    ...registerWatchlistCommands(context, watchlistProvider, chartViewProvider, stockDetailPanel),
    ...registerNewsCommands(context, newsProvider),
    ...registerAiCommands(context, llm, aiChatPanel),
    ...registerSettingsCommands(context, settingsPanel),
    ...registerOverviewCommands(context, overviewPanel),
    ...registerStatusBarCommands(context),
    vscode.commands.registerCommand('cyberMonopoly.toggleBossKey', () => {
      const cfg = vscode.workspace.getConfiguration('cyberMonopoly');
      if (!cfg.get<boolean>('bossKeyEnabled', true)) {
        vscode.window.showInformationMessage('老板键未启用，请在设置中开启');
        return;
      }
      bossMode = !bossMode;
      const saturation = cfg.get<number>('bossKeySaturation', 10);
      applyBossMode(saturation);
      vscode.window.showInformationMessage(bossMode ? '老板键已激活 - 隐蔽模式' : '老板键已关闭 - 正常模式');
    })
  );

  const enableStatusBar = config.get<boolean>('enableStatusBar', true);
  if (enableStatusBar) {
    stockTicker = new StockTicker(watchlistProvider);
    context.subscriptions.push(stockTicker);
  }

  await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);

  startAutoRefresh();
  context.subscriptions.push({ dispose: () => { if (refreshTimer) clearInterval(refreshTimer); if (newsTimer) clearInterval(newsTimer); } });

  await watchlistProvider.refresh();
  syncAlertRules();
  await newsProvider.refresh();

  const bossKeyEnabled = config.get<boolean>('bossKeyEnabled', true);
  if (bossKeyEnabled) {
    bossMode = true;
    const sat = config.get<number>('bossKeySaturation', 10);
    applyBossMode(sat);
  }

  const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!isActivated) return;
    if (e.affectsConfiguration('cyberMonopoly.enableStatusBar')) {
      const newEnable = vscode.workspace.getConfiguration('cyberMonopoly').get<boolean>('enableStatusBar', true);
      if (newEnable && !stockTicker) {
        stockTicker = new StockTicker(watchlistProvider);
        context.subscriptions.push(stockTicker);
      } else if (!newEnable && stockTicker) {
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

export function deactivate() {
  isActivated = false;
  if (refreshTimer) clearInterval(refreshTimer);
  if (newsTimer) clearInterval(newsTimer);
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

function applyBossMode(saturation: number): void {
  chartViewProviderRef?.setBossMode(bossMode, saturation);
  newsProviderRef?.setBossMode(bossMode, saturation);
  overviewPanelRef?.setBossMode(bossMode, saturation);
  settingsPanelRef?.setBossMode(bossMode, saturation);
  aiChatPanelRef?.setBossMode(bossMode, saturation);
  stockDetailPanelRef?.setBossMode(bossMode, saturation);
}

function startAutoRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  if (newsTimer) clearInterval(newsTimer);

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const interval = config.get<number>('refreshInterval', 10) * 1000;

  refreshTimer = setInterval(async () => {
    if (!isActivated) return;
    try {
      await watchlistProvider.refresh();
      syncAlertRules();
      const quotes = Array.from(watchlistProvider.getQuotes().values());
      if (quotes.length > 0) {
        alertManager.check(quotes);
      }
    } catch (e) { /* silent */ }
  }, interval);

  const newsInterval = 60 * 1000;
  newsTimer = setInterval(async () => {
    if (!isActivated) return;
    try {
      await newsProvider.refresh();
    } catch (e) { /* silent */ }
  }, newsInterval);
}
