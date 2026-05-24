/**
 * 统一错误类型定义
 */

export enum ErrorCode {
    // 网络相关
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    NETWORK_ERROR = 'NETWORK_ERROR',
    HTTP_ERROR = 'HTTP_ERROR',
    
    // 数据解析
    PARSE_ERROR = 'PARSE_ERROR',
    INVALID_DATA = 'INVALID_DATA',
    
    // API 相关
    API_LIMIT_EXCEEDED = 'API_LIMIT_EXCEEDED',
    API_UNAUTHORIZED = 'API_UNAUTHORIZED',
    API_NOT_FOUND = 'API_NOT_FOUND',
    
    // 业务逻辑
    STOCK_NOT_FOUND = 'STOCK_NOT_FOUND',
    DATA_UNAVAILABLE = 'DATA_UNAVAILABLE',
    
    // 系统
    UNKNOWN = 'UNKNOWN'
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode?: number;
    public readonly context?: string;
    public readonly retryable: boolean;

    constructor(
        code: ErrorCode,
        message: string,
        options?: {
            statusCode?: number;
            context?: string;
            retryable?: boolean;
            cause?: Error;
        }
    ) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = options?.statusCode;
        this.context = options?.context;
        this.retryable = options?.retryable ?? false;
        
        if (options?.cause) {
            this.cause = options.cause;
        }

        Error.captureStackTrace(this, AppError);
    }

    /**
     * 创建网络超时错误
     */
    static timeout(url: string, timeoutMs: number): AppError {
        return new AppError(ErrorCode.NETWORK_TIMEOUT, `请求超时: ${url} (${timeoutMs}ms)`, {
            context: url,
            retryable: true
        });
    }

    /**
     * 创建 HTTP 错误
     */
    static http(status: number, url: string, body?: string): AppError {
        let message = `HTTP ${status}`;
        if (status === 404) message += ` - 资源未找到: ${url}`;
        else if (status === 401) message += ` - 未授权`;
        else if (status === 403) message += ` - 禁止访问`;
        else if (status === 429) message += ` - 请求过于频繁`;
        else if (status >= 500) message += ` - 服务器错误`;
        
        return new AppError(
            status === 404 ? ErrorCode.API_NOT_FOUND :
            status === 401 || status === 403 ? ErrorCode.API_UNAUTHORIZED :
            status === 429 ? ErrorCode.API_LIMIT_EXCEEDED : ErrorCode.HTTP_ERROR,
            message,
            { statusCode: status, context: url, retryable: status >= 500 || status === 429 }
        );
    }

    /**
     * 创建解析错误
     */
    static parse(source: string, detail: string): AppError {
        return new AppError(ErrorCode.PARSE_ERROR, `数据解析失败: ${source} - ${detail}`, {
            context: source,
            retryable: false
        });
    }

    /**
     * 创建股票未找到错误
     */
    static stockNotFound(code: string): AppError {
        return new AppError(ErrorCode.STOCK_NOT_FOUND, `未找到股票: ${code}`, {
            context: code,
            retryable: false
        });
    }
    /**
     * 创建网络错误
     */
    static network(message: string, context?: any, retryable = true): AppError {
        return new AppError(ErrorCode.NETWORK_ERROR, message, {
            context: context ? JSON.stringify(context) : undefined,
            retryable
        });
    }
}

/**
 * 错误恢复策略
 */
export interface RetryOptions {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableCodes?: ErrorCode[];
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableCodes: [ErrorCode.NETWORK_TIMEOUT, ErrorCode.NETWORK_ERROR, ErrorCode.HTTP_ERROR]
};

/**
 * 带重试的错误处理
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    onError?: (error: AppError, attempt: number) => void
): Promise<T> {
    const opt = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: AppError | null = null;
    let delay = opt.initialDelayMs;

    for (let attempt = 1; attempt <= opt.maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const appError = error instanceof AppError ? error : 
                new AppError(ErrorCode.UNKNOWN, error instanceof Error ? error.message : String(error), { cause: error as Error });
            
            lastError = appError;
            
            // 检查是否可重试
            const isRetryable = appError.retryable && 
                (!opt.retryableCodes || opt.retryableCodes.includes(appError.code));

            if (!isRetryable || attempt > opt.maxRetries) {
                throw appError;
            }

            // 通知错误回调
            onError?.(appError, attempt);

            // 指数退避等待
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * opt.backoffMultiplier, opt.maxDelayMs);
        }
    }

    throw lastError;
}

/**
 * 错误分级处理策略
 */
export enum ErrorSeverity {
    IGNORE = 'IGNORE',           // 忽略，静默处理
    LOG = 'LOG',                 // 仅记录日志
    NOTIFY_USER = 'NOTIFY_USER', // 通知用户
    CRITICAL = 'CRITICAL'        // 严重错误，需要立即处理
}

export function getErrorSeverity(error: AppError): ErrorSeverity {
    switch (error.code) {
        case ErrorCode.NETWORK_TIMEOUT:
        case ErrorCode.NETWORK_ERROR:
            return ErrorSeverity.LOG;
        
        case ErrorCode.API_LIMIT_EXCEEDED:
            return ErrorSeverity.NOTIFY_USER;
        
        case ErrorCode.API_UNAUTHORIZED:
        case ErrorCode.STOCK_NOT_FOUND:
            return ErrorSeverity.NOTIFY_USER;
        
        case ErrorCode.PARSE_ERROR:
        case ErrorCode.INVALID_DATA:
            return ErrorSeverity.LOG;
        
        default:
            return ErrorSeverity.LOG;
    }
}
