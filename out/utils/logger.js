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
exports.Logger = void 0;
exports.getLogger = getLogger;
exports.withErrorHandling = withErrorHandling;
exports.withSyncErrorHandling = withSyncErrorHandling;
const vscode = __importStar(require("vscode"));
/**
 * 统一日志管理器
 * 使用 VSCode Output Channel 记录错误和警告，便于追踪问题
 */
class Logger {
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('赛博大富翁');
    }
    /**
     * 获取 Logger 单例
     */
    static getInstance() {
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
    error(message, error, showToast = false) {
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
    warn(message, error) {
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
    info(message) {
        const timestamp = this.getTimestamp();
        this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
        console.log(`[赛博大富翁] ${message}`);
    }
    /**
     * 记录调试信息
     * @param message 调试描述
     */
    debug(message) {
        const timestamp = this.getTimestamp();
        this.outputChannel.appendLine(`[${timestamp}] [DEBUG] ${message}`);
    }
    /**
     * 显示输出面板
     */
    show() {
        this.outputChannel.show();
    }
    /**
     * 释放资源
     */
    dispose() {
        this.outputChannel.dispose();
    }
    getTimestamp() {
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
exports.Logger = Logger;
/**
 * 便捷方法：获取 Logger 实例
 */
function getLogger() {
    return Logger.getInstance();
}
/**
 * 包装异步函数，统一处理错误
 * @param fn 要执行的异步函数
 * @param errorMessage 错误时的描述
 * @param showToast 是否显示错误提示
 */
async function withErrorHandling(fn, errorMessage, showToast = false) {
    try {
        return await fn();
    }
    catch (e) {
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
function withSyncErrorHandling(fn, errorMessage, showToast = false) {
    try {
        return fn();
    }
    catch (e) {
        getLogger().error(errorMessage, e, showToast);
        return undefined;
    }
}
//# sourceMappingURL=logger.js.map