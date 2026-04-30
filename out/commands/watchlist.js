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
exports.registerWatchlistCommands = registerWatchlistCommands;
const vscode = __importStar(require("vscode"));
function registerWatchlistCommands(context, provider, chartPanel) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.addToWatchlist', async () => {
        const input = await vscode.window.showInputBox({
            prompt: '输入股票代码',
            placeHolder: '例如: 600519',
            validateInput: (value) => {
                if (!value || !/^\d{6}$/.test(value.trim())) {
                    return '请输入6位数字股票代码';
                }
                return null;
            },
        });
        if (input) {
            await provider.addStock(input.trim());
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.removeFromWatchlist', async (item) => {
        if (item && item.stock) {
            provider.removeStock(item.stock.code);
        }
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.refreshQuotes', async () => {
        await provider.refresh();
    }));
    disposables.push(vscode.commands.registerCommand('cyberMonopoly.openChart', async (code, name) => {
        if (!code) {
            const input = await vscode.window.showInputBox({
                prompt: '输入股票代码',
                placeHolder: '例如: 600519',
            });
            if (input) {
                code = input.trim();
                name = '';
            }
            else {
                return;
            }
        }
        await chartPanel.show(code, name || '未知', context);
    }));
    return disposables;
}
//# sourceMappingURL=watchlist.js.map