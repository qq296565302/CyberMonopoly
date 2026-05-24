import * as vscode from 'vscode';

/**
 * 统一日志管理器
 * 使用 VSCode Output Channel 记录错误和警告，便于追踪问题
 */
export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('赛博大富翁');
  }

  /**
   * 获取 Logger 单例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 记录错误信息
   * @param message 错误描述
   * @param error 错误对象
   * @param showToast 是否显示错误提示（默认 false，避免频繁弹窗）
   */
  error(message: string, error?: unknown, showToast: boolean = false): void {
    const timestamp = this.getTimestamp();
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';

    this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
    if (errorMsg) {
      this.outputChannel.appendLine(`  详情: ${errorMsg}`);
    }
    if (stack) {
      this.outputChannel.appendLine(`  堆栈: ${stack}`);
    }

    console.error(`[赛博大富翁] ${message}`, error || '');

    if (showToast) {
      vscode.window.showErrorMessage(`赛博大富翁: ${message}`);
    }
  }

  /**
   * 记录警告信息
   * @param message 警告描述
   * @param error 错误对象
   */
  warn(message: string, error?: unknown): void {
    const timestamp = this.getTimestamp();
    const errorMsg = error instanceof Error ? error.message : String(error);

    this.outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
    if (errorMsg) {
      this.outputChannel.appendLine(`  详情: ${errorMsg}`);
    }

    console.warn(`[赛博大富翁] ${message}`, error || '');
  }

  /**
   * 记录信息
   * @param message 信息描述
   */
  info(message: string): void {
    const timestamp = this.getTimestamp();
    this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
    console.log(`[赛博大富翁] ${message}`);
  }

  /**
   * 记录调试信息
   * @param message 调试描述
   */
  debug(message: string): void {
    const timestamp = this.getTimestamp();
    this.outputChannel.appendLine(`[${timestamp}] [DEBUG] ${message}`);
  }

  /**
   * 显示输出面板
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.outputChannel.dispose();
  }

  private getTimestamp(): string {
    return new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

/**
 * 便捷方法：获取 Logger 实例
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}

/**
 * 包装异步函数，统一处理错误
 * @param fn 要执行的异步函数
 * @param errorMessage 错误时的描述
 * @param showToast 是否显示错误提示
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  showToast: boolean = false
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    getLogger().error(errorMessage, e, showToast);
    return undefined;
  }
}

/**
 * 包装同步函数，统一处理错误
 * @param fn 要执行的同步函数
 * @param errorMessage 错误时的描述
 * @param showToast 是否显示错误提示
 */
export function withSyncErrorHandling<T>(
  fn: () => T,
  errorMessage: string,
  showToast: boolean = false
): T | undefined {
  try {
    return fn();
  } catch (e) {
    getLogger().error(errorMessage, e, showToast);
    return undefined;
  }
}

// 导出默认 logger 实例以便直接使用
export const logger = getLogger();
