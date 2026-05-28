import * as https from 'https';
import * as http from 'http';
import { logger } from './logger';

// ============================================================
// 交易时间判断（控制缓存 TTL）
// ============================================================

export function isATradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const timeMinutes = now.getHours() * 60 + now.getMinutes();
  return (timeMinutes >= 9 * 60 + 15 && timeMinutes <= 11 * 60 + 30) ||
    (timeMinutes >= 13 * 60 && timeMinutes <= 15 * 60);
}

export function isHKTradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const timeMinutes = now.getHours() * 60 + now.getMinutes();
  return (timeMinutes >= 9 * 60 + 30 && timeMinutes <= 12 * 60) ||
    (timeMinutes >= 13 * 60 && timeMinutes <= 16 * 60);
}

// ============================================================
// LRU 缓存
// ============================================================

interface CacheEntry {
  data: Buffer;
  time: number;
}

class LruCache {
  private map = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  get(key: string, ttl: number): CacheEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.time >= ttl) {
      this.map.delete(key);
      return undefined;
    }
    // 刷新 LRU 顺序
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, data: Buffer): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { data, time: Date.now() });
    // 淘汰最旧的条目
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value!;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

// ============================================================
// HTTP 客户端配置
// ============================================================

export interface HttpFetchOptions {
  /** 请求超时（毫秒），默认 15000 */
  timeoutMs?: number;
  /** 最大重试次数，默认 2 */
  retries?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 强制使用 HTTP（默认 HTTPS） */
  useHttp?: boolean;
}

// ============================================================
// 统一 HTTP 客户端
// ============================================================

export class HttpClient {
  private cache = new LruCache(200);
  private tradingCacheTtl = 15_000;     // 交易时段 15 秒
  private nonTradingCacheTtl = 300_000; // 非交易时段 5 分钟

  private getCacheTtl(): number {
    return (isATradingTime() || isHKTradingTime()) ? this.tradingCacheTtl : this.nonTradingCacheTtl;
  }

  /**
   * GET 请求，返回 Buffer
   */
  async fetchBuffer(url: string, options: HttpFetchOptions = {}): Promise<Buffer> {
    const ttl = this.getCacheTtl();
    const cached = this.cache.get(url, ttl);
    if (cached) return cached.data;

    const data = await this.doFetch(url, options);
    this.cache.set(url, data);
    return data;
  }

  /**
   * GET 请求，返回 UTF-8 字符串
   */
  async fetchText(url: string, options: HttpFetchOptions = {}): Promise<string> {
    const buf = await this.fetchBuffer(url, options);
    return buf.toString('utf-8');
  }

  /**
   * GET 请求，返回 GBK 解码的字符串
   */
  async fetchGbk(url: string, options: HttpFetchOptions = {}): Promise<string> {
    const buf = await this.fetchBuffer(url, options);
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf-8');
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 带重试的实际请求逻辑
   */
  private async doFetch(url: string, options: HttpFetchOptions): Promise<Buffer> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const retries = options.retries ?? 2;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.fetchOnce(url, timeoutMs, options);
      } catch (err: any) {
        lastError = err;
        const isRetryable = this.isRetryableError(err);

        if (isRetryable && attempt < retries) {
          logger.debug(`[HttpClient] retry ${attempt + 1}/${retries}: ${url} - ${err.message}`);
          await this.sleep(300 * (attempt + 1));
          continue;
        }

        throw err;
      }
    }

    throw lastError ?? new Error('HttpClient: unknown error');
  }

  /**
   * 单次 HTTP GET 请求
   */
  private fetchOnce(url: string, timeoutMs: number, options: HttpFetchOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let req: http.ClientRequest | null = null;

      // 总超时 = 请求超时 + 5 秒余量
      const totalTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          req?.destroy();
          reject(new Error(`请求超时 (${timeoutMs}ms)`));
        }
      }, timeoutMs + 5000);

      const done = (err: Error | null, data?: Buffer) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        if (err) reject(err);
        else resolve(data!);
      };

      const defaultHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };

      const reqOptions: https.RequestOptions = {
        headers: { ...defaultHeaders, ...options.headers },
        timeout: timeoutMs,
      };

      const lib = options.useHttp ? http : https;

      req = lib.get(url, reqOptions, (res) => {
        // 处理重定向：drain 响应流，释放连接
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const redirectUrl = res.headers.location;
          this.fetchOnce(redirectUrl, timeoutMs, options).then(
            (data) => done(null, data),
            (err) => done(err)
          );
          return;
        }

        // 处理非 2xx 响应：读取错误信息后关闭
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8').substring(0, 200);
            done(new Error(`HTTP ${res.statusCode}: ${body}`));
          });
          res.on('error', (err: Error) => done(err));
          return;
        }

        // 正常响应
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
        res.on('error', (err: Error) => done(err));
      });

      req.on('error', (err: Error) => done(err));

      req.on('timeout', () => {
        if (!settled) {
          settled = true;
          clearTimeout(totalTimer);
          req?.destroy();
          reject(new Error(`请求超时 (${timeoutMs}ms)`));
        }
      });
    });
  }

  private isRetryableError(err: any): boolean {
    const msg = err?.message || '';
    return msg.includes('socket hang up') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('Z_DATA_ERROR') ||
      msg.includes('unexpected end of file') ||
      msg.includes('请求超时');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

/** 默认共享实例 */
export const httpClient = new HttpClient();
