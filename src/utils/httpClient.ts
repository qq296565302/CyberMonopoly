import * as vscode from 'vscode';
import { AppError, ErrorCode, withRetry, RetryOptions, DEFAULT_RETRY_OPTIONS } from './errors';
import { logger } from './logger';

export interface HttpRequestOptions {
    timeout?: number;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: string;
    retryOptions?: Partial<RetryOptions>;
}

/**
 * 封装 HTTP 请求，统一处理超时、错误和重试
 */
export class HttpClient {
    private static instance: HttpClient;
    private defaultTimeout = 10000; // 10 秒默认超时

    private constructor() {}

    public static getInstance(): HttpClient {
        if (!HttpClient.instance) {
            HttpClient.instance = new HttpClient();
        }
        return HttpClient.instance;
    }

    /**
     * GET 请求
     */
    async get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>(url, { ...options, method: 'GET' });
    }

    /**
     * POST 请求
     */
    async post<T>(url: string, body?: any, options?: HttpRequestOptions): Promise<T> {
        const headers = {
            'Content-Type': 'application/json',
            ...options?.headers
        };
        const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
        return this.request<T>(url, { ...options, method: 'POST', headers, body: bodyStr });
    }

    /**
     * 通用请求方法
     */
    async request<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
        const {
            timeout = this.defaultTimeout,
            headers = {},
            method = 'GET',
            body,
            retryOptions
        } = options;

        try {
            return await withRetry(
                async () => {
                    // 每次重试创建新的 AbortController，避免信号已失效
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);

                    try {
                        const response = await fetch(url, {
                            method,
                            headers,
                            body: method !== 'GET' ? body : undefined,
                            signal: controller.signal
                        });

                        if (!response.ok) {
                            const errorBody = await response.text().catch(() => '');
                            throw AppError.http(response.status, url, errorBody);
                        }

                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            const data = await response.json();
                            // 检查数据有效性
                            if (data === null || data === undefined) {
                                throw AppError.parse(url, '返回数据为空');
                            }
                            return data as T;
                        } else {
                            const text = await response.text();
                            // 尝试解析为 JSON，失败则返回原始文本
                            try {
                                return JSON.parse(text) as T;
                            } catch {
                                return text as unknown as T;
                            }
                        }
                    } finally {
                        clearTimeout(timeoutId);
                    }
                },
                retryOptions,
                (error, attempt) => {
                    logger.warn(`请求重试 #${attempt}: ${url} - ${error.message}`, error);
                }
            );
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            // 处理 AbortError (超时)
            if (error instanceof Error && error.name === 'AbortError') {
                throw AppError.timeout(url, timeout);
            }

            // 处理网络错误
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new AppError(
                    ErrorCode.NETWORK_ERROR,
                    `网络请求失败：${url}`,
                    { cause: error as Error, retryable: true }
                );
            }

            // 未知错误
            throw new AppError(
                ErrorCode.UNKNOWN,
                `未知错误：${error instanceof Error ? error.message : String(error)}`,
                { cause: error as Error }
            );
        }
    }

    /**
     * 批量请求（带并发控制）
     */
    async batchRequest<T>(
        urls: string[],
        options?: HttpRequestOptions,
        concurrencyLimit: number = 5
    ): Promise<(T | Error)[]> {
        const results: (T | Error)[] = new Array(urls.length);
        const queue = [...urls.map((url, index) => ({ url, index }))];
        const inProgress = new Set<number>();

        return new Promise((resolve) => {
            const processNext = async () => {
                if (queue.length === 0 && inProgress.size === 0) {
                    resolve(results);
                    return;
                }

                while (inProgress.size < concurrencyLimit && queue.length > 0) {
                    const { url, index } = queue.shift()!;
                    inProgress.add(index);

                    this.request<T>(url, options)
                        .then(data => {
                            results[index] = data;
                        })
                        .catch(error => {
                            results[index] = error;
                            logger.error(`批量请求失败：${url}`, error);
                        })
                        .finally(() => {
                            inProgress.delete(index);
                            processNext();
                        });
                }
            };

            processNext();
        });
    }
}

export const httpClient = HttpClient.getInstance();
