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
exports.registerAiCommands = registerAiCommands;
exports.registerSettingsCommands = registerSettingsCommands;
exports.registerOverviewCommands = registerOverviewCommands;
exports.registerStatusBarCommands = registerStatusBarCommands;
const vscode = __importStar(require("vscode"));
function registerAiCommands(context, llm, aiChatPanel) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openAiChat', () => {
        aiChatPanel.show(context);
    }));
    return disposables;
}
function registerSettingsCommands(context, settingsPanel) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openSettings', () => {
        settingsPanel.show(context);
    }));
    return disposables;
}
function registerOverviewCommands(context, overviewPanel) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.showOverview', () => {
        overviewPanel.show(context);
    }));
    return disposables;
}
function registerStatusBarCommands(context) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.toggleStatusBar', async () => {
        const config = vscode.workspace.getConfiguration('cyberMonopoly');
        const current = config.get('enableStatusBar', true);
        await config.update('enableStatusBar', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`状态栏行情已${!current ? '开启' : '关闭'}`);
    }));
    return disposables;
}
//# sourceMappingURL=ai.js.map