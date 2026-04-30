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
exports.StockTicker = void 0;
const vscode = __importStar(require("vscode"));
class StockTicker {
    constructor(provider) {
        this.provider = provider;
        this.currentIndex = 0;
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBar.command = 'cyberMonopoly.showOverview';
        this.startTicking();
    }
    dispose() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.statusBar.dispose();
    }
    setVisible(visible) {
        if (visible) {
            this.statusBar.show();
        }
        else {
            this.statusBar.hide();
        }
    }
    startTicking() {
        this.updateDisplay();
        this.intervalId = setInterval(() => {
            this.updateDisplay();
        }, 3000);
    }
    updateDisplay() {
        const stocks = this.provider.getStocks();
        const quotes = this.provider.getQuotes();
        if (stocks.length === 0) {
            this.statusBar.text = '$(heart) 赛博';
            this.statusBar.tooltip = '添加自选股开始追踪';
            this.statusBar.show();
            return;
        }
        if (this.currentIndex >= stocks.length) {
            this.currentIndex = 0;
        }
        const stock = stocks[this.currentIndex];
        const quote = quotes.get(stock.code);
        if (quote) {
            const sign = quote.changePercent >= 0 ? '↑' : '↓';
            this.statusBar.text = `$(${quote.changePercent >= 0 ? 'trending-up' : 'trending-down'}) ${stock.name} ${quote.price.toFixed(2)} ${sign}${Math.abs(quote.changePercent).toFixed(2)}%`;
            this.statusBar.tooltip = `${stock.name}(${stock.code}): ${quote.price} (${sign}${quote.changePercent.toFixed(2)}%)`;
        }
        else {
            this.statusBar.text = `$(sync~spin) ${stock.name} ...`;
            this.statusBar.tooltip = `${stock.name} 加载中...`;
        }
        this.statusBar.show();
        this.currentIndex++;
    }
}
exports.StockTicker = StockTicker;
//# sourceMappingURL=stockTicker.js.map