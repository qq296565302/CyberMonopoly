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
exports.AlertManager = void 0;
const vscode = __importStar(require("vscode"));
class AlertManager {
    constructor(state) {
        this.rules = new Map();
        this.cooldownMs = 5 * 60 * 1000;
        this.STORAGE_KEY = 'cyberMonopoly.alertLastTime';
        this.state = state;
    }
    addRule(stock) {
        if (stock.alertPrice || stock.alertPercent) {
            const saved = this.state.get(this.STORAGE_KEY, {});
            this.rules.set(stock.code, {
                code: stock.code,
                name: stock.name,
                alertPrice: stock.alertPrice,
                alertPercent: stock.alertPercent,
                lastAlertTime: saved[stock.code] || 0,
            });
        }
    }
    removeRule(code) {
        this.rules.delete(code);
    }
    persistAlertTimes() {
        const saved = {};
        for (const [code, rule] of this.rules) {
            if (rule.lastAlertTime > 0) {
                saved[code] = rule.lastAlertTime;
            }
        }
        this.state.update(this.STORAGE_KEY, saved);
    }
    check(quotes) {
        const now = Date.now();
        for (const q of quotes) {
            const rule = this.rules.get(q.code);
            if (!rule)
                continue;
            if (now - rule.lastAlertTime < this.cooldownMs)
                continue;
            let shouldAlert = false;
            let message = '';
            if (rule.alertPrice) {
                const diff = Math.abs(q.price - rule.alertPrice);
                const threshold = rule.alertPrice * 0.005;
                if (diff <= threshold) {
                    shouldAlert = true;
                    message = `📊 ${rule.name} 到达目标价 ¥${rule.alertPrice.toFixed(2)}，当前 ¥${q.price.toFixed(2)}`;
                }
            }
            if (rule.alertPercent && Math.abs(q.changePercent) >= rule.alertPercent) {
                shouldAlert = true;
                const sign = q.changePercent >= 0 ? '📈' : '📉';
                message = `${sign} ${rule.name} 异动 ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%，当前 ¥${q.price.toFixed(2)}`;
            }
            if (shouldAlert) {
                rule.lastAlertTime = now;
                this.persistAlertTimes();
                this.notify(message, q.code);
            }
        }
    }
    notify(message, code) {
        vscode.window.showInformationMessage(message, '查看K线', '忽略').then(action => {
            if (action === '查看K线') {
                vscode.commands.executeCommand('cyberMonopoly.openChart', code);
            }
        });
    }
}
exports.AlertManager = AlertManager;
//# sourceMappingURL=alert.js.map