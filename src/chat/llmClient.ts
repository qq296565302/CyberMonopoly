import { ToolDefinition, ToolCall } from './toolExecutor';

export interface LlmConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

/**
 * LLM 响应中的消息结构
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * chat 方法的返回结构（支持 tool_calls）
 */
export interface ChatResponse {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason?: string;
}

export class LlmClient {
  private config: LlmConfig;
  private currentAbort: AbortController | undefined;
  /** 标记是否为用户主动取消（区分超时） */
  private userCancelled = false;

  /** 请求超时时间（毫秒） */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  /** 最大重试次数 */
  private static readonly MAX_RETRIES = 1;
  /** 初始重试延迟（毫秒），采用指数退避 */
  private static readonly INITIAL_RETRY_DELAY_MS = 1_000;

  /** 本地地址白名单（允许使用 HTTP 协议访问） */
  private static readonly LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

  constructor(config: LlmConfig) {
    // 校验 API Endpoint 协议安全性，防止 API Key 通过 HTTP 明文传输
    LlmClient.validateEndpoint(config.apiEndpoint);
    this.config = config;
  }

  /**
   * 校验 API Endpoint 协议安全性
   * - 远程地址必须使用 HTTPS 协议（防止 API Key 明文传输）
   * - 本地地址（localhost、127.0.0.1、::1）豁免，允许 HTTP（用于本地 LLM 服务）
   *
   * @param endpoint API 地址
   * @throws Error 当远程地址使用 HTTP 协议时抛出安全错误
   */
  private static validateEndpoint(endpoint: string): void {
    if (!endpoint) {
      return;
    }

    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error(`无效的 API 地址: ${endpoint}`);
    }

    const isLocalhost = LlmClient.LOCAL_HOSTNAMES.has(url.hostname);

