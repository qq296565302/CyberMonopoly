import * as vscode from 'vscode';
import { AiChatPanel } from '../webview/aiChatPanel';
import { LlmClient } from '../chat/llmClient';
import { SettingsPanel } from '../webview/settingsPanel';
import { OverviewPanel } from '../webview/overviewPanel';
import { WatchlistProvider } from '../provider/watchlistProvider';

export function registerAiCommands(
  context: vscode.ExtensionContext,
  llm: LlmClient,
  aiChatPanel: AiChatPanel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openAiChat', () => {
      aiChatPanel.show(context);
    })
  );

  return disposables;
}

export function registerSettingsCommands(
  context: vscode.ExtensionContext,
  settingsPanel: SettingsPanel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.openSettings', () => {
      settingsPanel.show(context);
    })
  );

  return disposables;
}

export function registerOverviewCommands(
  context: vscode.ExtensionContext,
  overviewPanel: OverviewPanel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.showOverview', () => {
      overviewPanel.show(context);
    })
  );

  return disposables;
}

export function registerStatusBarCommands(
  context: vscode.ExtensionContext
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.toggleStatusBar', async () => {
      const config = vscode.workspace.getConfiguration('cyberMonopoly');
      const current = config.get('enableStatusBar', true);
      await config.update('enableStatusBar', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`状态栏行情已${!current ? '开启' : '关闭'}`);
    })
  );

  return disposables;
}
