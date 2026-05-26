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
const COOLING_LEVELS = [
    { minPercent: 8, maxPercent: Infinity, cooldownMs: 3 * 60 * 1000 }, // 8%+: 3分钟
    { minPercent: 5, maxPercent: 8, cooldownMs: 10 * 60 * 1000 }, // 5-8%: 10分钟
    { minPercent: 3, maxPercent: 5, cooldownMs: 30 * 60 * 1000 }, // 3-5%: 30分钟
];
const PRICE_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
// 关键节点（整数关口）
const KEY_THRESHOLDS = [3, 5, 8, 10];
function isTradingHours() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6)
        return false;
    const hhmm = now.getHours() * 100 + now.getMinutes();
    return (hhmm >= 915 && hhmm <= 1131) || (hhmm >= 1255 && hhmm <= 1501);
}
// 获取涨跌幅所在的区间（用于去重）
function getPercentBucket(percent) {
    const absPercent = Math.abs(percent);
    if (absPercent >= 10)
        return 10;
    if (absPercent >= 8)
        return 8;
    if (absPercent >= 5)
        return 5;
    if (absPercent >= 3)
        return 3;
    return Math.floor(absPercent);
}
// 获取冷却时间
function getCoolingTime(absPercent) {
    for (const level of COOLING_LEVELS) {
        if (absPercent >= level.minPercent && absPercent < level.maxPercent) {
            return level.cooldownMs;
        }
    }
    return COOLING_LEVELS[COOLING_LEVELS.length - 1].cooldownMs;
}
// 检查是否触及关键节点
function isKeyThreshold(current, previous) {
    const absCurrent = Math.abs(current);
    const absPrevious = previous ? Math.abs(previous) : 0;
    for (const threshold of KEY_THRESHOLDS) {
        // 从下方突破关键节点
        if (absCurrent >= threshold && absPrevious < threshold) {
            return true;
        }
    }
    return false;
}
class AlertManager {
    constructor(state) {
        this.rules = new Map();
        this.STORAGE_KEY = 'cyberMonopoly.alertLastTime';
        this.STORAGE_PERCENT_KEY = 'cyberMonopoly.alertLastPercent';
        this.STORAGE_DIRECTION_KEY = 'cyberMonopoly.alertLastDirection';
        this.STORAGE_PRICE_ALERT_TIME_KEY = 'cyberMonopoly.alertLastPriceTime';
        this.STORAGE_PRICE_TRIGGERED_KEY = 'cyberMonopoly.alertPriceTriggered';
        this.state = state;
    }
    addRule(stock) {
        const config = vscode.workspace.getConfiguration('cyberMonopoly');
        const defaultPercent = config.get('defaultAlertPercent', 5);
        const alertPrice = stock.alertPrice;
        const alertPercent = stock.alertPercent || defaultPercent;
        if (alertPrice || alertPercent) {
            const savedTimes = this.state.get(this.STORAGE_KEY, {});
            const savedPercents = this.state.get(this.STORAGE_PERCENT_KEY, {});
            const savedDirections = this.state.get(this.STORAGE_DIRECTION_KEY, {});
            const savedPriceTimes = this.state.get(this.STORAGE_PRICE_ALERT_TIME_KEY, {});
            const savedPriceTriggered = this.state.get(this.STORAGE_PRICE_TRIGGERED_KEY, {});
            const existing = this.rules.get(stock.code);
            this.rules.set(stock.code, {
                code: stock.code,
                name: stock.name,
                alertPrice,
                alertPercent,
                lastAlertTime: existing?.lastAlertTime || savedTimes[stock.code] || 0,
                lastAlertPercent: existing?.lastAlertPercent ?? savedPercents[stock.code],
                lastAlertDirection: existing?.lastAlertDirection || savedDirections[stock.code],
                lastPriceAlertTime: existing?.lastPriceAlertTime || savedPriceTimes[stock.code] || 0,
                priceAlertTriggered: existing?.priceAlertTriggered ?? savedPriceTriggered[stock.code] ?? false,
            });
        }
    }
    removeRule(code) {
        this.rules.delete(code);
    }
    persistAlertData() {
        const savedTimes = {};
        const savedPercents = {};
        const savedDirections = {};
        const savedPriceTimes = {};
        const savedPriceTriggered = {};
        for (const [code, rule] of this.rules) {
            if (rule.lastAlertTime > 0) {
                savedTimes[code] = rule.lastAlertTime;
            }
            if (rule.lastAlertPercent !== undefined) {
                savedPercents[code] = rule.lastAlertPercent;
            }
            if (rule.lastAlertDirection) {
                savedDirections[code] = rule.lastAlertDirection;
            }
            if (rule.lastPriceAlertTime > 0) {
                savedPriceTimes[code] = rule.lastPriceAlertTime;
            }
            savedPriceTriggered[code] = rule.priceAlertTriggered;
        }
        this.state.update(this.STORAGE_KEY, savedTimes).then(undefined, (e) => {
            console.error('[AlertManager] 保存提醒时间失败:', e);
        });
        this.state.update(this.STORAGE_PERCENT_KEY, savedPercents).then(undefined, (e) => {
            console.error('[AlertManager] 保存提醒涨跌幅失败:', e);
        });
        this.state.update(this.STORAGE_DIRECTION_KEY, savedDirections).then(undefined, (e) => {
            console.error('[AlertManager] 保存提醒方向失败:', e);
        });
        this.state.update(this.STORAGE_PRICE_ALERT_TIME_KEY, savedPriceTimes).then(undefined, (e) => {
            console.error('[AlertManager] 保存目标价提醒时间失败:', e);
        });
        this.state.update(this.STORAGE_PRICE_TRIGGERED_KEY, savedPriceTriggered).then(undefined, (e) => {
            console.error('[AlertManager] 保存目标价触发状态失败:', e);
        });
    }
    check(quotes) {
        if (!isTradingHours())
            return;
        const now = Date.now();
        for (const q of quotes) {
            const rule = this.rules.get(q.code);
            if (!rule)
                continue;
            if (q.price <= 0 || q.prevClose <= 0)
                continue;
            const absPercent = Math.abs(q.changePercent);
            const currentDirection = q.changePercent >= 0 ? 'up' : 'down';
            const messages = [];
            // 1. 目标价格提醒
            if (rule.alertPrice) {
                const diff = Math.abs(q.price - rule.alertPrice);
                const threshold = rule.alertPrice * 0.005;
                const inZone = diff <= threshold;
                if (inZone) {
                    const inCooldown = now - rule.lastPriceAlertTime < PRICE_ALERT_COOLDOWN_MS;
                    if (!rule.priceAlertTriggered && !inCooldown) {
                        messages.push(`📊 ${rule.name} 到达目标价 ¥${rule.alertPrice.toFixed(2)}，当前 ¥${q.price.toFixed(2)}`);
                        rule.priceAlertTriggered = true;
                        rule.lastPriceAlertTime = now;
                    }
                }
                else {
                    rule.priceAlertTriggered = false;
                }
            }
            // 2. 涨跌幅异动提醒
            if (rule.alertPercent && absPercent >= rule.alertPercent) {
                const lastPercent = rule.lastAlertPercent;
                const lastDirection = rule.lastAlertDirection;
                const isKeyNode = isKeyThreshold(q.changePercent, lastPercent);
                const coolingTime = getCoolingTime(absPercent);
                const isInCooling = now - rule.lastAlertTime < coolingTime;
                const currentBucket = getPercentBucket(q.changePercent);
                const lastBucket = lastPercent !== undefined ? getPercentBucket(lastPercent) : -1;
                const bucketChanged = currentBucket !== lastBucket;
                const directionChanged = lastDirection !== undefined && currentDirection !== lastDirection;
                const sameDirectionExpanded = lastDirection === currentDirection &&
                    lastPercent !== undefined &&
                    absPercent > Math.abs(lastPercent);
                let percentAlert = false;
                if (isKeyNode && !isInCooling) {
                    percentAlert = true;
                }
                else if (!isInCooling) {
                    if (directionChanged) {
                        percentAlert = true;
                    }
                    else if (bucketChanged && sameDirectionExpanded) {
                        percentAlert = true;
                    }
                    else if (sameDirectionExpanded && absPercent - Math.abs(lastPercent) >= 2) {
                        percentAlert = true;
                    }
                }
                if (percentAlert) {
                    const sign = q.changePercent >= 0 ? '📈' : '📉';
                    messages.push(`${sign} ${rule.name} 异动 ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%，当前 ¥${q.price.toFixed(2)}`);
                    rule.lastAlertTime = now;
                    rule.lastAlertPercent = q.changePercent;
                    rule.lastAlertDirection = currentDirection;
                }
            }
            if (messages.length > 0) {
                this.persistAlertData();
                this.notify(messages.join(' ｜ '), q.code);
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