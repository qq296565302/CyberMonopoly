import * as vscode from 'vscode';
import { WatchlistProvider } from './provider/watchlistProvider';
import { NewsViewProvider } from './provider/newsProvider';
import { MarketProvider } from './provider/marketProvider';
import { StockTicker } from './statusbar/stockTicker';
import { StateManager } from './storage/stateManager';
import { AlertManager } from './notification/alert';
import { ChartViewProvider } from './webview/chartPanel';
import { AiChatPanel } from './webview/aiChatPanel';
import { OverviewPanel } from './webview/overviewPanel';
import { SettingsPanel } from './webview/settingsPanel';
import { StockDetailPanel } from './webview/stockDetailPanel';
import { RadioPanel } from './webview/radioPanel';
import { StreamProxy } from './utils/streamProxy';
import { LlmClient } from './chat/llmClient';
import { registerWatchlistCommands } from './commands/watchlist';
import { registerNewsCommands } from './commands/news';
import { registerAiCommands, registerSettingsCommands, registerOverviewCommands, registerStatusBarCommands } from './commands/ai';
import { getLogger, withErrorHandling } from './utils/logger';

let watchlistProvider: WatchlistProvider;
let newsProvider: NewsViewProvider;
let marketProvider: MarketProvider;
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
let radioPanelRef: RadioPanel;
let streamProxy: StreamProxy;
let stateManagerRef: StateManager;
let llmRef: LlmClient;

export function activate(context: vscode.ExtensionContext) {
  const logger = getLogger();
  logger.info('activate() 被调用');

  try {
    doActivateSync(context);
  } catch (e) {
    logger.error('同步激活失败', e, true);
  }

  doActivateAsync(context).catch(e => {
    logger.error('异步激活失败', e, true);
  });

  return;
}

function doActivateSync(context: vscode.ExtensionContext) {
  const stateManager = new StateManager(context.globalState);
  stateManagerRef = stateManager;

  watchlistProvider = new WatchlistProvider(stateManager);
  newsProvider = new NewsViewProvider(stateManager);
  marketProvider = new MarketProvider(context.globalState);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'cyberMonopolyWatchlist',
      watchlistProvider
    ),
    vscode.window.registerTreeDataProvider(
      'cyberMonopolyMarket',
      marketProvider
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
  const radioPanel = new RadioPanel();
  chartViewProviderRef = chartViewProvider;
  newsProviderRef = newsProvider;
  overviewPanelRef = overviewPanel;
  settingsPanelRef = settingsPanel;
  stockDetailPanelRef = stockDetailPanel;
  radioPanelRef = radioPanel;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'cyberMonopolyChart',
      chartViewProvider
    )
  );

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const llmBaseUrl = config.get<string>('llmBaseUrl', '');
  const llmModel = config.get<string>('llmModel', 'gpt-3.5-turbo');

  // API Key 不再从普通配置读取，将在异步阶段从 SecretStorage 加载
  const llm = new LlmClient({
    apiEndpoint: llmBaseUrl || 'https://api.openai.com/v1',
    apiKey: '',
    model: llmModel,
    temperature: 0.7,
  });
  llmRef = llm;

  // 将 LlmClient 传递给设置面板，以便保存 API Key 时同步更新
  settingsPanel.setLlmClient(llm);

  const aiChatPanel = new AiChatPanel(llm, context.globalState);
  aiChatPanel.setContext(context);
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
    vscode.commands.registerCommand('cyberMonopoly.refreshMarket', async () => {
      await marketProvider.refresh();
    }),
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
    }),
    vscode.commands.registerCommand('cyberMonopoly.openRadio', async () => {
      radioPanelRef.setContext(context);
      if (!streamProxy) {
        streamProxy = new StreamProxy();
        const port = await streamProxy.start();
        radioPanelRef.setProxyPort(port);
      }
      radioPanelRef.show();
    })
  );

  const enableStatusBar = config.get<boolean>('enableStatusBar', true);
  if (enableStatusBar) {
    stockTicker = new StockTicker(watchlistProvider);
    context.subscriptions.push(stockTicker);
  }

  isActivated = true;
  getLogger().info('同步激活完成，命令已注册');
}

