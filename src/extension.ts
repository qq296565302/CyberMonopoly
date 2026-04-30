import * as vscode from 'vscode';
import { WatchlistProvider } from './provider/watchlistProvider';
import { NewsViewProvider } from './provider/newsProvider';
import { StockTicker } from './statusbar/stockTicker';
import { StateManager } from './storage/stateManager';
import { AlertManager } from './notification/alert';
import { ChartPanel } from './webview/chartPanel';
import { AiChatPanel } from './webview/aiChatPanel';
import { OverviewPanel } from './webview/overviewPanel';
import { SettingsPanel } from './webview/settingsPanel';
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

  const chartPanel = new ChartPanel();
  const overviewPanel = new OverviewPanel(watchlistProvider);
  const settingsPanel = new SettingsPanel();

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

  const alertManager = new AlertManager(context.globalState);

  context.subscriptions.push(
    ...registerWatchlistCommands(context, watchlistProvider, chartPanel),
    ...registerNewsCommands(context, newsProvider),
    ...registerAiCommands(context, llm, aiChatPanel),
    ...registerSettingsCommands(context, settingsPanel),
    ...registerOverviewCommands(context, overviewPanel),
    ...registerStatusBarCommands(context)
  );

  const enableStatusBar = config.get<boolean>('enableStatusBar', true);
  if (enableStatusBar) {
    stockTicker = new StockTicker(watchlistProvider);
    context.subscriptions.push(stockTicker);
  }

  await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);

  const timers = startAutoRefresh(alertManager);
  context.subscriptions.push({ dispose: () => { if (timers.refresh) clearInterval(timers.refresh); if (timers.news) clearInterval(timers.news); } });

  await watchlistProvider.refresh();
  await newsProvider.refresh();

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
      if (refreshTimer) clearInterval(refreshTimer);
      if (newsTimer) clearInterval(newsTimer);
      const newTimers = startAutoRefresh(alertManager);
      refreshTimer = newTimers.refresh;
      newsTimer = newTimers.news;
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

function startAutoRefresh(alertManager: AlertManager): { refresh: NodeJS.Timeout | undefined, news: NodeJS.Timeout | undefined } {
  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const interval = config.get<number>('refreshInterval', 10) * 1000;

  refreshTimer = setInterval(async () => {
    if (!isActivated) return;
    try {
      await watchlistProvider.refresh();
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

  return { refresh: refreshTimer, news: newsTimer };
}
