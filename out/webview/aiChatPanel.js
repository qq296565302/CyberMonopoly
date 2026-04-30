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
exports.AiChatPanel = void 0;
const vscode = __importStar(require("vscode"));
class AiChatPanel {
    constructor(llm, state) {
        this.messages = [];
        this.STORAGE_KEY = 'cyberMonopoly.chatHistory';
        this.llm = llm;
        this.state = state;
        const saved = state.get(this.STORAGE_KEY, []);
        this.messages = saved.slice(-50);
    }
    saveHistory() {
        this.state.update(this.STORAGE_KEY, this.messages.slice(-50));
    }
    show(_context) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('cyberMonopolyAiChat', 'AI助手', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandler();
    }
    getWebviewContent() {
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root { --user-bg: var(--vscode-button-background); --ai-bg: var(--vscode-editor-inactiveSelectionBackground); }
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; }
    #messages { flex: 1; overflow-y: auto; padding: 12px; }
    .msg { margin-bottom: 12px; max-width: 85%; padding: 8px 12px; border-radius: 8px; line-height: 1.5; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
    .msg.user { background: var(--user-bg); margin-left: auto; border-bottom-right-radius: 2px; }
    .msg.ai { background: var(--ai-bg); border-bottom-left-radius: 2px; }
    .msg .time { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    #input-area { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--vscode-panel-border); }
    #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px 12px; font-size: 13px; outline: none; resize: none; min-height: 36px; max-height: 120px; }
    #input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .typing { color: var(--vscode-descriptionForeground); font-style: italic; padding: 8px 12px; }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" placeholder="输入消息... (Enter发送, Shift+Enter换行)" rows="1"></textarea>
    <button id="send-btn">发送</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const $messages = document.getElementById('messages');
    const $input = document.getElementById('input');
    const $sendBtn = document.getElementById('send-btn');

    function addMsg(role, content) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = content;
      const time = document.createElement('div');
      time.className = 'time';
      time.textContent = new Date().toLocaleTimeString();
      div.appendChild(time);
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.id = 'typing-indicator';
      div.className = 'msg ai typing';
      div.textContent = '思考中...';
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function hideTyping() {
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }

    async function send() {
      const text = $input.value.trim();
      if (!text) return;
      $input.value = '';
      addMsg('user', text);
      showTyping();
      $sendBtn.disabled = true;
      vscode.postMessage({ type: 'chat', content: text });
    }

    $sendBtn.addEventListener('click', send);
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    window.addEventListener('message', event => {
      hideTyping();
      $sendBtn.disabled = false;
      const msg = event.data;
      if (msg.type === 'response') addMsg('ai', msg.content);
      if (msg.type === 'error') addMsg('ai', '错误: ' + msg.content);
    });
  </script>
</body>
</html>`;
    }
    setupMessageHandler() {
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type !== 'chat')
                return;
            this.messages.push({ role: 'user', content: msg.content, timestamp: Date.now() });
            try {
                const response = await this.llm.chat([
                    ['system', this.getSystemPrompt()],
                    ...this.messages.slice(-20).map(m => [m.role, m.content]),
                ]);
                this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
                this.saveHistory();
                this.panel.webview.postMessage({ type: 'response', content: response });
            }
            catch (e) {
                this.panel.webview.postMessage({ type: 'error', content: String(e) });
            }
        });
    }
    getSystemPrompt(watchlist = []) {
        const stockList = watchlist.length > 0
            ? watchlist.map(s => `${s.name}=${s.code}`).join(', ')
            : '贵州茅台=600519, 平安银行=000001, 宁德时代=300750';
        return `你是赛博大富翁的AI助手，帮助用户查询A股信息。

# 用户自选股代码对照表
${stockList}

# 你的能力
1. 回答股市相关问题（技术分析、基本面、行业动态）
2. 解释财经术语
3. 帮助制定投资策略参考
4. 聊天闲谈

# 规则
- 如果用户问的是股票相关，尽量给出有依据的分析
- 如果无法确定，明确说明"仅供参考，不构成投资建议"
- 保持简洁，不要长篇大论
- 用中文回答`;
    }
}
exports.AiChatPanel = AiChatPanel;
//# sourceMappingURL=aiChatPanel.js.map