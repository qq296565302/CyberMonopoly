/**
 * AI 工具函数统一接口定义
 */

import { ToolDefinition, ToolResult as BaseToolResult } from '../toolExecutor';

// 重新导出 ToolResult 以便子模块使用
export type ToolResult = BaseToolResult;

/**
 * 工具错误类型
 */
export interface ToolError {
    code: string;
    message: string;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
    cmdExecutor?: (command: string, ...args: any[]) => Thenable<any>;
}

/**
 * 工具函数接口
 */
export interface ITool {
    /**
     * 工具名称（用于 LLM function calling）
     */
    name: string;
    
    /**
     * 工具描述
     */
    description: string;
    
    /**
     * OpenAI 兼容的工具定义
     */
    definition: ToolDefinition;
    
    /**
     * 执行工具函数
     * @param args 工具参数
     * @param context 执行上下文
     */
    execute(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult>;
}

/**
 * 工具注册中心
 */
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

    /**
     * 注册工具
     */
    public register(tool: ITool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * 批量注册工具
     */
    public registerAll(tools: ITool[]): void {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    /**
     * 获取工具
     */
    public get(name: string): ITool | undefined {
        return this.tools.get(name);
    }

    /**
     * 获取所有工具定义
     */
    public getAllDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(tool => tool.definition);
    }

    /**
     * 执行工具
     */
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

    /**
     * 检查工具是否存在
     */
    public has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * 获取所有工具名称
     */
    public getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * 清空所有工具（用于测试）
     */
    public clear(): void {
        this.tools.clear();
    }
}

export const registry = ToolRegistry.getInstance();
