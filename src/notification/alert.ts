import * as vscode from 'vscode';
import { RealtimeQuote } from '../api/sina';
import { WatchStock } from '../models/stock';

interface AlertRule {
  code: string;
  name: string;
  alertPrice?: number;
  alertPercent?: number;
  lastAlertTime: number;
  lastAlertPercent?: number;
  lastAlertDirection?: 'up' | 'down';
  lastPriceAlertTime: number;
  priceAlertTriggered: boolean;
}

// 分级冷却配置
interface CoolingConfig {
  minPercent: number;
  maxPercent: number;
  cooldownMs: number;
}

const COOLING_LEVELS: CoolingConfig[] = [
  { minPercent: 8, maxPercent: Infinity, cooldownMs: 3 * 60 * 1000 },   // 8%+: 3分钟
  { minPercent: 5, maxPercent: 8, cooldownMs: 10 * 60 * 1000 },         // 5-8%: 10分钟
  { minPercent: 3, maxPercent: 5, cooldownMs: 30 * 60 * 1000 },         // 3-5%: 30分钟
];

const PRICE_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

// 关键节点（整数关口）
const KEY_THRESHOLDS = [3, 5, 8, 10];

function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const hhmm = now.getHours() * 100 + now.getMinutes();
  return (hhmm >= 915 && hhmm <= 1131) || (hhmm >= 1255 && hhmm <= 1501);
}

// 获取涨跌幅所在的区间（用于去重）
function getPercentBucket(percent: number): number {
  const absPercent = Math.abs(percent);
  if (absPercent >= 10) return 10;
  if (absPercent >= 8) return 8;
  if (absPercent >= 5) return 5;
  if (absPercent >= 3) return 3;
  return Math.floor(absPercent);
}

// 获取冷却时间
function getCoolingTime(absPercent: number): number {
  for (const level of COOLING_LEVELS) {
    if (absPercent >= level.minPercent && absPercent < level.maxPercent) {
      return level.cooldownMs;
    }
  }
  return COOLING_LEVELS[COOLING_LEVELS.length - 1].cooldownMs;
}

// 检查是否触及关键节点
function isKeyThreshold(current: number, previous?: number): boolean {
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

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.alertLastTime';
  private readonly STORAGE_PERCENT_KEY = 'cyberMonopoly.alertLastPercent';
  private readonly STORAGE_DIRECTION_KEY = 'cyberMonopoly.alertLastDirection';
  private readonly STORAGE_PRICE_ALERT_TIME_KEY = 'cyberMonopoly.alertLastPriceTime';
  private readonly STORAGE_PRICE_TRIGGERED_KEY = 'cyberMonopoly.alertPriceTriggered';

  constructor(state: vscode.Memento) {
    this.state = state;
  }

  addRule(stock: WatchStock): void {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const defaultPercent = config.get<number>('defaultAlertPercent', 5);
    const alertPrice = stock.alertPrice;
    const alertPercent = stock.alertPercent || defaultPercent;

    if (alertPrice || alertPercent) {
      const savedTimes = this.state.get<Record<string, number>>(this.STORAGE_KEY, {});
      const savedPercents = this.state.get<Record<string, number>>(this.STORAGE_PERCENT_KEY, {});
      const savedDirections = this.state.get<Record<string, string>>(this.STORAGE_DIRECTION_KEY, {});
      const savedPriceTimes = this.state.get<Record<string, number>>(this.STORAGE_PRICE_ALERT_TIME_KEY, {});
      const savedPriceTriggered = this.state.get<Record<string, boolean>>(this.STORAGE_PRICE_TRIGGERED_KEY, {});
      const existing = this.rules.get(stock.code);

      this.rules.set(stock.code, {
        code: stock.code,
        name: stock.name,
        alertPrice,
        alertPercent,
        lastAlertTime: existing?.lastAlertTime || savedTimes[stock.code] || 0,
        lastAlertPercent: existing?.lastAlertPercent ?? savedPercents[stock.code],
        lastAlertDirection: existing?.lastAlertDirection || (savedDirections[stock.code] as 'up' | 'down'),
        lastPriceAlertTime: existing?.lastPriceAlertTime || savedPriceTimes[stock.code] || 0,
        priceAlertTriggered: existing?.priceAlertTriggered ?? savedPriceTriggered[stock.code] ?? false,
      });
    }
  }

  removeRule(code: string): void {
    this.rules.delete(code);
  }

  private persistAlertData(): void {
    const savedTimes: Record<string, number> = {};
    const savedPercents: Record<string, number> = {};
    const savedDirections: Record<string, string> = {};
    const savedPriceTimes: Record<string, number> = {};
    const savedPriceTriggered: Record<string, boolean> = {};

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

    this.state.update(this.STORAGE_KEY, savedTimes).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存提醒时间失败:', e);
    });
    this.state.update(this.STORAGE_PERCENT_KEY, savedPercents).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存提醒涨跌幅失败:', e);
    });
    this.state.update(this.STORAGE_DIRECTION_KEY, savedDirections).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存提醒方向失败:', e);
    });
    this.state.update(this.STORAGE_PRICE_ALERT_TIME_KEY, savedPriceTimes).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存目标价提醒时间失败:', e);
    });
    this.state.update(this.STORAGE_PRICE_TRIGGERED_KEY, savedPriceTriggered).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存目标价触发状态失败:', e);
    });
  }

  check(quotes: RealtimeQuote[]): void {
    if (!isTradingHours()) return;

    const now = Date.now();

    for (const q of quotes) {
      const rule = this.rules.get(q.code);
      if (!rule) continue;

      if (q.price <= 0 || q.prevClose <= 0) continue;

      const absPercent = Math.abs(q.changePercent);
      const currentDirection: 'up' | 'down' = q.changePercent >= 0 ? 'up' : 'down';
      const messages: string[] = [];

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
        } else {
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
        } else if (!isInCooling) {
          if (directionChanged) {
            percentAlert = true;
          } else if (bucketChanged && sameDirectionExpanded) {
            percentAlert = true;
          } else if (sameDirectionExpanded && absPercent - Math.abs(lastPercent) >= 2) {
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

  private notify(message: string, code: string): void {
    vscode.window.showInformationMessage(message, '查看K线', '忽略').then(action => {
      if (action === '查看K线') {
        vscode.commands.executeCommand('cyberMonopoly.openChart', code);
      }
    });
  }
}
