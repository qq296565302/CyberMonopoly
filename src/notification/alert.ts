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
}

function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const hhmm = now.getHours() * 100 + now.getMinutes();
  return (hhmm >= 915 && hhmm <= 1131) || (hhmm >= 1255 && hhmm <= 1501);
}

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private cooldownMs = 30 * 60 * 1000; // 30分钟冷却期
  private percentChangeThreshold = 2; // 涨跌幅变化超过2%才再次提醒
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.alertLastTime';
  private readonly STORAGE_PERCENT_KEY = 'cyberMonopoly.alertLastPercent';

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
      const existing = this.rules.get(stock.code);
      this.rules.set(stock.code, {
        code: stock.code,
        name: stock.name,
        alertPrice,
        alertPercent,
        lastAlertTime: existing?.lastAlertTime || savedTimes[stock.code] || 0,
        lastAlertPercent: existing?.lastAlertPercent ?? savedPercents[stock.code],
      });
    }
  }

  removeRule(code: string): void {
    this.rules.delete(code);
  }

  private persistAlertData(): void {
    const savedTimes: Record<string, number> = {};
    const savedPercents: Record<string, number> = {};
    for (const [code, rule] of this.rules) {
      if (rule.lastAlertTime > 0) {
        savedTimes[code] = rule.lastAlertTime;
      }
      if (rule.lastAlertPercent !== undefined) {
        savedPercents[code] = rule.lastAlertPercent;
      }
    }
    // fire-and-forget: VS Code globalState 会立即写入内存，磁盘刷写异步完成
    this.state.update(this.STORAGE_KEY, savedTimes).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存提醒时间失败:', e);
    });
    this.state.update(this.STORAGE_PERCENT_KEY, savedPercents).then(undefined, (e: unknown) => {
      console.error('[AlertManager] 保存提醒涨跌幅失败:', e);
    });
  }

  check(quotes: RealtimeQuote[]): void {
    if (!isTradingHours()) return;

    const now = Date.now();

    for (const q of quotes) {
      const rule = this.rules.get(q.code);
      if (!rule) continue;

      if (q.price <= 0 || q.prevClose <= 0) continue;

      // 冷却期检查
      if (now - rule.lastAlertTime < this.cooldownMs) continue;

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
        // 检查涨跌幅是否有显著变化（避免同一水平反复提醒）
        const lastPercent = rule.lastAlertPercent;
        const percentChanged = lastPercent === undefined ||
          Math.abs(Math.abs(q.changePercent) - Math.abs(lastPercent)) >= this.percentChangeThreshold;

        if (percentChanged) {
          shouldAlert = true;
          const sign = q.changePercent >= 0 ? '📈' : '📉';
          message = `${sign} ${rule.name} 异动 ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%，当前 ¥${q.price.toFixed(2)}`;
        }
      }

      if (shouldAlert) {
        rule.lastAlertTime = now;
        rule.lastAlertPercent = q.changePercent;
        this.persistAlertData();
        this.notify(message, q.code);
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
