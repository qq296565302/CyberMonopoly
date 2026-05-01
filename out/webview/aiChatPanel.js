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
    setWatchlistProvider(provider) {
        this.watchlistProvider = provider;
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
        if (this.messages.length > 0) {
            this.panel.webview.postMessage({
                type: 'history',
                messages: this.messages.map(m => ({ role: m.role, content: m.content })),
            });
        }
    }
    getWebviewContent() {
        return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); display: flex; flex-direction: column; box-sizing: border-box; }
    #toolbar { display: none; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); gap: 8px; align-items: center; }
    #toolbar.has-history { display: flex; }
    #clear-btn { background: none; border: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); padding: 2px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
    #clear-btn:hover { color: var(--vscode-foreground); border-color: var(--vscode-foreground); }
    #messages { flex: 1; overflow-y: auto; padding: 16px; scroll-behavior: smooth; }
    .msg-wrapper { margin-bottom: 16px; }
    .msg-wrapper.user { text-align: right; }
    .msg-wrapper.ai { text-align: left; }
    .msg-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; padding: 0 4px; }
    .msg { display: inline-block; max-width: 85%; padding: 10px 14px; border-radius: 10px; line-height: 1.6; font-size: 13px; white-space: pre-wrap; word-break: break-word; text-align: left; }
    .msg-wrapper.user .msg { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-bottom-right-radius: 3px; }
    .msg-wrapper.ai .msg { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); color: var(--vscode-editorWidget-foreground); border-bottom-left-radius: 3px; }
    .typing-dots { display: inline-flex; gap: 4px; align-items: center; padding: 12px 14px; }
    .typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-descriptionForeground); animation: bounce 1.2s infinite ease-in-out; }
    .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-6px); opacity: 1; } }
    #input-area { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--vscode-panel-border); align-items: flex-end; }
    #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 10px 12px; font-size: 13px; font-family: inherit; outline: none; resize: none; min-height: 38px; max-height: 120px; line-height: 1.4; }
    #input:focus { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .btn-group { display: flex; gap: 4px; }
    #send-btn, #stop-btn {
      border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; transition: opacity 0.15s;
    }
    #send-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    #send-btn:hover { opacity: 0.9; }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #stop-btn { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-foreground); display: none; border: 1px solid var(--vscode-inputValidation-errorBorder, transparent); }
    #stop-btn:hover { opacity: 0.8; }
    #empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); gap: 12px; }
    #empty-hint .icon { font-size: 40px; opacity: 0.3; }
    #empty-hint .text { font-size: 13px; }
  </style>
</head>
<body>
  <div id="toolbar"><button id="clear-btn">清空对话</button></div>
  <div id="messages">
    <div id="empty-hint"><span class="icon">🤖</span><span class="text">输入消息开始对话</span></div>
  </div>
  <div id="input-area">
    <textarea id="input" placeholder="输入消息... (Enter发送, Shift+Enter换行)" rows="1"></textarea>
    <div class="btn-group">
      <button id="send-btn">发送</button>
      <button id="stop-btn">停止</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const $messages = document.getElementById('messages');
    const $input = document.getElementById('input');
    const $sendBtn = document.getElementById('send-btn');
    const $stopBtn = document.getElementById('stop-btn');
    const $emptyHint = document.getElementById('empty-hint');
    const $toolbar = document.getElementById('toolbar');
    const $clearBtn = document.getElementById('clear-btn');
    let isWaiting = false;

    function addMsg(role, content) {
      if ($emptyHint) $emptyHint.remove();
      $toolbar.classList.add('has-history');
      const wrapper = document.createElement('div');
      wrapper.className = 'msg-wrapper ' + role;
      const label = document.createElement('div');
      label.className = 'msg-label';
      label.textContent = role === 'user' ? '你' : 'AI助手';
      const div = document.createElement('div');
      div.className = 'msg';
      div.textContent = content;
      wrapper.appendChild(label);
      wrapper.appendChild(div);
      $messages.appendChild(wrapper);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function showTyping() {
      isWaiting = true;
      $sendBtn.style.display = 'none';
      $stopBtn.style.display = 'inline-block';
      if ($emptyHint) $emptyHint.remove();
      const wrapper = document.createElement('div');
      wrapper.id = 'typing-indicator';
      wrapper.className = 'msg-wrapper ai';
      const label = document.createElement('div');
      label.className = 'msg-label';
      label.textContent = 'AI助手';
      const dots = document.createElement('div');
      dots.className = 'typing-dots';
      dots.innerHTML = '<span></span><span></span><span></span>';
      wrapper.appendChild(label);
      wrapper.appendChild(dots);
      $messages.appendChild(wrapper);
      $messages.scrollTop = $messages.scrollHeight;
    }

    function hideTyping() {
      isWaiting = false;
      $sendBtn.style.display = 'inline-block';
      $stopBtn.style.display = 'none';
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }

    function send() {
      const text = $input.value.trim();
      if (!text || isWaiting) return;
      $input.value = '';
      autoResize();
      addMsg('user', text);
      showTyping();
      vscode.postMessage({ type: 'chat', content: text });
    }

    function stop() {
      vscode.postMessage({ type: 'abort' });
    }

    function autoResize() {
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    }

    $sendBtn.addEventListener('click', send);
    $stopBtn.addEventListener('click', stop);
    $input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $input.addEventListener('input', autoResize);
    $clearBtn.addEventListener('click', () => {
      $messages.innerHTML = '';
      $toolbar.classList.remove('has-history');
      $messages.innerHTML = '<div id="empty-hint"><span class="icon">🤖</span><span class="text">输入消息开始对话</span></div>';
      vscode.postMessage({ type: 'clearHistory' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'history') {
        for (const m of msg.messages) {
          addMsg(m.role, m.content);
        }
        return;
      }
      if (msg.type === 'bossMode') {
        document.body.style.filter = msg.enabled ? 'saturate(' + (msg.saturation / 100) + ')' : '';
        return;
      }
      if (msg.type === 'aborted') {
        hideTyping();
        addMsg('ai', '(已停止)');
        return;
      }
      hideTyping();
      if (msg.type === 'response') addMsg('ai', msg.content);
      if (msg.type === 'error') addMsg('ai', '错误: ' + msg.content);
    });
  </script>
</body>
</html>`;
    }
    setupMessageHandler() {
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'abort') {
                this.llm.abort();
                this.panel.webview.postMessage({ type: 'aborted' });
                return;
            }
            if (msg.type === 'clearHistory') {
                this.messages = [];
                this.saveHistory();
                return;
            }
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
                if (e?.name === 'AbortError') {
                    this.panel.webview.postMessage({ type: 'aborted' });
                }
                else {
                    this.panel.webview.postMessage({ type: 'error', content: String(e) });
                }
            }
        });
    }
    getSystemPrompt() {
        let stockList = '贵州茅台=600519, 平安银行=000001, 宁德时代=300750';
        if (this.watchlistProvider) {
            const stocks = this.watchlistProvider.getStocks();
            if (stocks.length > 0) {
                stockList = stocks.map(s => `${s.name}=${s.code}`).join(', ');
            }
        }
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
    setBossMode(enabled, saturation) {
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'bossMode', enabled, saturation });
        }
    }
}
exports.AiChatPanel = AiChatPanel;
//# sourceMappingURL=aiChatPanel.js.map