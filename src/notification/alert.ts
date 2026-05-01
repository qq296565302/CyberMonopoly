import * as vscode from 'vscode';
import { RealtimeQuote } from '../api/sina';
import { WatchStock } from '../models/stock';

interface AlertRule {
  code: string;
  name: string;
  alertPrice?: number;
  alertPercent?: number;
  lastAlertTime: number;
}

export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private cooldownMs = 5 * 60 * 1000;
  private state: vscode.Memento;
  private readonly STORAGE_KEY = 'cyberMonopoly.alertLastTime';

  constructor(state: vscode.Memento) {
    this.state = state;
  }

  addRule(stock: WatchStock): void {
    const config = vscode.workspace.getConfiguration('cyberMonopoly');
    const defaultPercent = config.get<number>('defaultAlertPercent', 5);
    const alertPrice = stock.alertPrice;
    const alertPercent = stock.alertPercent || defaultPercent;

    if (alertPrice || alertPercent) {
      const saved = this.state.get<Record<string, number>>(this.STORAGE_KEY, {});
      const existing = this.rules.get(stock.code);
      this.rules.set(stock.code, {
        code: stock.code,
        name: stock.name,
        alertPrice,
        alertPercent,
        lastAlertTime: existing?.lastAlertTime || saved[stock.code] || 0,
      });
    }
  }

  removeRule(code: string): void {
    this.rules.delete(code);
  }

  private persistAlertTimes(): void {
    const saved: Record<string, number> = {};
    for (const [code, rule] of this.rules) {
      if (rule.lastAlertTime > 0) {
        saved[code] = rule.lastAlertTime;
      }
    }
    this.state.update(this.STORAGE_KEY, saved);
  }

  check(quotes: RealtimeQuote[]): void {
    const now = Date.now();
    
    for (const q of quotes) {
      const rule = this.rules.get(q.code);
      if (!rule) continue;
      
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

  private notify(message: string, code: string): void {
    vscode.window.showInformationMessage(message, '查看K线', '忽略').then(action => {
      if (action === '查看K线') {
        vscode.commands.executeCommand('cyberMonopoly.openChart', code);
      }
    });
  }
}
