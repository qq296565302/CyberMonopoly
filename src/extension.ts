import * as vscode from 'vscode';
import { AppState } from './appState';
import { registerWatchlistCommands } from './commands/watchlist';
import { registerNewsCommands } from './commands/news';
import { registerAiCommands, registerSettingsCommands, registerOverviewCommands, registerStatusBarCommands } from './commands/ai';
import { getLogger } from './utils/logger';

let app: AppState | undefined;

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
}

function doActivateSync(context: vscode.ExtensionContext) {
  const state = new AppState(context);
  app = state;

  state.registerProviders();

  context.subscriptions.push(
    ...registerWatchlistCommands(context, state.watchlistProvider, state.chartViewProvider, state.stockDetailPanel),
    ...registerNewsCommands(context, state.newsProvider),
    ...registerAiCommands(context, state.llm, state.aiChatPanel),
    ...registerSettingsCommands(context, state.settingsPanel),
    ...registerOverviewCommands(context, state.overviewPanel),
    ...registerStatusBarCommands(context),
    vscode.commands.registerCommand('cyberMonopoly.refreshMarket', async () => {
      await state.marketProvider.refresh();
    }),
    vscode.commands.registerCommand('cyberMonopoly.toggleBossKey', () => {
      state.toggleBossMode();
    }),
    vscode.commands.registerCommand('cyberMonopoly.openRadio', async () => {
      await state.showRadio();
    })
  );

  state.initStatusBar();
  state.isActivated = true;
  getLogger().info('同步激活完成，命令已注册');
}

async function doActivateAsync(context: vscode.ExtensionContext) {
  const state = app!;
  const logger = getLogger();

  // === API Key 安全迁移：从普通配置 -> SecretStorage ===
  await migrateApiKeyToSecretStorage(context);

  // 从 SecretStorage 加载 API Key
  const apiKey = await context.secrets.get('cyberMonopoly.llm.apiKey');
  if (apiKey) {
    state.llm.updateApiKey(apiKey);
    logger.info('已从 SecretStorage 加载 API Key');
  } else {
    logger.warn('LLM API Key 未配置，AI 功能将不可用');
  }

  await vscode.commands.executeCommand('setContext', 'cyberMonopoly:enabled', true);

  state.startAutoRefresh();
  context.subscriptions.push({
    dispose: () => {
      if (state.refreshTimer) clearInterval(state.refreshTimer);
      if (state.newsTimer) clearInterval(state.newsTimer);
    },
  });

  state.watchlistProvider.refresh();
  state.syncAlertRules();

  // 监听目标价变更，同步更新 AlertManager
  state.watchlistProvider.onAlertRulesChanged(() => {
    state.syncAlertRules();
  });

  state.newsProvider.refresh();
  state.marketProvider.refresh();

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const bossKeyEnabled = config.get<boolean>('bossKeyEnabled', true);
  if (bossKeyEnabled) {
    state.bossMode = true;
    const sat = config.get<number>('bossKeySaturation', 10);
    state.applyBossMode(sat);
  }

  const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
    state.onConfigurationChanged(e);
  });
  context.subscriptions.push(configChangeListener);

  logger.info('异步激活完成');
}

export function deactivate(): Thenable<void> | void {
  if (app) {
    return app.dispose();
  }
  getLogger().info('已停活');
  getLogger().dispose();
}

/**
 * 安全迁移：如果旧配置 (cyberMonopoly.llmApiKey) 中有 API Key，
 * 将其迁移到 SecretStorage，然后清除旧配置中的明文 Key。
 */
async function migrateApiKeyToSecretStorage(context: vscode.ExtensionContext): Promise<void> {
  const logger = getLogger();
  const existingSecret = await context.secrets.get('cyberMonopoly.llm.apiKey');
  if (existingSecret) return;

  const config = vscode.workspace.getConfiguration('cyberMonopoly');
  const oldApiKey = config.get<string>('llmApiKey', '');
  if (oldApiKey) {
    logger.info('正在将 API Key 从配置迁移到 SecretStorage...');
    await context.secrets.store('cyberMonopoly.llm.apiKey', oldApiKey);
    await config.update('llmApiKey', '', vscode.ConfigurationTarget.Global);
    logger.info('API Key 迁移完成，旧配置已清除');
  }
}
