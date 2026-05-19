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
exports.SettingsPanel = void 0;
const vscode = __importStar(require("vscode"));
const nonce_1 = require("../utils/nonce");
const llmClient_1 = require("../chat/llmClient");
class SettingsPanel {
    constructor() {
        this.bossEnabled = true;
        this.bossSaturation = 10;
    }
    setLlmClient(llm) {
        this.llm = llm;
    }
    show(context) {
        this.context = context;
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            // 重新应用老板模式状态
            this.applyBossMode();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('cyberMonopolySettings', '赛博大富翁设置', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandler();
        // 应用老板模式状态
        this.applyBossMode();
    }
    applyBossMode() {
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'bossMode', enabled: this.bossEnabled, saturation: this.bossSaturation });
        }
    }
    getWebviewContent() {
        const nonce = (0, nonce_1.getNonce)();
        const config = vscode.workspace.getConfiguration('cyberMonopoly');
        const bossInitEnabled = this.bossEnabled;
        const bossInitSaturation = this.bossSaturation;
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${(0, nonce_1.buildCspContent)(nonce)}">
  <style nonce="${nonce}">
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    h2 { margin: 0 0 16px 0; font-size: 16px; }
    .setting { margin-bottom: 12px; }
    .setting label { display: block; margin-bottom: 4px; font-size: 13px; color: var(--vscode-descriptionForeground); }
    .setting input, .setting select { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px 10px; font-size: 13px; outline: none; }
    .setting input:focus, .setting select:focus { border-color: var(--vscode-focusBorder); }
    .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: 12px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
    #test-status { margin-top: 10px; padding: 8px 12px; border-radius: 4px; font-size: 13px; display: none; }
    #test-status.success { display: block; background: var(--vscode-testing-passIcon-foreground, #73c991); color: #fff; }
    #test-status.error { display: block; background: var(--vscode-testing-failIcon-foreground, #f14c4c); color: #fff; }
    #test-status.testing { display: block; background: var(--vscode-input-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-input-border); }
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
    <label>LLM API Key（保存后通过加密存储，不再明文显示）</label>
    <input type="password" id="llmApiKey" value="" placeholder="留空则不修改已保存的 Key">
  </div>
  <div class="setting">
    <label>LLM 模型</label>
    <input type="text" id="llmModel" value="${config.get('llmModel', 'gpt-3.5-turbo')}">
  </div>
  <div class="btn-row">
    <button class="btn" id="save-btn">保存设置</button>
    <button class="btn-secondary" id="test-btn">测试连接</button>
  </div>
  <div id="test-status"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentBossEnabled = ${bossInitEnabled};
    let currentBossSaturation = ${bossInitSaturation};
    if (currentBossEnabled) {
      document.body.style.filter = 'saturate(' + (currentBossSaturation / 100) + ')';
    }
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
    document.getElementById('test-btn').addEventListener('click', () => {
      const btn = document.getElementById('test-btn');
      const status = document.getElementById('test-status');
      btn.disabled = true;
      btn.textContent = '测试中...';
      status.className = 'testing';
      status.textContent = '正在连接 LLM 服务...';
      vscode.postMessage({
        action: 'testConnection',
        settings: {
          llmBaseUrl: document.getElementById('llmBaseUrl').value,
          llmApiKey: document.getElementById('llmApiKey').value,
          llmModel: document.getElementById('llmModel').value,
        }
      });
    });
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'bossMode') {
        currentBossEnabled = msg.enabled;
        currentBossSaturation = msg.saturation;
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
      }
      if (msg.type === 'testResult') {
        const btn = document.getElementById('test-btn');
        const status = document.getElementById('test-status');
        btn.disabled = false;
        btn.textContent = '测试连接';
        if (msg.success) {
          status.className = 'success';
          status.textContent = '连接成功！模型: ' + (msg.model || '未知') + ', 耗时: ' + (msg.duration || '') + 'ms';
        } else {
          status.className = 'error';
          status.textContent = '连接失败: ' + (msg.error || '未知错误');
        }
      }
    });
  </script>
</body>
</html>`;
    }
    setupMessageHandler() {
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.action === 'save') {
                const config = vscode.workspace.getConfiguration('cyberMonopoly');
                await config.update('refreshInterval', msg.settings.refreshInterval, vscode.ConfigurationTarget.Global);
                await config.update('llmBaseUrl', msg.settings.llmBaseUrl, vscode.ConfigurationTarget.Global);
                await config.update('llmModel', msg.settings.llmModel, vscode.ConfigurationTarget.Global);
                // API Key 通过 SecretStorage 加密存储，不写入普通配置
                if (msg.settings.llmApiKey && this.context) {
                    await this.context.secrets.store('cyberMonopoly.llm.apiKey', msg.settings.llmApiKey);
                    // 同步更新运行中的 LlmClient 实例
                    if (this.llm) {
                        this.llm.updateApiKey(msg.settings.llmApiKey);
                    }
                    vscode.window.showInformationMessage('设置已保存（API Key 已加密存储）');
                }
                else {
                    vscode.window.showInformationMessage('设置已保存');
                }
            }
            if (msg.action === 'testConnection') {
                await this.handleTestConnection(msg.settings);
            }
        });
    }
    /**
     * 处理 API Key 连通性测试
     * 创建临时 LlmClient 实例发送一个简单请求，验证 Key 和地址是否有效
     */
    async handleTestConnection(settings) {
        // 确定 API Key：优先使用用户输入的，否则从 SecretStorage 读取已保存的
        let apiKey = settings.llmApiKey;
        if (!apiKey && this.context) {
            apiKey = await this.context.secrets.get('cyberMonopoly.llm.apiKey') || '';
        }
        if (!apiKey) {
            this.panel?.webview.postMessage({
                type: 'testResult',
                success: false,
                error: '未填写 API Key，请先输入 Key 或确认已保存过 Key',
            });
            return;
        }
        const baseUrl = settings.llmBaseUrl || 'https://api.openai.com/v1';
        const model = settings.llmModel || 'gpt-3.5-turbo';
        // 创建临时 LlmClient 用于测试
        const testClient = new llmClient_1.LlmClient({
            apiEndpoint: baseUrl,
            apiKey: apiKey,
            model: model,
            temperature: 0,
        });
        const startTime = Date.now();
        try {
            // 发送一个最简测试请求
            const response = await testClient.chat([['user', 'hi']]);
            const duration = Date.now() - startTime;
            this.panel?.webview.postMessage({
                type: 'testResult',
                success: true,
                model: model,
                duration: duration,
            });
        }
        catch (err) {
            const duration = Date.now() - startTime;
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.panel?.webview.postMessage({
                type: 'testResult',
                success: false,
                error: errorMsg,
                duration: duration,
            });
        }
    }
    setBossMode(enabled, saturation) {
        this.bossEnabled = enabled;
        this.bossSaturation = saturation;
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
        }
    }
}
exports.SettingsPanel = SettingsPanel;
//# sourceMappingURL=settingsPanel.js.map