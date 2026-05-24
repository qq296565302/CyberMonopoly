import { logger } from './logger';

/**
 * 请求调度器
 * 用于管理 API 请求的优先级、去重、合并和背压控制
 */

interface RequestTask<T> {
    id: string;
    priority: number; // 数字越小优先级越高
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    timestamp: number;
    retryCount: number;
}

export interface SchedulerOptions {
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
    dedupWindowMs: number; // 去重时间窗口
    backpressureThreshold: number; // 触发背压的队列阈值
}

const DEFAULT_OPTIONS: SchedulerOptions = {
    maxConcurrentRequests: 3,
    requestTimeoutMs: 10000,
    dedupWindowMs: 100,
    backpressureThreshold: 50
};

export class DataScheduler {
    private static instance: DataScheduler;
    
    private queue: RequestTask<any>[] = [];
    private activeRequests = new Map<string, Promise<any>>();
    private pendingDedup = new Map<string, RequestTask<any>>();
    private dedupTimers = new Map<string, NodeJS.Timeout>();
    
    private currentConcurrency = 0;
    private options: SchedulerOptions;
    private isBackpressured = false;

    private constructor(options?: Partial<SchedulerOptions>) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    public static getInstance(options?: Partial<SchedulerOptions>): DataScheduler {
        if (!DataScheduler.instance) {
            DataScheduler.instance = new DataScheduler(options);
        }
        return DataScheduler.instance;
    }

    /**
     * 提交请求任务
     * @param id 请求唯一标识（用于去重）
     * @param execute 执行函数
     * @param priority 优先级（默认 10，数字越小优先级越高）
     */
    public schedule<T>(
        id: string,
        execute: () => Promise<T>,
        priority: number = 10
    ): Promise<T> {
        // 检查背压状态
        if (this.isBackpressured) {
            logger.warn('[Scheduler] 调度器处于背压状态，请求可能被延迟');
        }

        return new Promise((resolve, reject) => {
            const task: RequestTask<T> = {
                id,
                priority,
                execute,
                resolve,
                reject,
                timestamp: Date.now(),
                retryCount: 0
            };

            // 去重处理：在时间窗口内的相同请求合并
            if (this.pendingDedup.has(id)) {
                const existingTask = this.pendingDedup.get(id)!;
                // 保留高优先级的任务
                if (priority < existingTask.priority) {
                    // 替换为更高优先级的任务
                    existingTask.resolve = resolve;
                    existingTask.reject = reject;
                    existingTask.priority = priority;
                } else {
                    // 合并到现有任务（共享 Promise）
                    existingTask.resolve = resolve;
                    existingTask.reject = reject;
                }
                logger.debug(`[Scheduler] 请求去重：${id}`);
                return;
            }

            // 设置去重定时器
            const timer = setTimeout(() => {
                this.pendingDedup.delete(id);
                this.dedupTimers.delete(id);
                
                // 将任务加入队列
                this.enqueue(task);
            }, this.options.dedupWindowMs);

            this.pendingDedup.set(id, task);
            this.dedupTimers.set(id, timer);
        });
    }

    /**
     * 立即执行请求（跳过队列和去重）
     */
    public async executeImmediate<T>(id: string, execute: () => Promise<T>): Promise<T> {
        const result = await this.executeWithTimeout(id, execute);
        
        // 清理可能存在的待处理任务
        if (this.pendingDedup.has(id)) {
            const timer = this.dedupTimers.get(id);
            if (timer) clearTimeout(timer);
            this.pendingDedup.delete(id);
            this.dedupTimers.delete(id);
        }
        
        return result;
    }

    private enqueue<T>(task: RequestTask<T>): void {
        // 按优先级插入队列
        let inserted = false;
        for (let i = 0; i < this.queue.length; i++) {
            if (task.priority < this.queue[i].priority) {
                this.queue.splice(i, 0, task);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.queue.push(task);
        }

        // 检查背压
        if (this.queue.length > this.options.backpressureThreshold && !this.isBackpressured) {
            this.isBackpressured = true;
            logger.warn(`[Scheduler] 触发背压控制，队列长度：${this.queue.length}`);
        }

        // 尝试处理队列
        this.processQueue();
    }

    private processQueue(): void {
        while (this.currentConcurrency < this.options.maxConcurrentRequests && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.executeTask(task);
        }

        // 恢复背压状态
        if (this.isBackpressured && this.queue.length < this.options.backpressureThreshold / 2) {
            this.isBackpressured = false;
            logger.info('[Scheduler] 背压状态解除');
        }
    }

    private async executeTask<T>(task: RequestTask<T>): Promise<void> {
        this.currentConcurrency++;
        const requestId = task.id;

        try {
            const promise = this.executeWithTimeout(task.id, task.execute);
            this.activeRequests.set(requestId, promise);

            const result = await promise;
            
            task.resolve(result);
        } catch (error) {
            // 可重试的错误且未达到最大重试次数
            const isRetryable = this.isRetryableError(error) && task.retryCount < 2;
            
            if (isRetryable) {
                task.retryCount++;
                logger.warn(`[Scheduler] 请求重试 #${task.retryCount}: ${task.id}`, error);
                
                // 延迟后重新入队
                setTimeout(() => {
                    this.enqueue(task);
                }, 1000 * task.retryCount);
            } else {
                task.reject(error);
            }
        } finally {
            this.activeRequests.delete(requestId);
            this.currentConcurrency--;
            
            // 继续处理队列
            this.processQueue();
        }
    }

    private async executeWithTimeout<T>(id: string, execute: () => Promise<T>): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`请求超时：${id} (${this.options.requestTimeoutMs}ms)`));
            }, this.options.requestTimeoutMs);
        });

        return Promise.race([execute(), timeoutPromise]);
    }

    private isRetryableError(error: any): boolean {
        // 网络相关错误可重试
        const message = error?.message || '';
        return message.includes('timeout') || 
               message.includes('network') || 
               message.includes('ETIMEDOUT') ||
               message.includes('ECONNRESET');
    }

    /**
     * 取消指定 ID 的请求
     */
    public cancel(id: string): void {
        // 从队列中移除
        const queueIndex = this.queue.findIndex(t => t.id === id);
        if (queueIndex !== -1) {
            const task = this.queue.splice(queueIndex, 1)[0];
            task.reject(new Error('请求已取消'));
        }

        // 清除待去重任务
        if (this.pendingDedup.has(id)) {
            const timer = this.dedupTimers.get(id);
            if (timer) clearTimeout(timer);
            const task = this.pendingDedup.get(id)!;
            task.reject(new Error('请求已取消'));
            this.pendingDedup.delete(id);
            this.dedupTimers.delete(id);
        }
    }

    /**
     * 清空所有待处理请求
     */
    public clear(): void {
        // 取消队列中所有任务
        for (const task of this.queue) {
            task.reject(new Error('调度器已清空'));
        }
        this.queue = [];

        // 取消所有待去重任务
        for (const [id, task] of this.pendingDedup.entries()) {
            const timer = this.dedupTimers.get(id);
            if (timer) clearTimeout(timer);
            task.reject(new Error('调度器已清空'));
        }
        this.pendingDedup.clear();
        this.dedupTimers.clear();

        logger.info('[Scheduler] 调度器已清空');
    }

    /**
     * 获取当前状态
     */
    public getStatus(): {
        queueLength: number;
        activeCount: number;
        isBackpressured: boolean;
    } {
        return {
            queueLength: this.queue.length,
            activeCount: this.currentConcurrency,
            isBackpressured: this.isBackpressured
        };
    }
}

export const scheduler = DataScheduler.getInstance();
