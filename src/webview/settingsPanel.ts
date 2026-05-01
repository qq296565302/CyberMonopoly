import * as vscode from 'vscode';

export class SettingsPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(context: vscode.ExtensionContext) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolySettings',
      '赛博大富翁设置',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageHandler();
  }

  private getWebviewContent(): string {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    h2 { margin: 0 0 16px 0; font-size: 16px; }
    .setting { margin-bottom: 12px; }
    .setting label { display: block; margin-bottom: 4px; font-size: 13px; color: var(--vscode-descriptionForeground); }
    .setting input, .setting select { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px 10px; font-size: 13px; outline: none; }
    .setting input:focus, .setting select:focus { border-color: var(--vscode-focusBorder); }
    .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: 12px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h2>赛博大富翁设置</h2>
  <div class="setting">
    <label>行情刷新间隔 (秒)</label>
    <input type="number" id="refreshInterval" value="${config.get('refreshInterval', 10)}" min="5" max="60">
  </div>
  <div class="setting">
    <label>LLM API Base URL</label>
    <input type="text" id="llmBaseUrl" value="${config.get('llmBaseUrl', '')}" placeholder="https://api.openai.com/v1">
  </div>
  <div class="setting">
    <label>LLM API Key</label>
    <input type="password" id="llmApiKey" value="${config.get('llmApiKey', '')}" placeholder="sk-...">
  </div>
  <div class="setting">
    <label>LLM 模型</label>
    <input type="text" id="llmModel" value="${config.get('llmModel', 'gpt-3.5-turbo')}">
  </div>
  <button class="btn" id="save-btn">保存设置</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('save-btn').addEventListener('click', () => {
      vscode.postMessage({
        action: 'save',
        settings: {
          refreshInterval: parseInt(document.getElementById('refreshInterval').value),
          llmBaseUrl: document.getElementById('llmBaseUrl').value,
          llmApiKey: document.getElementById('llmApiKey').value,
          llmModel: document.getElementById('llmModel').value,
        }
      });
    });
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'bossMode') {
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
    });
  </script>
</body>
</html>`;
  }

  private setupMessageHandler() {
    this.panel!.webview.onDidReceiveMessage(async (msg) => {
      if (msg.action === 'save') {
        const config = vscode.workspace.getConfiguration('cyberMonopoly');
        await config.update('refreshInterval', msg.settings.refreshInterval, vscode.ConfigurationTarget.Global);
        await config.update('llmBaseUrl', msg.settings.llmBaseUrl, vscode.ConfigurationTarget.Global);
        await config.update('llmModel', msg.settings.llmModel, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('设置已保存');
      }
    });
  }

  setBossMode(enabled: boolean, saturation: number): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
    }
  }
}
