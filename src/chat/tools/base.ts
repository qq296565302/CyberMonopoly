/**
 * AI 工具函数统一接口定义
 */

// ============================================================
// 共享类型（单一来源）
// ============================================================

/**
 * Tool 执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string | { code: string; message: string };
  info?: string;
}

/**
 * OpenAI 兼容的工具定义结构
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * LLM 返回的单个工具调用请求
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 工具执行结果（用于回传给 LLM）
 */
export interface ToolCallResult {
  tool_call_id: string;
  output: string;
}

// ============================================================
// 工具接口与注册中心
// ============================================================

export interface ToolError {
  code: string;
  message: string;
}

export interface ToolContext {
  cmdExecutor?: (command: string, ...args: any[]) => Thenable<any>;
}

export interface ITool {
  name: string;
  description: string;
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools = new Map<string, ITool>();

  private constructor() {}

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public register(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }

  public registerAll(tools: ITool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  public get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  public getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  public async execute(
    name: string,
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `未知工具：${name}` };
    }
    try {
      return await tool.execute(args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `工具 ${name} 执行异常：${message}` };
    }
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  public clear(): void {
    this.tools.clear();
  }
}

export const registry = ToolRegistry.getInstance();