async function doActivateAsync(context: vscode.ExtensionContext) {
  const logger = getLogger();

  // === API Key 安全迁移：从普通配置 -> SecretStorage ===
  await migrateApiKeyToSecretStorage(context);

  // 从 SecretStorage 加载 API Key
  const apiKey = await context.secrets.get('cyberMonopoly.llm.apiKey');
  if (apiKey) {
    llmRef.updateApiKey(apiKey);
    logger.info('已从 SecretStorage 加载 API Key');
  } else {
    logger.warn('LLM API Key 未配置，AI 功能将不可用');
  }

  await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);

  startAutoRefresh();
  context.subscriptions.push({ dispose: () => { if (refreshTimer) clearInterval(refreshTimer); if (newsTimer) clearInterval(newsTimer); } });

  await withErrorHandling(() => watchlistProvider.refresh(), '自选股刷新失败');
  syncAlertRules();

  // 监听目标价变更，同步更新 AlertManager
  watchlistProvider.onAlertRulesChanged(() => {
    syncAlertRules();
  });

  await withErrorHandling(() => newsProvider.refresh(), '快讯刷新失败');
  await withErrorHandling(() => marketProvider.refresh(), '行情刷新失败');

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const bossKeyEnabled = config.get<boolean>('bossKeyEnabled', true);
  if (bossKeyEnabled) {
    bossMode = true;
  }
  const sat = config.get<number>('bossKeySaturation', 10);
  await withErrorHandling(async () => applyBossMode(sat), '老板模式初始化失败');

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

  logger.info('异步激活完成');
}

export function deactivate(): Thenable<void> | void {
  isActivated = false;
  if (refreshTimer) clearInterval(refreshTimer);
  if (newsTimer) clearInterval(newsTimer);
  if (stockTicker) {
    stockTicker.dispose();
    stockTicker = undefined;
  }
  if (streamProxy) {
    streamProxy.dispose();
    streamProxy = undefined as any;
  }

  // 确保所有待保存的状态数据已写入
  const logger = getLogger();
  if (stateManagerRef) {
    const flushPromise = stateManagerRef.flush().then(() => {
      logger.info('已停活（状态已保存）');
      logger.dispose();
    }).catch((e: unknown) => {
      logger.error('停活时状态保存失败', e);
      logger.dispose();
    });
    return flushPromise;
  }

  logger.info('已停活');
  logger.dispose();
}

/**
 * 安全迁移：如果旧配置 (cyberMonopoly.llmApiKey) 中有 API Key，
 * 将其迁移到 SecretStorage，然后清除旧配置中的明文 Key。
 */
async function migrateApiKeyToSecretStorage(context: vscode.ExtensionContext): Promise<void> {
  const logger = getLogger();
  const existingSecret = await context.secrets.get('cyberMonopoly.llm.apiKey');
  if (existingSecret) {
    return; // SecretStorage 中已有，无需迁移
  }

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const oldApiKey = config.get<string>('llmApiKey', '');
  if (oldApiKey) {
    logger.info('正在将 API Key 从配置迁移到 SecretStorage...');
    await context.secrets.store('cyberMonopoly.llm.apiKey', oldApiKey);
    // 清除旧配置中的明文 Key
    await config.update('llmApiKey', '', vscode.ConfigurationTarget.Global);
    logger.info('API Key 迁移完成，旧配置已清除');
  }
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
  const logger = getLogger();

  if (refreshTimer) clearInterval(refreshTimer);
  if (newsTimer) clearInterval(newsTimer);

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const interval = config.get<number>('refreshInterval', 10) * 1000;

  logger.info(`启动自动刷新，间隔 ${interval / 1000} 秒`);

  refreshTimer = setInterval(async () => {
    if (!isActivated) return;

    await withErrorHandling(async () => {
      await watchlistProvider.refresh();
      syncAlertRules();
      const quotes = Array.from(watchlistProvider.getQuotes().values());
      if (quotes.length > 0) {
        alertManager.check(quotes);
      }
    }, '自选股自动刷新失败');

    await withErrorHandling(() => marketProvider.refresh(), '行情自动刷新失败');
  }, interval);

  const newsInterval = 60 * 1000;
  newsTimer = setInterval(async () => {
    if (!isActivated) return;

    await withErrorHandling(() => newsProvider.refresh(), '快讯自动刷新失败');
  }, newsInterval);
}