    if (!isLocalhost && url.protocol !== 'https:') {
      throw new Error(
        `安全错误: 远程 API 地址必须使用 HTTPS 协议，以保护 API Key 不被明文传输。\n` +
        `当前地址: ${endpoint}\n` +
        `请将协议改为 https://，或使用 localhost/127.0.0.1 地址访问本地 LLM 服务。`
      );
    }
  }

  /**
   * 动态更新 API Key（从 SecretStorage 加载后调用）
   */
  updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  /**
   * 动态更新完整配置（API Endpoint、API Key、Model）
   */
  updateConfig(apiEndpoint: string, apiKey: string, model: string): void {
    LlmClient.validateEndpoint(apiEndpoint);
    this.config.apiEndpoint = apiEndpoint;
    this.config.apiKey = apiKey;
    this.config.model = model;
  }

  /**
   * 脱敏处理：将可能包含 API Key 的文本中的 Key 替换为 ***
   */
  private sanitize(text: string): string {
    if (!this.config.apiKey || !text) { return text; }
    // 使用正则全局替换，兼容 ES2020 目标
    const escaped = this.config.apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), '***');
  }

  /**
   * 创建带有超时控制的 AbortController
   * 超时后会自动 abort，并返回清理函数
   */
  private createTimeoutAbort(): { controller: AbortController; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, LlmClient.REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
    };

    return { controller, cleanup };
  }

  /**
   * 判断错误是否可重试（网络错误、超时、5xx 服务器错误、429 频率限制）
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // AbortError 通常是超时
      if (error.name === 'AbortError') {
        return true;
      }
      // 网络错误：扩展匹配常见网络错误码
      const networkKeywords = ['fetch', 'network', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
      if (networkKeywords.some(kw => error.message.includes(kw))) {
        return true;
      }
      // HTTP 状态码判断
      const statusMatch = error.message.match(/\((\d{3})\)/);
      if (statusMatch) {
        const status = parseInt(statusMatch[1], 10);
        // 5xx 服务器错误 或 429 频率限制
        if (status >= 500 || status === 429) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 延迟指定毫秒
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 计算指数退避延迟时间
   * @param retryCount 当前重试次数（从 0 开始）
   */
  private getRetryDelay(retryCount: number): number {
    return LlmClient.INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
  }

  /**
   * 流式对话：逐步返回文本片段
   * 使用 OpenAI 兼容的 SSE 流式接口
   * 支持 Function Calling：当 LLM 返回 tool_calls 时，通过回调通知调用方
   * 内置超时控制（30秒）和自动重试机制（失败后重试1次，指数退避）
   */
  async *chatStream(
    messages: ([string, string] | LlmMessage)[],
    options?: {
      tools?: ToolDefinition[];
      onToolCalls?: (toolCalls: ToolCall[]) => void;
    }
  ): AsyncGenerator<string> {
    let lastError: unknown;
    // 每次调用开始时重置用户取消标志
    this.userCancelled = false;

    for (let attempt = 0; attempt <= LlmClient.MAX_RETRIES; attempt++) {
      // 如果是重试，先等待指数退避时间
      if (attempt > 0) {
        const retryDelay = this.getRetryDelay(attempt - 1);
        console.log(`[LLM] 流式请求失败，${retryDelay}ms 后进行第 ${attempt} 次重试...`);
        await this.delay(retryDelay);
      }

      // 创建带超时的 AbortController
      const { controller: timeoutController, cleanup: cleanupTimeout } = this.createTimeoutAbort();

      // 如果有之前的 abort controller，先取消
      if (this.currentAbort) {
        this.currentAbort.abort();
      }
      this.currentAbort = timeoutController;
      const signal = timeoutController.signal;

      try {
        if (!this.config.apiKey) {
          throw new Error('LLM API Key 未配置，请在设置中填写 API Key');
        }

        // 构建 messages（支持 tuple 和 LlmMessage 两种格式）
        const msgArray = messages.map(m => {
          if (Array.isArray(m)) {
            return { role: m[0], content: m[1] };
          }
          // LlmMessage 格式：保留所有字段（tool_calls, tool_call_id 等）
          const obj: Record<string, unknown> = { role: m.role, content: m.content };
          if (m.tool_calls) { obj.tool_calls = m.tool_calls; }
          if (m.tool_call_id) { obj.tool_call_id = m.tool_call_id; }
          return obj;
        });

        const body: Record<string, unknown> = {
          model: this.config.model,
          messages: msgArray,
          temperature: this.config.temperature,
          stream: true,
        };

        // 添加 tools 参数（不设置 tool_choice，让服务端使用默认值）
        if (options?.tools && options.tools.length > 0) {
          body.tools = options.tools;
        }

        const resp = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`LLM请求失败 (${resp.status}): ${this.sanitize(errText)}`);
        }

        const reader = resp.body?.getReader();
        if (!reader) {
          throw new Error('无法获取响应流');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // 流式 tool_calls 收集器
        // OpenAI SSE 格式中，tool_calls 通过多个 delta 片段拼接而成
        const toolCallsMap = new Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) { continue; }
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              // 流结束时，如果有收集到的 tool_calls，通知调用方
              if (toolCallsMap.size > 0 && options?.onToolCalls) {
                options.onToolCalls(Array.from(toolCallsMap.values()));
              }
              return;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices?: {
                  delta?: {
                    content?: string;
                    tool_calls?: {
                      index: number;
                      id?: string;
                      type?: 'function';
                      function?: { name?: string; arguments?: string };
                    }[];
                  };
                  finish_reason?: string;
                }[];
              };

              const choice = parsed.choices?.[0];
              if (!choice) { continue; }

              // 处理文本内容
              const content = choice.delta?.content;
              if (content) {
                yield content;
              }

              // 处理 tool_calls 片段
              const deltaToolCalls = choice.delta?.tool_calls;
              if (deltaToolCalls) {
                for (const tc of deltaToolCalls) {
                  const idx = tc.index;
                  if (!toolCallsMap.has(idx)) {
                    toolCallsMap.set(idx, {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: '', arguments: '' },
                    });
                  }
                  const existing = toolCallsMap.get(idx)!;
                  if (tc.id) { existing.id = tc.id; }
                  if (tc.type) { existing.type = tc.type; }
                  if (tc.function?.name) { existing.function.name += tc.function.name; }
                  if (tc.function?.arguments) { existing.function.arguments += tc.function.arguments; }
                }
              }
            } catch (parseError) {
              // 记录解析失败的行，便于排查问题
              console.warn('[LLM] 流式 JSON 解析失败，已跳过:', data, parseError);
            }
          }
        }

        // 流正常结束（没有 [DONE] 标记时的兜底）
        if (toolCallsMap.size > 0 && options?.onToolCalls) {
          options.onToolCalls(Array.from(toolCallsMap.values()));
        }

        // 成功完成，跳出重试循环
        return;
      } catch (error) {
        lastError = error;
        cleanupTimeout();

        // 用户主动取消：不重试，直接抛出
        if (this.userCancelled) {
          const cancelError = new Error('用户已取消请求');
          cancelError.name = 'UserCancelledError';
          throw cancelError;
        }

        // 检查是否是超时错误
        if (error instanceof Error && error.name === 'AbortError' && signal.aborted) {
          const timeoutError = new Error(`LLM 请求超时（${LlmClient.REQUEST_TIMEOUT_MS / 1000}秒）`);
          timeoutError.name = 'TimeoutError';
          lastError = timeoutError;
        }

        // 改进 fetch failed 错误信息
        if (error instanceof TypeError && error.message === 'fetch failed') {
          const detailedError = new Error(
            `网络连接失败，请检查：\n` +
            `1. API 地址是否正确：${this.config.apiEndpoint}\n` +
            `2. 网络是否可以访问该地址\n` +
            `3. 是否需要配置代理\n` +
            `原始错误：${error.message}`
          );
          lastError = detailedError;
        }

        // 判断是否可重试
        if (attempt < LlmClient.MAX_RETRIES && this.isRetryableError(lastError)) {
          console.warn(`[LLM] 流式请求失败（第 ${attempt + 1} 次），将自动重试:`,
            lastError instanceof Error ? lastError.message : lastError);
          continue;
        }

        // 不可重试或已达最大重试次数，抛出错误
        throw lastError;
      } finally {
        cleanupTimeout();
        this.currentAbort = undefined;
      }
    }

    // 理论上不会执行到这里，但为了类型安全
    throw lastError;
  }

  /**
   * 非流式对话
   * 支持 Function Calling：当传入 tools 时，返回 ChatResponse 包含 tool_calls
   * 内置超时控制（30秒）和自动重试机制（失败后重试1次，指数退避）
   *
   * @param messages  消息列表 [role, content][]
   * @param options   可选参数，包含 tools 定义
   * @returns         ChatResponse（包含 content 和可能的 tool_calls）
   */
  async chat(
    messages: [string, string][],
    options?: { tools?: ToolDefinition[] }
  ): Promise<ChatResponse> {
    let lastError: unknown;
    // 每次调用开始时重置用户取消标志
    this.userCancelled = false;

    for (let attempt = 0; attempt <= LlmClient.MAX_RETRIES; attempt++) {
      // 如果是重试，先等待指数退避时间
      if (attempt > 0) {
        const retryDelay = this.getRetryDelay(attempt - 1);
        console.log(`[LLM] 请求失败，${retryDelay}ms 后进行第 ${attempt} 次重试...`);
        await this.delay(retryDelay);
      }

      // 创建带超时的 AbortController
      const { controller: timeoutController, cleanup: cleanupTimeout } = this.createTimeoutAbort();

      // 如果有之前的 abort controller，先取消
      if (this.currentAbort) {
        this.currentAbort.abort();
      }
      this.currentAbort = timeoutController;
      const signal = timeoutController.signal;

      try {
        if (!this.config.apiKey) {
          throw new Error('LLM API Key 未配置，请在设置中填写 API Key');
        }

        const body: Record<string, unknown> = {
          model: this.config.model,
          messages: messages.map(([role, content]) => ({ role, content })),
          temperature: this.config.temperature,
        };

        // 添加 tools 参数（不设置 tool_choice，让服务端使用默认值）
        if (options?.tools && options.tools.length > 0) {
          body.tools = options.tools;
        }

        const resp = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          // 脱敏后再抛出错误，防止 API Key 泄露到日志/错误弹窗
          throw new Error(`LLM请求失败 (${resp.status}): ${this.sanitize(errText)}`);
        }

        const data = await resp.json() as {
          choices?: {
            message?: {
              content?: string;
              tool_calls?: ToolCall[];
            };
            finish_reason?: string;
          }[];
        };

        const choice = data.choices?.[0];
        const message = choice?.message;

        return {
          content: message?.content || '',
          tool_calls: message?.tool_calls,
          finish_reason: choice?.finish_reason,
        };
      } catch (error) {
        lastError = error;
        cleanupTimeout();

        // 用户主动取消：不重试，直接抛出
        if (this.userCancelled) {
          const cancelError = new Error('用户已取消请求');
          cancelError.name = 'UserCancelledError';
          throw cancelError;
        }

        // 检查是否是超时错误
        if (error instanceof Error && error.name === 'AbortError' && signal.aborted) {
          const timeoutError = new Error(`LLM 请求超时（${LlmClient.REQUEST_TIMEOUT_MS / 1000}秒）`);
          timeoutError.name = 'TimeoutError';
          lastError = timeoutError;
        }

        // 改进 fetch failed 错误信息
        if (error instanceof TypeError && error.message === 'fetch failed') {
          const detailedError = new Error(
            `网络连接失败，请检查：\n` +
            `1. API 地址是否正确：${this.config.apiEndpoint}\n` +
            `2. 网络是否可以访问该地址\n` +
            `3. 是否需要配置代理\n` +
            `原始错误：${error.message}`
          );
          lastError = detailedError;
        }

        // 判断是否可重试
        if (attempt < LlmClient.MAX_RETRIES && this.isRetryableError(lastError)) {
          console.warn(`[LLM] 请求失败（第 ${attempt + 1} 次），将自动重试:`,
            lastError instanceof Error ? lastError.message : lastError);
          continue;
        }

        // 不可重试或已达最大重试次数，抛出错误
        throw lastError;
      } finally {
        cleanupTimeout();
        this.currentAbort = undefined;
      }
    }

    // 理论上不会执行到这里，但为了类型安全
    throw lastError;
  }

  abort(): void {
    if (this.currentAbort) {
      // 标记为用户主动取消，避免被误判为超时并触发重试
      this.userCancelled = true;
      this.currentAbort.abort();
      this.currentAbort = undefined;
    }
  }
}
