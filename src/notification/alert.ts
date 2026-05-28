import * as vscode from 'vscode';
import { RealtimeQuote } from '../api/sina';
import { WatchStock } from '../models/stock';
import { logger } from '../utils/logger';

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

// 统一存储结构
interface AlertState {
  times: Record<string, number>;
  percents: Record<string, number>;
  directions: Record<string, string>;
  priceTimes: Record<string, number>;
  priceTriggered: Record<string, boolean>;
}

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
    if (absCurrent >= threshold && absPrevious < threshold) {
      return true;
    }
  }
  return false;
}

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.alertState';

  // 旧存储 key（用于迁移）
  private readonly OLD_KEYS = [
    'cyberMonopoly.alertLastTime',
    'cyberMonopoly.alertLastPercent',
    'cyberMonopoly.alertLastDirection',
    'cyberMonopoly.alertLastPriceTime',
    'cyberMonopoly.alertPriceTriggered',
  ];

  // 增量同步：上次同步的股票快照
  private lastSyncedStocks: Map<string, { alertPrice?: number; alertPercent?: number }> = new Map();

  // debounce 状态
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(state: vscode.Memento) {
    this.state = state;
    this.migrateOldKeys();
  }

  /**
   * 旧数据迁移：将 5 个独立 key 合并到单一 key 中
   */
  private migrateOldKeys(): void {
    const existing = this.state.get<AlertState>(this.STORAGE_KEY);
    if (existing) return; // 已有新格式，无需迁移

    const oldTimes = this.state.get<Record<string, number>>('cyberMonopoly.alertLastTime', {});
    const oldPercents = this.state.get<Record<string, number>>('cyberMonopoly.alertLastPercent', {});
    const oldDirections = this.state.get<Record<string, string>>('cyberMonopoly.alertLastDirection', {});
    const oldPriceTimes = this.state.get<Record<string, number>>('cyberMonopoly.alertLastPriceTime', {});
    const oldPriceTriggered = this.state.get<Record<string, boolean>>('cyberMonopoly.alertPriceTriggered', {});

    // 如果旧数据全为空，无需迁移
    const hasOldData = Object.keys(oldTimes).length > 0 ||
      Object.keys(oldPercents).length > 0 ||
      Object.keys(oldDirections).length > 0 ||
      Object.keys(oldPriceTimes).length > 0 ||
      Object.keys(oldPriceTriggered).length > 0;

    if (!hasOldData) return;

    const merged: AlertState = {
      times: oldTimes,
      percents: oldPercents,
      directions: oldDirections,
      priceTimes: oldPriceTimes,
      priceTriggered: oldPriceTriggered,
    };

    this.state.update(this.STORAGE_KEY, merged).then(undefined, (e: unknown) => {
      logger.error('[AlertManager] 迁移旧数据失败', e);
    });

    // 清除旧 key
    for (const key of this.OLD_KEYS) {
      this.state.update(key, undefined);
    }

    logger.info('[AlertManager] 旧数据已迁移到统一存储');
  }

  /**
   * 增量同步：仅对变更的股票更新规则
   */
  syncRules(stocks: WatchStock[]): void {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const defaultPercent = config.get<number>('defaultAlertPercent', 5);

    const currentMap = new Map(stocks.map(s => [s.code, s]));

    // 检测删除
    for (const [code] of this.lastSyncedStocks) {
      if (!currentMap.has(code)) {
        this.rules.delete(code);
      }
    }

    // 检测新增和修改
    for (const stock of stocks) {
      const alertPrice = stock.alertPrice;
      const alertPercent = stock.alertPercent || defaultPercent;

      if (!alertPrice && !alertPercent) {
        // 无提醒配置，移除规则
        this.rules.delete(stock.code);
        this.lastSyncedStocks.delete(stock.code);
        continue;
      }

      const prev = this.lastSyncedStocks.get(stock.code);
      const priceChanged = prev?.alertPrice !== alertPrice;
      const percentChanged = prev?.alertPercent !== alertPercent;

      if (!prev || priceChanged || percentChanged) {
        this.addRule(stock);
        this.lastSyncedStocks.set(stock.code, { alertPrice, alertPercent });
      }
    }
  }

  addRule(stock: WatchStock): void {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const defaultPercent = config.get<number>('defaultAlertPercent', 5);
    const alertPrice = stock.alertPrice;
    const alertPercent = stock.alertPercent || defaultPercent;

    if (alertPrice || alertPercent) {
      const saved = this.loadState();
      const existing = this.rules.get(stock.code);

      this.rules.set(stock.code, {
        code: stock.code,
        name: stock.name,
        alertPrice,
        alertPercent,
        lastAlertTime: existing?.lastAlertTime || saved.times[stock.code] || 0,
        lastAlertPercent: existing?.lastAlertPercent ?? saved.percents[stock.code],
        lastAlertDirection: existing?.lastAlertDirection || (saved.directions[stock.code] as 'up' | 'down'),
        lastPriceAlertTime: existing?.lastPriceAlertTime || saved.priceTimes[stock.code] || 0,
        priceAlertTriggered: existing?.priceAlertTriggered ?? saved.priceTriggered[stock.code] ?? false,
      });
    }
  }

  removeRule(code: string): void {
    this.rules.delete(code);
    this.lastSyncedStocks.delete(code);
  }

  /**
   * 从统一存储加载状态（带缓存）
   */
  private _cachedState: AlertState | undefined;

  private loadState(): AlertState {
    if (this._cachedState) return this._cachedState;
    this._cachedState = this.state.get<AlertState>(this.STORAGE_KEY, {
      times: {}, percents: {}, directions: {}, priceTimes: {}, priceTriggered: {},
    });
    return this._cachedState;
  }

  /**
   * 持久化提醒状态（debounce：1 秒内多次调用合并为一次）
   */
  private persistAlertData(): void {
    this.dirty = true;
    if (this.persistTimer) return;

    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      if (!this.dirty) return;
      this.dirty = false;

      const state: AlertState = {
        times: {},
        percents: {},
        directions: {},
        priceTimes: {},
        priceTriggered: {},
      };

      for (const [code, rule] of this.rules) {
        if (rule.lastAlertTime > 0) {
          state.times[code] = rule.lastAlertTime;
        }
        if (rule.lastAlertPercent !== undefined) {
          state.percents[code] = rule.lastAlertPercent;
        }
        if (rule.lastAlertDirection) {
          state.directions[code] = rule.lastAlertDirection;
        }
        if (rule.lastPriceAlertTime > 0) {
          state.priceTimes[code] = rule.lastPriceAlertTime;
        }
        state.priceTriggered[code] = rule.priceAlertTriggered;
      }

      // 单次写入，替代原来的 5 次
      this._cachedState = state;
      this.state.update(this.STORAGE_KEY, state).then(undefined, (e: unknown) => {
        logger.error('[AlertManager] 保存提醒状态失败', e);
      });
    }, 1000);
  }

  check(quotes: RealtimeQuote[]): void {
    if (!isTradingHours()) return;

    const now = Date.now();
    let hasAlert = false;

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
        hasAlert = true;
        this.notify(messages.join(' ｜ '), q.code);
      }
    }

    // 所有 alert 处理完毕后统一持久化（debounce）
    if (hasAlert) {
      this.persistAlertData();
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
