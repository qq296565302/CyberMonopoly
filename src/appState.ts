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
import { getLogger, withErrorHandling } from './utils/logger';

/**
 * 扩展全局状态管理
 *
 * 将 extension.ts 中分散的模块级变量统一管理，
 * 提供 activate / deactivate 生命周期方法。
 */
export class AppState {
  // 核心服务
  readonly stateManager: StateManager;
  readonly watchlistProvider: WatchlistProvider;
  readonly newsProvider: NewsViewProvider;
  readonly marketProvider: MarketProvider;
  readonly alertManager: AlertManager;
  readonly llm: LlmClient;

  // Webview 面板
  readonly chartViewProvider: ChartViewProvider;
  readonly overviewPanel: OverviewPanel;
  readonly settingsPanel: SettingsPanel;
  readonly aiChatPanel: AiChatPanel;
  readonly stockDetailPanel: StockDetailPanel;
  readonly radioPanel: RadioPanel;

  // 可选组件
  stockTicker: StockTicker | undefined;
  streamProxy: StreamProxy | undefined;

  // 定时器
  refreshTimer: NodeJS.Timeout | undefined;
  newsTimer: NodeJS.Timeout | undefined;

  // 状态标志
  isActivated = false;
  bossMode = false;

  constructor(private context: vscode.ExtensionContext) {
    this.stateManager = new StateManager(context.globalState);
    this.watchlistProvider = new WatchlistProvider(this.stateManager);
    this.newsProvider = new NewsViewProvider(this.stateManager);
    this.marketProvider = new MarketProvider(context.globalState);
    this.chartViewProvider = new ChartViewProvider(context);
    this.overviewPanel = new OverviewPanel(this.watchlistProvider);
    this.settingsPanel = new SettingsPanel();
    this.stockDetailPanel = new StockDetailPanel();
    this.radioPanel = new RadioPanel();

    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const llmBaseUrl = config.get<string>('llmBaseUrl', '');
    const llmModel = config.get<string>('llmModel', 'gpt-3.5-turbo');

    this.llm = new LlmClient({
      apiEndpoint: llmBaseUrl || 'https://api.openai.com/v1',
      apiKey: '',
      model: llmModel,
      temperature: 0.7,
    });

    this.settingsPanel.setLlmClient(this.llm);

    this.aiChatPanel = new AiChatPanel(this.llm, context.globalState);
    this.aiChatPanel.setContext(context);
    this.aiChatPanel.setWatchlistProvider(this.watchlistProvider);

    this.alertManager = new AlertManager(context.globalState);
  }

  /**
   * 注册 TreeDataProvider 和 WebviewViewProvider
   */
  registerProviders(): void {
    this.context.subscriptions.push(
      vscode.window.registerTreeDataProvider('cyberMonopolyWatchlist', this.watchlistProvider),
      vscode.window.registerTreeDataProvider('cyberMonopolyMarket', this.marketProvider),
      vscode.window.registerWebviewViewProvider('cyberMonopolyNews', this.newsProvider),
      vscode.window.registerWebviewViewProvider('cyberMonopolyChart', this.chartViewProvider),
    );
  }

  /**
   * 初始化状态栏（根据配置）
   */
  initStatusBar(): void {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    if (config.get<boolean>('enableStatusBar', true)) {
      this.stockTicker = new StockTicker(this.watchlistProvider);
      this.context.subscriptions.push(this.stockTicker);
    }
  }

  /**
   * 切换老板键模式
   */
  toggleBossMode(): void {
    const cfg = vscode.workspace.getConfiguration('cyberMonopoly');
    if (!cfg.get<boolean>('bossKeyEnabled', true)) {
      vscode.window.showInformationMessage('老板键未启用，请在设置中开启');
      return;
    }
    this.bossMode = !this.bossMode;
    const saturation = cfg.get<number>('bossKeySaturation', 10);
    this.applyBossMode(saturation);
    vscode.window.showInformationMessage(
      this.bossMode ? '老板键已激活 - 隐蔽模式' : '老板键已关闭 - 正常模式'
    );
  }

  /**
   * 应用老板模式到所有面板
   */
  applyBossMode(saturation: number): void {
    this.chartViewProvider?.setBossMode(this.bossMode, saturation);
    this.newsProvider?.setBossMode(this.bossMode, saturation);
    this.overviewPanel?.setBossMode(this.bossMode, saturation);
    this.settingsPanel?.setBossMode(this.bossMode, saturation);
    this.aiChatPanel?.setBossMode(this.bossMode, saturation);
    this.stockDetailPanel?.setBossMode(this.bossMode, saturation);
  }

  /**
   * 同步提醒规则
   */
  syncAlertRules(): void {
    this.alertManager.syncRules(this.watchlistProvider.getStocks());
  }

  /**
   * 启动自动刷新定时器
   */
  startAutoRefresh(): void {
    const logger = getLogger();

    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.newsTimer) clearInterval(this.newsTimer);

    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const interval = config.get<number>('refreshInterval', 10) * 1000;

    logger.info(`启动自动刷新，间隔 ${interval / 1000} 秒`);

    this.refreshTimer = setInterval(async () => {
      if (!this.isActivated) return;

      await withErrorHandling(async () => {
        await this.watchlistProvider.refresh();
        this.syncAlertRules();
        const quotes = Array.from(this.watchlistProvider.getQuotes().values());
        if (quotes.length > 0) {
          this.alertManager.check(quotes);
        }
      }, '自选股自动刷新失败');

      await withErrorHandling(() => this.marketProvider.refresh(), '行情自动刷新失败');
    }, interval);

    const newsInterval = 60 * 1000;
    this.newsTimer = setInterval(async () => {
      if (!this.isActivated) return;
      await withErrorHandling(() => this.newsProvider.refresh(), '快讯自动刷新失败');
    }, newsInterval);
  }

  /**
   * 获取 RadioPanel（懒初始化 StreamProxy）
   */
  async showRadio(): Promise<void> {
    this.radioPanel.setContext(this.context);
    if (!this.streamProxy) {
      this.streamProxy = new StreamProxy();
      const port = await this.streamProxy.start();
      this.radioPanel.setProxyPort(port);
    }
    this.radioPanel.show();
  }

  /**
   * 处理配置变更
   */
  onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
    if (!this.isActivated) return;

    if (e.affectsConfiguration('cyberMonopoly.enableStatusBar')) {
      const newEnable = vscode.workspace.getConfiguration('cyberMonopoly').get<boolean>('enableStatusBar', true);
      if (newEnable && !this.stockTicker) {
        this.stockTicker = new StockTicker(this.watchlistProvider);
        this.context.subscriptions.push(this.stockTicker);
      } else if (!newEnable && this.stockTicker) {
        this.stockTicker.dispose();
        this.stockTicker = undefined;
      }
    }

    if (e.affectsConfiguration('cyberMonopoly.refreshInterval')) {
      this.startAutoRefresh();
    }
  }

  /**
   * 停用扩展，清理资源
   */
  async dispose(): Promise<void> {
    this.isActivated = false;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.newsTimer) clearInterval(this.newsTimer);
    if (this.stockTicker) {
      this.stockTicker.dispose();
      this.stockTicker = undefined;
    }
    if (this.streamProxy) {
      this.streamProxy.dispose();
      this.streamProxy = undefined;
    }

    const logger = getLogger();
    try {
      await this.stateManager.flush();
      logger.info('已停活（状态已保存）');
    } catch (e: unknown) {
      logger.error('停活时状态保存失败', e);
    }
    logger.dispose();
  }
}
