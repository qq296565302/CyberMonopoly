import * as vscode from 'vscode';
import { NewsViewProvider } from '../provider/newsProvider';

export function registerNewsCommands(
  _context: vscode.ExtensionContext,
  provider: NewsViewProvider
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('cyberMonopoly.refreshNews', async () => {
      await provider.refresh();
    })
  );

  return disposables;
}
